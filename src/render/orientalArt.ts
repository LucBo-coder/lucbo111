import type Phaser from 'phaser';
import type { MapObject } from '../core/map/mapProvider';
import { ORIENTAL_RISE, orientalArtOf, type OrientalArt, type OrientalKind, type OrientalProp, type RoofPal } from '../core/map/oriental';
import { SCALE, TILE_PX } from '../core/map/tiles';

// Pixel art of the old oriental town (core/map/oriental.ts), drawn by code at 16 px per tile and scaled like the
// tileset. One canvas texture per distinct shape, made the first time a chunk shows it.

/** Paints one rectangle of native pixels. */
export type Px = (x: number, y: number, w: number, h: number, c: string) => void;

const ROOF: Record<RoofPal, { base: string; light: string; dark: string; ridge: string; end: string }> = {
  red: { base: '#a64a32', light: '#c96a48', dark: '#6e2c1e', ridge: '#5a2418', end: '#e08a60' },
  grey: { base: '#5d6874', light: '#7d8a98', dark: '#3a424c', ridge: '#2e343c', end: '#a8b4c0' },
  gold: { base: '#d09a22', light: '#f0c448', dark: '#8a6010', ridge: '#7a4e0c', end: '#fbe08a' },
  green: { base: '#3d7a66', light: '#5ea488', dark: '#24503f', ridge: '#1c3e32', end: '#9ad0b8' },
};
const WOOD = { col: '#7a2a1c', colLight: '#a8442c', frame: '#4a2214', door: '#b42e24', doorDark: '#7c1c16', stud: '#f0c040' };
const STONE = { top: '#c8c0b0', base: '#9a9282', dark: '#6a6458' };

/** A curved roof band between rows y0 and y1: inset i0 at the top, i1 at the bottom (concave flare), tips curling up. */
function roof(px: Px, W: number, y0: number, y1: number, i0: number, i1: number, pal: RoofPal, tips = true): void {
  const c = ROOF[pal], H = y1 - y0;
  for (let y = y0; y < y1; y++) {
    const t = H <= 1 ? 1 : (y - y0) / (H - 1);
    const inset = Math.round(i1 + (i0 - i1) * Math.pow(1 - t, 2.4));
    const xl = inset, xr = W - inset;
    if (xr <= xl) continue;
    px(xl, y, xr - xl, 1, (y - y0) % 5 === 4 ? c.dark : c.base);
    // tile ridges (ngói ống): a dark gap and a light crest every 4 px, centred on the roof
    if ((y - y0) % 5 !== 4) for (let x = xl + 1; x < xr - 1; x++) {
      const k = (x - Math.floor(W / 2) + 400) % 4;
      if (k === 0) px(x, y, 1, 1, c.dark);
      else if (k === 2) px(x, y, 1, 1, c.light);
    }
    px(xl, y, 1, 1, c.dark);
    px(xr - 1, y, 1, 1, c.dark);
  }
  // eave: fascia board and the round tile ends
  const ie = i1;
  px(ie, y1 - 2, W - 2 * ie, 2, c.ridge);
  for (let x = ie + 1; x < W - ie - 1; x += 4) px(x, y1 - 2, 2, 1, c.end);
  if (!tips) return;
  // upturned eave tips (đầu đao): a hook sweeping out past the eave and up
  for (const s of [0, 1]) {
    const o = (dx: number) => (s ? W - 1 - (ie - 2 + dx) : ie - 2 + dx);
    px(o(1), y1 - 3, 1, 3, c.ridge); px(o(2), y1 - 3, 1, 3, c.ridge);
    px(o(0), y1 - 6, 1, 4, c.ridge); px(o(1), y1 - 5, 1, 2, c.base);
    px(o(0), y1 - 8, 1, 2, c.ridge); px(o(1), y1 - 9, 1, 1, c.ridge);
    px(o(1), y1 - 10, 1, 1, c.end);
  }
}

