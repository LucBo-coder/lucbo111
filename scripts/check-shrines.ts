// Dev check for the shrine placement (npx tsx scripts/check-shrines.ts): authored things under a stamp, overlapping
// shrines, ritual spot / authored points that can no longer be walked to from the map spawn.
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';
import { SHRINES, shrineBounds, shrineCells, shrineFind } from '../src/core/shrines';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function blocked(m: ValleyMap): Set<string> {
  const s = new Set<string>();
  for (const f of m.def.field ?? []) s.add(`${f.x},${f.y}`);
  for (let cy = 0; cy < Math.ceil(m.heightTiles / m.chunk); cy++) for (let cx = 0; cx < Math.ceil(m.widthTiles / m.chunk); cx++)
    for (const o of m.objectsInChunk(cx, cy)) if (o.collideR || o.kind === 'tree' || o.kind === 'boulder') s.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  return s;
}
function reach(m: ValleyMap): Set<string> {
  const b = blocked(m), sp = m.def.spawn, seen = new Set([`${sp.x},${sp.y}`]), q = [[sp.x, sp.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || m.solidAt(nx, ny) || b.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
const near = (s: Set<string>, x: number, y: number) => s.has(`${x},${y}`) || N4.some(([dx, dy]) => s.has(`${x + dx},${y + dy}`));
function points(d: RegionDef): [string, number, number][] {
  return [
    ...d.npcs.map((o) => [o.id, o.x, o.y]), ...d.trainers.map((o) => [o.id, o.x, o.y]), ...d.chests.map((o) => [o.id, o.x, o.y]),
    ...d.waypoints.map((o) => [o.id, o.x, o.y]), ...d.signs.map((o, i) => [`sign#${i}`, o.x, o.y]), ...d.props.map((o, i) => [`prop#${i}`, o.x, o.y]),
    ...(d.portals ?? []).map((o) => [o.id, o.x, o.y]), ...d.dungeons.map((o) => [o.id, o.x, o.y]), ...(d.nodes ?? []).map((o) => [o.id, o.x, o.y]),
    ...(d.field ?? []).map((o) => [o.id, o.x, o.y]), ...d.pillars.map(([x, y]) => ['pillar', x, y]),
    ...d.buildings.flatMap((b) => [[b.id, b.x, b.y], [b.id, b.x + b.w - 1, b.y + b.h - 1]]),
    ...(d.worldBoss ? [['worldBoss', d.worldBoss.x, d.worldBoss.y]] : []), ...(d.rescue.x >= 0 ? [['rescue', d.rescue.x, d.rescue.y]] : []),
    ...(d.legendaries ?? []).filter((l) => !l.shrine).map((l) => [`ring:${l.id}`, l.x, l.y]),
  ] as [string, number, number][];
}

const out: string[] = [];
for (const [id, d] of Object.entries(REGION_DEFS)) {
  const sites = (d.legendaries ?? []).filter((l) => l.shrine);
  if (!sites.length) continue;
  const m = new ValleyMap(d), base = new ValleyMap({ ...d, legendaries: (d.legendaries ?? []).filter((l) => !l.shrine) });
  const r = reach(m), r0 = reach(base);
  const cells = new Map<string, string>();
  for (const l of sites) {
    const s = SHRINES.get(l.shrine!)!;
    for (const c of shrineCells(s, l.x, l.y)) {
      const k = `${c.tx},${c.ty}`;
      if (cells.has(k)) { if (!out.some((o) => o.startsWith(`${id}: ${l.id} overlaps`))) out.push(`${id}: ${l.id} overlaps ${cells.get(k)} at ${k}`); continue; }
      cells.set(k, l.id);
    }
    const [x0, y0, x1, y1] = shrineBounds(s, l.x, l.y);
    if (x0 < 2 || y0 < 2 || x1 >= d.width - 2 || y1 >= d.height - 2) out.push(`${id}: ${l.id} bounds ${[x0, y0, x1, y1]} past the map edge`);
    const p = shrineFind(s, 'P')!;
    const px = x0 + p[0], py = y0 + p[1];
    if (!near(r, px, py)) out.push(`${id}: ${l.id} ritual spot P (${px},${py}) unreachable`);
    // the shrine's own walkable area reached from its entrance
    if (s.arena && !r.has(`${l.x},${l.y}`) && !near(r, l.x, l.y)) out.push(`${id}: ${l.id} arena centre unreachable`);
  }
  for (const [name, x, y] of points(d)) {
    const k = `${x},${y}`;
    if (cells.has(k) && (m.solidAt(x, y) || !near(r, x, y))) out.push(`${id}: ${name} (${x},${y}) under the ${cells.get(k)} shrine (solid ${m.solidAt(x, y)}, reached ${near(r, x, y)})`);
    else if (near(r0, x, y) && !near(r, x, y)) out.push(`${id}: ${name} (${x},${y}) cut off by a shrine`);
  }
  // paths that now run into a wall / water of a shrine
  const cut = [...r0].filter((k) => !r.has(k) && !cells.has(k));
  if (cut.length) out.push(`${id}: ${cut.length} tiles of open ground cut off: ${cut.slice(0, 8).join(' ')}`);
}
console.log(out.length ? out.join('\n') : 'OK');
