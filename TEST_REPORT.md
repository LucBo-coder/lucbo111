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

## V22 — đợt 2: năng lực khám phá & đi ghe

| Bước | Kết quả |
|---|---|
| `npm run build` | ✅ |
| Unit | **427/427 ✅** (50 file). Mới: `tests/v22_field_boat.test.ts` (10). Cập nhật: `v13_can_tho` (Bãi Bồi chỉ đến bằng ghe; Cần Thơ 9 nhiệm vụ), `v8_vietnam` (mục tiêu `explore` có thể là `dock:<id>`) |
| E2E mới `e2e/v22_field_boat.spec.ts` | 2/2 ✅ — Thung Lũng: bụi cây chặn lối, chưa có Pokémon hợp thì hiện gợi ý; Treecko cắt → đi vào → mở rương; Machop đập đá; Makuhita đẩy đá vào ổ; tải lại vẫn mở. Cần Thơ: chưa có ghe bị từ chối; xuống ghe ở Ninh Kiều; nước đẩy ghe xuôi; không lên bờ ngoài bến; lưu giữa sông → tải lại vẫn trên ghe; lên Bãi Bồi, tới rương |
| E2E hồi quy (v22 ×2, v13_can_tho, v8_vietnam, v21_world, adventure) | 12/12 ✅ (2 luồng) |

Sửa trong lúc test: vùng bấm E của bến chỉ tính từ giữa bến (bến dài 3 ô thì không với tới) → giờ tính từ đầu gần nhất (bờ hoặc nước).
Ảnh đã xem: bụi cây rậm chắn lối, vòng đá + ổ trũng + rương, ghe ở bến Ninh Kiều kèm thông báo con nước, Bãi Bồi giữa sông.

## V22 — đợt 3: chợ nổi, bến Cà Mau / An Giang

| Bước | Kết quả |
|---|---|
| `npm run build` | ✅ |
| Unit | **432/432 ✅**. Mới trong `v22_field_boat.test.ts`: bến Cà Mau / An Giang nối thông; chợ nổi (giờ họp, vị trí ghe, kho theo ngày, giảm giá mối quen, không đắt hơn Poké Mart, lưu sổ chợ). `v13_can_tho`: Cần Thơ 10 nhiệm vụ |
| E2E mới (chợ nổi) | ✅ — trưa không có chợ; 5:10 ghe xuất hiện; E từ bờ mở cửa hàng ghe thuốc; mua hết 3 Super Potion; cùng phiên còn 0; 9:01 tan chợ; hôm sau 5:05 có lại 3 |
| E2E hồi quy (v22 ×4, v13_can_tho, v8_vietnam, v18_events, evolution, adventure) | 18/18 ✅ (2 luồng) |

Ảnh đã xem: chợ nổi lúc 5:11 với ghe hàng, cây bẹo, tên ghe, thông báo chợ họp.

## V22 — đợt 4: sinh thái (đàn, lãnh thổ, điều kiện hiếm)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **442/442 ✅**. Mới: `v22_ecology.test.ts` (10) — dữ liệu hợp lệ; đàn 2–3 con, đầu đàn Mightyena chỉ khi đàn đủ cấp; đánh 1 con → cả đàn hung hăng, đàn nhút nhát tản ra còn đầu đàn đánh; đầu đàn gục → đàn bỏ chạy; Tauros ngoài lãnh thổ không phản ứng, bước vào → cảnh báo → tấn công, ra xa → thôi đuổi; điều kiện hiếm theo giờ / thời tiết / vùng / nước, tỉ lệ ≈ cấu hình; spawner: đàn có chung id, ≤ 14 Pokémon; đêm sương trong rừng sinh Misdreavus |
| E2E mới (`v22_ecology.spec.ts`) | ✅ — vòng đỏ lãnh thổ khi cảnh báo, Tauros lao vào rồi bỏ đuổi, vòng tắt; đàn Poochyena + Mightyena đầu đàn đứng sát nhau, đánh 1 con cả đàn hung hăng; Pokémon hiếm báo một lần (không trùng thông báo "Pokémon hiếm"), `ecoSeen` ghi nhận |
| E2E hồi quy (v22 ×3, v13_can_tho, v8_vietnam, v18_events, adventure, v9_aquatic, v4_regions, perf, evolution, v3_events, overworld_visual) | 28/28 ✅ (2 luồng) |

