import { abilityOf, abilityOptions } from '../core/abilities';
import { getSkill, POKEMON } from '../core/data';
import { ECOLOGY } from '../core/encounters';
import { EV_MAX_STAT, EV_MAX_TOTAL, evTotal } from '../core/ev';
import { ITEM_DEFS } from '../core/evolution';
import { LEGENDS } from '../core/legends';
import { individualOf, OwnedPokemon } from '../core/progression';
import { NATURES, STAT_KEYS } from '../core/stats';
import type { PokeType, StatusKind, Team } from '../core/types';
import { gmaxLine, MAX_MOVES } from '../core/gimmicks';

const ALL_POKE_TYPES = Object.keys(MAX_MOVES) as PokeType[];
import { Side, STEP, Unit, World, WorldEvent } from '../core/world';
import type { DuelMon, DuelRules, PackedUnit, RosterUnit, Snapshot } from './protocol';
import { applySkills, packSkills } from './skillWire';

// Online duel logic shared by host and guest (no Phaser): rules, team checks, building the duel world,
// packing a snapshot on the host and mirroring it on the guest.

export const ARENA = { width: 34 * 48, height: 22 * 48 };

export const RULESETS: Record<DuelRules['id'], DuelRules> = {
  standard: { id: 'standard', level: 50, partyMax: 6, fieldMax: 3, speciesClause: true, allowLegends: false, timeLimit: 180 },
  open: { id: 'open', level: null, partyMax: 6, fieldMax: 3, speciesClause: false, allowLegends: true, timeLimit: 180 },
  legends: { id: 'legends', level: 50, partyMax: 6, fieldMax: 3, speciesClause: true, allowLegends: true, timeLimit: 180 },
};
export const RULE_LABEL: Record<DuelRules['id'], string> = {
  standard: 'Chuẩn — Lv50, cấm huyền thoại, không trùng loài',
  open: 'Tự do — giữ cấp thật, cho phép tất cả',
  legends: 'Huyền thoại — Lv50, cho phép huyền thoại, không trùng loài',
};

/** Teams for players without a Collection (or who just want to try PvP). */
export const RENTAL_TEAMS: { name: string; party: DuelMon[] }[] = [
  { name: 'Khởi đầu Kanto', party: [{ species: 'charizard', level: 50, held: 'charcoal' }, { species: 'blastoise', level: 50, held: 'leftovers' }, { species: 'venusaur', level: 50, held: 'miracle-seed' }, { species: 'pikachu', level: 50, held: 'magnet' }, { species: 'snorlax', level: 50, held: 'sitrus-berry' }, { species: 'gengar', level: 50, held: 'focus-sash' }] },
  { name: 'Hoenn', party: [{ species: 'sceptile', level: 50, held: 'life-orb' }, { species: 'blaziken', level: 50, held: 'choice-band' }, { species: 'swampert', level: 50, held: 'leftovers' }, { species: 'gardevoir', level: 50, held: 'wise-glasses' }, { species: 'aggron', level: 50, held: 'rocky-helmet' }, { species: 'salamence', level: 50, held: 'expert-belt' }] },
  { name: 'Sinnoh', party: [{ species: 'infernape', level: 50, held: 'life-orb' }, { species: 'garchomp', level: 50, held: 'choice-scarf' }, { species: 'lucario', level: 50, held: 'expert-belt' }, { species: 'togekiss', level: 50, held: 'leftovers' }, { species: 'gastrodon', level: 50, held: 'assault-vest' }, { species: 'staraptor', level: 50, held: 'sharp-beak' }] },
];

/** Legendary / Mythical (all generations — PokéAPI flags in the ecology data). */
export function isLegendary(species: string): boolean {
  const base = POKEMON.get(species)?.mega?.base ?? species;
  const e = ECOLOGY.get(base);
  return LEGENDS.has(base) || !!e?.legendary || !!e?.mythical;
}

