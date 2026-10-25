import { getSkill } from '../core/data';
import { World, type Unit, type WorldEvent, type WorldState } from '../core/world';
import { RULESETS, validateParty, shareableEvents } from './duel';
import { net } from './session';
import type { NetMsg } from './protocol';
import type { CoopLoot } from './coopRewards';

export interface CoopMap {
  kind: 'survivor' | 'region' | 'dungeon';
  id: string;
  width: number;
  height: number;
  doors?: [boolean, boolean];
}
const UNIT_FIELDS = ['id', 'team', 'kind', 'defId', 'name', 'types', 'x', 'y', 'vx', 'vy', 'radius', 'facing', 'level', 'maxHp', 'hp', 'energy', 'maxEnergy', 'castSlot', 'castT', 'shield', 'alive', 'fainted', 'hitFlash', 'iframes', 'elite', 'animCast', 'lastSkill', 'shiny', 'alpha', 'hostile', 'captured', 'megaFrom'] as const;
type VisualUnit = Pick<Unit, typeof UNIT_FIELDS[number]> & { boss: Unit['boss']; statuses: Unit['statuses'] };
export interface CoopSnapshot {
  epoch: string; n: number; map: CoopMap; time: number; state: WorldState; paused: boolean;
  level: number; kills: number;
  home: VisualUnit[]; guest: VisualUnit[]; enemies: VisualUnit[];
  projectiles: { x: number; y: number; vx: number; vy: number; r: number; team: Unit['team']; skill: string }[];
  zones: (Omit<World['zones'][number], 'owner' | 'slot'> & { skill: string })[];
  gems: World['gems']; obstacles: World['obstacles']; events: WorldEvent[];
}
export const coopSession = { active: false };

function visual(u: Unit): VisualUnit {
  const data = Object.fromEntries(UNIT_FIELDS.map(k => [k, u[k]]));
  // Strip live object references (targets, status sources, boss scripts) from the wire.
  return { ...data, statuses: u.statuses.map(s => ({ ...s, source: null })),
    boss: u.boss ? { def: u.boss.def, phase: u.boss.phase, form: u.boss.form, trail: u.boss.trail, weakened: u.boss.weakened } : null,
  } as VisualUnit;
}

export function packCoop(w: World, map: CoopMap, epoch: string, n: number, paused: boolean, events: WorldEvent[] = []): CoopSnapshot {
  return {
    epoch, n, map, time: w.time, state: w.state, paused, level: w.level, kills: w.kills,
    home: [w.trainer, ...w.allies].map(visual), guest: w.companion ? [w.companion.trainer, ...w.companion.allies].map(visual) : [],
    enemies: w.enemies.filter(u => u.alive && !u.captured).map(visual),
    projectiles: w.projectiles.filter(p => p.active && p.skill).map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r, team: p.team, skill: p.skill!.id })),
    zones: w.zones.filter(z => z.active).map(({ owner: _o, slot, ...z }) => ({ ...z, skill: slot.def.id })),
    gems: w.gems.filter(g => g.active).map(g => ({ ...g })), obstacles: w.obstacles.map(o => ({ ...o })), events: shareableEvents(events),
  };
}

