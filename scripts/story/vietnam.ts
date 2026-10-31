// "Mạch Nguồn" — the story of the Việt Nam Odyssey (source of src/data/story/vietnam.json, see scripts/gen-story.ts).
//
// Under the country run the mạch nguồn: old veins of water and life that keep rivers, forests and Pokémon in step.
// Dự án Bình Minh (Tiến sĩ Vũ) builds stations that force the veins to give energy for a drought-proof future —
// and everywhere they pull, water turns back, Pokémon flee their homes and the old guardians wake up angry.
// The player, Linh (hydrology engineer), Giáo sư An and Chú Sáu (boatman) follow the veins from Cà Mau to Hà Nội.
import { waves, type EncounterIn, type NpcIn, type ObjectiveIn, type QuestIn, type StoryIn, type TrainerIn } from './lib';
import type { Cutscene, StoryChapter } from '../../src/core/story';

const P = (region: string, at: string, dx = 0, dy = 0) => ({ region, at, dx, dy });

/** The journey, in order: province id, quest code, story act, level of its guardian (world boss). */
const ROUTE: [string, string, number, number][] = [
  ['ca-mau', 'cm', 0, 12], ['an-giang', 'ag', 1, 20], ['can-tho', 'ct', 1, 26], ['vinh-long', 'vl', 1, 32], ['tra-vinh', 'tv', 1, 36],
  ['ben-tre', 'bt', 1, 40], ['dong-thap', 'dt', 1, 42], ['tay-ninh', 'tn', 2, 44], ['ho-chi-minh', 'sg', 2, 46], ['dong-nai', 'dn', 2, 48],
  ['lam-dong', 'ld', 3, 50], ['khanh-hoa', 'kh', 3, 52], ['dak-lak', 'dl', 3, 54], ['gia-lai', 'gl', 3, 56], ['quang-ngai', 'qn', 3, 58],
  ['da-nang', 'dg', 3, 60], ['hue', 'hu', 3, 62], ['quang-tri', 'qt', 3, 64], ['ha-tinh', 'ht', 4, 66], ['nghe-an', 'na', 4, 68],
  ['thanh-hoa', 'th', 4, 70], ['ninh-binh', 'nb', 4, 72], ['hung-yen', 'hy', 4, 74], ['hai-phong', 'hp', 4, 76], ['bac-ninh', 'bn', 4, 78],
  ['quang-ninh', 'ql', 4, 80], ['lang-son', 'ls', 4, 82], ['cao-bang', 'cb', 4, 84], ['thai-nguyen', 'ty', 4, 86], ['tuyen-quang', 'tq', 4, 88],
  ['lao-cai', 'lc', 4, 90], ['lai-chau', 'lh', 4, 92], ['dien-bien', 'db', 4, 94], ['son-la', 'sl', 4, 96], ['phu-tho', 'pt', 4, 98],
  ['ha-noi', 'hn', 5, 100],
];
const IDX = Object.fromEntries(ROUTE.map((r, i) => [r[0], i]));
const prevOf = (p: string) => ROUTE[IDX[p] - 1]?.[0];
const levelOf = (p: string) => ROUTE[IDX[p]][3];
const linh = (p: string) => `mn-linh-${p}`;

/** Main story quest id of a province (the last one when it has several). */
const MAIN: Record<string, string> = Object.fromEntries(ROUTE.map(([p, c]) => [p, `mn-${c}`]));
MAIN['ca-mau'] = 'mn-cm-4';
MAIN['ho-chi-minh'] = 'mn-sg-2';
MAIN['ha-noi'] = 'mn-hn-3';
const FIRST: Record<string, string> = { ...MAIN, 'ca-mau': 'mn-cm-1', 'ho-chi-minh': 'mn-sg-1', 'ha-noi': 'mn-hn-1' };

const characters = [
  { id: 'an', name: 'Giáo sư An', role: 'Nhà nghiên cứu Pokémon ở Đất Mũi — người đầu tiên đo được mạch nguồn đang yếu đi', npc: 'vn-prof' },
  { id: 'linh', name: 'Linh', role: 'Kỹ sư thủy văn trẻ, bạn đồng hành — mang theo máy đo mạch nước tới từng tỉnh', npc: 'mn-linh' },
  { id: 'khai', name: 'Khải', role: 'Đối thủ cùng xuất phát ở Cà Mau; muốn mạnh lên bằng mọi giá, có lúc theo Bình Minh', npc: 'mn-khai' },
  { id: 'vu', name: 'Tiến sĩ Vũ', role: 'Người đứng đầu Dự án Bình Minh — muốn chặn hạn mặn bằng cách cưỡng chế mạch nguồn', npc: 'mn-vu' },
  { id: 'sau', name: 'Chú Sáu', role: 'Lái ghe ở Đất Mũi; chở cả nhóm theo các dòng sông và biết chuyện con nước từ thời ông nội', npc: 'mn-sau' },
  { id: 'bm', name: 'Kỹ thuật viên Bình Minh', role: 'Người vận hành các trạm cưỡng chế của Dự án Bình Minh' },
];

const chapters: StoryChapter[] = [
  { id: 'mn-0', title: 'Mở đầu — Đất Mũi', regions: ['ca-mau'], quests: ['mn-cm-1', 'mn-cm-2', 'mn-cm-3', 'mn-cm-4'],
    summary: 'Trạm nước Đất Mũi báo con nước lên sai giờ. Rừng tràm U Minh náo loạn, và giữa rừng có một cỗ máy lạ mang dấu Bình Minh.',
    change: 'Bộ khuếch đại ở U Minh đã bị phá, Seviper trở về khu làm tổ. Linh và Chú Sáu lên ghe cùng bạn đi về phía bắc.' },
  { id: 'mn-1', title: 'Hồi I — Dòng nước đổi chiều', regions: ['an-giang', 'can-tho', 'vinh-long', 'tra-vinh', 'ben-tre', 'dong-thap'],
    quests: ['mn-ag', 'mn-ct', 'mn-vl', 'mn-tv', 'mn-bt', 'mn-dt'],
    summary: 'Khắp miền Tây, nước chảy ngược, mặn vào sâu, Pokémon bỏ nơi ở. Các trạm của Bình Minh đang hút mạch nguồn về phía Sài Gòn.',
    change: 'Sáu trạm bơm ở miền Tây đã tắt. Con nước miền Tây trở lại nhịp cũ, và dấu vết dẫn về thành phố.' },
  { id: 'mn-2', title: 'Hồi II — Thành phố của Bình Minh', regions: ['tay-ninh', 'ho-chi-minh', 'dong-nai'], quests: ['mn-tn', 'mn-sg-1', 'mn-sg-2', 'mn-dn'],
    summary: 'Sài Gòn chập điện vì lưới của Bình Minh hút quá tải. Khải nhận lời gia nhập Dự án — anh tin đó là con đường nhanh nhất để mạnh lên.',
    change: 'Magnezone đã hết quá tải, đèn phố sáng lại. Khải đi theo Bình Minh lên Tây Nguyên.' },
  { id: 'mn-3', title: 'Hồi III — Những điểm neo cổ', regions: ['lam-dong', 'khanh-hoa', 'dak-lak', 'gia-lai', 'quang-ngai', 'da-nang', 'hue', 'quang-tri'],
    quests: ['mn-ld', 'mn-kh', 'mn-dl', 'mn-gl', 'mn-qn', 'mn-dg', 'mn-hu', 'mn-qt'],
    summary: 'Mạch nguồn được giữ bởi những điểm neo cổ — đền tháp, thác, núi lửa đã tắt. Bình Minh đang cắm thiết bị vào từng điểm neo. Khải bắt đầu nghi ngờ.',
    change: 'Các điểm neo miền Trung đã được giữ. Khải bị thương ở Trường Sơn và được bạn đưa về; anh im lặng suốt đường ra Bắc.' },
  { id: 'mn-4', title: 'Hồi IV — Hộ vệ thức giấc', regions: ['ha-tinh', 'nghe-an', 'thanh-hoa', 'ninh-binh', 'hung-yen', 'hai-phong', 'bac-ninh', 'quang-ninh', 'lang-son', 'cao-bang', 'thai-nguyen', 'tuyen-quang', 'lao-cai', 'lai-chau', 'dien-bien', 'son-la', 'phu-tho'],
    quests: ['mn-ht', 'mn-na', 'mn-th', 'mn-nb', 'mn-hy', 'mn-hp', 'mn-bn', 'mn-ql', 'mn-ls', 'mn-cb', 'mn-ty', 'mn-tq', 'mn-lc', 'mn-lh', 'mn-db', 'mn-sl', 'mn-pt'],
    summary: 'Mạch nguồn bị kéo căng, các Pokémon hộ vệ cổ thức giấc trong giận dữ. Ở Thanh Hóa, Khải rời Bình Minh. Ở Bắc Ninh, hai người đấu lại một trận sòng phẳng.',
    change: 'Những hộ vệ phía Bắc đã yên. Mọi dòng mạch còn lại đều chảy về một nơi: Thăng Long.' },
  { id: 'mn-5', title: 'Hồi V — Thăng Long', regions: ['ha-noi'], quests: ['mn-hn-1', 'mn-hn-2', 'mn-hn-3'],
    summary: 'Tổng trạm Bình Minh nối thẳng vào Torterra — hộ vệ của đất Thăng Long. Tiến sĩ Vũ đứng đợi ở Cổ Loa.',
    change: 'Lõi cưỡng chế đã vỡ, điểm neo Cổ Loa đứng vững, Torterra tự do. Tiến sĩ Vũ đồng ý biến các trạm cưỡng chế thành trạm quan trắc.' },
  { id: 'mn-6', title: 'Kết — Mạch nước trở về', regions: ['ca-mau'], quests: ['mn-end'],
    summary: 'Trở lại Đất Mũi, nơi mọi chuyện bắt đầu.',
    change: 'Đàn Pokémon đã quay lại rừng tràm. Tiến sĩ Vũ ở lại Đất Mũi làm việc tại trạm quan trắc mới.' },
];

