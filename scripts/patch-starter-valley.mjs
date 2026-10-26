// One-off content patch (V20): Starter Valley village services + Training Camp + quest chain.
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

// ── Khu 1: village services ────────────────────────────────────────────────
upsert(v.buildings, { id: 'sv-center', name: 'Trung tâm Pokémon', x: 91, y: 85, w: 6, h: 4, roof: 'red', wall: 'stone', door: 2 });
// Chị Mai becomes the Pokémon Center nurse (heals the party when talked to)
const nurse = v.npcs.find((n) => n.id === 'nurse');
Object.assign(nurse, { x: 96, y: 90, role: 'nurse', lines: ['Chào mừng tới Trung tâm Pokémon!', 'Chị sẽ hồi phục toàn bộ đội của em. Máy PC ở ngay cửa nhé.'] });
upsert(v.npcs, { id: 'sv-board', name: 'Bảng nhiệm vụ', sprite: 'board', x: 76, y: 99, lines: ['Bảng nhiệm vụ của làng.', 'Hôm nay chưa có yêu cầu mới.'] });
// villagers that walk around (data: `wander` = radius in tiles)
const collector = v.npcs.find((n) => n.id === 'collector');
collector.wander = 3;
upsert(v.npcs, { id: 'sv-guide', name: 'Anh Tuấn', sprite: 'villager', x: 77, y: 109, wander: 3,
  lines: ['Muốn bắt Pokémon à? Đánh cho nó yếu đi trước, rồi nhắm và ném bóng (phím F, điện thoại: nút ◓).', 'Con số % hiện trên mục tiêu là tỉ lệ bắt thật. Pokémon đang ngủ hoặc bị trạng thái thì dễ bắt hơn.'] });
upsert(v.npcs, { id: 'sv-granny', name: 'Bà Tư bán hoa', sprite: 'elder', x: 86, y: 111, wander: 4,
  lines: ['Ban đêm lũ Pokémon ngày đi ngủ, còn Zubat với Oddish lại ra kiếm ăn.', 'Đứng trước trạm dịch chuyển là đội của cháu được hồi phục đấy.'] });
// tutorial signs at the north gate of the village
for (const s of [
  { x: 78, y: 81, text: ['HƯỚNG DẪN CHIẾN ĐẤU', 'Pokémon tự đánh. Bạn di chuyển, né vùng đỏ và ra lệnh: ` rồi 1–5.', 'Q: Pokémon đang điều khiển dùng chiêu tốt nhất ngay. T: đổi Pokémon điều khiển.'] },
  { x: 84, y: 81, text: ['HƯỚNG DẪN KỸ NĂNG', 'Chạm / bấm ô chiêu dưới màn hình để dùng chiêu đó.', 'Chuột phải hoặc nhấn giữ ô chiêu: giữ chiêu lại cho bạn tự dùng (AI sẽ không dùng nó).'] },
]) if (!near(v.signs, s.x, s.y)) v.signs.push(s);

// ── Khu 6: Training Camp ──────────────────────────────────────────────────
// first match wins in areaAt: the camp goes before the meadow it sits in
v.areas = v.areas.filter((a) => a.id !== 'camp');
v.areas.splice(v.areas.findIndex((a) => a.id === 'meadow'), 0, { id: 'camp', name: 'Trại Huấn Luyện', rect: [33, 75, 57, 91], habitat: 'village', level: [5, 9] });
const campFences = [[33, 75, 43, 75], [47, 75, 57, 75], [33, 91, 57, 91], [33, 75, 33, 91], [57, 75, 57, 81], [57, 85, 57, 91]];
v.fences = v.fences.filter((f) => !campFences.some((c) => c.join() === f.join()));
v.fences.push(...campFences);
// paths: east gate ← main road, north gate ← meadow road
const campPaths = [{ w: 2, pts: [[80, 83], [57, 83], [46, 83]] }, { w: 2, pts: [[45, 66], [45, 83]] }];
v.paths = v.paths.filter((p) => !campPaths.some((c) => JSON.stringify(c.pts) === JSON.stringify(p.pts)));
v.paths.push(...campPaths);
upsert(v.npcs, { id: 'camp-coach', name: 'Thầy Khang (Trại Huấn Luyện)', sprite: 'wizard', x: 49, y: 80,
  lines: ['Mỗi Pokémon có vai trò: Tank giữ địch, Fighter áp sát, Assassin săn con yếu, Marksman bắn xa, Mage đánh diện rộng, Support hồi máu.',
    'Tự đánh không có nghĩa là không cần chỉ huy. Chọn đúng lúc bấm Q, đúng chiêu và đúng lệnh mới là huấn luyện viên giỏi.'] });
