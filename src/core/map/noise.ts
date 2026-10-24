/** Integer hash → [0,1). Deterministic, used for per-tile decoration decisions. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0,1) with bilinear smoothing. */
export function valueNoise(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Two-octave fractal noise. */
export function fbm(x: number, y: number, scale: number, seed = 0): number {
  return valueNoise(x, y, scale, seed) * 0.65 + valueNoise(x, y, scale / 2.3, seed + 17) * 0.35;
}