/** Ridge beam with curled ends and a centre ornament (moon pearl on temples, tile stack elsewhere). */
function ridge(px: Px, W: number, y: number, inset: number, pal: RoofPal, pearl: boolean): void {
  const c = ROOF[pal];
  px(inset - 2, y, W - 2 * inset + 4, 3, c.ridge);
  px(inset - 2, y, W - 2 * inset + 4, 1, c.end);
  for (const s of [0, 1]) {
    const x = s ? W - inset + 1 : inset - 3;
    px(x, y - 3, 2, 4, c.ridge);
    px(s ? x + 1 : x, y - 5, 1, 2, c.ridge);
    px(s ? x + 1 : x, y - 5, 1, 1, c.end);
  }
  const m = Math.floor(W / 2);
  if (pearl) {
    // lưỡng long chầu nguyệt: a flaming pearl on the ridge
    px(m - 2, y - 5, 4, 4, '#f08a20');
    px(m - 1, y - 6, 2, 6, '#f08a20');
    px(m - 1, y - 4, 2, 2, '#ffe070');
    px(m - 1, y - 8, 1, 2, '#e04020');
    px(m, y - 9, 1, 2, '#ffb030');
    // two little dragons facing it
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) px(m + s * (5 + i), y - 2 - (i % 3 === 1 ? 2 : 1), 1, 1 + (i === 0 ? 1 : 0), c.end);
  } else {
    px(m - 1, y - 3, 3, 3, c.ridge);
    px(m, y - 4, 1, 1, c.end);
  }
}

/** Lattice window (song cửa) with paper behind it. */
function lattice(px: Px, x: number, y: number, w: number, h: number): void {
  px(x - 1, y - 1, w + 2, h + 2, WOOD.frame);
  px(x, y, w, h, '#f2e2b4');
  for (let i = 2; i < w; i += 3) px(x + i, y, 1, h, '#8a4e28');
  for (let j = 2; j < h; j += 3) px(x, y + j, w, 1, '#8a4e28');
}

function lanternAt(px: Px, x: number, y: number): void {
  px(x + 1, y, 1, 2, '#3a2010');
  px(x, y + 2, 3, 1, '#f0c040');
  px(x - 1, y + 3, 5, 4, '#d8301c');
  px(x, y + 3, 1, 4, '#f05a3a');
  px(x, y + 7, 3, 1, '#f0c040');
  px(x + 1, y + 8, 1, 1, '#f0c040');
}

/** Pokémon Center / mart / temple plaque (hoành phi) above the door. */
function plaque(px: Px, cx: number, y: number, kind: OrientalKind): void {
  const bg = kind === 'center' ? '#a01c1c' : kind === 'mart' ? '#1c4a9a' : '#2a1a10';
  px(cx - 8, y, 16, 7, '#f0c040');
  px(cx - 7, y + 1, 14, 5, bg);
  if (kind === 'center') {
    // a Poké Ball
    px(cx - 2, y + 1, 4, 2, '#ff4a40');
    px(cx - 2, y + 3, 4, 2, '#ffffff');
    px(cx - 2, y + 3, 4, 1, '#202020');
    px(cx - 1, y + 2, 2, 2, '#ffffff');
  } else if (kind === 'mart') {
    px(cx - 2, y + 2, 4, 3, '#f8f0d0');
    px(cx - 1, y + 1, 2, 1, '#f8f0d0');
    px(cx - 1, y + 3, 2, 1, '#1c4a9a');
  } else for (let i = -5; i <= 4; i += 3) px(cx + i, y + 3, 2, 1, '#f0c040');
}

