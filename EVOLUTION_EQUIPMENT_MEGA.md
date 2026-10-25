# TIẾN HÓA · TRANG BỊ · MEGA · WORLD BOSS (0.3.0)

> **0.5.0 — EvolutionRuleEngine.** Quy tắc điều chỉnh cho game solo real-time:
> trade → dùng Linking Cord (nếu rule yêu cầu vật phẩm cầm, Pokémon phải cầm nó và vật phẩm bị tiêu hao);
> min_affection → thân thiết ≥ 220; location → habitat tương ứng của vùng đang đứng (rừng / đá);
> time_of_day "dusk" → ban đêm; giới tính và trao đổi với loài cụ thể → báo "chưa hỗ trợ".
> Nhiều nhánh cùng hợp lệ → người chơi chọn. Survivor: tiến hóa bằng vật phẩm/trade mở ở Lv28 trong run, không đổi Bộ sưu tập.

## 1. Nguồn IcyEthics/PokemonAssets
- Repo: https://github.com/icyethics/PokemonAssets — README: *"free for any non-commercial projects… as long as any derived projects are also free to use and adapt by others. Credit can be given to IcyEthics."* → dự án này phi thương mại, mở; ghi công ở **Menu → Ghi công & bản quyền**, README và `ASSET_MANIFEST.json`.
- Repo **chỉ có 4 loài Pokémon thật** (Diglett, Gulpin, Hoothoot, Paras — bản vẽ lại theo phong cách riêng) và 2 fakemon (Canight, Perropello). Không có Charmander/Squirtle/… nên **không thể** chuyển toàn bộ Pokémon sang bộ sprite này. 6 loài trên được đưa vào đúng *model dữ liệu Pokémon* của game (chỉ số PokéAPI, 4 kỹ năng, vai trò, đặc tính, tiến hóa, spawn).
- Pipeline (`src/render/spriteRegistry.ts`): tải PNG 96×96 → cắt viền trong suốt → thu về 1× (ảnh 192px) → **giảm 2× kiểu pixel-art** (giữ pixel viền tối, còn lại lấy màu chiếm đa số) → lưới bảng màu → dùng chung hệ thống animation 14 khung. Kết quả cùng mật độ điểm ảnh ×3 với tile Kenney.
- Dugtrio = ghép 3 Diglett đã chuyển đổi; Magneton = ghép 3 Magnemite.
- Chân dung trainer (Mycologist, Youngster nam/nữ, Hilda) dùng trong hộp thoại.
- Chưa dùng: back sprite, sheet đi bộ overworld (khung 32×48, lệch mật độ với sân 16 px), tileset lớn (dự kiến cho vùng mới).

## 2. Tiến hóa
| | Phiêu lưu (vĩnh viễn) | Sinh tồn (chỉ trong run) |
|---|---|---|
| Theo cấp | đạt `min_level` PokéAPI → sau trận (không giao chiến, không giữa các đợt hầm ngục) hiện hội thoại **"Để nó tiến hóa!" / "Chưa phải lúc"** (từ chối → hỏi lại ở cấp sau) | thẻ **Sử Thi "Tiến hóa"** chiếm ô đầu khi cấp đủ |
| Đá tiến hóa | Túi đồ → Thunder Stone/Leaf Stone → **Dùng** → chọn Pokémon phù hợp (đá bị tiêu hao) | không có vật phẩm trong run → thay bằng Lv28 |
| Hoạt ảnh | màn hình tối, tia sáng, hai hình bóng trắng đổi nhau nhanh dần 3.2 s, flash, lộ dạng mới | flash + vòng sáng ngay trên sân |
| Kết quả | đổi loài trong Collection + Pokédex, giữ cấp/EXP/trang bị; đơn vị trên sân đổi chỉ số, hệ, vai trò, 4 kỹ năng, đặc tính, sprite | đổi trong `World` của run |
| Không hỗ trợ (báo rõ lý do) | trade (Graveler→Golem, Onix→Steelix), thân thiết/địa điểm (Golbat→Crobat, Magneton→Magnezone), thiếu sprite (Gulpin→Swalot, Hoothoot→Noctowl, Paras→Parasect) | như bên trái |

Chuỗi có thể tiến hóa: Bulbasaur→Ivysaur(16)→Venusaur(32) · Charmander→Charmeleon(16)→Charizard(36) · Squirtle→Wartortle(16)→Blastoise(36) · Pikachu→Raichu (Thunder Stone) · Pidgey→Pidgeotto(18)→Pidgeot(36) · Caterpie→Metapod(7)→Butterfree(10) · Oddish→Gloom(21)→Vileplume (Leaf Stone) · Zubat→Golbat(22) · Rattata→Raticate(20) · Geodude→Graveler(25) · Magnemite→Magneton(30) · Diglett→Dugtrio(26).

