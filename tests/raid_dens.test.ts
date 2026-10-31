import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { maxStars, RAID_TIERS, raidDenRewards, raidLevel, rollKind, rollStars, starsText } from '../src/core/raidDens';

describe('raid dens (V32)', () => {
  it('star ratings open up with progress and lower ones stay more common', () => {
    expect([0, 1, 2, 4, 6, 8, 20].map(maxStars)).toEqual([1, 2, 3, 4, 5, 6, 6]);
    const rng = new Rng(7);
    expect(new Set(Array.from({ length: 200 }, () => rollStars(rng, 0)))).toEqual(new Set([1]));
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[rollStars(rng, 10)]++;
    expect(counts[1]).toBeGreaterThan(counts[3]);
    expect(counts[3]).toBeGreaterThan(counts[5]);
    expect(counts[6]).toBeGreaterThan(0);
    expect(counts[6]).toBeLessThan(counts[5]);
  });

  it('giants need the Dynamax Band, Gigantamax dens start at 3★', () => {
    const rng = new Rng(3);
    expect(new Set(Array.from({ length: 300 }, () => rollKind(rng, 5, false, true)))).toEqual(new Set(['tera']));
    expect(new Set(Array.from({ length: 300 }, () => rollKind(rng, 2, true, true))).has('gmax')).toBe(false);
    expect(new Set(Array.from({ length: 600 }, () => rollKind(rng, 4, true, true)))).toEqual(new Set(['tera', 'dynamax', 'gmax']));
  });

  it('harder tiers: stronger, shorter, shielded, harder to catch', () => {
    for (let s = 2; s <= 6; s++) {
      const a = RAID_TIERS[(s - 1) as 1], b = RAID_TIERS[s as 1];
      expect(b.levelOffset).toBeGreaterThan(a.levelOffset);
      expect(b.hpMult).toBeGreaterThan(a.hpMult);
      expect(b.time).toBeLessThanOrEqual(a.time);
      expect(b.shields.length).toBeGreaterThanOrEqual(a.shields.length);
      expect(b.catchMult).toBeLessThan(a.catchMult);
    }
    expect(RAID_TIERS[1].shields).toEqual([]);
    expect(raidLevel(6, 95)).toBe(100);
    expect(raidLevel(1, 8)).toBe(5);
  });

  it('rewards grow with stars; G-Max always gives Max Soup, Tera gives more shards', () => {
    const r1 = raidDenRewards(1, 'dynamax', 0.99), r6 = raidDenRewards(6, 'dynamax', 0.99);
    expect(r6.money).toBeGreaterThan(r1.money);
    expect(r6.items['rare-candy']).toBe(2);
    expect(raidDenRewards(3, 'gmax', 0.99).items['max-soup']).toBe(1);
    expect(raidDenRewards(3, 'dynamax', 0.99).items['max-soup']).toBeUndefined();
    expect(raidDenRewards(4, 'tera', 0.5).items['tera-shard']).toBe(12);
    expect(raidDenRewards(4, 'dynamax', 0.5).items['tera-shard']).toBe(4);
    expect(starsText(3)).toBe('★★★☆☆☆');
  });
});
