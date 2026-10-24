# Kiểm tra render overworld — 2026-10-25

## Nguyên nhân tìm thấy trong code

- `WorldRenderer` dùng origin `(0.5, 0.6)` cho cả sheet được tạo với padding 3 px và sheet PMD có canvas khác nhau giữa animation. Pikachu: Idle 40×56, Walk 32×40, Attack 80×80; Articuno: Idle 88×88, Attack 88×120. Origin tỷ lệ 0.6 làm điểm neo đổi theo chiều cao canvas.
- Tâm bóng là `u.y + u.radius * 0.75`, nên lệch khỏi tọa độ logic và phụ thuộc bán kính chiến đấu. Swimming có thêm offset tương tự.
- Scale PMD chung 2 và hệ số boss tiếp tục phóng to cả sải cánh. Không có phân loại bay/đi bộ; chỉ Rayquaza có altitude từ kỹ năng.
- Nhánh faint trả về trước khi áp dụng scale, altitude, depth và anchor chung. Idle thêm bob toàn thân; cast còn scale ngang riêng.
- Summon/recall dùng origin mặc định ở giữa và `fitScale(...,64)`, khác sprite sống. Recall không giữ frame/hướng/scale của Pokémon vừa thu hồi.
- Depth có override 9000 khi bay, rồi boss lại ghi đè bằng `u.y + 5`. Cây Adventure vẽ chân tại `py+22` nhưng depth `py+10`.
- `lazyCreatures` dùng box icons làm fallback và battle front khi thiếu icon; `padRows` cắt phần ảnh vượt 40×30, có thể mất cánh/đuôi.

## Quy tắc sau sửa

`Unit.x/y` là ground position. Không sửa mô phỏng, AI, chỉ số, collision radius hay công thức sát thương. Sprite đặt tại ground + spriteOffset − flightHeight − altitude kỹ năng; bóng đặt đúng ground; depth thân bằng ground.y ở mọi trạng thái.

`overworldVisual.ts` chứa locomotion (walk/crawl/low-flight/high-flight), visualScale, footAnchor, spriteOffset, shadowScale, flightHeight. Override theo ID species/form; shiny kế thừa profile. Scale của boss có giới hạn chỉ ở render, alpha/elite vẫn có hệ số hình ảnh riêng.

PMD dùng tọa độ tâm canvas và offset bàn chân từ Idle theo hướng, áp dụng nhất quán cho mọi sheet có kích thước khác nhau. **Không trim/căn lại từng action frame**, vì sẽ xóa chuyển động attack, recoil, squash được vẽ sẵn. Articuno, Zapdos và Rayquaza có pivot thân riêng, tránh dùng đuôi làm điểm tiếp đất khi đổi hướng. Đây là metadata hiệu chỉnh từ PNG hiện có; không giả định đã có landmark bàn chân chính thức cho toàn bộ 966 loài.

Sheet procedural/box-icon dùng đáy pixel có màu của base drawing cộng padding/outline, giữ anchor này qua mọi animation. Fallback quá lớn được fit bằng nearest-neighbour thay vì cắt. Pokémon cứu hộ và silhouette dùng cùng helper; recall sao chép frame, origin, scale và vị trí visual hiện tại. Chuyển động beam recall và bob khi bơi là chuyển động visual chủ ý.

## Debug

Bấm **F8** hoặc mở `/?debug&visualDebug`. Xanh cyan: ground; vàng: shadow center; hồng: sprite origin và đường nối render offset; đỏ: collision circle thực tế. Nhãn hiển thị flight height, render offset, pixel origin, ground depth. Overlay không thay đổi hitbox.

## Asset

- Đã quét alpha bounds của từng frame trong tất cả animation normal/shiny của **966 species PMD**. Chi tiết: `sprite-padding.json` (khoảng 9.8 MB).
- **54 sheet** có kích thước khác metadata: loader bỏ animation lỗi; nếu Idle/Walk lỗi, dùng fallback cho variant đó. Không đoán frame geometry hoặc tạo sprite cắt sai. Danh sách chính xác nằm trong `overworld-assets.json`.
- **77 ID trong dữ liệu Pokémon** thiếu pack overworld PMD riêng, bao gồm các Mega như Rayquaza Mega, Charizard Mega X/Y; **37 ID** còn phải dùng battle front fallback, gồm Miraidon, Iron Treads, Ting-Lu, Chien-Pao… Danh sách đầy đủ trong `overworld-assets.json`.
- Thứ tự: PMD directional khi hợp lệ/được bật → box icon → battle front đã downscale khi không có icon → art procedural/IcyEthics/placeholder tùy registry. PMD là pixel art Mystery Dungeon; không tuyên bố đây là bộ overworld FireRed/LeafGreen GBA hoàn chỉnh. Chưa có asset GBA riêng cho các ID thiếu, không thay bằng form khác.
- Chạy lại `python scripts/audit-overworld.py` sau khi import/cập nhật pack để tái tạo metadata và báo cáo. Script cần Pillow, chỉ đọc asset cục bộ.

