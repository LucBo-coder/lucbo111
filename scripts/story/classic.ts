// "Quần Đảo Khởi Nguyên" — the story of the Phiêu lưu campaign (source of src/data/story/classic.json).
//
// The old lighthouse of the coast — Hải Đăng Khởi Nguyên — went dark when its core broke into seven shards that
// scattered over the islands. A survey team (Trưởng đoàn Minh Khuê, the young surveyor Phong) wants to bring them
// back and relight it; the Thiết Lĩnh excavation crew (Trưởng nhóm Thiết) digs them up to sell their power.
import { waves, type NpcIn, type QuestIn, type StoryIn, type TrainerIn } from './lib';
import type { Cutscene, StoryChapter } from '../../src/core/story';

const P = (region: string, at: string, dx = 0, dy = 0) => ({ region, at, dx, dy });

const characters = [
  { id: 'khue', name: 'Trưởng đoàn Minh Khuê', role: 'Trưởng đoàn khảo sát — đi tìm bảy mảnh Lõi Khởi Nguyên để thắp lại hải đăng', npc: 'ck-khue' },
  { id: 'phong', name: 'Phong', role: 'Khảo sát viên trẻ, vừa là bạn đồng hành vừa là đối thủ — luôn muốn tới đích trước', npc: 'ck-phong' },
  { id: 'keeper', name: 'Ông giữ hải đăng', role: 'Người giữ Hải Đăng Khởi Nguyên ở Bờ Biển San Hô, nhớ câu chuyện về Lõi', npc: 'lighthouse-keeper' },
  { id: 'thiet', name: 'Trưởng nhóm Thiết', role: 'Trưởng đoàn khai thác Thiết Lĩnh — đào các mảnh Lõi lên để bán năng lượng của chúng', npc: 'ck-thiet' },
  { id: 'tung', name: 'Giáo sư Tùng', role: 'Giáo sư ở làng Thung Lũng, người trao Pokémon đầu tiên', npc: 'prof' },
];

const MAPS = ['starter-valley', 'emerald-woods', 'misty-swamp', 'coral-coast', 'frozen-mountains', 'volcanic-lands', 'legendary-sanctuary'];

const chapters: StoryChapter[] = [
  { id: 'ck-1', title: 'Chương 1 — Thung Lũng', regions: ['starter-valley'], quests: ['ck-1a', 'ck-1b'],
    summary: 'Một đoàn khảo sát dựng trại ở thung lũng. Dưới tàn tích cổ có thứ đang phát sáng — và đoàn khai thác Thiết Lĩnh cũng đã tới.',
    change: 'Mảnh Lõi đầu tiên đã về tay đoàn khảo sát. Máy khoan Thiết Lĩnh ở tàn tích đã bị phá.' },
  { id: 'ck-2', title: 'Chương 2 — Rừng Ngọc', regions: ['emerald-woods'], quests: ['ck-2'],
    summary: 'Mảnh thứ hai cộng hưởng với rừng, khiến Pokémon kéo về trái tim rừng ngọc.',
    change: 'Rừng Ngọc yên trở lại; mảnh thứ hai đã được thu.' },
  { id: 'ck-3', title: 'Chương 3 — Đầm Lầy', regions: ['misty-swamp'], quests: ['ck-3'],
    summary: 'Thiết Lĩnh bơm bùn ở giữa đầm để tìm mảnh thứ ba, làm sương độc dày thêm.',
    change: 'Máy bơm bùn đã tắt, sương đầm mỏng đi. Mảnh thứ ba nằm trong túi Phong.' },
  { id: 'ck-4', title: 'Chương 4 — Bờ Biển', regions: ['coral-coast'], quests: ['ck-4'],
    summary: 'Ông giữ hải đăng kể về Lõi Khởi Nguyên — và chỉ ra nơi ba mảnh còn lại đang ngủ.',
    change: 'Ông giữ hải đăng đã mở cuốn sổ cổ. Ngọn đèn le lói lần đầu sau nhiều năm.' },
  { id: 'ck-5', title: 'Chương 5 — Núi Tuyết', regions: ['frozen-mountains'], quests: ['ck-5'],
    summary: 'Phong lên đỉnh núi tuyết một mình để giành mảnh thứ năm trước Thiết Lĩnh — rồi kẹt lại trong bão.',
    change: 'Phong đã an toàn và hiểu rằng không ai tới đích được một mình.' },
  { id: 'ck-6', title: 'Chương 6 — Núi Lửa', regions: ['volcanic-lands'], quests: ['ck-6'],
    summary: 'Trưởng nhóm Thiết đặt máy khoan lớn nhất ngay miệng núi lửa.',
    change: 'Máy khoan lớn đã sập. Trưởng nhóm Thiết bỏ lại bản đồ — mảnh cuối ở Thánh Địa.' },
  { id: 'ck-7', title: 'Chương 7 — Thánh Địa', regions: ['legendary-sanctuary', 'coral-coast'], quests: ['ck-7a', 'ck-7b'],
    summary: 'Bảy mảnh hợp lại ở Thánh Địa. Lõi Khởi Nguyên cần được giữ yên cho tới khi nó liền lại, rồi mang về hải đăng.',
    change: 'Hải Đăng Khởi Nguyên sáng lại. Tàu thuyền và Pokémon biển tìm được đường về.' },
];

