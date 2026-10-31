# Pokémon Survivor — Toàn bộ hệ thống gameplay

> Cập nhật theo mã nguồn hiện tại: phiên bản 0.14.0 cộng các bản chưa phát hành V20 → V29 (xem [CHANGELOG.md](CHANGELOG.md)).
> Tài liệu này mô tả **game chơi như thế nào** và **mỗi hệ thống vận hành ra sao**. Chi tiết kỹ thuật nằm ở các tài liệu riêng (cuối trang).

Pokémon Survivor là game Pokémon fan-made, phi thương mại, 2D góc nhìn từ trên xuống. Game chạy trên trình duyệt (Phaser 3 + TypeScript), chơi được trên máy tính và điện thoại.

**Ý tưởng cốt lõi:** Pokémon **tự chiến đấu theo thời gian thực**. Người chơi điều khiển huấn luyện viên (HLV): di chuyển, né đòn, ra lệnh chiến thuật, chọn thời điểm tung chiêu, ném bóng thu phục và chọn nâng cấp. Đội Pokémon tự tìm mục tiêu, tự chọn chiêu và tự né vùng cảnh báo.

---

## Mục lục

1. [Các chế độ chơi](#1-các-chế-độ-chơi)
2. [Chiến đấu thời gian thực](#2-chiến-đấu-thời-gian-thực-dùng-chung)
3. [Pokémon](#3-pokémon)
4. [Chế độ Sinh tồn](#4-chế-độ-sinh-tồn)
5. [Chế độ Phiêu lưu (thế giới mở)](#5-chế-độ-phiêu-lưu-thế-giới-mở)
6. [Việt Nam Odyssey](#6-việt-nam-odyssey)
7. [Chơi online](#7-chơi-online)
8. [Thế giới online (máy chủ)](#8-thế-giới-online-máy-chủ)
9. [Hồ sơ, lưu game & tiền tệ](#9-hồ-sơ-lưu-game--tiền-tệ)
10. [Điều khiển](#10-điều-khiển)
11. [Hình ảnh & âm thanh](#11-hình-ảnh--âm-thanh)

---

## 1. Các chế độ chơi

| Chế độ | Kiểu chơi | Thời lượng | Tiền tệ |
|---|---|---|---|
| **Sinh tồn** | Auto-battle roguelite: sống sót 15 phút và hạ Boss cuối | 1 lượt ~15 phút | Ngọc |
| **Phiêu lưu** | Thế giới mở: khám phá, thu phục, nhiệm vụ, hầm ngục, huyền thoại | Chiến dịch dài | Xu |
| **Việt Nam Odyssey** | Chiến dịch thế giới mở xuyên Việt: 36 tỉnh từ Cà Mau tới Hà Nội, Lv 1 → 100 | Chiến dịch rất dài | Đồng |
| **Chơi online** | Co-op 2 người (cả 3 chế độ trên), PvP thời gian thực | Theo phòng | Theo chế độ của chủ phòng |
| **Thế giới online** | Thế giới chung nhiều người trên máy chủ, tài khoản riêng | Liên tục | Xu (máy chủ) |

Mọi chế độ dùng chung **một engine chiến đấu**. Vì vậy Pokémon, chiêu thức, trạng thái, trang bị và Mega hoạt động giống nhau ở mọi nơi.

**Vòng lặp chung của các chế độ thế giới mở:** khám phá vùng mới → gặp và thu phục Pokémon hoang dã → làm nhiệm vụ, đấu huấn luyện viên → lên cấp, tiến hóa, trang bị → hạ boss khu vực lấy huy hiệu → huy hiệu mở cổng sang vùng tiếp theo, nơi Pokémon mạnh hơn.

---

## 2. Chiến đấu thời gian thực (dùng chung)

### 2.1 Nguyên tắc
- Mô phỏng chạy cố định 60 bước/giây, tách khỏi phần vẽ. Cùng seed và cùng thao tác cho ra cùng kết quả (cần cho online và test).
- Sát thương theo công thức bản gốc: `((2L/5+2)·Power·A/D/50+2) × STAB 1.5 × Hệ × Chí mạng 1.5 × Ngẫu nhiên 0.85–1 × Hệ số`. Đòn vật lý dùng Atk/Def, đòn đặc biệt dùng SpA/SpD.
- Đủ **18 hệ** (bảng Gen 6+). Pokémon hai hệ nhân cả hai hệ số; miễn nhiễm = 0 sát thương.
- Chiêu có **độ chính xác** (hiện "Trượt!") và tỉ lệ khựng lấy từ PokéAPI. Đạn và đòn diện rộng thì né bằng vị trí.
- Các dạng đòn: cận chiến, đạn, tia, lao, vùng tròn, hình nón, vùng đất kéo dài, khiên, hồi máu, buff/debuff.
- Màu số sát thương: vàng = siêu hiệu quả, xám = kém hiệu quả, cam có `!` = chí mạng, đỏ = phe mình bị đánh.
- Cấp tối đa **100** (`MAX_LEVEL`). Quái tinh nhuệ và Alpha cũng không vượt Lv100.

### 2.2 Trạng thái
Bỏng, Độc, Độc nặng, Hút máu (Leech Seed), Chậm, Choáng, Ngủ (tỉnh khi bị đánh), Đóng băng (đòn Lửa làm tan), Tê liệt, Rối loạn, Khựng, Khiêu khích (kéo aggro), Tăng công, Giảm thủ.

Mỗi trạng thái có thời lượng, giới hạn cộng dồn và icon pixel trên đầu. Boss và Elite kháng phần lớn sát thương theo thời gian, để DoT không phá game.

**Combo nguyên tố** (trạng thái + hệ của đòn kế tiếp): Hơi Nước, Vỡ Băng, Quá Tải, Cháy Lan, Kịch Độc. Ở thế giới mở, mỗi mục tiêu chỉ dính combo một lần mỗi 6 giây.

### 2.3 AI đồng đội
Mỗi Pokémon có một **vai trò**, quyết định cách chọn mục tiêu và vị trí đứng:

| Vai trò | Mục tiêu | Di chuyển |
|---|---|---|
| Tank | Kẻ địch gần / đang đánh HLV | Lao vào cận chiến, khiên + khiêu khích |
| Fighter | Gần bản thân | Áp sát |
| Assassin | Máu thấp nhất, tránh Boss | Vòng ra sau, nhanh hơn |
| Marksman | Gần nhất | Giữ tầm bắn, thả diều |
| Mage | Cụm địch đông nhất | Giữ khoảng cách |
| Support | Gần HLV | Đứng cạnh đồng đội yếu nhất, hồi máu |

- **Chọn chiêu bằng chấm điểm**, không ngẫu nhiên. Các tiêu chí: trong tầm → hết hồi chiêu → đủ năng lượng → lợi thế hệ × STAB → số địch trong vùng → đồng đội cần hồi máu → bản thân gặp nguy.
- Luôn **ưu tiên thoát khỏi vùng cảnh báo** của địch. Bám mục tiêu để không giật qua lại. Bị kéo quá xa thì dịch chuyển về HLV.
- Máy trạng thái tường minh: nghỉ / theo / tìm / đuổi / định vị / tấn công / niệm chiêu / né / hồi phục / choáng / bỏ chạy / gục.
- **Ở thế giới mở:**
  - Pokémon yếu (< 30% HP, không phải tank) lùi về cạnh HLV.
  - Khi HLV < 50% HP, tank và fighter chuyển sang bảo vệ HLV.
  - Lúc yên bình, Pokémon tự hái bụi quả chín gần đó.

### 2.4 Lệnh chiến thuật
Phím `` ` `` và 1–5 (điện thoại: nút **Lệnh**):
- **Tự do**
- **Tấn công mục tiêu**: con dưới con trỏ / con được chạm.
- **Bảo vệ HLV**
- **Ngừng tấn công**: không giao chiến, vẫn hồi máu.
- **Giữ vị trí**
- **Quay về HLV**

### 2.5 Kỹ năng chủ động (Phiêu lưu, Việt Nam Odyssey, PvP, co-op)
Pokémon vẫn tự đánh; người chơi chọn **lúc nào** và **chiêu nào** cho Pokémon đang điều khiển.
- **Q**: dùng chiêu tốt nhất đang sẵn sàng (AI chọn chiêu, bạn chọn thời điểm). Nếu vừa rê chuột lên một Pokémon địch (trong 4 s), chiêu nhắm vào đúng con đó.
- Click / chạm một ô trên **thanh kỹ năng** để dùng đúng chiêu đó.
- **T** (hoặc nút **Đổi**): mở vòng đổi nhanh Pokémon (mục 2.7).
- Chuột phải / nhấn giữ một ô: **giữ chiêu** cho mình, AI không dùng chiêu đó nữa. Lựa chọn này lưu theo từng Pokémon trong save, giữ nguyên sau khi tải lại, học chiêu mới hay tiến hóa.

Luật giống hệt AI (hồi chiêu, năng lượng, vật phẩm khóa chiêu, miễn nhiễm hệ), cộng thêm **hồi chiêu chung 1,2 s** giữa hai lệnh để không spam. Nếu mục tiêu ngoài tầm, Pokémon tự đi tới đúng tầm trong tối đa 3 s.

PvP và khách co-op có cùng thanh kỹ năng và phím Q / T: lệnh gửi tới chủ phòng, chủ phòng xử lý theo cùng luật. Sinh tồn giữ tự động hoàn toàn.

### 2.6 Trang bị & Mega
- Mỗi Pokémon cầm **1 vật phẩm** có hiệu ứng thật trong chiến đấu:
  - Tăng sát thương theo hệ (Charcoal, Mystic Water, Never-Melt Ice, Dragon Scale, Metal Coat…), Muscle Band / Wise Glasses, Expert Belt, Life Orb.
  - Chí mạng và tốc độ: Scope Lens, Quick Claw.
  - Hồi máu và trụ lại: Leftovers, Shell Bell, Sitrus Berry, Focus Band / Sash.
  - Bộ Choice (khóa chiêu), Assault Vest, Rocky Helmet, Eviolite.
  - Đồ luyện EV (Power item, Macho Brace) và Mega Stone.
- **Mega Tiến Hóa**:
  - Điều kiện: có Vòng Mega, Pokémon ở dạng cuối, cầm đúng Mega Stone và đang giao chiến.
  - Kích hoạt bằng phím **G** / nút **MEGA**.
  - Kéo dài tối đa 90 giây (tự trở lại khi rời giao tranh), hồi 120 giây, mỗi lúc chỉ 1 con.
  - Dạng Mega dùng chỉ số, hệ và đặc tính thật từ PokéAPI. Hiện có gần 50 đá Mega.

### 2.7 Đội & đồng đội
Đội tối đa 6 con.
- **Một Pokémon trên sân mỗi HLV (V29)** — áp dụng cho người chơi, HLV NPC và cả hai người trong co-op ở Phiêu lưu / Việt Nam Odyssey. Mọi con số nằm trong `src/data/field-rules.json`:
  - Thả con mới thì con đang ở ngoài luôn được thu về trước (mọi đường gọi: phím, vòng đổi, năng lực khám phá, co-op).
  - **Vòng đổi nhanh** (T / nút **Đổi** / tự mở khi Pokémon gục): HP, hệ, trạng thái, thời gian hồi; phím 1–5 chọn.
  - Đổi lúc yên bình: hồi 0,8 s. Đang giao chiến (có địch trong 600 px): thu về + thả ra ~0,6 s, hồi 6 s.
  - Trong bóng, chiêu vẫn hồi và năng lượng vẫn tăng; HP không hồi.
  - Pokémon gục quay về bóng; sau 4 s game tự thả con khỏe hợp hệ nhất. Hết Pokémon khỏe → HLV ngất.
  - EXP: con đã đánh nhận đủ, con khỏe trong bóng nhận 50%, con gục không nhận.
  - Boss chỉnh theo luật một-con: HP ×0,5, sát thương ×0,65, kháng sát thương theo thời gian, khống chế ngắn hơn và miễn khống chế 6 s, tối đa 1 quân tiếp viện mỗi HLV (thấp hơn 8 cấp).
  - Khi ném bóng, đồng đội ngừng đánh con đang bị bắt.
- **Summon / Recall**: thả Pokémon ra bằng đúng loại bóng đã bắt, thu hồi bằng tia đỏ, đổi bằng Shift + 1–6, vòng đổi hoặc chạm danh sách đội.
- Năng lực khám phá (chặt, đập đá, đẩy đá, đền) tự thả con có năng lực đó ra trước khi dùng.
- **Synergy**: 2 / 3+ con cùng hệ → +10% / +20% sát thương hệ đó; đội có ≥ 5 hệ → +5%.

---

## 3. Pokémon

- **National Dex 1025 loài** (Gen 1–9) với chỉ số, hệ, đặc tính, bộ chiêu, nhóm tăng trưởng EXP và tỉ lệ bắt lấy từ PokéAPI.
- **Chỉ số cá thể**:
  - IV 0–31 và 25 tính cách.
  - EV theo yield chuẩn, giới hạn 252 / 510; luyện bằng Power item, vitamin, berry.
  - Độ thân thiết 0–255.
- **Chiêu mở theo cấp** từ learnset (Phiêu lưu / Việt Nam Odyssey). Sinh tồn dùng bộ chiêu đầy đủ ngay từ đầu.
- **Tiến hóa** theo luật PokéAPI: cấp, đá, vật phẩm cầm, thân thiết, ngày/đêm, địa điểm, chiêu đã biết, mưa…
  - Tiến hóa bằng trao đổi được thay bằng **Dây Liên Kết** (Linking Cord).
  - Có nhiều nhánh hợp lệ thì người chơi chọn.
  - Màn tiến hóa hiện bảng chỉ số trước → sau và chiêu mới; bỏ qua được.
- **Shiny** tỉ lệ 1/4096 (1/1024 khi có sự kiện Bùng phát), giữ qua tiến hóa, có Pokédex Shiny riêng.
- **Starter**: Phiêu lưu và Việt Nam Odyssey cho chọn 27 starter Gen 1–9. Tab mở sẵn là bộ ba của chiến dịch: Kanto cho Phiêu lưu, Hoenn cho Việt Nam.
- **Máy PC**: lưu trữ ngoài đội, đặt ở mọi Trung tâm Pokémon.
- Sprite mặc định vẽ bằng code / bộ PMD (hoạt ảnh 8 hướng). Gói sprite chính thức là tùy chọn, chỉ dùng cá nhân (xem README).

---

## 4. Chế độ Sinh tồn

### 4.1 Vòng lặp
1. Chọn Pokémon khởi đầu từ Bộ sưu tập của ô lưu (mang theo cấp, IV, tính cách, trang bị).
2. Kẻ địch xuất hiện liên tục ngoài màn hình, mỗi lúc một đông hơn, nhanh hơn và đa dạng hơn.
3. Đội tự chiến đấu. Kẻ địch rơi **EXP gem**, HLV đi nhặt (trong bán kính nam châm).
4. Lên cấp → game tạm dừng, chọn **1 trong 3 thẻ nâng cấp**.
5. Boss xuất hiện ở **5:00, 10:00, 15:00**. Hạ Boss cuối = chiến thắng.
6. HLV hết HP = thua. Pokémon hết HP chỉ kiệt sức 15 giây, rồi hồi sinh với 50% HP.

### 4.2 Kẻ địch & Boss
- Kẻ địch thường:
  - Rattata: bầy cận chiến.
  - Magnemite: bắn xa, làm chậm.
  - Geodude: trâu, chậm.
- **Elite**: ×4 HP, viền vàng, ×5 EXP. Tỉ lệ xuất hiện tăng dần tới 7%.
- **Enemy Director**:
  - Tốc độ spawn, cấp, tốc độ di chuyển và nhịp bắn tăng theo phút.
  - Mở khóa loài mới theo thời gian.
  - **Sự kiện bầy đàn** ở 2:30 / 7:30 / 12:30. Vòng vây luôn chừa khe thoát 20%.
- **Boss Onix**:
  - Thân rắn 6 đốt. Chiêu: Rock Throw ngắm đón đầu, Earthquake, Body Slam lao thẳng, Rock Tomb.
  - Dưới 50% HP sang phase 2: triệu hồi Geodude Elite, di chuyển nhanh hơn.
  - Hạ Boss: mưa EXP, hồi 50% HP cho đội, thẻ nâng cấp từ Sử Thi trở lên.
- Bản đồ Rừng 3200×3200 px. Cây có va chạm và **chặn đạn** (dùng làm chỗ nấp).

### 4.3 Thẻ nâng cấp trong lượt
Độ hiếm: Thường 62% · Hiếm 26% · Sử Thi 10% · Huyền Thoại 2%.
- Pokémon mới gia nhập (đội tối đa 6); nâng cấp kỹ năng (tối đa cấp 5).
- Chỉ số: Sức mạnh, Hồi chiêu, Sinh lực, Phạm vi, Chí mạng, Tốc chạy, Nam châm, Năng lượng, Đa phóng (+1 đạn, chỉ ở thẻ Sử Thi trở lên).
- **Tiến hóa**: thẻ Sử Thi khi đủ cấp; tiến hóa bằng vật phẩm mở ở Lv28.
- **Mega**: thẻ Huyền Thoại từ Lv32, 1 con mỗi lượt.
- Mỗi thẻ hiện xem trước `hiện tại → sau khi chọn (tối đa)`. Các giới hạn nằm trong `src/data/upgrades.json`.

### 4.4 Tiến trình ngoài lượt
- Kết thúc lượt nhận **Ngọc**, dùng để mua **Nâng cấp vĩnh viễn**: 6 dòng × 5 cấp (Sức mạnh, Sinh lực, Tập trung, Nhanh nhẹn, Nam châm, Chí mạng).
- Sống tới 10:00 hoặc hạ 2 Boss → các loài đã chiêu mộ trong lượt được thêm vào Bộ sưu tập ở Lv5.

---

## 5. Chế độ Phiêu lưu (thế giới mở)

### 5.1 Thế giới
Bản đồ chia chunk, tải động. Có ngày/đêm, thời tiết (mưa, sương, bão tuyết, nắng nóng), cỏ cao, sông, cầu và đảo. Bảy vùng mở dần theo cốt truyện:

| Vùng | Cấp | Điểm nhấn |
|---|---|---|
| Thung Lũng Khởi Nguyên | 3–13 | Làng khởi đầu (Trung tâm Pokémon, bảng nhiệm vụ), Trại Huấn Luyện, 8 khu, câu cá ở Hồ Pha Lê, bụi quả ở Đồng Cỏ Gió, Hang Đá Cổ, World Boss Mega Venusaur |
| Rừng Ngọc Lục Bảo | 12–19 | Rừng sâu sau Rìa Rừng Ngọc (mở sau Hang Đá Cổ): Lõi Rừng, Suối Lục Bảo, Chòi Kiểm Lâm |
| Đầm Lầy Sương Mù | 22–32 | Vũng bùn độc, lối ván gỗ |
| Bờ Biển San Hô | 26–38 | Biển, hải đăng, rạn san hô |
| Núi Tuyết Vĩnh Hằng | 32–45 | Mặt băng trơn, bão tuyết, Hang Băng Vĩnh Cửu |
| Vùng Đất Núi Lửa | 42–58 | Hơi nóng dung nham, phun trào, Lò Dung Nham |
| Thánh Địa | cao nhất | Tháp Thử Thách, Nhà vô địch |

**Hiệu ứng môi trường** có tác động thật:
- Băng làm chậm.
- Bão tuyết gây sát thương (hệ Băng miễn nhiễm).
- Hơi nóng dung nham gây sát thương (hệ Lửa / Nước / Đất miễn nhiễm).
- Bùn độc gây độc (hệ Độc / Thép miễn nhiễm).

### 5.2 Pokémon hoang dã & sinh thái
- Mỗi loài có sinh cảnh, độ hiếm, khoảng cấp, giờ hoạt động, hệ số thời tiết và tính khí (nhút nhát / trung tính / hung hăng). Cá chỉ xuất hiện và bơi trong nước.
- **AI hoang dã**: lang thang, ăn, ngủ (theo chu kỳ ngày/đêm), cảnh giác, bỏ chạy, đuổi đánh, quay về lãnh thổ.
- **Đàn**: một số loài đi thành nhóm 2–4 con với một con đầu đàn (dạng tiến hóa nếu cấp cho phép). Đánh một con thì cả đàn phản ứng; đầu đàn gục thì đàn tan.
- **Lãnh thổ**: loài giữ lãnh thổ cảnh báo bằng vòng đỏ khi người chơi bước vào, rồi tấn công; ra khỏi vùng thì thôi đuổi.
- **Điều kiện hiếm**: có loài chỉ xuất hiện khi đúng sinh cảnh / vùng + giờ + thời tiết. Khi chúng xuất hiện có thông báo gợi ý, và lần gặp được ghi vào save.
- Bảng tên trên đầu: tên + cấp, α Alpha, ★ tinh anh, ✦ shiny.

### 5.3 Thu phục
1. Tiếp cận và đánh yếu.
2. Chọn bóng (**R**).
3. Ngắm và ném (**F**; điện thoại tự nhắm). Giao diện ngắm hiện **% bắt thực tế**.
4. Bóng bay vòng cung, lắc 0–3 lần, rồi thành công hoặc thoát ra.

- Công thức Gen III/IV.
- Bóng: Poké / Great / Ultra / Master, cùng các bóng đặc biệt Net, Dusk, Quick, Timer, Luxury.
- Không bắt được Pokémon của huấn luyện viên, Pokémon trong hầm ngục và boss khu vực.

### 5.4 Nhiệm vụ, NPC & huấn luyện viên
- **Loại nhiệm vụ**: chính, phụ, thu phục, thách đấu, khám phá, giải cứu, câu đố, hầm ngục, boss, bảo tồn.
  - HUD có mũi tên chỉ hướng kèm khoảng cách.
  - NPC hiện `!` khi có nhiệm vụ, `?` khi chờ báo cáo.
- **Tiến độ nhiệm vụ (V30)**: các bước đi theo thứ tự, nhưng thứ tự chỉ bắt buộc ở chỗ cần thiết.
  - *Nói chuyện / báo cáo*, *lựa chọn* và *tình huống cốt truyện* (giữ vị trí, phá thiết bị, hộ tống) chỉ tính khi tới đúng bước.
  - Đánh, bắt, khám phá, mở rương, câu cá, kích hoạt trạm, hầm ngục… làm trước khi tới bước (lúc nhiệm vụ đang chạy) vẫn được giữ lại và tính ngay khi tới bước; nhật ký đánh dấu ☑ / ghi số đếm.
  - Việc chỉ xảy ra một lần trong save (kích hoạt trạm, thắng HLV, hạ boss, mở rương, giải câu đố, dọn chướng ngại, điểm bảo tồn) được tính cả khi đã làm từ trước lúc nhận nhiệm vụ. Khám phá được tính nếu đang đứng sẵn trong khu đó.
  - `src/core/questAudit.ts` rà toàn bộ dữ liệu nhiệm vụ (mục tiêu tồn tại, nhiệm vụ mở được, người giao không bị ẩn, dấu bản đồ hợp lệ); test giữ cả hai chiến dịch ở 0 lỗi.
- **Nhiệm vụ phân nhánh**: chọn hướng nào thì mục tiêu, phần thưởng, lời kết và nhiệm vụ nối tiếp đi theo hướng đó; không quay lại được.
- **Hình NPC**: nhân vật pixel có hoạt ảnh thở / bước, 15 dáng (nón lá, áo dài, trẻ em, cụ ông / cụ bà, kiểm lâm, người leo núi…). Mỗi NPC có bộ màu riêng cố định theo id. Danh xưng tiếng Việt (Cô, Bà, Chú, Bé…) quyết định giới tính và tuổi.
- **Trận huấn luyện viên**:
  - 1 Pokémon trên sân (cùng luật với người chơi), còn lại dự bị.
  - Pokémon gục → HLV gửi con dự bị hợp hệ nhất để đối đầu Pokémon bạn đang điều khiển.
  - Pokémon bị khắc hệ và còn dưới 50% HP bị gọi về, đổi lấy con kháng hệ (HP được giữ).
  - Có 1–2 Potion, dùng khi dưới 30% HP.
  - Bảng tên ⚔ = chưa đấu, ✓ = đã thắng.
- **Tái đấu** sau 10 phút chơi: cấp đối thủ theo đội bạn (tối đa +15 so với đội gốc, +2 mỗi lần thắng lại); thưởng tiền, không lặp vật phẩm.
- **Danh tiếng theo vùng**: điểm từ nhiệm vụ và trận HLV cộng vào vùng đang đứng.
  - Hạng: *Người lạ* → *Quen mặt* (15) → *Được tin cậy* (40) → *Người nhà* (80).
  - Mỗi hạng tặng quà một lần và mở nhiệm vụ riêng.
  - Người dân chào theo hạng của bạn.
- **Nhật ký** (J): bộ lọc Tất cả / **Chính** / **Phụ** / Vùng này / Đã xong / **Cốt truyện** / Danh tiếng.
  - *Chính*: nhiệm vụ chính, boss và nhiệm vụ cốt truyện; *Phụ*: mọi nhiệm vụ còn lại.
  - *Cốt truyện*: các hồi / chương (chương chưa tới giấu tóm tắt; chương xong ghi thế giới đã thay đổi gì), nhân vật đã gặp, và mọi cảnh đã xem — bấm **Xem lại** để đọc lại.
- **Cốt truyện & cảnh (V29)**: mỗi chiến dịch có một mạch truyện riêng (mục 5.13 và 6.5) nằm trong `src/data/story/*.json`.
  - Nhiệm vụ cốt truyện có id cố định (`ck-…`, `mn-…`), thuộc một chương, có cảnh mở đầu / kết thúc.
  - Cảnh tự phát khi yên (không hội thoại, không giao chiến, không đấu HLV). Mỗi trang có **Tiếp ▶** hoặc **Bỏ qua cảnh**; đã mở là tính đã xem (lưu trong `storySeen`), xem lại được trong nhật ký.
  - NPC / HLV cốt truyện xuất hiện và rời đi theo cờ (`showIf` / `hideIf`); cùng một nhân vật giữ nguyên ngoại hình ở mọi bản đồ.
  - Lời thoại thường ngày đi theo cốt truyện (V30, `phases`, `core/story.ts npcLines`): khi thần hộ vệ một tỉnh đã nguôi giận, người dẫn đường nói lời riêng và dân làng thay nhau nói 4 câu của tỉnh (`data/vietnam/peace.json`) thay vì kể chuyện rắc rối cũ. Vài người ở Quần Đảo Khởi Nguyên (bà đồng đầm lầy, người giữ hải đăng, trưởng làng…) đổi lời sau từng chương (`data/story/npc-phases.json`).
  - Ngã rẽ được báo trước trong lời giao nhiệm vụ.
- **Mục tiêu tình huống (V29)** trên bản đồ:
  - **Giữ vị trí**: đứng trong vòng tròn khi có Pokémon trên sân; các đợt Pokémon hoang dã kéo tới. Ra khỏi vòng thì tạm dừng; ra quá 8 s thì phải giữ lại từ đầu.
  - **Phá thiết bị**: lại gần thì thiết bị (máy của phe đối địch) xuất hiện, đứng yên một chỗ; vừa đánh vừa chặn các đợt Pokémon kéo tới.
  - **Hộ tống**: lại gần người cần đưa đi, người đó đi theo sau, nấp khi có giao chiến; bỏ xa quá 14 ô thì phải quay lại đón.
  - Rời bản đồ, ngất hay chuyển nhiệm vụ đều chỉ làm tình huống bắt đầu lại, không mất nhiệm vụ.
- **Hướng dẫn** (K / F1 / nút **?**): bảng phím theo nhóm, điều khiển cảm ứng và các trang cách chơi (`src/scenes/helpGuide.ts`). Lần đầu vào game có lời nhắc. Ô nhập chữ không kích hoạt phím tắt.
- **Bản đồ** (M): sương mù theo vùng đã khám phá, trạm dịch chuyển, hầm ngục, sự kiện, mục tiêu nhiệm vụ, bến ghe, chướng ngại khám phá.

### 5.5 Làng khởi đầu & Trại Huấn Luyện
- **Trung tâm Pokémon**: y tá hồi phục cả đội, máy PC ở cửa.
- **Bảng nhiệm vụ** của làng nhận việc vặt.
- Dân làng đi lại ban ngày, về chỗ ban đêm.
- **Trại Huấn Luyện**: Thầy Khang và 3 học viên, mỗi người một lối đánh. Chuỗi 3 bài học dạy chọn chiêu khắc hệ, né và rút lui, dồn hỏa lực bằng lệnh Tấn công. Tốt nghiệp mở rương của trại.

### 5.6 Câu cá & hái lượm
- **Câu cá**:
  - Đứng cạnh chỗ nước gợn sóng, bấm E để thả câu.
  - Khi phao chìm và hiện "!", bấm lại trong 0,9 s. Sớm hay chậm thì cá chạy (không mất lượt).
  - Kết quả: vật phẩm, hoặc một Pokémon hệ Nước để đánh / bắt.
  - Cần có cần câu (lấy từ nhiệm vụ).
- **Bụi quả**: bấm E để hái quả mọng, thuốc, bóng, kẹo EXP. Đôi khi có Pokémon trốn trong bụi nhảy ra.
- Mỗi điểm hồi lại theo thời gian chơi: điểm câu 60–75 s, bụi quả 4–5 phút.

### 5.7 Năng lực khám phá & đi ghe
Pokémon trong đội (ra sân hay trong bóng đều được) mở đường:
- **Cắt cây**: dọn bụi cây rậm. Cần hệ Cỏ / Bọ / Thép, Lv 8+.
- **Đập đá**: phá tảng đá nứt. Cần hệ Giác Đấu / Đá / Đất, Lv 14+.
- **Đẩy đá**: đẩy tảng đá lớn mỗi lần một ô, ra xa người chơi; đẩy vào ổ thì lối mở. Cần hệ Giác Đấu / Đất / Thép, Lv 18+.

Sau các chướng ngại là hốc bí mật có rương.

**Ghe / xuồng / đò / phà** (Việt Nam Odyssey):
- Lên / xuống ở bến (E). Trên ghe chỉ đi trên nước.
- Dòng sông đẩy ghe xuôi: mạnh lúc nước ròng, yếu lúc nước lớn (2 con nước mỗi ngày).
- Có nơi chỉ đến được bằng ghe: Bãi Bồi giữa sông Hậu, cù lao An Bình, đảo Phú Quốc.

### 5.8 Hầm ngục
Hang Đá Cổ (Onix), Hang Băng Vĩnh Cửu (Mamoswine), Lò Dung Nham (Magmortar), Tháp Thử Thách (Tyranitar, có giới hạn thời gian).
- Cấu trúc mỗi hầm: phòng sóng quái → bẫy (đá rơi / băng rơi / đá nóng) → câu đố → phòng Boss → rương.
- **3 độ khó**: Thường / Khó / Chuyên gia; có phần thưởng lần đầu riêng.
- **Biến thể theo ngày**: 1–2 biến thể mỗi ngày trong game cho từng hầm và độ khó (Hang tối, Bầy đàn, Địa chấn, Tinh anh, Bẫy ngầm, Mạch quặng). Biến thể càng khó, EXP càng nhiều. Xem trước được ở cửa hang.
- **Flash**: Pokémon hệ Điện / Lửa / Tiên Lv 10+ trong đội soi sáng hang tối.
- **Bẫy sàn**: 2 / 4 / 6 bẫy tùy độ khó; mỗi bẫy kích hoạt một lần.
- **Phòng bí mật** sau vách đá nứt (cần *Đập đá*), có rương mỗi lượt.

### 5.9 Boss & huyền thoại
- **World Boss Mega Venusaur Thần Rừng**: 3 phase. Phase cuối phủ cả khu, chỉ chừa 3 vùng bóng râm an toàn.
- **Boss nhiều phase** dùng chung BossPhaseManager:
  - Một đòn không thể bỏ qua phase.
  - Có cinematic chuyển phase và đổi dạng (ví dụ Rayquaza → Mega Rayquaza → Cuồng Nộ).
  - Boss HUD có thanh HP, phase, cảnh báo tên chiêu kèm đếm ngược.
- **35 huyền thoại / thần thoại Gen 1–4**:
  - Chuỗi nhiệm vụ huyền thoại mở theo dữ liệu (Thần Điểu → Lugia, Tam Thú → Ho-Oh, … → Arceus).
  - Đánh tới **WEAKENED** (4% HP) thì mở **cửa sổ bắt**, có giới hạn lượt ném và thời gian. Bắt hụt thì nó bay đi và quay lại sau. Cửa sổ bắt lưu trong save.
- **Điều tra huyền thoại**: 13 huyền thoại có 3 manh mối rải trên bản đồ. Đủ manh mối → biết điều kiện xuất hiện và được thêm 1 lượt ném.
- **Đền huyền thoại** (xem [LEGENDARY_SHRINES.md](LEGENDARY_SHRINES.md)):
  - 32 đền có sơ đồ riêng, mỗi đền 4 lớp: vùng bao ngoài, sân nghi lễ, lõi triệu hồi, arena.
  - Bấm E ở chỗ làm lễ → nghi lễ → chuyển cảnh → trận trong arena niêm phong, có hiểm họa riêng.
  - Các đền là **bí mật**: nằm ở dimension / Bí Cảnh riêng, chỉ vào được qua lối vào ẩn (dọn chướng ngại hoặc đọc đủ manh mối). Dân làng kể tin đồn chỉ đường.

### 5.10 Sự kiện thế giới
- Các loại sự kiện: Bùng phát, Pokémon Alpha, Di cư, Vùng biến dạng, kho báu, bão tuyết / sóng nhiệt.
- **Thương nhân lưu động**: 6 món hiếm, giảm 30%.
- **Mưa sao băng**: nhặt 5 mảnh sao để đổi đá tiến hóa / đá Mega.
- Mọi sự kiện có thông báo, bảng đếm ngược và đánh dấu trên bản đồ nhỏ.

### 5.11 Tiến trình
- **Cấp thế giới**: tăng cấp Pokémon hoang dã.
- **% khám phá**: tính theo chunk + rương + trạm.
- **Trạm dịch chuyển**: dịch chuyển nhanh từ bản đồ thế giới (có sương mù chưa khám phá).
- HLV gục → tỉnh lại ở trạm cuối cùng.

### 5.12 Cửa hàng
- **8 kệ**: Bóng · Hồi phục · Kẹo EXP · Tiến hóa · Đá Mega · Chiến đấu · Tăng hệ · Huấn luyện.
- Mỗi món có ảnh, giá, số đang có, mô tả và danh sách Pokémon dùng được.
- Mua nhiều cùng lúc (×1 / ×5 / ×10 / Tối đa), hiện tổng tiền trước khi mua.

### 5.13 Cốt truyện: Quần Đảo Khởi Nguyên (V29)
Hải Đăng Khởi Nguyên ở Bờ Biển San Hô tắt từ khi **Lõi Khởi Nguyên** vỡ thành 7 mảnh rơi khắp quần đảo.
- **Nhân vật**: Trưởng đoàn khảo sát Minh Khuê; Phong (khảo sát viên trẻ, vừa là bạn vừa là đối thủ); Ông giữ hải đăng; Trưởng nhóm Thiết của đoàn khai thác Thiết Lĩnh (đào mảnh Lõi lên bán); Giáo sư Tùng.
- **7 chương** (9 nhiệm vụ `ck-…`, mở sau *Bước chân đầu tiên* và theo đúng cổng vùng sẵn có):

| Chương | Bản đồ | Diễn biến chính | Mục tiêu |
|---|---|---|---|
| 1 | Thung Lũng | Đoàn khảo sát dựng trại, Thiết Lĩnh khoan dưới tàn tích | đấu Phong, khám phá, phá máy khoan |
| 2 | Rừng Ngọc | Mảnh Lõi "hát", Pokémon kéo về trái tim rừng | giữ vị trí |
| 3 | Đầm Lầy | Máy bơm bùn làm sương độc dày thêm | đấu thợ khai thác, phá máy bơm |
| 4 | Bờ Biển | Ông giữ hải đăng kể chuyện Lõi; **ngã rẽ** trao 3 mảnh cho ông hay để đoàn khảo sát giữ | gặp, giữ chân hải đăng, chọn |
| 5 | Núi Tuyết | Phong lên đỉnh một mình, kẹt trong bão | hộ tống Phong về trại |
| 6 | Núi Lửa | Máy khoan lớn nhất ở miệng núi lửa | đấu Trưởng nhóm Thiết, phá máy khoan |
| 7 | Thánh Địa → Bờ Biển | Bảy mảnh hợp lại; mang Lõi về hải đăng | giữ Lõi 60 s, trao Lõi — hải đăng sáng lại |

- **Hậu quả của ngã rẽ chương 4 (V30)**:
  - *Trao 3 mảnh cho ông giữ đèn* (`ck:lamp-early`): đèn le lói ngay. Ở chương 6, Thiết đã thấy ánh đèn từ miệng núi lửa nên không đánh nữa, chỉ đứng cạnh máy khoan (bỏ bước đấu Thiết, `skipIf`). Lời của Thiết và đoạn kết nhắc lại chuyện này.
  - *Để đoàn khảo sát giữ* (`ck:survey-scan`): máy dò bắt nhịp ba mảnh, giữ Lõi ở chương 7 chỉ còn **40 s** (`secondsIf`). Khuê nói lý do, đoạn kết nhắc ghi chép của máy dò.
  - Cơ chế dùng chung: mục tiêu `skipIf` (tự qua khi có cờ), câu thoại cảnh truyện `if` / `unless`, trận giữ vị trí `secondsIf`.

---

## 6. Việt Nam Odyssey

Chiến dịch riêng theo ô lưu. Dùng cùng engine với Phiêu lưu, nhưng bản đồ, nhiệm vụ, khởi đầu và tiền tệ (Đồng) là riêng.
- Người chơi đi **xuyên Việt qua 36 tỉnh** theo đơn vị hành chính mới (nhiều tỉnh gộp tỉnh cũ), từ Mũi Cà Mau (Lv 1) tới Thủ đô Hà Nội (Lv 100).
- Starter do giáo sư cho chọn: Gen 1–9, tab mở sẵn là Hoenn (**Treecko / Torchic / Mudkip**).
- Địa danh chỉ dùng thông tin có thật. Pokémon, đền cổ và truyền thuyết trong game được ghi rõ là giả tưởng.

### 6.1 Lộ trình 36 tỉnh

| # | Tỉnh | Cấp | Khu vực chính | Boss khu vực | Huy hiệu |
|---|---|---|---|---|---|
| 1 | **Cà Mau** | 1–10 | Mũi Cà Mau, rừng ngập mặn Đất Mũi, rừng tràm U Minh Hạ | Seviper — Chúa Rừng U Minh (Lv12) | Rừng Tràm |
| 2 | **An Giang** | 2–12 | Đảo Phú Quốc, Đền Cổ Thất Sơn, Bảy Núi, Núi Sam, Trà Sư, Đồng Nước Nổi | Claydol — Hộ Vệ Đền Cổ (Lv14) | Bảy Núi |
| 3 | **Cần Thơ** | 6–14 | Cồn Sơn, sông Hậu, chợ nổi Cái Răng, miệt vườn Phong Điền, Thới Lai, vườn cò Bằng Lăng | Whiscash — Chúa Sông Hậu (Lv16) | Sông Hậu |
| 4 | **Vĩnh Long** | 8–15 | Cù lao An Bình, sông Tiền, ruộng khoai Bình Tân, lò gạch Mang Thít, bưởi Bình Minh | Torkoal — Thần Lò Mang Thít (Lv18) | Gốm Đỏ |
| 5 | **Trà Vinh** | 13–19 | Rừng dầu cổ thụ, dừa Cầu Kè, sông Cổ Chiên, Ao Bà Om, Chùa Hang | Trevenant — Thần Cây Dầu (Lv21) | Cây Dầu |
| 6 | **Bến Tre** | 17–23 | Làng kẹo dừa, vườn dừa Thới Sơn, sông Hàm Luông, rừng tràm, đồng cỏ Mỏ Cày | Exeggutor — Dừa Trăm Thân (Lv23) | Dừa Xiêm |
| 7 | **Đồng Tháp** | 19–25 | Mỹ Tho, chợ nổi Cái Bè, làng hoa Sa Đéc, xoài Cao Lãnh, Gò Tháp, Tràm Chim | Ludicolo — Thần Sen Tháp Mười (Lv25) | Sen Hồng |
| 8 | **Tây Ninh** | 22–28 | Đồng lúa Long An, làng nổi Tân Lập, Tòa Thánh Cao Đài, hồ Dầu Tiếng, Núi Bà Đen | Golurk — Thần Núi Bà Đen (Lv28) | Núi Bà |
| 9 | **TP. Hồ Chí Minh** | 25–31 | Củ Chi, Lái Thiêu, Thảo Cầm Viên, bến Bạch Đằng, Cần Giờ, Vũng Tàu | Magnezone — Thần Điện Sài Gòn (Lv31) | Sài Gòn |
| 10 | **Đồng Nai** | 27–33 | Cát Tiên, Bàu Sấu, đồi điều Bình Phước, Bửu Long, thác Giang Điền | Tauros — Bò Tót Cát Tiên (Lv33) | Bò Tót |
| 11 | **Lâm Đồng** | 30–36 | Langbiang, đồi thông Đà Lạt, hoa Vạn Thành, hồ Xuân Hương, chè Cầu Đất, đồi cát Mũi Né | Florges — Thần Hoa Đà Lạt (Lv36) | Ngàn Hoa |
| 12 | **Khánh Hòa** | 32–38 | Đèo Khánh Lê, tháp Bà Ponagar, vịnh Nha Trang, nho Ninh Thuận, Po Klong Garai, Cam Ranh | Kingdra — Thần Vịnh Nha Trang (Lv38) | Vịnh Biển |
| 13 | **Đắk Lắk** | 35–41 | Yok Đôn, Buôn Đôn, đồi cà phê, hồ Lắk, thác Dray Nur, Gành Đá Đĩa | Donphan — Voi Thần Yok Đôn (Lv41) | Voi Rừng |
| 14 | **Gia Lai** | 37–43 | Biển Hồ, núi lửa Chư Đăng Ya, võ đường Tây Sơn, Kon Ka Kinh, Quy Nhơn | Conkeldurr — Võ Thần Tây Sơn (Lv43) | Võ Tây Sơn |
| 15 | **Quảng Ngãi** | 39–45 | Măng Đen, Ngọc Linh, Kon Tum, Sa Huỳnh, đảo Lý Sơn | Dhelmise — Hồn Neo Lý Sơn (Lv45) | Đảo Tỏi |
| 16 | **Đà Nẵng** | 41–47 | Bà Nà, Sơn Trà, Mỹ Sơn, Hội An, biển Mỹ Khê, cầu Rồng | Salamence — Rồng Sông Hàn (Lv47) | Cầu Rồng |
| 17 | **Huế** | 44–50 | Lăng tẩm, Đại Nội, phá Tam Giang, Bạch Mã, Lăng Cô | Aegislash — Gươm Báu Hoàng Thành (Lv50) | Cố Đô |
| 18 | **Quảng Trị** | 46–52 | Phong Nha, Nhật Lệ, Trường Sơn, Vịnh Mốc, cầu Hiền Lương | Noivern — Dơi Thần Sơn Đoòng (Lv52) | Hang Động |
| 19 | **Hà Tĩnh** | 49–55 | Hồng Lĩnh, chùa Hương Tích, Vũ Quang, bưởi Phúc Trạch, Thiên Cầm | Braviary — Đại Bàng Hồng Lĩnh (Lv55) | Hồng Lĩnh |
| 20 | **Nghệ An** | 51–57 | Pù Mát, đảo chè Thanh Chương, làng Sen, Quỳ Châu, Cửa Lò | Decidueye — Cú Thần Pù Mát (Lv57) | Sông Lam |
| 21 | **Thanh Hóa** | 53–59 | Pù Luông, suối cá thần Cẩm Lương, thành nhà Hồ, Bến En, Sầm Sơn | Milotic — Nữ Thần Suối Cẩm Lương (Lv59) | Cá Thần |
| 22 | **Ninh Bình** | 55–61 | Hang Múa, Tràng An, Bái Đính, Cúc Phương, Tam Cốc | Hydreigon — Rồng Ba Đầu Hang Múa (Lv61) | Hạ Long Cạn |
| 23 | **Hưng Yên** | 57–63 | Nhãn lồng, bãi sông Hồng, chùa Keo, đồng lúa Thái Bình, Đồng Châu | Tsareena — Nữ Hoàng Nhãn Lồng (Lv63) | Nhãn Lồng |
| 24 | **Hải Phòng** | 59–65 | Côn Sơn, vải Thanh Hà, cảng Hải Phòng, Đồ Sơn, Cát Bà | Talonflame — Chim Lửa Hoa Phượng (Lv65) | Hoa Phượng |
| 25 | **Bắc Ninh** | 61–67 | Đồi Lim, Tây Yên Tử, tranh Đông Hồ, vải Lục Ngạn, chùa Dâu | Primarina — Nàng Quan Họ (Lv67) | Quan Họ |
| 26 | **Quảng Ninh** | 64–70 | Yên Tử, mỏ than Cẩm Phả, Bãi Cháy — vịnh Hạ Long, Vân Đồn, rừng ngập mặn | Dragonite — Rồng Mẹ Hạ Long (Lv70) | Rồng Hạ Long |
| 27 | **Lạng Sơn** | 66–72 | Núi Tô Thị, Mẫu Sơn, ải Chi Lăng, chợ Kỳ Lừa, sông Kỳ Cùng | Gigalith — Nàng Tô Thị Hóa Đá (Lv72) | Vọng Phu |
| 28 | **Cao Bằng** | 69–75 | Động Ngườm Ngao, thác Bản Giốc, Pác Bó, hồ Thang Hen, đèo Mã Phục | Incineroar — Hổ Lửa Ngườm Ngao (Lv75) | Hang Hổ |
| 29 | **Thái Nguyên** | 71–77 | Hang Phượng Hoàng, hồ Núi Cốc, ATK Định Hóa, chè Tân Cương, mỏ sắt Trại Cau | Polteageist — Hồn Ấm Chè Tân Cương (Lv77) | Đệ Nhất Danh Trà |
| 30 | **Tuyên Quang** | 74–80 | Đèo Mã Pí Lèng, hồ Na Hang, Tân Trào, Hoàng Su Phì, cao nguyên đá Đồng Văn | Mudsdale — Ngựa Thần Mã Pí Lèng (Lv80) | Mã Pí Lèng |
| 31 | **Lào Cai** | 76–82 | Đỉnh Fansipan (tuyết), thác Bạc, bản Cát Cát, Mường Hoa, đèo Ô Quy Hồ | Abomasnow — Thần Tuyết Fansipan (Lv82) | Nóc Nhà Đông Dương |
| 32 | **Lai Châu** | 79–85 | Bạch Mộc Lương Tử (biển mây), hồ thủy điện, Pu Sam Cáp, chè Tam Đường, Sìn Hồ | Altaria — Chim Mây Bạch Mộc (Lv85) | Biển Mây |
| 33 | **Điện Biên** | 82–88 | Đèo Pha Đin, hồ Pá Khoang, Mường Phăng, cánh đồng Mường Thanh, A Pa Chải | Aggron — Hộ Thần Đèo Pha Đin (Lv88) | Pha Đin |
| 34 | **Sơn La** | 86–92 | Tà Xùa (sống lưng khủng long), Quỳnh Nhai, Bản Áng, đồi chè và thảo nguyên Mộc Châu | Tyrantrum — Bạo Long Tà Xùa (Lv92) | Sống Lưng Khủng Long |
| 35 | **Phú Thọ** | 90–96 | Đền Hùng — núi Nghĩa Lĩnh, ngã ba Bạch Hạc, Xuân Sơn, chè Long Cốc, Tam Đảo | Gyarados — Thủy Tinh Nổi Giận (Lv96) | Đất Tổ |
| 36 | **Hà Nội** | 94–100 | Thành Cổ Loa, Hồ Gươm, Ba Vì, vườn đào Nhật Tân, chùa Hương | Torterra — Thần Kim Quy Cổ Loa (Lv100) | Thăng Long |

Hạ Torterra ở Hà Nội là **kết thúc hành trình xuyên Việt**: nhận Huy hiệu Thăng Long và lời kết.

### 6.2 Cấu trúc một tỉnh
Từ tỉnh 8 trở đi, mỗi tỉnh dùng chung một khuôn (sinh từ spec bằng `scripts/gen-province.ts`):
- **Cổng vào**: cổng nối từ tỉnh trước, chỉ mở khi có huy hiệu của tỉnh đó. Đi được hai chiều.
- **6 khu vực**: thành phố trung tâm + 5 khu hoang dã, mỗi khu một sinh cảnh (rừng, hồ, núi đá, đồng ruộng / vườn, đồng cỏ, phế tích, đầm lầy, bờ biển, tuyết). Cấp hoang dã nằm trong khoảng [boss − 6, boss].
- **9 nhiệm vụ**:
  - 3 nhiệm vụ chính: ghé Trung tâm Pokémon + khu đầu tiên → hỏi chuyện 2 NPC → thắng HLV canh cửa rồi hạ boss. Nhiệm vụ boss chờ nhiệm vụ cốt truyện của tỉnh (mục 6.5).
  - 1 nhiệm vụ giải cứu (đánh bầy canh để cứu một Pokémon).
  - 4 nhiệm vụ phụ gắn với HLV và địa danh.
  - 1 nhiệm vụ bảo tồn (mở sau boss).
- **7 NPC, 5 huấn luyện viên** (đội 3 con theo chủ đề, gần cấp tỉnh), 6 rương. Có 1 rương trong hốc bí mật, mở bằng năng lực khám phá.
- **Boss khu vực**: sinh vật giả tưởng của game, không bắt được. Có chiêu riêng, triệu hồi con non, đòn tối thượng mang tên tiếng Việt. Muốn gặp boss phải thắng HLV canh cửa trước.
- **Hộ chiếu**: 3 địa danh được đóng dấu.
- **Danh tiếng riêng của tỉnh**: 4 lời chào theo hạng và quà ở mỗi hạng.
- **Bảo tồn**: 6 điểm phục hồi ven nước.

### 6.3 Đặc trưng theo vùng
- **Pokémon hệ Băng**: chỉ có ở **vùng tuyết đỉnh Fansipan** (Lào Cai). Ở mọi nơi khác của Việt Nam, khí hậu nhiệt đới nên không có hệ Băng. Huấn luyện viên ở Việt Nam không dùng Pokémon hệ Nước / Băng (trừ boss).
- **Miền Tây sông nước** (Cà Mau → Đồng Tháp):
  - Rừng ngập mặn có lạch triều và bãi bùn; miệt vườn có liếp cây ăn trái xen mương; ruộng mùa nước nổi.
  - Đi ghe theo con nước. Chợ nổi Cái Răng họp 5:00–9:00 giờ trong game: 4 ghe hàng, hàng có hạn mỗi phiên, mối quen được bớt 10%.
- **Nhiệm vụ phân nhánh** ở miền Tây: bẫy ở U Minh, lưới dày hay câu vừa đủ mùa nước nổi, phân xử bến ghe Ninh Kiều.
- **Sự kiện vùng miền**: 70% sự kiện thế giới mang màu địa phương: Mùa cá linh về, Nước nổi tràn đồng, Triều cường, Cò về vườn, Lễ hội trái cây miệt vườn, Đêm đom đóm. Mỗi sự kiện có loài, thời tiết, hàng hóa và quà riêng.
- **Bảo tồn** (sau boss mỗi tỉnh):
  - Hành động theo tỉnh: trồng đước, gỡ lưới bỏ hoang, vớt rác sông / hồ / vịnh, dọn tro trấu, nhặt rác bãi biển…
  - Mỗi điểm cộng 15 vào **sức khỏe sinh thái** (thang 0–100) của tỉnh; hạ boss cộng thêm 10. Mức Suy thoái / Hồi phục (40) / Trù phú (80).
  - Sinh thái càng tốt, Pokémon hiếm theo điều kiện xuất hiện càng thường (tối đa ×2). Đạt Trù phú được quà một lần.
- **Hộ chiếu hành trình** (phím **P**): mỗi tỉnh một trang với dấu "ĐÃ ĐẾN", ngày đến, tiến độ khu vực / nhiệm vụ / rương / huấn luyện viên, địa danh và huy hiệu.

### 6.4 Thành phố trung tâm kiểu phố cổ phương Đông (V28)
Thành phố trung tâm của cả 36 tỉnh được dựng theo phong cách phố cổ:
- **Nhà mái ngói cong**:
  - Chi tiết: đầu đao vút, bờ nóc, cột sơn son, cửa bức bàn sơn đỏ đinh vàng, song cửa giấy, nền đá, đèn lồng đỏ trước cửa.
  - 4 màu ngói: đỏ nâu, xám xanh, vàng lưu ly, men xanh.
  - Trung tâm Pokémon và cửa hàng có hoành phi trên cửa.
  - Đình, chùa, bảo tàng, Văn Miếu dùng mái chồng diêm hai tầng, trên nóc có "lưỡng long chầu nguyệt".
- **Cổng tam quan** bắc qua đường vào quảng trường (33/36 tỉnh): hai trụ chặn đường, lối giữa đi qua được.
- **Quảng trường lát gạch đỏ Bát Tràng**.
- **Dãy nhà phố** (hiệu thuốc bắc, tiệm trà, hiệu may áo dài, tiệm gốm, tiệm đèn lồng…) quay cửa ra đường. Tổng cộng 256 nhà.
- **Đồ trang trí đường phố**: cột đèn lồng sáng ấm về đêm, chậu bonsai, đèn đá, lư hương trước đình chùa.

Toàn bộ hình vẽ bằng code (`src/render/orientalArt.ts`). Nhà vẫn chơi như nhà thường: chặn đường, cửa có đèn, Trung tâm Pokémon có máy PC.

### 6.5 Cốt truyện: Mạch Nguồn (V29)
Dưới đất nước chảy những **mạch nguồn** cổ giữ nhịp cho sông, rừng và Pokémon. **Dự án Bình Minh** của Tiến sĩ Vũ dựng các trạm cưỡng chế để lấy năng lượng chống hạn mặn — khắp nơi nước chảy ngược, Pokémon bỏ nơi ở, các hộ vệ cổ thức giấc. Toàn bộ là giả tưởng; địa danh là thật.
- **Nhân vật**: Giáo sư An (Đất Mũi, trao starter); **Linh** — kỹ sư thủy văn, đồng hành, chờ ở thành phố trung tâm từng tỉnh khi bạn có huy hiệu tỉnh trước và rời đi khi xong chặng; **Khải** — đối thủ cùng xuất phát; **Tiến sĩ Vũ** — người đứng đầu Bình Minh, cuối truyện sống và chuộc lỗi; **Chú Sáu** — lái ghe.
- **Cấu trúc** (46 nhiệm vụ `mn-…`, 20 cảnh; mỗi tỉnh một chặng có vấn đề địa phương, cần nhiệm vụ cốt truyện tỉnh trước + huy hiệu tỉnh trước):

| Hồi | Tỉnh | Diễn biến | Mục tiêu tiêu biểu |
|---|---|---|---|
| Mở đầu | Cà Mau | Trạm nước Đất Mũi, cứu Pokémon mắc lưới khi triều lên, bộ khuếch đại làm Seviper nổi giận ở khu làm tổ, Huy hiệu Rừng Tràm, lên ghe Chú Sáu | đấu Khải, giữ bãi, phá thiết bị, boss |
| I — Dòng nước đổi chiều | An Giang → Đồng Tháp | Kênh chảy ngược, trạm bơm sông Hậu, lò gạch quá nhiệt, cột phát sóng làm cò bỏ đi, bé lạc rừng tràm, sếu không về Tràm Chim | giữ / phá / hộ tống xen kẽ |
| II — Thành phố của Bình Minh | Tây Ninh → Đồng Nai | Ăng-ten Núi Bà; ở Sài Gòn **Khải gia nhập Bình Minh**, Magnezone quá tải vì trạm biến áp; bò tót bỏ rừng | phá, đấu Khải, boss, giữ |
| III — Những điểm neo cổ | Lâm Đồng → Quảng Trị | Bình Minh cắm cọc vào điểm neo; Khải bắt đầu nghi ngờ; ở Huế **ngã rẽ** đưa / giữ dữ liệu điểm neo cho Tiến sĩ Vũ (mở 1 trong 2 nhiệm vụ nối tiếp ở Quảng Trị); hộ tống Khải bị thương ở Phong Nha | giữ, phá, hộ tống, đấu kỹ thuật viên, chọn |
| IV — Hộ vệ thức giấc | Hà Tĩnh → Phú Thọ | Hộ vệ cổ (Braviary, Gigalith, Aggron…) thức dậy; ở Thanh Hóa **Khải rời Bình Minh**; ở Bắc Ninh tái đấu sòng phẳng | giữ, phá, hộ tống, tái đấu |
| V — Thăng Long | Hà Nội | Torterra bị nối vào tổng trạm; đấu Tiến sĩ Vũ; trận cuối: phá lõi cưỡng chế → giữ điểm neo Cổ Loa → làm dịu Torterra → **cùng Torterra** phá cột cáp (Torterra đứng cạnh, cứ 6 s dùng Địa Chấn lên cột và quái trong 7 ô; không bị đánh, không bắt được) | đấu, phá, giữ, boss, phá cùng đồng minh |
| Kết | Cà Mau | Trạm cưỡng chế thành trạm quan trắc, đàn Pokémon về lại U Minh; hậu truyện: Tiến sĩ Vũ ở trạm quan trắc Đất Mũi | nói chuyện |

- **Mạch nhiệm vụ một tỉnh (V30)**: **đến nơi** (người dẫn đường, nhiệm vụ `vn-…-1`) → **Linh điều tra và phá thiết bị Bình Minh** (song song với việc tìm hiểu địa phương) → **thần hộ vệ** → huy hiệu → tỉnh sau. Thiết bị là thứ làm hộ vệ nổi giận, nên phải phá nó trước khi làm dịu hộ vệ.
  - **Cà Mau**: Khởi hành → Trạm nước → Lưới khi triều lên → *Vào rừng U Minh* (Chú Sáu chỉ đường) → *Khu làm tổ của Seviper* (Kiểm lâm Nam giao: thắng Vy, phá bộ khuếch đại, Seviper) → *Rừng U Minh bình yên* (báo Kiểm lâm, mở trồng đước) → Giáo sư An trao huy hiệu.
  - **Sài Gòn / Hà Nội**: trận boss nằm trong nhiệm vụ cốt truyện (có bước thắng người canh cửa); nhiệm vụ tỉnh cùng chặng là đoạn kết (*Sài Gòn sáng đèn*, *Thần Kim Quy trở về* — mở khi đã cắt xong cáp). Mỗi hộ vệ chỉ đánh trong một nhiệm vụ.
  - **Đồng minh cốt truyện** (V30, `EncounterDef.ally`): trong trận *phá*, một Pokémon cốt truyện đứng về phía người chơi, định kỳ đánh mọi kẻ địch trong bán kính (một phần máu tối đa, thiết bị nhận một phần ba). Nó là unit của World (vẽ như mọi Pokémon) nhưng không bị trúng đòn (`tag: 'story-ally'`), không hung hăng, không bắt được, rời đi cùng trận.
  - Thế giới online không có cốt truyện: các điều kiện trỏ tới nhiệm vụ `mn-…` được bỏ qua.
  - `tests/v30_quest_flow.test.ts` chơi trọn mạch chính từ Đất Mũi tới đoạn kết và kiểm tra thứ tự ở cả 36 tỉnh.
- Cấp tham khảo của từng chặng theo cấp boss tỉnh đó (Linh nhắc khoảng cấp). Cấp các tỉnh theo dải (V30): tỉnh 1–7 Lv 1–25 · 8–15 Lv 25–45 · 16–24 Lv 45–65 · 25–32 Lv 65–85 · 33–36 Lv 85–100 (bảng 6.1). Cấp boss từng tỉnh nằm ở `scripts/story/levels.ts`; `scripts/rescale-vn-levels.ts` dời mọi cấp trên bản đồ tỉnh (khu, HLV, cứu hộ, boss) cùng một khoảng nên chênh lệch trong tỉnh giữ nguyên, Pokémon của HLV bị lùi về dạng tiến hóa hợp cấp; vùng gặp Pokémon đi theo khu. Các trận dựng tay trong cốt truyện tính cấp tương đối theo boss tỉnh.

---

## 7. Chơi online

### 7.1 Co-op PvE (2 người)
- **Tạo phòng**: sảnh **Chơi online** → chọn Sinh tồn / Phiêu lưu / Việt Nam Odyssey → tạo phòng nhận mã 6 ký tự; người kia nhập mã.
- **Chủ phòng và khách**:
  - Chủ phòng chạy mô phỏng.
  - Khách mang tối đa 6 Pokémon nhưng chỉ 1 con trên sân (ở Phiêu lưu / Việt Nam Odyssey), đổi con qua chủ phòng; có HUD riêng, và tự dự đoán chuyển động của mình để giảm trễ.
  - Cảnh cốt truyện và mục tiêu tình huống chỉ chạy ở máy chủ phòng; nhiệm vụ do chủ phòng xác thực.
- **Cứu và theo nhau**: đứng gần đồng đội bị gục 3 giây để cứu. Đi cách chủ phòng quá 900 px thì được đưa về cạnh họ.
- **Chia chiến lợi phẩm**:
  - Pokémon chủ phòng bắt được, đồ trong rương, thưởng hầm ngục và tiền cuối lượt đều cộng vào ô lưu của khách.
  - Nhiệm vụ, cờ cốt truyện và huy hiệu chỉ thuộc chủ phòng.
  - Mỗi phần thưởng có mã riêng nên khách không nhận trùng khi mạng chập chờn.
- **6 thử thách co-op** luân phiên: Dọn đường cùng bạn, Kề vai sát cánh, Thợ săn tinh nhuệ, Không bỏ lại ai, Tiếp sức đồng đội, Song hành diệt boss. Mỗi người nhận 200–600 xu khi hoàn thành.

### 7.2 PvP
- **Luật**: **Chuẩn** (Lv50, cấm huyền thoại, không trùng loài), **Tự do** (cấp thật), **Huyền thoại** (Lv50, cho phép huyền thoại).
- **Đội**: chọn 6 con từ Bộ sưu tập hoặc dùng đội thuê.
- **Trận đấu**:
  - Thời gian thực, 3 phút; 3 con trên sân, còn lại dự bị.
  - Đổi Pokémon bằng Z X C (hồi 4 giây); có lệnh chiến thuật và kỹ năng chủ động; Mega 1 lần mỗi trận.
  - Hết giờ: bên còn nhiều % HP hơn thắng.
- **Kiểm tra và luyện tập**: chủ phòng kiểm tra đội của khách (IV, EV, cấp, luật). Có chế độ **Luyện tập với máy**. Thành tích thắng / thua / hòa được lưu.
- Trong thế giới mở: lại gần người kia và bấm **E** để thách đấu bằng đội hiện tại.

### 7.3 Kết nối
- Mặc định đi qua máy chủ Cloudflare (relay): giữ chỗ 60 giây khi rớt mạng và tự nối lại.
- `?net=peer` dùng WebRTC trực tiếp; `?net=local` để thử hai tab trên cùng máy; `?netstats` xem ping / jitter.

---

## 8. Thế giới online (máy chủ)

Tài khoản riêng, độc lập với ô lưu offline; có mã khôi phục, đổi mật khẩu, đăng xuất mọi thiết bị.
- Ba vùng **Cà Mau, An Giang, Cần Thơ**. Đổi vùng qua cổng; cổng huy hiệu mở theo cấp đội.
- **Một Pokémon ngoài sân** do máy chủ quản lý (gọi ra / thu hồi / đổi có hồi chiêu); dùng được kẹo EXP và tiến hóa.
- **Alpha chung**: mọi người cùng đánh; EXP và thưởng chia theo đóng góp, thưởng nhóm tối đa +30%.
- **8 sự kiện máy chủ** luân phiên mỗi 10 phút, thông báo trước 60 giây.
- **Máy PC** kiểu GBA (16 box × 30 ô): rút / gửi, tìm, lọc, sắp xếp, khóa, đặt biệt danh.
- **Xã hội**: chat, nhắn riêng `/w`, bạn bè, nhóm, biểu cảm, chặn / báo cáo; kênh 30 người mỗi vùng.
- Máy chủ quyết định mọi chỉ số và phần thưởng. Chi tiết: [ONLINE_SERVER.md](ONLINE_SERVER.md).

---

## 9. Hồ sơ, lưu game & tiền tệ

- **Hồ sơ thiết bị**: tên 1–16 ký tự + 1 trong 8 avatar pixel. Avatar là nhân vật của bạn trong thế giới mở, co-op và PvP.
- **3 ô lưu** độc lập (IndexedDB):
  - Mỗi ô ghi rõ hành trình (Phiêu lưu hoặc Việt Nam); chơi mới sẽ xóa sạch ô đó.
  - Lưu giữa trận boss vẫn giữ được HP và phase.
  - Save có phiên bản và tự nâng cấp khi mở bản game mới.
- **Ba loại tiền tách riêng**: Ngọc (Sinh tồn, chỉ dùng mua nâng cấp vĩnh viễn) · Xu (Phiêu lưu, Thế giới online) · Đồng (Việt Nam Odyssey).
- Bộ sưu tập, Pokédex và túi đồ dùng chung giữa Sinh tồn và chiến dịch trong cùng ô: Pokémon bắt ở thế giới mở có thể chọn làm khởi đầu Sinh tồn.
- **"✨ Có gì mới"** ở menu chính tóm tắt các bản cập nhật.

---

## 10. Điều khiển

| Hành động | Máy tính | Điện thoại |
|---|---|---|
| Di chuyển / chạy | WASD hoặc mũi tên · **Shift** | Kéo bất kỳ đâu (joystick ảo) · nút **Chạy** |
| Tương tác (nói chuyện, câu cá, hái, lên ghe, cổng) | **E** / Space | Nút **E** |
| Ném bóng / đổi bóng | **F** (ngắm chuột) / **R** | Nút ◓ (tự nhắm) |
| Lệnh chiến thuật | `` ` `` và 1–5 | Nút **Lệnh** |
| Kỹ năng chủ động | **Q** chiêu tốt nhất (rê chuột chọn mục tiêu) · click ô chiêu · chuột phải = giữ chiêu | Chạm ô chiêu · nhấn giữ = giữ chiêu |
| Vòng đổi nhanh Pokémon | **T**, rồi 1–5 | Nút **Đổi** |
| Mega | **G** | Nút **MEGA** |
| Đổi Pokémon | Shift + 1–6 | Chạm danh sách đội |
| Dùng thuốc | **H** | — |
| Đội hình / Pokédex / Túi / Nhiệm vụ / Bản đồ / Hộ chiếu | Tab / X / I / J / M / P | Nút trên HUD |
| Tạm dừng / menu | Esc (Sinh tồn: Esc / P) | Nút `II` / ≡ |
| Chọn thẻ nâng cấp (Sinh tồn) | 1 / 2 / 3 | Chạm thẻ |
| Đổi Pokémon PvP | Z / X / C | Nút trên màn hình |
| Thế giới online | Space / F tấn công Alpha · M menu · Enter chat | Nút trên màn hình |

Game tự tạm dừng khi tab mất focus.

---

## 11. Hình ảnh & âm thanh

- **Pixel art tỉ lệ nguyên**: zoom chốt bội số để pixel đều; canvas vẽ theo độ phân giải màn hình nên chữ sắc nét trên máy tính và điện thoại.
- **Nền kiểu GBA (Ruby/Emerald)**:
  - Cỏ 3 tông, đường đất có viền, cỏ cao lay theo gió, bờ nước động.
  - Mép cát / đá răng cưa; tuyết, tro, đá bazan theo vùng.
- **Nhà và cây**:
  - Nhà Tiny Town và nhà cottage Adventure Awaits (CC0) ở các vùng Phiêu lưu.
  - Nhà phố cổ phương Đông vẽ bằng code ở Việt Nam Odyssey.
  - Cây cổ thụ tán rộng.
- **Hoạt ảnh và icon**:
  - Mỗi Pokémon có hoạt ảnh đi / đứng / đánh / niệm chiêu / trúng đòn / gục.
  - VFX va chạm riêng cho 18 hệ.
  - Icon pixel cho hệ, trạng thái, kỹ năng, vật phẩm.
- **Ánh sáng**: ngày / đêm, đèn cửa nhà, đèn lồng, đuốc, mưa, sương, nước và cỏ động.
- **Âm nhạc**: hơn 10 bản nhạc chiptune tự sáng tác, tổng hợp bằng WebAudio (theo vùng, hầm ngục, boss, boss huyền thoại).

---

## Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [OPEN_WORLD_DESIGN.md](OPEN_WORLD_DESIGN.md) | Thiết kế chi tiết thế giới mở, sinh thái, thu phục, hầm ngục |
| [MAP_DESIGN.md](MAP_DESIGN.md) | Thiết kế bản đồ |
| [EVOLUTION_EQUIPMENT_MEGA.md](EVOLUTION_EQUIPMENT_MEGA.md) | Luật tiến hóa, bảng trang bị, Mega, World Boss |
| [LEGENDARY_SHRINES.md](LEGENDARY_SHRINES.md) | Đền huyền thoại |
| [ONLINE_SERVER.md](ONLINE_SERVER.md) | Máy chủ, giao thức, triển khai, độ trễ |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc mã nguồn |
| [TASKS.md](TASKS.md) | Danh sách công việc và trạng thái |
| [CHANGELOG.md](CHANGELOG.md) | Lịch sử thay đổi theo phiên bản |
