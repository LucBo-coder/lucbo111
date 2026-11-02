import type { AdventureScene } from '../scenes/AdventureScene';
import { BOSSES, getSkill, POKEMON } from '../core/data';
import type { NetHit, Unit, WorldEvent } from '../core/world';
import type { Stats } from '../core/stats';
import type { PokeType, StatusApply, StatusKind } from '../core/types';
import { makeWildState } from '../core/wildAI';
import { party, type PartyMsg } from '../net/party';

// Co-op "thế giới chung" (Phiêu lưu + Việt Nam Odyssey, up to 4 players): every player runs their own game and save
// and goes wherever they like. Players on the same map see each other and fight the same Pokémon:
//  - each Pokémon is simulated by the player whose game spawned it (its owner) — wild ones by the member of the map who
//    joined the room first, scripted ones (trainers, bosses, events) by whoever triggered them;
//  - every game sends its own trainer, Pokémon on the field and owned enemies 10× per second (`sw`); the others draw
//    them (puppets / mirrored enemies, `Unit.net`) and let their own Pokémon fight the mirrored enemies;
//  - a hit on someone else's unit goes to its owner (`swH`), who applies it; when an enemy falls the owner tells the
//    player who landed the last hit (`swKo`), and only that player gets the EXP, money and quest credit.

const SEND_MS = 100;
/** every 10th state carries the static fields (stats, types, names) so a newcomer can build its copies */
const KEYFRAME = 10;
/** a member that sent nothing for this long is not drawn any more */
const STALE_MS = 2500;

type Kind = Unit['kind'];
/** static part of a unit on the wire */
interface WireStatic { d: string; nm: string; k: Kind; ty: PokeType[]; st: Stats; r: number; sh?: 1; al?: 1; el?: 1; av?: string; bd?: string; wi?: 1; tm?: string; nc?: 1; ab?: number; tp?: PokeType | null; mg?: string | null }
/** dynamic part (every state) */
interface WireUnit { i: number; x: number; y: number; vx: number; vy: number; f: number; h: number; mh: number; l: number; ho?: 1; fa?: 1; ca?: number; ls?: string; ss?: StatusKind[]; bp?: number; bf?: string | null; bw?: 1; lk?: string; cp?: 1; s?: WireStatic }
interface SwState extends PartyMsg { t: 'sw'; map: string; n: number; me: WireUnit[]; en: WireUnit[]; pr: [number, number, number, number, number, 0 | 1, string][]; zn: [string, number, number, number, number, number, number, string, 0 | 1][]; fx: WorldEvent[] }
/** hits for the owner: [enemy/puppet id, amount, crit, eff, dot, attacker id, status] */
type WireHit = [number, number, 0 | 1, number, 0 | 1, number, StatusApply | 0];

