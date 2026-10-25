import { computeDamage } from './damage';
import { BOSSES, ENEMIES, getSkill, POKEMON, UPGRADES } from './data';
import { curves, EnemyDirector, SpawnRequest } from './director';
import { Rng } from './rng';
import { chooseSkill, SelectorContext } from './skillSelector';
import { SpatialGrid } from './spatialGrid';
import { calcStats, expToNext, Individual, Stats } from './stats';
import { AiState, nextAiState } from './aiState';
import type { WeatherKind } from './encounters';
import { skillsLearned, unlockedSkills } from './learnset';
import { effectiveness } from './typeChart';
import {
  BaseStats, BossDef, EnemyBehavior, PassiveDef, PokeType, Role, SkillDef, StatusApply, StatusKind, Team,
} from './types';
import { emptyMods, Mods, Offer, rollOffers, RunView } from './upgrades';
import { applyPermanent } from './permanentUpgrades';
import { isAquatic } from './encounters';
import { COMBO_COOLDOWN, ComboDef, findCombo, partySynergy, SynergyState } from './synergy';
import { updateWild, WildState } from './wildAI';
import { evolutionsOf, ITEM_DEFS, ItemDef } from './evolution';
import { BossPhaseManager, phaseConfigFor, PhaseSnapshot } from './bossPhases';
import { RayState, rayAirborne, rayCancel, rayquazaThink } from './bosses/rayquaza';

export const STEP = 1 / 60;
export const WORLD_W = 3200;
export const WORLD_H = 3200;
const ALLY_DETECT = 400;
const ALLY_LEASH = 700;
const MAX_ENEMIES_HARD = 300;
const MAX_GEMS = 450;
const PROJECTILE_POOL = 600;
const REVIVE_TIME = 15;
export const DEFAULT_RECRUIT_POOL = ['charmander', 'squirtle', 'bulbasaur'];

/** Tile/terrain collision supplied by map-based modes (adventure). */
export interface Terrain {
  blocksMove(x: number, y: number): boolean;
  blocksShot(x: number, y: number): boolean;
  /** Water surface (aquatic Pokémon swim here and only here) */
  isWater?(x: number, y: number): boolean;
}

export type AllyCommand = 'auto' | 'attack' | 'defend' | 'follow' | 'hold' | 'retreat';

export interface Status {
  kind: StatusKind;
  t: number;
  magnitude: number;
  source: Unit | null;
  tick: number;
  /** Seconds since applied (sleep wake-up grace, Toxic ramp) */
  age: number;
}

/** Major statuses: a Pokémon carries at most one at a time (main-series rule). */
export const MAJOR_STATUS: readonly StatusKind[] = ['burn', 'poison', 'badPoison', 'paralysis', 'sleep', 'freeze'];
/** Statuses that stop the unit from moving and acting. */
export const INCAPACITATING: readonly StatusKind[] = ['stun', 'sleep', 'freeze', 'flinch'];
/** Type immunities (Fire can't burn, Electric can't be paralysed, Ice can't freeze, Poison/Steel can't be poisoned). */
export const TYPE_STATUS_IMMUNITY: Partial<Record<StatusKind, readonly PokeType[]>> = {
  burn: ['fire'], paralysis: ['electric'], freeze: ['ice'], poison: ['poison', 'steel'], badPoison: ['poison', 'steel'],
};
/** Hard cap on any status duration (s) — nothing can last forever. */
export const MAX_STATUS_DURATION = 8;
export const FLINCH_IMMUNITY = 2;
export const FULL_PARA_CHANCE = 0.25;
export const CONFUSION_SELF_HIT = 0.33;
export const SLEEP_WAKE_GRACE = 0.6;

export interface SkillSlot {
  def: SkillDef;
  cd: number;
  /** Cooldown length of the last cast (for HUD display) */
  cdMax?: number;
  level: number;
  powerBonus: number;
}

export interface BossState {
  def: BossDef;
  phase: 1 | 2 | 3;
  /** Arena centre (bosses with a home arena, e.g. world bosses) */
  homeX: number;
  homeY: number;
  patternT: number;
  trail: { x: number; y: number }[];
  final: boolean;
  /** Legendary blink timer */
  blinkT?: number;
  /** Shared phase state machine (thresholds, cinematics, form change, weakened) */
  pm: BossPhaseManager;
  /** Current alternate form (Mega Rayquaza) — the renderer draws this species */
  form?: string;
  /** Rayquaza action script */
  ray?: RayState;
  /** Capture window open (legendary weakened) */
  weakened?: boolean;
  /** Last named skill wind-up (HUD cast warning): shown until at + windup */
  cast?: { name: string; at: number; windup: number };
}

export interface Unit {
  id: number;
  team: Team;
  kind: 'trainer' | 'pokemon' | 'enemy' | 'boss';
  defId: string;
  /** Profile avatar id for player trainers (online appearance); NPC trainers leave it unset. */
  avatar?: string;
  name: string;
  types: PokeType[];
  role: Role | null;
  behavior: EnemyBehavior | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  facing: number;
  level: number;
  base: BaseStats;
  stats: Stats;
  maxHp: number;
  hp: number;
  energy: number;
  maxEnergy: number;
  critRate: number;
  moveSpeed: number;
  attackRange: number;
  contactPower: number;
  skills: SkillSlot[];
  passive: PassiveDef | null;
  target: Unit | null;
  aiTimer: number;
  castSlot: number;
  castT: number;
  castTarget: Unit | null;
  castX: number;
  castY: number;
  dash: { dx: number; dy: number; remaining: number; speed: number; slot: SkillSlot; hit: Set<number> } | null;
  statuses: Status[];
  shield: number;
  shieldT: number;
  alive: boolean;
  fainted: boolean;
  reviveT: number;
  hitFlash: number;
  contactCd: number;
  iframes: number;
  elite: boolean;
  exp: number;
  slotIndex: number;
  /** Render hints */
  animCast: number;
  lastSkill: string;
  damageDealt: number;
  boss: BossState | null;
  /** Collection uid for adventure-mode party members */
  ownerUid: string | null;
  /** IVs + nature of an owned Pokémon (null = neutral rental: Survivor, wild, trainer) */
  ind: Individual | null;
  /** Shiny individual (visual distinction + persisted on capture) */
  shiny: boolean;
  /** Encounter rarity tier of a wild spawn (UI alerts) */
  rarity: string | null;
  /** Alpha Pokémon (bigger, stronger, better rewards) */
  alpha: boolean;
  /** Flinch can't chain: seconds left of flinch immunity */
  flinchImmuneT: number;
  /** Environment slow (ice / snow / blizzard), 0..1, set by the Adventure environment controller */
  envSlow: number;
  /** Swims: confined to water tiles (wild fish spawned in water) */
  aquatic: boolean;
  /** Explicit combat state (see AI_STATES); `aiStateT` = time spent in it */
  aiState: AiState;
  aiStateT: number;
  /** Wild Pokémon ecosystem state (adventure mode) */
  wild: WildState | null;
  /** Adventure: unit is engaged in combat so allies may target it (always true in Survivor) */
  hostile: boolean;
  /** Inside a Poké Ball during a capture attempt */
  captured: boolean;
  noCapture: boolean;
  /** Free-form owner tag: 'trainer:<id>', 'dungeon', ... */
  tag: string | null;
  lastX: number;
  lastY: number;
  sturdyCd: number;
  /** Held item id + its combat effect (adventure equipment) */
  heldId: string | null;
  held: ItemDef['effect'] | null;
  /** Held-item timers (s): Life Orb recoil / Rocky Helmet throttle / Choice idle, Sitrus Berry regrowth */
  heldCd: number;
  berryCd: number;
  /** Choice items: skill the holder is locked into until it has no target */
  choiceLock: string | null;
  /** While Mega Evolved: the species to revert to */
  megaFrom: string | null;
}

export interface Projectile {
  active: boolean;
  team: Team;
  owner: Unit | null;
  slot: SkillSlot | null;
  skill: SkillDef | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  pierce: number;
  hit: Set<number>;
}

export interface Zone {
  active: boolean;
  team: Team;
  owner: Unit;
  slot: SkillSlot;
  /** cone: origin x,y · `length` = range · `r` = half spread (radians) */
  shape: 'circle' | 'line' | 'cone';
  x: number;
  y: number;
  r: number;
  angle: number;
  length: number;
  delay: number;
  t: number;
  duration: number;
  tick: number;
  tickT: number;
  visualOnly: boolean;
  fired: boolean;
  /** Units standing inside any of these circles are unaffected (boss "shade" mechanics) */
  safe?: { x: number; y: number; r: number }[];
}

export interface Gem {
  active: boolean;
  x: number;
  y: number;
  value: number;
  pulled: boolean;
  kind: 'exp' | 'berry';
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
  kind: 'tree' | 'rock' | 'prop';
  /** Owner tag (e.g. chunk id) so map chunks can remove their obstacles on unload */
  tag?: string;
}

export type WorldEvent =
  | { t: 'dmg'; x: number; y: number; amount: number; crit: boolean; eff: number; victimTeam: Team }
  | { t: 'heal'; x: number; y: number; amount: number; team?: Team }
  | { t: 'vfx'; name: string; x: number; y: number; r?: number; angle?: number; len?: number; type?: PokeType }
  | { t: 'sfx'; name: string }
  | { t: 'death'; x: number; y: number; defId: string; elite: boolean; boss: boolean; id?: number; level?: number; wild?: boolean; tag?: string | null }
  | { t: 'faint'; id: number; name: string }
  | { t: 'revive'; id: number; name: string }
  | { t: 'levelup'; level: number }
  | { t: 'banner'; text: string; color: string }
  /** Status feedback: applied status, or a combat outcome (miss, full paralysis, self-hit, wake up, thaw, immune) */
  | { t: 'status'; x: number; y: number; kind: StatusKind | 'miss' | 'fullPara' | 'selfHit' | 'wake' | 'thaw' | 'immune'; team: Team }
  | { t: 'shake'; intensity: number; duration: number }
  /** Boss phase machine changed state (HUD: phase panel, cinematic, form change) */
  | { t: 'bossPhase'; id: number; phase: number; state: 'transition' | 'cinematic' | 'formChange' | 'ready' | 'active'; name: string; kind: string; banner: string; form?: string }
  /** A named boss skill winds up (HUD cast warning) */
  | { t: 'bossCast'; id: number; name: string; windup: number }
  /** Legendary boss beaten through every phase: capture window opens (it does not die) */
  | { t: 'bossWeakened'; id: number; defId: string; level: number; x: number; y: number; tag: string | null }
  | { t: 'bossWeakenedExpired'; id: number; defId: string }
  /** Survivor Elemental Combo went off */
  | { t: 'combo'; name: string; x: number; y: number; type: PokeType };

export type WorldState = 'playing' | 'levelup' | 'gameover' | 'victory' | 'duelOver';

/**
 * One player's side: trainer, party and orders. Survivor / Adventure have only `home`;
 * a PvP duel adds `rival`, whose units are team 'enemy' but run exactly the same party AI.
 */
export interface Side {
  trainer: Unit;
  allies: Unit[];
  command: AllyCommand;
  commandTarget: Unit | null;
  holdX: number;
  holdY: number;
  /** Movement input of that side's trainer (-1..1) */
  input: { x: number; y: number };
  run: boolean;
  /** Duel: party members waiting outside the field (recalled / not sent out yet) */
  bench: Unit[];
  /** Duel: seconds until the next switch is allowed; next automatic send-out */
  switchCd: number;
  autoSendT: number;
  /** Duel: Mega Evolution used (once per duel) */
  megaUsed: boolean;
}

export interface DuelState {
  /** Seconds; at the limit the side with more remaining HP (fraction of the party) wins */
  timeLimit: number;
  /** Pokémon on the field per side at once (the rest wait on the bench) */
  fieldMax: number;
  winner: 'home' | 'rival' | 'draw' | null;
}

export const DUEL_SWITCH_CD = 4;
const DUEL_AUTO_SEND = 1.2;

export interface WorldOptions {
  /** Survivor: starting Pokémon. Adventure: optional (party is added by the scene) */
  starter?: string;
  seed?: number;
  /** Generate forest obstacles (disabled in some tests for determinism of pathing) */
  obstacles?: boolean;
  mode?: 'survivor' | 'adventure';
  width?: number;
  height?: number;
  /** Species that level-up cards may recruit (Survivor) */
  recruitPool?: string[];
  terrain?: Terrain;
  reviveTime?: number;
  /** Adventure trainer level (drives trainer HP/defense) */
  trainerLevel?: number;
  /** Survivor: held item and IV/nature of the Collection entry picked as starter */
  starterHeld?: string | null;
  starterInd?: Individual | null;
  /** Survivor: permanent upgrade levels (menu shop) */
  upgrades?: Record<string, number>;
  /** PvP duel (Adventure rules, a second player side, no revive, win when the other party is down) */
  pvp?: { timeLimit?: number; fieldMax?: number };
}

export class World {
  readonly rng: Rng;
  readonly director: EnemyDirector;
  time = 0;
  state: WorldState = 'playing';
  /** The player's side; `trainer`, `allies`, `command`, `input`… are accessors into it */
  readonly home: Side;
  /** PvP: the opponent's side */
  rival: Side | null = null;
  /** Second player in PvE; shares enemies, but owns movement, orders and party. */
  companion: Side | null = null;
  duel: DuelState | null = null;
  enemies: Unit[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  gems: Gem[] = [];
  obstacles: Obstacle[] = [];
  events: WorldEvent[] = [];
  boss: Unit | null = null;
  bossesDefeated = 0;
  level = 1;
  exp = 0;
  expNext = expToNext(1);
  kills = 0;
  pendingLevelUps = 0;
  pendingBossRewards = 0;
  currentOffers: Offer[] = [];
  mods: Mods = emptyMods();
  /** Survivor: party type synergy (recomputed every second) */
  synergy: SynergyState = { byType: {}, all: 0, lines: [] };
  private synergyT = 0;
  /** Survivor: per-target Elemental Combo cooldown (world time) */
  private comboUntil = new Map<number, number>();
  /** Simulated steps executed (used for perf stats) */
  steps = 0;
  readonly mode: 'survivor' | 'adventure';
  readonly width: number;
  readonly height: number;
  recruitPool: string[];
  terrain: Terrain | null;
  /** Environment flags read by wild AI (adventure scenes update these from the world clock/weather) */
  env = { night: false, weather: 'clear' as WeatherKind };
  /** Weather-anomaly damage multipliers per move type (set by world events) */
  weatherMods: Partial<Record<PokeType, number>> = {};
  private reviveTime: number;
  private hazardUnit: Unit | null = null;
  /** Per-boss tuned skill slots (boss patterns override radius/power of real moves) */
  private bossSlots = new Map<string, Map<string, SkillSlot>>();
  private nextId = 1;
  private victoryT = -1;
  /** Enemies (targets of the home side outside duels) */
  private grid = new SpatialGrid<Unit>(72);
  private obstacleGrid = new SpatialGrid<Obstacle>(128);
  private scratch: Unit[] = [];
  private candBuf: Unit[] = [];
  private countBuf: Unit[] = [];
  /** Per-step cap on impact VFX events (big AoEs hit many units) */
  private impactBudget = 0;
  private scratchObs: Obstacle[] = [];

  get trainer(): Unit { return this.home.trainer; }
  set trainer(t: Unit) { this.home.trainer = t; }
  get allies(): Unit[] { return this.home.allies; }
  set allies(a: Unit[]) { this.home.allies = a; }
  get command(): AllyCommand { return this.home.command; }
  set command(c: AllyCommand) { this.home.command = c; }
  get commandTarget(): Unit | null { return this.home.commandTarget; }
  set commandTarget(u: Unit | null) { this.home.commandTarget = u; }
  get holdX(): number { return this.home.holdX; }
  set holdX(v: number) { this.home.holdX = v; }
  get holdY(): number { return this.home.holdY; }
  set holdY(v: number) { this.home.holdY = v; }
  get input(): { x: number; y: number } { return this.home.input; }
  set input(v: { x: number; y: number }) { this.home.input = v; }
  get run(): boolean { return this.home.run; }
  set run(v: boolean) { this.home.run = v; }

  constructor(opts: WorldOptions) {
    this.home = newSide(null as unknown as Unit);
    this.rng = new Rng(opts.seed ?? (Date.now() & 0xffffffff));
    this.director = new EnemyDirector(this.rng);
    this.mode = opts.pvp ? 'adventure' : opts.mode ?? 'survivor';
    // Survivor meta-progression: permanent upgrades bought in the menu (before any unit is built)
    if (this.mode === 'survivor') applyPermanent(this.mods, opts.upgrades);
    this.width = opts.width ?? WORLD_W;
    this.height = opts.height ?? WORLD_H;
    this.recruitPool = opts.recruitPool ?? DEFAULT_RECRUIT_POOL;
    this.terrain = opts.terrain ?? null;
    this.reviveTime = opts.pvp ? Infinity : opts.reviveTime ?? (this.mode === 'adventure' ? 25 : REVIVE_TIME);
    if (this.mode === 'adventure') this.level = opts.trainerLevel ?? 5;
    for (let i = 0; i < PROJECTILE_POOL; i++) {
      this.projectiles.push({
        active: false, team: 'ally', owner: null, slot: null, skill: null, x: 0, y: 0, vx: 0, vy: 0, r: 4, life: 0, pierce: 0, hit: new Set(),
      });
    }
    this.trainer = this.makeTrainer();
    if (opts.pvp) {
      this.duel = { timeLimit: opts.pvp.timeLimit ?? 180, fieldMax: opts.pvp.fieldMax ?? 6, winner: null };
      const r = this.makeTrainer('enemy');
      this.rival = newSide(r);
      this.trainer.x = this.width * 0.3; r.x = this.width * 0.7;
    }
    if (this.mode === 'survivor') {
      if (opts.obstacles !== false) this.generateForest();
      // the starter keeps its equipment and individual values from the shared Collection
      this.addPokemon(opts.starter ?? 'charmander', { held: opts.starterHeld ?? null, ind: opts.starterInd ?? null });
    } else if (opts.starter) this.addPokemon(opts.starter);
  }

  // ───────────────────────────── creation ─────────────────────────────

  private blankUnit(partial: Partial<Unit> & Pick<Unit, 'team' | 'kind' | 'defId' | 'name' | 'base' | 'level'>): Unit {
    const stats = calcStats(partial.base, partial.level);
    const u: Unit = {
      id: this.nextId++, types: [], role: null, behavior: null,
      x: 0, y: 0, vx: 0, vy: 0, radius: 14, facing: 1, stats, maxHp: stats.hp, hp: stats.hp,
      energy: 60, maxEnergy: 100, critRate: 0.05, moveSpeed: 100, attackRange: 50, contactPower: 0,
      skills: [], passive: null, target: null, aiTimer: 0, castSlot: -1, castT: 0, castTarget: null, castX: 0, castY: 0,
      dash: null, statuses: [], shield: 0, shieldT: 0, alive: true, fainted: false, reviveT: 0, hitFlash: 0,
      contactCd: 0, iframes: 0, elite: false, exp: 0, slotIndex: 0, animCast: 0, lastSkill: '', damageDealt: 0, boss: null,
      ownerUid: null, wild: null, hostile: true, captured: false, noCapture: false, tag: null, lastX: 0, lastY: 0, sturdyCd: 0,
      heldId: null, held: null, heldCd: 0, berryCd: 0, choiceLock: null, megaFrom: null, ind: null, flinchImmuneT: 0, envSlow: 0, aquatic: false, aiState: 'idle', aiStateT: 0, shiny: false, rarity: null, alpha: false,
      ...partial,
    };
    u.lastX = u.x; u.lastY = u.y;
    u.aiTimer = (u.id % 7) * 0.03; // stagger AI ticks so they never all run on one frame
    return u;
  }

  private makeTrainer(team: Team = 'ally'): Unit {
    const t = this.blankUnit({
      team, kind: 'trainer', defId: 'trainer', name: 'Trainer', level: 5,
      base: { hp: 50, atk: 10, def: 55, spa: 10, spd: 55, spe: 60 }, x: this.width / 2, y: this.height / 2, radius: 12, moveSpeed: 175,
    });
    this.refreshTrainerStats(t, 1);
    t.hp = t.maxHp;
    return t;
  }

  /** A render-only unit for network snapshots; never stepped by the guest. */
  visualUnit(data: Partial<Unit>): Unit {
    return this.blankUnit({ team: 'ally', kind: 'pokemon', defId: '', name: '', level: 1,
      base: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 }, ...data });
  }