const cutscenes: Cutscene[] = [
  { id: 'mn-c-prologue', title: 'Mạch Nguồn', chapter: 'mn-0', lines: [
    { who: '', text: 'Đất Mũi, cuối mùa khô. Con nước lên sớm hơn lịch của các ngư dân ba tiếng đồng hồ.' },
    { who: 'an', text: 'Cháu có biết vì sao rừng tràm ở đây xanh quanh năm không? Dưới đất có những mạch nước rất cổ — người xưa gọi là mạch nguồn.' },
    { who: 'an', text: 'Mạch nguồn giữ nhịp cho sông, cho rừng, cho cả Pokémon. Mấy tuần nay, máy đo của ta báo nó đang bị kéo về một hướng.' },
    { who: 'an', text: 'Linh — kỹ sư thủy văn — đang ở trạm nước đầu thị trấn. Cháu ra giúp cô ấy một tay nhé.' },
  ] },
  { id: 'mn-c-station', title: 'Trạm nước Đất Mũi', chapter: 'mn-0', lines: [
    { who: 'linh', text: 'Mặn đo được ở rừng đước cao gấp đôi tuần trước. Không phải do trời — có thứ gì đó đang hút nước ngọt đi.' },
    { who: 'khai', text: 'Đo với đếm hoài. Có Pokémon mạnh thì sợ gì nước mặn. Tôi đi trước đây!' },
    { who: 'linh', text: 'Khải lúc nào cũng vậy... Triều sắp lên rồi. Ngư dân báo có Pokémon mắc vào lưới bỏ hoang ngoài bãi.' },
  ] },
  { id: 'mn-c-nets', title: 'Lưới khi triều lên', chapter: 'mn-0', lines: [
    { who: 'sau', text: 'Gỡ xong hết rồi! Bốn chục năm chạy ghe, chú chưa thấy con nước nào lên dữ vậy.' },
    { who: 'sau', text: 'Ông nội chú nói: khi nước U Minh chảy ngược là có người động vào mạch. Mấy hôm nay rừng tràm kêu suốt đêm.' },
    { who: 'linh', text: 'Seviper ở U Minh đang lồng lộn quanh khu làm tổ. Mình phải vào xem.' },
  ] },
  { id: 'mn-c-amp', title: 'Bộ khuếch đại', chapter: 'mn-0', lines: [
    { who: 'linh', text: 'Cỗ máy này rung đúng tần số của mạch nước. Nó làm Seviper tưởng khu làm tổ đang bị tấn công.' },
    { who: 'linh', text: 'Có khắc chữ: "DỰ ÁN BÌNH MINH — TRẠM PHỤ U MINH 03". Còn trạm 01 và 02 ở đâu đó nữa...' },
  ] },
  { id: 'mn-c-depart', title: 'Lên ghe', chapter: 'mn-0', lines: [
    { who: 'an', text: 'Huy hiệu Rừng Tràm — cháu xứng đáng. Ta đã gửi số đo cho các trạm bạn. Mạch nguồn bị kéo về phía bắc, ngang qua khắp miền Tây.' },
    { who: 'an', text: 'Dự án Bình Minh... ta từng biết người đứng đầu nó, Tiến sĩ Vũ. Một người rất giỏi, và rất sợ hạn mặn.' },
    { who: 'sau', text: 'Ghe của chú đi được tới đâu có sông. Lên đi, mấy đứa!' },
    { who: 'linh', text: 'Mình đi cùng bạn. Ở mỗi tỉnh mình sẽ đo mạch nước — bạn lo phần Pokémon nhé.' },
  ] },
  { id: 'mn-c-act1', title: 'Dòng nước đổi chiều', chapter: 'mn-1', lines: [
    { who: '', text: 'Hồi I — Dòng nước đổi chiều.' },
    { who: 'linh', text: 'Ở An Giang, mùa nước nổi về sớm cả tháng. Kênh Vĩnh Tế chảy ngược ra biên giới. Ba trạm bơm lạ mọc lên dọc sông Hậu.' },
  ] },
  { id: 'mn-c-act1-end', title: 'Dấu vết về thành phố', chapter: 'mn-1', lines: [
    { who: 'linh', text: 'Sáu trạm ở miền Tây đều nối dây về một hướng: Sài Gòn. Bình Minh đặt tổng đài ở đó.' },
    { who: 'sau', text: 'Ghe chú chỉ chạy tới Tây Ninh được thôi. Từ đó mấy đứa đi bộ — nhớ ăn uống đầy đủ đó!' },
  ] },
  { id: 'mn-c-act2', title: 'Thành phố của Bình Minh', chapter: 'mn-2', lines: [
    { who: '', text: 'Hồi II — Thành phố của Bình Minh.' },
    { who: 'linh', text: 'Bình Minh tuyển người ở khắp nơi. Họ hứa Pokémon mạnh hơn, máy móc mới, và một miền Tây không bao giờ khô hạn.' },
  ] },
  { id: 'mn-c-khai-joins', title: 'Khải chọn Bình Minh', chapter: 'mn-2', lines: [
    { who: 'khai', text: 'Bình Minh đưa tôi đi khắp nơi, cho Pokémon của tôi tập với thiết bị tốt nhất. Còn cậu có gì? Một cái máy đo nước?' },
    { who: 'linh', text: 'Khải, trạm của họ làm nước chảy ngược cả miền Tây!' },
    { who: 'khai', text: 'Tiến sĩ Vũ nói đó chỉ là giai đoạn thử. Khi xong, cả đồng bằng sẽ có nước ngọt quanh năm. Tôi chọn phe làm được việc lớn.' },
  ] },
  { id: 'mn-c-overload', title: 'Magnezone quá tải', chapter: 'mn-2', lines: [
    { who: 'linh', text: 'Trạm biến áp tắt rồi — Magnezone không còn bị hút điện nữa. Đèn phố sáng lại kìa!' },
    { who: 'bm', text: 'Các người không hiểu đâu. Tiến sĩ Vũ đã lên Tây Nguyên. Ở đó có những điểm neo cổ — khi nối được chúng, sẽ không ai ngăn nổi Dự án.' },
  ] },
  { id: 'mn-c-act3', title: 'Những điểm neo cổ', chapter: 'mn-3', lines: [
    { who: '', text: 'Hồi III — Những điểm neo cổ.' },
    { who: 'an', text: '(qua điện thoại) Mạch nguồn không chảy lung tung đâu, cháu. Nó được giữ bởi các điểm neo: đền tháp, thác lớn, núi lửa đã ngủ. Người xưa xây đền ngay trên đó.' },
    { who: 'linh', text: 'Vậy Bình Minh muốn cắm thiết bị vào các điểm neo... để nắm cả mạch nguồn cùng lúc.' },
  ] },
  { id: 'mn-c-hue', title: 'Gặp Tiến sĩ Vũ', chapter: 'mn-3', lines: [
    { who: 'vu', text: 'Cháu là người đã tắt các trạm của ta suốt từ Cà Mau. Ta không giận. Ta chỉ muốn cháu xem số liệu này.' },
    { who: 'vu', text: 'Năm năm nữa, nước mặn sẽ vào tới Cần Thơ. Ta không thể ngồi chờ. Nếu điểm neo Huế cho ta dữ liệu, ta sẽ tính được cách hút nhẹ hơn.' },
    { who: 'linh', text: 'Dữ liệu điểm neo là thứ duy nhất Giáo sư An có để chứng minh trạm của ông gây hại...' },
  ] },
  { id: 'mn-c-khai-hurt', title: 'Khải ở Trường Sơn', chapter: 'mn-3', lines: [
    { who: 'khai', text: 'Thiết bị phát nổ khi Noivern lao vào... tôi đã bảo họ dừng lại. Họ không nghe.' },
    { who: 'khai', text: 'Cảm ơn... vì đã quay lại đón. Tôi không nghĩ cậu sẽ làm vậy.' },
    { who: 'linh', text: 'Bạn ấy cần nghỉ. Mình sẽ nhắn Chú Sáu đưa Khải về Đông Hà.' },
  ] },
  { id: 'mn-c-act4', title: 'Hộ vệ thức giấc', chapter: 'mn-4', lines: [
    { who: '', text: 'Hồi IV — Hộ vệ thức giấc.' },
    { who: 'linh', text: 'Mạch nguồn bị kéo căng tới mức các Pokémon hộ vệ cổ thức dậy. Chúng không ác — chúng đang bảo vệ đất của mình.' },
  ] },
  { id: 'mn-c-khai-leaves', title: 'Khải rời Bình Minh', chapter: 'mn-4', lines: [
    { who: 'khai', text: 'Suối cá thần Cẩm Lương cạn mất một nửa. Bình Minh gọi đó là "thiệt hại chấp nhận được".' },
    { who: 'khai', text: 'Tôi trả lại thẻ rồi. Không phải vì cậu đúng — vì tôi đã thấy tận mắt.' },
    { who: 'khai', text: 'Nhưng đừng tưởng tôi thôi làm đối thủ của cậu. Ở Bắc Ninh, mình đấu lại. Lần này không có máy móc gì hết.' },
  ] },
  { id: 'mn-c-rematch', title: 'Trận đấu sòng phẳng', chapter: 'mn-4', lines: [
    { who: 'khai', text: 'Thua thật rồi... nhưng sao thấy nhẹ người ghê.' },
    { who: 'khai', text: 'Tôi sẽ ra Hà Nội trước. Tôi biết đường vào tổng trạm — coi như trả nợ cho cậu.' },
  ] },
  { id: 'mn-c-act5', title: 'Thăng Long', chapter: 'mn-5', lines: [
    { who: '', text: 'Hồi V — Thăng Long.' },
    { who: 'linh', text: 'Mọi sợi dây Bình Minh đều chạy về Cổ Loa. Và ở đó... máy đo của mình đọc được nhịp tim của một Pokémon khổng lồ.' },
    { who: 'khai', text: 'Torterra. Họ nối nó vào tổng trạm. Nếu nó gục, điểm neo Cổ Loa vỡ — và cả mạch nguồn sẽ chảy về tay Bình Minh.' },
  ] },
  { id: 'mn-c-vu', title: 'Tiến sĩ Vũ', chapter: 'mn-5', lines: [
    { who: 'vu', text: 'Ta đã muốn cứu đồng bằng. Ta đã đo mọi thứ — trừ những gì mình đánh mất trên đường đi.' },
    { who: 'vu', text: 'Lõi cưỡng chế không còn nghe lệnh ta nữa. Nếu các cháu phá được nó, ta sẽ giúp giữ điểm neo. Ta nợ Torterra điều đó.' },
  ] },
  { id: 'mn-c-finale', title: 'Mạch nguồn được giải phóng', chapter: 'mn-5', lines: [
    { who: '', text: 'Những sợi cáp tuột khỏi mai Torterra. Cây cổ thụ trên lưng nó rung lên, rễ cắm sâu xuống điểm neo Cổ Loa.' },
    { who: 'linh', text: 'Mạch nguồn... đang chảy lại theo nhịp cũ. Từ Hà Nội xuống tới tận Cà Mau.' },
    { who: 'vu', text: 'Các trạm cưỡng chế sẽ thành trạm quan trắc. Ta sẽ đo, sẽ báo — và sẽ không bao giờ ép mạch nguồn nữa.' },
    { who: 'khai', text: 'Huy hiệu Thăng Long... cậu xứng đáng. Lần sau gặp lại, tôi sẽ thắng.' },
  ] },
  { id: 'mn-c-ending', title: 'Mạch nước trở về', chapter: 'mn-6', lines: [
    { who: '', text: 'Đất Mũi, đầu mùa mưa. Con nước lên đúng giờ.' },
    { who: 'an', text: 'Cháu nghe không? Rừng tràm không còn kêu đêm nữa. Đàn Pokémon đã về lại U Minh — cả những con đã bỏ đi từ mùa khô.' },
    { who: 'sau', text: 'Ghe chú vẫn ở bến, khi nào muốn đi đâu cứ gọi.' },
    { who: 'linh', text: 'Mình sẽ ở lại trạm nước Đất Mũi một thời gian. Còn bạn — cả đất nước vẫn còn rất nhiều Pokémon chưa gặp.' },
    { who: '', text: 'Hết. (Hậu truyện: Tiến sĩ Vũ đang làm việc ở trạm quan trắc mới cạnh bến ghe.)' },
  ] },
];

