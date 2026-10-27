import Phaser from 'phaser';
import { AVATARS, avatarTextureKey } from '../core/avatars';
import type { NpcLook } from '../core/npcLooks';
import { drawGridTexture, type Palette } from './pixelArt';
import { REGISTRY } from './spriteRegistry';

// Creature animation sheets.
// Each creature has ONE hand-drawn 16x16 base drawing. At boot we derive real frames from it with
// pixel-grid transforms (leg shifts, breathing, lean, squash, glow outline) and pack them into a
// per-creature sprite atlas. This is honest procedural animation, not hand-drawn multi-frame art.

/** Frame padding around the drawing (room for lean/knockback/outline). */
const PAD = 3;
const OUTLINE = '#1a1420';

export const ANIMS = {
  idle: { frames: [0, 1], rate: 2.5, repeat: -1 },
  walk: { frames: [2, 3, 4, 5], rate: 10, repeat: -1 },
  attack: { frames: [6, 7], rate: 12, repeat: 0 },
  cast: { frames: [8, 9], rate: 8, repeat: -1 },
  hit: { frames: [10], rate: 1, repeat: 0 },
  faint: { frames: [11, 12, 13], rate: 7, repeat: 0 },
} as const;
export type AnimName = keyof typeof ANIMS;
export const FRAME_COUNT = 14;

type Grid = string[];

function blank(h: number, w: number): Grid {
  return Array.from({ length: h }, () => '.'.repeat(w));
}

function shiftRows(g: Grid, from: number, to: number, dx: number): Grid {
  const w = g[0].length;
  return g.map((row, y) => {
    if (y < from || y > to || dx === 0) return row;
    return dx > 0 ? ('.'.repeat(dx) + row).slice(0, w) : (row + '.'.repeat(-dx)).slice(-dx, w - dx);
  });
}

function shiftAll(g: Grid, dy: number): Grid {
  const out = blank(g.length, g[0].length);
  g.forEach((row, y) => {
    const ny = y + dy;
    if (ny >= 0 && ny < g.length) out[ny] = row;
  });
  return out;
}

/** Bottom-aligned vertical squash using nearest-neighbour sampling. */
function squash(g: Grid, f: number): Grid {
  const h = g.length;
  let bottom = h - 1;
  while (bottom > 0 && !/[^.]/.test(g[bottom])) bottom--;
  let top = 0;
  while (top < bottom && !/[^.]/.test(g[top])) top++;
  const src = bottom - top + 1;
  const dst = Math.max(1, Math.round(src * f));
  const out = blank(h, g[0].length);
  for (let i = 0; i < dst; i++) out[bottom - i] = g[bottom - Math.floor((i / dst) * src)];
  return out;
}

function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

interface DrawOpts {
  outline?: string;
  tint?: { to: string; t: number };
  dx?: number;
}