  private refreshTrainerStats(t: Unit, frac = t.hp / t.maxHp): void {
    t.level = 4 + this.level;
    t.stats = calcStats(t.base, t.level);
    t.maxHp = Math.floor((90 + 5 * this.level) * (1 + this.mods.hpMult * 0.5));
    t.hp = Math.max(1, Math.round(t.maxHp * frac));
  }

  addPokemon(defId: string, opts: { level?: number; uid?: string; hpFrac?: number; held?: string | null; ind?: Individual | null; rival?: boolean; companion?: boolean; shiny?: boolean } = {}): Unit {
    const def = POKEMON.get(defId);
    if (!def) throw new Error('Unknown pokemon ' + defId);
    const side = opts.companion && this.companion ? this.companion : opts.rival && this.rival ? this.rival : this.home;
    const angle = side.allies.length * 1.1;
    const u = this.blankUnit({
      team: side === this.rival ? 'enemy' : 'ally', kind: 'pokemon', shiny: !!opts.shiny, defId, name: def.name, types: [...def.types], role: def.role,
      base: def.baseStats, level: opts.level ?? 4 + this.level, radius: def.radius, moveSpeed: def.moveSpeed, ownerUid: opts.uid ?? null,
      attackRange: def.attackRange, critRate: def.critRate, passive: def.passive,
      x: side.trainer.x + this.mirror(side) * Math.cos(angle) * 50, y: side.trainer.y + Math.sin(angle) * 50,
      skills: this.kit(defId, opts.level ?? 4 + this.level).map((id) => ({ def: getSkill(id), cd: 0, level: 1, powerBonus: 0 })),
      slotIndex: side.allies.length, ind: opts.ind ?? null,
    });
    this.setHeld(u, opts.held ?? null);
    this.refreshAllyStats(u, opts.hpFrac ?? 1);
    // duel: the same AI tick phase for the same party slot on both sides (the default staggers by unit id)
    if (this.rival) u.aiTimer = (u.slotIndex % 7) * 0.03;
    if (this.duel && side.allies.length >= this.duel.fieldMax) side.bench.push(u);
    else side.allies.push(u);
    return u;
  }

  // ───────────────────────────── duel: bench, switching, Mega ─────────────────────────────

  /** Whole party of a side (field + bench). */
  partyOf(side: Side): Unit[] {
    return side.bench.length ? [...side.allies, ...side.bench] : side.allies;
  }

  /** Duel switch: `out` (on the field, standing) goes to the bench, `inc` (bench) comes in. Shared cooldown per side. */
  duelSwitch(side: Side, out: Unit | null, inc: Unit | null): boolean {
    if (!this.duel || side.switchCd > 0) return false;
    if (out && (!side.allies.includes(out) || out.fainted)) return false;
    if (inc && (!side.bench.includes(inc) || inc.fainted)) return false;
    if (!out && !inc) return false;
    if (!out && side.allies.filter((a) => !a.fainted).length >= this.duel.fieldMax) return false;
    if (out) {
      side.allies = side.allies.filter((a) => a !== out);
      out.castSlot = -1; out.dash = null; out.target = null; out.vx = out.vy = 0;
      side.bench.push(out);
      this.emit({ t: 'vfx', name: 'poof', x: out.x, y: out.y });
      if (side.commandTarget === out) side.commandTarget = null;
      for (const s of this.sides()) for (const a of s.allies) if (a.target === out) a.target = null;
    }
    if (inc) this.sendOut(side, inc);
    side.switchCd = DUEL_SWITCH_CD;
    return true;
  }

  private sendOut(side: Side, u: Unit): void {
    side.bench = side.bench.filter((b) => b !== u);
    const tr = side.trainer;
    u.x = tr.x + this.mirror(side) * 40; u.y = tr.y + this.rng.range(-20, 20); u.lastX = u.x; u.lastY = u.y;
    u.slotIndex = side.allies.length;
    u.aiTimer = 0;
    side.allies.push(u);
    this.emit({ t: 'vfx', name: 'heal', x: u.x, y: u.y });
    this.emit({ t: 'banner', text: `${u.name} ra sân!`, color: side === this.home ? '#80d0ff' : '#ff9080' });
  }

  /** A side whose field is short of standing Pokémon sends the next bench member out (main-series rule). */
  private duelAutoSend(side: Side, dt: number): void {
    if (side.switchCd > 0) side.switchCd -= dt;
    const standing = side.allies.filter((a) => !a.fainted).length;
    const next = side.bench.find((b) => !b.fainted);
    if (!next || standing >= this.duel!.fieldMax) { side.autoSendT = DUEL_AUTO_SEND; return; }
    if ((side.autoSendT -= dt) > 0) return;
    side.autoSendT = DUEL_AUTO_SEND;
    // fainted members leave the field for good
    side.allies = side.allies.filter((a) => !a.fainted || a === next);
    side.allies.forEach((a, i) => (a.slotIndex = i));
    this.sendOut(side, next);
  }

  /** Duel Mega Evolution: once per side per duel, the holder of the right Mega Stone; lasts the whole duel. */
  duelMega(side: Side, u: Unit): boolean {
    if (!this.duel || side.megaUsed || !side.allies.includes(u) || u.fainted || u.megaFrom) return false;
    const stone = u.heldId ? ITEM_DEFS.get(u.heldId) : undefined;
    if (stone?.kind !== 'megaStone' || stone.megaFor !== u.defId || !stone.form || !POKEMON.has(stone.form)) return false;
    side.megaUsed = true;
    this.transformAlly(u, stone.form, { mega: true });
    this.emit({ t: 'banner', text: `${u.name} Mega Tiến Hóa!`, color: '#ff80e0' });
    return true;
  }

  /** The player side a unit belongs to (wild Pokémon, trainers' enemies and bosses: none). */
  sideOf(u: Unit): Side | null {
    if (this.companion && (u === this.companion.trainer || this.companion.allies.includes(u))) return this.companion;
    if (u.team === 'ally') return this.home;
    return this.rival && (u.kind === 'pokemon' || u.kind === 'trainer') ? this.rival : null;
  }

  /** New IVs / nature / EVs of a party member (EV training): stats recomputed, HP ratio kept. */
  setIndividual(u: Unit, ind: Individual | null): void {
    u.ind = ind;
    if (u.kind === 'pokemon') this.refreshAllyStats(u);
  }

  setHeld(u: Unit, itemId: string | null): void {
    const def = itemId ? ITEM_DEFS.get(itemId) : undefined;
    u.heldId = def ? def.id : null;
    u.held = def?.effect ?? null;
    u.choiceLock = null;
  }

  /** Held items that forbid a skill: Choice lock, Assault Vest (no status moves). */
  private heldBlocks(u: Unit, s: SkillDef): boolean {
    const h = u.held;
    if (!h) return false;
    if (h.type === 'choice') return u.choiceLock !== null && s.id !== u.choiceLock;
    if (h.type === 'assaultVest') return s.power <= 0;
    return false;
  }

  /**
   * Turns a party member into another species in place (evolution or Mega Evolution):
   * new stats, types, role, skills and passive; keeps level, HP ratio, energy and held item.
   */
  transformAlly(u: Unit, defId: string, opts: { mega?: boolean } = {}): void {
    const def = POKEMON.get(defId);
    if (!def) throw new Error('Unknown pokemon ' + defId);
    const frac = u.hp / u.maxHp;
    if (opts.mega) u.megaFrom = u.defId;
    else if (!def.mega) u.megaFrom = null;
    u.defId = defId; u.name = def.name; u.types = [...def.types]; u.role = def.role; u.base = def.baseStats;
    u.moveSpeed = def.moveSpeed; u.attackRange = def.attackRange; u.critRate = def.critRate; u.radius = def.radius; u.passive = def.passive;
    const oldLevels = u.skills.map((s) => s.level);
    u.skills = this.kit(defId, u.level).map((id, i) => ({ def: getSkill(id), cd: 0, level: oldLevels[i] ?? 1, powerBonus: 0 }));
    u.castSlot = -1; u.dash = null;
    if (u.kind === 'pokemon') this.refreshAllyStats(u, frac);
    else { u.stats = calcStats(u.base, u.level); u.hp = Math.max(1, Math.round(u.maxHp * frac)); }
    this.emit({ t: 'vfx', name: opts.mega ? 'mega' : 'evolve', x: u.x, y: u.y, r: 80 });
  }

  /** Reverts a Mega Evolved ally to its base form. */
  revertMega(u: Unit): void {
    if (!u.megaFrom) return;
    const base = u.megaFrom;
    u.megaFrom = null;
    this.transformAlly(u, base);
  }

  /** Removes a party member (adventure: party swap). */
  removePokemon(u: Unit): void {
    const side = this.sideOf(u) ?? this.home;
    side.allies = side.allies.filter((a) => a !== u);
    side.allies.forEach((a, i) => (a.slotIndex = i));
  }

  setAllyLevel(u: Unit, level: number): void {
    const before = u.level;
    u.level = level;
    this.refreshAllyStats(u);
    if (this.mode !== 'adventure') return;
    for (const id of skillsLearned(u.defId, before, level)) {
      if (u.skills.some((s) => s.def.id === id)) continue;
      u.skills.push({ def: getSkill(id), cd: 0, level: 1, powerBonus: 0 });
      this.emit({ t: 'banner', text: `${u.name} học được ${getSkill(id).name}!`, color: '#a0e8ff' });
    }
    // keep the kit in slot order
    const order = POKEMON.get(u.defId)?.skills ?? [];
    u.skills.sort((a, b) => order.indexOf(a.def.id) - order.indexOf(b.def.id));
  }

  /** Skill ids the unit fights with: Adventure unlocks by level (learnset), Survivor keeps the full rental kit. */
  private kit(defId: string, level: number): string[] {
    const all = POKEMON.get(defId)?.skills ?? [];
    if (this.mode !== 'adventure') return all;
    const k = unlockedSkills(defId, level);
    return k.length ? k : all.slice(0, 1);
  }

  /** Spawns a wild/trainer-owned Pokémon (adventure) that fights with its real 4-skill moveset. */
  spawnWild(speciesId: string, level: number, x: number, y: number, o: { wild?: WildState | null; hostile?: boolean; tag?: string; noCapture?: boolean; elite?: boolean; hpMult?: number } = {}): Unit {
    const def = POKEMON.get(speciesId);
    if (!def) throw new Error('Unknown pokemon ' + speciesId);
    const u = this.blankUnit({
      team: 'enemy', kind: 'enemy', defId: speciesId, name: def.name, types: [...def.types], role: def.role,
      behavior: def.role === 'marksman' || def.role === 'mage' ? 'ranged' : 'melee',
      base: def.baseStats, level, x, y, radius: def.radius * (o.elite ? 1.3 : 1), moveSpeed: def.moveSpeed * 0.62,
      attackRange: def.attackRange, critRate: def.critRate, passive: def.passive, contactPower: 30, elite: !!o.elite,
      skills: this.kit(speciesId, level).map((id) => ({ def: getSkill(id), cd: this.rng.range(0.4, 1.6), level: 1, powerBonus: 0 })),
      wild: o.wild ?? null, hostile: o.hostile ?? false, tag: o.tag ?? null, noCapture: !!o.noCapture,
    });
    u.maxHp = Math.floor(u.stats.hp * (o.hpMult ?? 2.5) * (o.elite ? 1.8 : 1));
    u.hp = u.maxHp;
    this.enemies.push(u);
    // a fish placed in water stays in the water (units of trainers / events placed on land walk as usual)
    u.aquatic = isAquatic(speciesId) && !!this.terrain?.isWater?.(x, y);
    return u;
  }

  /** Silently removes an enemy (despawn / successful capture). No death event, no EXP. */
  removeEnemy(u: Unit): void {
    u.alive = false;
    if (this.boss === u) this.boss = null;
  }

  /** Puts a unit "inside a Poké Ball": frozen, untargetable, invisible. */
  beginCapture(u: Unit): void {
    u.captured = true;
    u.castSlot = -1; u.dash = null; u.vx = 0; u.vy = 0;
    for (const a of this.allies) if (a.target === u) a.target = null;
  }

  endCapture(u: Unit, success: boolean): void {
    if (success) { this.removeEnemy(u); return; }
    u.captured = false;
    u.hostile = true;
  }

  setCommand(cmd: AllyCommand, target: Unit | null = null, side: Side = this.home): void {
    side.command = cmd;
    side.commandTarget = cmd === 'attack' ? target : null;
    if (cmd === 'attack' && target) target.hostile = true;
    if (cmd === 'hold') { side.holdX = side.trainer.x; side.holdY = side.trainer.y; }
    if (cmd === 'retreat' || cmd === 'follow') for (const a of side.allies) { a.target = null; a.castSlot = -1; }
    // orders are obeyed at once (next AI tick), not after the 0.18 s think interval
    for (const a of side.allies) a.aiTimer = 0;
  }

  /** Full heal (waypoint / Pokémon Center / blackout respawn). */
  healParty(): void {
    for (const a of this.friendlyUnits()) {
      a.fainted = false; a.hp = a.maxHp; a.statuses.length = 0; a.energy = a.maxEnergy;
    }
  }

  respawnTrainer(x: number, y: number): void {
    this.teleport(x, y);
    this.healParty();
    for (const a of this.allies) { a.castSlot = -1; a.dash = null; }
    for (const e of this.enemies) if (e.hostile && e.wild) { e.hostile = false; e.target = null; }
    this.state = 'playing';
  }

  teleport(x: number, y: number): void {
    this.trainer.x = x; this.trainer.y = y; this.trainer.lastX = x; this.trainer.lastY = y;
    for (const a of this.allies) { a.x = x + this.rng.range(-30, 30); a.y = y + this.rng.range(-30, 30); a.lastX = a.x; a.lastY = a.y; a.target = null; }
  }

  /** Environmental hazard (falling rocks, lava vents...) using the normal zone/telegraph pipeline. */
  addHazard(x: number, y: number, r: number, delay: number, power: number, type: PokeType, level: number, status?: StatusApply): void {
    if (!this.hazardUnit) {
      this.hazardUnit = this.blankUnit({ team: 'enemy', kind: 'enemy', defId: 'hazard', name: 'Hazard', base: { hp: 1, atk: 60, def: 60, spa: 60, spd: 60, spe: 1 }, level });
    }
    const h = this.hazardUnit;
    h.level = level; h.stats = calcStats(h.base, level);
    const def: SkillDef = {
      id: 'hazard_' + type, name: 'Hazard', type, category: 'physical', kind: 'aoe', power, cooldown: 1, energyCost: 0, castTime: 0,
      range: 0, radius: r, target: 'enemy', anim: 'cast', vfx: type === 'rock' ? 'rock' : type + '_hit', sfx: 'boom', status,
    };
    this.addZone(h, { def, cd: 0, level: 1, powerBonus: 0 }, 'circle', x, y, r, 0, 0, delay, 0, 0, false);
  }