interface Remote {
  id: string;
  map: string;
  at: number;
  /** their unit id → my copy */
  units: Map<number, Unit>;
  /** latest position + velocity per copy (interpolated toward) */
  goal: Map<Unit, { x: number; y: number; vx: number; vy: number; at: number }>;
  statics: Map<number, WireStatic>;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export class SharedWorld {
  private remotes = new Map<string, Remote>();
  private n = 0;
  private lastSend = 0;
  private fx: WorldEvent[] = [];
  /** outgoing hits per owner, flushed once a frame */
  private hits = new Map<string, WireHit[]>();
  private off: () => void;
  private offChange: () => void;
  /** last-hit notices waiting for the scene (applied in update, outside the world step) */
  readonly kos: Extract<WorldEvent, { t: 'death' }>[] = [];

  constructor(private scene: AdventureScene) {
    const w = scene.world;
    w.netHit = (h) => this.onNetHit(h);
    this.off = party.on((m, from) => this.receive(m, from));
    this.offChange = party.onChange(() => this.syncProfile());
    this.syncProfile();
  }

  destroy(): void {
    this.off(); this.offChange();
    const w = this.scene.world;
    if (w.netHit) w.netHit = null;
    for (const id of [...this.remotes.keys()]) this.dropRemote(id);
  }

  /** The map key shared with the room ('' / dungeon: private, nobody else is drawn there). */
  mapKey(): string {
    const s = this.scene;
    return s.mapKind === 'valley' ? s.regionDef.id : `dungeon:${s.dungeonId}`;
  }
  private shareable(): boolean { return this.scene.mapKind === 'valley'; }

  private syncProfile(): void {
    if (!party.active) return;
    party.setProfile({ campaign: this.scene.state.adv.campaign, map: this.mapKey() });
  }

  /** Members on my map (same campaign), me excluded. */
  private mates() { return this.shareable() ? party.sameMap().filter((m) => !m.map.startsWith('dungeon:')) : []; }

  /** Another player is on my map right now. */
  hasMates(): boolean { return party.active && this.mates().length > 0; }

  /** Wild Pokémon of this map are spawned by the member here who joined the room first. */
  spawnsHere(): boolean {
    if (!party.active) return true;
    return this.mates().every((m) => party.me < m.id);
  }

  // ───────────────────────────── per frame ─────────────────────────────

  update(now: number, events: WorldEvent[], delta: number): void {
    if (!party.active) return;
    const mates = this.mates();
    for (const e of events) if (e.t === 'vfx' && this.fx.length < 30) this.fx.push(e);
    if (mates.length && now - this.lastSend >= SEND_MS) { this.lastSend = now; this.send(); }
    else if (!mates.length) this.fx.length = 0;
    for (const [owner, list] of this.hits) if (list.length) party.send({ t: 'swH', h: list }, owner);
    this.hits.clear();
    // drop members who left the map or went quiet
    const here = new Set(mates.map((m) => m.id));
    for (const [id, r] of this.remotes) if (!here.has(id) || r.map !== this.mapKey() || now - r.at > STALE_MS) this.dropRemote(id);
    this.interpolate(delta, now);
  }

  private wireUnit(u: Unit, key: boolean): WireUnit {
    const o: WireUnit = { i: u.id, x: r1(u.x), y: r1(u.y), vx: r1(u.vx), vy: r1(u.vy), f: u.facing, h: Math.round(u.hp), mh: u.maxHp, l: u.level };
    if (u.hostile) o.ho = 1;
    if (u.fainted) o.fa = 1;
    if (u.animCast > 0) o.ca = r1(u.animCast);
    if (u.lastSkill) o.ls = u.lastSkill;
    if (u.statuses.length) o.ss = u.statuses.map((s) => s.kind);
    if (u.boss) { o.bp = u.boss.phase; o.bf = u.boss.form ?? null; if (u.boss.weakened) o.bw = 1; }
    if (u.look) o.lk = u.look;
    if (u.captured) o.cp = 1;
    if (key) {
      const s: WireStatic = { d: u.defId, nm: u.name, k: u.kind, ty: [...u.types], st: { ...u.stats }, r: u.radius };
      if (u.shiny) s.sh = 1;
      if (u.alpha) s.al = 1;
      if (u.elite) s.el = 1;
      if (u.avatar) s.av = u.avatar;
      if (u.boss) s.bd = u.boss.def.id;
      if (u.wild) { s.wi = 1; s.tm = u.wild.temperament; }
      if (u.noCapture) s.nc = 1;
      if (u.abilitySlot != null) s.ab = u.abilitySlot;
      if (u.teraPick) s.tp = u.teraPick;
      if (u.megaFrom) s.mg = u.megaFrom;
      o.s = s;
    }
    return o;
  }

  private send(): void {
    const w = this.scene.world;
    const key = this.n++ % KEYFRAME === 0;
    const me = [w.trainer, ...w.allies.filter((a) => a.alive)].map((u) => this.wireUnit(u, key));
    if (me[0]?.s) { me[0].s.nm = party.profile.name; me[0].s.av = party.profile.avatar; }
    // my enemies: what my game simulates (copies of other players' enemies are theirs to send)
    const en = w.enemies.filter((e) => e.alive && !e.net && e.tag !== 'story-ally' && e.tag !== 'mount').map((u) => this.wireUnit(u, key));
    const pr: SwState['pr'] = [];
    for (const p of w.projectiles) if (p.active && p.slot && p.owner && !p.owner.net && p.skill) pr.push([r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.r, p.team === 'ally' ? 1 : 0, p.skill.id]);
    const zn: SwState['zn'] = [];
    for (const z of w.zones) if (z.active && !z.visualOnly && !z.owner.net && !z.fired) zn.push([z.shape, r1(z.x), r1(z.y), z.r, r1(z.angle), z.length, r1(z.delay - z.t), z.slot.def.id, z.team === 'ally' ? 1 : 0]);
    const msg: SwState = { t: 'sw', map: this.mapKey(), n: this.n, me, en, pr, zn, fx: this.fx.splice(0) };
    party.send(msg);
  }

  // ───────────────────────────── incoming ─────────────────────────────

  private receive(m: PartyMsg, from: string): void {
    if (m.t === 'left') { this.dropRemote(from); return; }
    if (m.t === 'sw') { this.applyState(m as SwState, from); return; }
    if (m.t === 'swH' && Array.isArray(m.h)) { for (const h of m.h as WireHit[]) this.applyHit(h, from); return; }
    if (m.t === 'swKo') { this.receiveKo(m, from); return; }
    if (m.t === 'swClaim' || m.t === 'swCaught' || m.t === 'swFree') this.capture(m, from);
  }

  private remote(from: string, map: string): Remote {
    let r = this.remotes.get(from);
    if (r && r.map !== map) { this.dropRemote(from); r = undefined; }
    if (!r) { r = { id: from, map, at: 0, units: new Map(), goal: new Map(), statics: new Map() }; this.remotes.set(from, r); }
    return r;
  }

  private applyState(s: SwState, from: string): void {
    if (!this.shareable() || s.map !== this.mapKey() || !Array.isArray(s.me) || !Array.isArray(s.en)) return;
    const mate = party.members.get(from);
    if (!mate || mate.campaign !== this.scene.state.adv.campaign) return;
    const w = this.scene.world, r = this.remote(from, s.map), now = performance.now();
    r.at = now;
    const present = new Set<number>();
    const upsert = (d: WireUnit, enemy: boolean) => {
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
      if (d.s) r.statics.set(d.i, d.s);
      const st = r.statics.get(d.i);
      if (!st) return; // waiting for the keyframe with its stats
      present.add(d.i);
      let u = r.units.get(d.i);
      if (!u) {
        const made = this.build(st, d, enemy, from);
        if (!made) return;
        u = made;
        r.units.set(d.i, u);
        if (enemy) w.enemies.push(u); else w.puppets.push(u);
      } else if (d.s) this.refreshStatic(u, d.s, from);
      if (!u.captured) r.goal.set(u, { x: d.x, y: d.y, vx: d.vx || 0, vy: d.vy || 0, at: now });
      u.facing = d.f < 0 ? -1 : 1;
      u.hp = Math.max(0, d.h); u.maxHp = Math.max(1, d.mh); u.level = d.l;
      u.vx = d.vx || 0; u.vy = d.vy || 0;
      if (!u.captured) u.hostile = !!d.ho;
      u.fainted = !!d.fa;
      u.animCast = d.ca ?? 0;
      u.lastSkill = d.ls ?? '';
      u.look = d.lk;
      u.statuses = (d.ss ?? []).map((kind) => ({ kind, t: 1, magnitude: 0, source: null, tick: 1, age: 1 }));
      if (u.boss) { u.boss.phase = (d.bp ?? 1) as 1 | 2 | 3; u.boss.form = d.bf ?? undefined; u.boss.weakened = !!d.bw; }
      // the owner's ball holds it: hidden here too (unless it is my own throw, which keeps it captured locally)
      if (d.cp && !u.captured) u.captured = true;
      else if (!d.cp && u.captured && !this.myThrow(u)) u.captured = false;
    };
    for (const d of s.me) upsert(d, false);
    for (const d of s.en) upsert(d, true);
    for (const [id, u] of r.units) {
      if (present.has(id) || this.myThrow(u)) continue;
      this.release(u); r.units.delete(id); r.goal.delete(u); r.statics.delete(id);
    }
    // their shots / telegraphs / effects, drawn only
    if (Array.isArray(s.pr)) for (const [x, y, vx, vy, rad, ally, sk] of s.pr.slice(0, 40)) {
      const p = w.projectiles.find((q) => !q.active);
      if (!p) break;
      const skill = safeSkill(sk);
      if (!skill) continue;
      p.active = true; p.team = ally ? 'ally' : 'enemy'; p.owner = null; p.slot = null; p.skill = skill;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = rad; p.life = SEND_MS / 1000 + 0.02; p.pierce = 0; p.hit.clear();
    }
    const owner = r.units.get(s.me[0]?.i ?? -1) ?? w.trainer;
    if (Array.isArray(s.zn)) for (const [shape, x, y, rad, ang, len, left, sk, ally] of s.zn.slice(0, 20)) {
      const skill = safeSkill(sk);
      if (!skill || left <= 0 || (shape !== 'circle' && shape !== 'line' && shape !== 'cone')) continue;
      // one telegraph per spot (it is re-sent every state until it fires)
      const dup = w.zones.find((z) => z.active && z.visualOnly && z.owner.net?.owner === from && Math.abs(z.x - x) < 2 && Math.abs(z.y - y) < 2 && z.slot.def.id === sk);
      if (dup) { dup.delay = dup.t + left; continue; }
      w.addZone(owner, { def: skill, cd: 0, level: 1, powerBonus: 0 }, shape, x, y, rad, ang, len, left, 0, 0, true);
      const z = w.zones[w.zones.length - 1];
      if (z) z.team = ally ? 'ally' : 'enemy';
    }
    if (Array.isArray(s.fx) && s.fx.length) this.scene.renderer_.handle(s.fx.filter((e) => e && e.t === 'vfx').slice(0, 30));
  }

  /** A local copy of another player's unit, with their stats (my Pokémon compute their hits on it as usual). */
  private build(st: WireStatic, d: WireUnit, enemy: boolean, from: string): Unit | null {
    const w = this.scene.world;
    let u: Unit;
    if (enemy && st.k === 'enemy' && POKEMON.has(st.d)) {
      u = w.spawnWild(st.d, d.l, d.x, d.y, { hostile: !!d.ho, noCapture: !!st.nc, elite: !!st.el });
      w.enemies.pop(); // pushed by the caller once it is marked as remote
    } else {
      const bd = st.bd ? BOSSES.get(st.bd) : undefined;
      if (st.k === 'boss' && !bd) return null;
      u = w.visualUnit({ team: enemy ? 'enemy' : 'ally', kind: st.k, defId: st.d, name: st.nm, level: d.l, x: d.x, y: d.y });
      if (bd) u.boss = { def: bd, phase: 1, homeX: d.x, homeY: d.y, patternT: 0, trail: [], final: false } as unknown as Unit['boss'];
    }
    u.team = enemy ? 'enemy' : 'ally';
    u.x = u.lastX = d.x; u.y = u.lastY = d.y;
    u.net = { owner: from, rid: d.i };
    this.refreshStatic(u, st, from);
    return u;
  }

  private refreshStatic(u: Unit, st: WireStatic, from: string): void {
    u.defId = st.d; u.name = st.nm || u.name; u.kind = st.k;
    u.types = Array.isArray(st.ty) ? st.ty.slice(0, 3) : u.types;
    if (st.st && Number.isFinite(st.st.hp)) u.stats = { ...st.st };
    u.radius = Number.isFinite(st.r) ? st.r : u.radius;
    u.shiny = !!st.sh; u.alpha = !!st.al; u.elite = !!st.el;
    u.noCapture = !!st.nc;
    if (st.k === 'trainer') u.avatar = st.av || party.members.get(from)?.avatar;
    if (st.ab != null) u.abilitySlot = st.ab;
    if (st.tp !== undefined) u.teraPick = st.tp;
    u.megaFrom = st.mg ?? null;
    // a wild Pokémon can be caught by anyone: the stub carries its temperament for the capture roll
    if (st.wi && !u.wild) u.wild = makeWildState(u.x, u.y, st.tm === 'timid' || st.tm === 'aggressive' ? st.tm : 'neutral');
    if (!st.wi) u.wild = null;
  }

  private interpolate(delta: number, now: number): void {
    const k = 1 - Math.exp(-delta / 70);
    for (const r of this.remotes.values()) for (const [u, g] of r.goal) {
      const ahead = Math.min(0.15, (now - g.at) / 1000);
      const tx = g.x + g.vx * ahead, ty = g.y + g.vy * ahead;
      if (Math.hypot(tx - u.x, ty - u.y) > 300) { u.x = tx; u.y = ty; }
      else { u.x += (tx - u.x) * k; u.y += (ty - u.y) * k; }
      u.lastX = u.x; u.lastY = u.y;
      if (Math.abs(u.vx) > 3) u.facing = Math.sign(u.vx);
    }
  }

  private release(u: Unit): void {
    const w = this.scene.world;
    u.alive = false;
    w.puppets = w.puppets.filter((p) => p !== u);
    for (const a of [...w.allies, ...w.enemies]) {
      if (a.target === u) a.target = null;
      if (a.castTarget === u) a.castTarget = null;
      if (a.wild?.lastAttacker === u) a.wild.lastAttacker = null;
      if (a.wild?.threat === u) a.wild.threat = null;
    }
    for (const side of w.sides()) if (side.commandTarget === u) { side.commandTarget = null; side.command = 'auto'; }
  }

  private dropRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    for (const u of r.units.values()) this.release(u);
    this.remotes.delete(id);
  }