/** Collection entries → wire format (IVs, nature, EVs, held item, shiny travel with them). */
export function monFromOwned(p: OwnedPokemon): DuelMon {
  const ind = individualOf(p);
  return { species: p.species, level: p.level, held: p.held ?? null, ivs: ind.ivs, nature: ind.nature, evs: p.evs, shiny: !!p.shiny, nickname: p.nickname,
    abilitySlot: abilityOf(p.species, p.abilitySlot).slot, ...(p.teraType ? { teraType: p.teraType } : {}), ...(p.gmax ? { gmax: true } : {}) };
}

/**
 * Validates a party received from the other player (the host checks the guest's and vice versa).
 * Ownership can't be proven peer-to-peer; this rejects impossible data (unknown species, IV > 31, EV caps…).
 */
export function validateParty(party: DuelMon[], rules: DuelRules): string[] {
  const err: string[] = [];
  if (!Array.isArray(party) || party.length === 0) return ['Đội trống'];
  if (party.length > rules.partyMax) err.push(`Tối đa ${rules.partyMax} Pokémon`);
  const seen = new Set<string>();
  for (const m of party) {
    const def = POKEMON.get(m?.species);
    if (!def) { err.push(`Loài không hợp lệ: ${String(m?.species)}`); continue; }
    if (def.mega) err.push(`${def.name}: không được mang dạng Mega vào trận (Mega Tiến Hóa trong trận)`);
    if (!Number.isInteger(m.level) || m.level < 1 || m.level > 100) err.push(`${def.name}: cấp không hợp lệ`);
    if (m.ivs && STAT_KEYS.some((k) => !Number.isInteger(m.ivs![k]) || m.ivs![k] < 0 || m.ivs![k] > 31)) err.push(`${def.name}: IV không hợp lệ`);
    if (m.evs && (STAT_KEYS.some((k) => !Number.isInteger(m.evs![k]) || m.evs![k] < 0 || m.evs![k] > EV_MAX_STAT) || evTotal(m.evs) > EV_MAX_TOTAL)) err.push(`${def.name}: EV vượt giới hạn`);
    if (m.nature && !NATURES[m.nature]) err.push(`${def.name}: tính cách không hợp lệ`);
    if (m.teraType != null && !ALL_POKE_TYPES.includes(m.teraType as PokeType)) err.push(`${def.name}: Hệ Tera không hợp lệ`);
    if (m.abilitySlot != null && !abilityOptions(m.species).some(a => a.slot === m.abilitySlot)) err.push(`${def.name}: Ability không hợp lệ`);
    if (m.gmax != null && typeof m.gmax !== 'boolean') err.push(`${def.name}: Nhân Tố Gigantamax không hợp lệ`);
    if (m.held) { const it = ITEM_DEFS.get(m.held); if (!it || (it.kind !== 'held' && it.kind !== 'megaStone')) err.push(`${def.name}: vật phẩm không hợp lệ`); }
    if (!rules.allowLegends && isLegendary(m.species)) err.push(`${def.name}: luật này cấm huyền thoại`);
    if (rules.speciesClause) { if (seen.has(m.species)) err.push(`Trùng loài: ${def.name}`); seen.add(m.species); }
  }
  return err;
}

export function applyRules(party: DuelMon[], rules: DuelRules): DuelMon[] {
  return party.slice(0, rules.partyMax).map((m) => ({ ...m, level: rules.level ?? m.level }));
}

export interface DuelBuild {
  world: World;
  /** Units in creation order, per side (trainer first) — host ids map onto these on the guest */
  order: [Unit[], Unit[]];
  roster: RosterUnit[];
}

