# PROJECT AUDIT

Ngày kiểm tra: 2026-10-24 · Phiên bản trước khi nâng cấp: **0.1.0** (Phase 1 Survivor) · Sau nâng cấp: **0.2.0**

## 1. Công nghệ & phiên bản
| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Engine | Phaser 3.88.2 (WebGL, `pixelArt`, `roundPixels`, `Scale.RESIZE`) | giữ nguyên |
| Ngôn ngữ | TypeScript 5.6 (strict, `isolatedModules`) | giữ nguyên |
| Build | Vite 5.4 | giữ nguyên |
| Test | Vitest 2.1 (unit) · Playwright 1.48 qua Microsoft Edge (e2e) | mở rộng |
| Lưu trữ | IndexedDB (`pokemon-survivor`), schema v2 → **v3** | migration có test |

## 2. Hiện trạng trước nâng cấp (v0.1.0)
| Hệ thống | Phân loại | Nhận xét kiểm chứng |
|---|---|---|
| Combat engine (`World`, fixed-step 60Hz) | **Đã hoạt động** | test fixed-step, AI chọn kỹ năng, né telegraph đều pass |
| Ma trận 18 hệ, công thức sát thương | **Đã hoạt động** | đúng với main-series |
| Pokémon database | **Hoạt động nhưng cần nâng cấp** | 3 loài, chỉ số gõ tay, không có nguồn đối chiếu |
| Skill engine | **Hoạt động nhưng cần nâng cấp** | 18 kỹ năng; thiếu beam/hút máu/status-area thực dụng |
| Animation | **Hoạt động nhưng cần nâng cấp** | chỉ nhún/squash 1 ảnh tĩnh, không có khung hình |
| VFX | **Hoạt động nhưng cần nâng cấp** | ~10 emitter cứng trong GameScene, không quality setting, không tái sử dụng |
| Asset manager | **Chưa triển khai** | toàn bộ texture sinh bằng code, không manifest |
| UI | **Đã hoạt động** (Survivor) | chưa có chọn chế độ/Pokédex/túi/bản đồ |
| Save system | **Đã hoạt động** | v2, chưa có Collection/Pokédex/Inventory |
| Open World | **Chưa triển khai** | — |
| Hiệu năng | **Đã hoạt động** | sim 0.2–0.8 ms với 260 entity |

### Lỗi/nợ kỹ thuật phát hiện khi audit
1. `GameScene` ôm toàn bộ rendering → không tái sử dụng được cho chế độ khác (**đã tách `WorldRenderer`**).
2. `World` gắn cứng `WORLD_W/H`, director, gem, level-up của Survivor (**đã tham số hóa bằng `mode`**).
3. Danh sách chiêu mộ Survivor lấy *mọi* Pokémon trong data → thêm loài mới sẽ phá cân bằng (**đã dùng `recruitPool` từ save**).
4. Menu bấm Enter vào thẳng Survivor → không còn phù hợp khi có 2 chế độ (**đã có màn chọn chế độ**).

## 3. Quyết định giữ / sửa / viết mới
- **Giữ nguyên** combat engine, type chart, damage, skill selector, director, upgrades — Open World dùng **chung** `World` qua `mode: 'adventure'` (không có engine thứ hai).
- **Refactor có kiểm chứng**: rendering → `WorldRenderer` (Survivor e2e chạy lại pass sau refactor).
- **Viết mới**: map/chunk, wild AI, capture, quests, dungeon, progression, UI phiêu lưu, data provider, asset pipeline.

## 4. Lỗi phát hiện & sửa trong quá trình nâng cấp
| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Crash khi restart scene phiêu lưu (`reading '0'`) | tween đung đưa cây đã bị xóa nhưng `onChunkUnload` vẫn đọc `targets[0]` | xóa danh sách sway trước khi unload chunk, guard `targets?.[0]` |
| Crash `setSize` khi vào hang | Scene tái sử dụng instance, giữ tham chiếu tới Rectangle đã hủy | reset trong `init`, kiểm tra `active` |
| Bóng bắt trúng con khác con đang ngắm | lấy con đầu tiên trong bán kính | ưu tiên mục tiêu ngắm, sau đó con gần điểm rơi nhất |
| Nông trại gần như không spawn Rattata | spawn chỉ ở vòng 560–1050px, vùng nhỏ bị bỏ qua | spawn 380–1050px nhưng **bắt buộc ngoài khung hình** |
| Mưa không hiển thị | `setFrequency` gọi mỗi frame reset bộ đếm emitter | chỉ start/stop khi đổi trạng thái |
| Cây thông "rỗng ruột" | tile thông Kenney trùng màu cỏ | tint nhẹ cho thông/cây cao |
| Sàn rừng kiểu bàn cờ | chọn tile theo hash từng ô | dùng noise để tạo mảng bóng râm |
| Fog bản đồ lộ hình hồ/đường | alpha 0.9 | phủ kín (alpha 1) |
| Banner vùng chồng nhau | không hủy banner cũ | chỉ giữ banner mới nhất |

## 5. Kết quả kiểm chứng (0.2.0)
- `npm run build`: **pass** (tsc strict + vite).
- Unit: **74/74 pass** (core, world, save, adventure).
- E2E (Edge): **9/9 pass** — Survivor smoke ×3, stress 250 địch, Open World luồng chính, hầm ngục trọn vẹn, chuyển chế độ + bộ nhớ, mobile, streaming chunk.
- Bộ nhớ (ép GC, 6 vòng Phiêu lưu ↔ Menu ↔ Sinh tồn): 18.5 → 19.3 MB (+0.8 MB) → không rò rỉ đáng kể.
- Console: 0 lỗi trong mọi test e2e.
