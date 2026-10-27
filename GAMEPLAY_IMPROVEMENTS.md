# GAMEPLAY IMPROVEMENTS — V20

Chỉ ghi những thay đổi đã lập trình **và** kiểm thử (unit + e2e trên Edge). Kết quả kiểm thử: `TEST_REPORT.md`.

## 1. Kỹ năng chủ động (Phiêu lưu & Việt Nam Odyssey)

Pokémon vẫn tự chiến đấu như cũ; người chơi được quyết định **lúc nào** và **chiêu nào** cho Pokémon đang điều khiển.

| Thao tác | Máy tính | Điện thoại |
|---|---|---|
| Dùng chiêu tốt nhất ngay | **Q** | — |
| Dùng một chiêu cụ thể | click ô chiêu trên thanh kỹ năng | chạm ô chiêu |
| Giữ chiêu cho mình (AI không dùng nữa) / trả lại | chuột phải ô chiêu | nhấn giữ ô chiêu (> 0,45 s) |
| Đổi Pokémon được điều khiển | **T** | chạm dòng tên trên thanh (`⇄`) |

### Luật (lõi `src/core/world.ts`)
- `World.requestSkill(unit, slot | 'best')` dùng **đúng luật của AI**: hồi chiêu, năng lượng, khóa của vật phẩm cầm (Choice, Assault Vest), miễn nhiễm hệ (không cho dùng chiêu Thường lên hệ Ma…).
- **Hồi chiêu chung chống spam**: `ACTIVE_SKILL_GCD = 1,2 s` mỗi phe giữa hai lần ra lệnh chiêu.
- **Mục tiêu**: mục tiêu của lệnh *Tấn công* → mục tiêu hiện tại → kẻ địch gần nhất (≤ 420 px). Chiêu hồi máu / khiên / buff không cần mục tiêu.
- **Ngoài tầm hoặc đang bận** (đang niệm chiêu, lao, choáng): lệnh xếp hàng tối đa `ACTIVE_SKILL_WINDOW = 3 s`; Pokémon **đi tới đúng tầm của chiêu đó** (kể cả Mage/Marksman vốn thả diều), vẫn ưu tiên né vùng cảnh báo và vẫn bị giới hạn khoảng cách với HLV. Hết hạn / mục tiêu biến mất → hủy, AI chạy lại bình thường.
- `'best'` chọn chiêu bằng chính bộ chấm điểm của AI (`chooseSkill`), coi như mục tiêu đã trong tầm.
- **Giữ chiêu** (`setReserved`): bitmask theo ô; AI coi ô đó như đang hồi. Scene lưu theo uid Pokémon nên giữ nguyên qua thu hồi / thả / tiến hóa (chưa lưu vào save — mất khi tải lại game).
- Sự kiện `manual` (thành công / hủy) → vòng sáng xanh quanh Pokémon khi ra chiêu.
- Lý do thất bại hiện thành banner tiếng Việt: đang hồi, không đủ năng lượng, không có mục tiêu, mục tiêu miễn nhiễm, chờ lệnh kế tiếp, đã kiệt sức, bị khóa bởi vật phẩm.

### UI (`src/scenes/AdventureUI.ts`)
Thanh 4 ô: màu theo hệ, icon chiêu pixel, phần tối = thời gian hồi còn lại + số giây, mờ = thiếu năng lượng, viền xanh = đang chờ, viền trắng = đang niệm, góc vàng = đang giữ; thanh năng lượng bên dưới; vạch trắng phía trên = hồi chiêu chung. Máy ngang: giữa đáy màn hình; điện thoại dọc: góc trái dưới (không đè nút cảm ứng — có e2e kiểm tra).

### Không áp dụng (giữ nguyên theo quy tắc từng chế độ)
- **Sinh tồn**: giữ hoàn toàn tự động (phím 1/2/3 dùng chọn thẻ). Không có lệnh nào được gửi nên mô phỏng không đổi.
- **PvP**: chưa có (cần thêm tin nhắn giao thức và kiểm tra phía chủ phòng).
- **Khách co-op**, **Thế giới online**: chưa có (Thế giới online giữ quy tắc 1 Pokémon do máy chủ quản lý).