const cutscenes: Cutscene[] = [
  { id: 'ck-c-1', title: 'Đoàn khảo sát', chapter: 'ck-1', lines: [
    { who: 'khue', text: 'Chào cháu! Ta là Minh Khuê, trưởng đoàn khảo sát. Bọn ta đi theo một truyền thuyết: Lõi Khởi Nguyên — trái tim của ngọn hải đăng cổ ngoài bờ biển.' },
    { who: 'khue', text: 'Hải đăng tắt từ khi Lõi vỡ thành bảy mảnh. Máy dò của ta bắt được một mảnh ngay dưới tàn tích của thung lũng này.' },
    { who: 'phong', text: 'Tôi là Phong. Tôi sẽ là người tìm ra mảnh đầu tiên — cậu cứ thong thả nhé!' },
  ] },
  { id: 'ck-c-1b', title: 'Thiết Lĩnh', chapter: 'ck-1', lines: [
    { who: 'thiet', text: 'Một đứa nhóc phá máy khoan của ta? Thú vị. Mảnh Lõi là năng lượng — ai đào được thì người đó có.' },
    { who: 'khue', text: 'Lõi Khởi Nguyên không phải mỏ than, Thiết. Nó giữ ánh sáng cho cả vùng biển.' },
    { who: 'thiet', text: 'Ánh sáng không trả lương cho thợ của ta. Hẹn gặp lại ở mảnh tiếp theo.' },
  ] },
  { id: 'ck-c-2', title: 'Trái tim rừng ngọc', chapter: 'ck-2', lines: [
    { who: 'phong', text: 'Mảnh thứ hai... nó đang hát. Cậu nghe không? Pokémon cả rừng đều nghe thấy.' },
    { who: 'khue', text: 'Từng mảnh mang ký ức của một vùng đất. Mảnh này nhớ rừng.' },
  ] },
  { id: 'ck-c-3', title: 'Sương đầm', chapter: 'ck-3', lines: [
    { who: 'phong', text: 'Cậu phá máy, tôi nhặt mảnh — chia đều nhé. Lần này thôi.' },
    { who: 'khue', text: 'Ba mảnh. Ông giữ hải đăng ở Bờ Biển San Hô biết nhiều hơn ta — đã tới lúc tìm ông ấy.' },
  ] },
  { id: 'ck-c-4', title: 'Cuốn sổ của người giữ đèn', chapter: 'ck-4', lines: [
    { who: 'keeper', text: 'Bảy mảnh... ông đã đợi có người hỏi câu đó suốt ba mươi năm.' },
    { who: 'keeper', text: 'Lõi vỡ trong đêm bão lớn. Bốn mảnh rơi gần, ba mảnh bay xa: lên núi tuyết, xuống núi lửa, và về Thánh Địa — nơi nó được sinh ra.' },
    { who: 'keeper', text: 'Mang chúng về đây. Ngọn đèn sẽ tự nhớ cách cháy.' },
  ] },
  { id: 'ck-c-5', title: 'Bão tuyết', chapter: 'ck-5', lines: [
    { who: 'phong', text: 'Tôi muốn chứng minh mình làm được một mình... Ngu thật.' },
    { who: 'phong', text: 'Mảnh thứ năm đây. Cậu cầm đi — tôi nghĩ nó muốn đi với cậu.' },
  ] },
  { id: 'ck-c-6', title: 'Miệng núi lửa', chapter: 'ck-6', lines: [
    { who: 'thiet', text: 'Máy khoan lớn nhất của ta... sập rồi. Được thôi, nhóc. Ta thua.' },
    { who: 'thiet', text: 'Mảnh cuối ở Thánh Địa. Ta đã thử vào — các hộ vệ ở đó không cho ai cầm máy đi qua. Có lẽ chúng sẽ cho cháu.' },
    { who: 'khue', text: 'Thiết... sao ông lại nói cho bọn ta?' },
    { who: 'thiet', text: 'Hồi nhỏ ta cũng từng ngồi trên bờ biển nhìn ngọn đèn đó.' },
  ] },
  { id: 'ck-c-7', title: 'Lõi Khởi Nguyên', chapter: 'ck-7', lines: [
    { who: '', text: 'Bảy mảnh xoay quanh nhau giữa sân Thánh Địa, chậm rãi khép lại thành một khối sáng.' },
    { who: 'khue', text: 'Nó đang liền lại! Giữ cho mọi thứ yên — đừng để Pokémon nào chạm vào nó.' },
  ] },
  { id: 'ck-c-end', title: 'Hải Đăng Khởi Nguyên', chapter: 'ck-7', lines: [
    { who: '', text: 'Lõi Khởi Nguyên được đặt về chỗ cũ. Ngọn hải đăng bừng sáng, chiếu xa tới tận Thánh Địa.' },
    { who: 'keeper', text: 'Ba mươi năm... cảm ơn cháu. Từ đêm nay, tàu thuyền và Pokémon biển lại tìm được đường về.' },
    { who: 'phong', text: 'Lần sau có chuyến khảo sát nào, nhớ gọi tôi. Tôi sẽ không chạy trước nữa — chắc vậy.' },
    { who: 'khue', text: 'Đoàn khảo sát sẽ ở lại vài mùa. Quần đảo còn nhiều bí ẩn lắm.' },
  ] },
];