/** The duel world: `home` = side 0 (host), `rival` = side 1 (guest). Same inputs → same world on both machines. */
export function buildDuel(seed: number, rules: DuelRules, side0: DuelMon[], side1: DuelMon[]): DuelBuild {
  const w = new World({ mode: 'adventure', pvp: { timeLimit: rules.timeLimit, fieldMax: rules.fieldMax }, seed, width: ARENA.width, height: ARENA.height });
  w.trainer.y = w.rival!.trainer.y = ARENA.height / 2;
  w.trainer.x = ARENA.width * 0.18; w.rival!.trainer.x = ARENA.width * 0.82;
  w.trainer.lastX = w.trainer.x; w.rival!.trainer.lastX = w.rival!.trainer.x;
  const order: [Unit[], Unit[]] = [[w.trainer], [w.rival!.trainer]];
  ([side0, side1] as DuelMon[][]).forEach((party, side) => {
    for (const m of applyRules(party, rules)) {
      const u = w.addPokemon(m.species, {
        abilitySlot: m.abilitySlot, teraType: m.teraType as PokeType | undefined, level: m.level, held: m.held ?? null, rival: side === 1, shiny: !!m.shiny,
        ind: m.ivs && m.nature ? { ivs: m.ivs, nature: m.nature, evs: m.evs } : null,
      });
      if (m.nickname) u.name = m.nickname;
      u.teraPick = (m.teraType as PokeType | undefined) ?? null;
      u.gmaxFactor = !!m.gmax && gmaxLine(m.species);
      order[side].push(u);
    }
  });
  const roster: RosterUnit[] = order.flatMap((list, side) => list.map((u) => ({
    id: u.id, side: side as 0 | 1, kind: u.kind === 'trainer' ? 'trainer' : 'pokemon', defId: u.defId, level: u.level, shiny: u.shiny, held: u.heldId, name: u.name,
  })));
  return { world: w, order, roster };
}

const STATUS_KINDS: StatusKind[] = ['burn', 'poison', 'badPoison', 'paralysis', 'sleep', 'freeze', 'confusion', 'flinch', 'slow', 'stun', 'atkUp', 'defDown', 'leech', 'taunt'];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Host: the whole visible state of the duel. */
export function packSnapshot(w: World, n: number): Snapshot {
  const sideIdx = (u: Unit): 0 | 1 => (u.team === 'ally' ? 0 : 1);
  const units: PackedUnit[] = [];
  for (const side of w.sides()) {
    const benched = new Set(side.bench);
    for (const u of [side.trainer, ...side.allies, ...side.bench]) {
      let mask = 0;
      for (const s of u.statuses) mask |= 1 << STATUS_KINDS.indexOf(s.kind);
      const flags = (u.fainted ? 1 : 0) | (u.hitFlash > 0 ? 2 : 0) | (u.castSlot >= 0 || u.animCast > 0 ? 4 : 0) | (u.dash ? 8 : 0) | (benched.has(u) ? 16 : 0) | (u.shield > 0 ? 32 : 0);
      const gim = u.tera ? 'T:' + u.tera.type : u.dyna ? (u.dyna.gmax ? 'G' : 'D') : undefined;
      units.push([u.id, r1(u.x), r1(u.y), Math.round(u.hp), u.maxHp, flags, u.castSlot, Math.round(u.energy), u.facing, mask, u.lastSkill || undefined, u.megaFrom ? u.defId : undefined, gim]);
    }
  }
  return {
    n, time: r1(w.time), units,
    projs: w.projectiles.filter((p) => p.active).map((p) => [r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), p.skill!.id, p.team === 'ally' ? 0 : 1]),
    zones: w.zones.filter((z) => z.active).map((z) => [z.shape === 'circle' ? 0 : z.shape === 'line' ? 1 : 2, r1(z.x), r1(z.y), r1(z.r), Math.round(z.angle * 1000) / 1000, r1(z.length), r1(z.delay), r1(z.t), sideIdx(z.owner), z.slot.def.id, z.visualOnly ? 1 : 0]),
    sides: w.sides().map((s) => [s.command, r1(s.switchCd), s.megaUsed]),
    winner: w.duel?.winner ?? null,
    // the guest (rival side) draws its own skill bar from these
    skl: w.rival ? w.rival.allies.map((u) => packSkills(u)) : undefined,
    gcd: w.rival ? r1(w.rival.manualCd) : undefined,
  };
}

const VISUAL_EVENTS = new Set(['dmg', 'heal', 'vfx', 'sfx', 'faint', 'revive', 'banner', 'status', 'shake']);
/** Host → guest: the events worth drawing (no capture / boss / quest events exist in a duel). */
export function shareableEvents(evts: WorldEvent[]): WorldEvent[] {
  return evts.filter((e) => VISUAL_EVENTS.has(e.t));
}

