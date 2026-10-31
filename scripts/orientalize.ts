// V28 — old oriental town centres for the Vietnam Odyssey provinces.
//   npx tsx scripts/orientalize.ts [province ...]   (no args: every province in data/vietnam/provinces.json)
// For each province map: every building becomes style 'oriental' (curved tiled roofs, red columns, lanterns —
// core/map/oriental.ts), a cổng tam quan spans the path where it enters the town square, and street furniture
// (lantern posts at the square's corners and beside the gate, bonsai pots by the Pokémon Center / mart / houses,
// stone lanterns by the temples) is placed only on open ground clear of every other object, door and path.
// The square is paved with red Bát Tràng brick (`paved` + `town: 'oriental'`), and rows of old shophouses (nhà phố)
// go up where there is room beside it and along the town's streets, each door opening onto a street.
// Idempotent: earlier oriental props, shophouses and the gate are removed before placing again.
import { readFileSync, writeFileSync } from 'node:fs';
import { chunkCols, chunkRows } from '../src/core/map/mapProvider';
import { orientalKindOf } from '../src/core/map/oriental';
import { T } from '../src/core/map/tiles';
import { ValleyMap, type RegionDef } from '../src/core/map/valley';

const VN = 'src/data/vietnam/';
const PROPS = new Set(['lantern', 'stone-lantern', 'bonsai', 'incense']);
type Building = RegionDef['buildings'][number];

/** Replace the JSON array `"<key>": [...]` in the file text, one entry per line (the rest of the file keeps its format). */
function replaceArray(text: string, key: string, items: unknown[]): string {
  const at = text.indexOf(`"${key}": [`);
  if (at < 0) throw new Error(`no "${key}" array`);
  let i = text.indexOf('[', at), depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) break;
  }
  const start = text.indexOf('[', at);
  const body = items.length ? '[\n' + items.map((o) => '  ' + JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "')).join(',\n') + '\n ]' : '[]';
  return text.slice(0, start) + body + text.slice(i + 1);
}