const campTrainers = [
  { id: 'camp-tank', name: 'Học viên Tân', sprite: 'youngster', x: 38, y: 79, team: [['geodude', 7], ['shellder', 8]],
    challenge: ['Đội của tôi toàn đá với vỏ cứng! Thử xem bạn có xuyên thủng được không!'],
    win: ['Hệ Nước và Cỏ khắc Đá... bạn chọn chiêu khéo thật.'], lose: ['Phòng thủ là tấn công tốt nhất! Về hồi phục rồi thử lại nhé.'],
    rewards: { items: { potion: 2 }, exp: 160 } },
  { id: 'camp-speed', name: 'Học viên Linh', sprite: 'girl', x: 38, y: 87, team: [['zubat', 8], ['mankey', 9]],
    challenge: ['Nhanh như gió! Nếu không né được vòng đỏ thì bạn thua chắc.'],
    win: ['Bạn né giỏi quá, lại còn biết lúc nào nên rút lui.'], lose: ['Chậm quá! Đứng yên trong vùng cảnh báo là ăn đòn đấy.'],
    rewards: { items: { greatball: 2 }, exp: 200 } },
  { id: 'camp-mage', name: 'Học viên Phong', sprite: 'youngster', x: 52, y: 87, team: [['oddish', 9], ['magnemite', 9], ['growlithe', 10]],
    challenge: ['Đội hệ đặc biệt của tôi đánh cả đám một lúc. Bạn có tách được đội hình không?'],
    win: ['Tập trung một mục tiêu bằng lệnh Tấn công... đúng là thủ khoa!'], lose: ['Chiêu diện rộng mạnh lắm khi các bạn đứng dồn một chỗ!'],
    rewards: { items: { superpotion: 1 }, exp: 260 } },
];
for (const t of campTrainers) upsert(v.trainers, t);
for (const p of [{ kind: 'target', x: 50, y: 77 }, { kind: 'target', x: 53, y: 77 }, { kind: 'target', x: 36, y: 77 }, { kind: 'log', x: 44, y: 89 }, { kind: 'haystack', x: 55, y: 89 }, { kind: 'bucket', x: 47, y: 80 }]) {
  if (!near(v.props, p.x, p.y)) v.props.push(p);
}
if (!near(v.signs, 59, 83)) v.signs.push({ x: 59, y: 85, text: ['TRẠI HUẤN LUYỆN', 'Ba học viên, ba lối đánh. Thắng cả ba để tốt nghiệp.'] });
upsert(v.chests, { id: 'chest-camp', x: 35, y: 89, items: { 'exp-candy-s': 3, 'muscle-band': 1 }, requiresFlag: 'camp:graduate' });