Ảnh đã xem: vòng lãnh thổ quanh Tauros, đàn Poochyena với Mightyena, thông báo điều kiện hiếm.
Lỗi tìm thấy và sửa: Pokémon dưới nước có thể sinh nhiều con trong một nhịp, vượt giới hạn tổng (bị test giới hạn mới bắt được); thông báo trùng khi Pokémon hiếm xuất hiện.

## V22 — đợt 5: Hầm ngục 2.0

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **450/450 ✅**. Mới: `v22_dungeon2.test.ts` (8) — biến thể cố định theo ngày / độ khó, không trùng, đổi theo ngày; thưởng nhân hệ số, Mạch quặng thêm đồ, bảng gốc không bị sửa; Bầy đàn +2, Tinh anh +1, Địa chấn nhiều đá hơn ≥ 1,4×; bẫy đúng chỗ (sàn trống, xa cửa / phiến đá / nhau), nổ một lần; 4 hầm đều có vách nứt + rương bí mật, vách chắn đến khi đập, rương một lần mỗi lượt; Flash theo hệ / cấp |
| E2E mới (`v22_dungeon2.spec.ts`) | ✅ — ngày 4 Thường = Hang tối; không có Flash: lớp tối 0,93, HUD hiện "Hang tối"; bẫy nổ; bấm E ở vách nứt với Geodude Lv 20 → vách mở, đi bộ vào, mở rương +2 Great Ball, bấm lại không nhận thêm; vào lại với Pikachu Lv 12 → "Pikachu dùng Flash", lớp tối < 0,8 |
| E2E hồi quy (v6_dungeons, adventure, coop, smoke, v22 ecology / field_boat / dungeon2) | 16/16 ✅ |

Ghi chú: một lần chạy unit khi máy đang chạy e2e song song có 10 test server timeout; chạy lại riêng 26/26 và toàn bộ 450/450 đều qua.
Ảnh đã xem: hang tối với vòng sáng quanh người chơi, rương bí mật trong phòng vừa mở, hang sáng nhờ Pikachu.

## V22 — đợt 6: điều tra huyền thoại

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **454/454 ✅**. Mới: `v22_legend_clues.test.ts` (4) — 13 × 3 manh mối, id không trùng; mọi manh mối trên đất khô, không đè vật thể, đi tới được (BFS từ điểm xuất phát của bản đồ); chỉ hiện khi đã mở khóa và chưa bắt, mất đi khi đã đọc; hoàn tất sau 3; tóm tắt điều kiện |
| E2E mới (`v22_legend_clues.spec.ts`) | ✅ — Bờ San Hô: Lugia chưa mở → 0 manh mối; mở → 3; bấm E từng cái (thật), hộp thoại "Manh mối về Lugia: 3/3" + điều kiện; cửa sổ thu phục 6 lượt (5 + 1); đi lại vùng → không hiện lại |
| E2E hồi quy (v22 ×5, v6_rayquaza, v7_regions, v4_regions, v13_can_tho, v8_vietnam, adventure, v6_dungeons, evolution, v18_events) | 25/25 ✅ |

Ảnh đã xem: đốm sáng manh mối ở bìa rừng dừa (đã tăng độ sáng sau lần xem đầu vì quá mờ), hộp thoại hoàn tất.

