import type { PokeType } from '../core/types';
import { getSkill } from '../core/data';
import { World, type Unit, type WorldEvent, type WorldState } from '../core/world';
import { cleanAvatarId } from '../core/avatars';
import { RULESETS, validateParty, shareableEvents } from './duel';
import { net } from './session';
import type { NetMsg, SkillWire } from './protocol';
import { applySkills, packSkills, remoteSlot } from './skillWire';
import { LootLedger, type CoopLoot } from './coopRewards';
import { type Wallet, WALLETS } from '../core/wallet';
import { CoopEventDirector, type CoopEventView } from '../core/coopEvents';
import { FIELD } from '../core/fieldRules';

export interface CoopMap {
  kind: 'survivor' | 'region' | 'dungeon';
  id: string;
  width: number;
  height: number;
  doors?: [boolean, boolean];
}
const UNIT_FIELDS = ['id', 'team', 'kind', 'defId', 'avatar', 'name', 'types', 'x', 'y', 'vx', 'vy', 'radius', 'facing', 'level', 'maxHp', 'hp', 'energy', 'maxEnergy', 'castSlot', 'castT', 'shield', 'alive', 'fainted', 'hitFlash', 'iframes', 'elite', 'animCast', 'lastSkill', 'shiny', 'alpha', 'hostile', 'captured', 'megaFrom', 'tera', 'dyna', 'moveSpeed'] as const;
type VisualUnit = Pick<Unit, typeof UNIT_FIELDS[number]> & { boss: Unit['boss']; statuses: Unit['statuses'] };
export interface CoopSnapshot {
  epoch: string; n: number; map: CoopMap; time: number; state: WorldState; paused: boolean;
  level: number; kills: number;
  home: VisualUnit[]; guest: VisualUnit[]; enemies: VisualUnit[];
  projectiles: { x: number; y: number; vx: number; vy: number; r: number; team: Unit['team']; skill: string }[];
  zones: (Omit<World['zones'][number], 'owner' | 'slot'> & { skill: string })[];
  gems: World['gems']; obstacles: World['obstacles']; events: WorldEvent[];
  challenge?: CoopEventView | null;
  /** signature of `obstacles` (static scenery: sent only when the guest does not have this version) */
  obsSig?: string;
  /** last guest input (coopInput.seq) the host had applied, and how long it had been waiting for this snapshot (ms) */
  ack?: number;
  hold?: number;
  /** keyframe sent without the obstacle list: the guest keeps the one it has (same obsSig) */
  noObs?: boolean;
  /** skill bars of the guest's Pokémon and the guest side's global skill cooldown (active skills) */
  skl?: SkillWire[];
  gcd?: number;
  /** Adventure co-op: the guest's Pokémon waiting in their balls (one is on the field) and its switch cooldown */
  gb?: GuestBenchMon[];
  gsw?: number;
}
export interface GuestBenchMon { id: number; defId: string; name: string; level: number; hp: number; maxHp: number; fainted: boolean; shiny: boolean; types: string[] }
/**
 * Between keyframes the host sends only what changed since the previous snapshot: the ordered unit ids of each side
 * and, per unit, the fields whose value changed. Static fields (name, types, max HP…) and the map's obstacles cost
 * nothing after the first keyframe. WebSocket / WebRTC links are ordered, so a delta always follows its base; a guest
 * that missed one (reconnect, dropped buffer) ignores deltas until the next keyframe (≤ 1 s).
 */
export interface CoopDelta extends Omit<CoopSnapshot, 'home' | 'guest' | 'enemies' | 'gems' | 'obstacles'> {
  d: 1;
  base: number;
  ids: { home: number[]; guest: number[]; enemies: number[] };
  units: Record<number, Partial<VisualUnit>>;
  gems?: World['gems'];
}
export type CoopWire = CoopSnapshot | CoopDelta;
export const coopSession = { active: false };

/** every `KEYFRAME`-th snapshot is complete */
const KEYFRAME = 10;
/** x / y / velocities: 0.1 px is invisible; other fractions (timers, HP) keep 2 decimals */
const COARSE = new Set(['x', 'y', 'vx', 'vy']);
const round = (k: string, v: number) => Number.isInteger(v) ? v : COARSE.has(k) ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;