const npcs: NpcIn[] = [];
const trainers: TrainerIn[] = [];
const quests: QuestIn[] = [];

// Minh Khuê waits on every map of the journey once the previous chapter is done
const khueAt: Record<string, [string, number, number]> = {
  'starter-valley': ['wp:wp-meadow', 3, 2], 'emerald-woods': ['wp:wp-emerald-camp', 3, 2], 'misty-swamp': ['wp:wp-swamp-camp', 3, 2],
  'coral-coast': ['npc:lighthouse-keeper', -3, 2], 'frozen-mountains': ['wp:wp-frozen-camp', 3, 2], 'volcanic-lands': ['wp:wp-volcano-outpost', 3, 2],
  'legendary-sanctuary': ['wp:wp-sanctuary-gate', 3, 2],
};
const khue = (m: string) => `ck-khue-${m}`;
MAPS.forEach((m, i) => {
  const [at, dx, dy] = khueAt[m];
  npcs.push({ id: khue(m), name: 'Trưởng đoàn Minh Khuê', sprite: 'girl', look: 'ck-khue', at: P(m, at, dx, dy),
    showIf: i === 0 ? undefined : [`ck:shard-${i}`], hideIf: i === MAPS.length - 1 ? ['ck:end'] : [`ck:shard-${i + 1}`],
    lines: ['Máy dò của ta đang quét. Có gì lạ cháu cứ báo nhé.'] });
});

