import Phaser from 'phaser';
import { AA_ART, AA_DIR, type AaKey, worldArtKey, COLS, EX, SCALE, TILE, TILE_PX, TILESET_ROWS, TOWN } from '../core/map/tiles';
import type { MapObject } from '../core/map/mapProvider';
import { addOrientalArt } from './orientalArt';

// Builds the composite 'ow_tiles' texture: Kenney Tiny Town + Tiny Dungeon (CC0) + procedural
// extras for things those packs lack (water + shores, tall grass, sand, rocky ground...).
// Every 16x16 cell is registered as a numbered frame so tilemaps AND images share one atlas.

export const TILESET_KEY = 'ow_tiles';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** IcyEthics floor tiles used by the tileset (loaded with the boot). */
export function preloadIcyTiles(scene: Phaser.Scene): void {
  for (const n of ['cave_gray', 'cave_blue']) for (let i = 0; i < 4; i++) scene.load.image(`icy-${n}-${i}`, `assets/icyethics/tiles/${n}_${i}.png`);
}

/** Adventure Awaits (CC0) cottages and old trees — AA_ART in core/map/tiles.ts. */
export function preloadWorldArt(scene: Phaser.Scene): void {
  for (const [key, a] of Object.entries(AA_ART)) scene.load.image(key, AA_DIR + a.file);
}