/**
 * Guest side of a duel: a World used only for drawing. Built with the parties swapped so the guest's own
 * side is `home` (camera, HUD and colours work as for the host); host unit ids are mapped onto it.
 * The picture is mirrored left ↔ right, so every player sees their own trainer on the left.
 */
export class DuelMirror {
  readonly world: World;
  private map = new Map<number, Unit>();
  private local2host = new Map<number, number>();
  private prev: Snapshot | null = null;
  private next: Snapshot | null = null;
  private prevAt = 0;
  private nextAt = 0;
  last: Snapshot | null = null;

  constructor(seed: number, rules: DuelRules, hostParty: DuelMon[], guestParty: DuelMon[], roster: RosterUnit[]) {
    const b = buildDuel(seed, rules, guestParty, hostParty);
    this.world = b.world;
    const mine = b.order[0], theirs = b.order[1];
    const bySide: [RosterUnit[], RosterUnit[]] = [roster.filter((r) => r.side === 0), roster.filter((r) => r.side === 1)];
    bySide[0].forEach((r, i) => theirs[i] && this.link(r.id, theirs[i]));
    bySide[1].forEach((r, i) => mine[i] && this.link(r.id, mine[i]));
  }

  private link(hostId: number, u: Unit): void {
    this.map.set(hostId, u);
    this.local2host.set(u.id, hostId);
  }

  /** Host unit id of a local unit (for orders the guest sends). */
  hostId(u: Unit): number | undefined {
    return this.local2host.get(u.id);
  }

  unit(hostId: number): Unit | undefined {
    return this.map.get(hostId);
  }

  push(s: Snapshot, now: number): void {
    if (this.next && s.n <= this.next.n) return; // out of order (unreliable transports)
    this.prev = this.next; this.prevAt = this.nextAt;
    this.next = s; this.nextAt = now;
    this.last = s;
    this.applyDiscrete(s);
  }

  /** Host x → drawn x (mirrored arena). */
  mx(x: number): number {
    return ARENA.width - x;
  }

  /** Host events in the guest's perspective (teams flipped, unit ids mapped, positions mirrored). */
  flipEvents(evts: WorldEvent[]): WorldEvent[] {
    const flip = (t: Team): Team => (t === 'ally' ? 'enemy' : 'ally');
    return evts.map((e0) => {
      let e = e0;
      if ('x' in e && typeof e.x === 'number') e = { ...e, x: this.mx(e.x) };
      if (e.t === 'vfx' && e.angle != null) e = { ...e, angle: Math.PI - e.angle };
      if (e.t === 'dmg') return { ...e, victimTeam: flip(e.victimTeam) };
      if (e.t === 'status') return { ...e, team: flip(e.team) };
      if (e.t === 'faint' || e.t === 'revive') return { ...e, id: this.map.get(e.id)?.id ?? -1 };
      return e;
    });
  }

