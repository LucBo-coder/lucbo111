import { PACK_ALARM_R, TERRITORY_WARN } from './ecologyRules';
import { chooseSkill } from './skillSelector';
import type { Unit, World } from './world';

// Wild Pokémon ecosystem behaviour (adventure mode). Runs on top of the shared combat engine:
// when a wild Pokémon decides to fight it uses the same skill selector, casting and damage
// pipeline as allies and Survivor enemies.

export type WildMode = 'idle' | 'wander' | 'eat' | 'sleep' | 'flee' | 'alert' | 'chase' | 'attack' | 'return';
export type Temperament = 'timid' | 'neutral' | 'aggressive';

export interface WildState {
  mode: WildMode;
  t: number;
  homeX: number;
  homeY: number;
  homeR: number;
  leash: number;
  temperament: Temperament;
  aggroR: number;
  nocturnal: boolean;
  wanderX: number;
  wanderY: number;
  lastAttacker: Unit | null;
  threat: Unit | null;
  lodT: number;
  fled: boolean;
  calmT: number;
  /** Pack id shared by members of one group (they follow the leader and react together) */
  pack?: number;
  leader?: boolean;
  /** The pack leader this member keeps close to */
  follow?: Unit | null;
  /** Guarded radius around home (territorial species): entering it draws a warning, then a charge */
  territory?: number;
  /** Spawned by a rare-condition rule (rule id) */
  rare?: string;
}

export function makeWildState(x: number, y: number, temperament: Temperament, o: { homeR?: number; nocturnal?: boolean; aggroR?: number; leash?: number; territory?: number } = {}): WildState {
  return {
    mode: 'idle', t: 0.5 + Math.random() * 1.5, homeX: x, homeY: y, homeR: o.homeR ?? 140,
    leash: o.leash ?? 520, temperament, aggroR: o.aggroR ?? (temperament === 'aggressive' ? 190 : temperament === 'timid' ? 150 : 90),
    nocturnal: !!o.nocturnal, wanderX: x, wanderY: y, lastAttacker: null, threat: null, lodT: 0, fled: false, calmT: 0,
    ...(o.territory ? { territory: o.territory } : {}),
  };
}

const LOD_DIST = 1000;
const LOD_TICK = 0.4;

function nearestThreat(world: World, e: Unit): { u: Unit; d: number } {
  let best = world.trainer;
  let bd = best.hp > 0 ? Math.hypot(best.x - e.x, best.y - e.y) : Infinity;
  for (const a of world.friendlyUnits()) {
    if (a.fainted || a.hp <= 0) continue;
    const d = Math.hypot(a.x - e.x, a.y - e.y);
    if (d < bd) { bd = d; best = a; }
  }
  return { u: best, d: bd };
}

function moveToward(world: World, e: Unit, tx: number, ty: number, speedMul: number, dt: number): number {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 4) { e.vx = 0; e.vy = 0; return d; }
  const sp = e.moveSpeed * speedMul * world.speedFactor(e);
  e.vx = (dx / d) * sp; e.vy = (dy / d) * sp;
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (Math.abs(e.vx) > 3) e.facing = Math.sign(e.vx);
  world.collide(e);
  return d;
}

function set(w: WildState, mode: WildMode, t: number): void {
  w.mode = mode;
  w.t = t;
}

/** Sleeping is tied to the creature's activity cycle (diurnal sleep at night, nocturnal by day). */
function drowsy(world: World, w: WildState): boolean {
  return world.env.night !== w.nocturnal;
}

