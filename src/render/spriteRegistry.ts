import Phaser from 'phaser';
import { Palette, SPRITES } from './pixelArt';
import { composeTrio, EVOLVED_SPRITES } from './spritesEvolved';

// One registry for every creature drawing, whatever its source:
//  • procedural pixel maps (original art in pixelArt.ts / spritesEvolved.ts)
//  • IcyEthics PNGs (public/assets/icyethics), converted at boot into the same palette-grid
//    format: trim → normalise to 1x → pixel-art-aware 2x downscale → palette grid.
// Everything downstream (static textures, animation atlases) consumes this registry.

export interface SpriteDef {
  pal: Palette;
  rows: string[];
  /** Add the 1px dark outline (procedural art). Converted PNGs already carry their own outline. */
  outline: boolean;
  source: 'procedural' | 'icyethics' | 'official' | 'placeholder';
  /** Field display scale (art pixels → world pixels). Default 3. */
  scale?: number;
}

export const REGISTRY: Record<string, SpriteDef> = {};
/** Whether the local official sprite pack exists / is in use this session */
export const officialPack = { available: false, active: false };

/** Species whose art comes from IcyEthics/PokemonAssets (key = species id, file = public path). */
export const ICY_SPRITES: Record<string, string> = {
  diglett: 'assets/icyethics/pokemon/diglett.png',
  gulpin: 'assets/icyethics/pokemon/gulpin.png',
  hoothoot: 'assets/icyethics/pokemon/hoothoot.png',
  paras: 'assets/icyethics/pokemon/paras.png',
  canight: 'assets/icyethics/pokemon/canight.png',
  perropello: 'assets/icyethics/pokemon/perropello.png',
};
export const ICY_PORTRAITS: Record<string, string> = {
  mycologist: 'assets/icyethics/trainers/mycologist.png',
  youngster_m: 'assets/icyethics/trainers/youngster_m.png',
  youngster_f: 'assets/icyethics/trainers/youngster_f.png',
  hilda: 'assets/icyethics/trainers/hilda.png',
};

export function registerProcedural(): void {
  for (const [k, d] of Object.entries(SPRITES)) REGISTRY[k] = { ...d, outline: true, source: 'procedural' };
  for (const [k, d] of Object.entries(EVOLVED_SPRITES)) REGISTRY[k] = { ...d, outline: true, source: 'procedural' };
  const mag = SPRITES.magnemite;
  REGISTRY.magneton = { pal: mag.pal, rows: composeTrio(mag.rows), outline: true, source: 'procedural' };
}

export function preloadIcyEthics(scene: Phaser.Scene): void {
  for (const [k, path] of Object.entries(ICY_SPRITES)) scene.load.image('icy-' + k, path);
  for (const [k, path] of Object.entries(ICY_PORTRAITS)) scene.load.image('portrait-' + k, path);
}

type RGBA = [number, number, number, number];

/** Pure conversion step (exported for tests): RGBA pixel buffer → palette grid at game pixel density. */
export function convertPixels(data: Uint8ClampedArray | number[], width: number, height: number, opts: { downscale?: boolean } = {}): { pal: Palette; rows: string[] } {
  const downscale = opts.downscale ?? true;
  const at = (x: number, y: number): RGBA => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  // 1) trim to the opaque bounding box
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (at(x, y)[3] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return { pal: {}, rows: ['.'] };
  let w = x1 - x0 + 1, h = y1 - y0 + 1;
  let px: RGBA[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => at(x0 + x, y0 + y)));
  // 2) some exports are already 2x (192px canvas): collapse to 1x first
  if (Math.max(w, h) > 64) {
    px = Array.from({ length: Math.ceil(h / 2) }, (_, y) => Array.from({ length: Math.ceil(w / 2) }, (_, x) => px[y * 2][x * 2]));
    h = px.length; w = px[0].length;
  }
  // 3) pixel-art aware 2x downscale: keep dark outline pixels, otherwise the dominant colour
  if (!downscale) {
    const pal0: Palette = {};
    const glyph0 = new Map<string, string>();
    const rows0 = px.map((r) => r.map((c) => {
      if (c[3] <= 128) return '.';
      const hex = '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
      let g = glyph0.get(hex);
      if (!g) { g = String.fromCharCode(0x100 + glyph0.size); glyph0.set(hex, g); pal0[g] = hex; }
      return g;
    }).join(''));
    return { pal: pal0, rows: rows0 };
  }
  const H2 = Math.ceil(h / 2), W2 = Math.ceil(w / 2);
  const out: (RGBA | null)[][] = Array.from({ length: H2 }, () => Array(W2).fill(null));
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const cols: RGBA[] = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const c = px[y * 2 + dy]?.[x * 2 + dx];
      if (c && c[3] > 128) cols.push(c);
    }
    if (cols.length < 2) continue;
    const dark = cols.filter((c) => c[0] + c[1] + c[2] < 150);
    if (dark.length >= 2) { out[y][x] = dark[0]; continue; }
    const counts = new Map<string, { c: RGBA; n: number }>();
    for (const c of cols) { const k = c.slice(0, 3).join(','); const e = counts.get(k); if (e) e.n++; else counts.set(k, { c, n: 1 }); }
    out[y][x] = [...counts.values()].sort((a, b) => b.n - a.n)[0].c;
  }
  // 4) palette grid (each distinct colour gets its own glyph; '.' stays transparent)
  const pal: Palette = {};
  const glyph = new Map<string, string>();
  const rows = out.map((r) => r.map((c) => {
    if (!c) return '.';
    const hex = '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
    let g = glyph.get(hex);
    if (!g) { g = String.fromCharCode(0x100 + glyph.size); glyph.set(hex, g); pal[g] = hex; }
    return g;
  }).join(''));
  return { pal, rows };
}

