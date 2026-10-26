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