## 3. Trang bị (held item)
1 ô / Pokémon. Đổi trong **Đội hình → Trang bị / Gỡ** hoặc **Túi đồ → Trang bị**. Hiệu ứng tính trực tiếp trong combat engine:
| Nhóm | Vật phẩm | Hiệu ứng |
|---|---|---|
| Tăng hệ | Charcoal, Mystic Water, Miracle Seed, Magnet, Sharp Beak, Silver Powder, Poison Barb, Soft Sand, Hard Stone, Black Glasses | kỹ năng hệ tương ứng +20% |
| Loại đòn | Muscle Band / Wise Glasses | vật lý / đặc biệt +10% |
| Khác | Expert Belt (+20% khi siêu hiệu quả), Scope Lens (+10% chí mạng), Quick Claw (−12% hồi chiêu), Leftovers (hồi 1.2% HP/s), Shell Bell (hút 12% sát thương), Focus Band (20% trụ 1 HP) | |
| Cạnh tranh (0.12.0) | Life Orb (+30%, mất 10% HP mỗi đòn trúng, tối đa 1 lần/0,6 s, không tự gục) · Choice Band/Specs (+50% vật lý/đặc biệt) · Choice Scarf (+50% tốc chạy, −15% hồi chiêu) — cả 3 khóa vào chiêu tấn công đầu tiên tới khi hết giao tranh (1,5 s không mục tiêu) · Assault Vest (sát thương đặc biệt nhận ÷1,5, cấm chiêu hỗ trợ) · Rocky Helmet (kẻ cận chiến mất 1/6 HP tối đa, boss 1/30, 1 lần/giây) · Eviolite (÷1,5 sát thương nhận nếu loài còn tiến hóa) · Sitrus Berry (dưới 50% HP hồi 25%, mọc lại sau 45 s) · Focus Sash (đầy HP → trụ 1 HP) | |
| Luyện EV (0.12.0) | Power Weight/Bracer/Belt/Lens/Band/Anklet (+8 EV chỉ số tương ứng mỗi lần hạ), Macho Brace (×2 EV) | không ảnh hưởng chiến đấu |
| Mega Stone | Charizardite X/Y, Blastoisinite, Venusaurite, Pidgeotite | điều kiện Mega |
Nguồn: rương (mỗi rương có 1 trang bị), cửa hàng **Chú Lâm** (mua bằng xu), Boss, nhiệm vụ, thưởng hầm ngục lần đầu. Tên & mô tả gốc lấy từ PokéAPI `/item`.

**Xu**: hạ Pokémon hoang dã (cấp×3), trainer/hầm ngục (×6), thắng trainer +500, rương +150, hoàn thành hầm ngục, World Boss.

## 4. Mega Evolution
- Điều kiện: có **Vòng Mega (Key Stone)** + Pokémon dạng cuối cầm đúng Mega Stone + đang giao chiến + không có Pokémon khác đang Mega + Vòng Mega không trong thời gian hồi.
- Kích hoạt: **phím G** (mobile: nút MEGA). Hiệu ứng: flash, rung màn hình, banner cầu vồng, vòng hào quang cầu vồng quanh Pokémon.
- Thời lượng: tối đa 90 s; tự trở lại sau 10 s không giao chiến hoặc khi kiệt sức; hồi 120 s.
- Dạng Mega dùng **chỉ số/hệ/ability thật từ PokéAPI** (`/pokemon/charizard-mega-x`…):
| Mega | Hệ | Đặc tính (chuyển sang combat thời gian thực) |
|---|---|---|
| Mega Charizard X | Lửa/Rồng | Tough Claws: cận chiến & lao +30% |
| Mega Charizard Y | Lửa/Bay | Drought: kỹ năng Lửa luôn +50% |
| Mega Blastoise | Nước | Mega Launcher: đạn & tia +50% |
| Mega Venusaur | Cỏ/Độc | Thick Fat: nhận sát thương Lửa/Băng −50% |
| Mega Pidgeot | Thường/Bay | No Guard → +15% chí mạng |
- Nguồn Mega Stone: Venusaurite + Vòng Mega (World Boss lần đầu), Pidgeotite (rương Đồi Đá), Blastoisinite (Hang Đá Cổ **Khó** lần đầu), Charizardite X (**Chuyên gia** lần đầu), Charizardite Y (cửa hàng 9000 xu).
- Sinh tồn: thẻ **Huyền Thoại** Mega cho dạng cuối từ Lv32, 1 Pokémon/run, kéo dài hết run.

## 5. World Boss: Mega Venusaur Thần Rừng
- Vị trí: **Khu Rừng Thiêng** (Rìa Rừng Ngọc, vòng đá thiêng). Xuất hiện khi người chơi vào vòng 330 px; reset nếu rời xa; hồi sinh sau 10 phút chơi.
- AI riêng (`venusaurThink`), không chỉ tăng HP:
  - **P1**: Solar Beam (đường cảnh báo dài 600 px, nạp 1.6 s), Petal Storm (vòng 230 px), Sleep Powder (vùng gây choáng dưới chân), Vine Lash (cận chiến).
  - **P2 (<60%)**: triệu hồi 4 Oddish Elite, Solar Beam đôi, Petal Storm hai nhịp, nhịp đòn nhanh hơn.
  - **P3 (<30%) "Ánh Dương"**: vụ nổ phủ cả khu (640 px) — chỉ **3 vùng bóng râm xanh** an toàn; AI đồng minh tự chạy vào bóng râm.
- Thưởng lần đầu: Vòng Mega, Venusaurite, Miracle Seed, 2000 xu, 600 EXP thế giới. Lần sau: Leftovers, Super Potion, 800 xu.
- Nhiệm vụ **"Thần Rừng thức giấc"** (sau Hang Đá Cổ) và **"Bước ngoặt trưởng thành"** (cho 1 Pokémon tiến hóa).
- World Boss chỉ có ở Phiêu lưu (cờ `survivor: false` — Director của Sinh tồn không gọi nó).

## 6. Cân bằng Sinh tồn sau khi thêm tiến hóa
Probe bot 9 run: trước tiến hóa 3–4/9 thắng → có tiến hóa/Mega 9/9 (quá dễ) → thêm hệ số bậc hai vào cấp địch (`+0.12·m²`) → **2/9 thắng**, thua ở 10–14 phút.