export function registerIcyEthics(scene: Phaser.Scene, missing: Set<string>): string[] {
  const ok: string[] = [];
  for (const k of Object.keys(ICY_SPRITES)) {
    const key = 'icy-' + k;
    if (missing.has(key) || !scene.textures.exists(key)) continue;
    const img = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height);
    REGISTRY[k] = { ...convertPixels(d.data, img.width, img.height), outline: false, source: 'icyethics' };
    ok.push(k);
  }
  // Dugtrio = three Digletts (built from the converted IcyEthics Diglett)
  if (REGISTRY.diglett) REGISTRY.dugtrio = { pal: REGISTRY.diglett.pal, rows: composeTrio(REGISTRY.diglett.rows, 0), outline: false, source: 'icyethics' };
  return ok;
}

// ───────────────────────────── official sprites (personal use, local only) ─────────────────────────────
// scripts/fetch-official-sprites.mjs downloads PokeAPI/sprites PNGs into public/assets/official (git-ignored).
export interface OfficialIndex { icons: string[]; front: string[]; shiny?: string[]; items?: string[]; trainers?: string[] }

/** NPC id (or trainer / ambush key) → Pokémon Showdown trainer sprite of the personal pack. */
export const NPC_TRAINER_ART: Record<string, string> = {
  prof: 'oak', farmer: 'rancher', collector: 'pokemaniac', ranger: 'pokemonranger', elder: 'sage', nurse: 'nurse', shopkeeper: 'gentleman',
  youngster: 'youngster', climber: 'hiker', geologist: 'scientist', oracle: 'psychic',
  // 0.9.0 regions + their trainers
  'swamp-witch': 'sage', 'swamp-fisher': 'fisherman', 'swamp-scout': 'pokemonranger', 'poison-tamer': 'psychic', 'swamp-bugcatcher': 'bugcatcher',
  diver: 'acetrainer', 'lighthouse-keeper': 'gentleman', swimmer: 'picnicker', sailor: 'blackbelt',
  // Vietnam Odyssey: Cà Mau, An Giang
  'vn-prof': 'scientist', 'cm-guide': 'lass', 'cm-fisher': 'fisherman', 'cm-ranger': 'pokemonranger', 'cm-elder': 'sage',
  'cm-youngster': 'bugcatcher', 'cm-fisherman': 'fisherman', 'cm-forest-trainer': 'camper',
  'ag-guide': 'beauty', 'ag-researcher': 'scientist', 'ag-boatman': 'rancher', 'ag-islander': 'picnicker',
  'ag-climber': 'hiker', 'ag-boater': 'acetrainerf', 'ag-diver': 'veteran',
};
export const AMBUSH_TRAINER_ART = ['acetrainer', 'acetrainerf', 'blackbelt', 'beauty', 'veteran', 'cyclist', 'skier'];

/** Small item / trainer art of the personal pack (≈ 80 files of 1–2 KB) — loaded with the boot. */
export function preloadOfficialSmall(scene: Phaser.Scene, idx: OfficialIndex): number {
  for (const id of idx.items ?? []) scene.load.image('oitem-' + id, `assets/official/items/${id}.png`);
  for (const t of idx.trainers ?? []) scene.load.image('otrainer-' + t, `assets/official/trainers/${t}.png`);
  return (idx.items?.length ?? 0) + (idx.trainers?.length ?? 0);
}

/** Texture key of an item icon: official art if loaded, else the original pixel icon. */
export function itemIconKey(scene: Phaser.Scene, id: string): string {
  if (officialPack.active && scene.textures.exists('oitem-' + id)) return 'oitem-' + id;
  return scene.textures.exists('item-' + id) ? 'item-' + id : 'item_held';
}