function drawGrid(ctx: CanvasRenderingContext2D, g: Grid, pal: Palette, ox: number, oy: number, o: DrawOpts = {}, withOutline = true): void {
  const w = g[0].length;
  const solid = (x: number, y: number) => y >= 0 && y < g.length && x >= 0 && x < w && g[y][x] !== '.' && g[y][x] !== undefined;
  // glow frames always get an outline (white); plain frames only for procedural art
  if (withOutline || o.outline) {
    ctx.fillStyle = o.outline ?? OUTLINE;
    for (let y = -1; y <= g.length; y++) for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  g.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c === '.' || !pal[c]) continue;
      ctx.fillStyle = o.tint ? mix(pal[c], o.tint.to, o.tint.t) : pal[c];
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

/** Returns the 14 derived frames for a base drawing. */
export function deriveFrames(base: Grid): { grid: Grid; opts: DrawOpts; dx: number; dy: number }[] {
  const W = Math.max(...base.map((r) => r.length));
  const g = base.map((r) => r.padEnd(W, '.').slice(0, W));
  const h = g.length;
  const legs = h - Math.max(3, Math.round(h / 4));
  const breath = g.map((row, y) => (y === 0 ? '.'.repeat(W) : y <= legs - 1 ? g[y - 1] : row));
  return [
    { grid: g, opts: {}, dx: 0, dy: 0 },
    { grid: breath, opts: {}, dx: 0, dy: 0 },
    { grid: shiftAll(shiftRows(g, legs, h - 1, -1), -1), opts: {}, dx: 0, dy: 0 },
    { grid: g, opts: {}, dx: 0, dy: 0 },
    { grid: shiftAll(shiftRows(g, legs, h - 1, 1), -1), opts: {}, dx: 0, dy: 0 },
    { grid: g, opts: {}, dx: 0, dy: 0 },
    { grid: shiftRows(g, 0, Math.floor(h / 2) - 1, 1), opts: {}, dx: 2, dy: 0 },
    { grid: g, opts: {}, dx: 1, dy: 0 },
    { grid: g, opts: { outline: '#ffffff' }, dx: 0, dy: 0 },
    { grid: shiftAll(g, -1), opts: { outline: '#ffffff' }, dx: 0, dy: 0 },
    { grid: g, opts: { tint: { to: '#ffffff', t: 0.55 } }, dx: -2, dy: 0 },
    { grid: squash(g, 0.75), opts: { tint: { to: '#808080', t: 0.3 } }, dx: 0, dy: 0 },
    { grid: squash(g, 0.5), opts: { tint: { to: '#808080', t: 0.6 } }, dx: 0, dy: 0 },
    { grid: squash(g, 0.25), opts: { tint: { to: '#606060', t: 0.85 } }, dx: 0, dy: 0 },
  ];
}

export function sheetKey(sprite: string): string {
  return sprite + '_sheet';
}

/** Square frame size for a drawing (largest side + padding on both sides). */
export function frameSize(rows: string[]): number {
  return Math.max(rows.length, ...rows.map((r) => r.length)) + PAD * 2;
}

/** Stable feet from the base art, including its internal transparent padding.
 * Reused for every derived frame so squash, lean and recoil retain their authored motion. */
export function creatureFootAnchor(key: string): { x: number; y: number } {
  // asked for every unit on every frame: scanning the drawing once per key is enough
  let a = footCache.get(key);
  if (a) return a;
  const def = REGISTRY[key];
  const avatar = !def && key.startsWith('avt-') ? AVATARS.find((x) => avatarTextureKey(x.id) === key) : undefined;
  const rows = def?.rows ?? avatar?.rows;
  if (!rows) return { x: 0.5, y: 0.5 }; // not cached: a lazily registered drawing may appear later
  const outline = def ? def.outline : true;
  const f = frameSize(rows);
  let bottom = rows.length;
  while (bottom > 0 && !/[^.]/.test(rows[bottom - 1])) bottom--;
  a = { x: 0.5, y: (f - PAD - rows.length + bottom + (outline ? 1 : 0)) / f };
  footCache.set(key, a);
  return a;
}
const footCache = new Map<string, { x: number; y: number }>();

/** Builds atlas textures + Phaser animations for every creature drawing. Idempotent. */
/** Builds sheets for creatures that must exist at boot; the rest are built on first use (lazyCreatures.ts). */
export function buildCreatureAnimations(scene: Phaser.Scene, eager: (key: string) => boolean = () => true): void {
  for (const key of Object.keys(REGISTRY)) if (eager(key)) buildCreatureSheet(scene, key);
}

/** 14-frame derived sheet + idle/walk/attack/cast/hit/faint animations for one creature. */
export function buildCreatureSheet(scene: Phaser.Scene, key: string): void {
  const def = REGISTRY[key];
  if (!def) return;
  buildGridSheet(scene, key, def.rows, def.pal, def.outline);
}

/** Animated sheets for the profile avatars (same derived walk/cast frames as creatures). */
export function buildAvatarSheets(scene: Phaser.Scene): void {
  for (const a of AVATARS) buildGridSheet(scene, avatarTextureKey(a.id), a.rows, a.pal, true);
}

/** Static drawing (dialogue portrait) + animated sheet of an NPC look, built on first use. Returns its key. */
export function buildNpcLook(scene: Phaser.Scene, look: NpcLook): string {
  if (!scene.textures.exists(look.key)) drawGridTexture(scene, look.key, look.rows, look.pal, true);
  buildGridSheet(scene, look.key, look.rows, look.pal, true);
  return look.key;
}

function buildGridSheet(scene: Phaser.Scene, key: string, rows: string[], pal: Palette, outline: boolean): void {
  const sk = sheetKey(key);
  if (scene.textures.exists(sk)) return;
  const frames = deriveFrames(rows);
  const F = frameSize(rows);
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length;
  // centre horizontally, bottom-align so feet sit at the same spot for every size
  const ox = Math.floor((F - W) / 2), oy = F - PAD - H;
  const tex = scene.textures.createCanvas(sk, F * frames.length, F)!;
  const ctx = tex.getContext();
  frames.forEach((f, i) => drawGrid(ctx, f.grid, pal, i * F + ox + f.dx, oy + f.dy, f.opts, outline));
  tex.refresh();
  for (let i = 0; i < frames.length; i++) tex.add(i, 0, i * F, 0, F, F);
  for (const [name, a] of Object.entries(ANIMS)) {
    if (scene.anims.exists(`${key}:${name}`)) continue;
    scene.anims.create({
      key: `${key}:${name}`,
      frames: a.frames.map((f) => ({ key: sk, frame: f })),
      frameRate: a.rate,
      repeat: a.repeat,
    });
  }
}

/** Repaints an existing creature sheet from its (updated) drawing — same texture, so live sprites update. */
export function repaintCreatureSheet(scene: Phaser.Scene, key: string): void {
  const def = REGISTRY[key];
  const sk = sheetKey(key);
  if (!def || !scene.textures.exists(sk)) return;
  const tex = scene.textures.get(sk) as Phaser.Textures.CanvasTexture;
  const frames = deriveFrames(def.rows);
  const F = frameSize(def.rows);
  const W = Math.max(...def.rows.map((r) => r.length)), H = def.rows.length;
  const ox = Math.floor((F - W) / 2), oy = F - PAD - H;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, tex.width, tex.height);
  frames.forEach((f, i) => drawGrid(ctx, f.grid, def.pal, i * F + ox + f.dx, oy + f.dy, f.opts, def.outline));
  tex.refresh();
}