function run(id: string): string {
  const file = VN + id + '.json';
  let text = readFileSync(file, 'utf8');
  const d = JSON.parse(text) as RegionDef & { id: string };
  const prefix = d.waypoints[0]?.id.replace(/^wp-/, '').replace(/-center$/, '') ?? id;
  const city = d.areas.find((a) => a.habitat === 'village')?.name ?? d.name;

  // 1) buildings: oriental style (the gate is placed again below)
  d.paved = [d.plaza];
  d.town = 'oriental';
  const buildings: Building[] = d.buildings.filter((b) => orientalKindOf(b.id, b.name) !== 'gate' && !/-pho-\d+$/.test(b.id)).map((b) => {
    const { color: _c, ...rest } = b as Building & { color?: string };
    return { ...rest, style: 'oriental' as const };
  });
  const props = d.props.filter((p) => !PROPS.has(p.kind));
  const def = (): RegionDef => ({ ...d, buildings, props });

  // everything the new pieces must keep clear of (tiles)
  const taken: [number, number][] = [
    ...d.npcs, ...d.trainers, ...d.chests, ...d.waypoints, ...d.signs, ...(d.portals ?? []), ...(d.nodes ?? []), ...(d.field ?? []),
    ...(d.docks ?? []), ...d.dungeons, ...props,
  ].map((o) => [o.x, o.y] as [number, number]);
  if (d.rescue.x >= 0) taken.push([d.rescue.x, d.rescue.y]);
  const doors = (bs: Building[]) => bs.filter((b) => orientalKindOf(b.id, b.name) !== 'gate').map((b) => [b.x + b.door, b.y + b.h] as [number, number]);
  const far = (x: number, y: number, list: [number, number][], r: number) => list.every(([a, b]) => Math.hypot(a - x, b - y) >= r);
  const inBuilding = (x: number, y: number, bs: Building[], pad = 0) => bs.some((b) => x >= b.x - pad && x < b.x + b.w + pad && y >= b.y - pad && y < b.y + b.h + pad);
  const arenas = [...(d.worldBoss ? [{ x: d.worldBoss.x, y: d.worldBoss.y, r: 10 }] : []), ...(d.legendaries ?? []).map((l) => ({ x: l.x, y: l.y, r: 9 }))];

  // 2) the gate: across the path where it enters the town square (south side first, nearest the spawn)
  const [x0, y0, x1, y1] = d.plaza;
  let gate: Building | null = null;
  {
    const m = new ValleyMap(def());
    const tryRow = (gy: number): Building | null => {
      const runs: [number, number][] = [];
      for (let x = x0 - 2; x <= x1 + 2; x++) {
        if (m.terrainAt(x, gy) !== T.Path && m.terrainAt(x, gy) !== T.Bridge) continue;
        const r = runs[runs.length - 1];
        if (r && r[1] === x - 1) r[1] = x; else runs.push([x, x]);
      }
      runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - d.spawn.x) - Math.abs((b[0] + b[1]) / 2 - d.spawn.x));
      for (const [a, b] of runs) {
        const len = b - a + 1;
        if (len < 2 || len > 5) continue;
        const g: Building = { id: `${prefix}-gate`, name: `Cổng tam quan ${city}`, x: a - 1, y: gy, w: len + 2, h: 1, roof: 'red', wall: 'stone', door: Math.floor((len + 2) / 2), style: 'oriental' };
        const pillars: [number, number][] = [[g.x, gy], [g.x + g.w - 1, gy]];
        const ok = pillars.every(([px, py]) => !m.solidAt(px, py) && [T.Path, T.Bridge, T.Water, T.Plaza].every((t) => m.terrainAt(px, py) !== t))
          && !buildings.some((o) => o.x < g.x + g.w + 1 && o.x + o.w > g.x - 1 && o.y < gy + 2 && o.y + o.h > gy - 4)
          && Array.from({ length: g.w }, (_, i) => g.x + i).every((x) => far(x, gy, taken, 2) && far(x, gy, doors(buildings), 2));
        if (ok) return g;
      }
      return null;
    };
    gate = tryRow(y1 + 3) ?? tryRow(y1 + 4) ?? tryRow(y0 - 3) ?? tryRow(y0 - 4);
    if (gate) buildings.push(gate);
  }

  // 3) shophouses along the square and the streets: footprint and a ring around it on open ground (no path, square,
  // water or object), the door's front tile on a street, the roof clear of the building behind it
  const SHOPS = ['Hiệu thuốc bắc', 'Tiệm trà', 'Hiệu may áo dài', 'Tiệm bánh', 'Hiệu sách cũ', 'Tiệm gốm', 'Tiệm đèn lồng', 'Hiệu vàng bạc', 'Quán chè', 'Nhà phố cổ'];
  const shops: Building[] = [];
  {
    const mm = new ValleyMap(def());
    const area = d.areas.find((a) => a.habitat === 'village');
    const [ax0, ay0, ax1, ay1] = area ? area.rect : [x0 - 12, y0 - 12, x1 + 12, y1 + 12];
    const street = (x: number, y: number) => [T.Path, T.Plaza, T.Bridge].includes(mm.terrainAt(x, y) as never);
    const cands: { x: number; y: number; w: number; dist: number }[] = [];
    for (let y = Math.max(5, ay0 + 1); y + 3 <= Math.min(d.height - 6, ay1); y++) for (let x = Math.max(5, ax0 + 1); x <= Math.min(d.width - 6, ax1 - 1); x++) {
      for (const w of [4, 3]) {
        if (x + w > ax1) continue;
        if (!street(x + 1, y + 3) && !street(x + 1, y + 4)) continue;
        cands.push({ x, y, w, dist: Math.hypot(x + w / 2 - (x0 + x1) / 2, y + 1.5 - (y0 + y1) / 2) });
      }
    }
    cands.sort((a, b) => a.dist - b.dist);
    const fits = (c: { x: number; y: number; w: number }) => {
      for (let y = c.y - 1; y <= c.y + 3; y++) for (let x = c.x - 1; x <= c.x + c.w; x++) {
        const t = mm.terrainAt(x, y);
        if (y === c.y + 3) { if (mm.solidAt(x, y)) return false; continue; }
        if (mm.solidAt(x, y) || [T.Path, T.Plaza, T.Bridge, T.Water, T.Farm].includes(t as never)) return false;
      }
      const all = [...buildings, ...shops];
      if (all.some((o) => o.x < c.x + c.w + 1 && o.x + o.w > c.x - 1 && o.y < c.y + 4 && o.y + o.h > c.y - 3)) return false;
      if (![...taken, ...doors(all)].every(([ox, oy]) => ox < c.x - 2 || ox > c.x + c.w + 1 || oy < c.y - 2 || oy > c.y + 4)) return false;
      if (arenas.some((a) => Math.hypot(a.x - (c.x + c.w / 2), a.y - (c.y + 1.5)) < a.r + 3)) return false;
      return true;
    };
    for (const c of cands) {
      if (shops.length >= 10) break;
      if (!fits(c)) continue;
      const i = shops.length;
      shops.push({ id: `${prefix}-pho-${i + 1}`, name: SHOPS[i % SHOPS.length], x: c.x, y: c.y, w: c.w, h: 3, roof: i % 3 === 1 ? 'grey' : 'red', wall: 'wood', door: 1, style: 'oriental' });
    }
    buildings.push(...shops);
  }

  // 4) street furniture
  const m = new ValleyMap(def());
  const trees: [number, number][] = [];
  for (let cy = 0; cy < chunkRows(m); cy++) for (let cx = 0; cx < chunkCols(m); cx++) {
    for (const o of m.objectsInChunk(cx, cy)) if (o.kind === 'tree' || o.kind === 'boulder') trees.push([Math.floor(o.x), Math.floor(o.y)]);
  }
  const added: { kind: string; x: number; y: number }[] = [];
  const place = (kind: string, x: number, y: number, plazaOk = false): boolean => {
    if (x < 4 || y < 4 || x >= d.width - 4 || y >= d.height - 4) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dy * dy <= 1 && m.solidAt(x + dx, y + dy)) return false;
    const t = m.terrainAt(x, y);
    if (t === T.Path || t === T.Bridge || t === T.Water || (t === T.Plaza && !plazaOk)) return false;
    if (inBuilding(x, y, buildings, 0) || (gate && y === gate.y && x >= gate.x - 1 && x <= gate.x + gate.w)) return false;
    // keep the gate's passage and every door's approach clear
    if (gate && x > gate.x && x < gate.x + gate.w - 1 && Math.abs(y - gate.y) <= 2) return false;
    if (!far(x, y, taken, 1.9) || !far(x, y, added.map((p) => [p.x, p.y]), 1.9) || !far(x, y, doors(buildings), 1.9) || !far(x, y, trees, 1.5)) return false;
    if (arenas.some((a) => Math.hypot(a.x - x, a.y - y) < a.r)) return false;
    // never in a doorway column right in front of a door
    if (buildings.some((b) => orientalKindOf(b.id, b.name) !== 'gate' && x === b.x + b.door && y > b.y + b.h - 1 && y <= b.y + b.h + 2)) return false;
    added.push({ kind, x, y });
    return true;
  };
  // lantern posts at the square's corners (just inside it) and beside the gate
  for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) place('lantern', x, y, true);
  if (gate) { place('lantern', gate.x - 1, gate.y + 1) || place('lantern', gate.x - 1, gate.y + 2); place('lantern', gate.x + gate.w, gate.y + 1) || place('lantern', gate.x + gate.w, gate.y + 2); }
  for (const b of buildings) {
    const kind = orientalKindOf(b.id, b.name);
    if (kind === 'gate') continue;
    const dx = b.x + b.door, fy = b.y + b.h + 1;
    if (kind === 'temple') { place('stone-lantern', dx - 3, fy); place('stone-lantern', dx + 3, fy); place('incense', dx - 2, fy + 2) || place('incense', dx + 2, fy + 2); }
    else if (kind === 'center' || kind === 'mart') { place('bonsai', dx - 2, fy); place('bonsai', dx + 2, fy); }
    else if ((b.x + b.y) % 2 === 0) place('bonsai', dx + 2, fy) || place('bonsai', dx - 2, fy);
  }

  text = text.replace(/\n\s*"paved": \[[^\n]*\],?/, '').replace(/\n\s*"town": "oriental",?/, '');
  text = text.replace(/("plaza": \[[^\]]*\],)/, `$1\n "paved": [${JSON.stringify(d.plaza).replace(/,/g, ', ')}],\n "town": "oriental",`);
  text = replaceArray(text, 'buildings', buildings);
  text = replaceArray(text, 'props', [...props, ...added]);
  writeFileSync(file, text);
  return `${id}: ${buildings.length} buildings (${shops.length} shophouses)${gate ? ` + gate (${gate.x},${gate.y}) w${gate.w}` : ' (no gate)'}, ${added.length} props`;
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : (JSON.parse(readFileSync(VN + 'provinces.json', 'utf8')) as { id: string }[]).map((p) => p.id);
for (const id of ids) console.log(run(id));
