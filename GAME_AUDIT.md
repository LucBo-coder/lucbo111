# GAME AUDIT — Pokémon Survivor (V20)

Ngày: 2026-10-26 · Nhánh: `improve/complete-game-v1` · Phiên bản gốc: 0.14.0 + các mục "Chưa phát hành" trong CHANGELOG.

Báo cáo này viết từ việc đọc mã nguồn, dữ liệu và chạy build/test thật, không phỏng đoán. Mục nào chưa kiểm chứng được thì ghi rõ.

## 0. Baseline trước khi sửa

| Kiểm tra | Kết quả |
|---|---|
| `npm run build` (tsc + vite) | ✅ qua, 40 s |
| `npx vitest run` | ✅ 43 file, 370/370 test |
| Git | sạch, tạo nhánh `improve/complete-game-v1` từ `main` (`b7eae958`) |

## 1. Tài liệu đã đọc

GAME_DESIGN.md, OPEN_WORLD_DESIGN.md, EVOLUTION_EQUIPMENT_MEGA.md, ONLINE_SERVER.md, ARCHITECTURE.md, CHANGELOG.md, README.md, TASKS.md, GAMEPLAY_AUDIT.md, package.json. Có đủ tất cả, không thiếu file nào trong danh sách của prompt. **MAP_DESIGN.md, GAMEPLAY_IMPROVEMENTS.md, TEST_REPORT.md chưa tồn tại** (đã tạo trong đợt này).

## 2. Kiến trúc (xác nhận từ mã)

- `src/core/` mô phỏng thuần TypeScript (không Phaser): `world.ts` là engine chiến đấu dùng chung cho Sinh tồn / Phiêu lưu / Việt Nam Odyssey / PvP / co-op (2 phe, fixed step 60 Hz, tất định theo seed).
- `src/adventure/` logic thế giới mở; `src/scenes/` Phaser (AdventureScene 1.9k dòng, AdventureUI 1.7k dòng); `src/net/` online (relay Cloudflare / PeerJS / BroadcastChannel); `server/` máy chủ Thế giới online (Node hoặc Durable Object).
- Bản đồ thế giới mở: `ValleyMap` (layout JSON + chi tiết thủ tục theo noise), chunk 16×16 tile nạp/gỡ theo camera; hầm ngục: `DungeonMap` (ASCII).
- Dữ liệu: 1025 loài (PokéAPI), 139 vật phẩm, 28 nhiệm vụ Phiêu lưu (sau đợt này), 9 bản đồ vùng (6 cổ điển + 3 tỉnh Việt Nam), 4 hầm ngục.

## 3. Kiểm kê tài nguyên

| Loại | Hiện có | Ghi chú |
|---|---|---|
| Tileset | Kenney Tiny Town / Tiny Dungeon (CC0) + tile vẽ bằng code + sàn IcyEthics | `src/render/tileset.ts`, atlas `ow_tiles` |
| Sprite Pokémon | ~40 loài vẽ tay bằng code, bộ PMD (nếu tải), gói chính thức chỉ dùng cá nhân (gitignore) | không có gói chính thức → hình bóng tạm theo hệ |
| Animation | 14 khung dẫn xuất từ 1 bản vẽ (idle/walk/attack/cast/hit/faint) | chưa vẽ tay (đã ghi trong TASKS) |
| VFX | thư viện 18 hệ, pool, theo chất lượng | `src/render/vfx.ts` |
| Icon | 18 hệ, 14 trạng thái, icon cho mọi chiêu (ghép), item | pixel art vẽ từ bản đồ ký tự |
| NPC | tile Kenney hoặc ảnh trainer Showdown (gói cá nhân) | |

Không phát hiện tài nguyên tải thừa nghiêm trọng: sinh vật được tạo theo nhu cầu (`lazyCreatures`), bundle đã tách 4 chunk.

## 4. Phân loại tính năng

### Đã hoàn thiện (có test)
Combat 18 hệ + công thức sát thương; 14 trạng thái; IV/EV/Nature/Friendship; tiến hóa theo luật PokéAPI; Mega; trang bị 30+ món; AI 6 vai trò + máy trạng thái + né telegraph; hệ sinh thái hoang dã (ngủ, ăn, chạy, đuổi, về lãnh thổ); thu phục Gen III/IV; nhiệm vụ data-driven; 4 hầm ngục 3 độ khó; BossPhaseManager + bắt huyền thoại sau WEAKENED; sự kiện thế giới; cửa hàng; 3 ô lưu; co-op/PvP/Thế giới online.

**Combo nguyên tố (Phần 3.3)**: đã đầy đủ — `src/core/synergy.ts` `COMBOS`: Hơi Nước (Nước lên mục tiêu Bỏng ×1.5, xóa bỏng, lan 80 px), Vỡ Băng (Đá/Giác đấu/Thép/Đất lên Đóng băng ×2, xóa băng), Quá Tải (Điện lên Tê liệt/Choáng ×1.2, nảy 2 mục tiêu), Cháy Lan (Lửa lên Hút máu ×1.3, lan 90 px), Kịch Độc (Độc lên Độc ×1.3). Giới hạn: 2 s / mục tiêu (`COMBO_COOLDOWN`), có sự kiện `combo` để hiển thị. Chỉ chạy ở Sinh tồn (chủ ý, giữ cân bằng Phiêu lưu). **Không cần sửa.**

