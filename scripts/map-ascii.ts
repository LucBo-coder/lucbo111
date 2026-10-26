// Prints an ASCII view of a region map (for placing authored objects by hand).
// Usage: npx tsx scripts/map-ascii.ts <region> [x0 y0 x1 y1]
//   . open ground   , path   # solid (tree, rock, wall, water edge)   ~ water   B building
//   N npc  T trainer  C chest  W waypoint  S sign  P portal  o prop
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';

const [id = 'starter-valley', ...r] = process.argv.slice(2);
const d = REGION_DEFS[id];
if (!d) throw new Error(`unknown region ${id}`);
const m = new ValleyMap(d);
const [x0, y0, x1, y1] = r.length === 4 ? r.map(Number) : [0, 0, d.width - 1, d.height - 1];

const marks = new Map<string, string>();
const put = (x: number, y: number, c: string) => marks.set(`${x},${y}`, c);
for (const b of d.buildings) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) put(x, y, 'B');
d.npcs.forEach((o) => put(o.x, o.y, 'N'));
d.trainers.forEach((o) => put(o.x, o.y, 'T'));
d.chests.forEach((o) => put(o.x, o.y, 'C'));
d.waypoints.forEach((o) => put(o.x, o.y, 'W'));
d.signs.forEach((o) => put(o.x, o.y, 'S'));
d.props.forEach((o) => put(o.x, o.y, 'o'));
(d.portals ?? []).forEach((o) => put(o.x, o.y, 'P'));

const isPath = (x: number, y: number) => d.paths.some((p) => p.pts.some((_, i) => {
  if (i === p.pts.length - 1) return false;
  const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy)) <= p.w / 2;
}));

let head = '    ';
for (let x = x0; x <= x1; x++) head += x % 10 === 0 ? String((x / 10) % 10) : ' ';
console.log(head);
for (let y = y0; y <= y1; y++) {
  let line = String(y).padStart(3) + ' ';
  for (let x = x0; x <= x1; x++) {
    const mk = marks.get(`${x},${y}`);
    if (mk) { line += mk; continue; }
    const c = m.colorAt(x, y);
    const blue = (c & 255) > ((c >> 8) & 255) && (c & 255) > ((c >> 16) & 255) + 40;
    line += m.solidAt(x, y) ? (blue ? '~' : '#') : isPath(x, y) ? ',' : '.';
  }
  console.log(line);
}