## V22 — đợt 7: nhật ký, bảng danh tiếng, bản đồ

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **458/458 ✅**. Mới: `v22_journal.test.ts` (4) |
| E2E mới (`v22_journal.spec.ts`) | ✅ — bảng danh tiếng (Cà Mau Quen mặt, còn 15 điểm, quà hạng sau), lọc Vùng này, ⚓ trên bản đồ |
| E2E hồi quy (v22_trainer_rep, v8_vietnam, adventure, v13_can_tho, v16_profile) | 11/11 ✅ |

Ảnh đã xem: bảng danh tiếng 3 tỉnh, nhật ký lọc Vùng này, bản đồ sương mù với bến Đất Mũi.

## V22 — đợt 8: bảo tồn & hậu truyện 3 tỉnh

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **462/462 ✅**. Mới: `v22_conservation.test.ts` (4). Sửa `v8_vietnam` (mục tiêu `activate` có thể là `eco:<tỉnh>`), `v13_can_tho` (Cần Thơ 11 nhiệm vụ) |
| E2E mới (`v22_conservation.spec.ts`) | ✅ |
| E2E hồi quy (v22 ×5, v8_vietnam, v13_can_tho, v9_aquatic, adventure) | 13/13 ✅ sau khi sửa `adventure.spec.ts` |

Lỗi test tìm thấy: `adventure.spec.ts` xóa mọi Pokémon hung hăng rồi lấy một con hoang dã để bắt — với đàn (V22), cả đàn có thể cùng hung hăng nên đôi khi không còn con nào (`Cannot set properties of undefined`). Test giờ chờ một Pokémon hoang dã yên bình xuất hiện; chạy lại 4/4.
Ảnh đã xem: điểm trồng đước, thông báo Hồi phục / Trù phú, quà Trù phú, bảng Danh tiếng có sinh thái (đã rút gọn thông báo sau lần xem đầu vì chữ chồng nhau).

## V22 — đợt 9: sự kiện vùng miền

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **466/466 ✅**. Mới: `v22_regional_events.test.ts` (4) |
| E2E mới (`v22_regional_events.spec.ts`) | ✅ |
| E2E hồi quy (v18_events, v3_events, v22_conservation) | ✅ — Meteor Shower (v18) trượt 1 lần khi chạy song song, chạy lại riêng 2/2 và lặp 4 lần song song 4/4 ✅ (chập chờn do tải, không liên quan) |

Ảnh đã xem: lời báo Mùa cá linh về và dòng sự kiện trên HUD, cửa sổ Sạp lễ hội trái cây (tiêu đề, lời chào, 4 món giảm giá).

## V22 — đợt 10: nhiệm vụ phân nhánh

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **470/470 ✅**. Mới: `v22_branching.test.ts` (4). Sửa `v13_can_tho` (Cần Thơ 14 nhiệm vụ) |
| E2E mới (`v22_branching.spec.ts`) | ✅ |
| E2E hồi quy (adventure, v8_vietnam, v13_can_tho, v22_journal, v22_conservation, v22_trainer_rep, v22_regional_events) | 11/11 ✅ |

Lỗi tìm thấy khi viết: hai phần thưởng trỏ tới vật phẩm không có trong game (`hyperpotion`, `diveball`) — test dữ liệu bắt được, đã đổi sang Super Potion / Great Ball. Marker "Trà Sư" ban đầu nằm ngoài khu, đã dời vào trong.
Ảnh đã xem: hộp thoại 3 hướng + "Để tôi suy nghĩ thêm", nhật ký hiện "Phân xử chuyện bến ghe — Chia giờ…" và chỉ 2 mục tiêu của nhánh.

## V22 — đợt 11: chiến đấu & bạn đồng hành

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **475/475 ✅**. Mới: `v22_combat.test.ts` (5) |
| E2E mới (`v22_combat.spec.ts`) | ✅ |
| E2E hồi quy (smoke, online_modes, coop, adventure, v22_trainer_rep, v22_ecology, perf, v6_summon) | 18/19 ✅ khi chạy song song; `v6_summon` đạt khi chạy riêng. Lặp 4 lần song song: 3/4 trượt ở các bước đo thời gian (`busy` / `cooldown`) — **trên bản trước khi sửa cũng trượt y hệt 3/4**, nên là lỗi chập chờn có sẵn của test khi máy bị tải, không do thay đổi này |

