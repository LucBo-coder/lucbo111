// V21: Rừng Ngọc Lục Bảo — the deep forest beyond Rìa Rừng Ngọc, as its own map (region JSON + its links).
// The valley keeps its forest edge (area `forest`, logical region `emerald-forest`: quests, roaming legends and
// markers stay where they are); the new map opens with the same story flag `region:emerald-forest`.
// Idempotent: re-running rewrites the map and replaces the same ids elsewhere.
import fs from 'node:fs';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\n');
const upsert = (arr, item, key = 'id') => {
  const i = arr.findIndex((x) => x[key] === item[key]);
  if (i >= 0) arr[i] = item; else arr.push(item);
};

const ID = 'emerald-woods';
const map = {
  id: ID,
  name: 'Rừng Ngọc Lục Bảo',
  width: 96,
  height: 84,
  chunk: 16,
  spawn: { x: 48, y: 75 },
  // first match wins (areaAt): south trail, then the two halves of the deep forest
  areas: [
    { id: 'emerald-trail', name: 'Đường Mòn Ngọc', rect: [0, 54, 95, 83], habitat: 'forest', level: [12, 16] },
    { id: 'emerald-heart', name: 'Lõi Rừng Ngọc', rect: [0, 0, 55, 53], habitat: 'forest', level: [15, 19] },
    { id: 'emerald-falls', name: 'Suối Lục Bảo', rect: [56, 0, 95, 53], habitat: 'lake', level: [14, 18] },
  ],
  paths: [
    { w: 2, pts: [[48, 79], [48, 62], [36, 48], [28, 32], [22, 18]] },
    { w: 2, pts: [[48, 62], [60, 56], [68, 44], [70, 32]] },
    { w: 2, pts: [[28, 32], [40, 24], [46, 12]] },
    { w: 2, pts: [[48, 70], [58, 70]] },
    // across the stream (a bridge) to the east bank
    { w: 2, pts: [[68, 44], [86, 44], [90, 36]] },
  ],
  plaza: [43, 72, 53, 79],
  lake: { cx: 78, cy: 18, rx: 8, ry: 6 },
  rivers: [{ w: 2, pts: [[78, 25], [74, 38], [76, 50], [70, 62], [72, 82]] }],
  buildings: [{ id: 'ranger-hut', name: 'Chòi Kiểm Lâm', x: 56, y: 64, w: 5, h: 4, roof: 'red', wall: 'wood', door: 2 }],
  fences: [],
  props: [
    { kind: 'log', x: 40, y: 66 }, { kind: 'log', x: 30, y: 44 }, { kind: 'beehive', x: 20, y: 30 },
    { kind: 'bucket', x: 62, y: 69 }, { kind: 'log', x: 66, y: 30 },
  ],
  signs: [
    { x: 45, y: 74, text: ['RỪNG NGỌC LỤC BẢO', 'Khuyến nghị Lv14 · Rừng sâu nhiều Pokémon hệ Cỏ / Bọ — mang chiêu hệ Lửa / Bay.', '↖ Lõi Rừng · ↗ Suối Lục Bảo'] },
    { x: 34, y: 50, text: ['↑ Lõi Rừng Ngọc · Cây cổ thụ', '→ Suối Lục Bảo (câu cá)'] },
  ],
  npcs: [
    { id: 'ef-ranger', name: 'Kiểm lâm Hùng', sprite: 'ranger', x: 58, y: 71,
      lines: ['Rừng sâu dễ lạc lắm. Đi theo đường mòn là an toàn nhất.', 'Bên suối có chỗ câu cá, cá ở đây to hơn ngoài Hồ Pha Lê nhiều.'] },
    { id: 'ef-botanist', name: 'Cô Thảo (nhà thực vật)', sprite: 'girl', x: 30, y: 40, wander: 2,
      lines: ['Bụi quả trong rừng sâu ra quả quý hơn ngoài đồng cỏ.', 'Cẩn thận Paras: chúng hay trốn trong bụi đấy!'] },
  ],
  trainers: [
    { id: 'ef-bugcatcher', name: 'Bắt Bọ Khoa', sprite: 'youngster', x: 38, y: 58,
      team: [['beedrill', 15], ['butterfree', 15], ['scyther', 17]],
      challenge: ['Rừng này là thiên đường của Pokémon Bọ! Thử sức với đội của tớ nào!'],
      win: ['Ơ... cánh của Scyther cũng không đủ nhanh sao?'], lose: ['Bọ là nhất! Luyện thêm rồi quay lại nhé.'],
      rewards: { items: { 'silver-powder': 1, greatball: 2 }, exp: 520 } },
    { id: 'ef-hiker', name: 'Phượt thủ Dũng', sprite: 'viking', x: 22, y: 22,
      team: [['exeggcute', 17], ['tangela', 18], ['parasect', 18]],
      challenge: ['Ta đi khắp rừng này rồi. Muốn qua Lõi Rừng thì thắng ta đã!'],
      win: ['Giỏi lắm, đường vào cây cổ thụ là của cậu.'], lose: ['Rừng sâu không dành cho người yếu bóng vía.'],
      rewards: { items: { 'miracle-seed': 1, superpotion: 2 }, exp: 640 } },
    { id: 'ef-fisher', name: 'Ngư dân Lộc', sprite: 'farmer', x: 70, y: 28,
      team: [['poliwhirl', 17], ['psyduck', 17], ['golduck', 19]],
      challenge: ['Đừng làm cá sợ chạy mất! ... Thôi được, đấu một trận rồi đi.'],
      win: ['Cậu câu cá chắc cũng giỏi như đánh trận.'], lose: ['Kiên nhẫn như câu cá ấy, cậu còn thiếu.'],
      rewards: { items: { 'mystic-water': 1, netball: 3 }, exp: 660 } },
  ],
  rescue: { id: 'none', x: -99, y: -99, species: 'pidgey', level: 1, guards: [] },
  chests: [
    { id: 'chest-emerald-heart', x: 12, y: 12, items: { ultraball: 2, 'leaf-stone': 1 } },
    { id: 'chest-emerald-falls', x: 90, y: 34, items: { superpotion: 2, 'exp-candy-m': 1 } },
    { id: 'chest-emerald-trail', x: 86, y: 74, items: { greatball: 4, 'sitrus-berry': 2 } },
  ],
  waypoints: [
    { id: 'wp-emerald-camp', name: 'Trạm Đường Mòn', x: 51, y: 76 },
    { id: 'wp-emerald-heart', name: 'Trạm Lõi Rừng', x: 26, y: 30 },
  ],
  puzzles: [],
  dungeons: [],
  pillars: [],
  spawns: {},
  legendaries: [],
  portals: [{ id: 'portal-emerald-valley', name: 'Về Rìa Rừng Ngọc', x: 48, y: 79, to: 'starter-valley', toX: 64, toY: 14 }],
  nodes: [
    { id: 'ef-bush-1', table: 'forest-forage', x: 16, y: 44 },
    { id: 'ef-bush-2', table: 'forest-forage', x: 42, y: 34 },
    { id: 'ef-bush-3', table: 'forest-forage', x: 24, y: 64 },
    { id: 'ef-bush-4', table: 'forest-forage', x: 40, y: 8 },
    { id: 'ef-fish-1', table: 'falls-fish', x: 69, y: 18 },
    { id: 'ef-fish-2', table: 'falls-fish', x: 87, y: 18 },
    { id: 'ef-fish-3', table: 'falls-fish', x: 78, y: 11 },
  ],
};
write(`src/data/world/${ID}.json`, map);

