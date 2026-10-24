# GRAPHICS UPGRADE PLAN

## Visual direction
Top-down 2D, pixel art kiểu GBA/NDS nâng cấp: viền tối 1 px, bảng màu tươi, mật độ 16 px thống nhất, ánh sáng môi trường bằng lớp nhân màu (multiply) + đèn cộng (additive glow).

## Đã làm (0.2.0)
| Hạng mục | Chi tiết | File |
|---|---|---|
| Môi trường CC0 | Kenney Tiny Town/Dungeon thay nền cỏ thủ tục ở chế độ Phiêu lưu | `render/tileset.ts` |
| Atlas thống nhất | 1 texture `ow_tiles` (Kenney + tile thủ tục), mỗi ô là 1 frame dùng chung cho tilemap và image | `render/tileset.ts` |
| Animation sinh vật | 6 animation / 14 khung, atlas riêng mỗi loài, máy trạng thái chọn idle/walk/attack/cast/hit/faint | `render/animation.ts`, `render/WorldRenderer.ts` |
| Thư viện VFX 18 hệ | preset hạt riêng mỗi hệ (lửa bốc lên, nước rơi, lá xoay, tia điện, băng vỡ, khói độc, bóng ma…) + flash/ring/slash/beam/sét; pool ảnh & graphics; ngân sách hạt toàn cục | `render/vfx.ts` |
| Đạn theo hệ | texture đạn riêng mỗi hệ (gió, axit, bóng tối, rồng, tiên…) + vệt đuôi (chất lượng Cao) | `render/pixelArt.ts` |
| Cỏ cao | 2 khung đung đưa, đổi tile mỗi 0.45 s | `ChunkView.animate` |
| Nước | 2 khung gợn sóng + 15 kiểu bờ cát × 2 khung | `tileset.ts` |
| Cây | đung đưa ±1.6° (tween, so le) | `AdventureScene.onChunkLoad` |
| Bóng | bóng elip dưới sinh vật, cây, tảng đá | — |
| Ngày/đêm | đồng hồ 24h (1 giây thật = 2 phút), hoàng hôn tím, đêm xanh thẫm, đèn cửa nhà, đèn cột dịch chuyển, đèn quanh HLV | `AdventureScene.updateAtmosphere` |
| Thời tiết | nắng / mưa (hạt rơi chéo + tối trời) / sương mù (lớp sương trôi) — đổi mỗi 3–6 phút | — |
| Hạt môi trường | bụi phấn ban ngày, đom đóm ban đêm | — |
| Hang | tối vĩnh viễn, đuốc nhấp nháy | — |
| UI | menu chọn chế độ, panel/tab thống nhất, badge hệ, icon pixel (không emoji cho icon chính) | `scenes/*` |

## Quality settings
| | Thấp | Trung bình | Cao |
|---|---|---|---|
| Số hạt | 35 % | 70 % | 100 % |
| Trần hạt sống | 350 | 900 | 1600 |
| Vệt đạn | ✕ | ✕ | ✓ |
| Mưa / sương | ✕ (30 %) | 60 % | 100 % |
| Cây đung đưa | ✕ | ✓ | ✓ |
| Hạt môi trường | ✕ | 50 % | 100 % |
| Đèn đêm | ✕ | ✓ | ✓ |
Khi số hạt sống > 60 % trần, lượng phát giảm một nửa tự động (giảm hiệu ứng khi entity tăng cao).

## Kế hoạch tiếp theo
1. Animation tiến hóa (silhouette trắng nhấp nháy → đổi sprite) khi có sprite dạng tiến hóa.
2. Tile chuyển tiếp góc trong (inner corners) cho đường đất.
3. Vùng tuyết/dung nham với tileset CC0 phù hợp mật độ 16 px.
4. Animation vẽ tay cho các loài chủ lực.
5. Nhạc nền theo vùng/thời gian.
