// Không Gian Ultra's colour grades (V38): one alien base grade (green → violet, water stays blue-violet), then each
// island turned to its own hue, so the eight worlds read apart at a glance — wine-red ash at the crater, amber desert,
// steel-blue plant, icy cyan forest… A hue rotation on top of the base keeps water, grass and paths apart (a plain
// rotation of the raw art turned the water orange like lava). Pure maths: the renderer, tree textures and the minimap
// all use these.

/** The base grade, a 4×5 colour matrix (rows R G B A, as Phaser's ColorMatrix.set takes it). */
export const ULTRA_MATRIX: readonly number[] = [
  0.27, 0.63, 0, 0, 0,
  0.45, 0.18, 0, 0, 0,
  0, 0.54, 0.9, 0, 0,
  0, 0, 0, 1, 0,
];

/** Island (area id) → [hue turn in degrees on top of the base, brightness]. Areas not listed keep the base grade. */
export const ULTRA_TONES: Readonly<Record<string, readonly [number, number]>> = {
  'ultra-megalopolis': [0, 1],
  'ultra-crater': [55, 1],
  'ultra-desert': [110, 0.92],
  'ultra-plant': [-55, 0.9],
  'ultra-deep-sea': [-30, 0.95],
  'ultra-wilds': [80, 0.85],
  'ultra-ruin': [150, 0.72],
  'ultra-forest': [-85, 0.8],
  'ultra-jungle': [-130, 0.72],
};

/** Hue rotation (luminance-preserving, as SVG feColorMatrix hueRotate), 3×3 row-major. */
function hue(deg: number): number[] {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

const cache = new Map<string, number[]>();

/** Which grade a place uses: its island's id when it has its own tone, else 'base'. */
export function ultraGradeId(area: string | null | undefined): string {
  return area && ULTRA_TONES[area] ? area : 'base';
}

/** The 4×5 colour matrix of an island (the base grade, turned to the island's hue). */
export function ultraMatrix(area: string | null | undefined): readonly number[] {
  const id = ultraGradeId(area);
  let m = cache.get(id);
  if (m) return m;
  const [deg, k] = ULTRA_TONES[id] ?? [0, 1];
  const h = hue(deg), u = ULTRA_MATRIX;
  m = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let q = 0; q < 3; q++) v += h[i * 3 + q] * u[q * 5 + j];
      m.push(v * k);
    }
    m.push(0, 0);
  }
  m.push(0, 0, 0, 1, 0);
  cache.set(id, m);
  return m;
}

/** A 0xRRGGBB colour through a grade (minimap, tree textures). */
export function gradeRgb(m: readonly number[], r: number, g: number, b: number): [number, number, number] {
  const f = (i: number) => Math.max(0, Math.min(255, Math.round(m[i] * r + m[i + 1] * g + m[i + 2] * b)));
  return [f(0), f(5), f(10)];
}

export function gradeColor(m: readonly number[], c: number): number {
  const [r, g, b] = gradeRgb(m, (c >> 16) & 255, (c >> 8) & 255, c & 255);
  return (r << 16) | (g << 8) | b;
}
