// Shared data-model types. Pure TS: no Phaser imports anywhere under src/core.

export const POKE_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type PokeType = (typeof POKE_TYPES)[number];

export type Role = 'tank' | 'fighter' | 'assassin' | 'marksman' | 'mage' | 'support';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Team = 'ally' | 'enemy';

export type SkillKind =
  | 'projectile' | 'melee' | 'aoe' | 'cone' | 'field' | 'beam' | 'dash' | 'heal' | 'shield' | 'buff' | 'debuff' | 'summon';
export type Category = 'physical' | 'special' | 'status';
export type TargetRule = 'enemy' | 'cluster' | 'self' | 'lowestAlly' | 'allAllies';

export type StatusKind =
  | 'burn' | 'poison' | 'badPoison' | 'paralysis' | 'sleep' | 'freeze' // major (one at a time)
  | 'confusion' | 'flinch' | 'slow' | 'stun' | 'atkUp' | 'defDown' | 'leech' | 'taunt'; // volatile

export interface StatusApply {
  kind: StatusKind;
  chance: number; // 0..1
  duration: number; // seconds
  magnitude: number; // dot: fraction of max hp per second; slow: fraction; buffs: multiplier delta
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface SkillDef {
  id: string;
  name: string;
  type: PokeType;
  category: Category;
  kind: SkillKind;
  power: number;
  cooldown: number;
  energyCost: number;
  castTime: number;
  range: number;
  target: TargetRule;
  /** Hit radius for melee/aoe/field, beam half-width */
  radius?: number;
  projectile?: { speed: number; count: number; spread: number; pierce: number; size: number };
  beam?: { length: number };
  /** Cone attacks: half-angle (rad) — `range` is the cone length */
  cone?: { spread: number };
  dash?: { distance: number; speed: number };
  field?: { duration: number; tick: number };
  /** Delay between telegraph and impact (enemy/boss skills) */
  telegraph?: number;
  heal?: number; // fraction of target max hp
  shield?: number; // fraction of caster max hp
  /** Fraction of damage dealt that heals the attacker (Absorb, Leech Life) */
  drain?: number;
  status?: StatusApply;
  critBonus?: number;
  /** PokéAPI accuracy (%). Checked for melee/beam/dash hits; projectiles & areas are dodged spatially. Omitted = never misses */
  accuracy?: number;
  /** Chance (0..1) to make the target flinch (interrupts its cast) */
  flinch?: number;
  anim: 'cast' | 'lunge' | 'spin' | 'shell';
  vfx: string;
  sfx: string;
}

export type PassiveKind =
  | 'pinch' // Blaze/Torrent/Overgrow: boost `type` skills by `mult` below `threshold` HP
  | 'critBonus' // Keen Eye: +`value` crit rate
  | 'guts' // +`mult` damage while afflicted by any status
  | 'sturdy' // survive a lethal hit at 1 HP (internal cooldown `value` s)
  | 'moveSpeed' // Chlorophyll: +`value` move speed
  | 'statusImmune' // Shield Dust / Inner Focus: immune to `immune` statuses from enemies
  | 'contactStatus' // Static: melee/dash attackers get `status`
  | 'typeResist' // Thick Fat: damage from `types` x `mult`
  | 'meleeBoost' // Tough Claws: melee/dash x `mult`
  | 'projectileBoost' // Mega Launcher: projectile/beam x `mult`
  | 'typeBoost'; // Drought: `type` skills x `mult` (always on)

export interface PassiveDef {
  id: string;
  name: string;
  description: string;
  kind: PassiveKind;
  type?: PokeType;
  mult?: number;
  threshold?: number;
  value?: number;
  immune?: StatusKind[];
  status?: StatusApply;
  types?: PokeType[];
}

export interface PokemonDef {
  id: string;
  name: string;
  types: PokeType[];
  rarity: Rarity;
  role: Role;
  baseStats: BaseStats;
  moveSpeed: number;
  attackRange: number;
  critRate: number;
  radius: number;
  skills: string[];
  passive: PassiveDef;
  evolution: { into: string; level: number } | null;
  /** Mega forms: not catchable/spawnable, entered temporarily from `base` while holding `stone` */
  /** bossOnly: a form a boss changes into (Mega Rayquaza) — never reachable by the player */
  /** Mega form (or, with `primal`, a Primal form: automatic in battle while its orb is in the bag — V31) */
  mega?: { base: string; stone: string; bossOnly?: boolean; primal?: boolean };
  /** Original species not in PokeAPI (IcyEthics fakemon) */
  fakemon?: boolean;
  /** Produced by scripts/build-dex.mjs from PokéAPI data (not hand-tuned) */
  generated?: boolean;
  /** Sprite source: procedural pixel map (default) or an IcyEthics PNG converted at boot */
  art?: 'pixel' | 'icyethics';
  sprite: string;
  animation: { walk: string; cast: string };
  vfx: { hit: string; aura: string };
}

export type EnemyBehavior = 'melee' | 'ranged' | 'charger' | 'tank' | 'support' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  types: PokeType[];
  behavior: EnemyBehavior;
  baseStats: BaseStats;
  moveSpeed: number;
  radius: number;
  contactPower: number;
  skills: string[];
  exp: number;
  sprite: string;
  /** Minimum run time (seconds) before this enemy can spawn */
  unlockAt: number;
  weight: number;
}

export interface LegendConfig {
  /** Charged line attack */
  beam: string;
  /** Barrage of circles at predicted target positions */
  volley: string;
  /** Point-blank burst around the boss */
  nova: string;
  /** Lingering hazard field */
  field: string;
  fieldStatus?: StatusApply;
  /** Phase-3 signature attack */
  ultimate: string;
  ultimateName: string;
  ultimateStyle: 'safe' | 'storm' | 'spokes' | 'mixed' | 'timestop' | 'rift' | 'judgment';
  /** Circle-strafes at range and ignores terrain (birds) */
  flying?: boolean;
  /** Teleports around the arena every few seconds (Mewtwo, Mew) */
  blink?: boolean;
  /** Multiplier on every pattern's power (tuned so one hit stays below ~30% of a matching-level ally) */
  power?: number;
}

export interface BossDef {
  id: string;
  name: string;
  types: PokeType[];
  baseStats: BaseStats;
  moveSpeed: number;
  radius: number;
  contactPower: number;
  hpMult: number;
  segments: number;
  skills: string[];
  phase2Threshold: number;
  phase2Summon: { enemy: string; count: number };
  /** Boss AI pattern set (default 'onix') */
  ai?: 'onix' | 'venusaur' | 'legendary';
  /** Pattern config for ai 'legendary' (skill ids are looked up in SKILLS) */
  legend?: LegendConfig;
  phase3Threshold?: number;
  phase3Banner?: string;
  /** Display scale of the boss sprite */
  scale?: number;
  /** Can appear in Survivor runs (world bosses are Adventure-only) */
  survivor?: boolean;
  /** false: never a capture window, even with the legendary AI (dungeon bosses) */
  capture?: boolean;
  exp: number;
  sprite: string;
}
