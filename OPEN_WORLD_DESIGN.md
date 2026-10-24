# OPEN WORLD ADVENTURE — THIẾT KẾ

Cảm hứng cấu trúc: khám phá theo vùng, trạm dịch chuyển, nhiệm vụ chính/phụ, hầm ngục nhiều độ khó, cấp thế giới. Toàn bộ bản đồ, nhân vật, giao diện và tài nguyên là nguyên bản hoặc CC0 — không lấy từ Genshin Impact.

## 1. Cấu trúc thế giới
| # | Vùng | Trạng thái |
|---|---|---|
| 1 | **Thung Lũng Khởi Nguyên** (160×128 tile = 7680×5760 px, 80 chunk) | **Chơi được** |
| 2 | Rừng Ngọc Lục Bảo | Đường mở khi hoàn thành "Bí ẩn Hang Đá Cổ" (cờ `region:emerald-forest`); bản đồ chưa xây |
| 3–7 | Hồ Pha Lê Lớn, Cao Nguyên Đá, Dãy Núi Băng, Vùng Đất Núi Lửa, Phế Tích Thượng Cổ | Khóa, hiển thị điều kiện trên bản đồ thế giới; chưa xây |

### Các khu vực trong Starter Valley
| Khu | Sinh cảnh | Cấp | Pokémon (bảng spawn) | Nội dung |
|---|---|---|---|---|
| Làng Khởi Nguyên | an toàn | — | — | Phòng thí nghiệm, nhà, cửa hàng, giếng, Giáo sư Tùng, Chị Mai, Bé Na, trạm dịch chuyển |
| Nông Trại Bác Tư | farm | 4–7 | Rattata (hung hăng) | Nhiệm vụ "Rattata phá vườn" |
| Đồng Cỏ Gió | meadow (+cỏ cao) | 3–6 | Pidgey (ngày), Caterpie (ngày), Rattata, Rattata hung hăng (đêm) | Bé Bảo (trainer), rương, trạm |
| Rìa Rừng Ngọc | forest (+cỏ cao) | 5–9 | Caterpie, Oddish (đêm), Zubat (đêm, hung hăng), Pikachu (hiếm, ×3 khi mưa) | Kiểm lâm Hà, Pikachu mắc kẹt, rương |
| Hồ Pha Lê | lake | 6–9 | Oddish (đêm), Pidgey, Pikachu (mưa) | bờ cát, rương, trạm |
| Đồi Đá Xám | rocky | 8–12 | Geodude, Magnemite (×2 khi mưa), Zubat (đêm) | **Hang Đá Cổ**, rương, trạm |
| Tàn Tích Cổ | ruins | 9–13 | Zubat, Geodude | câu đố 3 phiến đá + rương phong ấn, Cụ Ba |

