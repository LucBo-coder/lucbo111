import { afterEach, describe, expect, it, vi } from 'vitest';
import { World, STEP } from '../src/core/world';
import { applyCoopDelta, CoopHost, CoopMirror, coopSession, diffCoop, packCoop, type CoopSnapshot } from '../src/net/coop';
import { net } from '../src/net/session';
import type { NetMsg } from '../src/net/protocol';

const map = { kind: 'region' as const, id: 'starter-valley', width: 1600, height: 1200 };
function world(mode: 'adventure' | 'survivor' = 'adventure') {
  const w = new World({ mode, seed: 123, obstacles: false, width: map.width, height: map.height });
  w.addCompanion();
  w.addPokemon('pikachu', { companion: true, level: 30 });
  return w;
}
afterEach(() => { vi.restoreAllMocks(); coopSession.active = false; net.role = null; net.status = 'idle'; });

describe('co-op PvE world', () => {
  it.each(['survivor', 'adventure'] as const)('independent movement and party ownership in %s', mode => {
    const w = world(mode), side = w.companion!, initial = w.trainer.x;
    side.input.x = 1;
    w.step();
    expect(side.trainer.x).toBeGreaterThan(initial);
    expect(w.trainer.x).toBe(initial);
    expect(w.sideOf(side.allies[0])).toBe(side);
    expect(side.allies[0].team).toBe('ally');
    w.removePokemon(side.allies[0]);
    expect(side.allies).toHaveLength(0);
  });
  it('both parties damage the same enemy without attacking one another', () => {
    const w = world();
    const home = w.addPokemon('pikachu', { level: 30 }), guest = w.companion!.allies[0];
    const enemy = w.spawnWild('snorlax', 20, w.trainer.x + 80, w.trainer.y, { hostile: true, hpMult: 30 });
    w.setCommand('attack', enemy); w.setCommand('attack', enemy, w.companion!);
    for (let i = 0; i < 600; i++) w.step(STEP);
    expect(home.damageDealt).toBeGreaterThan(0);
    expect(guest.damageDealt).toBeGreaterThan(0);
    expect(home.target?.team).not.toBe('ally');
    expect(guest.target?.team).not.toBe('ally');
  });
  it('host shares loot with the guest only while one is attached', () => {
    const w = world();
    coopSession.active = true; net.role = 'host'; net.status = 'connected';
    const sent: NetMsg[] = [];
    vi.spyOn(net, 'send').mockImplementation((m: NetMsg) => { sent.push(m); });
    const host = new CoopHost(w, () => map);
    host.grant({ currency: 150, items: { potion: 2 }, note: 'Rương báu' });
    expect(sent).toEqual([{ t: 'coopLoot', reward: { currency: 150, items: { potion: 2 }, note: 'Rương báu', wallet: 'adventure' }, id: `${host.epoch}:1` }]);
    w.removeCompanion();
    host.grant({ currency: 10 });
    expect(sent).toHaveLength(1);
    host.destroy();
  });
  it('enemies can target the guest and both trainers must fall to lose', () => {
    const w = world(), side = w.companion!;
    w.trainer.x = 100; side.trainer.x = 600; side.allies[0].x = 100;
    const e = w.spawnWild('rattata', 5, 610, side.trainer.y, { hostile: true });
    expect(w.enemyPickTarget(e)).toBe(side.trainer);
    w.trainer.hp = 0; w.step(); expect(w.state).toBe('playing');
    side.trainer.hp = 0; w.step(); expect(w.state).toBe('gameover');
  });
  it('guest collects shared EXP and levels with the host in survivor', () => {
    const w = world('survivor'), side = w.companion!;
    side.trainer.x += 300;
    w.gems.push({ active: true, x: side.trainer.x, y: side.trainer.y, value: w.expNext, pulled: false, kind: 'exp' });
    w.step();
    expect(w.level).toBe(2);
    expect(side.allies[0].level).toBe(6);
    expect(w.gems[0]?.active ?? false).toBe(false);
  });
  it('disconnect removes stale targets and party without touching the host', () => {
    const w = world(), side = w.companion!, e = w.spawnWild('rattata', 5, 700, 600);
    e.target = e.castTarget = side.trainer;
    w.removeCompanion();
    expect(w.companion).toBeNull(); expect(e.target).toBeNull(); expect(e.castTarget).toBeNull();
    expect(w.sides()).toEqual([w.home]);
  });
});