/** Texture key of an NPC's official trainer art (null → keep the tile sprite). */
export function trainerArtKey(scene: Phaser.Scene, npcId: string): string | null {
  const t = NPC_TRAINER_ART[npcId];
  return officialPack.active && t && scene.textures.exists('otrainer-' + t) ? 'otrainer-' + t : null;
}

export async function loadOfficialIndex(): Promise<OfficialIndex | null> {
  try {
    const r = await fetch('assets/official/index.json', { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as OfficialIndex;
  } catch {
    return null;
  }
}

export function preloadOfficial(scene: Phaser.Scene, idx: OfficialIndex): void {
  for (const n of idx.icons) scene.load.image('off-icon-' + n, `assets/official/icons/${n}.png`);
  for (const n of idx.front) scene.load.image('front-' + n, `assets/official/front/${n}.png`);
}

/** Field art from Gen 7 box icons (kept at native resolution, drawn x2). */
export function registerOfficial(scene: Phaser.Scene, idx: OfficialIndex): number {
  let n = 0;
  for (const name of idx.icons) {
    const key = 'off-icon-' + name;
    if (!scene.textures.exists(key)) continue;
    const img = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height);
    REGISTRY[name] = { ...convertPixels(d.data, img.width, img.height, { downscale: false }), outline: false, source: 'official', scale: 2 };
    n++;
  }
  return n;
}

// ───────────────────────────── placeholders ─────────────────────────────
const TYPE_HEX: Record<string, [string, string]> = {
  normal: ['#c8c0a0', '#8a8468'], fire: ['#f08030', '#b05018'], water: ['#6890f0', '#3a5ab0'], electric: ['#f8d030', '#b89010'], grass: ['#78c850', '#4a8a30'],
  ice: ['#98d8d8', '#5a9a9a'], fighting: ['#c03028', '#801810'], poison: ['#a040a0', '#682868'], ground: ['#e0c068', '#a08038'], flying: ['#a890f0', '#6a58b0'],
  psychic: ['#f85888', '#b02858'], bug: ['#a8b820', '#6a7810'], rock: ['#b8a038', '#7a6820'], ghost: ['#705898', '#483868'], dragon: ['#7038f8', '#4018b0'],
  dark: ['#705848', '#483028'], steel: ['#b8b8d0', '#787890'], fairy: ['#ee99ac', '#b06878'],
};

/** Simple original "silhouette" art for species without a drawing (varies by type + id hash). */
export function placeholderGrid(id: string, types: string[]): { pal: Palette; rows: string[] } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, A] = TYPE_HEX[types[0]] ?? TYPE_HEX.normal;
  const [b] = TYPE_HEX[types[1] ?? types[0]] ?? TYPE_HEX.normal;
  const pal: Palette = { a, A, b, w: '#ffffff', k: '#202020' };
  const W = 16, H = 16;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const rx = 5 + (h % 2), ry = 4 + ((h >> 1) % 2), cx = 7.5, cy = 9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d <= 1) g[y][x] = y > cy + 1 ? 'A' : d < 0.35 && y > cy - 1 ? 'b' : 'a';
  }
  // ears / horns / fins by hash
  const feat = (h >> 3) % 3;
  if (feat === 0) { g[4][5] = g[3][5] = g[4][10] = g[3][10] = 'a'; }
  if (feat === 1) { g[4][7] = g[3][7] = g[2][8] = 'b'; }
  if (feat === 2) { g[7][1] = g[8][1] = g[8][2] = g[7][14] = g[8][14] = g[8][13] = 'b'; }
  g[8][9] = 'w'; g[8][10] = 'k'; g[8][5] = 'w'; g[8][6] = 'k';
  g[13][5] = g[13][6] = g[13][9] = g[13][10] = 'A';
  return { pal, rows: g.map((r) => r.join('')) };
}

export function registerPlaceholders(species: { id: string; types: string[] }[]): number {
  let n = 0;
  for (const sp of species) {
    if (REGISTRY[sp.id]) continue;
    REGISTRY[sp.id] = { ...placeholderGrid(sp.id, sp.types), outline: true, source: 'placeholder' };
    n++;
  }
  return n;
}

/** Field display scale for a creature drawing. */
export function fieldScale(key: string): number {
  return REGISTRY[key]?.scale ?? 3;
}

/** UI scale so a creature texture fits a `px` box regardless of its source resolution. */
export function fitScale(scene: Phaser.Scene, key: string, px: number): number {
  if (!scene.textures.exists(key)) return 1;
  const src = scene.textures.get(key).getSourceImage();
  return px / Math.max(src.width, src.height);
}