Ảnh đã xem: "Bulbasaur hái quả giúp bạn! / Hái được: Poké Ball ×1", "Hơi Nước!" trên Rattata bị Bỏng trong Adventure.

## V22 — đợt 12: hiệu năng

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **478/478 ✅**. Mới: `v22_perf.test.ts` (3). Đối chứng: trên bản trước khi sửa, test quét mối đe dọa trượt (24 000 lần) |
| E2E mới (`v22_perf.spec.ts`) | ✅ — census trước / sau 9 lần chuyển vùng: object 1231 → 1231, listener game 21 → 21, bàn phím 27 → 27, scale 18 → 18, timer 0 → 0, tween 514 → 514; 150 Pokémon xa: 150/150 giảm tần suất, 0,10 ms / bước |
| E2E hồi quy (adventure, v22_ecology, v9_aquatic, v22_combat, smoke, perf, v4_regions) | 14/14 ✅ |

Ghi chú: bản nháp đầu tiên thêm một LOD thứ hai trong `world.ts`; khi viết test phát hiện `wildAI.ts` đã có LOD → gỡ bản nháp (tránh hệ thống trùng) và chỉ tối ưu bản có sẵn.

## V22 — đợt 13: thiết kế bản đồ (Cần Thơ vùng mẫu)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **484/484 ✅**. Mới: `v22_map_cantho.test.ts` (6). Sửa `v13_can_tho` (15 nhiệm vụ), `v21_gathering` (luật phao mới: hướng tâm hồ **hoặc** ô nước gần nhất cho bờ sông / mương) |
| E2E mới (`v22_map_cantho.spec.ts`) | ✅ |
| E2E hồi quy (v13_can_tho, v22_field_boat, v21_world, v22_regional_events, v22_branching, v22_conservation, v8_vietnam, v22_journal, overworld_visual, v22_combat, v3_events, v18_events) | ✅ |

Kiểm tra hiện trạng: ảnh chụp cho thấy miệt vườn là bãi cỏ trống (habitat `farm` chỉ có luống rau theo toạ độ cứng của Thung Lũng). Lỗi tìm thấy nhờ test có sẵn: rương `chest-ct-garden` nằm sát mép mương mới → dời 1 ô. Lỗi tìm thấy khi lặp test sự kiện vùng miền: ổ bùng phát ở Đồng Nước Nổi đôi khi sinh 0–3 Pokémon vì vị trí rơi vào nước → `group()` thử thêm vị trí; test cũng đổi sang tính tiến độ bằng id Pokémon của sự kiện. Lặp 12 lần song song: 12/12 ✅.
Ảnh đã xem: miệt vườn (liếp cây, dừa, luống, mương, cầu ván), câu cá trên mương, hốc bí mật sau khi cắt bụi + thông báo rương.

## V22 — đợt 14: thiết kế bản đồ (An Giang & Cà Mau theo mẫu Cần Thơ)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **494/494 ✅**. Mới: `v22_map_angiang_camau.test.ts` (10) |
| E2E mới (`v22_map_angiang_camau.spec.ts`) | ✅ |
| E2E hồi quy (v8_vietnam, v9_aquatic, v10_gen9, v11_pmd, v13_can_tho, v22_branching, v22_conservation, v22_field_boat, v22_journal, v22_map_cantho, v22_perf, v22_regional_events, v22_trainer_rep, overworld_visual, online_modes, coop) | 26/26 ✅ (sau khi sửa) |