/** The image of a map object (Adventure Awaits cottage / old tree, oriental building / prop) at its anchor, or null: draw the tile fallback. */
export function addWorldArt(scene: Phaser.Scene, o: MapObject): Phaser.GameObjects.Image | null {
  // old oriental town buildings / street furniture (V28), drawn by code
  const oriental = addOrientalArt(scene, o);
  if (oriental) return oriental;
  const key: AaKey | null = worldArtKey(o);
  if (!key || !scene.textures.exists(key)) return null;
  // cottage: the footprint's bottom-left corner · tree: where the 1-tile tree's base stands
  const x = o.x * TILE_PX, y = o.data?.cottage ? (o.y + o.h!) * TILE_PX : o.y * TILE_PX + 22;
  const src = scene.textures.get(key).getSourceImage();
  return scene.add.image(x, y, key).setOrigin(AA_ART[key].ax / src.width, AA_ART[key].ay / src.height).setScale(SCALE);
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
  type GroundPal = { grass: string; mid: string; dark: string; light: string };
  // `pal` reuses the same tuft / sprig shapes for other ground (swamp grass, ash-covered grass)
  const gbaGrass = (idx: number, seed: number, tufts: number, flowers: string[] = [], sprigs = 0, pal: GroundPal = GBA) => {
    const c = cell(idx);
    fill(idx, pal.grass);
    const rnd = seeded(seed);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = rnd() < 0.5 ? pal.mid : pal.light; ctx.fillRect(c.x + Math.floor(rnd() * 14), c.y + Math.floor(rnd() * 14), 2, 2); }
    for (let i = 0; i < tufts; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
      dot(c, x, y, pal.light); dot(c, x, y + 1, pal.dark); dot(c, x - 1, y + 2, pal.dark); dot(c, x + 1, y + 2, pal.dark); dot(c, x, y + 2, pal.mid);
    }
    // clover sprigs: two light leaves in a V over a dark stem
    for (let i = 0; i < sprigs; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 12);
      dot(c, x - 1, y, pal.light); dot(c, x + 1, y, pal.light); dot(c, x - 1, y + 1, pal.mid); dot(c, x, y + 1, pal.light); dot(c, x + 1, y + 1, pal.mid); dot(c, x, y + 2, pal.dark);
    }
    for (const col of flowers) {
      const x = 2 + Math.floor(rnd() * 11), y = 2 + Math.floor(rnd() * 11);
      dot(c, x, y - 1, col); dot(c, x - 1, y, col); dot(c, x + 1, y, col); dot(c, x, y + 1, col); dot(c, x, y, '#fff4a0');
    }
  };
  // Path tile: the grass sides (t/r/b/l letters) get a jagged grass band, the rest is tan path with pebbles and a dark
  // rim; `pal` swaps the ground (sand / rocky patches use the same fringe against the grass)
  const PATH_PAL = { base: GBA.path, light: GBA.pathLight, dark: GBA.pathDark, rim: GBA.pathRim };
  const gbaPath = (idx: number, sides: string, seed: number, pal = PATH_PAL) => {
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
      dot(c, x, y, edge ? pal.rim : r < 0.1 ? pal.light : r > 0.93 ? pal.dark : pal.base);
    }
  };
  gbaGrass(TOWN.grass[0], 21, 14, [], 3);
  gbaGrass(TOWN.grass[1], 22, 24, [], 5);
  gbaGrass(TOWN.grass[2], 23, 10, ['#ffffff', '#ffe060', '#f8a0c8'], 2);
  const D = TOWN.dirt;
  const pathTiles: [number, string][] = [[D.c, ''], [D.tl, 'tl'], [D.t, 't'], [D.tr, 'tr'], [D.l, 'l'], [D.r, 'r'], [D.bl, 'bl'], [D.b, 'b'], [D.br, 'br']];
  pathTiles.forEach(([idx, sides], i) => gbaPath(idx, sides, 31 + i));
  // sand / rocky patches on green ground: one tile per mask of grass sides (N=1 E=2 S=4 W=8)
  const SAND_PAL = { base: '#e8d49c', light: '#f4e4b8', dark: '#c8ac78', rim: '#b89870' };
  const ROCKY_PAL = { base: '#9c9280', light: '#b8b09c', dark: '#6e6658', rim: '#5e5848' };
  for (let mask = 1; mask < 16; mask++) {
    const sides = (mask & 1 ? 't' : '') + (mask & 2 ? 'r' : '') + (mask & 4 ? 'b' : '') + (mask & 8 ? 'l' : '');
    gbaPath(EX.sandEdge + mask, sides, 200 + mask, SAND_PAL);
    gbaPath(EX.rockyEdge + mask, sides, 220 + mask, ROCKY_PAL);
  }

  // Plaza: GBA town paving — warm grey slabs in a running bond, dark mortar, a light top edge per slab
  {
    const c = cell(TOWN.plaza);
    fill(TOWN.plaza, '#7c7468');
    const rnd = seeded(29);
    for (let row = 0; row < 4; row++) for (let k = -1; k < 2; k++) {
      const x0 = k * 8 + (row % 2 ? 4 : 0), y0 = row * 4;
      const tone = ['#c8bea8', '#bcb29c', '#d2c8b2'][Math.floor(rnd() * 3)];
      for (let y = y0; y < y0 + 3; y++) for (let x = Math.max(0, x0); x < Math.min(16, x0 + 7); x++) {
        dot(c, x, y, y === y0 ? '#e4dcc8' : x === x0 + 6 || y === y0 + 2 ? '#a89e88' : tone);
      }
    }
  }

  // Oriental town squares (V28): red-brown Bát Tràng bricks in a basket weave (pairs turned 90° per 8×8 block),
  // light mortar; the second variant has a few worn, paler bricks
  for (let v = 0; v < 2; v++) {
    const c = cell(EX.brick + v);
    fill(EX.brick + v, '#b88a6a');
    const rnd = seeded(71 + v);
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
      const across = (bx + by) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        const tone = v && rnd() < 0.25 ? '#c08066' : ['#b0644a', '#b86c50', '#a85e46'][Math.floor(rnd() * 3)];
        const x0 = bx * 8 + (across ? 0 : k * 4), y0 = by * 8 + (across ? k * 4 : 0);
        const w = across ? 7 : 3, h = across ? 3 : 7;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dot(c, x0 + x, y0 + y, y === 0 || x === 0 ? '#c4805e' : y === h - 1 || x === w - 1 ? '#94503a' : tone);
      }
    }
  }

  // Tall grass (wild encounters): GBA-style leaf tufts — pointed tips fanning out, shading darker towards the
  // roots, a dark line under each tuft — in a staggered 8×8 grid; frame 1 bends the top rows right (sway)
  {
    const tuft = ['...L....', '.L.G..L.', '.GLGL.G.', 'LGGMGGL.', 'GMGMGMG.', 'MMMDMMM.', 'DDDDDDD.', 'oooooooo'];
    const pal: Record<string, string> = { L: GBA.light, G: GBA.grass, M: GBA.mid, D: GBA.dark, o: '#2e6a2e' };
    for (let f = 0; f < 2; f++) {
      const c = cell(EX.tallGrass + f);
      fill(EX.tallGrass + f, '#4e9640');
      for (const [bx, by] of [[0, 0], [8, 0], [4, 8], [12, 8], [-4, 8]] as const) {
        tuft.forEach((r, y) => {
          for (let x = 0; x < 8; x++) {
            const col = pal[r[x]], tx = bx + x + (f && y < 3 ? 1 : 0);
            if (col && tx >= 0 && tx < 16) dot(c, tx, by + y, col);
          }
        });
      }
    }
  }

  // Trees: Kenney's flat 1-tile trees repainted GBA-style — dark outline, a 4-tone crown lit from the top-left with
  // highlight clusters, a 3-tone trunk. Same indices; the scene adds the ground shadow.
  const paint = (idx: number, rows: string[], pal: Record<string, string>) => {
    const c = cell(idx);
    ctx.clearRect(c.x, c.y, TILE, TILE);
    rows.forEach((r, y) => { for (let x = 0; x < TILE; x++) { const col = pal[r[x]]; if (col) dot(c, x, y, col); } });
  };
  const trunk = { t: '#4a2e1a', T: '#7a4e2a', b: '#a0703c' };
  const summer = { o: '#1e4a2a', D: '#2e6e34', M: '#3f8f3c', G: '#5cae48', L: '#8ed06a', H: '#c4ec90', ...trunk };
  const autumn = { o: '#5a2a14', D: '#a04a1a', M: '#c8662a', G: '#e08a34', L: '#f0b050', H: '#f8d888', ...trunk };
  const conifer = { o: '#163a26', D: '#1f5a34', M: '#2e7a40', G: '#45984c', L: '#6ab860', H: '#9ad07a', ...trunk };
  const ROUND = [
    '.....oooooo.....', '...ooLLHLGGoo...', '..oLLHHLGGGMMo..', '.oLLHHLLGGMMMDo.', '.oLHLLGGGMGMMDo.', 'oGLLGGGMGGMMMDDo',
    'oGGGGMGGMMMMDDDo', 'oMGGMMMMMMMDDDDo', '.oMMMDMMMDDDDDo.', '.oDMMDDDDDDDDDo.', '..ooDDDDDDDDoo..', '....ooDtTDoo....',
    '......tTbt......', '......tTbt......', '.....ttTbtt.....', '................',
  ];
  const TALL = [
    '......oooo......', '.....oLHLGo.....', '....oLHHLGMo....', '....oLHLGGMo....', '...oLLLGGMMDo...', '...oLGGGMGMDo...',
    '...oGLGGMMMDo...', '...oGGGMGMDDo...', '...oMGGMMMDDo...', '...oMMGMMDDDo...', '....oMMMDDDo....', '....oDMDDDDo....',
    '.....ooDDoo.....', '.......tT.......', '......ttTb......', '................',
  ];
  const PINE = [
    '.......oo.......', '......oLMo......', '.....oLGMDo.....', '....oLGGMDDo....', '...ooLGMMDDoo...', '.....oLGMDo.....',
    '....oLGGMMDo....', '...oLGGMMMDDo...', '..ooLGGMMDDDoo..', '....oLGGMMDo....', '...oLGGMMMDDo...', '..oLGGGMMMDDDo..',
    '.oLGGGMMMMDDDDo.', '.oooooDTtDooooo.', '......tTbt......', '......tTbt......',
  ];
  const BUSH = [
    '................', '................', '................', '................', '................', '................',
    '.....oooooo.....', '...ooLHLGGMoo...', '..oLLHLGGMMDDo..', '.oLGGLGGMMMDDDo.', '.oGGGGMMMDMDDDo.', '.oMGMMMDDMDDDDo.',
    '..oMMDDDDDDDDo..', '...oooooooooo...', '................', '................',
  ];
  paint(TOWN.round, ROUND, summer); paint(TOWN.roundAutumn, ROUND, autumn);
  paint(TOWN.tall, TALL, summer); paint(TOWN.tallAutumn, TALL, autumn);
  paint(TOWN.pine, PINE, conifer); paint(TOWN.pineAutumn, PINE, autumn);
  paint(TOWN.bush, BUSH, summer);

  // Roof recolours: the red roof's colours ranked by brightness map onto a new ramp; the outline (darkest) stays
  {
    const src = ['tl', 't', 'tr', 'bl', 'b', 'br'] as const;
    const lum = (r: number, g: number, b: number) => r * 0.3 + g * 0.59 + b * 0.11;
    const px = src.map((k) => { const c = cell(TOWN.roofRed[k]); return ctx.getImageData(c.x, c.y, TILE, TILE); });
    const colours = new Map<string, number>();
    for (const d of px) for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3]) colours.set(`${d.data[i]},${d.data[i + 1]},${d.data[i + 2]}`, lum(d.data[i], d.data[i + 1], d.data[i + 2]));
    const ranked = [...colours.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const recolour = (ramp: string[], target: Record<(typeof src)[number], number>) => {
      const stops = ramp.map(hex);
      const map = new Map<string, number[]>();
      ranked.forEach((k, i) => {
        if (i === 0) return; // outline
        const t = (i - 1) / Math.max(1, ranked.length - 2) * (stops.length - 1), a = Math.floor(t), f = t - a, b = Math.min(a + 1, stops.length - 1);
        map.set(k, stops[a].map((v, j) => Math.round(v + (stops[b][j] - v) * f)));
      });
      src.forEach((k, n) => {
        const d = new ImageData(new Uint8ClampedArray(px[n].data), TILE, TILE);
        for (let i = 0; i < d.data.length; i += 4) { const m = map.get(`${d.data[i]},${d.data[i + 1]},${d.data[i + 2]}`); if (m && d.data[i + 3]) d.data.set(m, i); }
        const c = cell(target[k]);
        ctx.putImageData(d, c.x, c.y);
      });
    };
    recolour(['#6a4410', '#a8741c', '#d8a432', '#f2cc58', '#fff0a8'], EX.roofGold);
    recolour(['#1e4440', '#2e6e64', '#3e9488', '#6cc0b0', '#b8ece0'], EX.roofTeal);
  }
  // Signs over the door: a Poké Ball for Pokémon Centers, a blue "M" plate for marts, on a copy of the plain wall
  {
    const BALL = ['..oooo..', '.orrrro.', 'orrrrrro', 'ooowwooo', 'ooowwooo', 'owwwwwwo', '.owwwwo.', '..oooo..'];
    const MART = ['oooooooooo', 'oBBBBBBBBo', 'oBwBBBBwBo', 'oBwwBBwwBo', 'oBwBwwBwBo', 'oBwBBBBwBo', 'oBBBBBBBBo', 'oooooooooo'];
    const pal: Record<string, string> = { o: '#2a1c24', r: '#e83838', w: '#ffffff', B: '#3868d8' };
    for (const [wall, center, mart] of [[TOWN.wallStone.c, EX.signCenter.stone, EX.signMart.stone], [TOWN.wallWood.c, EX.signCenter.wood, EX.signMart.wood]] as const) {
      for (const [idx, art] of [[center, BALL], [mart, MART]] as const) {
        const c = cell(idx), s = cell(wall);
        ctx.drawImage(tex.getSourceImage() as CanvasImageSource, s.x, s.y, TILE, TILE, c.x, c.y, TILE, TILE);
        const ox = (TILE - art[0].length) >> 1;
        art.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) dot(c, ox + x, 4 + y, pal[r[x]]); });
      }
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
  {
    // Deep grass: the GBA grass one step darker, same tuft shapes, so patches blend into the meadow instead of
    // reading as flat dark rectangles
    const c = cell(EX.deepGrass);
    fill(EX.deepGrass, GBA.mid);
    const rnd = seeded(8);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = rnd() < 0.5 ? '#5a9e40' : GBA.grass; ctx.fillRect(c.x + Math.floor(rnd() * 14), c.y + Math.floor(rnd() * 14), 2, 2); }
    for (let i = 0; i < 22; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
      dot(c, x, y, GBA.grass); dot(c, x, y + 1, GBA.dark); dot(c, x - 1, y + 2, GBA.dark); dot(c, x + 1, y + 2, GBA.dark);
    }
  }
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
      // moss: a muted olive that sits on stone in any region (the bright meadow green read as paint on snow / ash)
      ctx.fillStyle = '#7a8a58'; ctx.fillRect(c.x + 2, c.y + 10, 3, 2); ctx.fillRect(c.x + 12, c.y + 3, 2, 3);
      ctx.fillStyle = '#5e6e44'; ctx.fillRect(c.x + 2, c.y + 11, 3, 1); ctx.fillRect(c.x + 12, c.y + 5, 2, 1);
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
      // shallows: a lighter band between the sand lip and the deep water (drawn first, lips and foam go on top)
      const shallow = (x: number, y: number, w: number, h: number) => { ctx.fillStyle = '#5c9ee8'; ctx.fillRect(c.x + x, c.y + y, w, h); };
      if (mask & 1) shallow(0, 4, 16, 3);
      if (mask & 2) shallow(9, 0, 3, 16);
      if (mask & 4) shallow(0, 9, 16, 3);
      if (mask & 8) shallow(4, 0, 3, 16);
      if (mask & 1) { lip(0, 0, 16, 3); foam(0, 3, 16, 1); }
      if (mask & 2) { lip(13, 0, 3, 16); foam(12, 0, 1, 16); }
      if (mask & 4) { lip(0, 13, 16, 3); foam(0, 12, 16, 1); }
      if (mask & 8) { lip(0, 0, 3, 16); foam(3, 0, 1, 16); }
      // wet sand: one darker row where the lip meets the foam
      ctx.fillStyle = '#c8b07c';
      if (mask & 1) ctx.fillRect(c.x, c.y + 2, 16, 1);
      if (mask & 2) ctx.fillRect(c.x + 13, c.y, 1, 16);
      if (mask & 4) ctx.fillRect(c.x, c.y + 13, 16, 1);
      if (mask & 8) ctx.fillRect(c.x + 2, c.y, 1, 16);
    }
  }
  // ── snow / volcanic / sanctuary tiles (0.7.0; V26: GBA-style detail) ──
  // Snow: soft drift crests (white top, blue shadow under) and sparkles; snow2 is the windier variant
  const drift = (c: { x: number; y: number }, x: number, y: number, w: number) => {
    for (let i = 0; i < w; i++) {
      const lift = i === 0 || i === w - 1 ? 1 : 0;
      dot(c, (x + i) & 15, y + lift, '#ffffff'); dot(c, (x + i) & 15, y + lift + 1, '#c8d8ec');
    }
  };
  for (const [idx, seed, n] of [[EX.snow, 41, 3], [EX.snow2, 42, 5]] as const) {
    const c = cell(idx);
    fill(idx, '#e6eef8');
    const rnd = seeded(seed);
    for (let i = 0; i < n; i++) drift(c, Math.floor(rnd() * 16), 1 + Math.floor(rnd() * 12), 4 + Math.floor(rnd() * 3));
    for (let i = 0; i < 4; i++) dot(c, Math.floor(rnd() * 16), Math.floor(rnd() * 16), rnd() < 0.5 ? '#ffffff' : '#d4e0ee');
  }
  // Deep snow: rounded mounds (white crown, blue-grey shadow at the foot); the sparkle moves between frames
  for (let f = 0; f < 2; f++) {
    const idx = EX.snowDeep + f, c = cell(idx);
    fill(idx, '#d8e4f2');
    for (const [mx, my] of [[1, 1], [9, 4], [4, 9], [12, 11]] as const) {
      const mound = ['.wwww.', 'wwwwww', 'wwwwss', '.ssss.'];
      mound.forEach((r, y) => { for (let x = 0; x < 6; x++) if (r[x] !== '.') dot(c, (mx + x) & 15, (my + y) & 15, r[x] === 'w' ? '#ffffff' : '#b4c8de'); });
    }
    dot(c, f ? 11 : 3, f ? 5 : 2, '#a8d8ff');
  }
  {
    const c = cell(EX.ice); fill(EX.ice, '#a8d8f0');
    ctx.fillStyle = '#d0ecff'; ctx.fillRect(c.x + 2, c.y + 3, 6, 1); ctx.fillRect(c.x + 9, c.y + 10, 5, 1); ctx.fillRect(c.x + 3, c.y + 12, 2, 1);
    ctx.fillStyle = '#80b8d8'; ctx.fillRect(c.x + 11, c.y + 4, 1, 4); ctx.fillRect(c.x + 5, c.y + 7, 4, 1);
  }
  // Ash (Route 113 feel): grey ground with ash-covered grass tufts and cinders; ash2 has glowing embers
  const ASH = { grass: '#6a6462', mid: '#5c5654', dark: '#3e3836', light: '#8e8884' };
  gbaGrass(EX.ash, 43, 8, [], 1, ASH);
  gbaGrass(EX.ash2, 44, 6, [], 1, ASH);
  for (const [idx, seed] of [[EX.ash, 45], [EX.ash2, 46]] as const) {
    const c = cell(idx), rnd = seeded(seed);
    for (let i = 0; i < 2; i++) dot(c, Math.floor(rnd() * 16), Math.floor(rnd() * 16), '#2e2826');
    if (idx === EX.ash2) { dot(c, 9, 10, '#ff9040'); dot(c, 10, 10, '#d05020'); }
  }
  // Volcanic rock: cracked basalt sheet — cracks wrap around the tile edges so a rock field reads as one surface;
  // a lit edge below each crack, two glowing seams
  paint(EX.ashRock, [
    'MMMMMMkLMMMMMMMM', 'MMMMMMkLMMMMDMMM', 'MMMDMMkLMMMMMMMM', 'MMMMMMMkLMMMMMMM', 'kkkMMMMkLMMMMMMM', 'LLLkkMMMkkkkLLLL',
    'kMMLLkkkeLLLkkkk', 'MMMMMLLkLMMMMMMM', 'MMDMMMMkLMMMMDMM', 'MMMMMMMkLMMMMMMM', 'MMMMMMkLMMMMMMMM', 'MMMMMMkLMMMDMMMM',
    'kkkkMMkLMMMMMMMk', 'LLLLkkkeLLLLLkkL', 'MMMMLLkLMMMMMLLM', 'MMMMMMkLMMMMMMMM',
  ], { k: '#1e1816', L: '#6e6462', M: '#4e4644', D: '#3e3634', e: '#e06020' });
  // Lava: dark cooling crust plates drifting on a bright flow; the bright seams and sparks move between frames
  for (let f = 0; f < 2; f++) {
    const idx = EX.lava + f, c = cell(idx);
    fill(idx, '#e05010');
    for (let i = 0; i < 4; i++) { const y = (i * 4 + f * 2) % 16; for (let x = 0; x < 16; x++) if ((x + i * 5 + f * 4) % 7 < 2) dot(c, x, y, '#ff9030'); }
    for (const [px, py, w, h] of [[1, 2, 5, 3], [9, 7, 6, 3], [3, 11, 4, 2]] as const) {
      const ox = (px + f) & 15;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = y === 0 || x === 0 || x === w - 1 || y === h - 1;
        dot(c, (ox + x) & 15, py + y, edge ? '#a83010' : '#6a1c08');
      }
      dot(c, (ox + 1) & 15, py, '#c84818');
    }
    dot(c, (4 + f * 6) % 13, (7 + f * 5) % 13, '#ffe060'); dot(c, ((4 + f * 6) % 13) + 1, (7 + f * 5) % 13, '#fff4b0');
  }
  // Themed paths: packed-snow trail with sled / boot ruts (frozen), basalt slabs with dark joints (volcanic)
  for (const [idx, seed] of [[EX.snowPath, 47], [EX.snowPath + 1, 48]] as const) {
    const c = cell(idx), rnd = seeded(seed);
    fill(idx, '#d4e0ee');
    // boot prints in no particular direction (paths turn and widen): a pressed oval, its lit lower lip
    for (let i = 0; i < 3; i++) {
      const x = 1 + Math.floor(rnd() * 12), y = 1 + Math.floor(rnd() * 12);
      dot(c, x, y, '#b4c4d8'); dot(c, x + 1, y, '#b4c4d8'); dot(c, x, y + 1, '#eef4fa'); dot(c, x + 1, y + 1, '#eef4fa');
    }
    for (let i = 0; i < 6; i++) dot(c, Math.floor(rnd() * 16), Math.floor(rnd() * 16), rnd() < 0.5 ? '#c2d0e2' : '#f0f6fc');
    if (idx !== EX.snowPath) { dot(c, 8, 6, '#8a8a90'); dot(c, 9, 6, '#a8a8b0'); dot(c, 8, 7, '#6a6a70'); }
  }
  for (const [idx, seed] of [[EX.basaltPath, 49], [EX.basaltPath + 1, 50]] as const) {
    const c = cell(idx), rnd = seeded(seed);
    fill(idx, '#241e1c');
    // 2×2 slabs of 7×7 with a lit top-left edge and a darker bottom-right
    for (const [sx, sy] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
      const off = sy ? 4 : 0; // running bond: the second row is shifted
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const tx = (sx + x + off) & 15;
        dot(c, tx, sy + y, y === 0 || x === 0 ? '#7a706c' : y === 6 || x === 6 ? '#3e3634' : rnd() < 0.12 ? '#665e5a' : '#544c4a');
      }
    }
    if (idx !== EX.basaltPath) { dot(c, 7, 4, '#e06020'); dot(c, 7, 5, '#a03818'); dot(c, 3, 15, '#e06020'); }
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
  // Mud: wet ground with small puddles (dark rim, a light glint) and a few cracks; mud2 has grass sprouts
  for (const [idx, seed] of [[EX.mud, 61], [EX.mud2, 62]] as const) {
    speckle(idx, '#5a4a32', ['#4a3c28', '#6a5a3c'], 14, seed);
    const c = cell(idx), rnd = seeded(seed + 100);
    for (let i = 0; i < 2; i++) {
      const x = 1 + Math.floor(rnd() * 10), y = 1 + Math.floor(rnd() * 12);
      for (let k = 0; k < 4; k++) { dot(c, x + k, y, '#3e3220'); dot(c, x + k, y + 1, k === 1 ? '#a89878' : '#6e6048'); }
    }
    if (idx === EX.mud2) for (const [x, y] of [[3, 12], [12, 4]] as const) { dot(c, x, y, '#6a9a48'); dot(c, x - 1, y - 1, '#6a9a48'); dot(c, x + 1, y - 1, '#8ab860'); dot(c, x, y + 1, '#3e5a2a'); }
  }
  // Swamp grass: the meadow's tufts and sprigs in a dark, damp palette
  gbaGrass(EX.swampGrass, 63, 14, [], 3, { grass: '#3e6a3a', mid: '#345c32', dark: '#24442a', light: '#5a8a4c' });
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
    paint(EX.mangrove, [
      '................', '...ooooooooo....', '..oLLGGLGGMMo...', '.oLHLGGGMGMMDo..', '.oGLGGMGGMMDDDo.', '.oMGGMMMGMDDDDo.',
      '..oMMDMMDDDDDo..', '...ooobBbbooo...', '....b.B..b.b....', '...b..B..b..b...', '..b..b....B..b..', '..b..b....B..b..',
      '.b...b....B...b.', 'mmmmmmmmmmmmmmmm', '................', '................',
    ], { o: '#123a1e', D: '#1e5a2a', M: '#2e7a3a', G: '#3e9446', L: '#62b05a', H: '#9ad07a', b: '#5a3a24', B: '#8a6040', m: '#5a4a32' });
  }
  {
    // melaleuca (cây tràm): slender pale trunk with peeling bark, narrow airy crown
    paint(EX.melaleuca, [
      '......ooo.......', '.....oLGGo......', '....oLGLGMo.....', '...oLGGMGMDo....', '....oGMLGMDo....', '...oLGGMGMMDo...',
      '....oMGMDMDo....', '.....ooDnDoo....', '.......nWk......', '.......nkW......', '.......nWk......', '.......nWW......',
      '.......nkW......', '......nnWkn.....', '................', '................',
    ], { o: '#1e4a2a', D: '#2e6e34', M: '#3f8f3c', G: '#5cae48', L: '#8ed06a', W: '#ece4d4', k: '#b0a088', n: '#6a5a48' });
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
    const g0 = cell(TOWN.grass[0]);
    const img = ctx.getImageData(0, 0, W, H).data;
    const at = (x: number, y: number) => { const i = (y * W + x) * 4; return `rgb(${img[i]},${img[i + 1]},${img[i + 2]})`; };
    // corner bits: NE=1, NW=2, SE=4, SW=8 → the corner pixel each notch is centred on
    const CORNER: [number, number, number][] = [[1, 15, 0], [2, 0, 0], [4, 15, 15], [8, 0, 15]];
    const notched = (idx: number, src: number, corners: number, rim: string) => {
      const c = cell(idx), s = cell(src);
      ctx.drawImage(tex.getSourceImage() as CanvasImageSource, s.x, s.y, TILE, TILE, c.x, c.y, TILE, TILE);
      for (const [bit, cx, cy] of CORNER) {
        if (!(corners & bit)) continue;
        for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d < 3.6) dot(c, x, y, at(g0.x + x, g0.y + y));
          else if (d < 4.6) dot(c, x, y, rim);
        }
      }
    };
    notched(EX.dirtInner.ne, TOWN.dirt.c, 1, GBA.pathRim);
    notched(EX.dirtInner.nw, TOWN.dirt.c, 2, GBA.pathRim);
    notched(EX.dirtInner.se, TOWN.dirt.c, 4, GBA.pathRim);
    notched(EX.dirtInner.sw, TOWN.dirt.c, 8, GBA.pathRim);
    // sand / rocky patches: every combination of grass corners (diagonal neighbours only)
    for (let m = 1; m < 16; m++) {
      notched(EX.sandInner + m, EX.sand, m, SAND_PAL.rim);
      notched(EX.rockyInner + m, EX.rocky, m, ROCKY_PAL.rim);
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
