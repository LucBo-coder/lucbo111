// Gigantamax animation frames (V32), drawn from the single 96×96 G-Max picture — pure pixel work, no Phaser, so it
// is unit-tested and runs on any copy of the art (normal or shiny). The field giant plays them as:
//  • idle   (8 frames, loop): breathing (stretch anchored at the feet), a slow sway that grows toward the head,
//                             a glint sweeping over its glowing G-Max parts, and flickering flames for the fire forms
//  • attack (4 frames):       wind-up, lunge forward (the art faces left), swell, recover
//  • hurt   (2 frames):       recoil backward, squashed
// Pixels are moved, never repainted from nothing, so every frame keeps the original pixel-art look.

export interface Rgba { w: number; h: number; data: Uint8ClampedArray }

export interface GmaxFrames {
  /** size of one frame */
  w: number;
  h: number;
  frames: Uint8ClampedArray[];
  anims: { idle: number[]; attack: number[]; hurt: number[] };
  /** where the feet are, as a fraction of the frame (sprite origin) */
  originX: number;
  originY: number;
}

/** G-Max forms whose glow is fire: their flames flicker upward. */
export const GMAX_FLAME = new Set(['charizard', 'cinderace', 'centiskorch', 'coalossal']);

const PAD_X = 10, PAD_TOP = 8, PAD_BOTTOM = 2;

interface Pose { sy: number; shear: number; dx: number; bright: number; glint: number; flicker: boolean }

const IDLE: Pose[] = Array.from({ length: 8 }, (_, i) => {
  const p = (i / 8) * Math.PI * 2;
  return { sy: 1 + 0.022 * Math.sin(p), shear: 1.6 * Math.sin(p + 0.6), dx: 0, bright: 1, glint: i / 8, flicker: true };
});
const ATTACK: Pose[] = [
  { sy: 0.97, shear: 2.5, dx: 1, bright: 1, glint: 0.1, flicker: true },
  { sy: 1.04, shear: -5, dx: -2, bright: 1.05, glint: 0.35, flicker: true },
  { sy: 1.07, shear: -8, dx: -4, bright: 1.12, glint: 0.6, flicker: true },
  { sy: 1.02, shear: -3, dx: -1, bright: 1.05, glint: 0.85, flicker: true },
];
const HURT: Pose[] = [
  { sy: 0.96, shear: 4, dx: 3, bright: 1, glint: -1, flicker: false },
  { sy: 0.98, shear: 2, dx: 1, bright: 1, glint: -1, flicker: false },
];

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
}

/** Small stable noise in [0, 1). */
function noise(x: number, y: number, f: number): number {
  let n = Math.imul(x * 374761393 + y * 668265263 + f * 2147483647, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function gmaxFrames(src: Rgba, flame = false): GmaxFrames {
  const { w, h, data } = src;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] < 16) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxY < 0) { minX = 0; maxX = w - 1; minY = 0; maxY = h - 1; }
  // glowing G-Max parts (bright, saturated) and, for the fire forms, flame pixels
  const glow = new Uint8Array(w * h), fire = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 16) continue;
    const [hu, s, v] = hsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (s > 0.45 && v > 0.8) glow[i] = 1;
    if (flame && s > 0.55 && v > 0.7 && (hu < 55 || hu > 345)) fire[i] = 1;
  }
  const W = w + PAD_X * 2, H = h + PAD_TOP + PAD_BOTTOM;
  const feet = maxY + PAD_TOP, span = Math.max(1, maxY - minY + 1);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  const poses = [...IDLE, ...ATTACK, ...HURT];
  const frames = poses.map((p, f) => {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      const t = Math.max(0, Math.min(1, (feet - y) / span));
      const shift = p.shear * Math.pow(t, 1.4) + p.dx;
      const sy = Math.round(feet - (feet - y) / p.sy) - PAD_TOP;
      for (let x = 0; x < W; x++) {
        const sx = Math.round(x - shift) - PAD_X;
        let i = at(sx, sy);
        // flames: a pixel of fire takes the colour from just below it now and then, so the fire licks upward
        if (flame && p.flicker) {
          const below = at(sx, sy + 1);
          if (below >= 0 && fire[below] && noise(sx >> 1, sy >> 1, f) > 0.55 && (i < 0 || fire[i] || data[i * 4 + 3] < 16)) i = below;
        }
        if (i < 0 || data[i * 4 + 3] < 16) continue;
        let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        // a diagonal glint sweeping over the glowing parts
        if (p.glint >= 0 && glow[i]) {
          const d = ((sx + (h - sy)) / (w + h) - p.glint + 2) % 1;
          if (d < 0.06 || d > 0.98) { r += (255 - r) * 0.32; g += (255 - g) * 0.32; b += (255 - b) * 0.32; }
        }
        const o = (y * W + x) * 4;
        out[o] = r * p.bright; out[o + 1] = g * p.bright; out[o + 2] = b * p.bright; out[o + 3] = data[i * 4 + 3];
      }
    }
    return out;
  });
  return {
    w: W, h: H, frames,
    anims: { idle: [0, 1, 2, 3, 4, 5, 6, 7], attack: [8, 9, 10, 11], hurt: [12, 13] },
    originX: ((minX + maxX) / 2 + PAD_X) / W, originY: (feet + 1) / H,
  };
}