// ───────────────────────────── per-province stages ─────────────────────────────

interface Stage {
  p: string;
  title: string;
  /** Linh explains the local problem (quest offer) */
  offer: string[];
  /** what to explore before the encounter (area id) */
  explore?: string;
  exploreText?: string;
  enc?: { kind: 'hold' | 'destroy' | 'escort'; text: string; at: string; dx?: number; dy?: number; seconds?: number; species?: string[];
    device?: { name: string; species: string; hpMult?: number }; npc?: { name: string; sprite: string; look?: string; from: string; fdx?: number; fdy?: number } };
  /** objectives inserted before the encounter (trainers, talks…) */
  extra?: ObjectiveIn[];
  done: string[];
  /** what changes in the province afterwards (Linh's idle lines once done are not shown: she has left) */
  cutscene?: { start?: string; complete?: string };
  rewards?: Record<string, number>;
}

const PUMP = { name: 'Trạm bơm cưỡng chế Bình Minh', species: 'klinklang' };
const AMP = { name: 'Bộ khuếch đại Bình Minh', species: 'bronzong' };
const SPIKE = { name: 'Cọc nối điểm neo Bình Minh', species: 'probopass' };

const STAGES: Stage[] = [
  // ── Hồi I: miền Tây ──
  { p: 'an-giang', title: 'Kênh Vĩnh Tế chảy ngược', cutscene: { start: 'mn-c-act1' },
    offer: ['Mùa nước nổi về sớm cả tháng, nước kênh chảy ngược ra phía biên giới.', 'Mình cắm cọc đo ở đồng nước nổi — bạn giữ cho Pokémon hoảng loạn đừng phá cọc trong lúc máy đang đo nhé.'],
    explore: 'ag-wetland', exploreText: 'Tới Đồng Nước Nổi',
    enc: { kind: 'hold', text: 'Giữ cọc đo dòng chảy', at: 'area:ag-wetland', seconds: 40, species: ['lotad', 'buizel', 'floatzel'] },
    done: ['Số đo rõ rồi: có trạm bơm ở hạ nguồn hút nước ngược lên. Mùa nước nổi sẽ về đúng lúc nếu tắt được nó.', 'Đồng nước nổi yên lại rồi, cá linh đang quay về.'] },
  { p: 'can-tho', title: 'Trạm bơm Cồn Sơn',
    offer: ['Chợ nổi Cái Răng vắng ghe vì nước sông Hậu rút bất thường mỗi sáng.', 'Có một trạm bơm mọc lên gần Cồn Sơn mà không ai cấp phép. Mình đi phá nó.'],
    explore: 'ct-con-son', exploreText: 'Tới Cồn Sơn',
    enc: { kind: 'destroy', text: 'Phá trạm bơm cưỡng chế', at: 'area:ct-con-son', device: PUMP, species: ['wooper', 'lombre', 'quagsire'] },
    done: ['Trạm bơm tắt rồi! Ghe đã vào chợ nổi lại được.', 'Trên vỏ trạm có số hiệu "BM-HẬU-02". Họ đánh số theo từng dòng sông.'] },
  { p: 'vinh-long', title: 'Lò gạch quá nhiệt',
    offer: ['Nước rút khỏi kênh Mang Thít nên lò gạch không còn hơi ẩm làm mát. Slugma và Numel kéo về lò cả bầy, quá nhiệt cả rồi.', 'Bạn giữ khu lò trong lúc mình mở cửa cống cho nước vào lại nhé.'],
    explore: 'vl-mang-thit', exploreText: 'Tới lò gạch Mang Thít',
    enc: { kind: 'hold', text: 'Giữ khu lò trong lúc mở cống', at: 'wp:wp-vl-kiln', dx: 3, seconds: 45, species: ['slugma', 'numel', 'magcargo'] },
    done: ['Cống mở rồi, nước đã vào kênh. Lò gạch nguội dần — các ông thợ gốm mừng lắm.'] },
  { p: 'tra-vinh', title: 'Cột đo mặn Ba Động',
    offer: ['Đàn cò ở Chùa Hang bỏ đi hết. Người ta thấy một cột máy của Bình Minh phát tiếng rít ngoài biển Ba Động.', 'Tiếng rít ấy làm cò hoảng. Mình phải phá nó.'],
    explore: 'tv-ba-dong', exploreText: 'Tới biển Ba Động',
    enc: { kind: 'destroy', text: 'Phá cột phát sóng', at: 'area:tv-ba-dong', device: { name: 'Cột phát sóng Bình Minh', species: 'bronzong' }, species: ['wingull', 'pelipper', 'kingler'] },
    done: ['Im hẳn rồi. Chiều nay đàn cò sẽ về lại Chùa Hang thôi.'] },
  { p: 'ben-tre', title: 'Bé lạc trong rừng tràm',
    offer: ['Nước mặn vào sâu làm dừa chết khô, nhiều nhà phải dời đi. Một bé trong làng kẹo dừa đi tìm Pokémon của mình rồi lạc vào rừng tràm.', 'Bạn vào đưa bé về thị trấn giúp mình — đi chậm thôi, bé sợ Pokémon hoang lắm.'],
    enc: { kind: 'escort', text: 'Đưa bé Na về thị trấn', at: 'wp:wp-ben-tre-center', dx: 2, npc: { name: 'Bé Na', sprite: 'girl', from: 'area:bt-forest' } },
    done: ['Bé Na về tới nhà rồi! Mẹ bé nói vườn dừa nhà bé đã được ngọt lại từ khi trạm ở Ba Động tắt.'] },
  { p: 'dong-thap', title: 'Sếu không về Tràm Chim', cutscene: { complete: 'mn-c-act1-end' },
    offer: ['Đàn sếu đầu đỏ năm nay không về Tràm Chim. Đất ngập khô sớm, Croagunk và Toxicroak tràn lên bãi nghỉ của sếu.', 'Mình mở lại đập tràn — bạn giữ bãi trong lúc nước vào nhé.'],
    explore: 'dt-tramchim', exploreText: 'Tới Tràm Chim',
    enc: { kind: 'hold', text: 'Giữ bãi nghỉ của sếu', at: 'area:dt-tramchim', seconds: 45, species: ['croagunk', 'marshtomp', 'toxicroak'] },
    done: ['Nước đã vào đầy bãi. Mình thấy hai con sếu đang lượn trên đầu kìa!'] },
  // ── Hồi II ──
  { p: 'tay-ninh', title: 'Ăng-ten trên Núi Bà', cutscene: { start: 'mn-c-act2' },
    offer: ['Đỉnh Núi Bà Đen có một ăng-ten lạ dò mạch nguồn. Golett trên núi cứ đêm là đi lang thang xuống chân núi.', 'Lên núi phá nó đi, mình đo được nó đang gửi tín hiệu về Sài Gòn.'],
    explore: 'tn-baden', exploreText: 'Lên Núi Bà Đen',
    enc: { kind: 'destroy', text: 'Phá ăng-ten dò mạch', at: 'area:tn-baden', device: { name: 'Ăng-ten dò mạch Bình Minh', species: 'bronzong' }, species: ['golett', 'baltoy', 'claydol'] },
    done: ['Tín hiệu tắt rồi. Golett đã về lại hang đá.', 'Nhưng Bình Minh đang tuyển người ở Sài Gòn... mình nghe nói Khải cũng tới đó.'] },
  { p: 'dong-nai', title: 'Bò tót bỏ rừng',
    offer: ['Đàn bò tót Cát Tiên bỏ rừng xuống ruộng vì suối trong rừng cạn. Houndour theo xuống săn bê con.', 'Bạn giữ bãi cỏ ven suối trong lúc kiểm lâm lùa đàn về.'],
    explore: 'dn-cattien', exploreText: 'Vào Cát Tiên',
    enc: { kind: 'hold', text: 'Giữ bãi cỏ cho đàn bò tót', at: 'area:dn-cattien', seconds: 50, species: ['houndour', 'mightyena', 'houndoom'] },
    done: ['Đàn đã về rừng. Từ khi trạm Sài Gòn tắt, suối Cát Tiên có nước lại rồi.', 'Mình nhận được tin từ Giáo sư An — Bình Minh đã lên Tây Nguyên.'] },
  // ── Hồi III: điểm neo cổ ──
  { p: 'lam-dong', title: 'Điểm neo Langbiang', cutscene: { start: 'mn-c-act3' },
    offer: ['Hoa Đà Lạt héo trước Tết — đất mất ẩm từ dưới sâu. Máy đo chỉ thẳng lên đỉnh Langbiang: có một điểm neo cổ ở đó.', 'Bình Minh đang cắm cọc vào. Bạn giữ điểm neo, mình tháo cọc.'],
    explore: 'ld-langbiang', exploreText: 'Lên núi Langbiang',
    enc: { kind: 'hold', text: 'Giữ điểm neo Langbiang', at: 'area:ld-langbiang', seconds: 50, species: ['roselia', 'roserade', 'floette'] },
    done: ['Cọc tháo xong. Đất quanh đây ẩm lại rồi, hoa sẽ kịp nở Tết.'] },
  { p: 'khanh-hoa', title: 'Bơm đáy vịnh Hòn Mun',
    offer: ['Xoáy nước lạ ở Hòn Mun là do một trạm bơm đặt sát bờ, hút nước theo mạch nguồn ngoài khơi.', 'Clauncher và Corsola bị xoáy nước hất lên bờ, hoảng loạn lắm. Cẩn thận!'],
    explore: 'kh-bay', exploreText: 'Tới vịnh Nha Trang',
    enc: { kind: 'destroy', text: 'Phá trạm bơm ven vịnh', at: 'area:kh-bay', device: PUMP, species: ['clauncher', 'corsola', 'clawitzer'] },
    done: ['Xoáy nước tan rồi. Rùa biển sẽ lên được bãi đẻ.'] },
  { p: 'dak-lak', title: 'Già làng lạc giữa Yok Đôn',
    offer: ['Hồ Lắk cạn tới mức voi phải đi xa tìm nước. Già làng Y Thuôn vào rừng Yok Đôn tìm đàn Donphan rồi không về.', 'Già biết chỗ điểm neo của buôn — bạn tìm và đưa già về Buôn Ma Thuột giúp mình.'],
    enc: { kind: 'escort', text: 'Đưa Già làng Y Thuôn về thành phố', at: 'wp:wp-dak-lak-center', dx: 2, npc: { name: 'Già làng Y Thuôn', sprite: 'elder', from: 'area:dl-yokdon' } },
    done: ['Già kể điểm neo của buôn nằm dưới thác Dray Nur — Bình Minh chưa tìm ra nó. Mình sẽ báo Giáo sư An.'] },
  { p: 'gia-lai', title: 'Miệng núi lửa Chư Đăng Ya',
    offer: ['Núi lửa Chư Đăng Ya đã ngủ cả triệu năm — giờ lòng đất nóng lên. Bình Minh đặt trạm ngay miệng núi.', 'Có một kỹ thuật viên Bình Minh canh trạm. Đánh bại anh ta, rồi giữ miệng núi trong lúc mình ngắt điện.'],
    explore: 'gl-volcano', exploreText: 'Tới núi lửa Chư Đăng Ya',
    extra: [{ type: 'trainer', target: 'mn-bm-gia-lai', text: 'Đánh bại kỹ thuật viên Bình Minh' }],
    enc: { kind: 'hold', text: 'Giữ miệng núi lửa', at: 'area:gl-volcano', seconds: 50, species: ['slugma', 'magmar', 'torkoal'] },
    done: ['Điện đã ngắt. Lòng núi nguội dần. Anh kỹ thuật viên nói Khải được giao trông trạm ở Trường Sơn...'] },
  { p: 'quang-ngai', title: 'Phao hút ngoài Lý Sơn',
    offer: ['Ngư dân Lý Sơn kể có một phao máy lớn trôi vào gần bờ, đêm nào cũng phát sáng. Binacle và Frillish bám đầy quanh nó.', 'Đó là phao hút mạch của Bình Minh. Phá nó đi.'],
    explore: 'qn-lyson', exploreText: 'Tới biển Lý Sơn',
    enc: { kind: 'destroy', text: 'Phá phao hút mạch', at: 'area:qn-lyson', device: { name: 'Phao hút mạch Bình Minh', species: 'klinklang' }, species: ['binacle', 'frillish', 'jellicent'] },
    done: ['Phao chìm rồi. Ruộng tỏi Lý Sơn sẽ không còn bị mặn nữa.'] },
  { p: 'da-nang', title: 'Điểm neo Sơn Trà',
    offer: ['Bán đảo Sơn Trà là điểm neo lớn của miền Trung. Bình Minh cắm cọc ở sườn núi, Gabite và Shelgon tràn xuống từ hang.', 'Bạn giữ điểm neo, mình đóng van.'],
    explore: 'dg-sontra', exploreText: 'Lên bán đảo Sơn Trà',
    enc: { kind: 'hold', text: 'Giữ điểm neo Sơn Trà', at: 'area:dg-sontra', seconds: 55, species: ['gabite', 'shelgon', 'druddigon'] },
    done: ['Van đã đóng. Mình đọc được trên cọc: "Điểm neo kế tiếp: Đại Nội". Tiến sĩ Vũ đang ở Huế.'] },
  { p: 'hue', title: 'Dữ liệu điểm neo Đại Nội', cutscene: { start: 'mn-c-hue' },
    offer: ['Tiến sĩ Vũ đang đợi ở Đại Nội. Ông ấy muốn dữ liệu điểm neo mình đo được.', 'Mình nói trước: chọn đưa hay giữ dữ liệu sẽ thay đổi những gì xảy ra về sau. Bạn quyết đi — mình tin bạn.'],
    explore: 'hu-dainoi', exploreText: 'Vào Hoàng thành Đại Nội',
    extra: [{ type: 'choose', target: 'mn-vu-hue', text: 'Quyết định với Tiến sĩ Vũ: đưa hay giữ dữ liệu điểm neo', options: [
      { id: 'dua', label: 'Đưa dữ liệu cho Tiến sĩ Vũ (ông sẽ hút nhẹ tay hơn)', rewards: { items: { 'rare-candy': 1 }, flags: ['mn:vu-trust'] },
        reply: ['Cảm ơn cháu. Ta hứa sẽ giảm áp các trạm. Ta không hứa được là đủ.'] },
      { id: 'giu', label: 'Giữ dữ liệu cho Giáo sư An (bằng chứng trạm gây hại)', rewards: { items: { ultraball: 3 }, flags: ['mn:an-trust'] },
        reply: ['Ta hiểu. Cháu giống An hồi trẻ — cố chấp và đúng nhiều hơn sai.'] },
    ] }],
    enc: { kind: 'hold', text: 'Giữ điểm neo Đại Nội', at: 'area:hu-dainoi', seconds: 55, species: ['honedge', 'doublade', 'dusclops'] },
    done: ['Điểm neo Đại Nội đứng vững. Dù bạn chọn gì, Tiến sĩ Vũ đã đi rồi — về hướng Trường Sơn.'] },
  { p: 'quang-tri', title: 'Khải ở Trường Sơn', cutscene: { complete: 'mn-c-khai-hurt' },
    offer: ['Có tiếng nổ ở trạm Bình Minh trong rừng Phong Nha. Người ta thấy một cậu trai bị thương ngồi ở cửa hang.', 'Mình đoán là Khải. Đưa cậu ấy về thành phố đi — bạn đi trước dẹp đường, cậu ấy theo sau.'],
    enc: { kind: 'escort', text: 'Đưa Khải về Đồng Hới', at: 'wp:wp-quang-tri-center', dx: 2, npc: { name: 'Khải (bị thương)', sprite: 'youngster', look: 'mn-khai', from: 'area:qt-phongnha' } },
    done: ['Khải ổn rồi, chỉ bị trầy. Cậu ấy không nói gì nhiều... nhưng đã hỏi mình về số đo ở Cần Thơ.'] },
  // ── Hồi IV: hộ vệ thức giấc ──
  { p: 'ha-tinh', title: 'Braviary trên Hồng Lĩnh', cutscene: { start: 'mn-c-act4' },
    offer: ['Hộ vệ Hồng Lĩnh là Braviary — nó đã thức giấc và đuổi hết người lên chùa Hương Tích.', 'Nó không ác, chỉ bảo vệ điểm neo. Bạn giữ chân núi trong lúc mình gỡ cọc Bình Minh.'],
    explore: 'ht-honglinh', exploreText: 'Lên núi Hồng Lĩnh',
    enc: { kind: 'hold', text: 'Giữ chân núi Hồng Lĩnh', at: 'area:ht-honglinh', seconds: 55, species: ['rufflet', 'staraptor', 'braviary'] },
    done: ['Gỡ xong. Braviary bay về đỉnh rồi, không còn sà xuống nữa.'] },
  { p: 'nghe-an', title: 'Rừng Pù Mát mất tiếng chim',
    offer: ['Rừng Pù Mát im phăng phắc. Bình Minh đặt một bộ khuếch đại giữa rừng, còn để người canh.', 'Bạn biết phải làm gì rồi đó.'],
    explore: 'na-pumat', exploreText: 'Vào rừng Pù Mát',
    extra: [{ type: 'trainer', target: 'mn-bm-nghe-an', text: 'Đánh bại kỹ thuật viên Bình Minh' }],
    enc: { kind: 'destroy', text: 'Phá bộ khuếch đại', at: 'area:na-pumat', device: AMP, species: ['dartrix', 'noctowl', 'honchkrow'] },
    done: ['Chim đã hót lại rồi. Anh kỹ thuật viên nói Khải đang ở Thanh Hóa — và cãi nhau to với cấp trên.'] },
  { p: 'thanh-hoa', title: 'Suối cá thần cạn nước', cutscene: { complete: 'mn-c-khai-leaves' },
    offer: ['Suối cá thần Cẩm Lương cạn một nửa. Khải đang ở đó — lần này cậu ấy nhờ chúng ta.'],
    explore: 'th-camluong', exploreText: 'Tới suối cá thần Cẩm Lương',
    extra: [{ type: 'talk', target: 'mn-khai-thanh-hoa', text: 'Nói chuyện với Khải ở suối cá thần' }],
    enc: { kind: 'hold', text: 'Cùng Khải giữ suối cá thần', at: 'area:th-camluong', seconds: 55, species: ['psyduck', 'golduck', 'politoed'] },
    done: ['Suối đầy nước lại rồi, đàn cá thần quay về hang. Khải... có vẻ vui hơn mọi khi.'] },
  { p: 'ninh-binh', title: 'Người lái đò Tràng An',
    offer: ['Nước Tràng An xuống thấp tới mức đò mắc cạn trong hang. Cô Tâm lái đò bị kẹt lại trong hang suốt từ sáng.', 'Bạn vào đưa cô ra rồi về Hoa Lư.'],
    enc: { kind: 'escort', text: 'Đưa cô lái đò về Hoa Lư', at: 'wp:wp-ninh-binh-center', dx: 2, npc: { name: 'Cô lái đò Tâm', sprite: 'girl', from: 'area:nb-trangan' } },
    done: ['Cô Tâm về rồi. Cô nói nước trong hang đang dâng lại — các trạm phía Bắc đang yếu đi nhờ chúng ta.'] },
  { p: 'hung-yen', title: 'Bộ khuếch đại vườn nhãn',
    offer: ['Nhãn lồng Hưng Yên rụng non cả vườn. Steenee và Vespiquen nổi giận vì một bộ khuếch đại giấu trong vườn.'],
    explore: 'hy-longan', exploreText: 'Tới vườn nhãn lồng',
    enc: { kind: 'destroy', text: 'Phá bộ khuếch đại', at: 'area:hy-longan', device: AMP, species: ['steenee', 'beedrill', 'vespiquen'] },
    done: ['Vườn nhãn yên rồi. Bà con nói mùa sau sẽ mời bạn ăn nhãn.'] },
  { p: 'hai-phong', title: 'Cửa sông Cát Bà',
    offer: ['Ở Cát Bà, chim biển bị một trạm hút làm rối hướng bay, Talonflame sà xuống tấn công cả thuyền.', 'Giữ bến trong lúc mình tắt trạm từ xa.'],
    explore: 'hp-catba', exploreText: 'Ra đảo Cát Bà',
    enc: { kind: 'hold', text: 'Giữ bến Cát Bà', at: 'area:hp-catba', seconds: 55, species: ['fletchinder', 'pelipper', 'talonflame'] },
    done: ['Trạm đã tắt. Đàn chim biển bay về hướng vịnh rồi.'] },
  { p: 'bac-ninh', title: 'Tái đấu ở Đồi Lim', cutscene: { complete: 'mn-c-rematch' },
    offer: ['Khải đợi bạn ở Đồi Lim. Lần này không có thiết bị Bình Minh, không có gì hết — chỉ Pokémon của hai người.'],
    explore: 'bn-lim', exploreText: 'Tới Đồi Lim',
    extra: [{ type: 'trainer', target: 'mn-khai-bac-ninh', text: 'Tái đấu với Khải' }],
    done: ['Trận đấu đẹp lắm. Cả làng quan họ ra xem, còn hát tặng hai người một bài.'] },
  { p: 'quang-ninh', title: 'Trạm dưới mỏ Cẩm Phả',
    offer: ['Bình Minh đặt trạm bơm dưới mỏ than Cẩm Phả để hút mạch ngầm của vịnh. Có người canh.', 'Đánh bại họ rồi phá trạm.'],
    explore: 'ql-campha', exploreText: 'Tới mỏ than Cẩm Phả',
    extra: [{ type: 'trainer', target: 'mn-bm-quang-ninh', text: 'Đánh bại trưởng ca Bình Minh' }],
    enc: { kind: 'destroy', text: 'Phá trạm bơm dưới mỏ', at: 'area:ql-campha', device: PUMP, species: ['golem', 'probopass', 'dragonair'] },
    done: ['Trạm sập rồi. Nước vịnh Hạ Long sẽ không còn bị hút xuống lòng mỏ.'] },
  { p: 'lang-son', title: 'Ải Chi Lăng',
    offer: ['Hộ vệ đá Gigalith đã thức giấc ở Mẫu Sơn. Ở ải Chi Lăng, Boldore lăn xuống chặn đường.', 'Giữ ải trong lúc mình nhổ cọc Bình Minh.'],
    explore: 'ls-chilang', exploreText: 'Tới ải Chi Lăng',
    enc: { kind: 'hold', text: 'Giữ ải Chi Lăng', at: 'area:ls-chilang', seconds: 55, species: ['boldore', 'steelix', 'gigalith'] },
    done: ['Đá ngừng lăn rồi. Gigalith đã ngủ lại trên Mẫu Sơn.'] },
  { p: 'cao-bang', title: 'Người lạc ở Ngườm Ngao',
    offer: ['Một nhà nghiên cứu hang động bị kẹt trong động Ngườm Ngao vì nước ngầm dâng bất thường.', 'Đưa chú ấy về thành phố an toàn nhé.'],
    enc: { kind: 'escort', text: 'Đưa nhà nghiên cứu về thành phố', at: 'wp:wp-cao-bang-center', dx: 2, npc: { name: 'Chú nghiên cứu hang Bảo', sprite: 'hiker', from: 'area:cb-nguomngao' } },
    done: ['Chú Bảo kể nước trong động dâng theo nhịp — như có ai bơm từ xa. Thêm một trạm nữa ở phía Tây.'] },
  { p: 'thai-nguyen', title: 'Đồi chè Tân Cương',
    offer: ['Chè Tân Cương héo vàng. Có một bộ khuếch đại giữa đồi chè hút ẩm của đất.', 'Haunter tụ lại quanh nó mỗi đêm — chắc vì sóng của máy.'],
    explore: 'ty-tancuong', exploreText: 'Tới đồi chè Tân Cương',
    enc: { kind: 'destroy', text: 'Phá bộ khuếch đại', at: 'area:ty-tancuong', device: AMP, species: ['haunter', 'banette', 'polteageist'] },
    done: ['Đồi chè xanh lại rồi. Mình pha cho bạn một ấm chè đây.'] },
  { p: 'tuyen-quang', title: 'Cây đa Tân Trào',
    offer: ['Mudsdale từ núi đá Đồng Văn kéo xuống Tân Trào vì suối đầu nguồn cạn.', 'Giữ khu cây đa trong lúc kiểm lâm dẫn đàn về.'],
    explore: 'tq-tantrao', exploreText: 'Tới Tân Trào',
    enc: { kind: 'hold', text: 'Giữ khu cây đa Tân Trào', at: 'area:tq-tantrao', seconds: 55, species: ['mudbray', 'rhyhorn', 'mudsdale'] },
    done: ['Đàn đã về núi. Suối đầu nguồn chảy lại rồi.'] },
  { p: 'lao-cai', title: 'Người leo núi trên Fansipan',
    offer: ['Một người leo núi bị kẹt gần đỉnh Fansipan khi mây tuyết kéo tới bất thường.', 'Đưa anh ấy xuống Sa Pa — đường trơn, đi chậm thôi.'],
    enc: { kind: 'escort', text: 'Đưa người leo núi về Sa Pa', at: 'wp:wp-lao-cai-center', dx: 2, npc: { name: 'Anh leo núi Dũng', sprite: 'hiker', from: 'area:lc-fansipan' } },
    done: ['Anh Dũng an toàn rồi. Anh chụp được ảnh một cái cọc Bình Minh trên đỉnh Bạch Mộc — Lai Châu.'] },
  { p: 'lai-chau', title: 'Cọc trên đỉnh Bạch Mộc',
    offer: ['Đúng như ảnh anh Dũng chụp: Bình Minh cắm cọc nối điểm neo ngay trên biển mây Bạch Mộc.'],
    explore: 'lh-bachmoc', exploreText: 'Lên đỉnh Bạch Mộc Lương Tử',
    enc: { kind: 'destroy', text: 'Phá cọc nối điểm neo', at: 'area:lh-bachmoc', device: SPIKE, species: ['swablu', 'skarmory', 'altaria'] },
    done: ['Biển mây trở lại rồi — đẹp quá. Còn hai trạm nữa trước khi về Thủ đô.'] },
  { p: 'dien-bien', title: 'Đèo Pha Đin',
    offer: ['Aggron, hộ vệ đá của đèo Pha Đin, đã thức giấc. Lairon chặn ngang đèo.', 'Giữ đèo trong lúc mình gỡ cọc.'],
    explore: 'db-phadin', exploreText: 'Tới đèo Pha Đin',
    enc: { kind: 'hold', text: 'Giữ đèo Pha Đin', at: 'area:db-phadin', seconds: 60, species: ['lairon', 'durant', 'aggron'] },
    done: ['Đèo thông rồi. Aggron đứng nhìn bọn mình một lúc rồi quay vào núi.'] },
  { p: 'son-la', title: 'Sống lưng khủng long',
    offer: ['Ở Tà Xùa, Bình Minh đào bới tìm hóa thạch để làm lõi năng lượng. Tyrunt và Amaura sống lại giữa đường mòn.', 'Phá cái máy đào đi!'],
    explore: 'sl-taxua', exploreText: 'Tới Tà Xùa',
    enc: { kind: 'destroy', text: 'Phá máy đào hóa thạch', at: 'area:sl-taxua', device: { name: 'Máy đào lõi Bình Minh', species: 'klinklang' }, species: ['tyrunt', 'amaura', 'aerodactyl'] },
    done: ['Máy đã hỏng. Mình nhận tin từ Khải: tổng trạm ở Cổ Loa, Hà Nội.'] },
  { p: 'phu-tho', title: 'Ngã ba Bạch Hạc',
    offer: ['Ở ngã ba Bạch Hạc, ba dòng sông gặp nhau — điểm neo cuối trước Thăng Long. Dragonair từ sông Lô trườn lên bờ.', 'Giữ ngã ba thật lâu, mình cần đo toàn bộ mạch về Hà Nội.'],
    explore: 'pt-bachhac', exploreText: 'Tới ngã ba Bạch Hạc',
    enc: { kind: 'hold', text: 'Giữ ngã ba Bạch Hạc', at: 'area:pt-bachhac', seconds: 60, species: ['dragonair', 'golduck', 'dragonite'] },
    done: ['Đo xong. Mọi dòng mạch đều chảy về Cổ Loa. Mình đi thôi — Hà Nội đang đợi.'] },
];

