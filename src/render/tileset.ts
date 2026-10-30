import Phaser from 'phaser';
import { COLS, EX, TILE, TILESET_ROWS, TOWN } from '../core/map/tiles';

// Builds the composite 'ow_tiles' texture: Kenney Tiny Town + Tiny Dungeon (CC0) + procedural
// extras for things those packs lack (water + shores, tall grass, sand, rocky ground...).
// Every 16x16 cell is registered as a numbered frame so tilemaps AND images share one atlas.

export const TILESET_KEY = 'ow_tiles';

function rgb(c: [number, number, number], d = 0): string {
  return `rgb(${Math.max(0, Math.min(255, c[0] + d))},${Math.max(0, Math.min(255, c[1] + d))},${Math.max(0, Math.min(255, c[2] + d))})`;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** IcyEthics floor tiles used by the tileset (loaded with the boot). */
export function preloadIcyTiles(scene: Phaser.Scene): void {
  for (const n of ['cave_gray', 'cave_blue']) for (let i = 0; i < 4; i++) scene.load.image(`icy-${n}-${i}`, `assets/icyethics/tiles/${n}_${i}.png`);
}

export function buildTileset(scene: Phaser.Scene, missing: Set<string>): void {
  if (scene.textures.exists(TILESET_KEY)) return;
  const W = COLS * TILE, H = TILESET_ROWS * TILE;
  const tex = scene.textures.createCanvas(TILESET_KEY, W, H)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;

  const draw = (key: string, oy: number, fallback: string) => {
    if (!missing.has(key) && scene.textures.exists(key)) {
      ctx.drawImage(scene.textures.get(key).getSourceImage() as CanvasImageSource, 0, oy);
    } else {
      // Asset failed to load: flat-colour placeholder grid so the game stays playable
      for (let i = 0; i < 132; i++) {
        ctx.fillStyle = i % 2 ? fallback : '#3a3a48';
        ctx.fillRect((i % COLS) * TILE, oy + Math.floor(i / COLS) * TILE, TILE, TILE);
      }
    }
  };
  draw('kenney-tiny-town', 0, '#5aa850');
  draw('kenney-tiny-dungeon', 11 * TILE, '#6a5a4a');

  // GBA-style palette (Ruby/Emerald feel): saturated 3-tone grass and a tan path with a dark rim
  const GBA = { grass: '#7cc458', mid: '#68ae48', dark: '#3f8a3c', light: '#a4dc78', path: '#e8c48a', pathLight: '#f6e2b4', pathDark: '#b88a54', pathRim: '#9c6e3e' };
  const grass: [number, number, number] = [124, 196, 88];

  const cell = (idx: number) => ({ x: (idx % COLS) * TILE, y: Math.floor(idx / COLS) * TILE });
  const fill = (idx: number, color: string) => { const c = cell(idx); ctx.fillStyle = color; ctx.fillRect(c.x, c.y, TILE, TILE); };

  const water = (idx: number, frame: number) => {
    const c = cell(idx);
    ctx.fillStyle = '#3c7fd8'; ctx.fillRect(c.x, c.y, TILE, TILE);
    ctx.fillStyle = '#5a9ae8';
    for (let i = 0; i < 3; i++) {
      const wy = (i * 5 + frame * 2) % 16;
      for (let x = 0; x < 16; x++) if ((x + i * 3 + frame * 3) % 8 < 3) ctx.fillRect(c.x + x, c.y + wy, 1, 1);
    }
    ctx.fillStyle = '#a8d0ff';
    ctx.fillRect(c.x + ((3 + frame * 7) % 14), c.y + ((5 + frame * 4) % 14), 2, 1);
  };
  water(EX.water, 0);
  water(EX.water + 1, 1);

  // Ground: Kenney's grass and dirt cells are repainted in place (same indices, so the map code is unchanged)
  const dot = (c: { x: number; y: number }, x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(c.x + x, c.y + y, 1, 1); };
  const gbaGrass = (idx: number, seed: number, tufts: number, flowers: string[] = []) => {
    const c = cell(idx);
    fill(idx, GBA.grass);
    const rnd = seeded(seed);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = rnd() < 0.5 ? GBA.mid : GBA.light; ctx.fillRect(c.x + Math.floor(rnd() * 14), c.y + Math.floor(rnd() * 14), 2, 2); }
    for (let i = 0; i < tufts; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
      dot(c, x, y, GBA.light); dot(c, x, y + 1, GBA.dark); dot(c, x - 1, y + 2, GBA.dark); dot(c, x + 1, y + 2, GBA.dark); dot(c, x, y + 2, GBA.mid);
    }
    for (const col of flowers) {
      const x = 2 + Math.floor(rnd() * 11), y = 2 + Math.floor(rnd() * 11);
      dot(c, x, y - 1, col); dot(c, x - 1, y, col); dot(c, x + 1, y, col); dot(c, x, y + 1, col); dot(c, x, y, '#fff4a0');
    }
  };
  // Path tile: the grass sides (t/r/b/l letters) get a jagged grass band, the rest is tan path with pebbles and a dark rim
  const gbaPath = (idx: number, sides: string, seed: number) => {
    const c = cell(idx), g = cell(TOWN.grass[0]);
    ctx.drawImage(tex.getSourceImage() as CanvasImageSource, g.x, g.y, TILE, TILE, c.x, c.y, TILE, TILE);
    const band = (x: number, y: number) =>
      (sides.includes('t') && y < 4 + (x % 3 === 0 ? 1 : 0)) ||
      (sides.includes('b') && y > 11 - (x % 3 === 1 ? 1 : 0)) ||
      (sides.includes('l') && x < 4 + (y % 3 === 0 ? 1 : 0)) ||
      (sides.includes('r') && x > 11 - (y % 3 === 1 ? 1 : 0));
    const rnd = seeded(seed);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (band(x, y)) continue;
      const r = rnd();
      const edge = band(x - 1, y) || band(x + 1, y) || band(x, y - 1) || band(x, y + 1);
      dot(c, x, y, edge ? GBA.pathRim : r < 0.1 ? GBA.pathLight : r > 0.93 ? GBA.pathDark : GBA.path);
    }
  };
  gbaGrass(TOWN.grass[0], 21, 16);
  gbaGrass(TOWN.grass[1], 22, 30);
  gbaGrass(TOWN.grass[2], 23, 10, ['#ffffff', '#ffe060', '#f8a0c8']);
  const D = TOWN.dirt;
  const pathTiles: [number, string][] = [[D.c, ''], [D.tl, 'tl'], [D.t, 't'], [D.tr, 'tr'], [D.l, 'l'], [D.r, 'r'], [D.bl, 'bl'], [D.b, 'b'], [D.br, 'br']];
  pathTiles.forEach(([idx, sides], i) => gbaPath(idx, sides, 31 + i));

  // Tall grass: dense blades swaying between 2 frames
  for (let f = 0; f < 2; f++) {
    const c = cell(EX.tallGrass + f);
    ctx.fillStyle = rgb(grass, -18); ctx.fillRect(c.x, c.y, TILE, TILE);
    for (let i = 0; i < 6; i++) {
      const bx = c.x + 1 + (i % 3) * 5 + (i > 2 ? 2 : 0), by = c.y + (i > 2 ? 9 : 2);
      ctx.fillStyle = rgb(grass, -55);
      ctx.fillRect(bx, by + 5, 4, 2);
      ctx.fillStyle = rgb(grass, -30);
      ctx.fillRect(bx + f, by, 1, 6); ctx.fillRect(bx + 2 + f, by + 1, 1, 5); ctx.fillRect(bx + 1, by + 2, 1, 4);
      ctx.fillStyle = rgb(grass, 25);
      ctx.fillRect(bx + f, by, 1, 1); ctx.fillRect(bx + 2 + f, by + 1, 1, 1);
    }
  }

  const speckle = (idx: number, base: string, dots: string[], n: number, seed: number) => {
    const c = cell(idx);
    fill(idx, base);
    const rnd = seeded(seed);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = dots[Math.floor(rnd() * dots.length)];
      ctx.fillRect(c.x + Math.floor(rnd() * 15), c.y + Math.floor(rnd() * 15), rnd() < 0.3 ? 2 : 1, 1);
    }
  };
  speckle(EX.sand, '#e8d49c', ['#d8c088', '#f4e4b8'], 18, 3);
  speckle(EX.sand2, '#e8d49c', ['#c8ac78', '#f4e4b8', '#b89870'], 26, 4);
  speckle(EX.rocky, '#9c9280', ['#857c6c', '#b0a894', '#6e6658'], 26, 5);
  speckle(EX.rocky2, '#968c7a', ['#7a7262', '#b8b09c'], 30, 6);
  {
    const c = cell(EX.rocky2);
    ctx.fillStyle = '#6e6658'; ctx.fillRect(c.x + 4, c.y + 8, 5, 3);
    ctx.fillStyle = '#c4bca8'; ctx.fillRect(c.x + 5, c.y + 8, 3, 1);
  }
  {
    const c = cell(EX.farmland);
    fill(EX.farmland, '#7a5030');
    for (let y = 1; y < 16; y += 4) { ctx.fillStyle = '#5e3c22'; ctx.fillRect(c.x, c.y + y, 16, 1); ctx.fillStyle = '#9a6a40'; ctx.fillRect(c.x, c.y + y + 1, 16, 1); }
    ctx.fillStyle = '#58a040';
    for (let x = 2; x < 16; x += 5) ctx.fillRect(c.x + x, c.y + 6, 2, 2);
  }
  speckle(EX.deepGrass, rgb(grass, -40), [rgb(grass, -55), rgb(grass, -25)], 30, 8);
  // Ancient ruin flagstones: 2x2 slabs with mortar lines and moss
  for (const [idx, seed] of [[EX.ruin, 11], [EX.ruin2, 12]] as const) {
    const c = cell(idx);
    fill(idx, '#b8ae98');
    ctx.fillStyle = '#8a8270';
    ctx.fillRect(c.x, c.y + 7, 16, 1); ctx.fillRect(c.x + 7, c.y, 1, 7); ctx.fillRect(c.x + 11, c.y + 8, 1, 8); ctx.fillRect(c.x, c.y + 15, 16, 1);
    ctx.fillStyle = '#cfc6b0';
    ctx.fillRect(c.x, c.y, 7, 1); ctx.fillRect(c.x + 8, c.y, 8, 1); ctx.fillRect(c.x, c.y + 8, 11, 1);
    const rnd = seeded(seed);
    for (let i = 0; i < 10; i++) { ctx.fillStyle = rnd() < 0.5 ? '#a49a84' : '#c4bca6'; ctx.fillRect(c.x + Math.floor(rnd() * 15), c.y + Math.floor(rnd() * 15), 1, 1); }
    if (idx === EX.ruin2) {
      ctx.fillStyle = rgb(grass, -20); ctx.fillRect(c.x + 2, c.y + 10, 3, 2); ctx.fillRect(c.x + 12, c.y + 3, 2, 3);
      ctx.fillStyle = '#6e6658'; ctx.fillRect(c.x + 4, c.y + 3, 3, 1); ctx.fillRect(c.x + 6, c.y + 4, 1, 2);
    }
  }

  // Shore variants: water with a sandy lip on sides that touch land (mask N=1,E=2,S=4,W=8)
  for (let mask = 1; mask < 16; mask++) {
    for (let f = 0; f < 2; f++) {
      const idx = EX.shore + mask * 2 + f;
      water(idx, f);
      const c = cell(idx);
      const lip = (x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = '#e8d49c'; ctx.fillRect(c.x + x, c.y + y, w, h);
      };
      const foam = (x: number, y: number, w: number, h: number) => { ctx.fillStyle = '#d8ecff'; ctx.fillRect(c.x + x, c.y + y, w, h); };
      if (mask & 1) { lip(0, 0, 16, 3); foam(0, 3, 16, 1); }
      if (mask & 2) { lip(13, 0, 3, 16); foam(12, 0, 1, 16); }
      if (mask & 4) { lip(0, 13, 16, 3); foam(0, 12, 16, 1); }
      if (mask & 8) { lip(0, 0, 3, 16); foam(3, 0, 1, 16); }
    }
  }
  // ── snow / volcanic / sanctuary tiles (0.7.0) ──
  speckle(EX.snow, '#eef4fb', ['#d8e4f0', '#ffffff', '#c8d8ea'], 18, 41);
  speckle(EX.snow2, '#e8f0f8', ['#c8d8ea', '#b8cce0', '#ffffff'], 26, 42);
  for (let f = 0; f < 2; f++) {
    const idx = EX.snowDeep + f, c = cell(idx);
    fill(idx, '#dfe9f4');
    for (let x = 1; x < 16; x += 3) {
      const h = 4 + ((x * 7 + f * 3) % 5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(c.x + x, c.y + 16 - h, 2, h);
      ctx.fillStyle = '#b8cce0'; ctx.fillRect(c.x + x + (f ? 1 : 0), c.y + 16 - h, 1, 2);
    }
  }
  {
    const c = cell(EX.ice); fill(EX.ice, '#a8d8f0');
    ctx.fillStyle = '#d0ecff'; ctx.fillRect(c.x + 2, c.y + 3, 6, 1); ctx.fillRect(c.x + 9, c.y + 10, 5, 1); ctx.fillRect(c.x + 3, c.y + 12, 2, 1);
    ctx.fillStyle = '#80b8d8'; ctx.fillRect(c.x + 11, c.y + 4, 1, 4); ctx.fillRect(c.x + 5, c.y + 7, 4, 1);
  }
  speckle(EX.ash, '#5a5250', ['#4a4240', '#6e6462', '#3a3432'], 24, 43);
  speckle(EX.ash2, '#544c4a', ['#7a4030', '#3a3432', '#6e6462'], 28, 44);
  {
    const c = cell(EX.ashRock); fill(EX.ashRock, '#3e3634');
    ctx.fillStyle = '#5e5452'; ctx.fillRect(c.x + 2, c.y + 2, 6, 5); ctx.fillRect(c.x + 9, c.y + 8, 5, 6);
    ctx.fillStyle = '#d05020'; ctx.fillRect(c.x + 7, c.y + 6, 3, 1); ctx.fillRect(c.x + 3, c.y + 12, 2, 1);
  }
  for (let f = 0; f < 2; f++) {
    const idx = EX.lava + f, c = cell(idx);
    fill(idx, '#d84010');
    ctx.fillStyle = '#ff8020';
    for (let i = 0; i < 4; i++) { const y = (i * 4 + f * 2) % 16; for (let x = 0; x < 16; x++) if ((x + i * 5 + f * 4) % 7 < 3) ctx.fillRect(c.x + x, c.y + y, 1, 1); }
    ctx.fillStyle = '#ffe060'; ctx.fillRect(c.x + ((4 + f * 6) % 13), c.y + ((7 + f * 5) % 13), 2, 1);
    ctx.fillStyle = '#801808'; ctx.fillRect(c.x + ((9 + f * 3) % 14), c.y + ((2 + f * 7) % 14), 3, 1);
  }
  for (const [idx, seed] of [[EX.sanctum, 51], [EX.sanctum2, 52]] as const) {
    const c = cell(idx);
    fill(idx, '#e8e0f4');
    ctx.fillStyle = '#c8bce0'; ctx.fillRect(c.x, c.y + 7, 16, 1); ctx.fillRect(c.x + 7, c.y, 1, 16);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(c.x, c.y, 7, 1); ctx.fillRect(c.x + 8, c.y + 8, 8, 1);
    const rnd = seeded(seed);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = rnd() < 0.5 ? '#f8e8a0' : '#d8cce8'; ctx.fillRect(c.x + Math.floor(rnd() * 15), c.y + Math.floor(rnd() * 15), 1, 1); }
    if (idx === EX.sanctum2) { ctx.fillStyle = '#f0c040'; ctx.fillRect(c.x + 3, c.y + 3, 2, 2); ctx.fillRect(c.x + 11, c.y + 11, 2, 2); }
  }
  {
    // snow-capped pine
    const c = cell(EX.snowPine);
    const rows = ['.......w........', '......www.......', '.....wwgww......', '.....wgggw......', '....wwgwwgw.....', '....gggggggg....', '...wwgwgwwgww...', '...gggggggggg...', '..wwgwgggwgwww..', '..gggggggggggg..', '.wwggwggggwggww.', '.gggggggggggggg.', '......bbb.......', '......bbb.......', '......bbb.......', '................'];
    const pal: Record<string, string> = { w: '#f4f8ff', g: '#2a5a44', b: '#6a4a30' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // dead charred tree
    const c = cell(EX.deadTree);
    const rows = ['................', '...k.......k....', '....k.....k.....', '..k..k...k..k...', '...k..k.k..k....', '....k..kk.k.....', '.....k.kkk......', '.......kk.......', '.......kk.......', '.......kk.......', '.......kkr......', '.......kk.......', '......kkkk......', '.....kkkkkk.....', '................', '................'];
    const pal: Record<string, string> = { k: '#2a2220', r: '#c04018' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // sanctuary crystal
    const c = cell(EX.crystal);
    const rows = ['.......w........', '......wcw.......', '......ccc.......', '.....wccpc......', '.....cccpc......', '....wcccppc.....', '....ccccppc.....', '....cccpppc.....', '....ccpppcc.....', '.....cppcc......', '.....ccccc......', '......ccc.......', '.....sssss......', '....sssssss.....', '................', '................'];
    const pal: Record<string, string> = { w: '#ffffff', c: '#b8a0f0', p: '#8060d0', s: '#b0a8c0' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // region portal (stone arch with swirl)
    const c = cell(EX.portal);
    const rows = ['....ssssssss....', '...ssvvvvvvss...', '..ssvwvvvvvvss..', '..svvvvwvvvvvs..', '..svvwvvvvwvvs..', '..svvvvvvvvvvs..', '..svvvwvvvvvvs..', '..svvvvvvwvvvs..', '..svwvvvvvvvvs..', '..svvvvvwvvvvs..', '..svvvvvvvvwvs..', '..svvwvvvvvvvs..', '..ssssssssssss..', '.ssssssssssssss.', '................', '................'];
    const pal: Record<string, string> = { s: '#8a8496', v: '#6040c0', w: '#c0a8ff' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // wooden bridge planks over water / lava
    const c = cell(EX.bridge);
    fill(EX.bridge, '#a87848');
    for (let y = 0; y < 16; y += 4) { ctx.fillStyle = '#7a5030'; ctx.fillRect(c.x, c.y + y, 16, 1); }
    ctx.fillStyle = '#5a3820'; ctx.fillRect(c.x, c.y, 2, 16); ctx.fillRect(c.x + 14, c.y, 2, 16);
    ctx.fillStyle = '#c89868'; for (let y = 2; y < 16; y += 4) ctx.fillRect(c.x + 4, c.y + y, 6, 1);
  }
  // ── swamp & coast (0.9.0) ──
  speckle(EX.mud, '#5a4a32', ['#4a3c28', '#6a5a3c', '#3e3220'], 26, 61);
  speckle(EX.mud2, '#564630', ['#6e6040', '#3e3220', '#4a5a30'], 30, 62);
  speckle(EX.swampGrass, '#3e6a3a', ['#345c32', '#4a7844', '#2e5030'], 22, 63);
  for (let f = 0; f < 2; f++) {
    // toxic puddle: purple-green sludge with a slow bubble
    const idx = EX.bog + f, c = cell(idx);
    fill(idx, '#4a3a5a');
    ctx.fillStyle = '#5e4a72';
    for (let i = 0; i < 3; i++) { const y = (i * 5 + f * 3) % 16; for (let x = 0; x < 16; x++) if ((x + i * 4 + f * 5) % 9 < 3) ctx.fillRect(c.x + x, c.y + y, 1, 1); }
    ctx.fillStyle = '#9ad050'; ctx.fillRect(c.x + ((5 + f * 6) % 13), c.y + ((4 + f * 7) % 13), 2, 2);
    ctx.fillStyle = '#c8f080'; ctx.fillRect(c.x + ((5 + f * 6) % 13), c.y + ((4 + f * 7) % 13), 1, 1);
    // murky swamp water (solid, like lake water)
    const w = EX.bogWater + f, d = cell(w);
    fill(w, '#2e4a3a');
    ctx.fillStyle = '#3c5e48';
    for (let i = 0; i < 3; i++) { const y = (i * 5 + f * 2) % 16; for (let x = 0; x < 16; x++) if ((x + i * 3 + f * 3) % 8 < 3) ctx.fillRect(d.x + x, d.y + y, 1, 1); }
    ctx.fillStyle = '#5a8060'; ctx.fillRect(d.x + ((3 + f * 7) % 14), d.y + ((9 + f * 4) % 14), 2, 1);
  }
  for (let f = 0; f < 2; f++) {
    // swamp reeds: dark tall grass with cattail heads, swaying
    const idx = EX.reeds + f, c = cell(idx);
    fill(idx, '#3e6a3a');
    for (let i = 0; i < 5; i++) {
      const x = 1 + i * 3 + (i % 2), lean = f && i % 2 ? 1 : 0;
      ctx.fillStyle = i % 2 ? '#5a8a44' : '#4a7a3a';
      for (let y = 4 + (i % 3); y < 16; y++) ctx.fillRect(c.x + x + (y < 8 ? lean : 0), c.y + y, 1, 1);
      ctx.fillStyle = '#7a5030'; ctx.fillRect(c.x + x + lean, c.y + 2 + (i % 3), 1, 3);
    }
  }
  {
    // mangrove (cây đước): low dense crown on arching prop roots standing in the mud
    const c = cell(EX.mangrove);
    const rows = ['................', '....gggGgg......', '..gggGggGggg....', '.ggGgggggGgggg..', '.gggggGgggggGg..', '..gGgggggggggg..', '...gggGgggggg...', '.....bbbbbb.....', '....b.b..b.b....', '...b..b..b..b...', '..b..b....b..b..', '..b..b....b..b..', '.b...b....b...b.', 'mmmmmmmmmmmmmmmm', '................', '................'];
    const pal: Record<string, string> = { g: '#2e7a3a', G: '#1e5a2a', b: '#6a4a30', m: '#5a4a32' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // melaleuca (cây tràm): slender pale trunk with peeling bark, narrow airy crown
    const c = cell(EX.melaleuca);
    const rows = ['......gg........', '.....gGgg.......', '....ggggGg......', '....gGgggg......', '.....gggGg......', '....gGggggg.....', '.....ggGgg......', '.......wk.......', '.......ww.......', '.......kw.......', '.......ww.......', '.......wk.......', '.......ww.......', '......wwww......', '................', '................'];
    const pal: Record<string, string> = { g: '#5a9a48', G: '#3a7a38', w: '#e8e0d0', k: '#a89880' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // coconut palm
    const c = cell(EX.palm);
    const rows = ['....gg....gg....', '..gggggg.ggggg..', '.gg..gggggg..gg.', 'g....ggGggg....g', '....gg.Gc.gg....', '...g...bcc..g...', '.......b.c......', '.......b........', '........b.......', '........b.......', '........b.......', '.......bb.......', '.......bb.......', '......bbbb......', '................', '................'];
    const pal: Record<string, string> = { g: '#3a9a40', G: '#2a7030', b: '#9a7040', c: '#6a4020' };
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  }
  {
    // Dirt-path inner corners (Kenney has outer corners only): the dirt centre tile with a small grass notch +
    // the path's own rim colour, in the corner where the diagonal neighbour is grass
    const dc = cell(TOWN.dirt.c), g0 = cell(TOWN.grass[0]);
    const img = ctx.getImageData(0, 0, W, H).data;
    const at = (x: number, y: number) => { const i = (y * W + x) * 4; return `rgb(${img[i]},${img[i + 1]},${img[i + 2]})`; };
    const rim = GBA.pathRim;
    const corners = [[EX.dirtInner.ne, 15, 0], [EX.dirtInner.nw, 0, 0], [EX.dirtInner.se, 15, 15], [EX.dirtInner.sw, 0, 15]] as const;
    for (const [idx, cx, cy] of corners) {
      const c = cell(idx);
      ctx.drawImage(tex.getSourceImage() as CanvasImageSource, dc.x, dc.y, TILE, TILE, c.x, c.y, TILE, TILE);
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < 3.6) { ctx.fillStyle = at(g0.x + x, g0.y + y); ctx.fillRect(c.x + x, c.y + y, 1, 1); }
        else if (d < 4.6) { ctx.fillStyle = rim; ctx.fillRect(c.x + x, c.y + y, 1, 1); }
      }
    }
  }
  // ── legendary shrines (V22): 16×16 pixel art, one palette each (tinted per shrine in the scene where it matters)
  const sprite = (idx: number, rows: string[], pal: Record<string, string>) => {
    const c = cell(idx);
    rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { ctx.fillStyle = pal[r[x]]; ctx.fillRect(c.x + x, c.y + y, 1, 1); } });
  };
  const STONE_PAL = { k: '#2a2830', s: '#8a8496', l: '#b8b2c4', d: '#5e5a6a' };
  // winged guardian statue on a plinth
  sprite(EX.statue, ['......kk........', '.....kllk.......', '..k..klsk..k....', '.kls.ksdk.slk...', '.klss.ss.ssdk...', '..klssssssdk....', '...kssssssk.....', '....ksssdk......', '....ksssdk......', '....kssddk......', '...ksssssdk.....', '..kkkkkkkkkk....', '..klllllllsk....', '..ksssssssdk....', '..kkkkkkkkkk....', '................'], STONE_PAL);
  // summoning core: a stone altar holding a bright orb (the scene adds the glow / state)
  sprite(EX.altar, ['................', '......kkkk......', '.....kwwcck.....', '....kwccccck....', '....kccccppk....', '....kcccpppk....', '.....kcpppk.....', '......kkkk......', '...kkkkkkkkkk...', '...kllllllllk...', '..kllsssssslk...', '..ksssdsssdssk..', '..ksdsssdsssdk..', '..kssssssssssk..', '..kkkkkkkkkkkk..', '................'], { ...STONE_PAL, w: '#ffffff', c: '#e8e0ff', p: '#a090e0' });
  // ice column
  sprite(EX.icePillar, ['.....kkkkk......', '....kwwccbk.....', '....kwccccbk....', '....kwcccbbk....', '....kccccbbk....', '....kwcccbbk....', '....kwccccbk....', '....kccccbbk....', '....kwcccbbk....', '....kwccccbk....', '....kccccbbk....', '....kwcccbbk....', '...kkkkkkkkkk...', '...kllllllllk...', '...kkkkkkkkkk...', '................'], { k: '#203048', w: '#ffffff', c: '#b8e8ff', b: '#70b0e0', l: '#d8f0ff' });
  // lightning rod: dark iron pole with copper rings and a spike
  sprite(EX.rodPillar, ['.......k........', '......kyk.......', '.......k........', '......kok.......', '......kdk.......', '.....koook......', '......kdk.......', '......kdk.......', '.....koook......', '......kdk.......', '......kdk.......', '.....koook......', '....kkdddkk.....', '...kdddddddk....', '...kkkkkkkkk....', '................'], { k: '#1a1a22', d: '#4a4a58', o: '#c87838', y: '#fff060' });
  // white sea-temple column (fluted)
  sprite(EX.whitePillar, ['...kkkkkkkkkk...', '...kwwwwwwwwk...', '....kkkkkkkk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kwlwlwlk....', '....kkkkkkkk....', '...kwwwwwwwwk...', '...kkkkkkkkkk...', '................'], { k: '#4a5060', w: '#f4f6fa', l: '#c8d0dc' });
  // broken column (Giratina's ruined mirror hall)
  sprite(EX.brokenPillar, ['................', '................', '................', '................', '.....k.k........', '....kskdk.......', '....ksssdk......', '....kssddk......', '....ksssdk......', '....kssddk......', '....ksssdk..k...', '....kssddk.ksk..', '...kkkkkkkkkkk..', '...kllllllllsk..', '...kkkkkkkkkkk..', '................'], STONE_PAL);
  // low rune stone (touch markers) and a star stone (Jirachi's constellation)
  sprite(EX.runeStone, ['................', '................', '................', '................', '................', '......kkkk......', '.....kllssk.....', '....klscssdk....', '....kscccsdk....', '....ksscssdk....', '....kssssddk....', '...kkkkkkkkkk...', '...kddddddddk...', '...kkkkkkkkkk...', '................', '................'], { ...STONE_PAL, c: '#a0f0ff' });
  sprite(EX.starStone, ['................', '................', '................', '.......y........', '......yyy.......', '...yyyyyyyyy....', '....yyyyyyy.....', '.....yyyyy......', '....yyy.yyy.....', '...kkkkkkkkk....', '...ksssssssk....', '...ksdsssdsk....', '...kkkkkkkkk....', '................', '................', '................'], { ...STONE_PAL, y: '#fff0a0' });
  // Shaymin's flower clumps: wilted / in bloom
  sprite(EX.flowerWilt, ['................', '................', '................', '................', '......b..b......', '.....b..b.b.....', '......b.bb......', '...b...bb...b...', '....b..gg..b....', '.....gggggg.....', '....gg.gg.gg....', '...g...gg...g...', '......dddd......', '.....dddddd.....', '................', '................'], { b: '#8a7050', g: '#7a8a50', d: '#5a4630' });
  sprite(EX.flowerBloom, ['................', '................', '....p.....p.....', '...pyp...pyp....', '....p..w..p.....', '......wyw.......', '..p....w....p...', '.pyp..ggg..pyp..', '..p..gggggg.p...', '....gg.gg.gg....', '...g..ggg...g...', '......gg........', '......dddd......', '.....dddddd.....', '................', '................'], { p: '#f8a0c8', y: '#ffe060', w: '#ffffff', g: '#58b048', d: '#5a4630' });
  // moon plate (Cresselia) and a teleport pad (Palkia)
  sprite(EX.moonPlate, ['................', '................', '....kkkkkkkk....', '...kmmmmmmmmk...', '..kmmmwwmmmmmk..', '..kmmwwmmmmmmk..', '..kmwwmmmmmmmk..', '..kmwwmmmmmmmk..', '..kmwwmmmmmmmk..', '..kmmwwmmmmmmk..', '..kmmmwwmmmmmk..', '...kmmmmmmmmk...', '....kkkkkkkk....', '................', '................', '................'], { k: '#5a5870', m: '#c8c8e0', w: '#ffffff' });
  sprite(EX.pad, ['................', '................', '.....kkkkkk.....', '...kkppppppkk...', '..kpprrrrrrppk..', '..kprrwwwwrrpk..', '.kprrw....wrrpk.', '.kprw......wrpk.', '.kprw......wrpk.', '.kprrw....wrrpk.', '..kprrwwwwrrpk..', '..kpprrrrrrppk..', '...kkppppppkk...', '.....kkkkkk.....', '................', '................'], { k: '#3a2840', p: '#a070c0', r: '#e8a0e8', w: '#ffffff' });
  // cracked wall (Rock Smash) and a Regi core slot
  sprite(EX.crack, ['kkkkkkkkkkkkkkkk', 'kssdsssdkssssdsk', 'ksssskdsssdsssdk', 'kdssks.ksdsssssk', 'kkkkk..kkkkkkkkk', 'ksdsk.k.ssdsssdk', 'kssk.kss.kssdssk', 'kdk.ksssdsk.sssk', 'kkk.kkkkkkk.kkkk', 'ksk.ssdssk.ssdsk', 'kssk.ssk..kssssk', 'kdssk...ksssdssk', 'kkkkkk.kkkkkkkkk', 'ksssdsk.sssdsssk', 'kssssdsksssssdsk', 'kkkkkkkkkkkkkkkk'], STONE_PAL);
  sprite(EX.regiSlot, ['................', '................', '................', '....kkkkkkkk....', '...kllllllllk...', '...klkkkkkklk...', '...klk.oo.klk...', '...klko..okdk...', '...klko..okdk...', '...klk.oo.kdk...', '...klkkkkkkdk...', '...kdddddddddk..', '...kkkkkkkkkkk..', '................', '................', '................'], { ...STONE_PAL, o: '#ffd060' });
  // IcyEthics cave floors (16 px, see scripts/prepare-icy-tiles.py); if a file is missing, the Kenney floor
  for (const [base, name] of [[EX.icyGray, 'cave_gray'], [EX.icyBlue, 'cave_blue']] as const) {
    for (let i = 0; i < 4; i++) {
      const c = cell(base + i), key = `icy-${name}-${i}`;
      if (scene.textures.exists(key)) ctx.drawImage(scene.textures.get(key).getSourceImage() as CanvasImageSource, c.x, c.y);
      else { const f = cell(132); ctx.drawImage(tex.getSourceImage() as CanvasImageSource, f.x, f.y, TILE, TILE, c.x, c.y, TILE, TILE); }
    }
  }
  tex.refresh();
  const total = COLS * TILESET_ROWS;
  for (let i = 0; i < total; i++) tex.add(i, 0, (i % COLS) * TILE, Math.floor(i / COLS) * TILE, TILE, TILE);
}

/** Extra world props that are not tiles. */
export function buildWorldProps(scene: Phaser.Scene): void {
  const make = (key: string, w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w, h)!;
    fn(t.getContext());
    t.refresh();
  };
  make('boulder', 16, 16, (ctx) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = (x - 7.5) / 7.5, dy = (y - 9) / 6.5;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      ctx.fillStyle = d > 0.78 ? '#2a2230' : dx + dy < -0.6 ? '#c8c0b0' : dx + dy > 0.7 ? '#6a6458' : '#9a9282';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#5a5448'; ctx.fillRect(5, 10, 4, 1);
  });
  for (const [key, a, b] of [['waypoint', '#4ad0ff', '#c8f4ff'], ['waypoint_off', '#5a6a80', '#9aa8b8']] as const) {
    make(key, 16, 26, (ctx) => {
      ctx.fillStyle = '#2a2230'; ctx.fillRect(3, 21, 10, 5);
      ctx.fillStyle = '#8a8478'; ctx.fillRect(4, 21, 8, 3);
      ctx.fillStyle = '#b8b0a0'; ctx.fillRect(4, 21, 8, 1);
      for (let y = 0; y < 21; y++) {
        const w = y < 6 ? y + 1 : y > 15 ? 21 - y : 6;
        ctx.fillStyle = '#1a2840'; ctx.fillRect(8 - w / 2 - 1, y, w + 2, 1);
        ctx.fillStyle = a; ctx.fillRect(8 - w / 2, y, w, 1);
        ctx.fillStyle = b; ctx.fillRect(8 - w / 2, y, Math.max(1, w / 3), 1);
      }
    });
  }
  make('cave', 40, 30, (ctx) => {
    for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) {
      const dx = (x - 19.5) / 19.5, dy = (y - 20) / 18;
      if (dx * dx + dy * dy > 1 && y < 28) continue;
      ctx.fillStyle = (x + y) % 7 === 0 ? '#6e6658' : '#8a8274';
      ctx.fillRect(x, y, 1, 1);
    }
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) {
      const dx = (x - 19.5) / 9.5, dy = (y - 30) / 19;
      if (dx * dx + dy * dy <= 1) { ctx.fillStyle = y < 14 ? '#2a2230' : '#120e16'; ctx.fillRect(x, y, 1, 1); }
    }
    ctx.fillStyle = '#c0b8a8'; ctx.fillRect(9, 3, 8, 1); ctx.fillRect(24, 5, 6, 1);
  });
  make('pokeball_big', 10, 10, (ctx) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 4.8) continue;
      ctx.fillStyle = d > 3.9 ? '#202020' : y < 4 ? '#e83030' : y === 4 || y === 5 ? '#202020' : '#f8f8f8';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#f8f8f8'; ctx.fillRect(4, 4, 2, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(2, 1, 2, 1);
  });
  make('glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  // Item icons (tinted per item colour at use site)
  make('item_held', 10, 10, (ctx) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 4.6) continue;
      ctx.fillStyle = d > 3.7 ? '#202020' : (x + y < 7 ? '#ffffff' : '#c8c8c8');
      ctx.fillRect(x, y, 1, 1);
    }
  });
  make('item_evoStone', 10, 10, (ctx) => {
    const rows = ['...kkkk...', '..kwwwwk..', '.kwwwwwwk.', 'kwwwwwwwwk', 'kwwwwwwccK', 'kwwwwwcccK', '.kwwwcccK.', '..kccccK..', '...KKKK...', '..........'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') return; ctx.fillStyle = ch === 'k' || ch === 'K' ? '#202020' : ch === 'w' ? '#ffffff' : '#c0c0c0'; ctx.fillRect(x, y, 1, 1); }));
  });
  make('item_megaStone', 10, 10, (ctx) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 4.6) continue;
      ctx.fillStyle = d > 3.7 ? '#202020' : '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#ff40a0'; ctx.fillRect(3, 3, 2, 4); ctx.fillStyle = '#40a0ff'; ctx.fillRect(5, 3, 2, 4);
    ctx.fillStyle = '#ffe040'; ctx.fillRect(4, 2, 2, 1); ctx.fillRect(4, 7, 2, 1);
  });
  make('item_key', 10, 10, (ctx) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 4.6 || d < 2.2) continue;
      ctx.fillStyle = d > 3.8 || d < 2.8 ? '#202020' : '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#ff60c0'; ctx.fillRect(4, 0, 2, 2);
  });
  make('alert', 5, 9, (ctx) => {
    ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, 5, 9);
    ctx.fillStyle = '#ffe040'; ctx.fillRect(1, 1, 3, 4); ctx.fillRect(1, 6, 3, 2);
  });
  make('zzz', 7, 7, (ctx) => {
    ctx.fillStyle = '#e0e8ff';
    ctx.fillRect(0, 0, 7, 1); ctx.fillRect(5, 1, 1, 1); ctx.fillRect(4, 2, 1, 1); ctx.fillRect(3, 3, 1, 1); ctx.fillRect(2, 4, 1, 1); ctx.fillRect(1, 5, 1, 1); ctx.fillRect(0, 6, 7, 1);
  });
  make('fog', 128, 128, (ctx) => {
    const rnd = seeded(77);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * 128, y = rnd() * 128, r = 10 + rnd() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(230,236,245,0.35)');
      g.addColorStop(1, 'rgba(230,236,245,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}