  /** Everything except positions (set every snapshot). */
  private applyDiscrete(s: Snapshot): void {
    const w = this.world;
    // field / bench membership exactly as on the host (fainted members that left the field are in neither)
    const field = new Map<Side, Unit[]>([[w.home, []], [w.rival!, []]]), bench = new Map<Side, Unit[]>([[w.home, []], [w.rival!, []]]);
    for (const p of s.units) {
      const u = this.map.get(p[0]);
      if (!u) continue;
      const [, , , hp, maxHp, flags, castSlot, energy, facing, mask, lastSkill, megaDef, gim] = p;
      if (megaDef && u.defId !== megaDef && POKEMON.has(megaDef)) w.transformAlly(u, megaDef, { mega: true });
      // Terastal / Dynamax mirrored from the host (HP comes with the snapshot right below)
      if (gim?.startsWith('T:') && !u.tera) w.terastallize(u, gim.slice(2) as PokeType);
      else if (!gim?.startsWith('T:') && u.tera) w.endTera(u);
      if ((gim === 'D' || gim === 'G') && !u.dyna) w.dynamax(u, gim === 'G');
      else if (gim !== 'D' && gim !== 'G' && u.dyna) w.endDynamax(u);
      u.hp = hp; u.maxHp = maxHp; u.fainted = !!(flags & 1); u.energy = energy; u.facing = -facing; u.castSlot = castSlot;
      if (flags & 2) u.hitFlash = 0.12;
      u.animCast = flags & 4 ? Math.max(u.animCast, 0.2) : 0;
      u.dash = flags & 8 ? (u.dash ?? { dx: 0, dy: 0, remaining: 0, speed: 0, slot: u.skills[0], hit: new Set() }) : null;
      u.shield = flags & 32 ? 1 : 0;
      if (lastSkill) u.lastSkill = lastSkill;
      u.statuses = STATUS_KINDS.filter((_, i) => mask & (1 << i)).map((kind) => ({ kind, t: 1, magnitude: 0, source: null, tick: 1, age: 0 }));
      if (u.kind === 'pokemon') (flags & 16 ? bench : field).get(u.team === 'ally' ? w.home : w.rival!)!.push(u);
    }
    for (const side of w.sides()) {
      side.allies = field.get(side)!;
      side.bench = bench.get(side)!;
      side.allies.forEach((a, i) => (a.slotIndex = i));
    }
    // projectiles: the first N pool entries are the active ones
    const pool = w.projectiles;
    for (let i = 0; i < pool.length; i++) {
      const pr = s.projs[i], p = pool[i];
      if (!pr) { p.active = false; continue; }
      const sk = getSkill(pr[4]);
      Object.assign(p, { active: true, x: this.mx(pr[0]), y: pr[1], vx: -pr[2], vy: pr[3], skill: sk, team: pr[5] === 0 ? 'enemy' : 'ally' });
    }
    // zones
    w.zones.length = 0;
    for (const z of s.zones) {
      const owner = z[8] === 0 ? w.rival!.trainer : w.trainer;
      w.zones.push({
        active: true, team: owner.team, owner, slot: { def: getSkill(z[9]), cd: 0, level: 1, powerBonus: 0 }, shape: z[0] === 0 ? 'circle' : z[0] === 1 ? 'line' : 'cone',
        x: this.mx(z[1]), y: z[2], r: z[3], angle: Math.PI - z[4], length: z[5], delay: z[6], t: z[7], duration: 0, tick: 0, tickT: 0, visualOnly: z[10] === 1, fired: z[7] >= z[6],
      });
    }
    const [hostSide, guestSide] = s.sides;
    if (guestSide) { w.home.command = guestSide[0]; w.home.switchCd = guestSide[1]; w.home.megaUsed = guestSide[2]; }
    if (hostSide) { w.rival!.command = hostSide[0]; w.rival!.switchCd = hostSide[1]; w.rival!.megaUsed = hostSide[2]; }
    if (Array.isArray(s.skl)) for (const k of s.skl) { const u = this.map.get(k[0]); if (u) applySkills(u, k); }
    w.home.manualCd = s.gcd ?? 0;
    w.time = s.time;
    if (w.duel) w.duel.winner = s.winner === 'home' ? 'rival' : s.winner === 'rival' ? 'home' : s.winner;
  }

  /** Smooth positions: draws ~1 snapshot interval behind the newest one, interpolating between the last two. */
  interpolate(now: number): void {
    const a = this.prev, b = this.next;
    if (!b) return;
    const span = Math.max(1, this.nextAt - this.prevAt);
    const k = a ? Math.min(1, Math.max(0, (now - this.nextAt) / span)) : 1;
    const from = new Map(a?.units.map((p) => [p[0], p]) ?? []);
    for (const p of b.units) {
      const u = this.map.get(p[0]);
      if (!u) continue;
      const q = from.get(p[0]);
      const nx = this.mx(q ? q[1] + (p[1] - q[1]) * k : p[1]), ny = q ? q[2] + (p[2] - q[2]) * k : p[2];
      u.vx = (nx - u.x) / STEP; u.vy = (ny - u.y) / STEP;
      u.lastX = u.x; u.lastY = u.y;
      u.x = nx; u.y = ny;
    }
    for (const p of this.world.projectiles) if (p.active) { p.x += p.vx * (1 / 60); p.y += p.vy * (1 / 60); }
  }
}
