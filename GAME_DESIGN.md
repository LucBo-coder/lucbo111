# Pokémon Survivor — Thiết kế & Lối chơi

> Phiên bản 0.14.0 (+ các thay đổi chưa phát hành trong [CHANGELOG.md](CHANGELOG.md)).
> Tài liệu này mô tả **game chơi như thế nào** và **có những chức năng gì**. Chi tiết kỹ thuật từng mảng nằm ở các tài liệu riêng (xem cuối trang).

Pokémon Survivor là game Pokémon fan-made, 2D góc nhìn từ trên xuống, chạy trên trình duyệt (Phaser 3 + TypeScript), chơi được trên máy tính và điện thoại.

**Ý tưởng cốt lõi:** Pokémon **tự chiến đấu theo thời gian thực**. Người chơi điều khiển huấn luyện viên (HLV): di chuyển, né đòn, ra lệnh chiến thuật, ném bóng thu phục, chọn nâng cấp — còn đội Pokémon tự tìm mục tiêu, tự chọn chiêu và tự né vùng cảnh báo.

---

## 1. Các chế độ chơi

| Chế độ | Kiểu chơi | Thời lượng | Tiền tệ |
|---|---|---|---|
| **Sinh tồn** | Auto-battle roguelite, sống sót 15 phút và hạ Boss cuối | 1 lượt ~15 phút | Ngọc |
| **Phiêu lưu** | Thế giới mở: khám phá, thu phục, nhiệm vụ, hầm ngục, huyền thoại | Chiến dịch dài | Xu |
| **Việt Nam Odyssey** | Chiến dịch thế giới mở lấy bối cảnh miền Tây Nam Bộ | Chiến dịch dài | Đồng |
| **Chơi online** | Co-op 2 người (cả 3 chế độ trên), PvP đấu thời gian thực | Theo phòng | Theo chế độ chủ phòng |
| **Thế giới online** | Thế giới chung nhiều người trên máy chủ, tài khoản riêng | Liên tục | Xu (máy chủ) |

Mọi chế độ dùng chung **một engine chiến đấu**, nên Pokémon, chiêu thức, trạng thái, trang bị và Mega hoạt động giống nhau ở mọi nơi.

---

## 2. Chiến đấu thời gian thực (dùng chung)

### 2.1 Nguyên tắc
- Mô phỏng chạy cố định 60 bước/giây, tách khỏi phần vẽ; cùng seed + cùng thao tác → cùng kết quả.
- Sát thương theo công thức bản gốc: `((2L/5+2)·Power·A/D/50+2) × STAB 1.5 × Hệ × Chí mạng 1.5 × Ngẫu nhiên 0.85–1 × Hệ số`. Đòn vật lý dùng Atk/Def, đặc biệt dùng SpA/SpD.
- Đủ **18 hệ** (bảng Gen 6+), Pokémon hai hệ nhân cả hai hệ số, miễn nhiễm = 0 sát thương.
- Chiêu có **độ chính xác** (hiện "Trượt!") và tỉ lệ khựng lấy từ PokéAPI; đạn và đòn diện rộng thì né bằng vị trí.
- Các dạng đòn: cận chiến, đạn, tia, lao, vùng tròn, hình nón, vùng đất kéo dài, khiên, hồi máu, buff/debuff.
- Số sát thương: vàng = siêu hiệu quả, xám = kém hiệu quả, cam có `!` = chí mạng, đỏ = phe mình bị đánh.

### 2.2 Trạng thái
Bỏng, Độc, Độc nặng, Hút máu (Leech Seed), Chậm, Choáng, Ngủ (tỉnh khi bị đánh), Đóng băng (đòn Lửa làm tan), Tê liệt, Rối loạn, Khựng, Khiêu khích (kéo aggro), Tăng công, Giảm thủ. Mỗi trạng thái có thời lượng, giới hạn cộng dồn và icon pixel trên đầu. Boss và Elite kháng phần lớn sát thương theo thời gian để DoT không phá game.

### 2.3 AI đồng đội
Mỗi Pokémon có một **vai trò** quyết định cách chọn mục tiêu và đứng vị trí:

