// One-off content patch (V21): fishing at Hồ Pha Lê + berry bushes on Đồng Cỏ Gió (resource nodes) and their quests.
// Idempotent: re-running replaces the same ids instead of duplicating them.
import fs from 'node:fs';

const MAP = 'src/data/world/starter-valley.json';
const QUESTS = 'src/data/world/quests.json';
const v = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const quests = JSON.parse(fs.readFileSync(QUESTS, 'utf8'));

const upsert = (arr, item, key = 'id') => {
  const i = arr.findIndex((x) => x[key] === item[key]);
  if (i >= 0) arr[i] = item; else arr.push(item);
};
const near = (arr, x, y) => arr.some((o) => o.x === x && o.y === y);

// ── Hồ Pha Lê: four fishing spots on the shore (the bobber lands on the water toward the lake centre) ──
v.nodes ??= [];
for (const [id, x, y] of [['fish-west', 112, 70], ['fish-south', 127, 82], ['fish-east', 143, 70], ['fish-north', 127, 58]]) {
  upsert(v.nodes, { id, table: 'lake-fish', x, y });
}
// ── Đồng Cỏ Gió: berry bushes spread over the meadow (not in the camp, off the paths) ──
for (const [id, x, y] of [['bush-1', 24, 58], ['bush-2', 42, 55], ['bush-3', 57, 71], ['bush-4', 77, 57], ['bush-5', 93, 67]]) {
  upsert(v.nodes, { id, table: 'meadow-forage', x, y });
}
upsert(v.npcs, { id: 'sv-fisher', name: 'Ông Sáu câu cá', sprite: 'farmer', x: 110, y: 73,
  lines: ['Hồ Pha Lê này cá nhiều lắm, nhưng phải kiên nhẫn.', 'Thấy phao chìm xuống là giật ngay, chậm một nhịp là cá chạy mất!'] });
v.signs = v.signs.filter((s) => !(s.x === 114 && s.y === 74));
if (!near(v.signs, 110, 76)) v.signs.push({ x: 110, y: 76, text: ['HỒ PHA LÊ — CHỖ CÂU CÁ', 'Đứng cạnh chỗ nước gợn sóng, bấm E (điện thoại: nút Tương tác) để thả câu.', 'Khi phao chìm và hiện dấu "!", bấm lần nữa thật nhanh để kéo lên.'] });

// ── quests: forage for bait → get the rod → first catch ──
const at = (x, y) => ({ x, y });
const Q = [
  { id: 'q-fish-1', kind: 'side', title: 'Cần câu của Ông Sáu', giver: 'sv-fisher', requires: ['q-main-1'],
    description: 'Ông Sáu sẽ cho bạn mượn cần câu nếu bạn kiếm giúp ít quả mọng làm mồi.',
    objectives: [
      { type: 'collect', target: 'forage', count: 3, text: 'Hái 3 bụi quả mọng ở Đồng Cỏ Gió', marker: at(42, 55) },
      { type: 'talk', target: 'sv-fisher', count: 1, text: 'Mang mồi về cho Ông Sáu', marker: at(110, 73) },
    ],
    rewards: { items: { oranberry: 2 }, worldExp: 80, flags: ['tool:rod'] },
    dialogue: { offer: ['Cần câu thì ông có thừa, mồi thì hết rồi. Cháu ra Đồng Cỏ Gió hái giúp ông vài bụi quả mọng nhé.', 'Bụi nào có quả đỏ là hái được.'],
      progress: ['Bụi quả mọng mọc rải rác khắp Đồng Cỏ Gió, phía tây bắc làng.'],
      complete: ['Mồi ngon đấy! Cái cần này cho cháu. Đứng cạnh chỗ nước gợn sóng mà thả câu.'] } },
  { id: 'q-fish-2', kind: 'side', title: 'Mẻ cá đầu tiên', giver: 'sv-fisher', requires: ['q-fish-1'],
    description: 'Câu thành công ba lần ở Hồ Pha Lê.',
    objectives: [
      { type: 'collect', target: 'fish', count: 3, text: 'Câu thành công 3 lần ở Hồ Pha Lê', marker: at(112, 70) },
      { type: 'talk', target: 'sv-fisher', count: 1, text: 'Kể chuyện với Ông Sáu', marker: at(110, 73) },
    ],
    rewards: { items: { netball: 3, 'exp-candy-s': 1 }, worldExp: 120, reputation: 5 },
    dialogue: { offer: ['Thử tay nghề nào: câu được ba mẻ rồi quay lại kể ông nghe.', 'Phao chìm, hiện dấu "!" là bấm ngay. Mỗi chỗ câu xong phải đợi cá kéo về lại.'],
      progress: ['Có bốn chỗ câu quanh hồ: bờ tây, bờ nam, bờ đông và bờ bắc.'],
      complete: ['Khá lắm! Đôi khi còn câu được cả Pokémon đấy. Cầm mấy quả Net Ball này mà bắt Pokémon hệ Nước.'] } },
];
for (const q of Q) upsert(quests, q);

fs.writeFileSync(MAP, JSON.stringify(v, null, 1) + '\n');
fs.writeFileSync(QUESTS, JSON.stringify(quests, null, 1) + '\n');
console.log('gathering patched:', v.nodes.length, 'nodes', quests.length, 'quests');
