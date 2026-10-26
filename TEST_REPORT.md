# TEST REPORT — V20

Ngày: 2026-10-26 · Nhánh `improve/complete-game-v1` · Máy: Windows 11, Node 24, Microsoft Edge (Playwright, WebGL phần mềm).

## 1. Build
| Lệnh | Trước | Sau |
|---|---|---|
| `npm run build` (tsc --noEmit + vite build) | ✅ | ✅ (35 s) |

## 2. Unit test (Vitest)
| | Trước | Sau |
|---|---|---|
| File | 43 | 46 |
| Test | 370/370 ✅ | **390/390 ✅** |

Test mới:
| File | Số test | Nội dung |
|---|---|---|
| `tests/v20_active_skills.test.ts` | 9 | ra chiêu đúng ô + bắt đầu hồi chiêu; GCD chặn spam rồi hết theo mô phỏng; hồi chiêu / năng lượng; miễn nhiễm (Thường → Ma); không có mục tiêu; ngoài tầm → xếp hàng, đi tới và ra chiêu trong hạn; mục tiêu biến mất → hủy và trả AI; ô giữ chiêu AI không dùng nhưng người chơi dùng được; Pokémon kiệt sức không nhận lệnh |
| `tests/v20_starter_valley.test.ts` | 6 | có Trung tâm Pokémon, y tá, bảng nhiệm vụ, ≥ 3 NPC đi lại; NPC đi lại có đủ đất trống; khu trại, 3 HLV khác đội hình, trong rào; **chuỗi nhiệm vụ trại từ đầu tới cuối** (khóa trước nhiệm vụ đầu, sai HLV không tiến triển, thưởng một lần, cờ tốt nghiệp mở rương); nhiệm vụ bảng tin; mọi mục tiêu trỏ tới NPC/HLV/khu có thật |
| `tests/v20_net_reliability.test.ts` | 5 | hàng đợi relay giữ phần thưởng, bỏ snapshot cũ; hàng đợi toàn tin một lần giữ tin mới nhất; ledger chỉ gửi lại cho khách biết xác nhận, ngừng sau xác nhận, bỏ sau hạn; khách chống trùng theo id kể cả sau tải lại save; chủ phòng gửi lại đúng phần thưởng bị mất |

Test cũ được cập nhật: `tests/coop.test.ts` (tin `coopLoot` giờ có thêm `id`). `tests/v5_official_art.test.ts` bắt được NPC mới thiếu ảnh trainer → đã bổ sung ánh xạ trong `spriteRegistry.ts`.

## 3. E2E (Playwright + Edge)
Chạy: `adventure, coop, v6_summon, evolution, v8_vietnam, v18_events, v20_starter, smoke, online_modes` — 26 test, 3 worker.

| Kết quả | |
|---|---|
| 25/26 ✅ lần đầu | |
| `coop.spec.ts:30` ❌ lần đầu, ở bước "khách đi sang phải → chủ phòng thấy x tăng > 10 px sau 600 ms" (trước bước phần thưởng) | chạy lại riêng, 1 worker: **3/3 lần qua cả 3 test co-op**, gồm bước chia phần thưởng có id mới. Đánh giá: chập chờn do 3 trình duyệt WebGL phần mềm cạnh tranh CPU (TASKS.md đã ghi hiện tượng tương tự với spec khác). Không sửa test. |

Spec mới `e2e/v20_starter.spec.ts`:
- Máy tính 1280×720: phím **Q** ra chiêu; **click** ô chiêu 2; **chuột phải** ô 1 → giữ chiêu; giữ chiêu còn sau khi thả lại đội; **y tá** hồi đầy HLV và Pokémon; **NPC đi lại** dịch chuyển ban ngày và ở trong bán kính quanh chỗ; vào **Trại Huấn Luyện** (ghi nhận khu), nhận nhiệm vụ trại qua **hội thoại thật**; không có lỗi console.
- Điện thoại dọc 390×844 cảm ứng: không phần tử tương tác nào của HUD đè lên thanh kỹ năng; **chạm** ô chiêu ra lệnh.
- Ảnh chụp đã xem bằng mắt: thanh kỹ năng, Trung tâm Pokémon + PC + y tá, Trại Huấn Luyện, bố cục điện thoại.

## 4. Hồi quy cân bằng Sinh tồn
`npx vitest run --config scripts/vitest.balance.ts` chạy trên mã gốc (stash) và mã mới: **9 lượt probe trùng khít từng giá trị** (thời điểm thua/thắng, cấp, số boss) — 2/9 thắng ở cả hai. Kỹ năng chủ động không làm đổi mô phỏng khi không ai ra lệnh.