// logical region (encounter levels, events, map labels) — opened by the same flag as before
const regions = read('src/data/world/regions.json');
upsert(regions, { id: ID, name: 'Rừng Ngọc Lục Bảo', areas: ['emerald-trail', 'emerald-heart', 'emerald-falls'], biome: 'forest',
  level: [12, 19], elite: [21, 24], boss: null, recommended: 15, danger: 2, unlock: 'region:emerald-forest' });
write('src/data/world/regions.json', regions);

// the gate in the valley: north end of the forest-edge trail
const valley = read('src/data/world/starter-valley.json');
upsert(valley.portals, { id: 'portal-emerald', name: 'Cổng Rừng Ngọc Lục Bảo', x: 64, y: 12, to: ID, toX: 48, toY: 76,
  requires: ['region:emerald-forest'], hint: 'Cành cây đan kín lối vào rừng sâu... Hãy giải quyết bí ẩn Hang Đá Cổ trước. Khuyến nghị Lv14+.' });
if (!valley.paths.some((p) => p.pts.length === 2 && p.pts[0].join() === '60,17' && p.pts[1].join() === '64,13')) valley.paths.push({ w: 2, pts: [[60, 17], [64, 13]] });
write('src/data/world/starter-valley.json', valley);

// gathering tables of the deep forest
const tables = read('src/data/world/gathering.json');
tables['forest-forage'] = {
  kind: 'forage', name: 'Bụi quả rừng', cooldown: 300, pokemonChance: 0.18,
  pokemon: [{ species: 'paras', level: [12, 15], weight: 5 }, { species: 'venonat', level: [12, 15], weight: 4 }, { species: 'bellsprout', level: [12, 15], weight: 3 }, { species: 'pinsir', level: [15, 17], weight: 1 }],
  items: [
    { id: 'sitrus-berry', qty: [1, 2], weight: 30 }, { id: 'oranberry', qty: [2, 3], weight: 20 }, { id: 'superpotion', qty: [1, 1], weight: 12 },
    { id: 'exp-candy-s', qty: [1, 2], weight: 12 }, { id: 'greatball', qty: [1, 2], weight: 10 }, { id: 'leaf-stone', qty: [1, 1], weight: 3 },
    { id: 'miracle-seed', qty: [1, 1], weight: 2 },
  ],
};
tables['falls-fish'] = {
  kind: 'fish', name: 'Chỗ câu cá', cooldown: 75, requiresFlag: 'tool:rod', pokemonChance: 0.5,
  pokemon: [
    { species: 'magikarp', level: [12, 15], weight: 30 }, { species: 'goldeen', level: [13, 16], weight: 25 }, { species: 'poliwhirl', level: [15, 17], weight: 12 },
    { species: 'seaking', level: [16, 18], weight: 8 }, { species: 'golduck', level: [16, 18], weight: 5 }, { species: 'feebas', level: [14, 16], weight: 3 },
  ],
  items: [
    { id: 'netball', qty: [1, 2], weight: 25 }, { id: 'sitrus-berry', qty: [1, 1], weight: 20 }, { id: 'superpotion', qty: [1, 1], weight: 15 },
    { id: 'water-stone', qty: [1, 1], weight: 4 }, { id: 'mystic-water', qty: [1, 1], weight: 3 }, { id: 'prism-scale', qty: [1, 1], weight: 3 },
  ],
};
write('src/data/world/gathering.json', tables);