## 2. Thung Lũng Khởi Nguyên: dịch vụ làng & Trại Huấn Luyện
Chi tiết bố cục: `MAP_DESIGN.md` §2.
- **Y tá** (`role: "nurse"`): nói chuyện → hồi phục HLV, đội trên sân, Pokémon trong bóng.
- **NPC đi lại** (`wander`): ban ngày đi dạo, dừng khi người chơi tới gần, ban đêm về chỗ.
- **Chuỗi nhiệm vụ Trại Huấn Luyện** (mở sau "Bước chân đầu tiên"), mỗi bài dạy một kỹ năng chỉ huy:
  1. *Phá phòng ngự* — thắng Học viên Tân (đội đá/vỏ cứng) → 3 Potion, 2 EXP Candy S.
  2. *Né và rút* — thắng Học viên Linh (đội tốc độ) → 3 Great Ball, Quick Claw.
  3. *Tốt nghiệp* — thắng Học viên Phong (3 con hệ đặc biệt) → Scope Lens, 2 EXP Candy M, cờ `camp:graduate` mở rương trại (3 EXP Candy S, Muscle Band).
- **Bảng nhiệm vụ làng**: *Lũ Rattata quấy phá* (hạ 5 Rattata), *Thăm Trại Huấn Luyện* (đến khu trại rồi gặp Thầy Khang).
- Phần thưởng nhiệm vụ chỉ trao một lần (test nói chuyện lại không nhận thêm).

## 3. Multiplayer: phần thưởng co-op không còn mất khi mạng chập chờn
- **Lỗi** (tìm thấy trong mã, `GAME_AUDIT.md` BUG-NET-1/2): hàng đợi gửi khi rớt mạng (client và máy chủ relay) giữ 400 tin và xóa tin cũ nhất; chủ phòng gửi snapshot 10 tin/s nên tin phần thưởng `coopLoot` có thể bị đẩy mất.
- **Sửa phía client** (không cần triển khai lại máy chủ):
  - `trimQueue` (`src/net/transport.ts`): khi đầy, bỏ trước các tin bị thay thế bởi tin sau (snapshot, input, ping/pong, vị trí); tin một lần (phần thưởng, vào phòng, kết thúc…) được giữ.
  - `coopLoot` mang `id`; khách trả `coopLootAck`; chủ phòng (`LootLedger`) gửi lại mỗi 3 s tới khi được xác nhận (bỏ sau 120 s).
  - Khách lưu id đã nhận trong save (`coopLootIds`, 200 id gần nhất) → bản gửi lại không bị cộng hai lần, kể cả sau khi tải lại.
  - **Tương thích ngược**: chủ phòng chỉ gửi lại cho khách đã từng xác nhận (bản cũ không xác nhận → không gửi lại → không nhân đôi); bản cũ bỏ qua trường `id` và tin `coopLootAck`. Không đổi `PROTOCOL_VERSION`.
- Còn tồn tại: bộ đệm 400 tin ở máy chủ relay (repo `pokemon-server`, triển khai riêng) vẫn xóa tin cũ nhất; với bản vá này phần thưởng vẫn tới nơi nhờ gửi lại, nhưng nên áp dụng cùng quy tắc `trimQueue` ở máy chủ.

## V22 — Trận huấn luyện viên & danh tiếng theo tỉnh

### Huấn luyện viên đánh có chiến thuật (`src/core/trainerAI.ts`)
| Tình huống | HLV làm gì |
|---|---|
| Bắt đầu trận | Gửi 2 Pokémon đầu đội (Pokémon "tủ" của HLV); còn lại chờ dự bị |
| Một Pokémon gục | Sau 0,9 s gửi Pokémon dự bị có lợi thế hệ nhất trước Pokémon bạn đang điều khiển |
| Pokémon bị bạn khắc hệ và < 50% HP | Gọi về, đổi lấy dự bị kháng hệ hơn (không đổi sang Pokémon cũng bị khắc); HP được giữ |
| Pokémon < 30% HP | Dùng Potion (+40% HP), 1 bình — 2 bình nếu đội ≥ 3 hoặc tái đấu |