// ───────────────────────────── assembling ─────────────────────────────

const quests: QuestIn[] = [];
const npcs: NpcIn[] = [];
const trainers: TrainerIn[] = [];

const reward = (lv: number, extra: Record<string, number> = {}) => ({ exp: 200 + lv * 40, items: { superpotion: 2, ...(lv >= 40 ? { ultraball: 2 } : { greatball: 3 }), ...extra } });

/** Linh in every province: she arrives once the previous badge is won and leaves when the stage is done. */
for (const [p, , , lv] of ROUTE) {
  const prev = prevOf(p);
  npcs.push({
    id: linh(p), name: 'Linh', sprite: 'girl', look: 'mn-linh', at: P(p, p === 'ca-mau' ? 'wp:wp-ca-mau-center' : `wp:wp-${p}-center`, p === 'ca-mau' ? -5 : 3, p === 'ca-mau' ? 2 : 3),
    showIf: prev ? [`badge:${prev}`] : undefined, hideIf: [`mn:done:${p}`],
    lines: prev
      ? ['Máy đo của mình đã sẵn sàng. Nếu còn việc dang dở ở tỉnh trước, bạn quay lại xong đã nhé — mạch nguồn nối liền, bỏ dở một chỗ là cả dòng lệch.', `(Gợi ý: cấp tham khảo ở đây khoảng Lv ${Math.max(1, lv - 8)}–${lv}.)`]
      : ['Mình là Linh, kỹ sư ở trạm nước Đất Mũi. Giáo sư An nói bạn sẽ ghé!'],
  });
  void lv;
}