describe('co-op snapshots and inputs', () => {
  it('JSON roundtrip includes shared enemies, bosses and guest perspective; ignores stale frames', () => {
    const w = world();
    const b = w.spawnBoss('onix', 10, false);
    const s = JSON.parse(JSON.stringify(packCoop(w, map, 'first', 5, false)));
    const mirror = new CoopMirror(map);
    expect(mirror.apply(s)).toBe(true);
    expect(mirror.world.trainer.id).toBe(w.companion!.trainer.id);
    expect(mirror.world.companion!.trainer.id).toBe(w.trainer.id);
    expect(mirror.world.enemies.find(e => e.id === b.id)?.boss?.def.id).toBe(b.boss!.def.id);
    expect(mirror.apply({ ...s, n: 4 })).toBe(false);
    expect(mirror.apply({ ...s, epoch: 'new-map', n: 1 })).toBe(true);
  });
  it('validates party, input sequence/epoch, clamps movement and stops stale input', () => {
    let receive!: (m: NetMsg) => void;
    vi.spyOn(net, 'on').mockImplementation(cb => { receive = cb; return () => {}; });
    vi.spyOn(net, 'send').mockImplementation(() => {});
    net.role = 'host'; net.status = 'connected'; coopSession.active = true;
    const w = new World({ mode: 'adventure', obstacles: false });
    const host = new CoopHost(w, () => map);
    receive({ t: 'coopJoin', party: [{ species: 'missingno', level: 5 }] });
    expect(w.companion).toBeNull();
    receive({ t: 'coopJoin', party: [{ species: 'pikachu', level: 5 }] });
    const input: NetMsg = { t: 'coopInput', epoch: host.epoch, seq: 2, x: 99, y: -99, run: true, command: 'follow' };
    receive(input); expect(w.companion!.input).toEqual({ x: 1, y: -1 });
    receive({ ...input, seq: 1, x: 0 }); expect(w.companion!.input.x).toBe(1);
    receive({ ...input, seq: 3, epoch: 'old', x: 0 }); expect(w.companion!.input.x).toBe(1);
    receive({ ...input, seq: 3, x: NaN }); expect(w.companion!.input.x).toBe(1);
    host.update(performance.now() + 2000, false, []);
    expect(w.companion!.input).toEqual({ x: 0, y: 0 });
    host.destroy();
  });
  it('deltas rebuild the exact snapshot and refuse a wrong base', () => {
    const w = world('survivor');
    w.spawnWild('rattata', 5, 700, 600, { hostile: true });
    const a = packCoop(w, map, 'e', 1, false);
    w.companion!.input.x = 1;
    for (let i = 0; i < 5; i++) w.step();
    w.spawnWild('pidgey', 5, 900, 600, { hostile: true });
    const b = packCoop(w, map, 'e', 2, false);
    const d = JSON.parse(JSON.stringify(diffCoop(a, b)));
    expect(JSON.stringify(d).length).toBeLessThan(JSON.stringify(b).length / 2);
    expect(d.units[w.trainer.id]?.name).toBeUndefined(); // static fields stay out
    expect(applyCoopDelta(a, d)).toEqual(b);
    expect(applyCoopDelta({ ...a, n: 0 }, d)).toBeNull();
    expect(applyCoopDelta(null, d)).toBeNull();
  });
  it('host sends keyframes, then deltas; obstacles only when the guest lacks them', () => {
    const sent: NetMsg[] = [];
    let receive!: (m: NetMsg) => void;
    vi.spyOn(net, 'on').mockImplementation(cb => { receive = cb; return () => {}; });
    vi.spyOn(net, 'send').mockImplementation((m: NetMsg) => { sent.push(m); });
    net.role = 'host'; net.status = 'connected'; coopSession.active = true;
    const w = new World({ mode: 'survivor', seed: 5, width: 1600, height: 1200 });
    const host = new CoopHost(w, () => ({ ...map, kind: 'survivor' }));
    receive({ t: 'coopJoin', party: [{ species: 'pikachu', level: 5 }] });
    const snaps = () => sent.filter((m): m is Extract<NetMsg, { t: 'coopSnap' }> => m.t === 'coopSnap').map(m => m.s);
    let t = 1000;
    for (let i = 0; i < 3; i++) host.update(t += 120, false, []);
    const [k, d1] = snaps();
    expect('d' in k).toBe(false);
    expect((k as CoopSnapshot).obstacles.length).toBe(w.obstacles.length);
    expect('d' in d1).toBe(true);
    // the guest reports it holds this obstacle version: the next keyframes leave the list out
    receive({ t: 'coopJoin', party: [{ species: 'pikachu', level: 5 }], obs: (k as CoopSnapshot).obsSig, need: true });
    host.update(t += 120, false, []);
    const k2 = snaps().pop() as CoopSnapshot;
    expect(k2.noObs).toBe(true);
    expect(k2.obstacles).toEqual([]);
    host.destroy();
  });
  it('guest prediction moves its own trainer at once and settles on the host position', () => {
    const w = world(), s = packCoop(w, map, 'p', 1, false);
    const m = new CoopMirror(map);
    m.apply(s);
    const x0 = m.world.trainer.x, t0 = performance.now();
    m.input(1, 1, 0, false, t0);
    m.interpolate(16, t0 + 100);
    expect(m.world.trainer.x).toBeGreaterThan(x0 + 3);
    // host acknowledges the input with the trainer moved: no pending input left, the mirror converges to it
    const s2 = { ...packCoop(w, map, 'p', 2, false), ack: 1 };
    s2.guest[0] = { ...s2.guest[0], x: x0 + 20 };
    m.apply(s2);
    for (let i = 0; i < 60; i++) m.interpolate(16, t0 + 200 + i * 16);
    expect(m.world.trainer.x).toBeCloseTo(x0 + 20, 0);
  });
});