function visual(u: Unit): VisualUnit {
  const data: Record<string, unknown> = {};
  for (const k of UNIT_FIELDS) { const v = u[k]; data[k] = typeof v === 'number' ? round(k, v) : v; }
  // Strip live object references (targets, status sources, boss scripts) from the wire.
  return { ...data, statuses: u.statuses.map(s => ({ ...s, source: null })),
    boss: u.boss ? { def: u.boss.def, phase: u.boss.phase, form: u.boss.form, trail: u.boss.trail, weakened: u.boss.weakened } : null,
  } as VisualUnit;
}

export function obstacleSig(obs: World['obstacles']): string {
  let h = obs.length;
  for (const o of obs) h = (h * 31 + Math.round(o.x) * 7 + Math.round(o.y) * 13 + Math.round(o.r)) | 0;
  return `${obs.length}:${h >>> 0}`;
}

export function packCoop(w: World, map: CoopMap, epoch: string, n: number, paused: boolean, events: WorldEvent[] = []): CoopSnapshot {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    epoch, n, map, time: round('t', w.time), state: w.state, paused, level: w.level, kills: w.kills,
    home: [w.trainer, ...w.allies].map(visual), guest: w.companion ? [w.companion.trainer, ...w.companion.allies].map(visual) : [],
    enemies: w.enemies.filter(u => u.alive && !u.captured).map(visual),
    projectiles: w.projectiles.filter(p => p.active && p.skill).map(p => ({ x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), r: p.r, team: p.team, skill: p.skill!.id })),
    zones: w.zones.filter(z => z.active).map(({ owner: _o, slot, ...z }) => ({ ...z, x: r1(z.x), y: r1(z.y), skill: slot.def.id })),
    gems: w.gems.filter(g => g.active).map(g => ({ ...g, x: r1(g.x), y: r1(g.y) })), obstacles: w.obstacles.map(o => ({ ...o })), events: shareableEvents(events),
    ...(w.companion ? { skl: w.companion.allies.map((u) => packSkills(u)), gcd: r1(w.companion.manualCd) } : {}),
    ...(w.companion && w.adventureCombat ? {
      gb: w.companion.bench.map((u) => ({ id: u.id, defId: u.defId, name: u.name, level: u.level, hp: Math.round(u.hp), maxHp: u.maxHp, fainted: u.fainted, shiny: u.shiny, types: [...u.types] })),
      gsw: r1(Math.max(0, w.companion.switchCd)),
    } : {}),
  };
}

const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && JSON.stringify(a) === JSON.stringify(b));

/** What changed from `prev` to `next` (both complete snapshots of the same epoch). */
export function diffCoop(prev: CoopSnapshot, next: CoopSnapshot): CoopDelta {
  const before = new Map<number, VisualUnit>();
  for (const u of [...prev.home, ...prev.guest, ...prev.enemies]) before.set(u.id, u);
  const units: CoopDelta['units'] = {};
  for (const u of [...next.home, ...next.guest, ...next.enemies]) {
    const old = before.get(u.id);
    if (!old) { units[u.id] = u; continue; }
    let ch: Partial<VisualUnit> | null = null;
    for (const k of Object.keys(u) as (keyof VisualUnit)[]) if (!same(u[k], old[k])) (ch ??= {} as Partial<VisualUnit>)[k] = u[k] as never;
    if (ch) units[u.id] = ch;
  }
  const { home, guest, enemies, gems, obstacles: _o, ...top } = next;
  return {
    ...top, d: 1, base: prev.n,
    ids: { home: home.map(u => u.id), guest: guest.map(u => u.id), enemies: enemies.map(u => u.id) },
    units, ...(same(gems, prev.gems) ? {} : { gems }),
  };
}