  addObstacle(o: Obstacle): void {
    this.obstacles.push(o);
    this.obstacleGrid.insert(o);
  }

  /** Removes all obstacles with the given tag (chunk unload) and rebuilds the static grid. */
  removeObstacles(tag: string): void {
    const before = this.obstacles.length;
    this.obstacles = this.obstacles.filter((o) => o.tag !== tag);
    if (this.obstacles.length === before) return;
    this.obstacleGrid.clear();
    for (const o of this.obstacles) this.obstacleGrid.insert(o);
  }

  private refreshAllyStats(u: Unit, frac = u.hp / u.maxHp): void {
    u.stats = calcStats(u.base, u.level, u.ind);
    u.maxHp = Math.floor(u.stats.hp * 4 * (1 + this.mods.hpMult));
    u.hp = Math.max(u.fainted ? 0 : 1, Math.round(u.maxHp * frac));
  }

  private generateForest(): void {
    const cx = WORLD_W / 2, cy = WORLD_H / 2;
    let tries = 0;
    while (this.obstacles.length < 95 && tries++ < 3000) {
      const x = this.rng.range(80, WORLD_W - 80), y = this.rng.range(80, WORLD_H - 80);
      if (Math.hypot(x - cx, y - cy) < 260) continue;
      const r = this.rng.range(20, 30);
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 90)) continue;
      this.obstacles.push({ x, y, r, kind: 'tree' });
    }
    for (const o of this.obstacles) this.obstacleGrid.insert(o);
  }

  spawnEnemy(enemyId: string, level: number, elite: boolean, x: number, y: number): Unit | null {
    if (this.enemies.length >= MAX_ENEMIES_HARD) return null;
    const def = ENEMIES.get(enemyId);
    if (!def) throw new Error('Unknown enemy ' + enemyId);
    const speed = def.moveSpeed * curves.speedMult(this.time) * this.rng.range(0.92, 1.08);
    const u = this.blankUnit({
      team: 'enemy', kind: 'enemy', defId: enemyId, name: def.name, types: [...def.types], behavior: def.behavior,
      base: def.baseStats, level, x, y, radius: def.radius * (elite ? 1.4 : 1), moveSpeed: speed,
      contactPower: def.contactPower, elite, exp: def.exp,
      skills: def.skills.map((id) => ({ def: getSkill(id), cd: this.rng.range(0.5, 2), level: 1, powerBonus: 0 })),
      attackRange: def.behavior === 'ranged' ? 210 : 0, critRate: 0.03,
    });
    u.maxHp = Math.floor(u.stats.hp * (elite ? 4 : 1));
    u.hp = u.maxHp;
    this.enemies.push(u);
    return u;
  }

  spawnBoss(bossId: string, level: number, final: boolean, at?: { x: number; y: number }): Unit {
    const def = BOSSES.get(bossId)!;
    const p = at ?? this.edgePoint(520);
    this.bossSlots.delete(bossId);
    const u = this.blankUnit({
      team: 'enemy', kind: 'boss', defId: bossId, name: def.name, types: [...def.types], behavior: 'boss',
      base: def.baseStats, level, x: p.x, y: p.y, radius: def.radius, moveSpeed: def.moveSpeed,
      contactPower: def.contactPower, exp: def.exp, critRate: 0.03,
      skills: def.skills.map((id) => ({ def: getSkill(id), cd: 2 + this.rng.next() * 2, level: 1, powerBonus: 0 })),
      boss: { def, phase: 1, patternT: 2.5, trail: [], final, homeX: p.x, homeY: p.y,
        // legendaries of the Adventure end WEAKENED (capture window) instead of dying
        pm: new BossPhaseManager(phaseConfigFor(def, { capture: this.mode === 'adventure' && def.ai === 'legendary' && def.capture !== false })) },
    });
    u.maxHp = Math.floor(u.stats.hp * def.hpMult * (final ? 1.5 : 1));
    u.hp = u.maxHp;
    for (let i = 0; i < def.segments * 4; i++) u.boss!.trail.push({ x: p.x, y: p.y });
    this.enemies.push(u);
    this.boss = u;
    this.emit({ t: 'banner', text: final ? `BOSS CUỐI: ${def.name}!` : `BOSS: ${def.name} xuất hiện!`, color: '#ff5050' });
    this.emit({ t: 'sfx', name: 'boss' });
    this.emit({ t: 'shake', intensity: 0.012, duration: 600 });
    return u;
  }

  /** Restores a boss's phase from a save checkpoint (mid-cinematic saves resume ACTIVE in that phase). */
  restoreBossPhase(b: Unit, snap: PhaseSnapshot | null | undefined): void {
    const st = b.boss;
    if (!st || !snap) return;
    st.pm = BossPhaseManager.restore(st.pm.cfg, snap);
    st.phase = Math.min(3, st.pm.index + 1) as 1 | 2 | 3;
    st.weakened = st.pm.state === 'WEAKENED';
    const form = st.pm.cfg.phases.slice(0, st.pm.index + 1).reverse().find((p) => p.form)?.form;
    if (form) this.applyBossForm(b, form);
  }

  private edgePoint(dist = 700): { x: number; y: number } {
    for (let i = 0; i < 12; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = dist + this.rng.range(0, 140);
      const x = clamp(this.trainer.x + Math.cos(a) * d, 40, this.width - 40);
      const y = clamp(this.trainer.y + Math.sin(a) * d, 40, this.height - 40);
      if (!this.blocked(x, y, 20)) return { x, y };
    }
    return { x: clamp(this.trainer.x + dist, 40, this.width - 40), y: this.trainer.y };
  }

  blocked(x: number, y: number, r: number): boolean {
    this.scratchObs.length = 0;
    for (const o of this.obstacleGrid.query(x, y, r + 40, this.scratchObs)) if (Math.hypot(o.x - x, o.y - y) < o.r + r) return true;
    return !!this.terrain?.blocksMove(x, y);
  }

  private shotBlocked(x: number, y: number, r: number): boolean {
    this.scratchObs.length = 0;
    for (const o of this.obstacleGrid.query(x, y, r + 40, this.scratchObs)) if (o.kind !== 'prop' && Math.hypot(o.x - x, o.y - y) < o.r + r) return true;
    return !!this.terrain?.blocksShot(x, y);
  }

  emit(e: WorldEvent): void {
    if (this.events.length > 4000) this.events.splice(0, 1000);
    this.events.push(e);
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ───────────────────────────── main step ─────────────────────────────

  step(dt = STEP): void {
    this.impactBudget = 12;
    if (this.state !== 'playing') return;
    this.steps++;
    this.time += dt;

    if (this.mode === 'survivor') {
      const { spawns, events } = this.director.update(this.time, dt, this.enemies.length, !!this.boss);
      for (const ev of events) {
        if (ev.kind === 'boss') this.spawnBoss(ev.bossId, ev.level, ev.final);
        else this.emit({ t: 'banner', text: 'Bầy Rattata đang bao vây!', color: '#ffcc44' });
      }
      for (const s of spawns) this.placeSpawn(s);
    }
    for (const side of this.sides()) {
      const ct = side.commandTarget;
      if (ct && (!ct.alive || ct.captured || ct.fainted)) { side.command = 'auto'; side.commandTarget = null; }
    }

    this.grid.clear();
    for (const e of this.enemies) if (e.alive && !e.captured) this.grid.insert(e);
    for (const side of this.sides()) {
      side.trainer.lastX = side.trainer.x; side.trainer.lastY = side.trainer.y;
      for (const a of side.allies) { a.lastX = a.x; a.lastY = a.y; }
    }
    for (const e of this.enemies) { e.lastX = e.x; e.lastY = e.y; }

    if (this.rival) this.stepDuelSides(dt);
    else {
      for (const side of this.sides()) {
        this.updateTrainer(side, dt);
        for (const a of side.allies) this.updateAlly(a, side, dt);
      }
    }
    for (const e of this.enemies) if (e.alive) this.updateEnemy(e, dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    if (this.mode === 'survivor' && (this.synergyT -= dt) <= 0) {
      this.synergyT = 1;
      this.synergy = partySynergy(this.allies.map((a) => a.types));
      if (this.comboUntil.size > 400) for (const [id, t] of this.comboUntil) if (t < this.time) this.comboUntil.delete(id);
    }
    this.updateStatuses(dt);
    if (this.mode === 'survivor') this.updateGems(dt);
    this.cleanup();
    if (this.duel && this.checkDuel(dt)) return;

    if (this.trainer.hp <= 0 && (!this.companion || this.companion.trainer.hp <= 0)) {
      this.trainer.hp = 0;
      this.state = 'gameover';
      this.emit({ t: 'sfx', name: 'gameover' });
      return;
    }
    if (this.victoryT >= 0) {
      this.victoryT -= dt;
      if (this.victoryT < 0) {
        this.state = 'victory';
        return;
      }
    }
    if (this.pendingLevelUps > 0 || this.pendingBossRewards > 0) this.openLevelUp();
  }

  private movers: { u: Unit; side: Side; m: 'move' | 'dash' }[] = [];

  /**
   * Duel step: both sides act (cast / think) from the same start-of-step positions, then everyone moves.
   * The side that resolves first is drawn every step: casts end on fixed step counts, so a parity
   * alternation would keep favouring the same side for a given pair of teams.
   */
  private stepDuelSides(dt: number): void {
    const order = this.rng.chance(0.5) ? [this.rival!, this.home] : [this.home, this.rival!];
    const mv = this.movers;
    mv.length = 0;
    for (const side of order) for (const a of side.allies) {
      const m = this.allyAct(a, side, dt);
      if (m) mv.push({ u: a, side, m });
    }
    for (const side of order) this.updateTrainer(side, dt);
    for (const { u, side, m } of mv) {
      if (u.fainted) continue;
      if (m === 'dash') { if (u.dash) this.updateDash(u, dt); }
      else this.allyMove(u, side, dt);
    }
  }

  /** PvP: the rival side's formation is the mirror image of the home side's (left / right). */
  private mirror(side: Side): number {
    return side === this.rival ? -1 : 1;
  }

  /** Every player side (home first). */
  sides(): Side[] {
    return this.rival ? [this.home, this.rival] : this.companion ? [this.home, this.companion] : [this.home];
  }

  /** Attach a teammate without changing PvP targeting rules or the host's party. */
  addCompanion(): Side {
    if (this.rival) throw new Error('Co-op is unavailable during a duel');
    if (this.companion) return this.companion;
    const trainer = this.makeTrainer();
    trainer.x = trainer.lastX = this.trainer.x;
    trainer.y = trainer.lastY = this.trainer.y;
    trainer.reviveT = 3;
    return this.companion = newSide(trainer);
  }

  removeCompanion(): void {
    if (!this.companion) return;
    const removed = new Set([this.companion.trainer, ...this.companion.allies]);
    for (const u of removed) u.alive = false;
    for (const u of [...this.enemies, ...this.allies]) {
      if (u.target && removed.has(u.target)) u.target = null;
      if (u.castTarget && removed.has(u.castTarget)) u.castTarget = null;
      if (u.wild?.lastAttacker && removed.has(u.wild.lastAttacker)) u.wild.lastAttacker = null;
      if (u.wild?.threat && removed.has(u.wild.threat)) u.wild.threat = null;
    }
    this.projectiles = this.projectiles.filter(p => !p.owner || !removed.has(p.owner));
    this.zones = this.zones.filter(z => !removed.has(z.owner));
    this.companion = null;
  }

  /** PvP: a side with no Pokémon standing loses; at the time limit the larger remaining HP share wins. */
  private checkDuel(dt: number): boolean {
    const d = this.duel!, r = this.rival!;
    for (const side of this.sides()) this.duelAutoSend(side, dt);
    const left = (s: Side) => { const p = this.partyOf(s); return p.reduce((n, a) => n + (a.fainted ? 0 : a.hp / a.maxHp), 0) / Math.max(1, p.length); };
    const homeUp = this.partyOf(this.home).some((a) => !a.fainted), rivalUp = this.partyOf(r).some((a) => !a.fainted);
    if (homeUp && rivalUp && this.time < d.timeLimit) return false;
    if (!homeUp && !rivalUp) d.winner = 'draw';
    else if (!rivalUp) d.winner = 'home';
    else if (!homeUp) d.winner = 'rival';
    else { const h = left(this.home), v = left(r); d.winner = Math.abs(h - v) < 1e-6 ? 'draw' : h > v ? 'home' : 'rival'; }
    this.state = 'duelOver';
    this.emit({ t: 'sfx', name: d.winner === 'home' ? 'victory' : 'gameover' });
    return true;
  }

  private placeSpawn(s: SpawnRequest): void {
    let x: number, y: number;
    if (s.placement === 'ring') {
      const a = ((s.ringIndex ?? 0) / (s.ringCount ?? 1)) * Math.PI * 2;
      x = clamp(this.trainer.x + Math.cos(a) * 520, 40, this.width - 40);
      y = clamp(this.trainer.y + Math.sin(a) * 520, 40, this.height - 40);
    } else ({ x, y } = this.edgePoint());
    this.spawnEnemy(s.enemyId, s.level, s.elite, x, y);
  }

  // ───────────────────────────── trainer ─────────────────────────────

  private updateTrainer(side: Side, dt: number): void {
    const t = side.trainer;
    if (this.companion && t.hp <= 0) { t.hp = 0; t.vx = t.vy = 0; return; }
    let ix = side.input.x, iy = side.input.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const speed = t.moveSpeed * (1 + this.mods.trainerSpeed) * this.slowFactor(t) * (side.run ? 1.6 : 1);
    t.vx = ix * speed;
    t.vy = iy * speed;
    if (Math.abs(ix) > 0.05) t.facing = Math.sign(ix);
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    this.collide(t);
    if (t.iframes > 0) t.iframes -= dt;
    if (t.hitFlash > 0) t.hitFlash -= dt;
    if (t.shieldT > 0 && (t.shieldT -= dt) <= 0) t.shield = 0;
  }

  // ───────────────────────────── allies ─────────────────────────────

  private updateAlly(u: Unit, side: Side, dt: number): void {
    const m = this.allyAct(u, side, dt);
    if (m === 'dash') this.updateDash(u, dt);
    else if (m === 'move') this.allyMove(u, side, dt);
  }

  /**
   * Everything a party member does in a step except moving: timers, revive, casting, thinking.
   * Returns how it moves afterwards. A duel runs this for every unit of both sides first and moves
   * them all afterwards, so both sides decide from the same positions (no update-order advantage).
   */
  private allyAct(u: Unit, side: Side, dt: number): 'move' | 'dash' | null {
    const tr = side.trainer;
    if (u.fainted) {
      nextAiState(u, 'fainted', dt);
      u.x = tr.x; u.y = tr.y;
      u.reviveT -= dt;
      if (u.reviveT <= 0 && tr.hp > 0) {
        u.fainted = false;
        u.hp = Math.round(u.maxHp * 0.5);
        u.x = tr.x + this.rng.range(-30, 30); u.y = tr.y + this.rng.range(-30, 30);
        this.emit({ t: 'revive', id: u.id, name: u.name });
        this.emit({ t: 'vfx', name: 'heal', x: u.x, y: u.y });
      }
      return null;
    }
    this.tickTimers(u, dt);
    u.energy = Math.min(u.maxEnergy, u.energy + 12 * (1 + this.mods.energyRegen) * dt);

    if (Math.hypot(u.x - tr.x, u.y - tr.y) > (this.mode === 'adventure' ? 900 : ALLY_LEASH)) {
      u.x = tr.x + this.rng.range(-40, 40); u.y = tr.y + this.rng.range(-40, 40);
      u.target = null; u.castSlot = -1; u.dash = null;
      this.emit({ t: 'vfx', name: 'poof', x: u.x, y: u.y });
    }
    if (this.incapacitated(u)) { nextAiState(u, 'stunned', dt); return null; }
    if (u.dash) { nextAiState(u, 'attack', dt); return 'dash'; }
    if (u.castSlot >= 0) { nextAiState(u, 'cast', dt); this.updateCast(u, dt); return null; }

    u.aiTimer -= dt;
    if (u.aiTimer <= 0) {
      u.aiTimer = 0.18;
      this.allyThink(u, side);
    }
    return 'move';
  }

  private tickTimers(u: Unit, dt: number): void {
    for (const s of u.skills) if (s.cd > 0) s.cd -= dt;
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.animCast > 0) u.animCast -= dt;
    if (u.contactCd > 0) u.contactCd -= dt;
    if (u.flinchImmuneT > 0) u.flinchImmuneT -= dt;
    if (u.sturdyCd > 0) u.sturdyCd -= dt;
    if (u.shieldT > 0 && (u.shieldT -= dt) <= 0) u.shield = 0;
    if (u.held?.type === 'regen' && u.hp > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * (u.held.value ?? 0) * dt);
    if (u.heldCd > 0) u.heldCd -= dt;
    if (u.berryCd > 0) u.berryCd -= dt;
  }

  private bestEff(u: Unit, e: Unit): number {
    let best = 0;
    for (const s of u.skills) if (s.def.power > 0) best = Math.max(best, effectiveness(s.def.type, e.types));
    return best;
  }

  /** Role-based target selection with stickiness so allies don't flicker between targets. */
  private allyThink(u: Unit, side: Side): void {
    const tr = side.trainer;
    const cmd = side.command;
    if (cmd === 'follow' || cmd === 'retreat') {
      // Not engaging, but defensive skills (heal/shield) are still allowed
      u.target = null;
      u.choiceLock = null;
      const defensive = u.skills.map((s, i) => ({ s, i })).filter(({ s }) => (s.def.kind === 'heal' || s.def.kind === 'shield') && !this.heldBlocks(u, s.def));
      const choice = chooseSkill(defensive.map(({ s }) => ({ def: s.def, cooldownLeft: s.cd })), this.selectorContext(u));
      if (choice) this.beginCast(u, defensive[choice.slot].i);
      return;
    }
    this.candBuf.length = 0;
    const cx = cmd === 'hold' ? side.holdX : tr.x, cy = cmd === 'hold' ? side.holdY : tr.y;
    const detect = cmd === 'defend' ? 170 : this.duel ? 1400 : this.mode === 'adventure' ? 360 : ALLY_DETECT;
    const cands = this.queryOpponents(side, cx, cy, detect, this.candBuf);
    const ct = side.commandTarget;
    if (cmd === 'attack' && ct && ct.alive && !ct.captured && !ct.fainted) {
      cands.length = 0;
      cands.push(ct);
    }
    let best: Unit | null = null, bestScore = -Infinity;
    const limit = Math.min(cands.length, 40);
    for (let i = 0; i < limit; i++) {
      const e = cands[i];
      if (!e.hostile || e.captured || e.fainted) continue;
      const dSelf = Math.hypot(e.x - u.x, e.y - u.y);
      const dTr = Math.hypot(e.x - tr.x, e.y - tr.y);
      let score = -dSelf;
      switch (u.role) {
        case 'tank': score = -dTr * 1.3 - dSelf * 0.3 + (e.target === tr ? 60 : 0); break;
        case 'assassin': score = -dSelf * 0.5 - (e.hp / e.maxHp) * 250 - (e.kind === 'boss' ? 150 : 0); break;
        case 'mage': score = -dSelf * 0.7 + this.countOpponents(side, e.x, e.y, 80) * 45; break;
        case 'support': score = -dTr * 0.8 - dSelf * 0.4; break;
        default: break;
      }
      const eff = this.bestEff(u, e);
      if (eff === 0) continue;
      score += (eff - 1) * 70;
      if (e === u.target) score += 45;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    u.target = best;
    // Choice lock ends 1.5 s after the last target (heldCd doubles as that idle timer for Choice items)
    if (u.held?.type === 'choice') {
      if (best) u.heldCd = 1.5;
      else if (u.heldCd <= 0) u.choiceLock = null;
    }

    const choice = chooseSkill(u.skills.map((s) => ({ def: s.def, cooldownLeft: this.heldBlocks(u, s.def) ? Infinity : s.cd })), this.selectorContext(u), 1 + this.mods.areaMult);
    if (choice) this.beginCast(u, choice.slot);
  }

  selectorContext(u: Unit): SelectorContext {
    const t = u.target;
    let lowest: Unit | null = null;
    const side = this.sideOf(u);
    const consider = (a: Unit) => { if (!a.fainted && (!lowest || a.hp / a.maxHp < lowest.hp / lowest.maxHp)) lowest = a; };
    if (side) { consider(side.trainer); for (const a of side.allies) consider(a); } else consider(u);
    const threats = (x: number, y: number, r: number) => (side ? this.countOpponents(side, x, y, r) : this.countAllies(x, y, r));
    return {
      selfTypes: u.types,
      selfHpFrac: u.hp / u.maxHp,
      energy: u.energy,
      threatsNearSelf: threats(u.x, u.y, 90),
      hasShield: u.shield > 0,
      target: t ? { types: t.types, dist: Math.hypot(t.x - u.x, t.y - u.y), radius: t.radius, hasStatus: (k) => this.hasStatus(t, k as StatusKind) } : null,
      enemiesAroundTarget: (r) => (t ? threats(t.x, t.y, r) : 0),
      lowestAlly: lowest ? { hpFrac: (lowest as Unit).hp / (lowest as Unit).maxHp, dist: Math.hypot((lowest as Unit).x - u.x, (lowest as Unit).y - u.y) } : null,
      teamBuffActive: this.hasStatus(u, 'atkUp'),
    };
  }

  countEnemies(x: number, y: number, r: number): number {
    this.countBuf.length = 0;
    return this.grid.query(x, y, r, this.countBuf).length;
  }


  /** Opponents of `side` within r (PvP: never the trainers). */
  countOpponents(side: Side, x: number, y: number, r: number): number {
    this.countBuf.length = 0;
    return this.queryOpponents(side, x, y, r, this.countBuf).length;
  }

  /**
   * Opponents of `side` within r of (x, y). A duel scans the other party directly (≤ 6 units, exact and
   * symmetric for both sides); otherwise the spatial grid of enemies built at the start of the step.
   */
  private queryOpponents(side: Side, x: number, y: number, r: number, out: Unit[]): Unit[] {
    if (!this.rival) return this.grid.query(x, y, r, out);
    const r2 = r * r;
    for (const a of (side === this.home ? this.rival : this.home).allies) if (!a.fainted && dist2(a, x, y) <= r2) out.push(a);
    return out;
  }

  countAllies(x: number, y: number, r: number): number {
    return this.friendlyUnits().filter(a => a.hp > 0 && !a.fainted && dist2(a, x, y) <= r * r).length;
  }

  friendlyUnits(): Unit[] {
    return this.companion ? [this.trainer, ...this.allies, this.companion.trainer, ...this.companion.allies] : [this.trainer, ...this.allies];
  }

  private allyMove(u: Unit, side: Side, dt: number): void {
    const tr = side.trainer;
    const t = u.target && u.target.alive ? u.target : null;
    let gx: number, gy: number;
    const formA = (u.slotIndex / 6) * Math.PI * 2 + Math.PI / 2;
    const mx0 = this.mirror(side);
    const homeX = tr.x + mx0 * Math.cos(formA) * 58, homeY = tr.y + Math.sin(formA) * 48;

    if (side.command === 'hold' && !t) { gx = side.holdX + mx0 * Math.cos(formA) * 40; gy = side.holdY + Math.sin(formA) * 30; }
    else if (!t) { gx = homeX; gy = homeY; }
    else {
      const dx = u.x - t.x, dy = u.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      const closeR = u.skills.reduce((m, s) => (s.def.kind === 'melee' ? Math.min(m, s.def.range) : m), 9999);
      // Position by what the *current* kit can reach: an early Adventure kit may only have a melee move
      // even for a ranged role (e.g. Bulbasaur Lv5 = Vine Whip only).
      const reach = Math.min(u.attackRange, this.kitReach(u));
      switch (u.role) {
        case 'tank':
        case 'fighter': {
          const want = Math.min(closeR, u.attackRange) * 0.7 + t.radius;
          gx = t.x + (dx / d) * want; gy = t.y + (dy / d) * want;
          break;
        }
        case 'assassin': {
          const bx = t.x - tr.x, by = t.y - tr.y, bl = Math.hypot(bx, by) || 1;
          gx = t.x + (bx / bl) * 30; gy = t.y + (by / bl) * 30;
          break;
        }
        case 'support': {
          let lowest: Unit = tr;
          for (const a of side.allies) if (!a.fainted && a !== u && a.hp / a.maxHp < lowest.hp / lowest.maxHp) lowest = a;
          gx = lowest.x + (u.x > lowest.x ? 45 : -45); gy = lowest.y + 20;
          const gd = Math.hypot(t.x - gx, t.y - gy);
          if (reach < u.attackRange && gd > reach) {
            // the current kit is shorter than the role expects (early Adventure kit): step out just far enough
            const k = (gd - reach * 0.8) / gd;
            gx += (t.x - gx) * k; gy += (t.y - gy) * k;
          } else if (gd > u.attackRange) {
            gx = (gx * 2 + t.x) / 3; gy = (gy * 2 + t.y) / 3;
          }
          break;
        }
        default: {
          // marksman / mage: hold at preferred distance, kite away from anything closer than 80px
          const want = Math.max(40, reach * 0.75);
          gx = t.x + (dx / d) * want; gy = t.y + (dy / d) * want;
          break;
        }
      }
      // stay reasonably near the trainer (or the hold point)
      const ax = side.command === 'hold' ? side.holdX : tr.x, ay = side.command === 'hold' ? side.holdY : tr.y;
      const leash = side.command === 'defend' ? 140 : this.duel ? 900 : 320;
      const lx = gx - ax, ly = gy - ay, ll = Math.hypot(lx, ly);
      if (ll > leash) { gx = ax + (lx / ll) * leash; gy = ay + (ly / ll) * leash; }
    }

    let mx = gx - u.x, my = gy - u.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; } else { mx = 0; my = 0; }

    // Kiting for fragile roles
    if (u.role === 'mage' || u.role === 'marksman' || u.role === 'support') {
      this.scratch.length = 0;
      const near = this.queryOpponents(side, u.x, u.y, 75, this.scratch);
      if (near.length) {
        let ax = 0, ay = 0;
        for (const e of near) { ax += u.x - e.x; ay += u.y - e.y; }
        const al = Math.hypot(ax, ay) || 1;
        mx = mx * 0.3 + (ax / al) * 0.9; my = my * 0.3 + (ay / al) * 0.9;
      }
    }
    // Dodge enemy telegraphs (highest priority)
    const dodge = this.dangerVector(u);
    if (dodge) { mx = dodge.x; my = dodge.y; }
    // Confusion: staggering movement
    if (this.hasStatus(u, 'confusion')) { const a = Math.sin(this.time * 6 + u.id) * 1.1; const c = Math.cos(a), sn = Math.sin(a); [mx, my] = [mx * c - my * sn, mx * sn + my * c]; }
    // Explicit state (hysteresis in nextAiState keeps it from flickering)
    const recovering = u.animCast > 0 && !dodge;
    nextAiState(u, dodge ? 'dodge' : recovering ? 'recover' : !t ? (side.command === 'follow' || side.command === 'retreat' || ml > 40 ? 'follow' : 'idle')
      : Math.hypot(t.x - u.x, t.y - u.y) > u.attackRange * 1.1 ? 'chase' : 'position', dt);

    const far = Math.hypot(u.x - tr.x, u.y - tr.y) > 260 || side.command === 'retreat' ? 1.3 : 1;
    const sprint = side.run && !t ? 1.5 : 1;
    const speed = u.moveSpeed * far * sprint * this.speedFactor(u) * (u.role === 'assassin' ? 1.15 : 1);
    const arrive = !dodge && ml < 30 ? ml / 30 : 1;
    u.vx = mx * speed * arrive; u.vy = my * speed * arrive;
    u.x += u.vx * dt; u.y += u.vy * dt;
    if (t) u.facing = t.x >= u.x ? 1 : -1;
    else if (Math.abs(u.vx) > 5) u.facing = Math.sign(u.vx);
    this.collide(u);
  }

  /** Longest range among the unit's damaging skills (falls back to its role range). */
  private kitReach(u: Unit): number {
    let r = 0;
    for (const s of u.skills) if (s.def.power > 0) r = Math.max(r, s.def.range);
    return r || u.attackRange;
  }

  /** Direction out of the nearest hostile telegraph the unit is standing in, or null. */
  dangerVector(u: Unit): { x: number; y: number } | null {
    for (const z of this.zones) {
      if (!z.active || z.team === u.team || z.fired) continue;
      if (z.safe?.length) {
        const near = z.safe.reduce((a, b) => (Math.hypot(u.x - a.x, u.y - a.y) < Math.hypot(u.x - b.x, u.y - b.y) ? a : b));
        const d = Math.hypot(near.x - u.x, near.y - u.y);
        if (d < near.r * 0.6) continue;
        return { x: (near.x - u.x) / (d || 1), y: (near.y - u.y) / (d || 1) };
      }
      if (z.shape === 'circle') {
        const dx = u.x - z.x, dy = u.y - z.y, d = Math.hypot(dx, dy);
        if (d < z.r + u.radius + 6) {
          if (d < 0.01) return { x: 1, y: 0 };
          return { x: dx / d, y: dy / d };
        }
      } else {
        const c = Math.cos(z.angle), s = Math.sin(z.angle);
        const px = u.x - z.x, py = u.y - z.y;
        const along = px * c + py * s, perp = -px * s + py * c;
        if (along > -z.r && along < z.length + z.r && Math.abs(perp) < z.r + u.radius + 6) {
          // aimed dead-centre: step out on the side facing the middle of the map (not always the beam's left,
          // which would favour whoever shoots from one particular direction)
          // duel: aimed dead-centre, step out towards the middle of the arena — "always the beam's left" would
          // favour whoever shoots from one particular side (other modes keep the original rule)
          const sign = this.duel && Math.abs(perp) <= 0.5 ? (-s * (this.width / 2 - u.x) + c * (this.height / 2 - u.y) >= 0 ? 1 : -1) : perp >= 0 ? 1 : -1;
          return { x: -s * sign, y: c * sign };
        }
      }
    }
    return null;
  }

  // ───────────────────────────── enemies ─────────────────────────────

  private updateEnemy(e: Unit, dt: number): void {
    if (e.captured) return;
    this.tickTimers(e, dt);
    if (e.kind === 'boss') {
      this.bossPhaseCheck(e, dt);
      // transitions (cinematic / form change) and the weakened state: the boss holds still and never attacks
      if (!e.boss!.pm.canAct) { e.vx = 0; e.vy = 0; nextAiState(e, 'idle', dt); return; }
    }
    if (this.incapacitated(e)) { nextAiState(e, 'stunned', dt); return; }
    if (e.dash) { nextAiState(e, 'attack', dt); this.updateDash(e, dt); return; }
    if (e.castSlot >= 0) { nextAiState(e, 'cast', dt); this.updateCast(e, dt); return; }
    if (e.wild) {
      const m = e.wild.mode;
      nextAiState(e, m === 'flee' ? 'flee' : m === 'chase' || m === 'attack' ? (e.target && Math.hypot(e.target.x - e.x, e.target.y - e.y) <= e.attackRange * 1.1 ? 'position' : 'chase') : m === 'sleep' || m === 'idle' || m === 'eat' ? 'idle' : 'search', dt);
      updateWild(this, e, dt);
      return;
    }

    e.aiTimer -= dt;
    if (e.aiTimer <= 0) {
      e.aiTimer = 0.3;
      e.target = this.enemyPickTarget(e);
    }
    const t = e.target && (t2(e.target)) ? e.target : this.trainer;

    if (e.kind === 'boss') { this.bossThink(e, t, dt); return; }

    const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
    let mx = dx / d, my = dy / d;
    nextAiState(e, d > e.attackRange * 1.1 ? 'chase' : 'position', dt);
    if (this.hasStatus(e, 'confusion')) { const a = Math.sin(this.time * 6 + e.id) * 1.1; const c = Math.cos(a), sn = Math.sin(a); [mx, my] = [mx * c - my * sn, mx * sn + my * c]; }
    if (e.behavior === 'ranged') {
      if (d < e.attackRange * 0.7) { mx = -mx; my = -my; }
      else if (d < e.attackRange) { const s = (e.id % 2 ? 1 : -1); const ox = -my * s, oy = mx * s; mx = ox * 0.6; my = oy * 0.6; }
      const slot = e.skills[0];
      if (slot && slot.cd <= 0 && d <= slot.def.range) {
        e.castTarget = t;
        this.beginCast(e, 0);
      }
    }
    const speed = e.moveSpeed * this.slowFactor(e);
    e.vx = mx * speed; e.vy = my * speed;
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (Math.abs(e.vx) > 3) e.facing = Math.sign(e.vx);
    this.collide(e);
    this.contact(e, t);
    if (t !== this.trainer) this.contact(e, this.trainer);
  }

  enemyPickTarget(e: Unit): Unit {
    let best: Unit = this.trainer;
    // Melee units focus the trainer; ranged units shoot whatever is closest
    const trainerBias = e.behavior === 'ranged' ? 1 : 0.85;
    let bestD = this.trainer.hp > 0 ? Math.hypot(this.trainer.x - e.x, this.trainer.y - e.y) * trainerBias : Infinity;
    for (const a of this.friendlyUnits()) {
      if (a.fainted || a.hp <= 0) continue;
      let d = Math.hypot(a.x - e.x, a.y - e.y) * (a.kind === 'trainer' ? trainerBias : 1);
      if (this.hasStatus(a, 'taunt') && d < 260) d *= 0.2;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  contact(e: Unit, t: Unit): void {
    if (e.contactCd > 0 || t.fainted || e.captured) return;
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (d > e.radius + t.radius + 3) return;
    if (t.kind === 'trainer' && t.iframes > 0) return;
    e.contactCd = 0.8 / curves.aggression(this.time);
    const pseudo: SkillDef = CONTACT_SKILL(e);
    this.hit(e, t, { def: pseudo, cd: 0, level: 1, powerBonus: 0 }, 1);
    if (t.kind === 'trainer') t.iframes = 0.5;
  }

  private separateEnemies(): void {
    const en = this.enemies;
    for (let ei = 0; ei < en.length; ei++) {
      const e = en[ei];
      if (!e.alive || e.kind === 'boss' || e.captured) continue;
      this.scratch.length = 0;
      const near = this.grid.query(e.x, e.y, e.radius * 2.2, this.scratch);
      let n = 0;
      for (let i = 0; i < near.length && n <= 6; i++) {
        const o = near[i];
        if (o === e) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const min = e.radius + o.radius;
        // cheap squared-distance reject first (hot loop: 250 enemies in a crowd); overlaps keep the exact
        // original arithmetic (Math.hypot), so Survivor runs are bit-for-bit unchanged
        if (dx * dx + dy * dy >= min * min) continue;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < min) {
          const push = (min - d) * 0.25;
          const nx = e.x + (dx / d) * push, ny = e.y + (dy / d) * push;
          // a crowd must not shove anyone into water / walls (no terrain in Survivor: unchanged there)
          if (!this.terrainBlocks(e, nx, ny)) { e.x = nx; e.y = ny; }
          n++;
        }
      }
    }
    // Allies shouldn't sit inside enemies either
    for (const a of this.sides().flatMap(s => s.allies)) {
      if (a.fainted || a.dash) continue;
      this.scratch.length = 0;
      for (const o of this.grid.query(a.x, a.y, a.radius + 40, this.scratch)) {
        const dx = a.x - o.x, dy = a.y - o.y, min = a.radius + o.radius;
        if (dx * dx + dy * dy >= min * min) continue;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < min) { a.x += (dx / d) * (min - d) * 0.5; a.y += (dy / d) * (min - d) * 0.5; }
      }
    }
  }

  // ───────────────────────────── boss ─────────────────────────────

  /** Steps the boss's phase machine and applies what each phase event means in the world. */
  private bossPhaseCheck(b: Unit, dt: number): void {
    const st = b.boss!;
    const pm = st.pm;
    pm.update(dt, b.castSlot >= 0 || !!b.dash);
    for (const ev of pm.drain()) {
      const ph = pm.cfg.phases[pm.index];
      const info = { id: b.id, phase: pm.index, name: ph.name, kind: ph.kind, banner: ph.banner };
      switch (ev.t) {
        case 'transition':
          st.phase = Math.min(3, ev.to + 1) as 1 | 2 | 3;
          this.clearBossActions(b);
          this.emit({ t: 'bossPhase', ...info, state: 'transition' });
          if (ph.banner) this.emit({ t: 'banner', text: ph.banner, color: ph.kind === 'enrage' ? '#ffe040' : ph.kind === 'mega' ? '#ff80e0' : '#ff8030' });
          this.emit({ t: 'shake', intensity: 0.02, duration: 800 });
          this.emit({ t: 'sfx', name: 'boss' });
          if (ev.to === 1 && !st.ray) this.bossPhase2Effects(b);
          break;
        case 'cinematic':
          this.emit({ t: 'bossPhase', ...info, state: 'cinematic' });
          this.emit({ t: 'vfx', name: ph.kind === 'mega' ? 'mega' : 'shield', x: b.x, y: b.y, r: b.radius * 2 });
          break;
        case 'formChange':
          this.applyBossForm(b, ev.form);
          this.emit({ t: 'bossPhase', ...info, state: 'formChange', form: ev.form });
          this.emit({ t: 'vfx', name: 'mega', x: b.x, y: b.y, r: 110 });
          this.emit({ t: 'shake', intensity: 0.025, duration: 700 });
          break;
        case 'ready':
          this.emit({ t: 'bossPhase', ...info, state: 'ready' });
          break;
        case 'active':
          this.emit({ t: 'bossPhase', ...info, state: 'active' });
          st.patternT = 0.4;
          break;
        case 'weakened':
          this.clearBossActions(b);
          st.weakened = true;
          b.statuses.length = 0;
          this.emit({ t: 'bossWeakened', id: b.id, defId: b.defId, level: b.level, x: b.x, y: b.y, tag: b.tag });
          this.emit({ t: 'banner', text: `${b.name} đã kiệt sức! Ném bóng để thu phục!`, color: '#80ff90' });
          break;
        case 'weakenedExpired':
          this.emit({ t: 'bossWeakenedExpired', id: b.id, defId: b.defId });
          break;
        default:
      }
    }
  }

  /** Phase 2 of the generic bosses: adds + speed (unchanged behaviour since v0.2). */
  private bossPhase2Effects(b: Unit): void {
    const def = b.boss!.def;
    for (let i = 0; i < def.phase2Summon.count; i++) {
      const a = (i / def.phase2Summon.count) * Math.PI * 2;
      const sx = b.x + Math.cos(a) * 120, sy = b.y + Math.sin(a) * 120;
      if (this.mode === 'adventure' && POKEMON.has(def.phase2Summon.enemy)) {
        this.spawnWild(def.phase2Summon.enemy, b.level - 4, sx, sy, { hostile: true, tag: 'boss-add', noCapture: true, elite: true,
          wild: { mode: 'chase', t: 0, homeX: sx, homeY: sy, homeR: 60, leash: 900, temperament: 'aggressive', aggroR: 600, nocturnal: false, wanderX: sx, wanderY: sy, lastAttacker: null, threat: null, lodT: 0, fled: false, calmT: 0 } });
      } else this.spawnEnemy(def.phase2Summon.enemy, b.level - 2, true, sx, sy);
    }
    b.moveSpeed *= 1.25;
  }

  /** Old hitboxes never outlive a phase change: pending telegraphs, casts and dashes of the boss are removed. */
  clearBossActions(b: Unit): void {
    for (const z of this.zones) if (z.active && z.owner === b) z.active = false;
    b.castSlot = -1; b.dash = null; b.animCast = 0;
    rayCancel(b);
  }

  /** Real alternate form (Mega Rayquaza): its types and stats (HP fraction kept). */
  private applyBossForm(b: Unit, form: string): void {
    const f = POKEMON.get(form);
    if (!f) return;
    const st = b.boss!;
    st.form = form;
    b.types = [...f.types];
    const frac = b.hp / b.maxHp;
    const next = calcStats(f.baseStats, b.level);
    b.stats = { ...next, hp: b.stats.hp };
    b.hp = Math.max(1, Math.round(b.maxHp * frac));
  }

  private bossThink(b: Unit, t: Unit, dt: number): void {
    if (b.boss!.def.ai === 'venusaur') { this.venusaurThink(b, t, dt); return; }
    if (b.defId === 'rayquaza') { rayquazaThink(this, b, t, dt); return; }
    if (b.boss!.def.ai === 'legendary') { this.legendaryThink(b, t, dt); return; }
    const st = b.boss!;
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1;
    const speed = b.moveSpeed * this.slowFactor(b) * (d > 600 ? 1.8 : 1);
    // Slither: weave perpendicular to heading for a serpent feel
    const weave = Math.sin(this.time * 2.2) * 0.45;
    let mx = dx / d - (dy / d) * weave, my = dy / d + (dx / d) * weave;
    const ml = Math.hypot(mx, my); mx /= ml; my /= ml;
    if (d > 90) {
      b.vx = mx * speed; b.vy = my * speed;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.x = clamp(b.x, 40, this.width - 40); b.y = clamp(b.y, 40, this.height - 40);
      if (this.terrain && this.terrain.blocksMove(b.x, b.y)) { b.x = b.lastX; b.y = b.lastY; }
    } else { b.vx = 0; b.vy = 0; }
    if (Math.abs(b.vx) > 3) b.facing = Math.sign(b.vx);
    this.pushTrail(b);
    this.contact(b, t);
    if (t !== this.trainer) this.contact(b, this.trainer);

    st.patternT -= dt;
    if (st.patternT > 0) return;
    const cdMult = st.phase === 2 ? 0.7 : 1;
    const ready = (id: string) => b.skills.findIndex((s) => s.def.id === id && s.cd <= 0);
    const dTr = Math.hypot(this.trainer.x - b.x, this.trainer.y - b.y);
    let slot = -1;
    if (dTr < 220 && (slot = ready('earthquake')) >= 0) { /* point-blank: quake */ }
    else if (dTr > 160 && dTr < 450 && (slot = ready('body_slam')) >= 0) { /* gap-closer */ }
    else if (st.phase === 2 && (slot = ready('rock_tomb')) >= 0) { /* zone control */ }
    else slot = ready('rock_throw');
    if (slot < 0) { st.patternT = 0.3; return; }

    const s = b.skills[slot];
    s.cd = s.def.cooldown * cdMult;
    st.patternT = (st.phase === 2 ? 1.0 : 1.5);
    b.animCast = 0.5;
    b.lastSkill = s.def.id;
    switch (s.def.id) {
      case 'rock_throw': {
        const targets = this.friendlyUnits().filter(a => !a.fainted && a.hp > 0);
        if (!targets.length) break;
        const n = st.phase === 2 ? 6 : 3;
        for (let i = 0; i < n; i++) {
          const tg = targets[i % targets.length];
          const lead = i < targets.length ? 0.55 : this.rng.range(0.2, 1.2);
          const jitter = i < targets.length ? 0 : 60;
          this.addZone(b, s, 'circle', tg.x + tg.vx * lead + this.rng.range(-jitter, jitter), tg.y + tg.vy * lead + this.rng.range(-jitter, jitter), s.def.radius!, 0, 0, s.def.telegraph!, 0, 0, false);
        }
        break;
      }
      case 'rock_tomb':
        this.addZone(b, s, 'circle', this.trainer.x, this.trainer.y, s.def.radius!, 0, 0, s.def.telegraph!, s.def.field!.duration, s.def.field!.tick, false);
        break;
      default:
        b.castTarget = this.trainer;
        this.beginCast(b, slot);
    }
  }

  bossSlot(b: Unit, id: string, over: Partial<SkillDef>, key = id): SkillSlot {
    let m = this.bossSlots.get(b.defId);
    if (!m) this.bossSlots.set(b.defId, (m = new Map()));
    let s = m.get(key);
    if (!s) { s = { def: { ...getSkill(id), ...over, id: id + '_boss' }, cd: 0, level: 1, powerBonus: 0 }; m.set(key, s); }
    return s;
  }

  /**
   * Legendary world bosses (Articuno, Zapdos, Moltres, Mewtwo, Mew): one data-driven pattern set.
   *  P1: charged beam lines, predicted-position volley, point-blank nova, lingering hazard fields
   *  P2 (phase2Threshold): faster patterns, extra beams/volley shots, adds from phase2Summon
   *  P3 (phase3Threshold): signature ultimate — safe-spot blast, lightning storm or rotating spokes
   */
  private legendaryThink(b: Unit, t: Unit, dt: number): void {
    const st = b.boss!;
    const L = st.def.legend!;
    const pw = L.power ?? 1;
    const homeD = Math.hypot(b.x - st.homeX, b.y - st.homeY);
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1;
    const speed = b.moveSpeed * this.slowFactor(b);
    if (homeD > 280) {
      const hx = st.homeX - b.x, hy = st.homeY - b.y, hl = Math.hypot(hx, hy);
      b.vx = (hx / hl) * speed; b.vy = (hy / hl) * speed;
    } else if (L.flying) {
      // circle-strafe at ~230 px: radial correction + tangential drift
      const radial = clamp((d - 230) / 230, -1, 1);
      b.vx = ((dx / d) * radial - (dy / d) * 0.8) * speed;
      b.vy = ((dy / d) * radial + (dx / d) * 0.8) * speed;
    } else if (d > 170) { b.vx = (dx / d) * speed * 0.7; b.vy = (dy / d) * speed * 0.7; }
    else { b.vx = 0; b.vy = 0; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.x = clamp(b.x, 40, this.width - 40); b.y = clamp(b.y, 40, this.height - 40);
    if (!L.flying && this.terrain && this.terrain.blocksMove(b.x, b.y)) { b.x = b.lastX; b.y = b.lastY; }
    if (Math.abs(dx) > 4) b.facing = Math.sign(dx);
    this.contact(b, t);

    const fast = st.phase === 1 ? 1 : st.phase === 2 ? 0.8 : 0.65;
    if (L.blink) {
      st.blinkT = (st.blinkT ?? 5) - dt;
      if (st.blinkT <= 0 && b.castSlot < 0) {
        st.blinkT = this.rng.range(4, 7) * fast;
        this.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 60 });
        for (let i = 0; i < 8; i++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(120, 240);
          const nx = st.homeX + Math.cos(a) * r, ny = st.homeY + Math.sin(a) * r;
          if (!this.blocked(nx, ny, b.radius) && Math.hypot(nx - t.x, ny - t.y) > 140) { b.x = nx; b.y = ny; break; }
        }
        this.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 60 });
      }
    }

    st.patternT -= dt;
    if (st.patternT > 0) return;
    st.patternT = 1.6 * fast;
    b.animCast = 0.6;
    const live = this.friendlyUnits().filter(a => !a.fainted && a.hp > 0);
    if (!live.length) return;
    const roll = this.rng.next();
    if (st.phase === 3 && b.lastSkill !== 'ultimate' && roll < 0.4) { this.legendUltimate(b, L); return; }
    if (d < 170 && roll < 0.5) {
      b.lastSkill = 'nova';
      const slot = this.bossSlot(b, L.nova, { power: 80 * pw, radius: 150, kind: 'aoe' }, 'nova');
      this.addZone(b, slot, 'circle', b.x, b.y, 150, 0, 0, 0.8, 0, 0, false);
    } else if (roll < 0.35) {
      b.lastSkill = 'beam';
      const slot = this.bossSlot(b, L.beam, { power: 105 * pw, radius: 34 }, 'beam');
      const shots = st.phase >= 2 ? 2 : 1;
      for (let i = 0; i < shots; i++) {
        const tg = live[i % live.length];
        const a = Math.atan2(tg.y - b.y, tg.x - b.x) + (i ? this.rng.range(-0.35, 0.35) : 0);
        this.addZone(b, slot, 'line', b.x, b.y, 34, a, 600, 1.4 * (st.phase === 3 ? 0.8 : 1), 0, 0, false);
      }
    } else if (roll < 0.7) {
      b.lastSkill = 'volley';
      const slot = this.bossSlot(b, L.volley, { power: 70 * pw, radius: 70, kind: 'aoe' }, 'volley');
      const n = st.phase >= 2 ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const tg = live[i % live.length];
        const lead = i < live.length ? 0.55 : this.rng.range(0.2, 1.2);
        const j = i < live.length ? 0 : 70;
        this.addZone(b, slot, 'circle', tg.x + tg.vx * lead + this.rng.range(-j, j), tg.y + tg.vy * lead + this.rng.range(-j, j), 70, 0, 0, 1.0 + i * 0.1, 0, 0, false);
      }
    } else {
      b.lastSkill = 'field';
      const slot = this.bossSlot(b, L.field, { power: 10 * pw, kind: 'field', radius: 85, status: L.fieldStatus }, 'field');
      for (const tg of live.slice(0, 3)) this.addZone(b, slot, 'circle', tg.x + tg.vx * 0.5, tg.y + tg.vy * 0.5, 85, 0, 0, 0.9, 4, 0.5, false);
    }
  }

  private legendUltimate(b: Unit, L: NonNullable<BossDef['legend']>): void {
    const st = b.boss!;
    const pw = L.power ?? 1;
    b.lastSkill = 'ultimate';
    st.cast = { name: L.ultimateName, at: this.time, windup: 1.4 };
    this.emit({ t: 'banner', text: `${st.def.name}: ${L.ultimateName}!`, color: '#ffe040' });
    this.emit({ t: 'shake', intensity: 0.015, duration: 700 });
    this.emit({ t: 'sfx', name: 'boss' });
    if (L.ultimateStyle === 'judgment') {
      // Arceus: every ultimate in sequence (storm → spokes → safe-spot blast), the longest pattern in the game
      this.ultimateSafe(b, L, pw, 4.2);
      this.ultimateSpokes(b, L, pw, 0.9);
      this.ultimateStorm(b, L, pw, 0.4);
      st.patternT = 6.5;
      return;
    }
    if (L.ultimateStyle === 'timestop') {
      // Dialga: time nearly stops for the player's side, then a delayed storm falls
      for (const a of this.friendlyUnits()) if (!a.fainted && a.hp > 0) this.applyStatus(a, { kind: 'slow', chance: 1, duration: 3, magnitude: 0.7 }, b);
      this.emit({ t: 'banner', text: 'Thời gian ngưng đọng!', color: '#a0c8ff' });
      this.ultimateStorm(b, L, pw, 1.4);
      st.patternT = 5;
      return;
    }
    if (L.ultimateStyle === 'rift') {
      // Palkia: tears space — blinks to a new spot, fires spokes from there, then a safe-spot blast
      const a0 = this.rng.range(0, Math.PI * 2);
      b.x = st.homeX + Math.cos(a0) * 180; b.y = st.homeY + Math.sin(a0) * 180;
      this.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 80 });
      this.ultimateSpokes(b, L, pw, 0.6);
      this.ultimateSafe(b, L, pw, 3.4);
      st.patternT = 5.2;
      return;
    }
    const style = L.ultimateStyle === 'mixed' ? this.rng.pick(['safe', 'storm', 'spokes'] as const) : L.ultimateStyle;
    if (style === 'safe') {
      // Arena-wide blast; only three small circles are safe
      const safe = [0, 1, 2].map((i) => {
        const a = this.rng.range(0, Math.PI * 2) + (i * Math.PI * 2) / 3;
        return { x: st.homeX + Math.cos(a) * 220, y: st.homeY + Math.sin(a) * 220, r: 80 };
      });
      const slot = this.bossSlot(b, L.ultimate, { power: 125 * pw, radius: 620, kind: 'aoe' }, 'ult-safe');
      this.addZone(b, slot, 'circle', st.homeX, st.homeY, 620, 0, 0, 2.8, 0, 0, false, safe);
      this.emit({ t: 'banner', text: 'Chạy vào vùng an toàn!', color: '#ffffff' });
      st.patternT = 4.2;
    } else if (style === 'storm') {
      // Staggered strikes: on every target, then scattered over the arena
      const slot = this.bossSlot(b, L.ultimate, { power: 95 * pw, radius: 75, kind: 'aoe' }, 'ult-storm');
      const live = this.friendlyUnits().filter(a => !a.fainted && a.hp > 0);
      for (let i = 0; i < 16; i++) {
        let x: number, y: number;
        if (i < live.length * 2) { const tg = live[i % live.length]; x = tg.x + tg.vx * 0.6; y = tg.y + tg.vy * 0.6; }
        else { const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(40, 320); x = st.homeX + Math.cos(a) * r; y = st.homeY + Math.sin(a) * r; }
        this.addZone(b, slot, 'circle', x, y, 75, 0, 0, 1.0 + i * 0.14, 0, 0, false);
      }
      st.patternT = 3.8;
    } else {
      // Two waves of rotating spokes from the boss; stand between the lines
      const slot = this.bossSlot(b, L.ultimate, { power: 110 * pw, radius: 34 }, 'ult-spokes');
      const a0 = this.rng.range(0, Math.PI * 2), n = 8;
      for (let w = 0; w < 2; w++) for (let i = 0; i < n; i++) {
        this.addZone(b, slot, 'line', b.x, b.y, 34, a0 + (i + w * 0.5) * ((Math.PI * 2) / n), 620, 1.5 + w * 1.1, 0, 0, false);
      }
      st.patternT = 4.0;
    }
  }

  /**
   * Mega Venusaur world boss: stays in its grove, telegraphs everything.
   *  P1: Solar Beam (charged line), Petal Storm (ring), Sleep Powder (fields), Vine Lash (close range)
   *  P2: summons Oddish guards, double Petal Storm, faster patterns
   *  P3: "Ánh Dương" — arena-wide blast; only the shade circles are safe
   */
  private ultimateSafe(b: Unit, L: NonNullable<BossDef['legend']>, pw: number, delay: number): void {
    const st = b.boss!;
    const safe = [0, 1, 2].map((i) => {
      const a = this.rng.range(0, Math.PI * 2) + (i * Math.PI * 2) / 3;
      return { x: st.homeX + Math.cos(a) * 220, y: st.homeY + Math.sin(a) * 220, r: 80 };
    });
    const slot = this.bossSlot(b, L.ultimate, { power: 125 * pw, radius: 620, kind: 'aoe' }, 'ult-safe');
    this.addZone(b, slot, 'circle', st.homeX, st.homeY, 620, 0, 0, delay, 0, 0, false, safe);
  }

  private ultimateStorm(b: Unit, L: NonNullable<BossDef['legend']>, pw: number, delay0: number): void {
    const st = b.boss!;
    const slot = this.bossSlot(b, L.ultimate, { power: 95 * pw, radius: 75, kind: 'aoe' }, 'ult-storm');
    const live = this.friendlyUnits().filter(a => !a.fainted && a.hp > 0);
    for (let i = 0; i < 16; i++) {
      let x: number, y: number;
      if (i < live.length * 2) { const tg = live[i % live.length]; x = tg.x + tg.vx * 0.6; y = tg.y + tg.vy * 0.6; }
      else { const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(40, 320); x = st.homeX + Math.cos(a) * r; y = st.homeY + Math.sin(a) * r; }
      this.addZone(b, slot, 'circle', x, y, 75, 0, 0, delay0 + i * 0.14, 0, 0, false);
    }
  }

  private ultimateSpokes(b: Unit, L: NonNullable<BossDef['legend']>, pw: number, delay0: number): void {
    const slot = this.bossSlot(b, L.ultimate, { power: 110 * pw, radius: 34 }, 'ult-spokes');
    const a0 = this.rng.range(0, Math.PI * 2), n = 8;
    for (let w = 0; w < 2; w++) for (let i = 0; i < n; i++) {
      this.addZone(b, slot, 'line', b.x, b.y, 34, a0 + (i + w * 0.5) * ((Math.PI * 2) / n), 620, delay0 + 0.9 + w * 1.1, 0, 0, false);
    }
  }

  private venusaurThink(b: Unit, t: Unit, dt: number): void {
    const st = b.boss!;
    const homeD = Math.hypot(b.x - st.homeX, b.y - st.homeY);
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1;
    const speed = b.moveSpeed * this.slowFactor(b);
    // slow, deliberate movement; never leaves the grove
    if (homeD > 260) { const hx = st.homeX - b.x, hy = st.homeY - b.y, hl = Math.hypot(hx, hy); b.vx = (hx / hl) * speed; b.vy = (hy / hl) * speed; }
    else if (d > 150) { b.vx = (dx / d) * speed * 0.6; b.vy = (dy / d) * speed * 0.6; }
    else { b.vx = 0; b.vy = 0; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(dx) > 4) b.facing = Math.sign(dx);
    this.contact(b, t);
    st.patternT -= dt;
    if (st.patternT > 0) return;
    const fast = st.phase === 1 ? 1 : st.phase === 2 ? 0.8 : 0.65;
    st.patternT = 1.7 * fast;
    b.animCast = 0.6;
    const live = this.friendlyUnits().filter(a => !a.fainted && a.hp > 0);
    if (!live.length) return;
    const roll = this.rng.next();
    if (st.phase === 3 && (b.lastSkill !== 'sunburst' && roll < 0.4)) {
      // Arena-wide sun blast with three shade circles (the only safe ground)
      b.lastSkill = 'sunburst';
      const safe = [0, 1, 2].map((i) => {
        const a = this.rng.range(0, Math.PI * 2) + (i * Math.PI * 2) / 3;
        return { x: st.homeX + Math.cos(a) * 230, y: st.homeY + Math.sin(a) * 230, r: 78 };
      });
      const slot = this.bossSlot(b, 'solar_beam', { power: 130, radius: 640, kind: 'aoe' });
      this.addZone(b, slot, 'circle', st.homeX, st.homeY, 640, 0, 0, 2.8, 0, 0, false, safe);
      this.emit({ t: 'banner', text: 'Ánh Dương! Trốn vào vùng bóng râm!', color: '#ffe040' });
      st.patternT = 4.2;
      return;
    }
    if (d < 170 && roll < 0.55) {
      b.lastSkill = 'vine_whip';
      const slot = this.bossSlot(b, 'vine_whip', { power: 70, radius: 120 });
      this.addZone(b, slot, 'circle', b.x + (dx / d) * 90, b.y + (dy / d) * 90, 120, 0, 0, 0.65, 0, 0, false);
    } else if (roll < 0.35) {
      b.lastSkill = 'solar_beam';
      const slot = this.bossSlot(b, 'solar_beam', { power: 110, radius: 38 });
      const shots = st.phase >= 2 ? 2 : 1;
      for (let i = 0; i < shots; i++) {
        const tg = live[i % live.length];
        const a = Math.atan2(tg.y - b.y, tg.x - b.x) + (i ? this.rng.range(-0.35, 0.35) : 0);
        this.addZone(b, slot, 'line', b.x, b.y, 38, a, 600, 1.6 * (st.phase === 3 ? 0.75 : 1), 0, 0, false);
      }
    } else if (roll < 0.7) {
      b.lastSkill = 'petal_blizzard';
      const slot = this.bossSlot(b, 'petal_blizzard', { power: 80, radius: 230 });
      this.addZone(b, slot, 'circle', b.x, b.y, 230, 0, 0, 1.3, 0, 0, false);
      if (st.phase >= 2) this.addZone(b, slot, 'circle', b.x, b.y, 230, 0, 0, 2.4, 0, 0, false);
    } else {
      b.lastSkill = 'sleep_powder';
      const slot = this.bossSlot(b, 'sleep_powder', { power: 8, kind: 'field', radius: 80, status: { kind: 'stun', chance: 0.35, duration: 1.2, magnitude: 0 } });
      for (const tg of live.slice(0, 3)) this.addZone(b, slot, 'circle', tg.x + tg.vx * 0.5, tg.y + tg.vy * 0.5, 80, 0, 0, 0.9, 4, 0.5, false);
    }
  }

  private pushTrail(b: Unit): void {
    const tr = b.boss!.trail;
    if (!tr.length) return;
    const head = tr[0];
    if (Math.hypot(head.x - b.x, head.y - b.y) >= 7) {
      const last = tr.pop()!;
      last.x = b.x; last.y = b.y;
      tr.unshift(last);
    }
  }

  // ───────────────────────────── skills ─────────────────────────────

  beginCast(u: Unit, slotIdx: number): void {
    const slot = u.skills[slotIdx];
    const def = slot.def;
    // Paralysis: 25% of attempts fail ("fully paralysed"); the skill retries shortly instead of losing its cooldown
    if (this.hasStatus(u, 'paralysis') && this.rng.chance(FULL_PARA_CHANCE)) {
      slot.cd = Math.max(slot.cd, 0.8);
      this.emit({ t: 'status', x: u.x, y: u.y - u.radius, kind: 'fullPara', team: u.team });
      return;
    }
    if (u.kind === 'pokemon') {
      if (u.energy < def.energyCost) return;
      u.energy -= def.energyCost;
      const heldCdr = u.held?.type === 'cdr' ? u.held.value ?? 0 : u.held?.type === 'choice' && !u.held.category ? 0.15 : 0;
      const cdr = Math.min(0.6, this.mods.cdr + 0.04 * (slot.level - 1) + heldCdr);
      slot.cd = def.cooldown * (1 - cdr);
      if (u.held?.type === 'choice' && def.power > 0 && !u.choiceLock) u.choiceLock = def.id;
    } else slot.cd = (def.cooldown / (this.mode === 'survivor' ? curves.aggression(this.time) : 1)) * (u.alpha ? 0.7 : 1);
    slot.cdMax = slot.cd;
    if (u.kind === 'pokemon' || !u.castTarget) u.castTarget = u.target;
    const tg = u.castTarget;
    u.castX = tg ? tg.x : u.x;
    u.castY = tg ? tg.y : u.y;
    u.castSlot = slotIdx;
    u.castT = def.kind === 'dash' && def.telegraph ? def.telegraph : def.castTime;
    u.animCast = Math.max(0.25, u.castT);
    u.lastSkill = def.id;
    u.vx = 0; u.vy = 0;
    if (def.kind === 'dash' && def.telegraph && tg) {
      const a = Math.atan2(tg.y - u.y, tg.x - u.x);
      u.castX = tg.x; u.castY = tg.y;
      this.addZone(u, slot, 'line', u.x, u.y, def.radius ?? 30, a, def.dash!.distance, def.telegraph, 0, 0, true);
    }
  }

  private updateCast(u: Unit, dt: number): void {
    u.castT -= dt;
    // Track the target during wind-up except for telegraphed dashes (they commit to a line)
    const slot = u.skills[u.castSlot];
    const tg = u.castTarget;
    if (tg && tg.alive && !tg.fainted && !(slot.def.kind === 'dash' && slot.def.telegraph)) { u.castX = tg.x; u.castY = tg.y; }
    if (u.castT > 0) return;
    u.castSlot = -1;
    if (this.hasStatus(u, 'confusion') && slot.def.power > 0 && this.rng.chance(CONFUSION_SELF_HIT)) {
      // Main-series confusion: a typeless 40-power physical hit on itself, no STAB / type / crit
      const r = computeDamage({ level: u.level, power: 40, category: 'physical', skillType: 'normal', attackerTypes: [], defenderTypes: [],
        atk: u.stats.atk, spa: u.stats.spa, def: u.stats.def, spd: u.stats.spd, critRoll: 1, critRate: 0, varianceRoll: this.rng.next(), modifier: u.kind === 'pokemon' ? 0.7 : 1 });
      this.emit({ t: 'status', x: u.x, y: u.y - u.radius, kind: 'selfHit', team: u.team });
      this.applyDamage(u, r.amount, null);
      return;
    }
    this.execute(u, slot, u.castX, u.castY, tg && tg.alive && !tg.fainted ? tg : null);
  }

  private execute(u: Unit, slot: SkillSlot, tx: number, ty: number, tg: Unit | null): void {
    const s = slot.def;
    const area = u.team === 'ally' ? 1 + this.mods.areaMult : 1;
    const ang = Math.atan2(ty - u.y, tx - u.x);
    if (tx !== u.x) u.facing = tx > u.x ? 1 : -1;
    this.emit({ t: 'sfx', name: s.sfx });
    switch (s.kind) {
      case 'projectile': {
        const p = s.projectile!;
        const count = p.count + (u.team === 'ally' ? this.mods.extraProjectiles : 0);
        const spread = count > 1 ? Math.max(p.spread, 0.12) : 0;
        for (let i = 0; i < count; i++) {
          const a = ang + (count > 1 ? (i / (count - 1) - 0.5) * spread * 2 : 0);
          this.fireProjectile(u, slot, a, p.speed, p.size, p.pierce, s.range / p.speed + 0.25);
        }
        break;
      }
      case 'melee': {
        const reach = Math.min(Math.hypot(tx - u.x, ty - u.y), s.range);
        const hx = u.x + Math.cos(ang) * reach, hy = u.y + Math.sin(ang) * reach;
        this.areaHit(u, slot, hx, hy, s.radius ?? 40, 1);
        this.emit({ t: 'vfx', name: s.vfx, x: hx, y: hy, r: s.radius, angle: ang, type: s.type });
        // small lunge for game feel
        u.x += Math.cos(ang) * 8; u.y += Math.sin(ang) * 8;
        break;
      }
      case 'aoe': {
        const r = (s.radius ?? 60) * area;
        const cx = s.target === 'self' ? u.x : tx, cy = s.target === 'self' ? u.y : ty;
        if (s.telegraph) this.addZone(u, slot, 'circle', cx, cy, r, 0, 0, s.telegraph, 0, 0, false);
        else {
          this.areaHit(u, slot, cx, cy, r, 1);
          this.emit({ t: 'vfx', name: s.vfx, x: cx, y: cy, r, type: s.type });
        }
        break;
      }
      case 'cone': {
        // spray in front of the caster: every opponent within `range` and ±spread of the aim
        const len = s.range * area, spread = s.cone?.spread ?? 0.55;
        for (const v of this.opponentsNear(u.team, u.x, u.y, len + 30).slice()) {
          const d = Math.hypot(v.x - u.x, v.y - u.y);
          if (d > len + v.radius) continue;
          let da = Math.abs(Math.atan2(v.y - u.y, v.x - u.x) - ang);
          if (da > Math.PI) da = Math.PI * 2 - da;
          if (da <= spread + Math.atan2(v.radius, Math.max(1, d))) this.hit(u, v, slot, 1);
        }
        this.emit({ t: 'vfx', name: 'cone', x: u.x, y: u.y, r: spread, angle: ang, len, type: s.type });
        break;
      }
      case 'field': {
        const f = s.field!;
        this.addZone(u, slot, 'circle', tx, ty, (s.radius ?? 60) * area, 0, 0, s.telegraph ?? 0.05, f.duration, f.tick, false);
        break;
      }
      case 'beam': {
        const len = s.beam?.length ?? s.range;
        this.lineHit(u, slot, u.x, u.y, ang, len, (s.radius ?? 14) * area);
        this.emit({ t: 'vfx', name: s.vfx, x: u.x, y: u.y, angle: ang, len, r: s.radius, type: s.type });
        break;
      }
      case 'dash': {
        const dd = s.dash!;
        u.dash = { dx: Math.cos(ang), dy: Math.sin(ang), remaining: dd.distance, speed: dd.speed, slot, hit: new Set() };
        break;
      }
      case 'heal': {
        let best: Unit | null = null;
        const hs = this.sideOf(u);
        for (const a of hs ? [hs.trainer, ...hs.allies] : [u]) {
          if (a.fainted || Math.hypot(a.x - u.x, a.y - u.y) > s.range) continue;
          if (!best || a.hp / a.maxHp < best.hp / best.maxHp) best = a;
        }
        if (best) this.heal(best, best.maxHp * s.heal! * (1 + 0.1 * (slot.level - 1)));
        break;
      }
      case 'shield': {
        u.shield = Math.round(u.maxHp * s.shield! * (1 + slot.powerBonus));
        u.shieldT = 6;
        if (s.status) this.applyStatus(u, s.status, u);
        this.emit({ t: 'vfx', name: 'shield', x: u.x, y: u.y, r: u.radius + 10 });
        break;
      }
      case 'buff': {
        // the caster's own side (a wild / trainer Pokémon only buffs itself)
        const bs = this.sideOf(u);
        for (const a of bs ? bs.allies : [u]) if (!a.fainted && s.status) this.applyStatus(a, s.status, u);
        this.emit({ t: 'vfx', name: 'buff', x: u.x, y: u.y });
        break;
      }
      case 'debuff': {
        if (tg && s.status && !this.rollMiss(u, tg, s)) {
          this.applyStatus(tg, s.status, u);
          if (tg.wild && u.team !== tg.team) tg.hostile = true;
          this.emit({ t: 'vfx', name: s.vfx, x: tg.x, y: tg.y, type: s.type });
        }
        break;
      }
      case 'summon':
        break;
    }
  }

  private updateDash(u: Unit, dt: number): void {
    const d = u.dash!;
    const step = Math.min(d.remaining, d.speed * dt);
    u.x += d.dx * step; u.y += d.dy * step;
    u.vx = d.dx * d.speed; u.vy = d.dy * d.speed;
    d.remaining -= step;
    const r = d.slot.def.radius ?? u.radius;
    for (const v of this.opponentsNear(u.team, u.x, u.y, r + 30)) {
      if (d.hit.has(v.id)) continue;
      if (Math.hypot(v.x - u.x, v.y - u.y) <= r + v.radius) {
        d.hit.add(v.id);
        this.hit(u, v, d.slot, 1);
      }
    }
    if (u.kind === 'boss') this.pushTrail(u);
    u.x = clamp(u.x, 30, this.width - 30); u.y = clamp(u.y, 30, this.height - 30);
    if (this.terrain && this.terrain.blocksMove(u.x, u.y)) { u.x -= d.dx * step; u.y -= d.dy * step; d.remaining = 0; }
    if (d.remaining <= 0.01) {
      u.dash = null;
      this.emit({ t: 'vfx', name: d.slot.def.vfx, x: u.x, y: u.y, r, type: d.slot.def.type });
      if (u.kind === 'boss') this.emit({ t: 'shake', intensity: 0.008, duration: 200 });
    }
  }

  private opponentsNear(team: Team, x: number, y: number, r: number): Unit[] {
    this.scratch.length = 0;
    const out = this.scratch;
    const r2 = (r + 40) * (r + 40);
    if (this.rival) {
      // duel: both directions scan the live party (≤ 6 units) the same way — no stale grid cells, no side bias;
      // trainers are not targets
      for (const a of (team === 'ally' ? this.rival : this.home).allies) if (!a.fainted && dist2(a, x, y) <= r2) out.push(a);
      return out;
    }
    if (team === 'ally') return this.grid.query(x, y, r, out);
    for (const a of this.friendlyUnits()) if (a.hp > 0 && !a.fainted && dist2(a, x, y) <= r2) out.push(a);
    return out;
  }

  private areaHit(src: Unit, slot: SkillSlot, x: number, y: number, r: number, mult: number, safe?: { x: number; y: number; r: number }[]): number {
    const victims = this.opponentsNear(src.team, x, y, r + 30).slice();
    let n = 0;
    for (const v of victims) {
      if (Math.hypot(v.x - x, v.y - y) > r + v.radius) continue;
      if (safe?.some((p) => Math.hypot(v.x - p.x, v.y - p.y) < p.r)) continue;
      this.hit(src, v, slot, mult);
      n++;
    }
    return n;
  }

  /** Side effects of an Elemental Combo (cure, splash, chain) + feedback. */
  private comboEffects(src: Unit, dst: Unit, c: ComboDef, amount: number, type: PokeType): void {
    if (c.cures) dst.statuses = dst.statuses.filter((x) => x.kind !== c.cures);
    const others = (r: number) => this.enemies.filter((e) => e.alive && e !== dst && !e.captured && Math.hypot(e.x - dst.x, e.y - dst.y) <= r + e.radius);
    if (c.splash) for (const v of others(c.splash.r)) this.applyDamage(v, amount * c.splash.mult, src, false, 1, true);
    if (c.chain) {
      const near = others(c.chain.r).sort((a, b) => Math.hypot(a.x - dst.x, a.y - dst.y) - Math.hypot(b.x - dst.x, b.y - dst.y)).slice(0, c.chain.n);
      for (const v of near) {
        this.emit({ t: 'vfx', name: 'beam', x: dst.x, y: dst.y, angle: Math.atan2(v.y - dst.y, v.x - dst.x), len: Math.hypot(v.x - dst.x, v.y - dst.y), r: 6, type });
        this.applyDamage(v, amount * c.chain.mult, src, false, 1, true);
      }
    }
    this.emit({ t: 'combo', name: c.name, x: dst.x, y: dst.y - dst.radius, type });
  }

  /** Every opponent within `len` and ±spread of `ang` (same test as the cone skills). */
  private coneHit(src: Unit, slot: SkillSlot, x: number, y: number, ang: number, len: number, spread: number): void {
    for (const v of this.opponentsNear(src.team, x, y, len + 30).slice()) {
      const d = Math.hypot(v.x - x, v.y - y);
      if (d > len + v.radius) continue;
      let da = Math.abs(Math.atan2(v.y - y, v.x - x) - ang);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da <= spread + Math.atan2(v.radius, Math.max(1, d))) this.hit(src, v, slot, 1);
    }
  }

  private lineHit(src: Unit, slot: SkillSlot, x: number, y: number, ang: number, len: number, w: number): void {
    const c = Math.cos(ang), s = Math.sin(ang);
    const victims = this.opponentsNear(src.team, x + c * len * 0.5, y + s * len * 0.5, len * 0.5 + w + 20).slice();
    for (const v of victims) {
      const px = v.x - x, py = v.y - y;
      const along = px * c + py * s, perp = Math.abs(-px * s + py * c);
      if (along >= 0 && along <= len && perp <= w + v.radius) this.hit(src, v, slot, 1);
    }
  }

  private fireProjectile(u: Unit, slot: SkillSlot, ang: number, speed: number, size: number, pierce: number, life: number): void {
    const p = this.projectiles.find((q) => !q.active);
    if (!p) return; // pool exhausted: drop silently (performance guard)
    p.active = true; p.team = u.team; p.owner = u; p.slot = slot; p.skill = slot.def;
    p.x = u.x + Math.cos(ang) * (u.radius + 4); p.y = u.y + Math.sin(ang) * (u.radius + 4);
    p.vx = Math.cos(ang) * speed; p.vy = Math.sin(ang) * speed;
    p.r = size; p.life = life; p.pierce = pierce; p.hit.clear();
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) { p.active = false; continue; }
      if (this.shotBlocked(p.x, p.y, p.r)) {
        p.active = false;
        this.emit({ t: 'vfx', name: 'puff', x: p.x, y: p.y });
        continue;
      }
      const victims = this.opponentsNear(p.team, p.x, p.y, p.r + 40);
      for (const v of victims) {
        if (p.hit.has(v.id) || v.captured) continue;
        if (Math.hypot(v.x - p.x, v.y - p.y) > p.r + v.radius) continue;
        p.hit.add(v.id);
        this.hit(p.owner!, v, p.slot!, 1);
        this.emit({ t: 'vfx', name: p.skill!.vfx + '_hit', x: p.x, y: p.y, type: p.skill!.type });
        if (p.pierce-- <= 0) { p.active = false; break; }
      }
    }
  }

  addZone(owner: Unit, slot: SkillSlot, shape: 'circle' | 'line' | 'cone', x: number, y: number, r: number, angle: number, length: number, delay: number, duration: number, tick: number, visualOnly: boolean, safe?: { x: number; y: number; r: number }[]): void {
    let z = this.zones.find((q) => !q.active);
    if (!z) {
      if (this.zones.length > 120) return;
      z = {} as Zone;
      this.zones.push(z);
    }
    Object.assign(z, { active: true, team: owner.team, owner, slot, shape, x, y, r, angle, length, delay, t: 0, duration, tick, tickT: 0, visualOnly, fired: false, safe });
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      if (!z.active) continue;
      z.t += dt;
      if (z.visualOnly) { if (z.t >= z.delay) z.active = false; continue; }
      if (!z.fired && z.t >= z.delay) {
        z.fired = true;
        if (z.duration <= 0) {
          if (z.shape === 'line') this.lineHit(z.owner, z.slot, z.x, z.y, z.angle, z.length, z.r);
          else if (z.shape === 'cone') this.coneHit(z.owner, z.slot, z.x, z.y, z.angle, z.length, z.r);
          else this.areaHit(z.owner, z.slot, z.x, z.y, z.r, 1, z.safe);
          if (z.shape === 'cone') this.emit({ t: 'vfx', name: 'cone', x: z.x, y: z.y, r: z.r, angle: z.angle, len: z.length, type: z.slot.def.type });
          else if (z.shape === 'line') this.emit({ t: 'vfx', name: 'beam', x: z.x, y: z.y, angle: z.angle, len: z.length, r: z.r, type: z.slot.def.type });
          else this.emit({ t: 'vfx', name: z.slot.def.vfx, x: z.x, y: z.y, r: z.r, type: z.slot.def.type });
          if (z.r > 150) this.emit({ t: 'shake', intensity: 0.015, duration: 350 });
          z.active = false;
          continue;
        }
        this.emit({ t: 'vfx', name: z.slot.def.vfx + '_start', x: z.x, y: z.y, r: z.r, type: z.slot.def.type });
      }
      if (z.fired) {
        z.tickT -= dt;
        if (z.tickT <= 0) {
          z.tickT = z.tick;
          this.areaHit(z.owner, z.slot, z.x, z.y, z.r, 1);
        }
        if (z.t >= z.delay + z.duration) z.active = false;
      }
    }
  }

  // ───────────────────────────── damage & status ─────────────────────────────

  /** Accuracy check (melee / beam / dash only — projectiles and areas are dodged spatially). Emits "Trượt!". */
  private rollMiss(src: Unit, dst: Unit, s: SkillDef): boolean {
    if (s.accuracy == null || s.accuracy >= 100) return false;
    if (s.kind === 'projectile' || s.kind === 'aoe' || s.kind === 'field') return false;
    if (this.rng.next() * 100 < s.accuracy) return false;
    this.emit({ t: 'status', x: dst.x, y: dst.y - dst.radius, kind: 'miss', team: dst.team });
    void src;
    return true;
  }

  private hit(src: Unit, dst: Unit, slot: SkillSlot, mult: number): void {
    if (!dst.alive || dst.fainted || dst.captured) return;
    const s = slot.def;
    if (this.rollMiss(src, dst, s)) return;
    // Static-style passives punish melee attackers
    if (dst.passive?.kind === 'contactStatus' && dst.passive.status && (s.kind === 'melee' || s.kind === 'dash') && src.team !== dst.team && this.rng.chance(dst.passive.status.chance)) {
      this.applyStatus(src, dst.passive.status, dst);
    }
    // Rocky Helmet: contact attackers take a fraction of their own max HP
    if (dst.held?.type === 'rockyHelmet' && (s.kind === 'melee' || s.kind === 'dash') && src.team !== dst.team && dst.heldCd <= 0 && src.alive && !src.fainted) {
      dst.heldCd = 1;
      this.applyDamage(src, src.maxHp * (src.kind === 'boss' ? 1 / 30 : dst.held.value ?? 1 / 6), dst, false, 1, true);
    }
    if (s.power > 0) {
      let modifier = mult * (1 + slot.powerBonus);
      if (src.team === 'ally' && src.kind === 'pokemon') modifier *= 1 + this.mods.dmgMult;
      const atkUp = this.getStatus(src, 'atkUp');
      if (atkUp) modifier *= 1 + atkUp.magnitude;
      const wm = this.weatherMods[s.type];
      if (wm) modifier *= wm;
      if (src.alpha) modifier *= 1.25;
      // Burn halves physical damage (Guts ignores it, as in the main series)
      if (s.category === 'physical' && this.hasStatus(src, 'burn') && src.passive?.kind !== 'guts') modifier *= 0.5;
      const defDown = this.getStatus(dst, 'defDown');
      if (defDown) modifier *= 1 + defDown.magnitude;
      const pv = src.passive;
      if (pv?.kind === 'pinch' && s.type === pv.type && src.hp / src.maxHp < (pv.threshold ?? 0.33)) modifier *= pv.mult ?? 1.5;
      if (pv?.kind === 'guts' && src.statuses.length) modifier *= pv.mult ?? 1.5;
      if (pv?.kind === 'typeBoost' && s.type === pv.type) modifier *= pv.mult ?? 1.5;
      if (pv?.kind === 'meleeBoost' && (s.kind === 'melee' || s.kind === 'dash')) modifier *= pv.mult ?? 1.3;
      if (pv?.kind === 'projectileBoost' && (s.kind === 'projectile' || s.kind === 'beam')) modifier *= pv.mult ?? 1.5;
      const dp = dst.passive;
      if (dp?.kind === 'typeResist' && dp.types?.includes(s.type)) modifier *= dp.mult ?? 0.5;
      const he = src.held;
      if (he?.type === 'typeBoost' && he.pokeType === s.type) modifier *= he.mult ?? 1.2;
      if (he?.type === 'categoryBoost' && he.category === s.category) modifier *= he.mult ?? 1.1;
      if (he?.type === 'superEffective' && effectiveness(s.type, dst.types) > 1) modifier *= he.mult ?? 1.2;
      if (he?.type === 'lifeOrb') modifier *= he.mult ?? 1.3;
      if (he?.type === 'choice' && he.category === s.category) modifier *= he.mult ?? 1.5;
      const dh = dst.held;
      if (dh?.type === 'assaultVest' && s.category === 'special') modifier /= dh.mult ?? 1.5;
      if (dh?.type === 'eviolite' && canStillEvolve(dst.defId)) modifier /= dh.mult ?? 1.5;
      // Ally pokemon can't one-shot the trainer etc. — enemy damage to the trainer is scaled slightly down for readability
      if (dst.kind === 'trainer') modifier *= 0.8;
      else if (dst.kind === 'pokemon') modifier *= 0.7;
      // Survivor: type synergy of the party + Elemental Combos on status-afflicted targets
      let combo: ComboDef | null = null;
      if (this.mode === 'survivor' && src.team === 'ally') {
        modifier *= 1 + (this.synergy.byType[s.type] ?? 0) + this.synergy.all;
        if ((this.comboUntil.get(dst.id) ?? -1) <= this.time && dst.statuses.length) {
          combo = findCombo(s.type, dst.statuses.map((x) => x.kind));
          if (combo) { modifier *= combo.mult; this.comboUntil.set(dst.id, this.time + COMBO_COOLDOWN); }
        }
      }
      const crit = src.critRate + (s.critBonus ?? 0) + (src.team === 'ally' ? this.mods.critBonus : 0) + (pv?.kind === 'critBonus' ? pv.value ?? 0 : 0) + (src.held?.type === 'crit' ? src.held.value ?? 0 : 0);
      const res = computeDamage({
        level: src.level, power: s.power, category: s.category, skillType: s.type,
        attackerTypes: src.types, defenderTypes: dst.types,
        atk: src.stats.atk, spa: src.stats.spa, def: dst.stats.def, spd: dst.stats.spd,
        critRoll: this.rng.next(), critRate: crit, varianceRoll: this.rng.next(), modifier,
      });
      this.applyDamage(dst, res.amount, src, res.crit, res.effectiveness);
      if (he?.type === 'lifeOrb' && res.amount > 0 && src.heldCd <= 0 && !src.fainted) {
        src.heldCd = 0.6;
        const recoil = Math.min(src.hp - 1, src.maxHp * (he.value ?? 0.1));
        if (recoil > 0) {
          src.hp -= recoil;
          this.emit({ t: 'dmg', x: src.x, y: src.y - src.radius, amount: Math.round(recoil), crit: false, eff: 1, victimTeam: src.team });
        }
      }
      if (combo) this.comboEffects(src, dst, combo, res.amount, s.type);
      // per-type impact where the hit lands (projectiles already emit `<vfx>_hit`)
      if (res.amount > 0 && s.kind !== 'projectile' && this.impactBudget-- > 0) this.emit({ t: 'vfx', name: 'impact_type', x: dst.x, y: dst.y - dst.radius * 0.3, r: 18 + Math.min(14, s.power / 8), type: s.type });
      const drain = (s.drain ?? 0) + (src.held?.type === 'drain' ? src.held.value ?? 0 : 0);
      if (drain > 0 && res.amount > 0 && !src.fainted) this.heal(src, res.amount * drain);
      // Fire thaws a frozen target
      if (s.type === 'fire' && this.hasStatus(dst, 'freeze')) this.cureStatus(dst, 'freeze', 'thaw');
      // Flinch: skill chance + King's Rock style held item
      const fl = (s.flinch ?? 0) + (src.held?.type === 'flinch' ? src.held.value ?? 0 : 0);
      if (fl > 0 && res.amount > 0 && this.rng.chance(fl)) this.applyStatus(dst, { kind: 'flinch', chance: 1, duration: 0.45, magnitude: 0 }, src);
    }
    if (s.status && s.kind !== 'shield' && s.kind !== 'buff' && s.kind !== 'debuff' && this.rng.chance(s.status.chance)) this.applyStatus(dst, s.status, src);
  }

  applyDamage(dst: Unit, amount: number, src: Unit | null, crit = false, eff = 1, dot = false): void {
    if (!dst.alive || dst.fainted || dst.captured) return;
    let dmg = amount;
    // Real-time sleep: a direct hit wakes the target once the short grace period has passed
    if (!dot && amount > 0) { const sl = this.getStatus(dst, 'sleep'); if (sl && sl.age >= SLEEP_WAKE_GRACE) this.cureStatus(dst, 'sleep', 'wake'); }
    if (dst.wild && src && src.team !== dst.team) {
      dst.hostile = true;
      dst.wild.lastAttacker = src;
    }
    if (dst.shield > 0) {
      const absorbed = Math.min(dst.shield, dmg);
      dst.shield -= absorbed;
      dmg -= absorbed;
    }
    const pm = dst.boss?.pm;
    if (pm) {
      // phase machine: invulnerable while transitioning / airborne, HP clamped at the next threshold
      if (pm.invulnerable || rayAirborne(dst) || pm.state === 'WEAKENED') {
        if (amount > 0 && this.impactBudget-- > 0) this.emit({ t: 'status', x: dst.x, y: dst.y - dst.radius, kind: 'immune', team: dst.team });
        return;
      }
      const next = pm.damage(dst.hp, dst.maxHp, dmg);
      dmg = dst.hp - next;
    }
    const wasFull = dst.hp >= dst.maxHp;
    dst.hp -= dmg;
    if (dst.hp <= 0 && dst.held?.type === 'sash' && wasFull && dst.maxHp > 1) {
      dst.hp = 1;
      this.emit({ t: 'banner', text: `${dst.name} trụ lại nhờ Focus Sash!`, color: '#ffb080' });
    }
    if (dst.hp > 0 && dst.held?.type === 'sitrus' && dst.berryCd <= 0 && dst.hp < dst.maxHp * 0.5) {
      dst.berryCd = 45;
      this.heal(dst, dst.maxHp * (dst.held.value ?? 0.25));
    }
    if (dst.hp <= 0 && dst.held?.type === 'focus' && dst.hp + dmg > 1 && this.rng.chance(dst.held.value ?? 0)) {
      dst.hp = 1;
      this.emit({ t: 'banner', text: `${dst.name} trụ lại nhờ Focus Band!`, color: '#ffb080' });
    }
    if (dst.hp <= 0 && dst.passive?.kind === 'sturdy' && dst.sturdyCd <= 0 && dst.hp + dmg > 1) {
      dst.hp = 1;
      dst.sturdyCd = dst.passive.value ?? 30;
      this.emit({ t: 'vfx', name: 'shield', x: dst.x, y: dst.y, r: dst.radius + 10 });
    }
    dst.hitFlash = 0.12;
    if (src && src.kind === 'pokemon') src.damageDealt += dmg;
    this.emit({ t: 'dmg', x: dst.x, y: dst.y - dst.radius, amount: Math.round(amount), crit, eff, victimTeam: dst.team });
    if (dst.hp > 0) return;
    dst.hp = 0;
    if (dst.kind === 'trainer') return;
    if (dst.kind === 'pokemon') {
      dst.fainted = true;
      dst.reviveT = this.reviveTime;
      dst.castSlot = -1; dst.dash = null; dst.statuses.length = 0; dst.shield = 0;
      this.emit({ t: 'faint', id: dst.id, name: dst.name });
      return;
    }
    this.killEnemy(dst);
  }

  private killEnemy(e: Unit): void {
    e.alive = false;
    this.kills++;
    this.emit({ t: 'death', x: e.x, y: e.y, defId: e.defId, elite: e.elite, boss: e.kind === 'boss', id: e.id, level: e.level, wild: !!e.wild, tag: e.tag });
    if (this.mode === 'adventure') {
      // Adventure rewards (EXP, quests, loot) are handled by the scene from the death event
      if (this.boss === e) this.boss = null;
      if (e.kind === 'boss') this.bossesDefeated++;
      return;
    }
    const value = Math.max(1, Math.round(e.exp * (1 + e.level * 0.06) * (e.elite ? 5 : 1)));
    if (e.kind === 'boss') {
      for (let i = 0; i < 24; i++) this.dropGem(e.x + this.rng.range(-90, 90), e.y + this.rng.range(-90, 90), Math.ceil(value / 6), 'exp');
      this.dropGem(e.x, e.y, 0, 'berry');
      this.boss = null;
      this.bossesDefeated++;
      this.pendingBossRewards++;
      this.emit({ t: 'banner', text: `Đã hạ ${e.name}! Phần thưởng hiếm`, color: '#ffe066' });
      this.emit({ t: 'shake', intensity: 0.02, duration: 700 });
      this.emit({ t: 'sfx', name: 'victory' });
      for (const a of this.allies) if (!a.fainted) this.heal(a, a.maxHp * 0.5);
      if (e.boss?.final) {
        this.victoryT = 2.5;
        for (const o of this.enemies) if (o.alive && o !== e) { o.alive = false; this.emit({ t: 'death', x: o.x, y: o.y, defId: o.defId, elite: false, boss: false }); }
      }
      return;
    }
    this.dropGem(e.x, e.y, value, 'exp');
    if (this.rng.chance(e.elite ? 0.5 : 0.006)) this.dropGem(e.x + 10, e.y, 0, 'berry');
  }

  heal(u: Unit, amount: number): void {
    const before = u.hp;
    u.hp = Math.min(u.maxHp, Math.round(u.hp + amount));
    const healed = Math.round(u.hp - before);
    if (healed > 0) {
      this.emit({ t: 'heal', x: u.x, y: u.y - u.radius, amount: healed, team: u.team });
      this.emit({ t: 'vfx', name: 'heal', x: u.x, y: u.y });
    }
  }

  /**
   * Applies a status with the real-time rules: type & ability immunities, one major status at a time,
   * flinch immunity window, boss resistance, bounded duration, no unlimited stacking (refresh instead).
   */
  applyStatus(u: Unit, a: StatusApply, src: Unit | null): void {
    if (!u.alive || u.fainted || u.kind === 'trainer' && (a.kind === 'sleep' || a.kind === 'freeze' || a.kind === 'confusion')) return;
    const hostile = !!src && src.team !== u.team;
    if (u.passive?.kind === 'statusImmune' && hostile && u.passive.immune?.includes(a.kind)) return;
    if (TYPE_STATUS_IMMUNITY[a.kind]?.some((t) => u.types.includes(t))) {
      if (hostile && a.chance >= 1) this.emit({ t: 'status', x: u.x, y: u.y - u.radius, kind: 'immune', team: u.team });
      return;
    }
    if (a.kind === 'flinch') {
      if (u.flinchImmuneT > 0) return;
      u.flinchImmuneT = FLINCH_IMMUNITY;
      u.castSlot = -1; // the flinch interrupts the wind-up
    }
    const major = MAJOR_STATUS.includes(a.kind);
    if (major && u.statuses.some((s) => s.kind !== a.kind && MAJOR_STATUS.includes(s.kind))) return;
    let duration = Math.min(MAX_STATUS_DURATION, a.duration);
    if (u.kind === 'boss') duration *= INCAPACITATING.includes(a.kind) ? 0.35 : a.kind === 'paralysis' || a.kind === 'slow' ? 0.5 : 1;
    const existing = this.getStatus(u, a.kind);
    if (existing) {
      existing.t = Math.max(existing.t, duration);
      existing.magnitude = Math.max(existing.magnitude, a.magnitude);
      existing.source = src;
      return;
    }
    if (u.statuses.length >= 6) return;
    u.statuses.push({ kind: a.kind, t: duration, magnitude: a.magnitude, source: src, tick: 0.5, age: 0 });
    if (a.kind !== 'atkUp' && a.kind !== 'defDown') this.emit({ t: 'status', x: u.x, y: u.y - u.radius, kind: a.kind, team: u.team });
  }

  /** Removes a status early (wake-up, thaw, items) with feedback. */
  cureStatus(u: Unit, k: StatusKind, fx?: 'wake' | 'thaw'): void {
    const i = u.statuses.findIndex((s) => s.kind === k);
    if (i < 0) return;
    u.statuses.splice(i, 1);
    if (fx) this.emit({ t: 'status', x: u.x, y: u.y - u.radius, kind: fx, team: u.team });
  }

  incapacitated(u: Unit): boolean {
    for (const s of u.statuses) if (INCAPACITATING.includes(s.kind)) return true;
    return false;
  }

  getStatus(u: Unit, k: StatusKind): Status | undefined {
    for (const s of u.statuses) if (s.kind === k) return s;
    return undefined;
  }

  hasStatus(u: Unit, k: StatusKind): boolean {
    return !!this.getStatus(u, k);
  }

  slowFactor(u: Unit): number {
    const s = this.getStatus(u, 'slow');
    const p = this.getStatus(u, 'paralysis');
    const slow = Math.max(s ? s.magnitude : 0, p ? p.magnitude : 0, u.envSlow);
    return 1 - Math.min(0.7, slow);
  }

  /** Slow status combined with move-speed passives (Chlorophyll). */
  speedFactor(u: Unit): number {
    const scarf = u.held?.type === 'choice' && !u.held.category ? 1 + (u.held.value ?? 0) : 1;
    return this.slowFactor(u) * scarf * (u.passive?.kind === 'moveSpeed' ? 1 + (u.passive.value ?? 0) : 1);
  }

  private updateStatuses(dt: number): void {
    const tickUnit = (u: Unit) => {
      if (!u.statuses.length) return;
      for (let i = u.statuses.length - 1; i >= 0; i--) {
        const s = u.statuses[i];
        s.t -= dt;
        s.age += dt;
        if (s.kind === 'burn' || s.kind === 'poison' || s.kind === 'badPoison' || s.kind === 'leech') {
          s.tick -= dt;
          if (s.tick <= 0) {
            s.tick = 0.5;
            // DoT is % max HP; bosses and elites resist so DoT can't trivialise them.
            // Badly poisoned (Toxic) ramps up every second, capped at ×4.
            const resist = u.kind === 'boss' ? 0.06 : u.elite ? 0.4 : 1;
            const ramp = s.kind === 'badPoison' ? Math.min(4, 1 + Math.floor(s.age)) : 1;
            const dmg = Math.max(1, Math.round(u.maxHp * s.magnitude * 0.5 * resist * ramp));
            this.applyDamage(u, dmg, s.source, false, 1, true);
            if (s.kind === 'leech' && s.source && !s.source.fainted) this.heal(s.source, dmg);
            // fainting from the DoT clears every status: stop walking the (now empty) list
            if (u.fainted || !u.alive) return;
          }
        }
        if (s.t <= 0) u.statuses.splice(i, 1);
      }
    };
    for (const e of this.enemies) if (e.alive) tickUnit(e);
    for (const side of this.sides()) {
      for (const a of side.allies) if (!a.fainted) tickUnit(a);
      tickUnit(side.trainer);
    }
  }

  // ───────────────────────────── EXP & level ─────────────────────────────

  private dropGem(x: number, y: number, value: number, kind: 'exp' | 'berry'): void {
    let g = this.gems.find((q) => !q.active);
    if (!g) {
      if (this.gems.length >= MAX_GEMS) {
        // Merge into a random existing gem to keep the count bounded
        const m = this.gems[this.rng.int(0, this.gems.length - 1)];
        if (m.kind === 'exp') m.value += value;
        return;
      }
      g = { active: false, x: 0, y: 0, value: 0, pulled: false, kind: 'exp' };
      this.gems.push(g);
    }
    Object.assign(g, { active: true, x, y, value, pulled: false, kind });
  }

  private updateGems(dt: number): void {
    const magnet = 115 * (1 + this.mods.magnet);
    for (const g of this.gems) {
      if (!g.active) continue;
      const t = this.companion && this.companion.trainer.hp > 0 && (this.trainer.hp <= 0 || dist2(this.companion.trainer, g.x, g.y) < dist2(this.trainer, g.x, g.y)) ? this.companion.trainer : this.trainer;
      if (t.hp <= 0) continue;
      const dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy);
      if (!g.pulled && d < magnet) g.pulled = true;
      if (g.pulled) {
        const sp = Math.max(320, 600 - d) * dt;
        g.x += (dx / (d || 1)) * Math.min(sp, d);
        g.y += (dy / (d || 1)) * Math.min(sp, d);
      }
      if (d < t.radius + 10) {
        g.active = false;
        if (g.kind === 'berry') {
          this.heal(t, t.maxHp * 0.25);
          for (const a of this.allies) if (!a.fainted) this.heal(a, a.maxHp * 0.25);
          this.emit({ t: 'sfx', name: 'heal' });
        } else this.gainExp(g.value);
      }
    }
  }

  gainExp(v: number): void {
    this.exp += v;
    this.emit({ t: 'sfx', name: 'gem' });
    while (this.exp >= this.expNext) {
      this.exp -= this.expNext;
      this.level++;
      this.expNext = expToNext(this.level);
      this.pendingLevelUps++;
      for (const a of this.sides().flatMap(s => s.allies)) {
        a.level = 4 + this.level;
        this.refreshAllyStats(a);
        if (!a.fainted) a.hp = Math.min(a.maxHp, a.hp + Math.round(a.maxHp * 0.1));
      }
      this.refreshTrainerStats(this.trainer);
      if (this.companion) this.refreshTrainerStats(this.companion.trainer);
      this.emit({ t: 'levelup', level: this.level });
      this.emit({ t: 'sfx', name: 'levelup' });
    }
  }

  private openLevelUp(): void {
    const boss = this.pendingBossRewards > 0;
    this.currentOffers = rollOffers(this.runView(), this.rng, 3, boss ? 'epic' : 'common');
    this.state = 'levelup';
  }

  runView(): RunView {
    const inParty = new Set(this.allies.map((a) => a.defId));
    return {
      mods: this.mods,
      party: this.allies.map((a) => ({ uid: a.id, defId: a.defId, name: a.name, level: a.level, mega: !!a.megaFrom || !!POKEMON.get(a.defId)?.mega, skills: a.skills.map((s) => ({ id: s.def.id, name: s.def.name, level: s.level })) })),
      recruitable: this.recruitPool.filter((id) => POKEMON.has(id) && !inParty.has(id)),
    };
  }

  /** Applies one of `currentOffers`. Returns false if the offer isn't currently valid. */
  chooseOffer(index: number): boolean {
    if (this.state !== 'levelup') return false;
    const o = this.currentOffers[index];
    if (!o) return false;
    switch (o.kind) {
      case 'stat': {
        const cfg = UPGRADES.stats.find((s) => s.stat === o.stat)!;
        this.mods[o.stat] = Math.min(cfg.cap, Math.round((this.mods[o.stat] + o.value) * 100) / 100);
        if (o.stat === 'hpMult') {
          for (const side of this.sides()) {
            for (const a of side.allies) this.refreshAllyStats(a);
            this.refreshTrainerStats(side.trainer);
          }
        }
        break;
      }
      case 'pokemon': {
        if (this.allies.length >= UPGRADES.maxParty) return false;
        const u = this.addPokemon(o.pokemonId);
        this.emit({ t: 'banner', text: `${u.name} đã gia nhập đội!`, color: '#7fe07f' });
        this.emit({ t: 'vfx', name: 'heal', x: u.x, y: u.y });
        break;
      }
      case 'skill': {
        const u = this.allies.find((a) => a.id === o.unitUid);
        const s = u?.skills[o.slot];
        if (!s || s.level >= UPGRADES.maxSkillLevel) return false;
        s.level++;
        s.powerBonus = Math.round((s.powerBonus + o.powerBonus) * 100) / 100;
        break;
      }
      case 'heal': {
        this.heal(this.trainer, this.trainer.maxHp * o.amount);
        for (const a of this.allies) if (!a.fainted) this.heal(a, a.maxHp * o.amount);
        break;
      }
      case 'evolve': {
        const u = this.allies.find((a) => a.id === o.unitUid);
        if (!u || !POKEMON.has(o.to)) return false;
        const from = u.name;
        this.transformAlly(u, o.to, { mega: o.mega });
        this.emit({ t: 'banner', text: o.mega ? `${from} Mega Tiến Hóa → ${u.name}!` : `${from} tiến hóa thành ${u.name}!`, color: o.mega ? '#ff80e0' : '#a0ffa0' });
        this.emit({ t: 'sfx', name: 'levelup' });
        break;
      }
    }
    if (this.pendingBossRewards > 0) this.pendingBossRewards--;
    else if (this.pendingLevelUps > 0) this.pendingLevelUps--;
    this.currentOffers = [];
    this.state = 'playing';
    if (this.pendingLevelUps > 0 || this.pendingBossRewards > 0) this.openLevelUp();
    return true;
  }

  // ───────────────────────────── physics helpers ─────────────────────────────

  collide(u: Unit): void {
    this.scratchObs.length = 0;
    for (const o of this.obstacleGrid.query(u.x, u.y, u.radius + 40, this.scratchObs)) {
      const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy), min = o.r + u.radius;
      if (d < min && d > 0.001) { u.x = o.x + (dx / d) * min; u.y = o.y + (dy / d) * min; }
    }
    u.x = clamp(u.x, u.radius + 10, this.width - u.radius - 10);
    u.y = clamp(u.y, u.radius + 10, this.height - u.radius - 10);
    if (!this.terrain) return;
    const block = (x: number, y: number) => this.terrainBlocks(u, x, y);
    if (block(u.x, u.y)) {
      // Axis-separated slide: keep whichever axis is free so units glide along walls/water
      if (!block(u.x, u.lastY)) u.y = u.lastY;
      else if (!block(u.lastX, u.y)) u.x = u.lastX;
      else { u.x = u.lastX; u.y = u.lastY; }
    }
  }

  /** Swimmers are blocked by land, everyone else by walls / water. */
  private terrainBlocks(u: Unit, x: number, y: number): boolean {
    const t = this.terrain;
    if (!t) return false;
    return u.aquatic && t.isWater ? !t.isWater(x, y) : t.blocksMove(x, y);
  }

  private cleanup(): void {
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) this.enemies[w++] = e;
    }
    this.enemies.length = w;
    if (this.mode === 'adventure') return;
    // Despawn stragglers that are very far away so they can respawn near the action
    for (const e of this.enemies) {
      if (e.kind === 'boss') continue;
      if (Math.abs(e.x - this.trainer.x) > 1300 || Math.abs(e.y - this.trainer.y) > 1300) {
        const p = this.edgePoint();
        e.x = p.x; e.y = p.y;
      }
    }
  }
}

