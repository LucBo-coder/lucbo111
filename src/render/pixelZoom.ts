// Pixel-perfect camera zoom. World art is drawn at ×3 (×2 for the optional official icons), so a zoom that is a
// multiple of 1/3 maps every art pixel to a whole number of screen pixels — no uneven or blurred pixels.

export const ZOOM_STEP = 1 / 3;

export function pixelPerfectZoom(raw: number, min: number, max: number): number {
  let z = Math.round(Math.min(max, Math.max(min, raw)) / ZOOM_STEP) * ZOOM_STEP;
  while (z > max + 1e-9) z -= ZOOM_STEP; // stay on the 1/3 grid below the cap
  return Math.max(ZOOM_STEP * 2, z);
}