### Tái đấu
Thắng xong, sau 10 phút chơi HLV mời tái đấu. Đội giữ nguyên loài, cấp kéo theo Pokémon mạnh nhất của bạn (≥ +3, ≤ +15 so với đội gốc, +2 mỗi lần thắng lại). Thưởng: tiền (300 → 800) + 2 danh tiếng, **không** lặp vật phẩm của lần thắng đầu.

### Danh tiếng theo tỉnh (`src/core/reputation.ts`, `src/data/world/reputation.json`)
- Điểm cộng vào vùng đang đứng; mỗi chiến dịch có điểm riêng.
- Người lạ → **Quen mặt** (15) → **Được tin cậy** (40) → **Người nhà** (80). Mỗi hạng tặng quà một lần (cờ `rep:<vùng>:<hạng>`).
- NPC ở Cà Mau, An Giang, Cần Thơ đổi câu chào theo hạng.
- Hạng *Được tin cậy* mở: *Tuần tra rừng tràm U Minh*, *Lời nhờ của Sư cô Núi Cấm*, *Mối hàng chợ nổi*.

### Năng lực khám phá (`src/core/field.ts`)
| Chướng ngại | Năng lực | Ai làm được | Kết quả |
|---|---|---|---|
| Bụi cây rậm | Cắt cây | Pokémon hệ Cỏ / Bọ / Thép, Lv 8+ | biến mất, lối mở |
| Tảng đá nứt | Đập đá | Giác Đấu / Đá / Đất, Lv 14+ | vỡ, lối mở |
| Tảng đá lớn | Đẩy đá | Giác Đấu / Đất / Thép, Lv 18+ | dịch 1 ô ra xa người chơi; lấp ổ → lối mở |

Chỉ cần một Pokémon trong đội đủ điều kiện; thiếu thì game nói rõ cần hệ / cấp nào. Thung Lũng có 3 hốc bí mật dùng các năng lực này, mỗi hốc một rương.

### Đi ghe trên sông Hậu (Cần Thơ)
- Nhiệm vụ *Chiếc ghe của cô lái đò* → có ghe. Bấm E ở bến để xuống / lên ghe (5 bến).
- Trên ghe chỉ đi được trên nước; dòng sông đẩy ghe xuôi (mạnh nhất lúc nước ròng, yếu lúc nước lớn). HUD: "Đang đi ghe · Nước ròng — ghé một bến để lên bờ".
- Bãi Bồi giữa sông (giả tưởng) chỉ đến được bằng ghe, có rương. Lưu giữa sông thì tải lại vẫn ở trên ghe.

### Chợ nổi Cái Răng
- Họp từ 5:00 đến 9:00 giờ trong game; 4 ghe hàng đậu sát bờ, mỗi ghe treo cây bẹo (bưởi, xoài / lá thuốc / lưới, đá xanh / hạt giống).
- Bấm E từ bờ hoặc từ ghe để mua. Hàng mỗi phiên có hạn, hôm sau có hàng mới. Mối quen (danh tiếng Cần Thơ *Được tin cậy*) bớt 10%.
- Giá không cao hơn Poké Mart, không bán ngược lại → không thể kiếm tiền vô hạn.

### Xuồng ở Cà Mau, đò ở An Giang
- Cà Mau: *Chiếc xuồng ba lá* (Ngư dân Út Mũi) → bến Đất Mũi ↔ bến U Minh Hạ, ngược kênh (nước ròng chèo nặng hơn).
- An Giang: bến đò thị trấn Bảy Núi ↔ bến Đồng Nước Nổi.