## 2. Điều khiển
| Desktop | Mobile |
|---|---|
| WASD/mũi tên di chuyển · **Shift** chạy | joystick ảo (chạm-kéo) · nút **Chạy** |
| **E**/Space tương tác | nút **E** |
| **F** ném bóng (ngắm bằng chuột) · **R** đổi loại bóng | nút **◓** (tự nhắm Pokémon gần nhất) |
| **Tab** đội hình · **X** Pokédex · **I** túi · **J** nhiệm vụ · **M** bản đồ · **Esc** menu | nút **Đội / Q / Túi / ≡ / Map**, chạm minimap mở bản đồ |
| **`** 1–5 lệnh chiến thuật · **H** dùng thuốc | nút **Lệnh** (xoay vòng) |

## 3. Hệ sinh thái Pokémon hoang dã
- Mỗi loài có: sinh cảnh, trọng số spawn, khoảng cấp (theo khu + cấp thế giới), điều kiện giờ (`day/night/any`), hệ số thời tiết, tính khí (`timid/neutral/aggressive`), tỉ lệ bắt (PokéAPI), chu kỳ hoạt động (ngày/đêm).
- Máy trạng thái (`src/core/wildAI.ts`): **idle → wander / eat / sleep**, **alert** khi phát hiện người chơi, **flee** (nhút nhát), **chase → attack** (hung hăng / bị tấn công), **return** về lãnh thổ (hồi 20 %/s, hết hung hăng). Không con nào đứng yên mãi.
- Ngủ theo chu kỳ: loài ngày ngủ ban đêm và ngược lại; ngủ = hệ số bắt ×2 và giảm phạm vi phát hiện.
- Spawn: ngoài khung hình, trong chunk đã nạp, tối đa 14 con quanh người chơi, ≤ 4 con / bán kính 400 px; cỏ cao dày hơn. Con bình thản ở xa > 1650 px hoặc đã bỏ chạy sẽ bị gỡ.
- AI LOD: con bình thản xa > 1000 px chỉ "nghĩ" 2,5 lần/giây.

## 4. Chiến đấu thời gian thực
Dùng **chung** `World` với Survivor. Khác biệt cấu hình ở chế độ `adventure`:
- Đồng minh chỉ tấn công kẻ địch **đang giao chiến** (`hostile`), trong bán kính 360 px quanh HLV.
- Lệnh chiến thuật: **Tự do**, **Tấn công mục tiêu** (con dưới con trỏ / gần nhất), **Bảo vệ HLV** (chỉ đánh trong 170 px, bám 140 px), **Đi theo** (không giao chiến, vẫn hồi máu/khiên), **Giữ vị trí**, **Rút lui** (chạy về HLV ×1.3).
- Pokémon hoang dã chiến đấu bằng **4 kỹ năng thật** của loài đó qua cùng bộ chọn kỹ năng.
- Kiệt sức: Pokémon quay về bóng 25 s; HLV gục → bất tỉnh, hồi phục tại trạm dịch chuyển cuối (trong hang: bị đưa ra ngoài).
- EXP theo `base_experience × cấp / 5` (×1.5 với Pokémon của trainer/hầm ngục), cộng cho mọi thành viên còn đứng, lên cấp theo growth rate PokéAPI.

## 5. Thu phục
1. Phát hiện → 2. tiếp cận/đánh yếu → 3. chọn bóng (R) → 4. ngắm & ném (F) → 5. bóng bay theo đường cong, rơi xuống → 6. hiệu ứng hút vào bóng, 0–3 lần lắc → 7. công thức Gen III/IV (HP, capture rate, hệ số bóng ×1/×1.5/×2, trạng thái ×1.5/×2) → 8. thành công: Collection + Pokédex + nhiệm vụ + lưu; thất bại: thoát ra, có thể bỏ chạy (nhút nhát 35 %).
- Giao diện ngắm hiển thị tên, cấp và **% bắt thực tế** trên mục tiêu.
- Pokémon của trainer/hầm ngục/lính canh không bắt được.

## 6. Nhiệm vụ (`src/data/world/quests.json`)
| Loại | Nhiệm vụ |
|---|---|
| Chính | Bước chân đầu tiên → Khám phá thung lũng → Bí ẩn Hang Đá Cổ |
| Phụ | Rattata phá vườn · Pikachu mắc kẹt (giải cứu → nhận Pikachu) |
| Thu phục | Nhà sưu tầm nhỏ (Pidgey + Caterpie) |
| Thách đấu | Bé Bảo |
| Khám phá | Kho báu tàn tích (câu đố phiến đá) |
| Hầm ngục | Thử thách Hang Đá Cổ (Khó) |
Mỗi nhiệm vụ: id, loại, mục tiêu tuần tự (talk/capture/defeat/explore/activate/dungeon/collect/trainer/rescue/puzzle/boss), điều kiện mở, phần thưởng (vật phẩm, EXP thế giới, danh tiếng, cờ, Pokémon), lời thoại offer/progress/complete. HUD theo dõi nhiệm vụ có mũi tên hướng + khoảng cách; NPC hiện `!` (có nhiệm vụ) / `?` (đang chờ báo cáo).

## 7. Hầm ngục: Hang Đá Cổ (`dungeons.json`)
Lối vào → **Phòng sóng quái** (cửa khóa, 3 đợt, Elite ở đợt cuối) → **Hành lang đá rơi** (vòng cảnh báo đỏ quanh/đón đầu người chơi) → **Phòng câu đố** (3 phiến đá sáng theo thứ tự, ghi nhớ rồi bước lên; sai → đá rơi + xem lại) → **Phòng Boss** (cửa khóa, Onix 2 phase: ném đá đón đầu, động đất, lao thẳng, mộ đá làm chậm, triệu hồi Geodude) → **Rương thưởng** → **Cổng ra**.
| Độ khó | Cấp | HP quái | Elite | Đá rơi | Phần thưởng | Mở khi |
|---|---|---|---|---|---|---|
| Thường | 9 | ×2.4 | 1 | 1.7 s | 3 Poké Ball, 2 Potion, 350 EXP | luôn mở |
| Khó | 15 | ×3.0 | 2 | 1.2 s | 4 Great Ball, 2 Super Potion, 900 EXP | xong Thường |
| Chuyên gia | 22 | ×3.6 | 4 | 0.85 s | 3 Ultra Ball, 3 Super Potion, 1800 EXP | xong Khó |

## 8. Tiến trình khám phá
- **Cấp thế giới** = ⌊√(EXP thế giới / 150)⌋ + 1 (tối đa 8): tăng cấp HLV và cấp Pokémon hoang dã.
- EXP thế giới từ: vùng mới (+25), trạm (+60), rương (+40), bắt Pokémon (+30), nhiệm vụ, hầm ngục.
- **% khám phá** = 60 % chunk đã đi + 20 % rương + 20 % trạm.
- **Danh tiếng** từ nhiệm vụ, trainer, hầm ngục.
- Mở vùng qua cờ nhiệm vụ.

## 9. Bản đồ thế giới
Ảnh thu nhỏ sinh từ dữ liệu tile, fog-of-war theo chunk (chưa đi = che kín), zoom 1–4× (cuộn chuột/nút), kéo để pan, đánh dấu: người chơi, trạm (chạm để dịch chuyển nhanh — bị chặn khi đang giao chiến), hang/Boss, mục tiêu nhiệm vụ (vàng = đang theo dõi). Cột bên: % khám phá, cấp thế giới, danh tiếng, trạm/rương, thời gian chơi, danh sách 7 vùng.

## 10. Tiến trình Pokémon dùng chung
| Dữ liệu | Phạm vi |
|---|---|
| Collection, Pokédex, túi đồ, xu, thống kê | **Vĩnh viễn**, dùng chung 2 chế độ |
| Vị trí, nhiệm vụ, cờ, trạm, khám phá, hầm ngục, đồng hồ | Chỉ Phiêu lưu |
| Cấp run, thẻ nâng cấp, mods | Chỉ trong 1 run Survivor, **không lưu** |
Quy tắc liên thông:
- Pokémon bắt ở Phiêu lưu → xuất hiện trong danh sách khởi đầu/chiêu mộ của Survivor.
- Run Survivor đạt **10:00** hoặc hạ **2 Boss** → mỗi loài đã chiêu mộ mà chưa sở hữu được thêm vào Collection ở **Lv5**.
- "Hành trình mới" chỉ đặt lại tiến trình Phiêu lưu; Collection/Pokédex/túi giữ nguyên.