for (const s of STAGES) {
  const lv = levelOf(s.p), prev = prevOf(s.p)!, id = MAIN[s.p];
  const objs: ObjectiveIn[] = [];
  if (s.explore) objs.push({ type: 'explore', target: s.explore, text: s.exploreText ?? 'Tới nơi cần đến' });
  objs.push(...(s.extra ?? []));
  if (s.enc) {
    const e = s.enc;
    const enc: EncounterIn = { kind: e.kind, at: P(s.p, e.at, e.dx, e.dy), radius: e.kind === 'escort' ? 3 : 4 };
    if (e.kind === 'hold') { enc.seconds = e.seconds ?? 45; enc.every = 12; enc.waves = waves(e.species!, lv - 4); }
    if (e.kind === 'destroy') { enc.device = { ...e.device!, level: lv - 2, hpMult: 3 + lv / 40 }; enc.every = 14; enc.waves = waves(e.species!, lv - 5); }
    if (e.kind === 'escort') enc.npc = { name: e.npc!.name, sprite: e.npc!.sprite, look: e.npc!.look, from: P(s.p, e.npc!.from, e.npc!.fdx, e.npc!.fdy) };
    objs.push({ type: e.kind, target: `${id}:${e.kind}`, text: e.text, encounter: enc });
  }
  objs.push({ type: 'talk', target: linh(s.p), text: 'Báo lại với Linh' });
  quests.push({
    id, kind: 'main', region: s.p, chapter: chapters.find((c) => c.quests.includes(id))!.id,
    title: s.title, description: s.offer.join(' '), giver: linh(s.p),
    requires: [MAIN[prev]], requiresFlags: [`badge:${prev}`],
    objectives: objs, rewards: { ...reward(lv, s.rewards), reputation: 2, flags: [`mn:done:${s.p}`] },
    dialogue: { offer: s.offer, progress: ['Mình đang đo. Bạn làm theo dấu trên bản đồ nhé.'], complete: s.done },
    cutscene: s.cutscene,
  });
}

