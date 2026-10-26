// Generates src/data/world/legend-clues.json: three clues per investigated legendary, placed on reachable open
// ground (BFS from the region's spawn over walkable, dry tiles), away from other objects. Texts are authored here.
// Shrine legends: clues on rings around the shrine (≈ 9, 16, 24 tiles). Roamers: one clue in each of three regions.
// Usage: npx tsx scripts/gen-legend-clues.ts   (deterministic; rerun after map changes)
import { writeFileSync } from 'node:fs';
import legendsJson from '../src/data/world/legends.json';
import { mapOfArea, REGION_DEFS } from '../src/core/map/regionDefs';
import { REGIONS as ENC } from '../src/core/encounters';
import { ValleyMap } from '../src/core/map/valley';
import { T } from '../src/core/map/tiles';

type Leg = { id: string; kind: string; site?: { x: number; y: number; region?: string }; regions?: string[] };
const LEGS = new Map((legendsJson as Leg[]).map((l) => [l.id, l]));

const TEXT: Record<string, [string, string, string]> = {
  lugia: ['Một chiếc lông vũ bạc to bằng cánh tay mắc trên bãi đá, vẫn còn ướt nước biển.', 'Ngư dân khắc trên tảng đá: "Bão về thì đừng ra khơi — có thứ gì to lớn bơi dưới sóng."', 'Vết cào sâu trên vách đá hướng ra biển. Chỉ một sinh vật bay được trong bão mới đậu nổi ở đây.'],
  kyogre: ['Vỏ sò cổ xếp thành hình vòng tròn, mặt trong ánh lên vân xanh như đường gân.', 'Mực nước ở đây từng dâng cao quá đầu người — vạch nước cũ còn hằn trên đá.', 'Trong cơn mưa, biển phía nam sôi lên dù trời lạnh. Kẻ ngủ dưới đáy biển chỉ thức khi trời đổ mưa.'],
  groudon: ['Đá ở đây nứt toác, mép vết nứt bóng như thủy tinh — đã từng tan chảy.', 'Dấu chân khổng lồ in trên lớp tro cứng, mỗi dấu dài bằng ba người nằm.', 'Mặt đất nóng nhất vào lúc trời nắng gắt. Có thứ gì đó dưới núi lửa đang chờ ánh mặt trời.'],
  rayquaza: ['Một mảnh vảy xanh lục rơi từ trên cao, nhẹ như lá nhưng cứng như thép.', 'Gió trên đỉnh vách xoáy thành vòng tròn, như có thứ gì vừa bay ngang qua.', 'Bức khắc cổ: một con rồng dài vô tận tách đôi sóng biển và mặt đất đang tranh nhau.'],
  regice: ['Một khối băng không tan dù đặt dưới nắng, bề mặt khắc những chấm tròn xếp hàng.', 'Các chấm trên đá xếp thành chữ cổ: "Gió tuyết là tiếng gọi."', 'Vòng đá trên đỉnh phủ băng dày nhất vào ngày bão tuyết — như có thứ gì đang thở ra hơi lạnh.'],
  regirock: ['Những tảng đá đỏ xếp thành hình người, ở giữa có bảy chấm khắc sâu.', 'Bia đá cổ: "Kẻ được Thần Rừng công nhận sẽ đánh thức người khổng lồ đá."', 'Đá vụn quanh đây mang dấu vết bị chính đá khác va vỡ — như có ai đó tự vá thân mình.'],
  registeel: ['Một mảnh kim loại đen không gỉ dù nằm sát biển mặn.', 'Ký tự khắc trên vách: "Thép không đến từ mỏ nào — nó được rèn trong lòng đất cổ."', 'Ngoài bờ đá có một vòng tròn từ tính: kim la bàn quay tít khi đến gần.'],
  heatran: ['Một vết bỏng hình bàn chân bám ngược trên trần hang đá.', 'Khí lưu huỳnh phun mạnh nhất vào lúc trời nắng gắt.', 'Đá nóng chảy chảy ngược lên dốc — có thứ gì đó đang bò trên miệng núi lửa.'],
  giratina: ['Cái bóng của cây khô này chỉ về phía mặt trời, ngược với mọi cái bóng khác.', 'Trong đêm, mặt hồ đầm phản chiếu một thế giới lộn ngược.', 'Bùn ở đây nổi bong bóng lạnh băng vào ban đêm, như có cánh cửa mở ra từ bên dưới.'],
  darkrai: ['Người đi qua đầm lầy kể cùng một giấc mơ: một bóng đen với chiếc khăn đỏ.', 'Hoa ở đây khép lại cả ban ngày, như đang ngủ một giấc không yên.', 'Một chiếc lông trăng lưỡi liềm có thể xua cơn ác mộng — nhưng kẻ gây ác mộng chỉ đến khi trời tối.'],
  raikou: ['Thân cây cháy sém thành vệt dài, như bị sét đánh ngang chứ không phải từ trên xuống.', 'Bò trong trang trại hoảng loạn mỗi lần có sấm. Ai đó thấy một bóng vàng chạy nhanh hơn tia chớp.', 'Dấu chân dẫn qua đồng cỏ rồi biến mất giữa chừng. Nó chỉ xuất hiện khi trời có giông hoặc mưa.'],
  entei: ['Tro còn ấm trong một vòng tròn cháy hoàn hảo, giữa không có củi.', 'Người dân kể về một con thú lửa chạy qua thì núi lửa phun.', 'Dấu chân in sâu, cỏ quanh đó khô quắt. Nó lang thang khi trời nắng nóng hoặc quang đãng.'],
  suicune: ['Nước ở vũng này trong vắt dù xung quanh toàn bùn.', 'Gió bắc thổi mạnh, nước trên hồ gợn sóng thành hình dải lụa.', 'Một làn sương mỏng trôi trên mặt nước rồi tan. Nó hay đến khi trời mưa hoặc vừa tạnh.'],
};

