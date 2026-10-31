import type Phaser from 'phaser';
import { GMAX_FLAME, gmaxFrames } from './gmaxAnimFrames';

// Gigantamax form art (V32): 96×96 front sprites of the 32 G-Max forms from the personal official pack
// (scripts/fetch-gmax-sprites.mjs → public/assets/official/gmax/). PMDCollab has no Gigantamax sheets, so a
// Gigantamax giant is drawn with this picture instead of its base species' animated sheet, and the party / Pokédex
// show it next to the Gigantamax Factor. Without the pack everything falls back to the scaled base sprite.

let forms = new Set<string>();
let shinies = new Set<string>();
const loading = new Map<string, Promise<void>>();
let sceneRef: Phaser.Scene | null = null;

export async function loadGmaxIndex(scene: Phaser.Scene): Promise<number> {
  sceneRef = scene;
  try {
    const r = await fetch('assets/official/gmax/index.json', { cache: 'no-store' });
    if (!r.ok) return 0;
    const idx = (await r.json()) as { gmax?: string[]; shiny?: string[] };
    forms = new Set(idx.gmax ?? []);
    shinies = new Set(idx.shiny ?? []);
  } catch { /* no pack */ }
  return forms.size;
}

export function gmaxArtKey(species: string, shiny = false): string {
  return `gmax-${shiny && shinies.has(species) ? 'shiny-' : ''}${species}`;
}

export function hasGmaxArt(species: string): boolean {
  return forms.has(species);
}

/** Texture key of the G-Max art once it is loaded; starts loading it (and returns null) the first time. */
export function gmaxTexture(species: string, shiny = false): string | null {
  const scene = sceneRef;
  if (!scene || !forms.has(species)) return null;
  const key = gmaxArtKey(species, shiny);
  if (scene.textures.exists(key)) return key;
  void loadGmaxArt(species, shiny);
  return null;
}

export function loadGmaxArt(species: string, shiny = false): Promise<void> {
  const scene = sceneRef;
  if (!scene || !forms.has(species)) return Promise.resolve();
  const key = gmaxArtKey(species, shiny);
  if (scene.textures.exists(key)) return Promise.resolve();
  let p = loading.get(key);
  if (!p) {
    p = new Promise<void>((res) => {
      const img = new Image();
      img.onload = () => { if (!scene.textures.exists(key)) scene.textures.addImage(key, img); res(); };
      img.onerror = () => res();
      img.src = `assets/official/gmax/${key.includes('shiny-') ? 'shiny/' : ''}${species}.png`;
    });
    loading.set(key, p);
  }
  return p;
}

// ───────────────────────────── animation (V32) ─────────────────────────────

export interface GmaxAnim {
  texture: string;
  idle: string;
  attack: string;
  hurt: string;
  originX: number;
  originY: number;
  /** height of the source picture inside a frame (scale reference) */
  artH: number;
}

const anims = new Map<string, GmaxAnim>();

/**
 * The animated sheet of a G-Max form (render/gmaxAnimFrames: idle / attack / hurt drawn from its picture), built the
 * first time it is asked for once the picture is loaded; null until then (the loading starts here).
 */
export function gmaxAnim(species: string, shiny = false): GmaxAnim | null {
  const scene = sceneRef;
  const key = gmaxTexture(species, shiny);
  if (!scene || !key) return null;
  const hit = anims.get(key);
  if (hit) return hit;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);
  const f = gmaxFrames({ w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data }, GMAX_FLAME.has(species));
  const texKey = key + '-anim';
  const tex = scene.textures.exists(texKey) ? scene.textures.get(texKey) as Phaser.Textures.CanvasTexture : scene.textures.createCanvas(texKey, f.w * f.frames.length, f.h)!;
  const tctx = tex.getContext();
  f.frames.forEach((px, i) => {
    tctx.putImageData(new ImageData(new Uint8ClampedArray(px), f.w, f.h), i * f.w, 0);
    tex.add(i, 0, i * f.w, 0, f.w, f.h);
  });
  tex.refresh();
  const mk = (name: string, frames: number[], rate: number, repeat: number) => {
    const k = `${texKey}:${name}`;
    if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: frames.map((frame) => ({ key: texKey, frame })), frameRate: rate, repeat });
    return k;
  };
  const a: GmaxAnim = {
    texture: texKey, idle: mk('idle', f.anims.idle, 8, -1), attack: mk('attack', f.anims.attack, 12, 0), hurt: mk('hurt', f.anims.hurt, 10, 0),
    originX: f.originX, originY: f.originY, artH: c.height,
  };
  anims.set(key, a);
  return a;
}