trainers.push(
  { id: 'ck-phong-valley', name: 'Phong', sprite: 'youngster', look: 'ck-phong', at: P('starter-valley', 'wp:wp-meadow', -3, 3), hideIf: ['ck:shard-1'],
    team: [['pidgey', 6], ['bidoof', 7]],
    challenge: ['Thử xem ai là khảo sát viên giỏi hơn nào!'], win: ['Được lắm! Nhưng mảnh Lõi vẫn sẽ là của tôi.'], lose: ['Haha, tập thêm đi rồi đấu lại!'],
    rewards: { items: { potion: 2, pokeball: 3 }, exp: 150 } },
  { id: 'ck-tl-swamp', name: 'Thợ khai thác Thiết Lĩnh', sprite: 'bald', look: 'ck-tl-1', at: P('misty-swamp', 'area:swamp-heart', 3, 3), showIf: ['ck:shard-2'], hideIf: ['ck:shard-3'],
    team: [['grimer', 26], ['croagunk', 27], ['koffing', 27]],
    challenge: ['Khu khai thác! Đi chỗ khác chơi!'], win: ['Ối... báo trưởng nhóm thôi!'], lose: ['Đã bảo rồi mà.'],
    rewards: { items: { superpotion: 2, greatball: 3 }, exp: 1100 } },
  { id: 'ck-thiet', name: 'Trưởng nhóm Thiết', sprite: 'viking', look: 'ck-thiet', at: P('volcanic-lands', 'area:crater', -4, 3), showIf: ['ck:shard-5'], hideIf: ['ck:shard-6'],
    team: [['magcargo', 52], ['rhydon', 53], ['steelix', 53], ['magmar', 54]],
    challenge: ['Cháu đã đi xa tới vậy chỉ để chặn ta sao? Được — cho ta xem.'], win: ['...Pokémon của cháu đánh vì một thứ ta không có.'], lose: ['Đất này thuộc về người đào được nó.'],
    rewards: { items: { superpotion: 2, ultraball: 3 }, exp: 3200 } },
);

