# MAP DESIGN — Thiết kế & cấu trúc bản đồ

Tài liệu mô tả cách bản đồ thế giới mở được dựng, cách thêm nội dung, và hiện trạng từng vùng. Phần "Đã làm ở V20" chỉ liệt kê thứ đã lập trình và kiểm thử.

## 1. Cấu trúc kỹ thuật

| Thành phần | File | Vai trò |
|---|---|---|
| Dữ liệu vùng | `src/data/world/*.json`, `src/data/vietnam/*.json` | layout tay: khu (`areas`), đường (`paths`), sông, hồ, đảo, nhà, rào, đạo cụ, biển, NPC, HLV, rương, trạm, câu đố, hầm ngục, cổng, boss, điện thờ |
| `ValleyMap` | `src/core/map/valley.ts` | dựng terrain: dữ liệu JSON + chi tiết thủ tục theo noise (tất định), ghi nhớ từng ô trong mảng byte |
| `ChunkView` | `src/render/ChunkView.ts` | nạp chunk 16×16 tile trong khung camera + 1 chunk đệm, gỡ chunk ngoài khung + 2 |
| Vật thể theo chunk | `AdventureScene.onChunkLoad` | tạo ảnh, va chạm, đèn, điểm tương tác khi chunk được nạp; hủy hết khi gỡ |
| `DungeonMap` | `src/core/map/dungeonMap.ts` | hầm ngục vẽ bằng ASCII |

Quy tắc chung: 1 tile = 16 px nghệ thuật × 3 = 48 px thế giới; zoom camera chốt theo lưới pixel; vật thể đứng trên ô đi được (test `tests/v17_maps.test.ts` kiểm tra mọi NPC / HLV / rương / biển / đạo cụ / trạm / cổng của 9 vùng).

### Công cụ
- `npx tsx scripts/map-ascii.ts <vùng> [x0 y0 x1 y1]` (mới, V20): in bản đồ dạng ký tự để đặt vật thể bằng tay — `.` đất trống, `,` đường, `#` ô chặn, `~` nước, `B` nhà, `N` NPC, `T` HLV, `C` rương, `W` trạm, `S` biển, `P` cổng, `o` đạo cụ.
- `node scripts/patch-starter-valley.mjs` (mới, V20): bản vá nội dung Thung Lũng, chạy lại nhiều lần không nhân đôi (thay theo id).

### Kiểu dữ liệu NPC (mở rộng ở V20)
```jsonc
{ "id": "sv-granny", "name": "Bà Tư bán hoa", "sprite": "elder", "x": 86, "y": 111,
  "wander": 4,            // (mới) bán kính đi lại, tính bằng tile; 0/không có = đứng yên
  "role": "nurse",        // (mới) "nurse": nói chuyện = hồi phục cả đội
  "lines": ["..."] }
```
- NPC `wander`: ban ngày đi giữa các điểm ngẫu nhiên trên ô đi được quanh chỗ của mình, nghỉ 1,5–4,5 s giữa hai lần đi, **đứng lại và quay mặt** khi người chơi trong 90 px hoặc đang nói chuyện, **về chỗ** khi trời tối. Không có vật cản tĩnh (vật cản tĩnh sẽ đứng lại một chỗ). Chỉ mô phỏng khi chunk của nó đang nạp.
- Tòa nhà có id chứa `center` hoặc `lab` tự có **máy PC** ở cửa.
- NPC `sprite: "board"` là bảng nhiệm vụ (vật thể, không phải người).

## 2. Thung Lũng Khởi Nguyên (160×128 tile)