/** A building: stone plinth, red columns, plaster or lattice bays, a lacquered double door, curved roof(s). */
export function paintBuilding(px: Px, kind: OrientalKind, tw: number, th: number, pal: RoofPal, door: number): void {
  if (kind === 'gate') { paintGate(px, tw, th, pal); return; }
  const W = tw * 16, rise = ORIENTAL_RISE[kind], H = th * 16 + rise;
  const temple = kind === 'temple';
  const eave = rise + Math.floor(th * 16 * (temple ? 0.38 : 0.42));
  const wallL = 3, wallR = W - 3, base = H - 4;
  const plaster = temple ? '#e6be5a' : kind === 'center' ? '#f2ead8' : kind === 'mart' ? '#eae2cc' : '#e4d6b4';
  // walls
  px(wallL, eave, wallR - wallL, base - eave, plaster);
  px(wallL, eave, wallR - wallL, 3, '#5a3a28');
  px(wallL, eave + 3, wallR - wallL, 1, '#8a6a50');
  // bays: lattice windows, the door in its column
  const dx = door * 16;
  for (let i = 0; i < tw; i++) {
    if (i === door) continue;
    const wx = i * 16 + 4, wy = eave + 6, ww = 8, wh = Math.min(10, base - wy - 4);
    if (wh >= 5) lattice(px, wx, wy, ww, wh);
  }
  // columns at every tile boundary and both ends
  const cols = [wallL, wallR - 3];
  for (let i = 1; i < tw; i++) cols.push(i * 16 - 1);
  for (const x of cols) { px(x, eave + 3, 3, base - eave - 3, WOOD.col); px(x, eave + 3, 1, base - eave - 3, WOOD.colLight); }
  // door
  const dh = Math.min(18, base - eave - 7), dt = base - dh;
  px(dx + 2, dt - 1, 12, dh + 1, WOOD.frame);
  px(dx + 3, dt, 10, dh, WOOD.door);
  px(dx + 7, dt, 2, dh, WOOD.doorDark);
  for (let j = dt + 2; j < base - 1; j += 4) { px(dx + 4, j, 1, 1, WOOD.stud); px(dx + 11, j, 1, 1, WOOD.stud); }
  px(dx + 6, dt + Math.floor(dh / 2), 1, 1, WOOD.stud); px(dx + 9, dt + Math.floor(dh / 2), 1, 1, WOOD.stud);
  if (kind !== 'house' && dt - 8 > eave + 3) plaque(px, dx + 8, dt - 8, kind);
  // plinth and steps
  px(0, base, W, 4, STONE.base);
  px(0, base, W, 1, STONE.top);
  px(0, H - 1, W, 1, STONE.dark);
  px(dx + 1, base, 14, 2, STONE.top);
  px(dx + 2, base + 2, 12, 1, STONE.top);
  // roof(s)
  const i0 = Math.max(6, Math.round(W * 0.2));
  if (temple) {
    // chồng diêm: an upper roof, a lattice frieze, then the wide lower roof
    const mid = Math.round(10 + (eave - 10) * 0.5);
    roof(px, W, 10, mid, i0 + 2, i0 - 4, pal);
    px(i0 - 2, mid, W - 2 * (i0 - 2), 5, WOOD.col);
    for (let x = i0; x < W - i0; x += 3) px(x, mid + 1, 2, 3, '#f0c040');
    roof(px, W, mid + 5, eave + 2, i0 - 6, 2, pal);
    ridge(px, W, 9, i0 + 2, pal, true);
  } else {
    roof(px, W, 7, eave + 2, i0, 2, pal);
    ridge(px, W, 6, i0, pal, false);
  }
  // shadow under the eave and two red lanterns beside the door
  px(wallL, eave + 2, wallR - wallL, 1, 'rgba(30,16,8,0.45)');
  if (kind !== 'house' || tw >= 3) {
    lanternAt(px, Math.max(wallL + 3, dx - 3), eave + 3);
    lanternAt(px, Math.min(wallR - 6, dx + 16), eave + 3);
  }
}

/** Cổng tam quan: two pillars, a beam with a plaque, a long roof and a raised middle roof; open in the middle. */
function paintGate(px: Px, tw: number, th: number, pal: RoofPal): void {
  const W = tw * 16, H = th * 16 + ORIENTAL_RISE.gate;
  const top = 20;
  // pillars
  for (const x of [2, W - 14]) {
    px(x, top + 10, 12, H - top - 10, '#c9b48a');
    px(x, top + 10, 2, H - top - 10, '#e4d4ae');
    px(x + 10, top + 10, 2, H - top - 10, '#8e7a56');
    px(x - 1, H - 4, 14, 4, STONE.base);
    px(x - 1, H - 4, 14, 1, STONE.top);
    // couplet boards on the pillars
    px(x + 4, top + 16, 4, H - top - 24, '#7a1a14');
    for (let y = top + 18; y < H - 10; y += 4) px(x + 5, y, 2, 1, '#f0c040');
  }
  // beam and plaque
  px(10, top + 8, W - 20, 5, WOOD.col);
  px(10, top + 8, W - 20, 1, WOOD.colLight);
  const m = Math.floor(W / 2);
  px(m - 12, top + 13, 24, 8, '#f0c040');
  px(m - 11, top + 14, 22, 6, '#2a1a10');
  for (let i = -8; i <= 6; i += 4) px(m + i, top + 16, 3, 2, '#f0c040');
  // long roof over the whole gate, a raised roof over the middle
  roof(px, W, top, top + 9, 8, 2, pal);
  roof(px, W, 10, top + 1, Math.round(W * 0.32), Math.round(W * 0.22), pal);
  ridge(px, W, 9, Math.round(W * 0.32), pal, true);
}