Kiểm tra hiện trạng: ảnh chụp cho thấy Đồng Nước Nổi là bãi cỏ trống có vài bụi cỏ cao; rừng đước Cà Mau đã có lạch và bãi bùn nhưng không có gì để làm ngoài đánh Pokémon. Lỗi dữ liệu tìm thấy: 2 rương Cà Mau trùng id.
Lỗi tìm thấy nhờ test có sẵn: 1 biển chỉ đường, 3 điểm bảo tồn và điểm đến cổng từ Cần Thơ nằm trong ô ruộng ngập → dời lên bờ đê. Lỗi tìm thấy khi chạy hồi quy: bản đầu của "dời save cũ ra khỏi nước" kéo người chơi đang ngồi ghe lên bờ (`v22_field_boat`) → bỏ qua khi save đang trên ghe.
`coop.spec.ts` (menu co-op, di chuyển của khách) trượt 1 lần khi chạy cùng loạt, qua khi chạy riêng và khi lặp — lỗi chập chờn về focus bàn phím giữa 2 tab, không liên quan bản đồ.
Ảnh đã xem: ruộng ngập + bờ đê + lúa đứng, hốc rễ đước sau khi cắt (thông báo rương), hốc đá Thất Sơn + bảng hoàn thành nhiệm vụ Cô Sáu.

## V22 — đợt 15: đền huyền thoại, bước 1 (sơ đồ + dựng đền)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **502/502 ✅**. Mới: `v22_shrines.test.ts` (8). Cập nhật theo vị trí mới: `legendary`, `v17_maps`, `v4_regions` |
| E2E mới (`v22_shrines.spec.ts`, 12 đền / 7 bản đồ) | ✅ |
| E2E hồi quy (evolution, v3_events, v22_legend_clues, v4_regions, adventure, v6_rayquaza, v22_map_angiang_camau) | 17/17 ✅ (sau khi sửa toạ độ Articuno, Lugia, Rayquaza, Celebi trong test) |

Lỗi sơ đồ tìm thấy khi ráp lên bản đồ (công cụ `check-shrines.ts` / `place-shrines.ts`): cổng lăng Regi chỉ mở 1 trong 2 lớp tường; lối mòn Darkrai có bước chéo; cầu thang Rayquaza không chạm mép; đê Lugia hướng ra biển → đã sửa trong `gen-shrines.py`. Bản đầu cắt góc mọi ô nền làm hở 4 góc tường lăng → chỉ cắt ô không sát sân. Toạ độ thiết kế của 13 / 22 đền đè NPC, nhà, cổng, trạm hoặc hốc bí mật → dời tới ô hợp lệ gần nhất (bảng ở `LEGENDARY_SHRINES.md` mục 7).
2 test V7 phía server (EXP Alpha, lịch sự kiện) quá giờ 1 lần khi chạy cả bộ, qua khi chạy riêng và khi chạy lại cả bộ — do tải máy, không liên quan bản đồ.
Ảnh đã xem: Hang Tâm Linh (Mewtwo, vành pha lê tím + lõi), Đảo Xoáy Bạc (Lugia), Tháp Chuông (Ho-Oh), Đại Điện (Groudon).


## V22 — đợt 16: giao diện điện thoại (nút không đè, chữ không tràn)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **502/502 ✅** |
| E2E mới `v22_mobile_layout.spec.ts` (dọc 390×844 + ngang 844×390: nút menu chính / chọn khởi đầu trên màn hình, không chồng nhau, chữ vừa nút; HUD HP + bảng đội trong khung; danh sách vùng ở tab Bản đồ không đè dòng) | 4/4 ✅ — chạy trên code cũ: 3/4 ❌ (bắt đúng các lỗi đã sửa) |
| E2E Mega (`evolution.spec.ts`, `v21_mega_sprites.spec.ts`) | ✅ |
| Toàn bộ E2E | **chưa chạy xong**: hệ thống dừng tiến trình ở 5/73 vì máy thiếu bộ nhớ (không phải test lỗi) |