### Sinh thái: đàn, lãnh thổ, điều kiện hiếm
- Đàn Poochyena / Mareep / Doduo / Zubat… đi cùng nhau, theo con đầu đàn. Đánh một con là cả đàn xông vào — cần tính trước khi lao vào bụi cỏ. Hạ con đầu đàn thì đàn tan.
- Tauros, Scyther, Kangaskhan, Skarmory… giữ lãnh thổ: bước vào thì vòng đỏ hiện lên cảnh báo, còn đứng đó là bị húc. Muốn đi qua thì vòng ra ngoài, muốn bắt thì chuẩn bị đánh.
- Có những loài chỉ xuất hiện khi trời đất hội đủ điều kiện: Absol đêm giông, Misdreavus đêm sương, Chatot lúc rạng sáng… ở Việt Nam có Seviper rừng U Minh đêm mưa, Sableye Bảy Núi về khuya, Zangoose đồng ruộng Cần Thơ ngày nắng.

### Hầm ngục 2.0
- Mỗi ngày trong game, mỗi hầm có biến thể riêng: hang tối, bầy đàn, địa chấn, tinh anh, bẫy ngầm hoặc mạch quặng. Cửa hang báo trước để chọn ngày / độ khó / đội hình. Biến thể khó hơn thì thưởng EXP cao hơn.
- Hang tối: không có Pokémon biết Flash thì chỉ thấy quanh mình — mang theo Pokémon hệ Điện, Lửa hoặc Tiên.
- Bẫy sàn ẩn dưới vết nứt mờ; giẫm phải thì có nửa giây để né.
- Vách đá nứt cạnh phòng câu đố dẫn vào phòng bí mật có rương — lý do để mang theo Pokémon biết Đập đá.

### Điều tra huyền thoại
- Khi một huyền thoại đã mở khóa, các vùng của nó xuất hiện những đốm sáng mờ: lông vũ bạc của Lugia, vết cháy hình tròn của Entei, bia khắc chấm của bộ ba Regi…
- Đọc đủ 3 dấu vết thì biết chính xác khi nào nó xuất hiện, và hiểu nó đủ để có thêm một lượt ném bóng.

### Nhật ký và bảng danh tiếng
- Nhật ký lọc được nhiệm vụ của vùng đang đứng, hoặc chỉ xem những việc đã xong.
- Tab *Danh tiếng* cho biết mỗi tỉnh đang coi bạn là ai, còn bao nhiêu điểm nữa thì lên hạng và quà là gì.
- Bản đồ đánh dấu bến ghe và những bụi cây / tảng đá còn chắn lối, để nhớ quay lại khi đội đủ mạnh.

### Bảo tồn — hậu truyện từng tỉnh
- Hạ xong "chúa" của tỉnh chưa phải là hết: đất cần được chữa lành. Cà Mau trồng đước ven bãi bồi, An Giang gỡ lưới mục trong lau sậy mùa nước nổi, Cần Thơ vớt rác dọc bờ sông Hậu.
- Mỗi tỉnh có sức khỏe sinh thái. Tỉnh càng xanh thì những vị khách hiếm (Seviper đêm mưa ở U Minh, Sableye Bảy Núi, Zangoose đồng ruộng…) ghé càng thường.
- Cây đước bạn trồng mọc lại trên bản đồ và ở đó mãi.

### Sự kiện vùng miền
- Cùng là "bùng phát" nhưng ở Đồng Nước Nổi thì đó là Mùa cá linh về; cùng là thương nhân nhưng ở Phong Điền thì đó là sạp lễ hội trái cây. Sự kiện mang tên, lời kể, loài và hàng hóa của nơi nó xảy ra.
- Vẫn có 30% là sự kiện thường để thế giới không đoán trước được.

