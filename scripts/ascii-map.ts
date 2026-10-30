// Prints a region map as ASCII (terrain + objects) to review a layout without the game: npx tsx scripts/ascii-map.ts <id> [x0 y0 x1 y1]
// . grass  , tuft/flowers  " tall grass  ~ water  = path/plaza  # bridge  : sand/mud/rocky  r ruin  f farm  % deep/border
// objects: B building  T tree  N npc  K trainer  C chest  W waypoint  P portal  X boss  R rescue  o node  D dock  F field  !  unreachable object
import { readFileSync } from 'node:fs';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';

const [id, ...r] = process.argv.slice(2);
const d = JSON.parse(readFileSync(`src/data/vietnam/${id}.json`, 'utf8')) as RegionDef;
const m = new ValleyMap(d), W = m.widthTiles, H = m.heightTiles;
const [x0, y0, x1, y1] = r.length === 4 ? r.map(Number) : [0, 0, W - 1, H - 1];
const ch: Record<number, string> = { [T.Grass]: '.', [T.Tuft]: ',', [T.Flowers]: ',', [T.TallGrass]: '"', [T.Water]: '~', [T.Path]: '=', [T.Plaza]: '=', [T.Bridge]: '#',
  [T.Sand]: ':', [T.Mud]: ':', [T.Rocky]: ':', [T.Ruin]: 'r', [T.Farm]: 'f', [T.Deep]: '%', [T.Snow]: '.', [T.SnowDeep]: '"', [T.Ice]: '_', [T.Bog]: '~' };
const seen = new Set([d.spawn.y * W + d.spawn.x]), q = [[d.spawn.x, d.spawn.y]];
while (q.length) {
  const [x, y] = q.pop()!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, k = ny * W + nx;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || m.solidAt(nx, ny)) continue;
    seen.add(k); q.push([nx, ny]);
  }
}
const grid: string[][] = [];
for (let y = 0; y < H; y++) { grid.push([]); for (let x = 0; x < W; x++) grid[y].push(ch[m.terrainAt(x, y)] ?? '?'); }
for (let cy = 0; cy * m.chunk < H; cy++) for (let cx = 0; cx * m.chunk < W; cx++) for (const o of m.objectsInChunk(cx, cy)) {
  const x = Math.floor(o.x), y = Math.floor(o.y);
  if (o.kind === 'tree') grid[y][x] = 'T';
  else if (o.kind === 'building') for (let yy = o.y; yy < o.y + o.h!; yy++) for (let xx = o.x; xx < o.x + o.w!; xx++) grid[yy][xx] = 'B';
  else if (m.solidAt(x, y) && grid[y][x] !== 'B') grid[y][x] = 'O';
}
const mark = (o: { x: number; y: number }, c: string) => { const k = Math.floor(o.y) * W + Math.floor(o.x); grid[Math.floor(o.y)][Math.floor(o.x)] = seen.has(k) ? c : '!'; };
d.npcs.forEach((o) => mark(o, 'N')); d.trainers.forEach((o) => mark(o, 'K')); d.chests.forEach((o) => mark(o, 'C')); d.waypoints.forEach((o) => mark(o, 'W'));
(d.portals ?? []).forEach((o) => mark(o, 'P')); (d.nodes ?? []).forEach((o) => mark(o, 'o')); (d.docks ?? []).forEach((o) => mark(o, 'D')); (d.field ?? []).forEach((o) => mark(o, 'F'));
if (d.worldBoss) mark(d.worldBoss, 'X'); if (d.rescue) mark(d.rescue, 'R');
const pad = (n: number) => String(n).padStart(3);
console.log('    ' + Array.from({ length: x1 - x0 + 1 }, (_, i) => ((x0 + i) % 10 === 0 ? String(((x0 + i) / 10) % 10) : ' ')).join(''));
for (let y = y0; y <= y1; y++) console.log(pad(y) + ' ' + grid[y].slice(x0, x1 + 1).join(''));
