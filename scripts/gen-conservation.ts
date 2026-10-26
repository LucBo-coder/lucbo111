// Generates src/data/vietnam/conservation.json: six restoration sites per province on reachable dry ground right next
// to water (mangrove shore, flooded-field banks, the Hậu river banks), spread apart and away from other objects.
// Usage: npx tsx scripts/gen-conservation.ts   (deterministic; rerun after map changes)
import { writeFileSync } from 'node:fs';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';

const PROVINCES = [
  {
    id: 'ca-mau', name: 'Cà Mau', area: 'cm-mangrove', action: 'plant', unlock: 'vn-cm-3', boss: 'seviper',
    label: 'Trồng cây đước con', done: 'Bạn vùi cây đước con xuống bùn ven nước. Rễ nó sẽ giữ đất cho cả bãi bồi.',
    thrivingReward: { 'miracle-seed': 1, ultraball: 2 },
  },
  {
    id: 'an-giang', name: 'An Giang', area: 'ag-wetland', action: 'net', unlock: 'vn-ag-temple', boss: 'claydol',
    label: 'Gỡ lưới bỏ hoang', done: 'Bạn gỡ tấm lưới mục mắc trong lau sậy. Cá linh mùa nước nổi lại có đường bơi.',
    thrivingReward: { 'mystic-water': 1, netball: 3 },
  },
  {
    id: 'can-tho', name: 'Cần Thơ', area: 'ct-song-hau', action: 'trash', unlock: 'vn-ct-3', boss: 'whiscash',
    label: 'Vớt rác ven sông', done: 'Bạn gom túi ni lông và chai nhựa dạt vào bờ. Nước sông Hậu trong hơn một chút.',
    thrivingReward: { 'water-stone': 1, superpotion: 3 },
  },
];

const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const out: Record<string, unknown> = {
  tiers: [{ at: 0, name: 'Suy thoái' }, { at: 40, name: 'Hồi phục' }, { at: 80, name: 'Trù phú' }],
  perSite: 15, bossBonus: 10,
  provinces: {} as Record<string, unknown>,
};
for (const p of PROVINCES) {
  const d = REGION_DEFS[p.id], m = new ValleyMap(d), W = m.widthTiles;
  const dry = (x: number, y: number) => !m.solidAt(x, y) && m.terrainAt(x, y) !== T.Water;
  const seen = new Set([d.spawn.y * W + d.spawn.x]), q = [[d.spawn.x, d.spawn.y]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= m.heightTiles || seen.has(k) || !dry(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  const [x0, y0, x1, y1] = d.areas.find((a) => a.id === p.area)!.rect;
  const objs = [...d.npcs, ...d.trainers, ...d.chests, ...d.waypoints, ...d.signs, ...d.props, ...(d.portals ?? []), ...(d.docks ?? []), ...(d.field ?? [])] as { x: number; y: number }[];
  const cand: { x: number; y: number }[] = [];
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
    if (!seen.has(y * W + x)) continue;
    if (!dirs.some(([dx, dy]) => m.terrainAt(x + dx, y + dy) === T.Water)) continue; // on the water's edge
    if (objs.some((o) => Math.hypot(o.x - x, o.y - y) < 3)) continue;
    if (d.buildings.some((b) => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h)) continue;
    cand.push({ x, y });
  }
  // spread: farthest-point picking from the candidate nearest the area centre
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sites = [cand.reduce((a, b) => (Math.hypot(a.x - cx, a.y - cy) < Math.hypot(b.x - cx, b.y - cy) ? a : b))];
  while (sites.length < 6) {
    let best = cand[0], bd = -1;
    for (const c of cand) {
      const dmin = Math.min(...sites.map((s) => Math.hypot(s.x - c.x, s.y - c.y)));
      // stay within reasonable walking distance of the centre
      const score = Math.min(dmin, 14) - Math.hypot(c.x - cx, c.y - cy) * 0.05;
      if (dmin >= 6 && score > bd) { bd = score; best = c; }
    }
    if (bd < 0) throw new Error(`not enough sites in ${p.id}`);
    sites.push(best);
  }
  (out.provinces as Record<string, unknown>)[p.id] = { ...p, sites: sites.map((s, i) => ({ id: `${p.id}-${i + 1}`, x: s.x, y: s.y })) };
  console.log(p.id, sites.map((s) => `(${s.x},${s.y})`).join(' '));
}
writeFileSync('src/data/vietnam/conservation.json', JSON.stringify(out, null, 1) + '\n');
