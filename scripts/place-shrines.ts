// Dev tool (npx tsx scripts/place-shrines.ts [legend…]): finds, for each shrine site, the nearest anchor to its designed
// spot (shrines.json x, y) in the same area where the stamp covers no authored thing, overlaps no other shrine, its
// ritual spot can be walked to from the map spawn and nothing authored is cut off. Prints the moves as JSON for
// scripts/patch-shrine-sites.py.
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap, type RegionDef, type LegendSite } from '../src/core/map/valley';
import { nookRing } from '../src/core/field';
import { SHRINES, shrineBounds, shrineCells, shrineFind, type ShrineDef } from '../src/core/shrines';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const only = new Set(process.argv.slice(2));

function reach(m: ValleyMap): Set<string> {
  const b = new Set<string>();
  for (const f of m.def.field ?? []) b.add(`${f.x},${f.y}`);
  for (let cy = 0; cy < Math.ceil(m.heightTiles / m.chunk); cy++) for (let cx = 0; cx < Math.ceil(m.widthTiles / m.chunk); cx++)
    for (const o of m.objectsInChunk(cx, cy)) if (o.collideR || o.kind === 'tree' || o.kind === 'boulder') b.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  const sp = m.def.spawn, seen = new Set([`${sp.x},${sp.y}`]), q = [[sp.x, sp.y]];
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

function points(d: RegionDef): [string, number, number, number][] {
  const p: [string, number, number, number][] = [];
  const add = (n: string, x: number, y: number, r = 1) => p.push([n, x, y, r]);
  d.npcs.forEach((o) => add(o.id, o.x, o.y)); d.trainers.forEach((o) => add(o.id, o.x, o.y, 2)); d.chests.forEach((o) => add(o.id, o.x, o.y));
  d.waypoints.forEach((o) => add(o.id, o.x, o.y, 2)); d.signs.forEach((o, i) => add(`sign#${i}`, o.x, o.y)); d.props.forEach((o, i) => add(`prop#${i}`, o.x, o.y));
  (d.portals ?? []).forEach((o) => add(o.id, o.x, o.y, 2)); d.dungeons.forEach((o) => add(o.id, o.x, o.y, 2)); (d.nodes ?? []).forEach((o) => add(o.id, o.x, o.y));
  (d.field ?? []).forEach((o) => { add(o.id, o.x, o.y, 2); for (const q of nookRing(o)) add(o.id + ':wall', Math.floor(q.x), Math.floor(q.y), 1); }); d.pillars.forEach(([x, y]) => add('pillar', x, y));
  (d.docks ?? []).forEach((o) => add('dock', o.x, o.y, 2));
  for (const b of d.buildings) for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) add(b.id, x, y, 0);
  if (d.worldBoss) add('worldBoss', d.worldBoss.x, d.worldBoss.y, 10);
  if (d.rescue.x >= 0) add('rescue', d.rescue.x, d.rescue.y, 5);
  for (const pz of d.puzzles) pz.plates.forEach(([x, y]) => add(pz.id, x, y));
  for (const l of d.legendaries ?? []) if (!l.shrine) add(`ring:${l.id}`, l.x, l.y, 9);
  return p;
}