export function updateWild(world: World, e: Unit, dtIn: number): void {
  const w = e.wild!;
  const rng = world.rng;
  const threat = nearestThreat(world, e);
  let dt = dtIn;

  // AI level-of-detail: calm creatures far from the player think and move at a low tick rate
  if (threat.d > LOD_DIST && !e.hostile) {
    w.lodT -= dtIn;
    if (w.lodT > 0) return;
    w.lodT = LOD_TICK;
    dt = LOD_TICK;
  }
  w.t -= dt;

  // Getting hit always wakes a creature up and makes it react
  if (e.hostile && (w.mode === 'idle' || w.mode === 'wander' || w.mode === 'eat' || w.mode === 'sleep' || w.mode === 'alert')) {
    w.threat = w.lastAttacker && !w.lastAttacker.fainted ? w.lastAttacker : threat.u;
    if (w.temperament === 'timid' && e.hp / e.maxHp < 0.5) set(w, 'flee', 4);
    else set(w, 'chase', 0);
    if (w.pack) rallyPack(world, e, w.threat);
  }

  switch (w.mode) {
    case 'idle':
    case 'eat': {
      e.vx = 0; e.vy = 0;
      if (perceive(world, e, w, threat)) break;
      if (w.t > 0) break;
      const r = rng.next();
      // pack members drift after their leader; once it is gone they settle where they are
      if (w.follow) {
        if (w.follow.alive && !w.follow.captured) { w.homeX = w.follow.x; w.homeY = w.follow.y; } else w.follow = null;
      }
      if (drowsy(world, w) && r < 0.45) set(w, 'sleep', 8 + rng.next() * 10);
      else if (r < 0.7) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(20, w.homeR);
        w.wanderX = w.homeX + Math.cos(a) * d; w.wanderY = w.homeY + Math.sin(a) * d;
        set(w, 'wander', 6);
      } else set(w, 'eat', 2 + rng.next() * 2.5);
      break;
    }
    case 'wander': {
      if (perceive(world, e, w, threat)) break;
      const d = moveToward(world, e, w.wanderX, w.wanderY, 0.45, dt);
      if (d < 8 || w.t <= 0 || (Math.abs(e.x - e.lastX) + Math.abs(e.y - e.lastY) < 0.01 && w.t < 5)) set(w, 'idle', 1 + rng.next() * 2.5);
      break;
    }
    case 'sleep': {
      e.vx = 0; e.vy = 0;
      if (threat.d < w.aggroR * 0.35 || (!drowsy(world, w) && w.t <= 0)) set(w, 'alert', 0.8);
      else if (w.t <= 0) w.t = 6;
      break;
    }
    case 'alert': {
      e.vx = 0; e.vy = 0;
      w.threat = threat.u;
      e.facing = threat.u.x >= e.x ? 1 : -1;
      if (w.t > 0) break;
      if (w.territory) {
        // the warning is over: still inside the territory → charge, otherwise let it go
        if (Math.hypot(threat.u.x - w.homeX, threat.u.y - w.homeY) <= w.territory) { e.hostile = true; set(w, 'chase', 0); if (w.pack) rallyPack(world, e, threat.u); }
        else set(w, 'idle', 1);
        break;
      }
      if (threat.d > w.aggroR * 1.4) { set(w, 'idle', 1); break; }
      if (w.temperament === 'timid') set(w, 'flee', 4);
      else if (w.temperament === 'aggressive') { e.hostile = true; set(w, 'chase', 0); if (w.pack) rallyPack(world, e, threat.u); }
      else set(w, 'idle', 1.5); // neutral: watches, only fights back when attacked
      break;
    }
    case 'flee': {
      const src = w.threat ?? threat.u;
      const dx = e.x - src.x, dy = e.y - src.y, d = Math.hypot(dx, dy) || 1;
      moveToward(world, e, e.x + (dx / d) * 80, e.y + (dy / d) * 80, 1.25, dt);
      if (d > 460 || w.t <= 0) {
        w.fled = d > 460;
        e.hostile = false;
        w.homeX = e.x; w.homeY = e.y; // settles somewhere new
        set(w, 'idle', 2);
      }
      break;
    }
    case 'chase':
    case 'attack': {
      // the leader went down: followers that are not born fighters scatter
      if (w.follow && (!w.follow.alive || w.follow.fainted)) {
        w.follow = null;
        if (w.temperament !== 'aggressive') { e.hostile = false; w.threat = threat.u; set(w, 'flee', 4); break; }
      }
      const tg = pickTarget(world, e, w, threat.u);
      e.target = tg;
      const dHome = Math.hypot(e.x - w.homeX, e.y - w.homeY);
      const dT = Math.hypot(tg.x - e.x, tg.y - e.y);
      // territorial: the chase ends once the intruder is well outside the guarded ground
      const gone = w.territory ? Math.hypot(tg.x - w.homeX, tg.y - w.homeY) > w.territory * 1.25 : dT > w.aggroR * 3.2;
      if (dHome > w.leash || gone) { w.calmT += dt; } else w.calmT = 0;
      if (w.calmT > 2.5 || (world.trainer.hp <= 0 && (!world.companion || world.companion.trainer.hp <= 0))) { set(w, 'return', 0); e.hostile = false; break; }

      const maxRange = Math.max(...e.skills.map((s) => (s.def.power > 0 || s.def.kind === 'debuff' ? s.def.range : 0)), 50);
      const ranged = e.role === 'marksman' || e.role === 'mage' || e.role === 'support';
      const want = ranged ? maxRange * 0.7 : 0;
      if (dT > want + 6) moveToward(world, e, tg.x, tg.y, 0.95, dt);
      else if (ranged && dT < want * 0.6) {
        const dx = e.x - tg.x, dy = e.y - tg.y, d = Math.hypot(dx, dy) || 1;
        moveToward(world, e, e.x + (dx / d) * 40, e.y + (dy / d) * 40, 0.8, dt);
      } else { e.vx = 0; e.vy = 0; e.facing = tg.x >= e.x ? 1 : -1; }
      w.mode = dT <= maxRange ? 'attack' : 'chase';

      e.aiTimer -= dt;
      if (w.mode === 'attack' && e.aiTimer <= 0) {
        e.aiTimer = 0.35;
        const choice = chooseSkill(e.skills.map((s) => ({ def: s.def, cooldownLeft: s.cd })), world.selectorContext(e));
        if (choice) { e.castTarget = tg; world.beginCast(e, choice.slot); }
      }
      if (!ranged) world.contact(e, tg);
      break;
    }
    case 'return': {
      e.hostile = false;
      const d = moveToward(world, e, w.homeX, w.homeY, 1.1, dt);
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
      if (d < 12) set(w, 'idle', 1.5);
      break;
    }
  }
}