quests.push(
  { id: 'ck-1a', kind: 'main', region: 'starter-valley', chapter: 'ck-1', title: 'Đoàn khảo sát', giver: khue('starter-valley'), requires: ['q-main-1'],
    description: 'Một đoàn khảo sát dựng trại ở đồng cỏ. Trưởng đoàn Minh Khuê đang tìm một mảnh của Lõi Khởi Nguyên.',
    objectives: [
      { type: 'trainer', target: 'ck-phong-valley', text: 'Đấu với Phong' },
      { type: 'explore', target: 'ruins', text: 'Tới tàn tích cổ' },
      { type: 'talk', target: khue('starter-valley'), text: 'Báo lại với Trưởng đoàn Minh Khuê' },
    ],
    rewards: { exp: 200, items: { potion: 3, pokeball: 5 } },
    dialogue: { offer: ['Cháu là người Giáo sư Tùng nói tới? Ta cần một người dẫn đường quanh thung lũng.', 'Phong — khảo sát viên của ta — muốn thử sức cháu trước.'],
      progress: ['Tàn tích ở phía bắc thung lũng.'], complete: ['Máy dò kêu to nhất ở tàn tích... nhưng có tiếng máy khoan. Ai đó đã tới trước.'] },
    cutscene: { start: 'ck-c-1' } },
  { id: 'ck-1b', kind: 'main', region: 'starter-valley', chapter: 'ck-1', title: 'Máy khoan dưới tàn tích', giver: khue('starter-valley'), requires: ['ck-1a'],
    description: 'Đoàn khai thác Thiết Lĩnh đặt máy khoan ở tàn tích. Phá nó trước khi mảnh Lõi bị đào lên.',
    objectives: [
      { type: 'destroy', target: 'ck-1b:destroy', text: 'Phá máy khoan Thiết Lĩnh',
        encounter: { kind: 'destroy', at: P('starter-valley', 'area:ruins'), every: 14, device: { name: 'Máy khoan Thiết Lĩnh', species: 'bronzor', level: 11, hpMult: 2.5 }, waves: waves(['geodude', 'diglett', 'roggenrola'], 11) } },
      { type: 'talk', target: khue('starter-valley'), text: 'Mang mảnh Lõi về cho Trưởng đoàn' },
    ],
    rewards: { exp: 350, items: { superpotion: 2, greatball: 3 }, flags: ['ck:shard-1'] },
    dialogue: { offer: ['Tiếng khoan từ tàn tích! Cháu đi trước, ta theo sau.'], progress: ['Máy khoan ở giữa tàn tích.'], complete: ['Mảnh đầu tiên... ấm như vừa được nắng chiếu. Cảm ơn cháu.'] },
    cutscene: { complete: 'ck-c-1b' } },
  { id: 'ck-2', kind: 'main', region: 'emerald-woods', chapter: 'ck-2', title: 'Bài hát của rừng ngọc', giver: khue('emerald-woods'), requires: ['ck-1b'], requiresFlags: ['region:emerald-forest'],
    description: 'Mảnh thứ hai ở trái tim Rừng Ngọc cộng hưởng với rừng. Pokémon kéo về quanh nó — cần giữ chỗ cho Trưởng đoàn thu mảnh.',
    objectives: [
      { type: 'explore', target: 'emerald-heart', text: 'Tới trái tim rừng ngọc' },
      { type: 'hold', target: 'ck-2:hold', text: 'Giữ chỗ trong lúc thu mảnh Lõi',
        encounter: { kind: 'hold', at: P('emerald-woods', 'area:emerald-heart'), radius: 4, seconds: 40, every: 12, waves: waves(['beautifly', 'breloom', 'vespiquen'], 17) } },
      { type: 'talk', target: khue('emerald-woods'), text: 'Báo lại với Trưởng đoàn' },
    ],
    rewards: { exp: 700, items: { superpotion: 2, greatball: 3 }, flags: ['ck:shard-2'] },
    dialogue: { offer: ['Máy dò chỉ về trái tim rừng. Nhưng cẩn thận — mảnh Lõi đang hát, và Pokémon đều nghe thấy.'], progress: ['Trái tim rừng ở giữa bản đồ.'], complete: ['Hai mảnh rồi!'] },
    cutscene: { complete: 'ck-c-2' } },
  { id: 'ck-3', kind: 'main', region: 'misty-swamp', chapter: 'ck-3', title: 'Máy bơm bùn', giver: khue('misty-swamp'), requires: ['ck-2'],
    description: 'Thiết Lĩnh bơm bùn ở giữa đầm tìm mảnh thứ ba, khiến sương độc dày thêm.',
    objectives: [
      { type: 'explore', target: 'swamp-heart', text: 'Vào giữa đầm' },
      { type: 'trainer', target: 'ck-tl-swamp', text: 'Đánh bại thợ khai thác canh máy' },
      { type: 'destroy', target: 'ck-3:destroy', text: 'Phá máy bơm bùn',
        encounter: { kind: 'destroy', at: P('misty-swamp', 'area:swamp-heart', -3, -3), every: 14, device: { name: 'Máy bơm bùn Thiết Lĩnh', species: 'klang', level: 28, hpMult: 3 }, waves: waves(['grimer', 'skuntank', 'toxicroak'], 26) } },
      { type: 'talk', target: khue('misty-swamp'), text: 'Báo lại với Trưởng đoàn' },
    ],
    rewards: { exp: 1400, items: { superpotion: 3, ultraball: 1 }, flags: ['ck:shard-3'] },
    dialogue: { offer: ['Sương độc dày gấp đôi từ khi Thiết Lĩnh dựng máy bơm. Phải tắt nó.'], progress: ['Máy bơm ở giữa đầm.'], complete: ['Phong đã nhặt được mảnh thứ ba trong bùn. Giờ tới bờ biển.'] },
    cutscene: { complete: 'ck-c-3' } },
  { id: 'ck-4', kind: 'main', region: 'coral-coast', chapter: 'ck-4', title: 'Người giữ hải đăng', giver: khue('coral-coast'), requires: ['ck-3'], requiresFlags: ['region:coral-coast'],
    description: 'Ông giữ hải đăng nhớ câu chuyện về Lõi. Bạn phải quyết định: trao ba mảnh cho ông giữ ngay, hay để Trưởng đoàn mang theo nghiên cứu (lựa chọn này đổi phần thưởng và lời kể về sau).',
    objectives: [
      { type: 'talk', target: 'lighthouse-keeper', text: 'Gặp Ông giữ hải đăng' },
      { type: 'hold', target: 'ck-4:hold', text: 'Giữ chân hải đăng trong lúc ông tìm cuốn sổ cổ',
        encounter: { kind: 'hold', at: P('coral-coast', 'npc:lighthouse-keeper', 0, 4), radius: 4, seconds: 45, every: 12, waves: waves(['wingull', 'corphish', 'pelipper'], 30) } },
      { type: 'choose', target: 'lighthouse-keeper', text: 'Quyết định giữ ba mảnh Lõi ở đâu', options: [
        { id: 'trao', label: 'Trao ba mảnh cho Ông giữ hải đăng (đèn le lói ngay)', rewards: { items: { 'rare-candy': 1 }, flags: ['ck:lamp-early'] },
          reply: ['Ông sẽ giữ chúng bên ngọn đèn. Nhìn kìa — nó đã le lói rồi.'] },
        { id: 'giu', label: 'Để Trưởng đoàn mang theo nghiên cứu (máy dò mạnh hơn)', rewards: { items: { ultraball: 3 }, flags: ['ck:survey-scan'] },
          reply: ['Cũng được. Ba mảnh ở cạnh nhau, máy dò của Khuê sẽ bắt sóng xa hơn.'] },
      ] },
    ],
    rewards: { exp: 1800, items: { superpotion: 3 }, flags: ['ck:shard-4'] },
    dialogue: { offer: ['Chúng ta có ba mảnh. Ông giữ hải đăng ở trên vách đá — ông ấy là người duy nhất còn nhớ Lõi.'], progress: ['Ông giữ hải đăng đang lục cuốn sổ cổ.'],
      complete: ['Mảnh thứ tư nằm ngay dưới chân đèn. Ba mảnh còn lại: núi tuyết, núi lửa, Thánh Địa.'] },
    cutscene: { complete: 'ck-c-4' } },
  { id: 'ck-5', kind: 'main', region: 'frozen-mountains', chapter: 'ck-5', title: 'Phong trong bão tuyết', giver: khue('frozen-mountains'), requires: ['ck-4'], requiresFlags: ['boss:mega-venusaur'],
    description: 'Phong lên đỉnh một mình để giành mảnh thứ năm và kẹt lại trong bão tuyết.',
    objectives: [
      { type: 'escort', target: 'ck-5:escort', text: 'Đưa Phong từ đỉnh núi về trại',
        encounter: { kind: 'escort', at: P('frozen-mountains', 'wp:wp-frozen-camp', 2, 0), radius: 3, npc: { name: 'Phong', sprite: 'youngster', look: 'ck-phong', from: P('frozen-mountains', 'area:frozen-summit') } } },
      { type: 'talk', target: khue('frozen-mountains'), text: 'Báo lại với Trưởng đoàn' },
    ],
    rewards: { exp: 2600, items: { superpotion: 2 }, flags: ['ck:shard-5'] },
    dialogue: { offer: ['Phong lên đỉnh từ sáng sớm, giờ bão tới rồi. Cháu lên đưa nó về giúp ta!'], progress: ['Phong ở gần đỉnh núi.'], complete: ['Hai đứa về rồi! Năm mảnh...'] },
    cutscene: { complete: 'ck-c-5' } },
  { id: 'ck-6', kind: 'main', region: 'volcanic-lands', chapter: 'ck-6', title: 'Máy khoan miệng núi lửa', giver: khue('volcanic-lands'), requires: ['ck-5'], requiresFlags: ['boss:articuno', 'boss:zapdos', 'boss:moltres'],
    description: 'Trưởng nhóm Thiết đặt máy khoan lớn nhất ở miệng núi lửa để lấy mảnh thứ sáu.',
    objectives: [
      { type: 'trainer', target: 'ck-thiet', text: 'Đánh bại Trưởng nhóm Thiết' },
      { type: 'destroy', target: 'ck-6:destroy', text: 'Phá máy khoan lớn',
        encounter: { kind: 'destroy', at: P('volcanic-lands', 'area:crater', 3, 3), every: 13, device: { name: 'Máy khoan lớn Thiết Lĩnh', species: 'klinklang', level: 54, hpMult: 4.5 }, waves: waves(['slugma', 'magcargo', 'magmar'], 50) } },
      { type: 'talk', target: khue('volcanic-lands'), text: 'Báo lại với Trưởng đoàn' },
    ],
    rewards: { exp: 4000, items: { superpotion: 3, ultraball: 3 }, flags: ['ck:shard-6'] },
    dialogue: { offer: ['Thiết đang đợi ở miệng núi lửa. Lần này ông ta không bỏ chạy.'], progress: ['Miệng núi lửa ở phía bắc.'], complete: ['Sáu mảnh. Và Thiết đã chỉ đường tới mảnh cuối.'] },
    cutscene: { complete: 'ck-c-6' } },
  { id: 'ck-7a', kind: 'main', region: 'legendary-sanctuary', chapter: 'ck-7', title: 'Lõi Khởi Nguyên', giver: khue('legendary-sanctuary'), requires: ['ck-6'], requiresFlags: ['boss:rayquaza'],
    description: 'Bảy mảnh hợp lại ở sân Thánh Địa. Giữ cho Lõi yên cho tới khi nó liền lại.',
    objectives: [
      { type: 'explore', target: 'sanctuary-court', text: 'Vào sân Thánh Địa' },
      { type: 'hold', target: 'ck-7a:hold', text: 'Giữ Lõi Khởi Nguyên trong lúc nó liền lại',
        encounter: { kind: 'hold', at: P('legendary-sanctuary', 'area:sanctuary-court'), radius: 5, seconds: 60, every: 12, waves: waves(['bronzong', 'metagross', 'dragonite'], 72) } },
      { type: 'talk', target: khue('legendary-sanctuary'), text: 'Nhận Lõi Khởi Nguyên từ Trưởng đoàn' },
    ],
    rewards: { exp: 6000, items: { 'rare-candy': 2 }, flags: ['ck:core'] },
    dialogue: { offer: ['Mảnh cuối ở đây. Khi bảy mảnh gặp nhau, Lõi sẽ tự liền — nhưng phải giữ cho nó yên.'], progress: ['Giữ vòng sáng ở giữa sân.'], complete: ['Lõi Khởi Nguyên... nguyên vẹn. Mang nó về hải đăng đi, cháu.'] },
    cutscene: { start: 'ck-c-7' } },
  { id: 'ck-7b', kind: 'main', region: 'coral-coast', chapter: 'ck-7', title: 'Thắp lại hải đăng', giver: khue('legendary-sanctuary'), requires: ['ck-7a'], autoStart: true,
    description: 'Mang Lõi Khởi Nguyên về Bờ Biển San Hô cho Ông giữ hải đăng.',
    objectives: [{ type: 'talk', target: 'lighthouse-keeper', text: 'Trao Lõi cho Ông giữ hải đăng', marker: P('coral-coast', 'npc:lighthouse-keeper') }],
    rewards: { exp: 8000, items: { 'exp-candy-xl': 1, 'rare-candy': 3 }, flags: ['ck:end'] },
    dialogue: { offer: ['Về hải đăng thôi.'], progress: ['Ông giữ hải đăng ở Bờ Biển San Hô.'], complete: ['Ngọn đèn... nó nhớ rồi.'] },
    cutscene: { complete: 'ck-c-end' } },
);

export const classic: StoryIn = {
  id: 'quan-dao-khoi-nguyen', campaign: 'classic', title: 'Quần Đảo Khởi Nguyên',
  premise: 'Hải Đăng Khởi Nguyên đã tắt từ khi Lõi của nó vỡ thành bảy mảnh rơi khắp quần đảo. Đoàn khảo sát của Trưởng đoàn Minh Khuê muốn tìm lại chúng để thắp lại ngọn đèn; đoàn khai thác Thiết Lĩnh muốn đào chúng lên bán.',
  characters, chapters, cutscenes, quests, npcs, trainers,
};