// ── Mở đầu: Cà Mau ──
npcs.push(
  { id: 'mn-sau-ca-mau', name: 'Chú Sáu', sprite: 'farmer', look: 'mn-sau', at: P('ca-mau', 'npc:cm-fisher-ut', 3, 1),
    lines: ['Ghe của chú lúc nào cũng sẵn. Con nước là thứ không chờ ai đâu, con.'] },
);
trainers.push(
  { id: 'mn-khai-ca-mau', name: 'Khải', sprite: 'youngster', look: 'mn-khai', at: P('ca-mau', 'wp:wp-ca-mau-center', -2, -4), hideIf: ['mn:done:ca-mau'],
    team: [['shinx', 6], ['poochyena', 5]],
    challenge: ['Cậu cũng vừa nhận Pokémon từ Giáo sư An hả? Thử xem Pokémon của ai mạnh hơn!'],
    win: ['Hừ... may mắn thôi. Lần sau tôi không thua đâu.'], lose: ['Thấy chưa? Phải mạnh mới làm được việc!'],
    rewards: { items: { potion: 2, pokeball: 3 }, exp: 150 } },
);
quests.push(
  { id: 'mn-cm-1', kind: 'main', region: 'ca-mau', chapter: 'mn-0', title: 'Trạm nước Đất Mũi', giver: 'vn-prof', requires: ['vn-cm-1'],
    description: 'Giáo sư An nhờ bạn ra trạm nước đầu thị trấn giúp kỹ sư Linh đo mạch nước — con nước ở Đất Mũi đang lên sai giờ.',
    objectives: [
      { type: 'talk', target: linh('ca-mau'), text: 'Gặp Linh ở trạm nước' },
      { type: 'trainer', target: 'mn-khai-ca-mau', text: 'Đấu tập với Khải' },
      { type: 'explore', target: 'cm-mangrove', text: 'Ra rừng ngập mặn lấy mẫu nước' },
      { type: 'talk', target: linh('ca-mau'), text: 'Đưa mẫu nước cho Linh' },
    ],
    rewards: { exp: 150, items: { potion: 3, pokeball: 5 } },
    dialogue: { offer: ['Mạch nước dưới Đất Mũi đang bị kéo đi đâu đó. Ta cần người giúp Linh ở trạm nước. Cháu đi nhé?'],
      progress: ['Ra rừng ngập mặn lấy mẫu nước rồi đưa Linh nhé.'], complete: ['Mẫu này mặn gấp đôi tuần trước... Cảm ơn bạn!'] },
    cutscene: { start: 'mn-c-prologue', complete: 'mn-c-station' } },
  { id: 'mn-cm-2', kind: 'main', region: 'ca-mau', chapter: 'mn-0', title: 'Lưới khi triều lên', giver: linh('ca-mau'), requires: ['mn-cm-1'],
    description: 'Triều lên dữ bất thường, Pokémon mắc vào lưới bỏ hoang ngoài bãi. Chú Sáu sẽ gỡ lưới — bạn giữ bãi cho chú.',
    objectives: [
      { type: 'talk', target: 'mn-sau-ca-mau', text: 'Gặp Chú Sáu ở bến' },
      { type: 'hold', target: 'mn-cm-2:hold', text: 'Giữ bãi trong lúc Chú Sáu gỡ lưới',
        encounter: { kind: 'hold', at: P('ca-mau', 'npc:cm-fisher', 2, -6), radius: 4, seconds: 35, every: 11, waves: [[['krabby', 4], ['corphish', 4]], [['krabby', 5], ['wooper', 5]], [['corphish', 6], ['wooper', 6]]] } },
      { type: 'talk', target: 'mn-sau-ca-mau', text: 'Nói chuyện với Chú Sáu' },
    ],
    rewards: { exp: 220, items: { potion: 2, greatball: 2 } },
    dialogue: { offer: ['Triều đang lên kìa! Ngư dân báo có Pokémon mắc lưới bỏ hoang ngoài bãi.', 'Chú Sáu ở bến biết cách gỡ lưới. Bạn giữ bãi cho chú nhé — Krabby hoảng lên là kẹp người đó.'],
      progress: ['Chú Sáu ở bến ghe, gần chỗ ngư dân Út Mũi.'], complete: ['Cảm ơn con. Mấy con Pokémon mắc lưới đã về lại biển hết rồi.'] },
    cutscene: { complete: 'mn-c-nets' } },
  { id: 'mn-cm-3', kind: 'main', region: 'ca-mau', chapter: 'mn-0', title: 'Khu làm tổ của Seviper', giver: 'mn-sau-ca-mau', requires: ['mn-cm-2'],
    description: 'Seviper — Chúa Rừng U Minh — đang lồng lộn quanh khu làm tổ. Giữa rừng có một cỗ máy lạ.',
    objectives: [
      { type: 'explore', target: 'cm-uminh', text: 'Vào rừng tràm U Minh' },
      { type: 'destroy', target: 'mn-cm-3:destroy', text: 'Phá bộ khuếch đại cạnh khu làm tổ',
        encounter: { kind: 'destroy', at: P('ca-mau', 'boss', 12, 4), every: 14, device: { name: 'Bộ khuếch đại Bình Minh', species: 'bronzor', level: 9, hpMult: 2.5 }, waves: [[['ekans', 7], ['seviper', 7]], [['ekans', 8], ['seviper', 8]]] } },
      { type: 'boss', target: 'seviper', text: 'Làm Seviper bình tĩnh lại (đánh bại Chúa Rừng U Minh)' },
      { type: 'talk', target: linh('ca-mau'), text: 'Báo lại với Linh' },
    ],
    rewards: { exp: 400, items: { superpotion: 2, greatball: 3 } },
    dialogue: { offer: ['Ông nội chú nói: rừng kêu đêm là có người động vào mạch. Con vào U Minh xem sao.', 'Nhớ: Seviper chỉ giữ tổ của nó thôi. Làm nó bình tĩnh lại, đừng làm hại.'],
      progress: ['Rừng tràm U Minh ở phía bắc. Đi ghe theo kênh là nhanh nhất.'], complete: ['Seviper đã về tổ. Còn cỗ máy này... "Dự án Bình Minh". Mình phải báo Giáo sư An.'] },
    cutscene: { complete: 'mn-c-amp' } },
  { id: 'mn-cm-4', kind: 'main', region: 'ca-mau', chapter: 'mn-0', title: 'Huy hiệu Rừng Tràm', giver: linh('ca-mau'), requires: ['mn-cm-3'], requiresFlags: ['badge:ca-mau'], autoStart: true,
    description: 'Mang Huy hiệu Rừng Tràm và tin về Dự án Bình Minh về cho Giáo sư An.',
    objectives: [{ type: 'talk', target: 'vn-prof', text: 'Báo tin cho Giáo sư An' }],
    rewards: { exp: 300, items: { superpotion: 3 }, flags: ['mn:done:ca-mau', 'mn:act1'] },
    dialogue: { offer: ['Về gặp Giáo sư An đi!'], progress: ['Giáo sư An đang ở viện nghiên cứu.'], complete: ['Ta đã nghe hết rồi. Cháu và Linh sẽ đi tiếp chứ?'] },
    cutscene: { complete: 'mn-c-depart' } },
);