const moves: Record<string, [string, number, number, string]> = {};
const log: string[] = [];
for (const [id, d0] of Object.entries(REGION_DEFS)) {
  const all = (d0.legendaries ?? []).filter((l) => l.shrine);
  if (!all.length) continue;
  const placed: LegendSite[] = [];
  // fixed shrines (not being placed) first, then the others by tier
  const order = [...all].sort((a, b) => Number(only.size > 0 && only.has(a.id)) - Number(only.size > 0 && only.has(b.id)) || SHRINES.get(a.shrine!)!.tier - SHRINES.get(b.shrine!)!.tier);
  const pts = points(d0);
  for (const l of order) {
    const s = SHRINES.get(l.shrine!)!;
    if (only.size && !only.has(l.id)) { placed.push(l); continue; }
    const base = new ValleyMap({ ...d0, legendaries: [...(d0.legendaries ?? []).filter((x) => !x.shrine), ...placed] });
    const area = base.areaAt(s.x, s.y)?.id ?? '';
    const r0 = reach(base);
    const taken = new Set<string>();
    for (const p of placed) for (const c of shrineCells(SHRINES.get(p.shrine!)!, p.x, p.y)) taken.add(`${c.tx},${c.ty}`);
    const cands: [number, number, number][] = [];
    const R = +(process.env.R ?? 30);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) cands.push([s.x + dx, s.y + dy, Math.hypot(dx, dy)]);
    cands.sort((a, b) => a[2] - b[2]);
    if (process.env.AT) { const [ax, ay] = process.env.AT.split(',').map(Number); cands.length = 0; cands.push([ax, ay, 0]); }
    let found: [number, number] | null = null, tried = 0, curPass = 0;
    const why: Record<string, number> = {};
    const no = (k: string) => { why[k] = (why[k] ?? 0) + 1; };
    // the designed area first, then anywhere close
    const ordered = [...cands.map((c) => [...c, 0] as const), ...cands.map((c) => [...c, 1] as const)];
    for (const [x, y, , pass] of ordered) {
      if (pass !== curPass) { curPass = pass; tried = 0; }
      const c = cheap(d0, base, s, x, y, pass ? undefined : area, taken, pts);
      if (c) { no(c); continue; }
      if (++tried > 90) continue;
      const site = { ...l, x, y };
      const m = new ValleyMap({ ...d0, legendaries: [...(d0.legendaries ?? []).filter((q) => !q.shrine), ...placed, site] });
      const r = reach(m);
      const [x0, y0] = shrineBounds(s, x, y), p = shrineFind(s, 'P')!;
      if (!near(r, x0 + p[0], y0 + p[1])) { no('P'); continue; }
      if (s.arena && !near(r, x, y)) { no('arena'); continue; }
      const cells = new Set([...shrineCells(s, x, y)].map((c) => `${c.tx},${c.ty}`));
      if (pts.some(([, px, py]) => near(r0, px, py) && !near(r, px, py))) { no('cutoff-point'); continue; }
      let cut = 0;
      for (const k of r0) if (!r.has(k) && !cells.has(k)) cut++;
      if (cut > 12) { no('cut' + cut); continue; }
      found = [x, y];
      break;
    }
    if (!found) { log.push(`${id} ${l.id}: no spot (tried ${tried}) ${JSON.stringify(why)}`); placed.push(l); continue; }
    placed.push({ ...l, x: found[0], y: found[1] });
    moves[l.id] = [id, found[0], found[1], s.id];
    log.push(`${id} ${l.id}: (${s.x},${s.y}) → (${found[0]},${found[1]})`);
  }
}
console.error(log.join('\n'));
console.log(JSON.stringify(moves));

function cheap(d: RegionDef, m: ValleyMap, s: ShrineDef, x: number, y: number, area: string | undefined, taken: Set<string>, pts: [string, number, number, number][]): string {
  const [x0, y0, x1, y1] = shrineBounds(s, x, y);
  if (x0 < 2 || y0 < 2 || x1 >= d.width - 2 || y1 >= d.height - 2) return 'bounds';
  if (area !== undefined && m.areaAt(x, y)?.id !== area) return 'area';
  for (const [name, px, py, r] of pts) {
    if (px < x0 - r || px > x1 + r || py < y0 - r || py > y1 + r) continue;
    for (const c of shrineCells(s, x, y)) {
      if (Math.abs(c.tx - px) <= r && Math.abs(c.ty - py) <= r) {
        // the outer ground (natural, open) may hold NPCs, signs, chests…; never a building, a ring or an arena
        if (c.ch === ',' && r > 0 && r <= 2 && !name.endsWith(':wall')) continue;
        return name;
      }
    }
  }
  for (const c of shrineCells(s, x, y)) if (taken.has(`${c.tx},${c.ty}`) || N4.some(([dx, dy]) => taken.has(`${c.tx + dx},${c.ty + dy}`))) return 'shrine';
  return '';
}