| Vai trò | Mục tiêu | Di chuyển |
|---|---|---|
| Tank | Kẻ địch gần / đang đánh HLV | Lao vào cận chiến, khiên + khiêu khích |
| Fighter | Gần bản thân | Áp sát |
| Assassin | Máu thấp nhất, tránh Boss | Vòng ra sau, nhanh hơn |
| Marksman | Gần nhất | Giữ tầm bắn, thả diều |
| Mage | Cụm địch đông nhất | Giữ khoảng cách |
| Support | Gần HLV | Đứng cạnh đồng đội yếu nhất, hồi máu |

- **Chọn chiêu bằng chấm điểm**, không ngẫu nhiên: trong tầm → hết hồi chiêu → đủ năng lượng → lợi thế hệ × STAB → số địch trong vùng → đồng đội cần hồi máu → bản thân gặp nguy.
- Luôn **ưu tiên thoát khỏi vùng cảnh báo** của địch; bám mục tiêu để không giật qua lại; dịch chuyển về HLV nếu bị kéo quá xa.
- Máy trạng thái tường minh: nghỉ / theo / tìm / đuổi / định vị / tấn công / niệm chiêu / né / hồi phục / choáng / bỏ chạy / gục.

### 2.4 Lệnh chiến thuật
Phím `` ` `` và 1–5 (điện thoại: nút **Lệnh**):
**Tự do** · **Tấn công mục tiêu** (con dưới con trỏ / con được chạm) · **Bảo vệ HLV** · **Đi theo** (không giao chiến, vẫn hồi máu) · **Giữ vị trí** · **Rút lui**.

### 2.5 Kỹ năng chủ động (Phiêu lưu, Việt Nam Odyssey, PvP, co-op)
Pokémon vẫn tự đánh; người chơi chọn **lúc nào** và **chiêu nào** cho Pokémon đang điều khiển:
- **Q**: dùng chiêu tốt nhất đang sẵn sàng (AI chọn chiêu, bạn chọn thời điểm). Click / chạm một ô trên **thanh kỹ năng** để dùng đúng chiêu đó. **T** (hoặc chạm tên trên thanh): đổi Pokémon được điều khiển.
- Chuột phải / nhấn giữ một ô: **giữ chiêu** cho mình, AI không dùng chiêu đó nữa.
- Cùng luật với AI (hồi chiêu, năng lượng, vật phẩm khóa chiêu, miễn nhiễm hệ) + **hồi chiêu chung 1,2 s** giữa hai lệnh để không spam. Mục tiêu ngoài tầm → Pokémon tự đi tới đúng tầm trong tối đa 3 s.
- Ô đã giữ được lưu theo từng Pokémon trong save (còn sau khi tải lại, học chiêu mới, tiến hóa).
- **PvP** và **khách co-op** có cùng thanh kỹ năng và phím Q / T: lệnh gửi tới chủ phòng, chủ phòng quyết định theo cùng luật và báo lại khi chiêu không ra.
- Sinh tồn giữ tự động hoàn toàn; Thế giới online chưa có kỹ năng chủ động.

### 2.6 Trang bị & Mega
- Mỗi Pokémon cầm **1 vật phẩm** với hiệu ứng thật trong chiến đấu: tăng sát thương theo hệ (Charcoal, Mystic Water…), Muscle Band / Wise Glasses, Expert Belt, Scope Lens, Quick Claw, Leftovers, Shell Bell, Focus Band/Sash, Life Orb, bộ Choice (khóa chiêu), Assault Vest, Rocky Helmet, Eviolite, Sitrus Berry, đồ luyện EV (Power item, Macho Brace) và Mega Stone.
- **Mega Tiến Hóa**: cần Vòng Mega + Pokémon dạng cuối cầm đúng Mega Stone, đang giao chiến. Phím **G** / nút **MEGA**. Kéo dài tối đa 90 giây (tự trở lại khi rời giao tranh), hồi 120 giây, mỗi lúc chỉ 1 con. Dạng Mega dùng chỉ số, hệ, đặc tính thật từ PokéAPI. Hiện có gần 50 đá Mega.

---

## 3. Pokémon

- **National Dex 1025 loài** (Gen 1–9) với chỉ số, hệ, đặc tính, bộ chiêu, nhóm tăng trưởng EXP và tỉ lệ bắt từ PokéAPI.
- **Chỉ số cá thể**: IV 0–31, 25 tính cách, EV (yield chuẩn, giới hạn 252/510, luyện bằng Power item, vitamin, berry), độ thân thiết 0–255.
- **Chiêu mở theo cấp** từ learnset (Phiêu lưu); Sinh tồn dùng bộ chiêu đầy đủ ngay từ đầu.
- **Tiến hóa** theo luật PokéAPI: cấp, đá, vật phẩm cầm, thân thiết, ngày/đêm, địa điểm, chiêu đã biết, mưa… Trao đổi được thay bằng **Dây Liên Kết** (Linking Cord). Nhiều nhánh hợp lệ thì người chơi chọn. Có màn tiến hóa với bảng chỉ số trước → sau và chiêu mới, bỏ qua được.
- **Shiny** 1/4096 (1/1024 khi có sự kiện Bùng phát), giữ qua tiến hóa, có Pokédex Shiny riêng.
- **Summon / Recall**: thả Pokémon ra bằng đúng loại bóng đã bắt, thu hồi bằng tia đỏ, đổi chỗ (Shift + 1–6 hoặc chạm danh sách đội). Pokémon trong bóng không hồi máu.
- Sprite: mặc định vẽ bằng code / bộ PMD; tùy chọn gói sprite chính thức chỉ dùng cá nhân (xem README).

---

## 4. Chế độ Sinh tồn

### 4.1 Vòng lặp
1. Chọn Pokémon khởi đầu từ Bộ sưu tập của ô lưu (mang theo cấp, IV, tính cách, trang bị).
2. Kẻ địch xuất hiện liên tục ngoài màn hình, ngày càng đông, nhanh, đa dạng.
3. Đội tự chiến đấu → kẻ địch rơi **EXP gem** → HLV đi nhặt (bán kính nam châm).
4. Lên cấp → game tạm dừng, chọn **1 trong 3 thẻ nâng cấp**.
5. Boss ở **5:00, 10:00, 15:00**. Hạ Boss cuối = chiến thắng.
6. HLV hết HP = thua. Pokémon hết HP chỉ kiệt sức 15 giây rồi hồi sinh 50% HP.

### 4.2 Kẻ địch & Boss
- Rattata (bầy cận chiến), Magnemite (bắn xa, làm chậm), Geodude (trâu, chậm). **Elite**: ×4 HP, viền vàng, ×5 EXP, tỉ lệ tăng dần tới 7%.
- **Enemy Director**: tốc độ spawn, cấp, tốc độ di chuyển và nhịp bắn tăng theo phút; mở khóa loài mới theo thời gian; **sự kiện bầy đàn** ở 2:30 / 7:30 / 12:30 (vòng vây luôn chừa khe thoát 20%).
- **Boss Onix**: thân rắn 6 đốt, Rock Throw ngắm đón đầu, Earthquake, Body Slam lao thẳng, Rock Tomb; dưới 50% HP sang phase 2 (triệu hồi Geodude Elite, nhanh hơn). Hạ Boss: mưa EXP, hồi 50% HP đội, thẻ nâng cấp Sử Thi trở lên.
- Bản đồ Rừng 3200×3200 px, cây có va chạm và **chặn đạn** (dùng làm chỗ nấp).

### 4.3 Thẻ nâng cấp trong lượt
Độ hiếm: Thường 62% · Hiếm 26% · Sử Thi 10% · Huyền Thoại 2%.
- Pokémon mới gia nhập (đội tối đa 6), nâng cấp kỹ năng (tối đa cấp 5).
- Chỉ số: Sức mạnh, Hồi chiêu, Sinh lực, Phạm vi, Chí mạng, Tốc chạy, Nam châm, Năng lượng, Đa phóng (+1 đạn, chỉ Sử Thi+).
- **Tiến hóa** (thẻ Sử Thi khi đủ cấp; tiến hóa bằng vật phẩm mở ở Lv28) và **Mega** (thẻ Huyền Thoại từ Lv32, 1 con/lượt).
- Mỗi thẻ hiện xem trước `hiện tại → sau khi chọn (tối đa)`. Giới hạn nằm trong `src/data/upgrades.json`.

### 4.4 Synergy & combo hệ
Đội có 2 / 3+ con cùng hệ → +10% / +20% sát thương hệ đó; đội ≥ 5 hệ → +5%. Năm combo hệ: **Hơi Nước, Vỡ Băng, Quá Tải, Cháy Lan, Kịch Độc**.

### 4.5 Tiến trình ngoài lượt
- Kết thúc lượt nhận **Ngọc** → mua **Nâng cấp vĩnh viễn** (6 dòng × 5 cấp: Sức mạnh, Sinh lực, Tập trung, Nhanh nhẹn, Nam châm, Chí mạng).
- Sống tới 10:00 hoặc hạ 2 Boss → các loài đã chiêu mộ trong lượt được thêm vào Bộ sưu tập ở Lv5.

---

## 5. Chế độ Phiêu lưu (thế giới mở)

### 5.1 Thế giới
Bản đồ chia chunk tải động, có ngày/đêm, thời tiết (mưa, sương, bão tuyết, nắng nóng), cỏ cao, sông, cầu, đảo. Bảy vùng mở dần theo cốt truyện:

| Vùng | Cấp | Điểm nhấn |
|---|---|---|
| Thung Lũng Khởi Nguyên | 3–13 | Làng khởi đầu (Trung tâm Pokémon, bảng nhiệm vụ), Trại Huấn Luyện, 8 khu, câu cá ở Hồ Pha Lê, bụi quả ở Đồng Cỏ Gió, Hang Đá Cổ, World Boss Mega Venusaur |
| Rừng Ngọc Lục Bảo | 12–19 | Rừng sâu sau Rìa Rừng Ngọc (mở sau Hang Đá Cổ): Lõi Rừng, Suối Lục Bảo, Chòi Kiểm Lâm, câu cá & bụi quả rừng |
| Đầm Lầy Sương Mù | 22–32 | Vũng bùn độc, lối ván gỗ |
| Bờ Biển San Hô | 26–38 | Biển, hải đăng, rạn san hô |
| Núi Tuyết Vĩnh Hằng | 32–45 | Mặt băng trơn, bão tuyết, Hang Băng Vĩnh Cửu |
| Vùng Đất Núi Lửa | 42–58 | Nhiệt độ gần dung nham, phun trào, Lò Dung Nham |
| Thánh Địa | cao nhất | Tháp Thử Thách, Nhà vô địch |

**Hiệu ứng môi trường** có tác động thật: băng làm chậm, bão tuyết (hệ Băng miễn), nhiệt dung nham (hệ Lửa/Nước/Đất miễn), bùn độc (hệ Độc/Thép miễn).

### 5.2 Pokémon hoang dã
- Mỗi loài có sinh cảnh, độ hiếm, khoảng cấp, giờ hoạt động, hệ số thời tiết và tính khí (nhút nhát / trung tính / hung hăng). Cá chỉ xuất hiện và bơi trong nước.
- AI hoang dã: lang thang, ăn, ngủ (theo chu kỳ ngày/đêm), cảnh giác, bỏ chạy, đuổi đánh, quay về lãnh thổ.
- Bảng tên trên đầu: tên + cấp, α Alpha, ★ tinh anh, ✦ shiny.

### 5.3 Thu phục
Tiếp cận / đánh yếu → chọn bóng (**R**) → ngắm & ném (**F**, điện thoại tự nhắm) → bóng bay vòng cung → lắc 0–3 lần → thành công hoặc thoát ra. Công thức Gen III/IV, giao diện ngắm hiện **% bắt thực tế**. Có Poké / Great / Ultra / Master và bóng đặc biệt Net, Dusk, Quick, Timer, Luxury. Pokémon của huấn luyện viên, hầm ngục, boss khu vực không bắt được.

### 5.4 Nhiệm vụ & NPC
Nhiệm vụ chính, phụ, thu phục, thách đấu, khám phá, giải cứu, câu đố, hầm ngục, boss. HUD có mũi tên chỉ hướng + khoảng cách; NPC hiện `!` (có nhiệm vụ) / `?` (chờ báo cáo). Huấn luyện viên có bảng tên ⚔ (chưa đấu) / ✓ (đã thắng).

**Trận huấn luyện viên** (`core/trainerAI.ts`): tối đa 2 Pokémon trên sân, còn lại dự bị. Pokémon gục → HLV gửi dự bị hợp hệ nhất với Pokémon bạn đang điều khiển. Pokémon yếu hệ còn dưới 50% HP bị gọi về, đổi lấy Pokémon kháng hệ (HP được giữ). 1–2 Potion, dùng dưới 30% HP. **Tái đấu** sau 10 phút chơi: cấp theo đội bạn (tối đa +15 so với đội gốc, +2 mỗi lần thắng lại), thưởng tiền, không lặp vật phẩm.

**Danh tiếng theo vùng** (`core/reputation.ts`, `data/world/reputation.json`): điểm danh tiếng từ nhiệm vụ / HLV cộng vào vùng đang đứng. Hạng *Người lạ / Quen mặt 15 / Được tin cậy 40 / Người nhà 80*; mỗi hạng tặng quà một lần và đặt cờ `rep:<vùng>:<hạng>` để mở nhiệm vụ. Mỗi chiến dịch giữ điểm riêng.

### 5.4b Làng khởi đầu & Trại Huấn Luyện
- **Trung tâm Pokémon**: y tá Chị Mai hồi phục cả đội, máy PC ở cửa. **Bảng nhiệm vụ** của làng nhận việc vặt (săn Rattata, thăm trại). Dân làng đi lại ban ngày, về chỗ ban đêm; biển ở cổng bắc hướng dẫn chiến đấu và kỹ năng chủ động.
- **Trại Huấn Luyện** (phía tây làng): Thầy Khang và 3 học viên, mỗi người một lối đánh (phòng thủ, tốc độ, hệ đặc biệt). Chuỗi 3 bài học dạy chọn chiêu khắc hệ, né và rút lui, dồn hỏa lực bằng lệnh Tấn công; tốt nghiệp mở rương của trại.

### 5.4c Câu cá & hái lượm
- **Câu cá**: đứng cạnh chỗ nước gợn sóng, bấm E thả câu; khi phao chìm và hiện "!" bấm lại trong 0,9 s. Sớm hoặc chậm thì cá chạy (không mất lượt). Kết quả: vật phẩm, hoặc một Pokémon hệ Nước ở lại dưới nước để đánh / bắt. Cần cần câu (nhiệm vụ Ông Sáu, Hồ Pha Lê).
- **Bụi quả**: bấm E để hái quả mọng, thuốc, bóng, kẹo EXP; đôi khi Pokémon trốn trong bụi nhảy ra.
- Mỗi điểm hồi lại theo thời gian chơi (câu 60–75 s, bụi 4–5 phút); dữ liệu bảng ở `data/world/gathering.json`, vị trí ở trường `nodes` của vùng.

### 5.4d Năng lực khám phá & đi ghe
- Pokémon trong đội (ra sân hay trong bóng đều được) mở đường: **Cắt cây** bụi cây rậm (Cỏ / Bọ / Thép, Lv 8+), **Đập đá** tảng đá nứt (Giác Đấu / Đá / Đất, Lv 14+), **Đẩy đá** tảng đá lớn mỗi lần một ô, ra xa người chơi (Giác Đấu / Đất / Thép, Lv 18+). Đẩy vào ổ thì lối mở.
- Thung Lũng có 3 hốc bí mật (khoảng rừng, túi đá, vòng đá), mỗi hốc một rương.
- **Ghe / xuồng** (Việt Nam Odyssey): nhận xuồng từ Ngư dân Út Mũi (Cà Mau) hoặc ghe từ cô lái đò Ninh Kiều (Cần Thơ). Bến: Cà Mau 2, An Giang 2, Cần Thơ 5. Xuống / lên ghe ở bến (E). Trên ghe chỉ đi trên nước; dòng sông đẩy ghe xuôi, mạnh lúc nước ròng, yếu lúc nước lớn (2 con nước mỗi ngày). Bãi Bồi giữa sông chỉ đến được bằng ghe.

### 5.5 Hầm ngục
Hang Đá Cổ (Onix), Hang Băng Vĩnh Cửu (Mamoswine), Lò Dung Nham (Magmortar), Tháp Thử Thách (Tyranitar, có giới hạn thời gian). Mỗi hầm: phòng sóng quái → bẫy (đá rơi / băng rơi / đá nóng) → câu đố → phòng Boss → rương. **3 độ khó** (Thường / Khó / Chuyên gia), phần thưởng lần đầu riêng.

### 5.6 Boss & huyền thoại
- **World Boss Mega Venusaur Thần Rừng**: 3 phase, phase cuối phủ cả khu chỉ chừa 3 vùng bóng râm an toàn.
- **35 huyền thoại / thần thoại Gen 1–4**: đền thờ phân bố theo chủ đề vùng (tối đa 8 đền/bản đồ) và 7 con lang thang. Chuỗi nhiệm vụ huyền thoại mở theo dữ liệu (Thần Điểu → Lugia, Tam Thú → Ho-Oh, … → Arceus).
- Boss nhiều phase dùng chung **BossPhaseManager**: một đòn không thể bỏ qua phase, có cinematic chuyển phase, đổi dạng (ví dụ Rayquaza → Mega Rayquaza → Cuồng Nộ). Boss HUD có thanh HP, phase, cảnh báo tên chiêu kèm đếm ngược.
- Huyền thoại bị đánh tới **WEAKENED** (4% HP) → mở **cửa sổ bắt** có giới hạn lượt ném / thời gian; bắt hụt thì nó bay đi và quay lại sau.

### 5.7 Sự kiện thế giới
Bùng phát, Pokémon Alpha, Di cư, Vùng biến dạng, kho báu, bão tuyết / sóng nhiệt, **Thương nhân lưu động** (6 món hiếm giảm 30%), **Mưa sao băng** (nhặt 5 mảnh sao đổi đá tiến hóa / đá Mega). Có thông báo, bảng đếm ngược, đánh dấu trên bản đồ nhỏ.

### 5.8 Tiến trình
Cấp thế giới (tăng cấp hoang dã), % khám phá (chunk + rương + trạm), danh tiếng, trạm dịch chuyển (dịch chuyển nhanh từ bản đồ thế giới có fog-of-war). HLV gục → tỉnh lại ở trạm cuối cùng.

### 5.9 Cửa hàng
Cửa hàng chia **8 kệ**: Bóng · Hồi phục · Kẹo EXP · Tiến hóa · Đá Mega · Chiến đấu · Tăng hệ · Huấn luyện. Mỗi món có ảnh, giá, số đang có, mô tả, Pokémon dùng được. Mua nhiều cùng lúc (×1 / ×5 / ×10 / Tối đa, hiện tổng tiền trước khi mua).

---

## 6. Việt Nam Odyssey

Chiến dịch riêng theo ô lưu, cùng engine với Phiêu lưu nhưng bản đồ, nhiệm vụ, khởi đầu và tiền tệ riêng. Starter: **Treecko / Torchic / Mudkip**. Không có Pokémon hệ Băng (miền Nam nhiệt đới). Địa danh chỉ dùng thông tin có thật; Pokémon, đền cổ và truyền thuyết ghi rõ là giả tưởng.

| Tỉnh | Cấp | Nội dung chính | Boss khu vực → Huy hiệu |
|---|---|---|---|
| **Cà Mau** | 1–10 | Đất Mũi, Mũi Cà Mau, rừng ngập mặn, Rừng Tràm U Minh Hạ | Seviper — Chúa Rừng U Minh → Huy hiệu Rừng Tràm |
| **An Giang** | 8–18 | Bảy Núi, Trà Sư, Núi Sam, Đền Cổ Thất Sơn, đảo Phú Quốc (đi phà) | Claydol — Hộ Vệ Đền Cổ → Huy hiệu Bảy Núi |
| **Cần Thơ** | 16–26 | Bến Ninh Kiều, Chợ nổi Cái Răng, Cồn Sơn, miệt vườn Phong Điền | Whiscash — Chúa Sông Hậu → Huy hiệu Sông Hậu |

**Danh tiếng từng tỉnh**: người dân Cà Mau, An Giang, Cần Thơ chào theo hạng danh tiếng của bạn ở tỉnh đó. Hạng *Được tin cậy* mở nhiệm vụ riêng: *Tuần tra rừng tràm U Minh*, *Lời nhờ của Sư cô Núi Cấm*, *Mối hàng chợ nổi* (giao hàng từ vườn Phong Điền ra chợ nổi).

**Chợ nổi Cái Răng** (Cần Thơ): họp 5:00–9:00 giờ trong game. 4 ghe hàng treo cây bẹo; hàng có hạn mỗi phiên, hôm sau có hàng mới; mối quen (danh tiếng *Được tin cậy*) bớt 10%.

**Hộ chiếu hành trình** (phím **P**): mỗi tỉnh một trang với dấu "ĐÃ ĐẾN", ngày đến, tiến độ khu vực / nhiệm vụ / rương / huấn luyện viên, địa danh và huy hiệu.

---

## 7. Chơi online

### 7.1 Co-op PvE (2 người)
- Sảnh **Chơi online** → chọn Sinh tồn / Phiêu lưu / Việt Nam Odyssey → tạo phòng nhận mã 6 ký tự, người kia nhập mã.
- Chủ phòng chạy mô phỏng; khách mang tối đa 3 Pokémon, có HUD riêng, dự đoán chuyển động của mình để giảm trễ.
- Đứng gần đồng đội bị gục 3 giây để cứu; đi quá xa chủ phòng sẽ được đưa về.
- **Chia chiến lợi phẩm**: Pokémon chủ phòng bắt được, đồ trong rương, thưởng hầm ngục và tiền cuối lượt đều cộng vào ô lưu của khách. Nhiệm vụ, cờ cốt truyện, huy hiệu chỉ thuộc chủ phòng. Mỗi phần thưởng có mã riêng: khách xác nhận, chủ phòng gửi lại khi mạng chập chờn, khách không nhận trùng.
- **6 thử thách co-op** luân phiên (Dọn đường cùng bạn, Kề vai sát cánh, Thợ săn tinh nhuệ, Không bỏ lại ai, Tiếp sức đồng đội, Song hành diệt boss), thưởng cho cả hai.

### 7.2 PvP
- Luật **Chuẩn** (Lv50, cấm huyền thoại, không trùng loài), **Tự do** (cấp thật), **Huyền thoại** (Lv50, cho phép huyền thoại). Chọn đội 6 từ Bộ sưu tập hoặc đội thuê.
- Trận thời gian thực 3 phút: 3 con trên sân, còn lại dự bị, đổi Pokémon (Z X C, hồi 4 giây), lệnh chiến thuật, Mega 1 lần/trận. Hết giờ: bên còn nhiều % HP hơn thắng.
- Chủ phòng kiểm tra đội của khách (IV, EV, cấp, luật). Có chế độ **Luyện tập với máy**. Lưu thành tích thắng / thua / hòa.
- Trong thế giới mở, lại gần người kia và bấm **E** để thách đấu bằng đội hiện tại.

### 7.3 Kết nối
Mặc định qua máy chủ Cloudflare (giữ chỗ 60 giây khi rớt mạng, tự nối lại); `?net=peer` dùng WebRTC, `?net=local` thử hai tab trên một máy, `?netstats` xem ping/jitter.

---

## 8. Thế giới online (máy chủ)

Tài khoản riêng (độc lập với ô lưu offline), có mã khôi phục, đổi mật khẩu, đăng xuất mọi thiết bị.
- Ba vùng **Cà Mau, An Giang, Cần Thơ**, đổi vùng qua cổng (cổng huy hiệu mở theo cấp đội).
- **Một Pokémon ngoài sân** do máy chủ quản lý (gọi ra / thu hồi / đổi có hồi chiêu); dùng kẹo EXP và tiến hóa.
- **Alpha chung**: mọi người cùng đánh, EXP và thưởng theo đóng góp, thưởng nhóm tối đa +30%.
- **8 sự kiện máy chủ** luân phiên mỗi 10 phút (bảo vệ rừng tràm, bão Đất Mũi, di cư Alpha, giữ dòng sông…), thông báo trước 60 giây.
- **Máy PC** kiểu GBA (16 box × 30 ô): rút / gửi, tìm, lọc, sắp xếp, khóa, đặt biệt danh.
- **Xã hội**: chat, nhắn riêng `/w`, bạn bè, nhóm, biểu cảm, chặn / báo cáo; kênh 30 người/vùng.
- Máy chủ quyết định mọi chỉ số và phần thưởng. Chi tiết: [ONLINE_SERVER.md](ONLINE_SERVER.md).

---

## 9. Hồ sơ, lưu game & tiền tệ

- **Hồ sơ thiết bị**: tên 1–16 ký tự + 1 trong 8 avatar pixel; avatar là nhân vật của bạn trong thế giới mở, co-op và PvP.
- **3 ô lưu** độc lập (IndexedDB). Mỗi ô ghi rõ hành trình (Phiêu lưu hoặc Việt Nam); chơi mới xóa sạch ô đó. Lưu giữa trận boss giữ được HP + phase.
- **Ba loại tiền tách riêng**: Ngọc (Sinh tồn, chỉ mua nâng cấp vĩnh viễn) · Xu (Phiêu lưu, Thế giới online) · Đồng (Việt Nam Odyssey).
- Bộ sưu tập, Pokédex, túi đồ dùng chung giữa Sinh tồn và Phiêu lưu trong cùng ô: Pokémon bắt ở Phiêu lưu có thể chọn làm khởi đầu Sinh tồn.

---

## 10. Điều khiển

| Hành động | Máy tính | Điện thoại |
|---|---|---|
| Di chuyển / chạy | WASD hoặc mũi tên · **Shift** | Kéo bất kỳ đâu (joystick ảo) · nút **Chạy** |
| Tương tác | **E** / Space | Nút **E** |
| Ném bóng / đổi bóng | **F** (ngắm chuột) / **R** | Nút ◓ (tự nhắm) |
| Lệnh chiến thuật | `` ` `` và 1–5 | Nút **Lệnh** |
| Kỹ năng chủ động | **Q** chiêu tốt nhất · click ô chiêu · chuột phải = giữ chiêu · **T** đổi Pokémon | Chạm ô chiêu · nhấn giữ = giữ chiêu · chạm tên = đổi |
| Mega | **G** | Nút **MEGA** |
| Đổi Pokémon | Shift + 1–6 | Chạm danh sách đội |
| Dùng thuốc | **H** | — |
| Đội hình / Pokédex / Túi / Nhiệm vụ / Bản đồ / Hộ chiếu | Tab / X / I / J / M / P | Nút trên HUD |
| Tạm dừng / menu | Esc (Sinh tồn: Esc / P) | Nút `II` / ≡ |
| Chọn thẻ nâng cấp (Sinh tồn) | 1 / 2 / 3 | Chạm thẻ |
| Thế giới online | Space / F tấn công Alpha · M menu · Enter chat | Nút trên màn hình |