// ── Hồi II: TP. Hồ Chí Minh ──
trainers.push(
  { id: 'mn-khai-ho-chi-minh', name: 'Khải (Bình Minh)', sprite: 'youngster', look: 'mn-khai', at: P('ho-chi-minh', 'wp:wp-ho-chi-minh-center', -3, 4), showIf: ['badge:tay-ninh'], hideIf: ['mn:done:ho-chi-minh'],
    team: [['luxio', 44], ['mightyena', 43], ['klang', 44]],
    challenge: ['Thấy bộ đồ mới của tôi không? Bình Minh. Cho cậu xem sức mạnh thật sự là gì!'],
    win: ['Không thể nào... với thiết bị tốt nhất mà vẫn thua?'], lose: ['Bình Minh là tương lai. Cậu nên suy nghĩ lại đi.'],
    rewards: { items: { ultraball: 2, superpotion: 1 }, exp: 1800 } },
);
quests.push(
  { id: 'mn-sg-1', kind: 'main', region: 'ho-chi-minh', chapter: 'mn-2', title: 'Lưới điện của Bình Minh', giver: linh('ho-chi-minh'), requires: [MAIN['tay-ninh']], requiresFlags: ['badge:tay-ninh'],
    description: 'Sài Gòn chập điện từng khu. Bình Minh tuyển người ngay giữa trung tâm — và Khải đang ở đó.',
    objectives: [
      { type: 'explore', target: 'sg-city', text: 'Vào trung tâm Sài Gòn' },
      { type: 'trainer', target: 'mn-khai-ho-chi-minh', text: 'Đối mặt với Khải' },
      { type: 'talk', target: linh('ho-chi-minh'), text: 'Nói chuyện với Linh' },
    ],
    rewards: { ...reward(46), flags: ['mn:khai-joined'] },
    dialogue: { offer: ['Lưới điện thành phố bị Bình Minh hút để chạy tổng đài. Mình nghe nói họ tuyển người ở trung tâm.', 'Và... Khải đã nhận lời gia nhập.'],
      progress: ['Khải ở gần trung tâm thành phố.'], complete: ['Khải không chịu nghe. Nhưng ít ra mình biết tổng đài ở đâu: trạm biến áp — nơi Magnezone bị nối vào.'] },
    cutscene: { start: 'mn-c-khai-joins' } },
  { id: 'mn-sg-2', kind: 'main', region: 'ho-chi-minh', chapter: 'mn-2', title: 'Magnezone quá tải', giver: linh('ho-chi-minh'), requires: ['mn-sg-1'],
    description: 'Magnezone — Thần Điện Sài Gòn — bị một trạm biến áp của Bình Minh hút điện tới quá tải.',
    objectives: [
      { type: 'destroy', target: 'mn-sg-2:destroy', text: 'Phá trạm biến áp cưỡng chế',
        encounter: { kind: 'destroy', at: P('ho-chi-minh', 'boss', 10, 6), every: 14, device: { name: 'Trạm biến áp cưỡng chế', species: 'klinklang', level: 44, hpMult: 4 }, waves: waves(['voltorb', 'electabuzz', 'electrode'], 41) } },
      { type: 'boss', target: 'magnezone', text: 'Làm Magnezone hạ nhiệt (đánh bại Thần Điện Sài Gòn)' },
      { type: 'talk', target: linh('ho-chi-minh'), text: 'Báo lại với Linh' },
    ],
    rewards: { ...reward(46), reputation: 2, flags: ['mn:done:ho-chi-minh'] },
    dialogue: { offer: ['Trạm biến áp ở gần chỗ Magnezone. Phá nó trước, rồi giúp Magnezone hạ nhiệt.'], progress: ['Trạm biến áp ở gần khu của Magnezone.'],
      complete: ['Đèn phố sáng lại rồi! Nhưng kỹ thuật viên nói Tiến sĩ Vũ đã lên Tây Nguyên...'] },
    cutscene: { complete: 'mn-c-overload' } },
);

// ── Bình Minh technicians and the Huế / Thanh Hóa / Bắc Ninh / Hà Nội cast ──
const tech = (p: string, name: string, at: string, team: [string, number][]): TrainerIn => ({
  id: `mn-bm-${p}`, name, sprite: 'bald', look: 'mn-bm-' + p, at: P(p, at, 3, 2), showIf: [`badge:${prevOf(p)}`], hideIf: [`mn:done:${p}`], team,
  challenge: ['Khu vực của Dự án Bình Minh. Người ngoài không được vào!'], win: ['Được rồi, được rồi... tôi chỉ làm theo lệnh thôi mà.'],
  lose: ['Về đi. Đây là việc của người lớn.'], rewards: { items: { superpotion: 1, ultraball: 2 }, exp: levelOf(p) * 40 },
});
trainers.push(
  tech('gia-lai', 'Kỹ thuật viên Bình Minh Tạ', 'area:gl-volcano', [['magmar', 54], ['klang', 53], ['porygon2', 54]]),
  tech('nghe-an', 'Kỹ thuật viên Bình Minh Hà', 'area:na-pumat', [['bronzong', 66], ['klang', 65], ['electabuzz', 66]]),
  tech('quang-ninh', 'Trưởng ca Bình Minh Đạt', 'area:ql-campha', [['probopass', 78], ['klinklang', 78], ['magnezone', 79]]),
  { id: 'mn-khai-bac-ninh', name: 'Khải', sprite: 'youngster', look: 'mn-khai', at: P('bac-ninh', 'area:bn-lim', 2, 2), showIf: ['badge:hai-phong'], hideIf: ['mn:done:bac-ninh'],
    team: [['luxray', 78], ['mightyena', 76], ['scizor', 77], ['houndoom', 77]],
    challenge: ['Không máy móc, không Bình Minh. Chỉ tôi và đồng đội của tôi. Bắt đầu thôi!'],
    win: ['...Cậu mạnh thật. Tôi phục.'], lose: ['Lần này là thật đó. Tập thêm đi rồi đấu lại!'], rewards: { items: { 'rare-candy': 1, ultraball: 3 }, exp: 4000 } },
  { id: 'mn-vu-ha-noi', name: 'Tiến sĩ Vũ', sprite: 'wizard', look: 'mn-vu', at: P('ha-noi', 'area:hn-coloa', -6, 4), showIf: ['badge:phu-tho'], hideIf: ['mn:done:ha-noi'],
    team: [['magnezone', 96], ['metagross', 97], ['porygon-z', 96], ['klinklang', 95], ['rotom', 96]],
    challenge: ['Cháu đã đi suốt một đất nước để đến đây. Ta muốn tận mắt thấy điều gì khiến cháu tin mình đúng.'],
    win: ['...Vậy ra đó là thứ ta đã bỏ quên: Pokémon không phải là máy.'], lose: ['Chưa đủ. Mạch nguồn cần nhiều hơn lòng tốt.'],
    rewards: { items: { 'rare-candy': 2, superpotion: 3 }, exp: 9000 } },
);
npcs.push(
  { id: 'mn-vu-hue', name: 'Tiến sĩ Vũ', sprite: 'wizard', look: 'mn-vu', at: P('hue', 'area:hu-dainoi', 3, 3), showIf: ['badge:da-nang'], hideIf: ['mn:done:hue'],
    lines: ['Số liệu không nói dối, cháu à. Chỉ người đọc nó là hay nói dối thôi.'] },
  { id: 'mn-khai-thanh-hoa', name: 'Khải', sprite: 'youngster', look: 'mn-khai', at: P('thanh-hoa', 'area:th-camluong', 2, 2), showIf: ['badge:nghe-an'], hideIf: ['mn:done:thanh-hoa'],
    lines: ['Đừng nhìn tôi như vậy. Tôi tới đây để sửa sai, không phải để xin lỗi.'] },
  { id: 'mn-khai-ha-noi', name: 'Khải', sprite: 'youngster', look: 'mn-khai', at: P('ha-noi', 'wp:wp-ha-noi-center', -3, 3), showIf: ['badge:phu-tho'], hideIf: ['mn:done:ha-noi'],
    lines: ['Tôi đã vẽ lại sơ đồ tổng trạm. Lối vào ở phía Cổ Loa.'] },
  { id: 'mn-vu-ca-mau', name: 'Tiến sĩ Vũ', sprite: 'wizard', look: 'mn-vu', at: P('ca-mau', 'npc:cm-fisher-ut', 6, -2), showIf: ['mn:end'],
    lines: ['Trạm quan trắc Đất Mũi — trạm đầu tiên ta không xây để lấy gì từ mạch nguồn.', 'Mỗi sáng ta đo con nước, ghi lại, gửi cho An. Chậm hơn nhiều, nhưng lần này ta không vội nữa.'] },
);