## File sửa/thêm

| File | Vai trò |
| --- | --- |
| `src/render/WorldRenderer.ts` | Ground transform chung, shadow/depth, faint, debug, death visual |
| `src/render/overworldVisual.ts` | Profile species/form, anchor PMD và pose thuần dữ liệu |
| `src/render/pmdGround.json` | Metadata padding/ground từ PNG PMD |
| `src/render/groundSprite.ts` | Geometry chung cho silhouette và decoration |
| `src/render/animation.ts` | Anchor của sheet derived tính cả padding nội bộ |
| `src/render/pmdPack.ts` | Chặn sheet không khớp geometry |
| `src/render/lazyCreatures.ts` | Fit fallback, tránh crop cánh/đuôi |
| `src/adventure/PokemonSummonManager.ts` | Summon/recall dùng ground anchor; recall giữ hình hiện tại |
| `src/scenes/AdventureScene.ts` | Pokémon cứu hộ, depth/tâm bóng cây |
| `scripts/audit-overworld.py` | Quét PNG, xuất metadata/danh sách asset |
| `tests/overworld_visual.test.ts` | Regression padding/anchor/ground |
| `e2e/overworld_visual.spec.ts` | Kiểm tra renderer thật, animation, depth, overlay |
| `e2e/v6_rayquaza.spec.ts` | Cô lập Google Fonts trong test offline; vẫn kiểm tra lỗi game/asset |

## Phạm vi kiểm thử

Unit suite gốc: 229 test qua; thêm 3 regression test qua. Build TypeScript/Vite qua (còn cảnh báo bundle lớn từ Vite). Chạy browser bằng Playwright/Edge, kiểm tra Caterpie, Pikachu, Snorlax, Articuno, Zapdos, Rayquaza, Rotom và Rayquaza Mega qua idle/walk/attack/cast/hit/faint, ground/shadow/collision/depth, trước/sau trainer/cây, và pivot Articuno qua 8 hướng. Các suite PMD/shiny, summon/recall/switch, Rayquaza và aquatic chạy bổ sung; kết quả cuối được ghi bên dưới.

Không có ảnh đính kèm trong yêu cầu nhận được, nên chưa thể đối chiếu những Pokémon chỉ được nhắc là “trong ảnh”. Quét padding toàn pack không đồng nghĩa đã kiểm tra bằng mắt mọi loài/form.

Ảnh kiểm tra trong game: [ground overlay](overworld-ground-overlay.png). Ảnh các frame Idle gốc dùng để kiểm tra padding: [PMD samples](pmd-inspect.png).

### Kết quả cuối

- Build thành công; 229 unit test gốc + 3 regression test mới đều qua. Sau các sửa cuối đã chạy lại 18 test liên quan (visual, aquatic, boss), đều qua.
- **6 browser test qua**: ground/padding/depth/overlay; PMD 8 hướng và shiny; summon/recall/switch; Rayquaza đủ 3 phase/Mega/capture; aquatic tại Cà Mau; aquatic tại Coral Coast.
- Test Rayquaza ban đầu thất bại chỉ ở kiểm tra console do Google Fonts bị mạng chặn; sau khi mock riêng CSS font bên ngoài trong test, toàn bộ test qua. Không bỏ kiểm tra lỗi game hay asset.
- Kiểm thử visual mới ban đầu cần sửa so sánh float (sai số 7e-15) và tránh trả cả Phaser ScenePlugin về Playwright khi resume. Đây là lỗi harness, đã sửa và chạy lại thành công.
- Đã xem trực tiếp ảnh overlay và ảnh Mega Rayquaza trong trận. Chưa có đủ asset overworld riêng cho các ID đã liệt kê; fallback được giữ và ghi rõ, không tự nhận đã thay toàn bộ bằng asset GBA.
