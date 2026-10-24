import Phaser from 'phaser';
import { buildCreatureSheet, repaintCreatureSheet } from './animation';
import { drawGridTexture, paintGrid } from './pixelArt';
import { convertPixels, placeholderGrid, REGISTRY } from './spriteRegistry';

// Lazy creature assets: with the whole National Dex (#1–#493) most species are never seen in a session,
// so only hand-drawn art is built at boot. Every other creature texture + 14-frame sheet + animations is
// built the first time anything asks the TextureManager for it (spawn, party, Pokédex, cards…).
// One hook on TextureManager.get/exists covers every call site without touching them.

const pending = new Set<string>();

export const SHINY_SUFFIX = '~shiny';
export const shinyKey = (species: string) => species + SHINY_SUFFIX;

/**
 * Shiny visual fallback (no licensed shiny sprites are bundled): every saturated palette colour is hue-rotated by a
 * per-species offset (stable across sessions); outlines, greys and near-whites keep their value so the art stays readable.
 */
export function shinyPalette(pal: Record<string, string>, seed: string): Record<string, string> {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shift = 0.25 + (h % 50) / 100; // 0.25 .. 0.74 of the colour wheel
  const out: Record<string, string> = {};
  for (const [k, hex] of Object.entries(pal)) {
    const c = Phaser.Display.Color.HexStringToColor(hex);
    const hsv = Phaser.Display.Color.RGBToHSV(c.red, c.green, c.blue);
    if (hsv.s < 0.18 || hsv.v < 0.16) { out[k] = hex; continue; }
    const rgb = Phaser.Display.Color.HSVToRGB((hsv.h + shift) % 1, Math.min(1, hsv.s * 1.05), hsv.v) as Phaser.Types.Display.ColorObject;
    out[k] = '#' + [rgb.r, rgb.g, rgb.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  return out;
}
let built = 0;

// ───────────────────────────── official pack on demand ─────────────────────────────
// Only the index is read at boot. A species' 40×30 icon is fetched the first time its creature texture is built
// (spawn, party, Pokédex…); until it arrives a silhouette of the same size is shown, then the same textures are
// repainted in place. 96×96 front art ('front-<id>') is fetched the first time a UI asks for it.
const officialIcons = new Set<string>();
const officialFronts = new Set<string>();
const officialShiny = new Set<string>();
const loadingIcon = new Map<string, Promise<void>>();
const shinyDone = new Set<string>();
const loadingFront = new Map<string, Promise<void>>();
let sceneRef: Phaser.Scene | null = null;
/** TextureManager.exists without the lazy hook (the loaders must never re-enter it) */
let rawExists: (key: string) => boolean = () => false;
/** Species whose field sprite is derived from the 96×96 front (no official box icon exists). */
const iconFromFront = new Set<string>();

export const OFFICIAL_W = 40, OFFICIAL_H = 30;

/** Registers silhouettes for every species of the pack (no image is loaded yet). */
export function registerOfficialLazy(names: string[], fronts: string[], types: (id: string) => string[], shiny: string[] = []): number {
  for (const n of shiny) officialShiny.add(n);
  // Gen 8–9 have no official box icon (PokeAPI/sprites stops at #809): their field sprite is the front art,
  // pixel-art-downscaled at load time (see fetchIcon)
  const all = [...names];
  for (const f of fronts) if (!names.includes(f)) { all.push(f); iconFromFront.add(f); }
  for (const n of all) {
    officialIcons.add(n);
    const sil = placeholderGrid(n, types(n));
    // centre the 16×16 silhouette in a 40×30 canvas so the final art has the same frame size
    const padX = Math.floor((OFFICIAL_W - 16) / 2), padY = OFFICIAL_H - 16 - 2;
    const rows = Array.from({ length: OFFICIAL_H }, (_, y) => {
      const r = y >= padY && y < padY + 16 ? sil.rows[y - padY] : '';
      return ('.'.repeat(padX) + r).padEnd(OFFICIAL_W, '.').slice(0, OFFICIAL_W);
    });
    REGISTRY[n] = { pal: sil.pal, rows, outline: false, source: 'official', scale: 2 };
    pending.add(n);
  }
  for (const f of fronts) officialFronts.add(f);
  return all.length;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = src; });
}