// ── Hồi V: Hà Nội ──
quests.push(
  { id: 'mn-hn-1', kind: 'main', region: 'ha-noi', chapter: 'mn-5', title: 'Thủ đô mất mạch', giver: linh('ha-noi'), requires: [MAIN['phu-tho']], requiresFlags: ['badge:phu-tho'],
    description: 'Hồ Gươm cạn bất thường, rùa trong hồ không nổi lên nữa. Khải đã tới trước và biết đường vào tổng trạm.',
    objectives: [
      { type: 'explore', target: 'hn-hoguom', text: 'Tới Hồ Gươm' },
      { type: 'talk', target: 'mn-khai-ha-noi', text: 'Gặp Khải' },
      { type: 'talk', target: linh('ha-noi'), text: 'Bàn kế hoạch với Linh' },
    ],
    rewards: reward(100),
    dialogue: { offer: ['Mực nước Hồ Gươm thấp nhất từ trước tới nay. Khải nhắn đã tìm ra lối vào tổng trạm.'], progress: ['Khải đợi ở gần trung tâm phố cổ.'],
      complete: ['Vậy là Cổ Loa. Tiến sĩ Vũ đang đợi ở đó.'] },
    cutscene: { start: 'mn-c-act5' } },
  { id: 'mn-hn-2', kind: 'main', region: 'ha-noi', chapter: 'mn-5', title: 'Tiến sĩ Vũ', giver: linh('ha-noi'), requires: ['mn-hn-1'],
    description: 'Tiến sĩ Vũ đứng chặn trước Thành Cổ Loa. Ông muốn tận mắt xem điều gì khiến bạn tin mình đúng.',
    objectives: [
      { type: 'explore', target: 'hn-coloa', text: 'Tới Thành Cổ Loa' },
      { type: 'trainer', target: 'mn-vu-ha-noi', text: 'Đấu với Tiến sĩ Vũ' },
      { type: 'talk', target: linh('ha-noi'), text: 'Nói chuyện với Linh' },
    ],
    rewards: reward(100, { 'rare-candy': 1 }),
    dialogue: { offer: ['Tiến sĩ Vũ ở Cổ Loa. Ông không bỏ chạy — ông đợi bạn.'], progress: ['Thành Cổ Loa ở phía bắc thành phố.'],
      complete: ['Ông ấy nói thật: lõi cưỡng chế không còn nghe lệnh ai nữa. Mình phải phá nó.'] },
    cutscene: { complete: 'mn-c-vu' } },
  { id: 'mn-hn-3', kind: 'main', region: 'ha-noi', chapter: 'mn-5', title: 'Điểm neo Cổ Loa', giver: linh('ha-noi'), requires: ['mn-hn-2'],
    description: 'Ba bước cuối: phá lõi cưỡng chế, giữ điểm neo Cổ Loa trong lúc mạch nguồn ổn định, rồi cùng Torterra cắt những sợi cáp nối vào nó.',
    objectives: [
      { type: 'destroy', target: 'mn-hn-3:destroy', text: 'Bước 1 — Phá lõi cưỡng chế',
        encounter: { kind: 'destroy', at: P('ha-noi', 'area:hn-coloa', 4, -4), every: 13, device: { name: 'Lõi cưỡng chế Bình Minh', species: 'metagross', level: 96, hpMult: 6 }, waves: waves(['magnezone', 'porygon-z', 'rhyperior'], 92) } },
      { type: 'hold', target: 'mn-hn-3:hold', text: 'Bước 2 — Giữ điểm neo Cổ Loa',
        encounter: { kind: 'hold', at: P('ha-noi', 'area:hn-coloa', 4, -4), radius: 5, seconds: 60, every: 12, waves: waves(['klinklang', 'magnezone', 'metagross'], 93) } },
      { type: 'boss', target: 'torterra', text: 'Bước 3 — Cắt cáp khỏi Torterra (đánh bại để giải phóng nó)' },
      { type: 'talk', target: linh('ha-noi'), text: 'Đứng cạnh Linh nhìn mạch nguồn chảy lại' },
    ],
    rewards: { ...reward(100, { 'rare-candy': 2 }), reputation: 3, flags: ['mn:done:ha-noi'] },
    dialogue: { offer: ['Lõi cưỡng chế, điểm neo, rồi Torterra. Mình ở ngay sau bạn.'], progress: ['Làm theo từng bước trên bản đồ nhé.'],
      complete: ['Xong rồi... xong thật rồi.'] },
    cutscene: { complete: 'mn-c-finale' } },
  { id: 'mn-end', kind: 'main', region: 'ca-mau', chapter: 'mn-6', title: 'Mạch nước trở về', giver: linh('ha-noi'), requires: ['mn-hn-3'], requiresFlags: ['badge:ha-noi'], autoStart: true,
    description: 'Mang Huy hiệu Thăng Long về Đất Mũi, nơi mọi chuyện bắt đầu.',
    objectives: [{ type: 'talk', target: 'vn-prof', text: 'Về Đất Mũi gặp Giáo sư An', marker: P('ca-mau', 'npc:vn-prof') }],
    rewards: { exp: 5000, items: { 'rare-candy': 3, 'exp-candy-xl': 1 }, flags: ['mn:end'] },
    dialogue: { offer: ['Về nhà thôi.'], progress: ['Giáo sư An đợi ở Đất Mũi.'], complete: ['Chào mừng cháu về nhà.'] },
    cutscene: { complete: 'mn-c-ending' } },
  { id: 'mn-post', kind: 'side', region: 'ca-mau', title: 'Trạm quan trắc Đất Mũi', giver: 'mn-vu-ca-mau', requires: ['mn-end'],
    description: 'Hậu truyện: Tiến sĩ Vũ nhờ bạn mang bản số đo đầu tiên của trạm quan trắc tới Chú Sáu — người hiểu con nước nhất Đất Mũi.',
    objectives: [{ type: 'talk', target: 'mn-sau-ca-mau', text: 'Mang bản số đo cho Chú Sáu' }, { type: 'talk', target: 'mn-vu-ca-mau', text: 'Trở lại trạm quan trắc' }],
    rewards: { exp: 2000, items: { 'rare-candy': 1 } },
    dialogue: { offer: ['Ta muốn biết số đo của ta có khớp với kinh nghiệm bốn chục năm chạy ghe không. Cháu mang giúp ta nhé.'],
      progress: ['Chú Sáu ở bến ghe.'], complete: ['Sáu nói số của ta "trễ hơn con nước nửa nhịp". Ha... ta sẽ sửa. Cảm ơn cháu.'] } },
);

// Huế branch follow-ups (the pick in mn-hu is announced in its offer)
quests.push(
  { id: 'mn-hu-vu', kind: 'side', region: 'quang-tri', title: 'Lời hứa giảm áp', giver: linh('quang-tri'), requires: ['mn-hu'], requiresFlags: ['choice:mn-hu:dua'],
    description: 'Bạn đã đưa dữ liệu cho Tiến sĩ Vũ. Linh muốn kiểm tra xem ông có giữ lời giảm áp các trạm không.',
    objectives: [{ type: 'explore', target: 'qt-hienluong', text: 'Đo mạch nước ở cầu Hiền Lương' }, { type: 'talk', target: linh('quang-tri'), text: 'Báo số đo cho Linh' }],
    rewards: { exp: 2500, items: { superpotion: 2 } },
    dialogue: { offer: ['Ông ấy hứa giảm áp. Mình muốn tin — nhưng phải đo đã.'], complete: ['Áp suất giảm thật, khoảng một phần ba. Ông ấy giữ lời... ít nhất là một phần.'] } },
  { id: 'mn-hu-an', kind: 'side', region: 'quang-tri', title: 'Bằng chứng gửi Đất Mũi', giver: linh('quang-tri'), requires: ['mn-hu'], requiresFlags: ['choice:mn-hu:giu'],
    description: 'Bạn đã giữ dữ liệu điểm neo. Linh nhờ bạn đo thêm một điểm để Giáo sư An có đủ bằng chứng.',
    objectives: [{ type: 'explore', target: 'qt-vinhmoc', text: 'Đo thêm ở Vịnh Mốc' }, { type: 'talk', target: linh('quang-tri'), text: 'Đưa số đo cho Linh' }],
    rewards: { exp: 2500, items: { ultraball: 3 } },
    dialogue: { offer: ['Thêm một điểm đo nữa là đủ để Giáo sư An gửi lên Bộ.'], complete: ['Đủ rồi! Giáo sư An nói Bộ đã yêu cầu Bình Minh tạm dừng các trạm miền Trung.'] } },
);

export const vietnam: StoryIn = {
  id: 'mach-nguon', campaign: 'vietnam', title: 'Mạch Nguồn',
  premise: 'Dưới đất nước chảy những mạch nguồn cổ giữ nhịp cho sông, rừng và Pokémon. Dự án Bình Minh đang cưỡng chế chúng để lấy năng lượng chống hạn — và khắp nơi nước chảy ngược, Pokémon bỏ nhà, các hộ vệ cổ thức giấc. Từ Cà Mau tới Hà Nội, bạn cùng Linh đi tìm và tắt từng trạm.',
  characters, chapters, cutscenes, quests, npcs, trainers,
};
void FIRST;
