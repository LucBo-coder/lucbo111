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