Ảnh đã xem (dọc + ngang): menu chính, chọn khởi đầu, HUD Phiêu lưu và Việt Nam Odyssey, Đội hình, Túi, Nhiệm vụ, Bản đồ, Pokédex, PC, Sự kiện, Hộ chiếu, Cài đặt, Cửa hàng, hội thoại, HUD Sinh tồn, thẻ lên cấp.


## V22 — đợt 17: đền huyền thoại, bước 2–6 (nghi lễ, asset, thánh vật / lang thang, bản đồ đền, hiểm họa)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **518/518 ✅**. Mới: `v22_rituals.test.ts` (16). Cập nhật theo thiết kế mới: `legendary` (Cresselia thành đền, Kyogre / Dialga / Palkia / Arceus sang bản đồ đền, lang thang cần cờ), `v17_maps` (2 mặt phẳng), `v22_shrines` (32 điểm), `v22_legend_clues`, `v22_field_boat` (vách nứt Mew), `v4_regions` |
| E2E mới `v22_rituals.spec.ts` | 3/3 ✅ (Articuno: nghi lễ + arena + hiểm họa + rời trận; Groudon: thánh vật + đứng yên + lưu / tải giữa trận; Mesprit + Xoáy Nước Sâu → Vực Nguyên Hải → Kyogre) |
| E2E hồi quy (`v22_shrines`, `evolution`, `v3_events`, `v6_rayquaza`) | 10/10 ✅ (sau khi đổi test sang gọi huyền thoại bằng nghi lễ — `summonShrine` trong `bossHelpers.ts`) |
| E2E hồi quy chung (`adventure`, `v22_mobile_layout`) | 8/8 ✅ |
| Toàn bộ E2E | chưa chạy (máy thiếu bộ nhớ, xem đợt 16) |

Lỗi tìm thấy khi làm: hiểm họa `floor` có vòng lặp vô hạn khi chọn ô → đã sửa; cổng Kyogre đặt trên biển không có lối đi bộ → thêm đê đá nối bờ phía tây.
Ảnh đã xem: đền Articuno (cột băng, vòng niêm phong, vòng cảnh báo), Zapdos (cột thu lôi), Vực Nguyên Hải (Kyogre).


## V22 — đợt 18: mục "Có gì mới" + kiểm tra lại toàn bộ

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **520/520 ✅** (518 + `v22_whatsnew.test.ts` 2) |
| E2E mới `v22_whatsnew.spec.ts` (máy tính 1280×720, điện thoại dọc 390×844, ngang 844×390) | 3/3 ✅ — lần đầu nút đè chữ "POKÉMON SURVIVOR" trên điện thoại dọc → nút biểu tượng ✨ + tiêu đề thu gọn bên cạnh |
| **Toàn bộ E2E** (47 spec, 1 luồng, 22 phút) | **78 qua, 1 bỏ qua, 0 lỗi** — lần đầu chạy trọn bộ sau đợt 16 (trước bị dừng ở 5/73 vì thiếu bộ nhớ; chạy 1 luồng thì đủ bộ nhớ) |
| Triển khai GitHub Pages (`main` 3103d747) | ✅ |

Ảnh đã xem: menu chính và danh sách "Có gì mới" trên máy tính và điện thoại dọc.