/** Street furniture. */
export function paintProp(px: Px, kind: OrientalProp): void {
  switch (kind) {
    case 'lantern': {
      px(7, 18, 2, 10, '#5a3a24'); px(7, 18, 1, 10, '#7a5234');
      px(4, 27, 8, 3, STONE.base); px(4, 27, 8, 1, STONE.top);
      px(5, 4, 6, 2, '#3a2010'); px(7, 2, 2, 2, '#3a2010');
      px(6, 6, 4, 1, '#f0c040');
      px(4, 7, 8, 9, '#d8301c'); px(5, 7, 2, 9, '#f05a3a'); px(4, 10, 8, 1, '#a82014'); px(4, 13, 8, 1, '#a82014');
      px(6, 16, 4, 1, '#f0c040'); px(7, 17, 2, 1, '#f0c040');
      return;
    }
    case 'stone-lantern': {
      px(4, 21, 8, 3, STONE.dark); px(5, 20, 6, 1, STONE.base);
      px(6, 14, 4, 6, STONE.base); px(6, 14, 1, 6, STONE.top);
      px(4, 12, 8, 2, STONE.base);
      px(4, 7, 8, 5, STONE.base); px(6, 8, 4, 3, '#ffd860'); px(7, 9, 2, 1, '#fff0a0');
      px(2, 5, 12, 2, STONE.dark); px(2, 4, 1, 1, STONE.dark); px(13, 4, 1, 1, STONE.dark);
      px(4, 3, 8, 2, STONE.base); px(7, 1, 2, 2, STONE.base);
      return;
    }
    case 'bonsai': {
      px(3, 14, 10, 5, '#e8eef4'); px(3, 14, 10, 1, '#ffffff'); px(4, 19, 8, 1, '#8a9aa8');
      px(5, 16, 6, 1, '#2a5aa0'); px(7, 15, 2, 3, '#2a5aa0');
      px(7, 9, 2, 5, '#6a4024'); px(6, 11, 1, 2, '#6a4024'); px(9, 8, 2, 2, '#6a4024');
      px(1, 6, 7, 4, '#3e7a3a'); px(2, 5, 5, 1, '#5aa04a'); px(8, 3, 7, 5, '#3e7a3a'); px(9, 2, 5, 1, '#5aa04a');
      px(5, 9, 5, 2, '#2e5e2c');
      return;
    }
    case 'incense': {
      px(3, 8, 10, 6, '#8a6a30'); px(3, 8, 10, 1, '#c8a050'); px(2, 7, 12, 1, '#6a4e20');
      px(4, 14, 2, 2, '#6a4e20'); px(10, 14, 2, 2, '#6a4e20');
      px(6, 10, 4, 2, '#c8a050');
      px(6, 4, 1, 3, '#7a2a1c'); px(8, 3, 1, 4, '#7a2a1c'); px(10, 4, 1, 3, '#7a2a1c');
      px(6, 2, 1, 1, '#e0e0e0'); px(9, 1, 1, 1, '#d0d0d0'); px(7, 0, 1, 1, '#c0c0c0');
      return;
    }
  }
}

function texture(scene: Phaser.Scene, a: OrientalArt): string | null {
  if (scene.textures.exists(a.key)) return a.key;
  const tex = scene.textures.createCanvas(a.key, a.w, a.h);
  if (!tex) return null;
  const ctx = tex.getContext();
  const px: Px = (x, y, w, h, c) => { if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  if (a.kind === 'house' || a.kind === 'center' || a.kind === 'mart' || a.kind === 'temple' || a.kind === 'gate') paintBuilding(px, a.kind, a.tw, a.th, a.pal, a.door);
  else paintProp(px, a.kind);
  tex.refresh();
  return a.key;
}

/** The oriental image of a map object at its anchor, or null (not oriental). */
export function addOrientalArt(scene: Phaser.Scene, o: MapObject): Phaser.GameObjects.Image | null {
  const a = orientalArtOf(o);
  if (!a) return null;
  const key = texture(scene, a);
  if (!key) return null;
  // building: bottom-left corner of the footprint (the roof rises above it) · prop: bottom centre of its tile
  if (o.kind === 'building') return scene.add.image(o.x * TILE_PX, (o.y + o.h!) * TILE_PX, key).setOrigin(0, 1).setScale(SCALE);
  return scene.add.image((o.x + 0.5) * TILE_PX, (o.y + 1) * TILE_PX - 4, key).setOrigin(0.5, 1).setScale(SCALE);
}
