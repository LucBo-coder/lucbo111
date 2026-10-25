import { afterEach, describe, expect, it, vi } from 'vitest';
import { World, STEP } from '../src/core/world';
import { CoopHost, CoopMirror, coopSession, packCoop } from '../src/net/coop';
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
    expect(sent).toEqual([{ t: 'coopLoot', reward: { currency: 150, items: { potion: 2 }, note: 'Rương báu' } }]);
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
});