## V22 — đợt 19: đền ẩn + dimension riêng cho huyền thoại Tầng 1

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **527/527 ✅**. Mới: `v22_secret_shrines.test.ts` (7). Cập nhật theo thiết kế mới: `legendary` (Thung Lũng chỉ còn 3 lối vào), `v17_maps` (bản đồ của lối vào + mặt phẳng của đền), `v4_regions` (cổng Thần Điện ẩn), `v22_shrines` (30 sơ đồ; mặt phẳng đi từ chỗ đến của từng lối vào) |
| E2E mới `v22_secret_shrines.spec.ts` | 2/2 ✅ — đập tảng đá → lối vào Mew hiện ra, bị phong ấn khi chưa hạ Mewtwo, vào Bí Cảnh đúng khoang Mew, cổng về đáp cạnh lối vào, tải lại vẫn nhớ; 13 bản đồ mới tải không lỗi, đúng đền |
| E2E cập nhật (`v22_rituals`, `v3_events`, `v6_rayquaza`, `v22_shrines`, `v22_legend_clues`, `v22_field_boat`, `evolution`) | 17/17 ✅ — Lugia: xoáy nước đóng khi trời quang, mở khi mưa, trong Biển Xoáy Bạc luôn mưa; Kyogre: lối vào không tồn tại tới khi đọc đủ 3 manh mối. `evolution` (cửa hàng) hỏng 1 lần khi chạy chung 7 file (bấm phím chậm), chạy riêng 5/5 ✅ |
| Toàn bộ e2e (`--workers=1`, 23,8 phút) | 79 passed / 1 skipped / 1 failed → `v21_world` (hái bụi): sau khi dịch chuyển tới bụi, Pokémon đồng hành (hái quả giúp, V22) hái mất trước khi bấm E — test đua với tính năng đồng hành, trước đây qua nhờ có Pokémon hoang ở gần. Sửa test: tạm dừng việc hái hộ trong đoạn hái tay → chạy lại 3 lần 6/6 ✅ |

Ảnh đã xem: lối vào Mew vừa lộ ra, khoang Mew trong Bí Cảnh Thung Lũng, Biển Xoáy Bạc (mưa), Lõi Dung Nham, Thế Giới Đảo Ngược, Tầng Trời, khoang Zapdos ở Bí Cảnh Bờ Biển.

## V22 — đợt 20: nhiệm vụ theo đền ẩn

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **531/531 ✅** (mới `v22_quest_guide.test.ts`: 4) |
| E2E `v22_secret_shrines` (3, mới: chỉ đường nhiệm vụ Zapdos qua 3 bước, bản đồ vẽ vòng tròn), `v22_journal`, `adventure` | 8/8 ✅ |
| Toàn bộ e2e (`--workers=1`, 19,5 phút) | **81 passed / 1 skipped / 0 failed ✅** |

Phát hiện khi viết e2e: nhiệm vụ đang theo dõi bị đặt lại về nhiệm vụ đầu tiên mỗi lần chuyển bản đồ (có từ trước) — đã sửa (lưu trong save).

## V22 — đợt 21: cảnh trí dimension + tin đồn lối vào ẩn

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **533/533 ✅**. Mới: cảnh trí (`v22_secret_shrines.test.ts`), tin đồn (`v22_quest_guide.test.ts`) |
| E2E `v22_secret_shrines` (NPC kể tin đồn; 13 mặt phẳng tải không lỗi, có ảnh) | ✅ |

Ảnh đã xem: Khe Nứt Tâm Linh (tinh thể, đá rune), Thế Giới Đảo Ngược, Thiên Đài Cầu Vồng (hoa, nấm), Bí Cảnh Núi Tuyết. Bỏ ô vết nứt / tấm trăng khỏi cảnh trí sau khi xem ảnh (trông như chướng ngại / ô nghi lễ).

## V23 — đợt 22: tỉnh Vĩnh Long (+ chạy lại toàn bộ cho đợt 21)

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **539/539 ✅**. Mới: `tests/v23_vinh_long.test.ts` (6; cân bằng Torkoal Lv 32: đội Nước 34 s, đội Cỏ 262 s). Cập nhật danh sách tỉnh trong `v17_maps`, `v8_vietnam`, `v22_conservation`, `v22_journal` |
| E2E toàn bộ (49 file, chạy theo 5 nhóm, 1 worker) | **82 ✅ / 1 bỏ qua / 1 ❌** |
| E2E mới `v23_vinh_long` | ✅ (50 s) |