function fetchIcon(name: string): Promise<void> {
  const hit = loadingIcon.get(name);
  if (hit || !sceneRef) return hit ?? Promise.resolve();
  const p = new Promise<void>((done) => {
  const img = new Image();
  img.onerror = () => done();
  img.onload = () => {
    const scene = sceneRef;
    if (!scene) return done();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const g0 = convertPixels(ctx.getImageData(0, 0, img.width, img.height).data, img.width, img.height, { downscale: iconFromFront.has(name) });
    // convertPixels crops to the art; pad back to the 40×30 frame the sheet was built with (centred, feet down)
    const g = { pal: g0.pal, rows: padRows(g0.rows, OFFICIAL_W, OFFICIAL_H) };
    REGISTRY[name] = { ...g, outline: false, source: 'official', scale: 2 };
    repaint(scene, name);
    const sh = name + SHINY_SUFFIX;
    if (REGISTRY[sh] && !shinyDone.has(name)) { REGISTRY[sh] = { ...REGISTRY[name], pal: shinyPalette(g.pal, sh) }; repaint(scene, sh); }
    done();
  };
  img.src = iconFromFront.has(name) ? `assets/official/front/${name}.png` : `assets/official/icons/${name}.png`;
  });
  loadingIcon.set(name, p);
  return p;
}

/**
 * Real shiny colours for a field icon: the official normal and shiny front sprites are compared pixel by pixel to
 * build a "normal colour → shiny colour" table, which is then applied to the icon's palette (nearest colour).
 */
async function fetchShinyIcon(name: string): Promise<void> {
  if (shinyDone.has(name) || !officialShiny.has(name)) return;
  shinyDone.add(name);
  await fetchIcon(name);
  const [a, b] = await Promise.all([loadImage(`assets/official/front/${name}.png`), loadImage(`assets/official/shiny/${name}.png`)]);
  const scene = sceneRef;
  if (!scene || !a || !b || a.width !== b.width || a.height !== b.height) return;
  const px = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const pa = px(a), pb = px(b);
  const votes = new Map<number, Map<number, number>>();
  for (let i = 0; i < pa.length; i += 4) {
    if (pa[i + 3] < 128 || pb[i + 3] < 128) continue;
    const ka = (pa[i] << 16) | (pa[i + 1] << 8) | pa[i + 2], kb = (pb[i] << 16) | (pb[i + 1] << 8) | pb[i + 2];
    let m = votes.get(ka); if (!m) votes.set(ka, (m = new Map()));
    m.set(kb, (m.get(kb) ?? 0) + 1);
  }
  const table: [number, number, number, number][] = []; // r,g,b of normal → packed shiny
  for (const [ka, m] of votes) { let best = 0, bk = ka; for (const [kb, n] of m) if (n > best) { best = n; bk = kb; } table.push([(ka >> 16) & 255, (ka >> 8) & 255, ka & 255, bk]); }
  if (!table.length) return;
  const base = REGISTRY[name];
  const pal: Record<string, string> = {};
  for (const [k, hex] of Object.entries(base.pal)) {
    const v = parseInt(hex.slice(1), 16), r = (v >> 16) & 255, g = (v >> 8) & 255, bl = v & 255;
    let bd = 1e9, out = v;
    for (const [tr, tg, tb, sh] of table) { const d = (tr - r) ** 2 + (tg - g) ** 2 + (tb - bl) ** 2; if (d < bd) { bd = d; out = sh; } }
    pal[k] = '#' + out.toString(16).padStart(6, '0');
  }
  const sk = name + SHINY_SUFFIX;
  REGISTRY[sk] = { ...base, pal };
  repaint(scene, sk);
}

/** 96×96 official shiny front ('front-shiny-<id>') for the UI. */
export function loadShinyFront(id: string): Promise<void> {
  const scene = sceneRef;
  const key = 'front-shiny-' + id;
  if (!scene || !officialShiny.has(id) || rawExists(key)) return Promise.resolve();
  return loadImage(`assets/official/shiny/${id}.png`).then((img) => { if (img && !rawExists(key)) scene.textures.addImage(key, img); });
}