### Nhiệm vụ phân nhánh
- Không phải lúc nào cũng có đáp án đúng: báo kiểm lâm về người đặt bẫy, hay tin rằng một người nghèo sẽ nghe lời khuyên? Vét một mùa cá, hay chừa cá non cho năm sau?
- Mỗi lựa chọn dẫn tới một câu chuyện tiếp theo khác nhau — vét lưới thì năm sau nhóm khảo sát nhờ bạn đo lại đồng vắng; chừa cá non thì Bác Năm rủ bạn ra xem đồng đầy lại.

### Chiến đấu & bạn đồng hành
- Gây Bỏng rồi đánh hệ Nước → *Hơi Nước*; Đóng băng rồi đánh hệ Đá / Giác đấu → *Vỡ Băng*. Phối hợp trạng thái và hệ trong đội giờ có ý nghĩa ở Adventure, nhưng mỗi mục tiêu chỉ 6 giây một lần.
- Pokémon biết lượng sức: yếu thì lùi về cạnh bạn, bạn bị thương thì đứa khỏe lao vào đỡ.
- Đi ngang bụi quả chín, Pokémon của bạn tự chạy tới hái giúp.

### Miệt vườn Phong Điền (vùng mẫu)
- Trước: một bãi cỏ xanh trống trơn. Giờ: đi giữa các liếp cây ăn trái và dừa, băng qua mương bằng cầu ván, hái trái ở bụi chín (Pokémon của bạn chạy đi hái phụ), ngồi bờ mương câu Barboach bằng cây cần câu tre Ông Sáu cho mượn.
- Một bụi rậm giấu lối vào khoảng vườn bí mật; một tảng đá nứt trong vườn cò giấu hốc đá — cần Pokémon biết Cắt / Đập đá.

### Đồng Nước Nổi & rừng đước (An Giang, Cà Mau)
- Đồng Nước Nổi không còn là bãi cỏ: đi trên bờ đê giữa những ô ruộng ngập, ô nào còn lúa đứng thì có Pokémon nấp. Ngồi bờ đê thả câu, hái bông điên điển vàng, vào rừng tràm Trà Sư lấy mật ong — đủ thì mang về cho Cô Sáu làm bánh mùa nước nổi.
- Cà Mau: lúc nước ròng lượm ốc len trên bãi bùn dưới gốc đước, đem về cho Ngư dân Tư Sáu đổi cây cần câu — giờ có cần câu ngay ở tỉnh đầu, câu trên lạch rừng đước.
- Mỗi tỉnh thêm 2 hốc bí mật (rễ đước, bụi tràm U Minh, bụi rậm Trà Sư, tảng đá nứt Thất Sơn).

### Đền huyền thoại sống động
- Trước: bước vào vòng trụ là huyền thoại hiện ra ngay. Giờ mỗi đền là một nơi có chủ đề (đỉnh băng với cột pha lê, tháp thu lôi, đồi hoa héo…), phải làm lễ mới gọi được: chạm cột băng theo lượt ngân, giẫm phiến trăng theo chiều kim đồng hồ, đứng yên trên bệ dung nham, trả lời câu đố của Uxie, tưới hoa cho Shaymin nở lại.
- Huyền thoại xuất hiện bằng một đoạn chuyển cảnh, trận đánh diễn ra trong arena niêm phong với hiểm họa của đền (sét đánh, thủy triều dâng, khe nứt phun lửa) — có vòng cảnh báo để né.
- Thánh vật thu được trên đường đi (Ngọc Đỏ, Lông Bạc, Lõi Regi…) mở các đền sau; thú lang thang chỉ chạy khắp vùng sau khi được đánh thức ở tượng / đài của chúng.
- Hai nơi chỉ vào được qua cổng đền: Vực Nguyên Hải dưới đáy biển và Thần Điện Khởi Nguyên.

### Biết ngay có gì mới
- Trước: cập nhật chỉ nằm trong tài liệu, người chơi mở game không biết đã có gì thay đổi. Giờ góc phải trên menu chính có nút **✨ Có gì mới** với chấm đỏ đếm số mục chưa đọc; bấm vào xem danh sách tính năng mới, mục chưa đọc có nhãn MỚI.