Lỗi duy nhất: `coop.spec.ts:69` (khách giữ phím D 600 ms nhưng chủ phòng thấy dịch < 10 px: 3912 so với > 3922). **Lỗi có sẵn, không do đợt này**: cất tạm toàn bộ thay đổi (`git stash -u`), build lại commit `f6aa5855` và chạy riêng `coop.spec.ts` → cùng lỗi ở cùng dòng; 2 test co-op còn lại qua. Nghi do máy thiếu bộ nhớ / trang khách chạy nền bị giảm tốc khung hình — chưa sửa.

Ảnh đã xem (e2e Vĩnh Long): bến, Văn Thánh Miếu, cù lao, Torkoal trong arena, trang hộ chiếu.

## V23 — đợt 23: tỉnh Trà Vinh

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **545/545 ✅** (chạy toàn bộ). Mới: `tests/v23_tra_vinh.test.ts` (6; cân bằng Trevenant Lv 36: đội Lửa 33 s, đội Nước 230 s). Test điểm câu chung bắt được `tv-fish-2` xa nước → đã dời sát kênh. `server_v7` (bộ lập lịch sự kiện thế giới) lỗi 1 lần khi chạy cả bộ, chạy riêng 3/3 qua — chập chờn do timing, không liên quan |
| E2E mới `v23_tra_vinh` | ✅ (49 s) |
| E2E liên quan: `v23_vinh_long` (cổng đổi đích), `v8_vietnam`, `v13_can_tho`, `v22_conservation`, `v22_journal`, `v22_map_cantho` | ✅ 8/8 |

Ghi chú e2e: đội thử Lv 34 có Staravia lên cấp → màn tiến hóa (modal) chặn boss xuất hiện; dùng đội không tiến hóa ở mức cấp này. Mục tiêu "đuổi 4 Pokémon" gửi đúng sự kiện `defeat` mà game phát khi hạ Pokémon hoang.

Ảnh đã xem: thành phố, Ao Bà Om (ao, Ông Ba), Chùa Hang, Trevenant trong vòng đá rừng dầu, biển Ba Động (bãi cát, bến ghe, quán), hộ chiếu.

## V24 — đợt 24: NPC pixel có hoạt ảnh + starter Gen 1–9

| Bước | Kết quả |
|---|---|
| `npm run build`, `tsc --noEmit` | ✅ |
| Unit | **550/550 ✅**. Mới: `tests/v24_npc_looks_starters.test.ts` (mọi dáng 16×16 đúng ký tự; mọi NPC/HLV trên mọi bản đồ có mẫu cố định; ≥ 12 dáng, > 90% NPC có texture riêng; giới / tuổi theo danh xưng, nón lá ở Mekong; 27 starter đúng hệ cỏ / lửa / nước; tab chiến dịch mở trước). `tests/v5_official_art.test.ts` bỏ phần ảnh trainer (giữ ảnh vật phẩm) |
| E2E mới `v24_npc_starters` | ✅ 2/2 (làng cổ điển: > 5 NPC, > 4 mẫu, đều có anim idle/walk; ▶×3 → Gen 4, phím 2 → Chimchar; Cà Mau: mở ở Hoenn, ◀×3 → Gen 9, phím 2 → Fuecoco) |
| E2E toàn bộ (5 nhóm, `--workers=1`) | ✅ tất cả |

Lỗi tìm thấy và đã sửa: phím 3 dùng chọn starter lọt xuống thành lệnh đội "follow" → bảng chọn giờ chặn input cảnh (modal). `v23_vinh_long` / `v23_tra_vinh` thỉnh thoảng hỏng do HLV thử lên cấp thế giới, HP tính lại rồi ngất → test đặt lại HP ngay trước trận boss (lỗi của test, có cả ở commit trước).

Ảnh đã xem: bảng chọn starter (Gen 1, Gen 4, Hoenn, Gen 9), làng cổ điển và Cà Mau với NPC đa dạng (nón lá, áo dài, trẻ em, cụ bà).