/** Fit large fallback art without clipping wings/tails; then centre and bottom-align. */
export function padRows(rows: string[], w: number, h: number): string[] {
  let rw = Math.max(0, ...rows.map((r) => r.length));
  if (rw > w || rows.length > h) {
    const ratio = Math.min(w / rw, h / rows.length);
    const nw = Math.max(1, Math.floor(rw * ratio)), nh = Math.max(1, Math.floor(rows.length * ratio));
    rows = Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) =>
      rows[Math.min(rows.length - 1, Math.floor(y / ratio))][Math.min(rw - 1, Math.floor(x / ratio))] ?? '.').join(''));
    rw = nw;
  }
  const left = Math.max(0, Math.floor((w - rw) / 2));
  const src = rows.slice(Math.max(0, rows.length - h));
  const top = h - src.length;
  return Array.from({ length: h }, (_, y) => {
    const r = y >= top ? src[y - top].padEnd(rw, '.') : '';
    return ('.'.repeat(left) + r).padEnd(w, '.').slice(0, w);
  });
}

function repaint(scene: Phaser.Scene, key: string): void {
  const tm = scene.textures;
  const def = REGISTRY[key];
  if (!def) return;
  if (rawExists(key)) {
    const t = tm.get(key) as Phaser.Textures.CanvasTexture;
    if (t.getContext) { const ctx = t.getContext(); ctx.clearRect(0, 0, t.width, t.height); paintGrid(ctx, def.rows, def.pal, def.outline); t.refresh(); }
  }
  repaintCreatureSheet(scene, key);
}

/** Loads 'front-<id>' (96×96 official art) if the pack has it. Resolves when the texture exists. */
export function loadFront(id: string): Promise<void> {
  const scene = sceneRef;
  if (!scene || !officialFronts.has(id) || rawExists('front-' + id)) return Promise.resolve();
  let p = loadingFront.get(id);
  if (!p) {
    p = new Promise<void>((res) => {
      const img = new Image();
      img.onload = () => { if (!rawExists('front-' + id)) scene.textures.addImage('front-' + id, img); res(); };
      img.onerror = () => res();
      img.src = `assets/official/front/${id}.png`;
    });
    loadingFront.set(id, p);
  }
  return p;
}

export function officialLoaded(): { icons: number; fronts: number; shiny: number } {
  return { icons: loadingIcon.size, fronts: loadingFront.size, shiny: shinyDone.size };
}

export function lazyStats(): { pending: number; built: number } {
  return { pending: pending.size, built };
}

export function installLazyCreatures(scene: Phaser.Scene, lazyKeys: Iterable<string>): void {
  for (const k of lazyKeys) pending.add(k);
  sceneRef = scene;
  const tm = scene.textures as Phaser.Textures.TextureManager & { __lazy?: boolean };
  if (tm.__lazy) return;
  tm.__lazy = true;
  const origGet = tm.get.bind(tm);
  const origExists = tm.exists.bind(tm);
  rawExists = origExists;
  const ensure = (key: unknown) => {
    if (typeof key !== 'string') return;
    if (key.startsWith('front-shiny-')) { const id = key.slice(12); if (!origExists(key)) void loadShinyFront(id); return; }
    if (key.startsWith('front-')) { const id = key.slice(6); if (officialFronts.has(id) && !origExists(key)) void loadFront(id); return; }
    const base = key.endsWith('_sheet') ? key.slice(0, -6) : key;
    if (base.endsWith(SHINY_SUFFIX) && !REGISTRY[base]) {
      const src = REGISTRY[base.slice(0, -SHINY_SUFFIX.length)];
      if (src) { REGISTRY[base] = { ...src, pal: shinyPalette(src.pal, base) }; pending.add(base); }
    }
    if (!pending.size) return;
    if (!pending.has(base)) return;
    pending.delete(base); // first, so the nested exists/createCanvas calls don't recurse
    const def = REGISTRY[base];
    if (!def) return;
    if (!origExists(base)) drawGridTexture(scene, base, def.rows, def.pal, def.outline);
    buildCreatureSheet(scene, base);
    built++;
    const sp = base.endsWith(SHINY_SUFFIX) ? base.slice(0, -SHINY_SUFFIX.length) : base;
    if (officialIcons.has(sp)) { void fetchIcon(sp); if (base !== sp) void fetchShinyIcon(sp); }
  };
  tm.get = ((key?: string | Phaser.Textures.Texture) => { ensure(key); return origGet(key as string); }) as typeof tm.get;
  tm.exists = ((key: string) => { ensure(key); return origExists(key); }) as typeof tm.exists;
}