function newSide(trainer: Unit): Side {
  return { trainer, allies: [], command: 'auto', commandTarget: null, holdX: 0, holdY: 0, input: { x: 0, y: 0 }, run: false, bench: [], switchCd: 0, autoSendT: DUEL_AUTO_SEND, megaUsed: false };
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function dist2(u: Unit, x: number, y: number): number {
  const dx = u.x - x, dy = u.y - y;
  return dx * dx + dy * dy;
}
function t2(u: Unit): boolean {
  return u.alive && !u.fainted;
}

const contactCache = new Map<string, SkillDef>();
function CONTACT_SKILL(e: Unit): SkillDef {
  const key = e.defId;
  let s = contactCache.get(key);
  if (!s) {
    s = {
      id: 'contact_' + key, name: 'Contact', type: e.types[0] ?? 'normal', category: 'physical', kind: 'melee',
      power: e.contactPower, cooldown: 0.8, energyCost: 0, castTime: 0, range: 0, target: 'enemy', anim: 'lunge', vfx: 'impact', sfx: 'hurt',
    };
    contactCache.set(key, s);
  }
  return s;
}



const EVOLVES = new Map<string, boolean>();
/** Eviolite: the species has at least one evolution the game supports. */
function canStillEvolve(defId: string): boolean {
  let v = EVOLVES.get(defId);
  if (v === undefined) EVOLVES.set(defId, (v = evolutionsOf(defId).some((e) => !e.unsupported)));
  return v;
}