/** Only the host simulates. Guest packets contain intent, never damage or rewards. */
export class CoopHost {
  readonly epoch = `${Date.now()}-${Math.random()}`;
  private n = 0;
  private seq = -1;
  private lastInput = 0;
  private lastSend = 0;
  private events: WorldEvent[] = [];
  private off: () => void;
  private offStatus: () => void;
  constructor(readonly world: World, private map: () => CoopMap) {
    this.off = net.on(m => this.receive(m));
    this.offStatus = net.onStatus(() => { if (!net.connected) world.removeCompanion(); });
  }
  private receive(m: NetMsg): void {
    if (!coopSession.active || net.role !== 'host') return;
    const w = this.world;
    if (m.t === 'coopJoin' && !w.companion) {
      if (validateParty(m.party, RULESETS.open).length) { net.send({ t: 'coopEnd', reason: 'Đội Pokémon không hợp lệ' }); return; }
      const side = w.addCompanion();
      for (const p of m.party.slice(0, 3)) w.addPokemon(p.species, {
        companion: true, level: w.mode === 'survivor' ? w.level + 4 : p.level,
        held: p.held, shiny: p.shiny, ind: p.ivs && p.nature ? { ivs: p.ivs, nature: p.nature, evs: p.evs } : null,
      });
      side.trainer.name = net.peerName || 'Đồng đội';
      this.seq = -1;
      this.lastInput = performance.now();
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
  /** Host → guest: share one loot/reward drop with the attached teammate. No-op when no guest is playing. */
  grant(loot: CoopLoot): void {
    if (!coopSession.active || net.role !== 'host' || !net.connected || !this.world.companion) return;
    net.send({ t: 'coopLoot', reward: loot });
  }

  update(now: number, paused: boolean, events: WorldEvent[]): void {
    const w = this.world;
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
    this.events.push(...shareableEvents(events));
    if (now - this.lastSend < 100) return;
    this.lastSend = now;
    net.send({ t: 'coopSnap', s: packCoop(w, this.map(), this.epoch, ++this.n, paused, this.events) });
    this.events = [];
  }
  private lastTick = 0;
  destroy(): void { this.off(); this.offStatus(); this.world.removeCompanion(); }
}

/** Render-only mirror with the guest's trainer as home. No quest/save code runs here. */
export class CoopMirror {
  readonly world: World;
  private units = new Map<number, Unit>();
  private positions = new Map<number, { x: number; y: number }>();
  private epoch = '';
  private n = -1;
  constructor(map: CoopMap) {
    this.world = new World({ mode: map.kind === 'survivor' ? 'survivor' : 'adventure', obstacles: false, width: map.width, height: map.height });
    this.world.allies = [];
    this.world.addCompanion();
  }
  apply(s: CoopSnapshot): boolean {
    if (!s.guest.length || (s.epoch === this.epoch && s.n <= this.n)) return false;
    if (s.epoch !== this.epoch) { this.units.clear(); this.positions.clear(); }
    this.epoch = s.epoch; this.n = s.n;
    const present = new Set<number>();
    const unpack = (data: VisualUnit) => {
      present.add(data.id);
      let u = this.units.get(data.id);
      if (!u) { u = this.world.visualUnit(data); this.units.set(data.id, u); }
      const x = u.x, y = u.y;
      Object.assign(u, data);
      if (Math.hypot(x - data.x, y - data.y) < 200) { u.x = x; u.y = y; }
      this.positions.set(data.id, { x: data.x, y: data.y });
      return u;
    };
    const w = this.world, mine = s.guest.map(unpack), theirs = s.home.map(unpack);
    w.trainer = mine[0]; w.allies = mine.slice(1);
    w.companion!.trainer = theirs[0]; w.companion!.allies = theirs.slice(1);
    w.enemies = s.enemies.map(unpack);
    for (const id of this.units.keys()) if (!present.has(id)) { this.units.delete(id); this.positions.delete(id); }
    w.time = s.time; w.state = s.state; w.level = s.level; w.kills = s.kills;
    w.gems = s.gems; w.obstacles = s.obstacles;
    w.projectiles = s.projectiles.map(p => ({ ...p, active: true, skill: getSkill(p.skill), owner: null, slot: null, life: 1, pierce: 0, hit: new Set<number>() }));
    w.zones = s.zones.map(({ skill, ...z }) => ({ ...z, owner: w.trainer, slot: { def: getSkill(skill), cd: 0, level: 1, powerBonus: 0 } }));
    return true;
  }
  interpolate(delta: number): void {
    const k = Math.min(1, Math.max(0, delta / 100));
    for (const [id, p] of this.positions) {
      const u = this.units.get(id)!;
      u.x += (p.x - u.x) * k; u.y += (p.y - u.y) * k;
    }
  }
}