Game tự tạm dừng khi tab mất focus.

---

## 11. Âm thanh & hình ảnh

- Pixel art tỉ lệ nguyên (zoom chốt bội số để pixel đều), canvas vẽ theo độ phân giải màn hình nên chữ sắc nét trên máy tính và điện thoại.
- Mỗi Pokémon có hoạt ảnh đi / đứng / đánh / niệm chiêu / trúng đòn / gục; VFX va chạm riêng cho 18 hệ; icon pixel cho hệ, trạng thái, kỹ năng, vật phẩm.
- Ngày/đêm, đèn, mưa, sương, nước và cỏ động.
- Hơn 10 bản nhạc chiptune tự sáng tác tổng hợp bằng WebAudio (theo vùng, hầm ngục, boss, boss huyền thoại).

---

## Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [OPEN_WORLD_DESIGN.md](OPEN_WORLD_DESIGN.md) | Thiết kế chi tiết thế giới mở, sinh thái, thu phục, hầm ngục |
| [EVOLUTION_EQUIPMENT_MEGA.md](EVOLUTION_EQUIPMENT_MEGA.md) | Luật tiến hóa, bảng trang bị, Mega, World Boss |
| [ONLINE_SERVER.md](ONLINE_SERVER.md) | Máy chủ, giao thức, triển khai, độ trễ |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc mã nguồn |
| [CHANGELOG.md](CHANGELOG.md) | Lịch sử thay đổi theo phiên bản |