// quest: the ranger's patrol
const quests = read('src/data/world/quests.json');
upsert(quests, { id: 'q-emerald-1', kind: 'exploration', title: 'Tuần tra Rừng Ngọc Lục Bảo', giver: 'ef-ranger', requires: ['q-main-3'],
  description: 'Kiểm lâm Hùng nhờ bạn đi một vòng rừng sâu và dẹp những kẻ làm ồn.',
  objectives: [
    { type: 'explore', target: 'emerald-heart', count: 1, text: 'Đến Lõi Rừng Ngọc', marker: { x: 28, y: 32 } },
    { type: 'explore', target: 'emerald-falls', count: 1, text: 'Đến Suối Lục Bảo', marker: { x: 70, y: 32 } },
    { type: 'trainer', target: 'ef-hiker', count: 1, text: 'Đánh bại Phượt thủ Dũng', marker: { x: 22, y: 22 } },
    { type: 'talk', target: 'ef-ranger', count: 1, text: 'Báo cáo với Kiểm lâm Hùng', marker: { x: 58, y: 71 } },
  ],
  rewards: { items: { ultraball: 2, 'exp-candy-m': 2 }, worldExp: 400, reputation: 15 },
  dialogue: { offer: ['Từ khi Hang Đá Cổ yên ắng trở lại, Pokémon kéo về rừng sâu rất đông.', 'Cháu đi một vòng Lõi Rừng và Suối Lục Bảo giúp chú nhé. Có anh Dũng hay chặn đường ở lõi rừng đấy.'],
    progress: ['Theo đường mòn: rẽ trái lên Lõi Rừng, rẽ phải sang Suối Lục Bảo.'],
    complete: ['Cảm ơn cháu! Rừng yên rồi. Mấy quả Ultra Ball này để cháu bắt Pokémon quý trong rừng.'] } });
write('src/data/world/quests.json', quests);
console.log('emerald woods built:', map.width + '×' + map.height, map.nodes.length, 'nodes,', map.trainers.length, 'trainers');
