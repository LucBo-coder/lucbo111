import { describe, expect, it } from 'vitest';
import { BOSSES, validateData } from '../src/core/data';
import { Rng } from '../src/core/rng';
import {
  GIANTS_AFTER, isWormholeLegend, pickWormholeLegend, speciesGen, ULTRA_BEASTS, WORMHOLE_POOL, wormholeCandidates, wormholeKind, wormholeLevel,
} from '../src/core/ultraWormhole';
import { STEP, World } from '../src/core/world';

// Ultra Wormholes: every Gen 5–9 Legendary / Mythical and the Ultra Beasts (core/ultraWormhole.ts).

describe('the wormhole pool', () => {
  it('covers Gen 5–9 legendaries, mythicals and the Ultra Beasts, nothing older', () => {
    for (const id of ['reshiram', 'zekrom', 'kyurem', 'xerneas', 'yveltal', 'solgaleo', 'lunala', 'necrozma', 'zacian', 'eternatus', 'calyrex', 'koraidon', 'miraidon', 'terapagos', 'pecharunt', 'tapu-koko', 'meloetta'])
      expect(isWormholeLegend(id), id).toBe(true);
    for (const id of ULTRA_BEASTS) expect(isWormholeLegend(id), id).toBe(true);
    for (const id of ['raikou', 'rayquaza', 'arceus', 'mewtwo', 'pikachu']) expect(isWormholeLegend(id), id).toBe(false);
    expect(WORMHOLE_POOL.length).toBeGreaterThanOrEqual(65);
    for (const id of WORMHOLE_POOL) expect(speciesGen(id) >= 5 || ULTRA_BEASTS.has(id), id).toBe(true);
  });

  it('kinds, levels and the giants coming later', () => {
    expect(wormholeKind('nihilego')).toBe('ultra-beast');
    expect(wormholeKind('zekrom')).toBe('giant');
    expect(wormholeKind('victini')).toBe('mythical');
    expect(wormholeKind('cobalion')).toBe('legendary');
    expect(wormholeLevel('zekrom', 1)).toBe(58);
    expect(wormholeLevel('zekrom', 3)).toBe(62);
    const early = wormholeCandidates(() => false, 0);
    expect(early).not.toContain('zekrom');
    expect(early).toContain('nihilego');
    expect(wormholeCandidates(() => false, GIANTS_AFTER)).toContain('zekrom');
    expect(wormholeCandidates((id) => id === 'nihilego', 0)).not.toContain('nihilego');
  });

  it('Ultra Beasts come through most often', () => {
    const rng = new Rng(7), all = wormholeCandidates(() => false, GIANTS_AFTER);
    const seen: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) { const k = wormholeKind(pickWormholeLegend(rng, all)!); seen[k] = (seen[k] ?? 0) + 1; }
    const per = (k: string) => seen[k] / all.filter((id) => wormholeKind(id) === k).length;
    expect(per('ultra-beast')).toBeGreaterThan(per('legendary'));
    expect(per('legendary')).toBeGreaterThan(per('giant'));
    expect(pickWormholeLegend(rng, [])).toBeNull();
  });

  it('data stays valid and every new boss fights in the world, ending WEAKENED for capture', () => {
    expect(validateData()).toEqual([]);
    for (const id of WORMHOLE_POOL) {
      const def = BOSSES.get(id)!;
      expect(def.ai, id).toBe('legendary');
      const w = new World({ mode: 'adventure', seed: 4, width: 3000, height: 3000 });
      w.addPokemon('garchomp', { level: 60 });
      const b = w.spawnBoss(id, wormholeLevel(id, 1), false, { x: w.trainer.x + 200, y: w.trainer.y });
      for (let t = 0; t < 3; t += STEP) w.step(STEP);
      expect(b.alive, id).toBe(true);
      w.applyDamage(b, b.hp * 10, null);
      for (let t = 0; t < 2; t += STEP) w.step(STEP);
      expect(b.alive || b.boss?.weakened, id).toBeTruthy();
    }
  });
});