  /** A copy of `owner`'s unit by its id there. */
  private copyOf(owner: string, rid: number): Unit | undefined { return this.remotes.get(owner)?.units.get(rid); }

  // ───────────────────────────── hits ─────────────────────────────

  /** My game landed a hit on someone else's unit: their game applies it. */
  private onNetHit(h: NetHit): void {
    const n = h.dst.net;
    if (!n || !party.active) return;
    const list = this.hits.get(n.owner) ?? [];
    if (list.length >= 120) return;
    list.push([n.rid, Math.round(h.amount * 10) / 10, h.crit ? 1 : 0, h.eff, h.dot ? 1 : 0, h.src && !h.src.net ? h.src.id : -1, h.status ?? 0]);
    this.hits.set(n.owner, list);
  }

  /** Another player hit one of my units (an enemy I simulate, or me / my Pokémon when their enemy struck). */
  private applyHit(h: WireHit, from: string): void {
    if (!Array.isArray(h)) return;
    const [id, amount, crit, eff, dot, srcId, status] = h;
    const w = this.scene.world;
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e6) return;
    const enemy = w.enemies.find((e) => e.id === id && e.alive && !e.net);
    // the attacker as drawn in my world (their Pokémon / their enemy), so wild Pokémon turn on the right player
    const src = srcId >= 0 ? this.copyOf(from, srcId) ?? null : null;
    if (enemy) {
      if (enemy.captured) return;
      enemy.lastHitBy = from;
      if (status && typeof status === 'object') w.applyStatus(enemy, status, src ?? this.trainerOf(from));
      if (amount > 0) w.applyDamage(enemy, amount, src ?? this.trainerOf(from), !!crit, eff, !!dot);
      return;
    }
    // their enemy struck my trainer or one of my Pokémon (their game already scaled the hit)
    const mine = [w.trainer, ...w.allies].find((u) => u.id === id && u.alive && !u.fainted);
    if (!mine) return;
    if (status && typeof status === 'object') w.applyStatus(mine, status, src);
    if (amount > 0) w.applyDamage(mine, amount, null, !!crit, eff, !!dot);
  }

  private trainerOf(from: string): Unit | null {
    for (const u of this.remotes.get(from)?.units.values() ?? []) if (u.kind === 'trainer') return u;
    return null;
  }

  // ───────────────────────────── last hit ─────────────────────────────

  /**
   * One of my enemies went down. Returns true when another player landed the last hit: they get the rewards (sent
   * here), my game keeps only the story / event progress of the fight.
   */
  creditElsewhere(e: Extract<WorldEvent, { t: 'death' }>, by = e.by): boolean {
    if (!by || by === party.me || !party.active || !party.members.has(by)) return false;
    party.send({ t: 'swKo', defId: e.defId, level: e.level ?? 5, elite: e.elite, boss: e.boss, wild: !!e.wild, tag: e.tag ?? null, x: Math.round(e.x), y: Math.round(e.y) }, by);
    return true;
  }

  private receiveKo(m: PartyMsg, from: string): void {
    if (typeof m.defId !== 'string' || !POKEMON.has(m.defId) && !BOSSES.has(m.defId) || !party.members.has(from)) return;
    const level = Math.max(1, Math.min(100, Number(m.level) || 5));
    const tag = typeof m.tag === 'string' ? m.tag.slice(0, 40) : null;
    this.kos.push({ t: 'death', x: Number(m.x) || 0, y: Number(m.y) || 0, defId: m.defId, elite: !!m.elite, boss: !!m.boss, wild: !!m.wild, level, tag, id: -1, by: party.me });
  }

  // ───────────────────────────── captures ─────────────────────────────

  /** The unit is the target of my own ball right now (kept captured until the throw resolves). */
  private myThrow(u: Unit): boolean { return this.scene.captureTarget() === u; }

  /** My ball caught (or failed on) a copy of someone else's wild Pokémon. */
  claim(u: Unit): void { if (u.net) party.send({ t: 'swClaim', id: u.net.rid }, u.net.owner); }
  caught(u: Unit): void {
    if (!u.net) return;
    const r = this.remotes.get(u.net.owner);
    party.send({ t: 'swCaught', id: u.net.rid }, u.net.owner);
    r?.units.delete(u.net.rid); r?.goal.delete(u);
    this.release(u);
  }
  freed(u: Unit, flee: boolean): void { if (u.net) party.send({ t: 'swFree', id: u.net.rid, flee }, u.net.owner); }

  private capture(m: PartyMsg, from: string): void {
    const w = this.scene.world;
    const e = w.enemies.find((x) => x.id === m.id && x.alive && !x.net);
    if (!e || !e.wild || e.noCapture) return;
    if (m.t === 'swClaim') { if (!e.captured) w.beginCapture(e); return; }
    if (m.t === 'swCaught') {
      w.removeEnemy(e);
      this.scene.ui?.banner(`${party.nameOf(from)} đã thu phục ${e.name}!`, '#ffe080');
      return;
    }
    w.endCapture(e, false);
    if (m.flee) { e.wild.mode = 'flee'; e.wild.t = 5; e.hostile = false; e.wild.threat = this.trainerOf(from) ?? w.trainer; }
  }
}

function safeSkill(id: string) {
  try { return typeof id === 'string' ? getSkill(id) : null; } catch { return null; }
}