| Khu (prompt 2.2) | Id khu | Hiện trạng | Đã làm ở V20 |
|---|---|---|---|
| 1 — Làng khởi đầu | `village` | nhà người chơi, phòng thí nghiệm (PC), cửa hàng, giếng, trạm | **+ Trung tâm Pokémon** (`sv-center`, có PC), **y tá Chị Mai** hồi phục (`role: nurse`), **bảng nhiệm vụ** (`sv-board`, 2 nhiệm vụ), **2 biển hướng dẫn** ở cổng bắc (chiến đấu, kỹ năng chủ động), **3 dân làng đi lại** (Bé Na, Anh Tuấn — hướng dẫn bắt Pokémon, Bà Tư — mẹo ngày/đêm) |
| 2 — Đồng cỏ | `meadow` | cỏ cao, Bé Bảo, rương, trạm, bia tập | — |
| 3 — Rừng sâu | `forest`, `grove` | Rìa Rừng Ngọc, Khu Rừng Thiêng, Pikachu mắc kẹt, Pokémon theo giờ/thời tiết | — |
| 4 — Hồ nước | `lake` | bờ cát, rương, trạm, Pokémon nước | — (câu cá: chưa có hệ thống) |
| 5 — Hang Đá Cổ | hầm ngục `ancient-cave` | sóng quái → bẫy đá rơi → câu đố → Onix → rương, 3 độ khó | — |
| 6 — Trại huấn luyện | `camp` (**mới**) | — | **Khu mới** [33,75]–[57,91]: rào gỗ với cổng bắc (nối đường đồng cỏ) và cổng đông (nối đường chính của làng), 3 bia tập, khúc gỗ, rơm, xô; **Thầy Khang** giải thích 6 vai trò và cách chỉ huy; **3 học viên** mỗi người một lối đánh: Tân (phòng thủ: Geodude, Shellder), Linh (tốc độ: Zubat, Mankey), Phong (đặc biệt, 3 con: Oddish, Magnemite, Growlithe); **rương tốt nghiệp** khóa bằng cờ `camp:graduate` |
| 7 — World Boss | `grove` | Mega Venusaur 3 phase, vùng bóng râm an toàn | — |

Kết nối: cổng đông của trại ← đường đất từ đường chính (x=81, y=83); cổng bắc ← đường đất từ đường Đồng Cỏ (x=45, y=66). Không tạo đường cụt.

Khu `camp` đặt **trước** `meadow` trong danh sách `areas` vì `areaAt` lấy khu khớp đầu tiên.

## 3. Các vùng khác (hiện trạng, không đổi ở V20)

| Vùng | Biome / môi trường ảnh hưởng gameplay | Hầm ngục / boss | Ghi chú |
|---|---|---|---|
| Đầm Lầy Sương Mù | bùn độc (35 %/s trúng độc, Độc/Thép miễn) | đền huyền thoại Azelf, Darkrai, Giratina | |
| Bờ Biển San Hô | biển, cát, hải đăng | Lugia, Kyogre, Rayquaza, Registeel | |
| Núi Tuyết Vĩnh Hằng | băng trơn −30 %, tuyết dày, bão tuyết | Hang Băng Vĩnh Cửu (Mamoswine) | |
| Vùng Đất Núi Lửa | nhiệt gần dung nham, phun trào | Lò Dung Nham (Magmortar) | |
| Thánh Địa | — | Tháp Thử Thách (Tyranitar, tính giờ), Arceus, Dialga, Palkia, Deoxys | |
| Cà Mau / An Giang / Cần Thơ | rừng ngập mặn, đảo + phà, chợ nổi, đò | boss khu vực Seviper / Claydol / Whiscash | Việt Nam Odyssey |

## 4. Việc bản đồ còn lại (chưa làm, theo ưu tiên)
1. Câu cá ở Hồ Pha Lê (cần hệ thống mới: điểm câu, bảng loài, mini-game ngắn).
2. Điểm thu thập nguyên liệu ở Đồng Cỏ + lối đi ẩn.
3. Rừng Ngọc Lục Bảo thành bản đồ riêng (cờ `region:emerald-forest` đã có).
4. Lối tắt Hang Đá Cổ mở sau khi hoàn thành.
5. Lịch NPC theo giờ chi tiết hơn (hiện: ngày đi lại / đêm về chỗ).