/** Rebuilds the complete snapshot from the previous one + a delta; null if the delta does not follow `base`. */
export function applyCoopDelta(base: CoopSnapshot | null, d: CoopDelta): CoopSnapshot | null {
  if (!base || base.epoch !== d.epoch || base.n !== d.base) return null;
  const prev = new Map<number, VisualUnit>();
  for (const u of [...base.home, ...base.guest, ...base.enemies]) prev.set(u.id, u);
  const build = (ids: number[]) => ids.map(id => ({ ...prev.get(id), ...d.units[id] }) as VisualUnit);
  const { d: _d, base: _b, ids, units: _u, gems, ...top } = d;
  return { ...top, home: build(ids.home), guest: build(ids.guest), enemies: build(ids.enemies), gems: gems ?? base.gems, obstacles: base.obstacles, obsSig: d.obsSig ?? base.obsSig };
}

/** Only the host simulates. Guest packets contain intent, never damage or rewards. */
export class CoopHost {
  readonly challenges = new CoopEventDirector();
  private challengeTime: number;
  readonly epoch = `${Date.now()}-${Math.random()}`;
  private n = 0;
  private seq = -1;
  private lastInput = 0;
  private lastSend = 0;
  private events: WorldEvent[] = [];
  /** the last snapshot sent (deltas are made against it) */
  private sent: CoopSnapshot | null = null;
  /** obstacle version the guest reported in coopJoin, and when we last attached obstacles */
  private guestObs = '';
  private obsSentAt = -1e9;
  private off: () => void;
  private offStatus: () => void;
  /** currency of the host's mode: every grant pays the guest (and the host's own challenge reward) in it */
  private _wallet: Wallet = 'adventure';
  get wallet(): Wallet { return this._wallet; }
  set wallet(w: Wallet) { this._wallet = w; this.challenges.unit = WALLETS[w].unit; }
  constructor(readonly world: World, private map: () => CoopMap, private reward?: (loot: CoopLoot) => void) {
    this.challengeTime = world.time;
    this.off = net.on(m => this.receive(m));
    this.offStatus = net.onStatus(() => { if (!net.connected) world.removeCompanion(); });
  }
  private receive(m: NetMsg): void {
    if (!coopSession.active || net.role !== 'host') return;
    const w = this.world;
    if (m.t === 'coopJoin') {
      this.guestObs = typeof m.obs === 'string' ? m.obs : '';
      if (!w.companion) {
        if (validateParty(m.party, RULESETS.open).length) { net.send({ t: 'coopEnd', reason: 'Đội Pokémon không hợp lệ' }); return; }
        const side = w.addCompanion();
        // Survivor co-op: the guest's three Pokémon fight together. Adventure rules: up to six come along, one is out.
        const adventure = w.adventureCombat;
        m.party.slice(0, adventure ? FIELD.coopGuestCarry : 3).forEach((p, i) => w.addPokemon(p.species, {
          companion: true, level: w.mode === 'survivor' ? w.level + 4 : p.level, bench: adventure && i > 0,
          abilitySlot: p.abilitySlot, teraType: p.teraType as PokeType | undefined, held: p.held, shiny: p.shiny, ind: p.ivs && p.nature ? { ivs: p.ivs, nature: p.nature, evs: p.evs } : null,
        }));
        side.trainer.name = net.peerName || 'Đồng đội';
        side.trainer.avatar = cleanAvatarId(m.avatar ?? net.peerAvatar);
        this.seq = -1;
        this.lastInput = performance.now();
        this.sent = null; // a (re)joining guest starts from a keyframe
      } else {
        // the guest re-sends coopJoin every second: keep the lab/avatar in step with its live profile
        w.companion.trainer.name = net.peerName || 'Đồng đội';
        w.companion.trainer.avatar = cleanAvatarId(m.avatar ?? net.peerAvatar);
        // a guest without a usable base (it reconnected or ignored deltas) asks for a keyframe
        if (m.need) this.sent = null;
      }
    } else if (m.t === 'coopLootAck' && typeof m.id === 'string') {
      this.loot.ack(m.id);
    } else if (m.t === 'coopSwitch' && w.companion && m.epoch === this.epoch) {
      const side = w.companion, inc = side.bench.find((b) => b.id === m.unit) ?? null;
      const r = w.benchSwitch(side, inc, this.inCombat(side.trainer));
      if (r !== 'ok') net.send({ t: 'switchRes', r, cd: Math.round(side.switchCd * 10) / 10 });
    } else if ((m.t === 'coopSkill' || m.t === 'coopReserve') && w.companion && m.epoch === this.epoch) {
      const side = w.companion, u = side.allies.find((a) => a.id === m.unit);
      if (!u) return;
      if (m.t === 'coopReserve') {
        if (Number.isInteger(m.mask)) for (let i = 0; i < u.skills.length; i++) w.setReserved(u, i, !!(m.mask & (1 << i)));
        return;
      }
      const slot = remoteSlot(u, m.slot);
      if (slot == null) return;
      const r = w.requestSkill(u, slot, side);
      if (r !== 'cast' && r !== 'queued') net.send({ t: 'skillRes', r, unit: u.id, slot });
    } else if (m.t === 'coopInput' && w.companion && m.epoch === this.epoch) {
      if (!Number.isSafeInteger(m.seq) || m.seq <= this.seq || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
      this.seq = m.seq; this.lastInput = performance.now();
      w.companion.input = { x: Math.max(-1, Math.min(1, m.x)), y: Math.max(-1, Math.min(1, m.y)) };
      w.companion.run = !!m.run;
      if (['auto', 'attack', 'defend', 'follow', 'hold', 'retreat'].includes(m.command)) {
        const target = w.enemies.find(u => u.id === m.target && u.alive && !u.captured);
        if (w.companion.command !== m.command || w.companion.commandTarget !== (target ?? null)) w.setCommand(m.command, target ?? null, w.companion);
      }
    }
  }
  /** A hostile Pokémon near this trainer (switch cooldown in combat). */
  private inCombat(t: Unit): boolean {
    return this.world.enemies.some((e) => e.alive && !e.captured && e.hostile && Math.hypot(e.x - t.x, e.y - t.y) < FIELD.combatRadius);
  }
  /** Host → guest: share one loot/reward drop with the attached teammate. No-op when no guest is playing. */
  grant(loot: CoopLoot): void {
    if (!coopSession.active || net.role !== 'host' || !net.connected || !this.world.companion) return;
    const reward = loot.currency ? { ...loot, wallet: loot.wallet ?? this.wallet } : loot;
    const id = `${this.epoch}:${++this.lootN}`;
    this.loot.track(id, reward, performance.now());
    net.send({ t: 'coopLoot', reward, id });
  }

  update(now: number, paused: boolean, events: WorldEvent[]): void {
    const w = this.world;
    const dt = w.time - this.challengeTime;
    this.challengeTime = w.time;
    if (net.connected && w.companion && !paused && (dt > 0 || events.length > 0)) {
      const deaths = events.filter((e): e is Extract<WorldEvent, { t: 'death' }> => e.t === 'death');
      const result = this.challenges.update({
        dt, kills: deaths.length, elites: deaths.filter((e) => e.elite || e.boss).length,
        bosses: deaths.filter((e) => e.boss).length + events.filter((e) => e.t === 'bossWeakened').length,
        healing: events.reduce((n, e) => n + (e.t === 'heal' && e.team === 'ally' ? Math.max(0, e.amount) : 0), 0),
        bothAlive: w.trainer.hp > 0 && w.companion.trainer.hp > 0,
        distance: Math.hypot(w.trainer.x - w.companion.trainer.x, w.trainer.y - w.companion.trainer.y),
      });
      if (result) {
        const loot: CoopLoot = { currency: result.currency, note: result.name, wallet: this.wallet };
        this.reward?.(loot); this.grant(loot);
      }
    }
    if (w.companion && Math.hypot(w.companion.trainer.x - w.trainer.x, w.companion.trainer.y - w.trainer.y) > 900) {
      for (const u of [w.companion.trainer, ...w.companion.allies]) { u.x = u.lastX = w.trainer.x; u.y = u.lastY = w.trainer.y; }
    }
    if (w.companion && now - this.lastInput > 1000) w.companion.input = { x: 0, y: 0 };
    // A standing trainer can revive their teammate by staying nearby for three seconds.
    if (w.companion && !paused && w.state === 'playing') {
      for (const [down, other] of [[w.trainer, w.companion.trainer], [w.companion.trainer, w.trainer]]) {
        if (down.hp > 0) { down.reviveT = 3; continue; }
        if (other.hp <= 0 || Math.hypot(down.x - other.x, down.y - other.y) > 80) down.reviveT = 3;
        else {
          down.reviveT -= Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
          if (down.reviveT <= 0) { down.hp = down.maxHp * 0.3; down.iframes = 3; down.statuses = []; }
        }
      }
    }
    this.lastTick = now;
    if (!net.connected || !w.companion) return;
    for (const r of this.loot.due(now)) net.send({ t: 'coopLoot', reward: r.loot, id: r.id });
    this.events.push(...shareableEvents(events));
    if (now - this.lastSend < 100) return;
    this.lastSend = now;
    const snapshot = packCoop(w, this.map(), this.epoch, ++this.n, paused, this.events);
    snapshot.challenge = this.challenges.view ? { ...this.challenges.view } : null;
    snapshot.obsSig = obstacleSig(snapshot.obstacles);
    snapshot.ack = this.seq;
    snapshot.hold = Math.round(now - this.lastInput);
    const key = !this.sent || this.sent.epoch !== snapshot.epoch || snapshot.n % KEYFRAME === 0;
    let wire: CoopWire;
    if (key) {
      // the static obstacle list only travels when the guest reports another version (at most every 2 s)
      const withObs = this.guestObs !== snapshot.obsSig && now - this.obsSentAt > 2000;
      if (withObs) this.obsSentAt = now;
      wire = withObs ? snapshot : { ...snapshot, obstacles: [], noObs: true };
    } else wire = diffCoop(this.sent!, snapshot);
    net.send({ t: 'coopSnap', s: wire });
    this.sent = snapshot;
    this.events = [];
  }
  private lastTick = 0;
  private lootN = 0;
  /** loot grants waiting for the guest's acknowledgement (re-sent across relay drops) */
  readonly loot = new LootLedger();
  destroy(): void { this.off(); this.offStatus(); this.world.removeCompanion(); }
}

/** Render-only mirror with the guest's trainer as home. No quest/save code runs here. */
export class CoopMirror {
  readonly world: World;
  private units = new Map<number, Unit>();
  /** latest host position + velocity of each unit and when it arrived (for extrapolated interpolation) */
  private positions = new Map<number, { x: number; y: number; vx: number; vy: number; at: number }>();
  private epoch = '';
  private n = -1;
  /** client-side prediction of the guest's own trainer: inputs not yet acknowledged by the host */
  private pending: { seq: number; x: number; y: number; run: boolean; at: number }[] = [];
  private server: { x: number; y: number; speed: number } | null = null;
  /** terrain test of the guest's map (walls / water), so prediction does not walk through what the host blocks */
  blocked?: (x: number, y: number) => boolean;
  constructor(map: CoopMap) {
    this.world = new World({ mode: map.kind === 'survivor' ? 'survivor' : 'adventure', obstacles: false, width: map.width, height: map.height });
    this.world.allies = [];
    this.world.addCompanion();
  }
  /** a guest input just sent (prediction replays it until the host acknowledges it) */
  input(seq: number, x: number, y: number, run: boolean, at = performance.now()): void {
    this.pending.push({ seq, x, y, run, at });
    if (this.pending.length > 60) this.pending.shift();
  }
  apply(s: CoopSnapshot): boolean {
    if (!s.guest.length || (s.epoch === this.epoch && s.n <= this.n)) return false;
    if (s.epoch !== this.epoch) { this.units.clear(); this.positions.clear(); this.pending = []; }
    this.epoch = s.epoch; this.n = s.n;
    const now = performance.now();
    const present = new Set<number>();
    const unpack = (data: VisualUnit) => {
      present.add(data.id);
      let u = this.units.get(data.id);
      if (!u) { u = this.world.visualUnit(data); this.units.set(data.id, u); }
      const x = u.x, y = u.y;
      Object.assign(u, data);
      if (Math.hypot(x - data.x, y - data.y) < 200) { u.x = x; u.y = y; }
      this.positions.set(data.id, { x: data.x, y: data.y, vx: data.vx || 0, vy: data.vy || 0, at: now });
      return u;
    };
    const w = this.world, mine = s.guest.map(unpack), theirs = s.home.map(unpack);
    w.trainer = mine[0]; w.allies = mine.slice(1);
    w.companion!.trainer = theirs[0]; w.companion!.allies = theirs.slice(1);
    w.enemies = s.enemies.map(unpack);
    for (const id of this.units.keys()) if (!present.has(id)) { this.units.delete(id); this.positions.delete(id); }
    w.time = s.time; w.state = s.state; w.level = s.level; w.kills = s.kills;
    w.gems = s.gems; w.obstacles = s.obstacles;
    if (Array.isArray(s.skl)) for (const k of s.skl) { const u = this.units.get(k[0]); if (u) applySkills(u, k); }
    w.home.manualCd = s.gcd ?? 0;
    w.projectiles = s.projectiles.map(p => ({ ...p, active: true, skill: getSkill(p.skill), owner: null, slot: null, life: 1, pierce: 0, hit: new Set<number>() }));
    w.zones = s.zones.map(({ skill, ...z }) => ({ ...z, owner: w.trainer, slot: { def: getSkill(skill), cd: 0, level: 1, powerBonus: 0 } }));
    const me = s.guest[0];
    let speed = me.moveSpeed || 175;
    if (typeof s.ack === 'number') {
      // the host's real speed (upgrades, slowing terrain) from the velocity it gave the input it last applied
      const acked = this.pending.filter(p => p.seq <= s.ack!).pop();
      const mag = acked ? Math.min(1, Math.hypot(acked.x, acked.y)) * (acked.run ? 1.6 : 1) : 0;
      if (mag > 0.2 && Math.hypot(me.vx, me.vy) > 1) speed = Math.hypot(me.vx, me.vy) / mag;
      this.pending = this.pending.filter(p => p.seq > s.ack!);
    }
    this.server = { x: me.x, y: me.y, speed };
    return true;
  }
  /**
   * Others: glide toward the host position extrapolated by its velocity (≤ 150 ms ahead), so motion does not trail a
   * whole snapshot behind. Own trainer: host position + the inputs it has not applied yet (prediction), blended in.
   */
  interpolate(delta: number, now = performance.now()): void {
    const k = 1 - Math.exp(-delta / 70);
    const me = this.world.trainer;
    for (const [id, p] of this.positions) {
      const u = this.units.get(id)!;
      if (u === me && this.server && me.hp > 0) continue;
      const ahead = Math.min(0.15, (now - p.at) / 1000);
      u.x += (p.x + p.vx * ahead - u.x) * k; u.y += (p.y + p.vy * ahead - u.y) * k;
    }
    if (!this.server || !me || me.hp <= 0) return;
    let x = this.server.x, y = this.server.y;
    const blocked = this.blocked;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i], until = this.pending[i + 1]?.at ?? now;
      const len = Math.hypot(p.x, p.y), nx = len > 1 ? p.x / len : p.x, ny = len > 1 ? p.y / len : p.y;
      const dt = Math.min(0.25, Math.max(0, until - p.at) / 1000);
      const speed = this.server.speed * (p.run ? 1.6 : 1);
      // same axis-separated wall slide as the host's World.collide
      const tx = x + nx * speed * dt, ty = y + ny * speed * dt;
      if (!blocked?.(tx, y)) x = tx;
      if (!blocked?.(x, ty)) y = ty;
      // and the same push-out around round obstacles (survivor trees)
      for (const o of this.world.obstacles) {
        const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy), min = o.r + me.radius;
        if (d < min && d > 0.001) { x = o.x + (dx / d) * min; y = o.y + (dy / d) * min; }
      }
    }
    x = Math.max(0, Math.min(this.world.width, x)); y = Math.max(0, Math.min(this.world.height, y));
    if (Math.hypot(x - me.x, y - me.y) > 160) { me.x = x; me.y = y; return; }
    const kp = 1 - Math.exp(-delta / 45);
    me.x += (x - me.x) * kp; me.y += (y - me.y) * kp;
  }
}
