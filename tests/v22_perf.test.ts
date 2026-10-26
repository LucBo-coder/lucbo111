import { describe, expect, it, vi } from 'vitest';
import { STEP, World } from '../src/core/world';
import { makeWildState } from '../src/core/wildAI';

// V22 performance: the wild AI's level of detail (core/wildAI.ts). Calm wild Pokémon farther than 1000 px think
// at 2.5 Hz; between those ticks nothing runs — not even the threat scan (which builds the list of friendly units).

const world = () => {
  const w = new World({ mode: 'adventure', seed: 9, width: 12000, height: 12000 });
  w.teleport(6000, 6000);
  return w;
};
const wild = (w: World, x: number, y: number) => w.spawnWild('rattata', 8, x, y, { wild: makeWildState(x, y, 'neutral') });

describe('V22 performance: wild AI level of detail', () => {
  it('200 far calm wild Pokémon scan for threats ~2.5×/s instead of every frame', () => {
    const w = world();
    for (let i = 0; i < 200; i++) wild(w, 6000 + 1400 + (i % 20) * 40, 6000 - 400 + Math.floor(i / 20) * 80);
    for (let i = 0; i < 30; i++) w.step(STEP);
    const spy = vi.spyOn(w, 'friendlyUnits');
    for (let i = 0; i < 120; i++) w.step(STEP); // 2 s
    const scans = spy.mock.calls.length;
    spy.mockRestore();
    // 200 Pokémon × 2 s × 2.5 Hz ≈ 1000 (+ a few scans by the rest of the world); every frame would be 24 000
    expect(scans).toBeLessThan(1500);
  });

  it('near or hostile wild Pokémon still think every frame', () => {
    const w = world();
    const near = wild(w, 6300, 6000);
    const far = wild(w, 7600, 6000);
    far.hostile = true;
    for (let i = 0; i < 30; i++) w.step(STEP);
    expect(near.wild!.lodT).toBe(0);
    expect(far.wild!.lodT).toBe(0);
  });

  it('a far wild Pokémon still wanders, and reacts once the trainer comes near', () => {
    const w = world();
    const e = wild(w, 6000 + 1400, 6000);
    const x0 = e.x, y0 = e.y;
    for (let i = 0; i < 60 * 15; i++) w.step(STEP);
    expect(Math.hypot(e.x - x0, e.y - y0)).toBeGreaterThan(5);
    w.teleport(e.x - 150, e.y);
    for (let i = 0; i < 30; i++) w.step(STEP); // within one LOD tick (0.4 s) it is back to full rate
    expect(e.wild!.lodT).toBe(0);
  });
});