// ── Quests: camp chain + village board ─────────────────────────────────────
const camp = (x, y) => ({ x, y });
const Q = [
  { id: 'q-camp-1', kind: 'side', title: 'Trại huấn luyện: Phá phòng ngự', giver: 'camp-coach', requires: ['q-main-1'],
    description: 'Thầy Khang muốn xem bạn xử lý một đội phòng thủ dày.',
    objectives: [
      { type: 'trainer', target: 'camp-tank', count: 1, text: 'Đánh bại Học viên Tân (đội phòng thủ)', marker: camp(38, 79) },
      { type: 'talk', target: 'camp-coach', count: 1, text: 'Báo cáo với Thầy Khang', marker: camp(49, 80) },
    ],
    rewards: { items: { potion: 3, 'exp-candy-s': 2 }, worldExp: 120, reputation: 5 },
    dialogue: { offer: ['Đội của Tân rất trâu. Tìm chiêu khắc hệ Đá, và đừng ngại bấm Q khi chiêu mạnh vừa hồi xong.'],
      progress: ['Tân đứng ở góc tây bắc trại.'], complete: ['Tốt! Đánh đúng hệ thì vỏ cứng mấy cũng vỡ.'] } },
  { id: 'q-camp-2', kind: 'side', title: 'Trại huấn luyện: Né và rút', giver: 'camp-coach', requires: ['q-camp-1'],
    description: 'Học cách né vòng cảnh báo và dùng lệnh Rút lui.',
    objectives: [
      { type: 'trainer', target: 'camp-speed', count: 1, text: 'Đánh bại Học viên Linh (đội tốc độ)', marker: camp(38, 87) },
      { type: 'talk', target: 'camp-coach', count: 1, text: 'Báo cáo với Thầy Khang', marker: camp(49, 80) },
    ],
    rewards: { items: { greatball: 3, 'quick-claw': 1 }, worldExp: 150, reputation: 5 },
    dialogue: { offer: ['Linh đánh nhanh. Khi HLV mất máu, ra lệnh Rút lui (` rồi 5), hồi lại rồi phản công.'],
      progress: ['Linh ở góc tây nam trại.'], complete: ['Biết lúc nào nên lùi cũng là một kỹ năng. Cầm Quick Claw này để ra chiêu nhanh hơn.'] } },
  { id: 'q-camp-3', kind: 'side', title: 'Trại huấn luyện: Tốt nghiệp', giver: 'camp-coach', requires: ['q-camp-2'],
    description: 'Bài kiểm tra cuối: tập trung hỏa lực vào một mục tiêu.',
    objectives: [
      { type: 'trainer', target: 'camp-mage', count: 1, text: 'Đánh bại Học viên Phong (đội hệ đặc biệt)', marker: camp(52, 87) },
      { type: 'talk', target: 'camp-coach', count: 1, text: 'Nhận bằng tốt nghiệp từ Thầy Khang', marker: camp(49, 80) },
    ],
    rewards: { items: { 'scope-lens': 1, 'exp-candy-m': 2 }, worldExp: 250, reputation: 20, flags: ['camp:graduate'] },
    dialogue: { offer: ['Phong có ba Pokémon. Dùng lệnh Tấn công (` rồi 2) để cả đội dồn vào một con, hạ từng con một.'],
      progress: ['Phong ở góc đông nam trại.'], complete: ['Chúc mừng tốt nghiệp! Rương ở góc trại giờ đã mở cho bạn.'] } },
  { id: 'q-board-rattata', kind: 'side', title: 'Bảng tin: Lũ Rattata quấy phá', giver: 'sv-board', requires: ['q-main-1'],
    description: 'Dân làng nhờ đuổi bớt Rattata quanh đồng cỏ.',
    objectives: [{ type: 'defeat', target: 'rattata', count: 5, text: 'Hạ 5 Rattata', marker: camp(46, 66) }],
    rewards: { items: { pokeball: 5, oranberry: 2 }, worldExp: 80, reputation: 5 },
    dialogue: { offer: ['[Bảng tin] Rattata gặm trộm lúa khắp đồng cỏ. Ai giúp được xin cảm ơn!'], progress: ['[Bảng tin] Còn Rattata quanh Đồng Cỏ Gió.'], complete: ['[Bảng tin] Cảm ơn bạn! Phần thưởng đã được gửi kèm.'] } },
  { id: 'q-board-camp', kind: 'exploration', title: 'Bảng tin: Thăm Trại Huấn Luyện', giver: 'sv-board', requires: ['q-main-1'],
    description: 'Trại Huấn Luyện phía tây làng đang nhận học viên mới.',
    objectives: [
      { type: 'explore', target: 'camp', count: 1, text: 'Đến Trại Huấn Luyện', marker: camp(45, 83) },
      { type: 'talk', target: 'camp-coach', count: 1, text: 'Gặp Thầy Khang', marker: camp(49, 80) },
    ],
    rewards: { items: { potion: 2 }, worldExp: 60 },
    dialogue: { offer: ['[Bảng tin] Trại Huấn Luyện phía tây làng nhận học viên mới. Hỏi Thầy Khang nhé!'], progress: ['[Bảng tin] Trại ở phía tây, theo đường đất từ cổng bắc làng.'], complete: ['Chào học viên mới! Khi nào sẵn sàng thì nhận bài học đầu tiên.'] } },
];
for (const q of Q) upsert(quests, q);

fs.writeFileSync(MAP, JSON.stringify(v, null, 1) + '\n');
fs.writeFileSync(QUESTS, JSON.stringify(quests, null, 1) + '\n');
console.log('starter valley patched:', v.npcs.length, 'npcs', v.trainers.length, 'trainers', quests.length, 'quests');