## 5. Chưa kiểm chứng được
- Điện thoại / máy tính bảng thật, FPS thật (chỉ có Edge headless với WebGL phần mềm).
- Co-op qua máy chủ Cloudflare thật với rớt mạng thật: logic gửi lại / chống trùng được test bằng unit (giả lập mất tin) và e2e co-op chạy qua `?net=local`; chưa chạy `e2e/relay_reconnect.spec.ts` với relay triển khai.
- E2E chưa đánh trọn trận với 3 học viên trại (luồng thách đấu HLV dùng chung đã có e2e ở `adventure.spec.ts`).
- Thế giới online (`server_v7`, 14 test unit với client `ws` thật) qua trong bộ unit; không chạy `e2e:server`.

---

# TEST REPORT — V21

Ngày: 2026-10-26 · cùng nhánh / máy.

| | Kết quả |
|---|---|
| `npm run build` | ✅ |
| Unit (Vitest) | **406/406 ✅** (48 file; mới: `v21_remote_skills` 7, `v21_gathering` 9) |
| E2E hồi quy (14 spec, 2 worker): adventure, coop, v6_summon, evolution, v8_vietnam, v18_events, v20_starter, smoke, online_modes, v15_online, v4_regions, overworld_visual, v21_world, v21_mega_sprites | lần đầu 30/33 — 2 lỗi do `e2e/v20_starter.spec.ts` đọc biến nội bộ cũ của thanh kỹ năng (đã cập nhật sang `skillBar.bounds` / `skillBar.zones`), 1 lỗi chập chờn ở bước đọc chữ nhắc câu cá (đổi sang chờ chữ nhắc). Sau sửa: `v20_starter` + `v21_world` **3/3 lần qua** với 3 worker. |
| Máy chủ relay | `tsc --noEmit` ✅, `wrangler deploy --dry-run` ✅, thử `trimBuffer` (400 tin: giữ phần thưởng đầu hàng đợi + snapshot mới nhất) ✅. **Chưa triển khai.** |

Ảnh đã xem bằng mắt: câu cá (phao, dấu "!", nhắc "[E] KÉO CÂU NGAY!"), Rừng Ngọc Lục Bảo (cổng về, đường mòn), thanh kỹ năng trong PvP luyện tập, 4 dạng Mega (Charizard X, Mewtwo Y — hoạt ảnh PMD riêng; Venusaur, Scizor — ảnh chính thức).

Chưa kiểm chứng: thanh kỹ năng của khách co-op trên điện thoại thật (unit + e2e co-op cũ qua, chưa chụp ảnh HUD khách); PvP thật giữa hai máy qua Cloudflare (logic test bằng unit với tin qua JSON); máy chủ relay sau triển khai.

---

# TEST REPORT — V22 (AI huấn luyện viên, tái đấu, danh tiếng theo tỉnh)

Ngày: 2026-10-26 · Nhánh `improve/complete-game-v1`.

| Bước | Kết quả |
|---|---|
| `npm run build` | ✅ |
| Unit (Vitest) | **417/417 ✅** (49 file). Mới: `tests/v22_trainer_rep.test.ts` (11). Cập nhật: `tests/v13_can_tho.test.ts` (Cần Thơ thêm nhiệm vụ `vn-ct-rep`: 6 → 7) |
| E2E mới `e2e/v22_trainer_rep.spec.ts` | ✅ — Cà Mau: HLV 3 Pokémon ra 2 + 1 dự bị; dự bị ra sau khi 2 con gục; thắng lần đầu → cờ `beat:`, +5 danh tiếng Cà Mau; tái đấu bị từ chối khi chưa hồi; sau 10 phút chơi tái đấu cấp cao hơn, nhận tiền, không lặp vật phẩm; hạng *Được tin cậy* → NPC chào theo hạng; tải lại trang → danh tiếng, số lần tái đấu còn nguyên |
| E2E hồi quy có trận HLV (v8_vietnam, v13_can_tho, v20_starter, v21_world, v22) | 8/8 ✅ |
| E2E toàn bộ (3 luồng) | 48 qua, 5 lỗi, 1 bỏ qua. Cả 5 (`online_modes`, `v15_shared_world`, `v20_starter:22`, `v21_world:107`, `v6_summon`) **chạy lại riêng (2 luồng): 8/8 ✅** — lỗi do máy quá tải (WebGL phần mềm, 3 trình duyệt cùng lúc): hết thời gian chờ hoặc giá trị theo thời gian thực |

Lỗi tìm được bằng e2e và đã sửa: trận HLV kết thúc ngay lúc gửi Pokémon dự bị cuối cùng (đếm số Pokémon còn sống trước khi gửi ra).

Ảnh đã xem: 2 Pokémon của HLV trên sân + thông báo "gửi ra"; thông báo "Thắng tái đấu … +300 đồng"; lời chào của NPC theo hạng danh tiếng.