const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function reachable(m: ValleyMap, sx: number, sy: number): Set<number> {
  const W = m.widthTiles, seen = new Set<number>([sy * W + sx]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy, k = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= m.heightTiles || seen.has(k)) continue;
      if (m.solidAt(nx, ny) || m.terrainAt(nx, ny) === T.Water) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}

function crowded(region: string, x: number, y: number): boolean {
  const d = REGION_DEFS[region];
  const pts = [...d.npcs, ...d.trainers, ...d.chests, ...d.waypoints, ...d.signs, ...d.props, ...(d.portals ?? []), ...(d.dungeons ?? []), ...(d.field ?? [])];
  if (pts.some((o: { x: number; y: number }) => Math.hypot(o.x - x, o.y - y) < 3)) return true;
  return d.buildings.some((b) => x >= b.x - 2 && x <= b.x + b.w + 1 && y >= b.y - 2 && y <= b.y + b.h + 1);
}

/** First open, reachable tile on a ring around (cx, cy), scanning angles from a start angle. */
function pick(region: string, ok: Set<number>, cx: number, cy: number, r: number, a0: number, taken: { x: number; y: number }[]): { x: number; y: number } {
  const m = maps.get(region)!;
  for (let dr = 0; dr < 12; dr++) for (let k = 0; k < 48; k++) {
    for (const rr of [r + dr, r - dr]) {
      if (rr < 4) continue;
      const a = a0 + (k * Math.PI * 2) / 48;
      const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr);
      if (!ok.has(y * m.widthTiles + x) || crowded(region, x, y)) continue;
      // open on all sides (not wedged against a tree)
      if (dirs.some(([dx, dy]) => m.solidAt(x + dx, y + dy) || m.terrainAt(x + dx, y + dy) === T.Water)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < 6)) continue;
      return { x, y };
    }
  }
  throw new Error(`no clue spot in ${region} around ${cx},${cy}`);
}

const maps = new Map<string, ValleyMap>();
const reach = new Map<string, Set<number>>();
function region(id: string) {
  if (!maps.has(id)) {
    const m = new ValleyMap(REGION_DEFS[id]);
    maps.set(id, m);
    reach.set(id, reachable(m, REGION_DEFS[id].spawn.x, REGION_DEFS[id].spawn.y));
  }
  return reach.get(id)!;
}

const out: { legend: string; clues: { id: string; region: string; x: number; y: number; text: string }[] }[] = [];
for (const [id, texts] of Object.entries(TEXT)) {
  const l = LEGS.get(id)!;
  const clues: { id: string; region: string; x: number; y: number; text: string }[] = [];
  const taken: { x: number; y: number }[] = [];
  for (let i = 0; i < 3; i++) {
    let reg: string, cx: number, cy: number, r: number;
    if (l.kind === 'roaming') {
      // encounter region → its first area → the map holding it; the clue lies near the area's centre
      const enc = ENC.get(l.regions![i % l.regions!.length])!;
      reg = mapOfArea(enc.areas[0])!;
      const [x0, y0, x1, y1] = REGION_DEFS[reg].areas.find((a) => a.id === enc.areas[0])!.rect;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; r = 4;
    } else {
      reg = l.site!.region ?? 'starter-valley';
      cx = l.site!.x; cy = l.site!.y; r = [9, 16, 24][i];
    }
    const ok = region(reg);
    const p = pick(reg, ok, cx, cy, r, (i * 2.1 + id.length) % (Math.PI * 2), l.kind === 'roaming' ? [] : taken);
    taken.push(p);
    clues.push({ id: `${id}-${i + 1}`, region: reg, x: p.x, y: p.y, text: texts[i] });
  }
  out.push({ legend: id, clues });
}
writeFileSync('src/data/world/legend-clues.json', JSON.stringify(out, null, 1) + '\n');
console.log(out.map((o) => `${o.legend}: ${o.clues.map((c) => `${c.region}(${c.x},${c.y})`).join(' ')}`).join('\n'));
