import { describe, expect, it } from 'vitest';
import { bestMount, RIDE_MIN_LEVEL, rideModeFor, rideModes, rideModesAt, rideSpeed, rideText } from '../src/core/riding';
import { STEP, World, type Terrain } from '../src/core/world';

// Riding party Pokémon (core/riding.ts): who can carry the trainer, how fast, where.

/** a strip map: x < 1000 land, 1000 ≤ x < 2000 water, x ≥ 2000 a wall (buildings) */
const terrain: Terrain = {
  blocksMove: (x) => x >= 1000,
  blocksShot: (x) => x >= 2000,
  isWater: (x) => x >= 1000 && x < 2000,
  blocksFly: (x) => x >= 2000,
};
const world = () => {
  const w = new World({ mode: 'adventure', seed: 2, width: 3000, height: 1000, terrain });
  w.teleport(900, 500);
  return w;
};
const walk = (w: World, secs: number, dx = 1) => {
  w.input = { x: dx, y: 0 };
  for (let t = 0; t < secs; t += STEP) w.step(STEP);
  w.input = { x: 0, y: 0 };
};

describe('who can be ridden', () => {
  it('by body size and type', () => {
    expect(rideModes('rapidash')).toEqual(['run']);
    expect(rideModes('lapras')).toContain('swim');
    expect(rideModes('charizard')).toEqual(expect.arrayContaining(['run', 'fly']));
    expect(rideModes('pidgeot')).toContain('fly');
    expect(rideModes('latios')).toContain('fly');
    expect(rideModes('pikachu')).toEqual([]); // 0.4 m
    expect(rideModes('butterfree')).toEqual([]); // 1.1 m, 32 kg: too light to run, too small to fly
    expect(rideModes('magikarp')).toEqual([]);
    expect(rideModes('gastly')).toEqual([]);
    expect(rideModes('machamp')).toEqual([]); // upright two-legged body
    expect(rideModes('snorlax')).toContain('run'); // …but Snorlax's belly carries anyone
  });

  it('levels gate the modes', () => {
    expect(rideModesAt('charizard', RIDE_MIN_LEVEL.fly - 1)).toEqual(['run']);
    expect(rideModesAt('charizard', RIDE_MIN_LEVEL.fly)).toEqual(expect.arrayContaining(['run', 'fly']));
    expect(rideModesAt('rapidash', 10)).toEqual([]);
  });

  it('speed follows base Speed', () => {
    expect(rideSpeed('rapidash', 'run')).toBeGreaterThan(rideSpeed('snorlax', 'run'));
    expect(rideSpeed('sharpedo', 'swim')).toBeGreaterThan(rideSpeed('lapras', 'swim'));
    expect(rideSpeed('pidgeot', 'fly')).toBeGreaterThan(rideSpeed('pidgeot', 'run'));
    for (const [sp, m] of [['rapidash', 'run'], ['lapras', 'swim'], ['dragonite', 'fly']] as const) {
      expect(rideSpeed(sp, m)).toBeGreaterThan(0.8);
      expect(rideSpeed(sp, m)).toBeLessThanOrEqual(2.2);
    }
    expect(rideText('rapidash', 40)).toMatch(/^Cưỡi: Chạy ×1\.\d\d$/);
    expect(rideText('pikachu', 40)).toBeNull();
  });

  it('mode for the spot, best mount of a party', () => {
    expect(rideModeFor(['run', 'fly'], true)).toBe('fly');
    expect(rideModeFor(['run'], true)).toBeNull();
    expect(rideModeFor(['swim'], false)).toBeNull();
    const party = [{ species: 'snorlax', level: 40 }, { species: 'rapidash', level: 40 }, { species: 'lapras', level: 40 }];
    expect(bestMount(party, false)?.species).toBe('rapidash');
    expect(bestMount(party, true)?.species).toBe('lapras');
  });
});

describe('riding in the world', () => {
  it('a runner is faster than walking and stops at the water', () => {
    const w = world();
    w.teleport(100, 500);
    walk(w, 1);
    const walked = w.trainer.x - 100;
    const w2 = world();
    w2.teleport(100, 500);
    expect(w2.startRide('rapidash', { level: 40 })).toBe(true);
    walk(w2, 1);
    expect((w2.trainer.x - 100) / walked).toBeCloseTo(rideSpeed('rapidash', 'run'), 1);
    walk(w2, 6);
    expect(w2.trainer.x).toBeLessThan(1000);
    expect(w2.mount?.x).toBeCloseTo(w2.trainer.x, 0);
  });

  it('a swimmer crosses the water but not onto land; a flyer crosses water, not buildings', () => {
    const w = world();
    w.teleport(1200, 500);
    expect(w.startRide('rapidash', { level: 40 })).toBe(false); // a runner can't stand on water
    expect(w.startRide('lapras', { level: 40 })).toBe(true);
    expect(w.ride?.mode).toBe('swim');
    expect(w.mount?.aquatic).toBe(true);
    walk(w, 10);
    expect(w.trainer.x).toBeGreaterThan(1500);
    expect(w.trainer.x).toBeLessThan(2000);
    expect(w.stopRide()).toBe(false); // can't get off in the water

    const f = world();
    expect(f.startRide('pidgeot', { level: 40 })).toBe(true);
    expect(f.ride?.mode).toBe('fly');
    walk(f, 10);
    expect(f.trainer.x).toBeGreaterThan(1500);
    expect(f.trainer.x).toBeLessThan(2000);
  });

  it('Vietnam rivers before the boat: no mount goes onto the water', () => {
    const w = world();
    w.rideNoWater = true;
    expect(w.startRide('pidgeot', { level: 40 })).toBe(true);
    walk(w, 6);
    expect(w.trainer.x).toBeLessThan(1000);
  });

  it('getting off on land; nothing to ride below the levels', () => {
    const w = world();
    expect(w.startRide('rapidash', { level: 10 })).toBe(false);
    expect(w.startRide('rapidash', { level: 40 })).toBe(true);
    expect(w.stopRide()).toBe(true);
    expect(w.ride).toBeNull();
    expect(w.mount).toBeNull();
  });
});