### Chưa hoàn thiện / thiếu (so với prompt)
| Hạng mục | Hiện trạng trước đợt này |
|---|---|
| Kỹ năng chủ động (3.2) | **Không có**: người chơi chỉ ra lệnh chung, không kích hoạt được chiêu cụ thể |
| Làng khởi đầu (2.2 Khu 1) | Thiếu tòa **Trung tâm Pokémon** (y tá đứng ngoài trời), **bảng nhiệm vụ**, khu hướng dẫn. PC chỉ có ở phòng thí nghiệm |
| Trại huấn luyện (2.2 Khu 6) | **Không có** |
| NPC đi lại / lịch hoạt động (5) | **Không có**: mọi NPC đứng yên (chỉ nhún tại chỗ) |
| Câu cá, thu thập nguyên liệu (Khu 2, 4) | Không có hệ thống |
| Rừng Ngọc Lục Bảo / Khu Rừng Thiêng thành map riêng | Chưa (là khu trong Thung Lũng) |
| Boss Raid nhiều phase online, bắt hoang dã qua server | Chưa (đã ghi trong TASKS 0.14.0) |

### Có lỗi (tìm thấy bằng chứng trong mã)
| ID | Lỗi | Bằng chứng | Mức |
|---|---|---|---|
| BUG-NET-1 | **Phần thưởng co-op có thể mất** khi mạng chập chờn: hàng đợi gửi của relay (client) giữ tối đa 400 tin và xóa tin **cũ nhất** — chủ phòng gửi snapshot 10 tin/s nên sau ~40 s rớt mạng, tin `coopLoot` gửi trước đó bị đẩy ra | `src/net/transport.ts` `send()`: `queue.splice(0, len - MAX_QUEUE)` | P0 |
| BUG-NET-2 | Cùng lỗi ở **máy chủ relay** (`MAX_BUFFER = 400`, xóa cũ nhất khi khách vắng) và `coopLoot` không có id/xác nhận nên mất là mất hẳn | `pokemon-server/src/room.ts` (repo riêng) + `src/net/coop.ts grant()` | P0 |

Không tìm thấy bằng chứng **nhân đôi** phần thưởng: relay chỉ đệm khi bên nhận không có socket và gửi bù một lần; PeerJS là kênh tin cậy.

### Cần cải tiến (không phải lỗi)
- Pokémon chỉ đi theo HLV, người chơi ít quyết định chiến thuật trong giao tranh → giải quyết bằng kỹ năng chủ động.
- `GAME_DESIGN.md` trước đó mô tả bản Phase 1 (đã viết lại ở commit `b7eae958`).

## 5. Các mục prompt yêu cầu nhưng KHÔNG thay đổi (có lý do)
- **AI chiến đấu (4.1)**: đã có test chống rung / chống kẹt / bám mục tiêu (`tests/v2_combat.test.ts`, `v3_ai_reach.test.ts`). Không tái hiện được lỗi "đứng yên / giật / dồn tọa độ" nên không sửa mù. Chỉ thêm nhánh di chuyển cho chiêu chủ động.
- **Boss (6)**: BossPhaseManager đã có state machine, telegraph, giới hạn sát thương khi chuyển phase, checkpoint (test `v6_boss`). Không thấy lỗi cụ thể.
- **Hiệu năng (9)**: đo trước đây bằng `scripts/bench.test.ts` + e2e perf; không có thiết bị di động thật để đo.
- **Server Thế giới online**: các test `server_v7` (14 test, nhiều client `ws` thật) qua; không có bằng chứng lỗi mới.

## 6. Ưu tiên đã chọn cho đợt này
| ID | Ưu tiên | Hạng mục |
|---|---|---|
| T20-1 | P0 | Kỹ năng chủ động (lõi + UI + phím + cảm ứng) |
| T20-2 | P0 | Thung Lũng: Trung tâm Pokémon (PC + y tá hồi máu), bảng nhiệm vụ, biển hướng dẫn, dân làng đi lại |
| T20-3 | P0 | Trại Huấn Luyện (khu mới, 3 HLV khác lối đánh, chuỗi 3 nhiệm vụ, rương tốt nghiệp) + 2 nhiệm vụ bảng tin |
| T20-4 | P0 | BUG-NET-1/2: phần thưởng co-op tin cậy (id + xác nhận + gửi lại + chống trùng) và hàng đợi relay ưu tiên giữ tin quan trọng |
| T20-5 | P1 | Tài liệu: MAP_DESIGN, GAMEPLAY_IMPROVEMENTS, TEST_REPORT, TASKS, CHANGELOG, GAME_DESIGN |

Kết quả từng hạng mục: xem `TASKS.md` (mục V20) và `TEST_REPORT.md`.
