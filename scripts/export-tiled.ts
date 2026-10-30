// Exports the overworld maps to Tiled (https://www.mapeditor.org) so the tile art can be reviewed in a real map editor:
//   tiled/ow_tiles.png  the composite 'ow_tiles' atlas exactly as the game builds it (src/render/tileset.ts)
//   tiled/ow_tiles.tsx  that atlas as a Tiled tileset, with the water / tall grass / shore / lava… animations
//   tiled/<map>.tmx     Ground layer (frame 0 of MapProvider.tileIndexAt), Buildings layer, and an object layer with
//                       the trees / props / fences / signs as tile objects and everything else as labelled points
// Maps are generated procedurally at runtime, so these files are a view, not a source: edit the art in tileset.ts
// and the layout in src/data/**.json, then export again.
// Usage: npx tsx scripts/export-tiled.ts [map ids…]   (default: every overworld map)
//        --maps-only   skip the atlas (it needs a browser: a Vite dev server + Edge headless renders the canvas)
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { chunkCols, chunkRows, type MapObject } from '../src/core/map/mapProvider';
import { COLS, EX, TILE, TILE_PX, TILESET_ROWS } from '../src/core/map/tiles';

const OUT = 'tiled';
const args = process.argv.slice(2);
const mapsOnly = args.includes('--maps-only');
const ids = args.filter((a) => !a.startsWith('--'));
const TILED = 'tiledversion="1.12.2" version="1.10"';
const FRAME_MS = 450; // AdventureScene swaps animated tiles every 0.45 s

/** Two-frame animated tiles (base index → base + 1), same list as MapProvider.animatedAt's terrains. */
function animatedBases(): number[] {
  const b: number[] = [EX.water, EX.tallGrass, EX.snowDeep, EX.lava, EX.bog, EX.bogWater, EX.reeds];
  for (let mask = 0; mask < 16; mask++) b.push(EX.shore + mask * 2);
  return b;
}

function tsx(): string {
  const anims = animatedBases().map((t) =>
    `  <tile id="${t}">\n   <animation>\n    <frame tileid="${t}" duration="${FRAME_MS}"/>\n    <frame tileid="${t + 1}" duration="${FRAME_MS}"/>\n   </animation>\n  </tile>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<tileset ${TILED} name="ow_tiles" tilewidth="${TILE}" tileheight="${TILE}" tilecount="${COLS * TILESET_ROWS}" columns="${COLS}">
 <image source="ow_tiles.png" width="${COLS * TILE}" height="${TILESET_ROWS * TILE}"/>
${anims}
</tileset>
`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const csv = (g: number[][]) => g.map((r) => r.join(',')).join(',\n');

function tmx(id: string): string {
  const map = new ValleyMap(REGION_DEFS[id]);
  const W = map.widthTiles, H = map.heightTiles;
  const ground = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => map.tileIndexAt(x, y, 0) + 1));
  const buildings = Array.from({ length: H }, () => new Array<number>(W).fill(0));
  const objs: string[] = [];
  let oid = 1;
  const px = (tiles: number) => Math.round(tiles * TILE * 100) / 100; // tile units → tileset pixels
  const scene = (worldPx: number) => Math.round((worldPx / TILE_PX) * TILE * 100) / 100; // AdventureScene world px → tileset px
  const tileObj = (o: MapObject, x: number, y: number) =>
    objs.push(` <object id="${oid++}" name="${esc(o.id)}" type="${o.kind}" gid="${o.tile! + 1}" x="${x}" y="${y}" width="${TILE}" height="${TILE}"/>`);

  for (let cy = 0; cy < chunkRows(map); cy++) for (let cx = 0; cx < chunkCols(map); cx++) {
    for (const o of map.objectsInChunk(cx, cy)) {
      // positions mirror AdventureScene.onChunkLoad; Tiled anchors tile objects at their bottom-left corner
      if (o.kind === 'building' && o.tiles) {
        o.tiles.forEach((row, ry) => row.forEach((t, rx) => { if (o.y + ry < H && o.x + rx < W) buildings[o.y + ry][o.x + rx] = t + 1; }));
      } else if (o.kind === 'tree' && o.tile !== undefined) {
        tileObj(o, px(o.x) - TILE / 2, px(o.y) + scene(22)); // origin (0.5, 1) at (px, py + 22)
      } else if ((o.kind === 'prop' || o.kind === 'pillar' || o.kind === 'sign') && o.tile !== undefined) {
        tileObj(o, px(o.x), px(o.y + 1)); // centred on the tile
      } else if ((o.kind === 'fence' || o.kind === 'torch' || o.kind === 'decal') && o.tile !== undefined) {
        tileObj(o, px(o.x), px(o.y + 1));
      } else {
        // NPCs, chests, portals… are sprites outside ow_tiles: a labelled point keeps them findable in Tiled
        const name = (o.data as { name?: string } | undefined)?.name ?? o.id;
        objs.push(` <object id="${oid++}" name="${esc(String(name))}" type="${o.kind}" x="${px(o.x + 0.5)}" y="${px(o.y + 0.5)}"><point/></object>`);
      }
    }
  }
  const layer = (lid: number, name: string, g: number[][]) =>
    ` <layer id="${lid}" name="${name}" width="${W}" height="${H}">\n  <data encoding="csv">\n${csv(g)}\n</data>\n </layer>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<map ${TILED} orientation="orthogonal" renderorder="right-down" width="${W}" height="${H}" tilewidth="${TILE}" tileheight="${TILE}" infinite="0" nextlayerid="4" nextobjectid="${oid}">
 <properties>
  <property name="name" value="${esc(map.name)}"/>
  <property name="generated" value="npx tsx scripts/export-tiled.ts — do not edit, export again"/>
 </properties>
 <tileset firstgid="1" source="ow_tiles.tsx"/>
${layer(1, 'Ground', ground)}
${layer(2, 'Buildings', buildings)}
 <objectgroup id="3" name="Objects">
${objs.join('\n')}
 </objectgroup>
</map>
`;
}

async function exportAtlas(): Promise<void> {
  const { chromium } = await import('@playwright/test');
  const port = 5197;
  const server = spawn(`npx vite --port ${port} --strictPort`, { shell: true, stdio: 'ignore' });
  try {
    const url = `http://localhost:${port}/?debug`;
    for (let i = 0; ; i++) {
      try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
      if (i > 120) throw new Error('vite dev server did not start');
      await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await chromium.launch({ channel: 'msedge' });
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction("window.__phaser?.textures.exists('ow_tiles')", undefined, { timeout: 60_000 });
    const data = await page.evaluate("window.__phaser.textures.get('ow_tiles').getSourceImage().toDataURL('image/png')") as string;
    await browser.close();
    writeFileSync(`${OUT}/ow_tiles.png`, Buffer.from(data.split(',')[1], 'base64'));
    console.log(`${OUT}/ow_tiles.png`);
  } finally {
    // with a shell, kill() only stops the shell on Windows and leaves vite listening: stop the whole tree
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
    else server.kill();
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/ow_tiles.tsx`, tsx());
for (const id of ids.length ? ids : Object.keys(REGION_DEFS)) {
  writeFileSync(`${OUT}/${id}.tmx`, tmx(id));
  console.log(`${OUT}/${id}.tmx`);
}
if (!mapsOnly) await exportAtlas();