/** Notices the trainer/party; returns true if the state changed. */
function perceive(world: World, _e: Unit, w: WildState, threat: { u: Unit; d: number }): boolean {
  if (w.territory) {
    // territory is measured from home, not from the creature: stepping onto its ground is what counts
    if (Math.hypot(threat.u.x - w.homeX, threat.u.y - w.homeY) > w.territory) return false;
    w.threat = threat.u;
    set(w, 'alert', TERRITORY_WARN);
    return true;
  }
  if (threat.d > w.aggroR) return false;
  w.threat = threat.u;
  set(w, 'alert', w.temperament === 'aggressive' ? 0.5 : 0.7);
  void world;
  return true;
}

/** One member was attacked or charged: nearby pack-mates join in (the timid ones scatter, the leader always fights). */
export function rallyPack(world: World, e: Unit, threat: Unit | null): void {
  const pack = e.wild?.pack;
  if (!pack) return;
  for (const o of world.enemies) {
    const ow = o.wild;
    if (o === e || !o.alive || o.captured || !ow || ow.pack !== pack || o.hostile || ow.mode === 'flee') continue;
    if (Math.hypot(o.x - e.x, o.y - e.y) > PACK_ALARM_R) continue;
    ow.threat = threat;
    if (ow.temperament === 'timid' && !ow.leader) { set(ow, 'flee', 4); continue; }
    o.hostile = true;
    if (threat && threat.team !== o.team) ow.lastAttacker = threat;
    set(ow, 'chase', 0);
  }
}

function pickTarget(world: World, e: Unit, w: WildState, nearest: Unit): Unit {
  const a = w.lastAttacker;
  if (a && a.alive && !a.fainted && Math.hypot(a.x - e.x, a.y - e.y) < w.aggroR * 2.5) return a;
  // Taunt and proximity rules are shared with Survivor enemies
  const t = world.enemyPickTarget(e);
  return t.fainted ? nearest : t;
}
