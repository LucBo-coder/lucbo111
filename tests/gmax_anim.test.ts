import { describe, expect, it } from 'vitest';
import { gmaxFrames } from '../src/render/gmaxAnimFrames';

// a 20×30 "creature": blue body, an orange flame on top, transparent around
function art(): { w: number; h: number; data: Uint8ClampedArray } {
  const w = 20, h = 30, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 5; y < 28; y++) for (let x = 6; x < 14; x++) {
    const o = (y * w + x) * 4, flame = y < 12;
    data.set(flame ? [255, 140, 20, 255] : [40, 60, 160, 255], o);
  }
  return { w, h, data };
}
const opaque = (f: Uint8ClampedArray) => f.reduce((n, _, i) => n + (i % 4 === 3 && f[i] > 0 ? 1 : 0), 0);
const rows = (f: Uint8ClampedArray, w: number) => { const ys = new Set<number>(); for (let i = 3; i < f.length; i += 4) if (f[i]) ys.add(Math.floor((i - 3) / 4 / w)); return [...ys]; };

describe('Gigantamax animation frames', () => {
  it('idle / attack / hurt frames, padded, feet anchored at the bottom of the art', () => {
    const r = gmaxFrames(art());
    expect(r.frames).toHaveLength(14);
    expect(r.anims).toEqual({ idle: [0, 1, 2, 3, 4, 5, 6, 7], attack: [8, 9, 10, 11], hurt: [12, 13] });
    expect(r.w).toBe(40); expect(r.h).toBe(40);
    for (const f of r.frames) expect(f.length).toBe(r.w * r.h * 4);
    // the feet row never moves: every frame's lowest opaque row is the art's lowest row
    const feet = Math.round(r.originY * r.h) - 1;
    for (const f of r.frames) expect(Math.max(...rows(f, r.w))).toBe(feet);
    expect(r.originX).toBeCloseTo((9.5 + 10) / 40);
  });

  it('frames really differ (breathing, lunge) and keep the picture whole', () => {
    const r = gmaxFrames(art());
    const key = (f: Uint8ClampedArray) => Array.from(f).join(',');
    expect(new Set(r.frames.slice(0, 8).map(key)).size).toBeGreaterThan(4);
    expect(key(r.frames[10])).not.toBe(key(r.frames[0]));
    const area = 8 * 23;
    for (const f of r.frames) expect(Math.abs(opaque(f) - area) / area).toBeLessThan(0.15);
  });

  it('the attack lunges toward the facing side (left) and the hurt frame recoils (right)', () => {
    const r = gmaxFrames(art());
    const topLeft = (f: Uint8ClampedArray) => { for (let x = 0; x < r.w; x++) if (f[(16 * r.w + x) * 4 + 3]) return x; return -1; };
    expect(topLeft(r.frames[10])).toBeLessThan(topLeft(r.frames[0]));
    expect(topLeft(r.frames[12])).toBeGreaterThan(topLeft(r.frames[0]));
  });

  it('fire forms flicker: some flame frames differ from the same pose without flames', () => {
    const plain = gmaxFrames(art(), false), fire = gmaxFrames(art(), true);
    const diff = plain.frames.filter((f, i) => f.some((v, j) => v !== fire.frames[i][j])).length;
    expect(diff).toBeGreaterThan(4);
  });
});
