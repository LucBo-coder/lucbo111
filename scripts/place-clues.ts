// Dev tool (npx tsx scripts/place-clues.ts): after shrines move, puts each shrine legend's clues on the map of its
// hidden entrance (LEGENDARY_SHRINES.md mục 8: the shrine itself stands in a plane) around the entrance, on open ground
// you can walk to, and moves any clue a shrine now covers. Rewrites data/world/legend-clues.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';
import { SHRINES, shrineCells } from '../src/core/shrines';
import { LEGENDS } from '../src/core/legends';

const FILE = 'src/data/world/legend-clues.json';
type Clue = { id: string; region: string; x: number; y: number; text: string };
const data = JSON.parse(readFileSync(FILE, 'utf8')) as { legend: string; clues: Clue[] }[];
const maps = new Map<string, { m: ValleyMap; ok: Set<number>; stamp: Set<number> }>();
function info(id: string) {
  if (maps.has(id)) return maps.get(id)!;
  const d = REGION_DEFS[id], m = new ValleyMap(d), W = d.width;
  const stamp = new Set<number>();
  for (const l of d.legendaries ?? []) if (l.shrine) for (const c of shrineCells(SHRINES.get(l.shrine)!, l.x, l.y)) stamp.add(c.ty * W + c.tx);
  const blocked = new Set<number>();
  for (let cy = 0; cy < Math.ceil(d.height / d.chunk); cy++) for (let cx = 0; cx < Math.ceil(d.width / d.chunk); cx++)
    for (const o of m.objectsInChunk(cx, cy)) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blocked.add((Math.floor(o.y) + dy) * W + Math.floor(o.x) + dx);
  for (const f of d.field ?? []) blocked.add(f.y * W + f.x);
  const seen = new Set([d.spawn.y * W + d.spawn.x]), q = [[d.spawn.x, d.spawn.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= d.height || seen.has(k) || m.solidAt(nx, ny) || m.terrainAt(nx, ny) === T.Water) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  const ok = new Set([...seen].filter((k) => !blocked.has(k) && !stamp.has(k) && m.terrainAt(k % W, Math.floor(k / W)) !== T.Path));
  const r = { m, ok, stamp, seen };
  maps.set(id, r);
  return r;
}
const used = new Set<string>();
for (const e of data) for (const c of e.clues) used.add(`${c.region}:${c.x},${c.y}`);
const moved: string[] = [];
for (const e of data) {
  const l = LEGENDS.get(e.legend)!;
  // the clues lead to the entrance (overworld), not into the plane
  const entry = Object.values(REGION_DEFS).flatMap((d) => (d.secrets ?? []).map((s) => ({ d, s }))).find((x) => x.s.id === 'to-' + e.legend);
  const site = l.kind === 'shrine' && entry ? { region: entry.d.id, x: entry.s.x, y: entry.s.y } : undefined;
  e.clues.forEach((c, i) => {
    const region = site ? site.region ?? 'starter-valley' : c.region;
    const { m, ok, stamp, seen } = info(region), W = m.widthTiles;
    const fine = region === c.region && seen.has(c.y * W + c.x) && !stamp.has(c.y * W + c.x);
    if (fine) return;
    // shrine clues: on a ring around the shrine (three directions); others: nearest open tile
    let best: [number, number] | null = null, bestD = Infinity;
    const R = 12;
    const want = site ? [site.x + Math.cos(i * 2.1 + 0.6) * R, site.y + Math.sin(i * 2.1 + 0.6) * R] : [c.x, c.y];
    for (const k of ok) {
      const x = k % W, y = Math.floor(k / W);
      if (used.has(`${region}:${x},${y}`)) continue;
      const dd = Math.hypot(x - want[0], y - want[1]);
      if (dd < bestD) { bestD = dd; best = [x, y]; }
    }
    used.add(`${region}:${best![0]},${best![1]}`);
    moved.push(`${c.id}: ${c.region} (${c.x},${c.y}) → ${region} (${best![0]},${best![1]})`);
    Object.assign(c, { region, x: best![0], y: best![1] });
  });
}
writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
console.log(moved.join('\n'));
