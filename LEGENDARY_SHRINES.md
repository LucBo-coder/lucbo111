# LEGENDARY SHRINES — Hệ thống đền triệu hồi huyền thoại (thiết kế)

> Phạm vi: chế độ **Phiêu lưu** (7 bản đồ) và các bản đồ riêng (instance) mới cho nghi lễ cấp sự kiện. Việt Nam Odyssey **không** thêm huyền thoại (giữ bản sắc boss địa phương Seviper / Claydol / Whiscash).
> Trạng thái: **tài liệu thiết kế, chưa triển khai**. Mọi sơ đồ trong tài liệu được sinh bằng script và đã kiểm tra tự động: trong bán kính arena không có vật cản ngoài những vật được ghi rõ là "cover có chủ đích".

---

## 0. Hiện trạng (đã kiểm tra trong code / dữ liệu)

| Vấn đề | Chi tiết |
|---|---|
| **Đền nào cũng giống nhau** | `valley.ts` vẽ mọi đền bằng một công thức: 12 trụ `DUNGEON.pillar` trên vòng bán kính 7 ô, chừa 1 khe theo `gap`, dọn trống bán kính 8. Nền vẫn là cỏ / tuyết / tro của vùng. **Tâm đền trống**, không có altar. |
| **Không có nghi lễ** | `AdventureScene.updateWorldBoss()`: chỉ cần bước vào bán kính 330 px (~7 ô) là huyền thoại hiện ra ngay (nếu đủ cờ + điều kiện). Không có bước "đánh thức", không có chuyển cảnh, không có ranh giới arena. |
| **Vùng khởi đầu quá tải** | Thung Lũng Khởi Nguyên chứa **8 điểm huyền thoại**: Zapdos, Moltres, Mewtwo, Mew, Ho-Oh, Celebi, Jirachi, Shaymin (cộng boss Mega Venusaur). Rừng Ngọc Lục Bảo: 0. |
| **Mật độ lệch** | Bờ Biển San Hô 4 (Lugia, Kyogre, Rayquaza, Registeel), Núi Tuyết 4 (Articuno, Uxie, Regice, Regigigas), Thánh Địa 4, Đầm Lầy 3, Núi Lửa 3 (gồm Regirock — "đá đỏ" trong núi lửa). |
| **Lang thang vào vùng đầu game** | Raikou, Latias, Mesprit, Cresselia (Lv40–48) có `starter-valley` / `farm` (Lv2–8) trong danh sách vùng đi lang thang. |
| **Điểm tốt nên giữ** | Chuỗi mở khóa bằng cờ `boss:<id>` (`legends.json`), điều kiện giờ / thời tiết / độ thân thiết (`legendMissing`), 3 manh mối điều tra mỗi huyền thoại (`legend-clues.json`), boss nhiều pha (`bossPhases.ts`), cửa sổ thu phục khi kiệt sức, quà một lần (`LEGEND_REWARDS`), câu đố tấm nén (`puzzles`), năng lực khám phá (Cắt / Đập đá / Đẩy đá / Flash), hầm ngục là bản đồ riêng. Thiết kế dưới đây **dùng lại** các hệ thống này, không tạo hệ trùng. |

Tổng số huyền thoại trong dữ liệu: **35** (`legends.json`).

---

## BƯỚC 1 — Phân bố huyền thoại toàn world map

### 1.1 Phân tầng (35 loài)

| Tầng | Loài | Số |
|---|---|---|
| **1 — Cốt truyện chính** | Mewtwo, Ho-Oh, Lugia, Kyogre, Groudon, Rayquaza, Giratina, Dialga, Palkia, Arceus | 10 |
| **2 — Đền vùng** | Articuno, Zapdos, Moltres, Regirock, Regice, Registeel, Regigigas, Heatran, Cresselia, Uxie, Azelf | 11 |
| **3 — Lang thang** | Raikou, Entei, Suicune, Latias, Latios, Mesprit | **6** (trong khung 5–7) |
| **4 — Mythic / bí mật** | Mew, Celebi, Jirachi, Shaymin, Darkrai, Deoxys, Manaphy, Phione (Manaphy + Phione dùng chung 1 điểm) | 8 loài / 7 điểm |

Ghi chú phân loại: Mewtwo không có trong danh sách gợi ý nhưng là mốc cốt truyện của game (mở sau 3 Thần Điểu, mở khóa Mew và Tam Hộ Thần Hồ) → Tầng 1. Cresselia chuyển từ lang thang thành **đền vùng** (theo danh sách Tầng 2 của brief) để Darkrai có đối trọng "mộng đẹp / ác mộng". Uxie, Azelf là hai đền nhỏ cùng "họ Hồ Hộ Thần"; Mesprit giữ vai lang thang.

### 1.2 Bảng phân bố theo bản đồ

| Bản đồ (cấp) | Tầng 1 | Tầng 2 | Tầng 4 | Lang thang / điểm kích hoạt | Tổng đền |
|---|---|---|---|---|---|
| **Thung Lũng Khởi Nguyên** (2–24; vùng *khởi đầu* = Đồng Cỏ Gió, Làng, Nông Trại Lv2–8) | Mewtwo — Hang Tâm Linh (Đồi Đá Xám, **niêm phong + chỉ là vết nứt đá** tới khi có 3 Thần Điểu) | — | Mew — Tàn Tích Lặng (Tàn Tích Cổ, ẩn sau tường nứt) | Đá Cảm Xúc của Mesprit (bờ Hồ Pha Lê, chỉ là 1 phiến đá) | **2** (trước: 8) |
| **Rừng Ngọc Lục Bảo** (12–19) | Ho-Oh — Tháp Chuông Cầu Vồng (thấy từ sớm như một cột mốc, mở rất muộn) | Cresselia — Hồ Trăng Lục Bảo | Celebi — Vòng Cây Cổ | Đài Gió Thác Ngọc (Latias / Latios); 3 tượng Thú ở chân Tháp Chuông (Raikou / Entei / Suicune) | 3 |
| **Đầm Lầy Sương Mù** (22–32) | Giratina — Cổng Thế Giới Đảo Ngược | Azelf — Hồ Dũng Khí; Registeel — Lăng Thép Chìm | Darkrai — Đảo Ác Mộng | — | 4 |
| **Bờ Biển San Hô** (26–38) | Lugia — Đảo Xoáy Bạc | Zapdos — Đỉnh Sấm Vách Hải Âu; Regirock — Lăng Sa Thạch | Manaphy / Phione — Rạn Ấu Hải | Xoáy Nước Sâu = **cổng** xuống Vực Nguyên Hải của Kyogre (chỉ hiện sau Lugia + Ho-Oh) | 4 (+1 cổng muộn) |
| **Núi Tuyết Vĩnh Hằng** (32–45) | Rayquaza — Trụ Trời Đỉnh Bão | Articuno — Băng Đài Hồ Băng Lam; Regice — Lăng Băng Tĩnh | Jirachi — Đài Sao Băng | — | 4 |
| **Vùng Đất Núi Lửa** (42–58) | Groudon — Đại Điện Dung Nham | Moltres — Đền Lửa Thần Điểu; Heatran — Lòng Chảo Nham Tâm | Shaymin — Đồi Hoa Tái Sinh | — | 4 |
| **Thánh Địa Huyền Thoại** (65–85) | Arceus — **Thần Điện Khởi Nguyên** (cổng trên bản đồ; bên trong là bản đồ riêng gồm Điện Thời Gian / Dialga, Điện Không Gian / Palkia, Ngai Khởi Nguyên / Arceus) | Uxie — Hồ Tri Thức; Regigigas — Đại Điện Titan | Deoxys — Hố Thiên Thạch | — | 4 |
| **Vực Nguyên Hải** (bản đồ riêng) | Kyogre | — | — | — | 1 |
| **Việt Nam Odyssey** (3 tỉnh) | — | — | — | — | 0 (giữ boss tỉnh) |

Kiểm tra quy tắc:
- **Tầng 1 tối đa 1 / bản đồ**: đạt trên cả 7 bản đồ mặt đất. Hai trường hợp cần nói rõ vì có 10 loài Tầng 1 mà chỉ có 7 bản đồ:
  - *Dialga, Palkia, Arceus* là **một chuỗi sự kiện** ("Thần Điện Khởi Nguyên") trong một bản đồ riêng; trên bản đồ Thánh Địa chỉ có **1 cổng**.
  - *Kyogre* nằm trong bản đồ riêng *Vực Nguyên Hải*. Lối vào là một xoáy nước ở Bờ Biển San Hô (bản đồ biển duy nhất), **chỉ xuất hiện sau khi hạ Lugia và Ho-Oh**. Cho tới lúc đó Bờ Biển chỉ có 1 điểm Tầng 1. Phương án sạch hơn về lâu dài: thêm một bản đồ biển thứ hai ("Vịnh Đại Dương") cho Kyogre.
- **Tầng 2: 1–2 mỗi vùng lớn, vùng khởi đầu 0**: đạt (Thung Lũng 0, các vùng khác đúng 2, riêng Rừng Ngọc 1).
- **Tầng 4: 0–1 mỗi vùng**: đạt.
- **Lang thang: 6 loài**, không bao giờ vào Đồng Cỏ Gió / Làng / Nông Trại (xem 1.4).
- **Khoảng cách**: tâm hai đền trên cùng bản đồ cách nhau ≥ 30 ô; ≥ 20 ô tới thị trấn / trạm dịch chuyển; vùng bao ngoài không chặn đường chính (sẽ có test BFS).

### 1.3 Đồ thị mở khóa (tiến trình)

```
Mega Venusaur (Thung Lũng, boss vùng Lv24)
 ├─► 3 Thần Điểu: Articuno (Núi Tuyết) · Zapdos (Bờ Biển) · Moltres (Núi Lửa — vùng này mở sau Articuno)
 ├─► Tam Lăng Regi: Regirock (Bờ Biển) · Regice (Núi Tuyết) · Registeel (Đầm Lầy)
 ├─► Đánh thức 3 tượng Thú ở chân Tháp Chuông → Raikou / Entei / Suicune bắt đầu lang thang
 └─► Celebi (Rừng Ngọc, bình minh)
3 Thần Điểu ─► Mewtwo (Hang Tâm Linh) ─► Mew · Azelf · Mesprit (lang thang)
            └► Lugia (Đảo Xoáy Bạc, có bão, cần Lông Bạc)
3 Thú (hạ cả 3) ─► Ho-Oh (Tháp Chuông, ban ngày, cần Lông Cầu Vồng)
Lugia ─► Latias / Latios (Đài Gió kích hoạt)
Mew ─► Cresselia (Hồ Trăng, đêm) ─► Darkrai · Jirachi (đêm quang)
Celebi ─► Shaymin
Lugia + Ho-Oh ─► Groudon (Đại Điện Dung Nham) · Kyogre (Xoáy Nước Sâu → Vực Nguyên Hải)
Groudon ─► Heatran        Kyogre ─► Manaphy → Phione
Groudon + Kyogre ─► Rayquaza (Trụ Trời) ─► mở Thánh Địa: Deoxys · Uxie · cổng Thần Điện
Uxie + Mesprit + Azelf ─► Dialga · Palkia (trong Thần Điện)
Dialga + Palkia ─► Giratina (Đầm Lầy, đêm, cần Ngọc Bạch Kim)
3 Regi + vào được Thánh Địa ─► Regigigas
Dialga + Palkia + Giratina + Mewtwo + Rayquaza ─► Arceus (Ngai Khởi Nguyên)
```

Thay đổi so với hiện tại (đều là dữ liệu): Uxie mở muộn hơn (cùng lúc Dialga / Palkia, đúng chỗ đứng "tri thức → thời gian / không gian"); Cresselia mở bằng `boss:mew` như trước nhưng là đền; Regigigas đòi thêm quyền vào Thánh Địa.

### 1.4 Lang thang (6 loài) — vùng đi lại mới

| Loài | Điểm khởi đầu | Vùng lang thang (id trong `regions.json`) | Thời tiết | Dấu vết trên bản đồ |
|---|---|---|---|---|
| Raikou | Tượng Thú phía đông, chân Tháp Chuông | rocky-highlands, coral-coast, frozen-mountains | giông, mưa | vệt cỏ cháy xém có tia điện nhỏ |
| Entei | Tượng Thú phía tây | rocky-highlands, ancient-ruins, volcanic-lands | nắng gắt, quang | dấu chân bốc khói |
| Suicune | Tượng Thú ở cổng | crystal-lake, emerald-woods, coral-coast | mưa, quang | vòng gợn nước trên mặt hồ / suối |
| Latias | Đài Gió Thác Ngọc (sau Lugia) | crystal-lake, emerald-woods, coral-coast | bất kỳ | lông vũ đỏ, bóng lướt nhanh trên mặt đất |
| Latios | Đài Gió Thác Ngọc (sau Lugia) | rocky-highlands, emerald-woods, coral-coast | bất kỳ | lông vũ lam, tiếng gió rít |
| Mesprit | Đá Cảm Xúc, bờ Hồ Pha Lê (sau Mewtwo) | crystal-lake, emerald-woods, misty-swamp | bất kỳ | đốm sáng hồng trôi trên mặt nước |

Bỏ `starter-valley` và `farm` khỏi mọi danh sách lang thang. Cơ chế giữ nguyên (`LegendaryEncounterManager`: đánh một lúc rồi bỏ chạy, giữ máu). Thêm: dấu vết chỉ hiện trong vùng nó **đang** ở (đổi vùng mỗi 10 phút chơi), lại gần dấu vết thì trang Điều tra huyền thoại cập nhật "đang ở…".

---

## BƯỚC 2 — Ngôn ngữ thiết kế chung và các họ đền

### 2.1 Bốn lớp (bắt buộc cho mọi đền có trận đánh)

| Lớp | Quy tắc đo được |
|---|---|
| **1. Vùng bao ngoài** | Ranh giới liền, chỉ 1 lối vào (2 với Tầng 1), làm bằng địa hình của biome (vách, băng, hào dung nham, nước, rừng già). Dày ≥ 1 ô. Đứng ngoài nhìn vào thấy được lõi (ánh sáng / cột) để gợi tò mò. |
| **2. Sân nghi lễ** | Nền riêng của đền (không phải nền biome), có hoa văn rune đối xứng, trụ / tượng xếp theo trục. Tương phản độ sáng giữa nền và hoa văn ≤ 25% để không che telegraph đòn đánh. |
| **3. Lõi triệu hồi** | Luôn có vật: altar / pha lê / tượng / bia / vòng triệu hồi. Có trạng thái **ngủ** (sáng yếu, nhịp chậm) → **thức** (sáng mạnh, hạt bay) → **đã thanh tịnh** sau khi thắng (sáng dịu, hết hạt). Nếu lõi ở tâm arena thì nó **chìm / vỡ** khi trận bắt đầu (bỏ va chạm) và dựng lại khi kết thúc. |
| **4. Arena** | Bán kính: Tầng 1 = 13–14 ô, Tầng 2 = 10 ô (lăng Regi: phòng chữ nhật ≥ 17×13), Tầng 4 = 7–8 ô. Trong bán kính R−1 **không có vật cản**, trừ tối đa 4 vật "cover có chủ đích" ở ≥ 0,6R (ghi rõ trong từng đền). Mọi trang trí cao nằm **ngoài** R. Trong trận cổng niêm phong `^` đóng thành vòng chắn bán kính R+1. |

Kích thước tham chiếu: 1 ô = 48 px; màn hình 1280×720 ≈ 27×15 ô → arena Tầng 2 (Ø 21 ô) rộng hơn màn hình một chút, đủ để chạy vòng né đòn mà vẫn thấy boss.

### 2.2 Nghi lễ → trận đánh (khung chung, mỗi họ thay nội dung)

1. **Điều tra**: 3 manh mối (`legend-clues.json`, đã có cho 13 loài; viết thêm cho các loài còn lại). Đủ 3 manh mối → nhận **thánh vật** (key item, không bán được) và lộ điều kiện.
2. **Tới đền**: đứng trong bán kính không còn tự động gọi huyền thoại. Lõi đền chỉ phát sáng nhẹ; thiếu điều kiện thì bấm E vào lõi sẽ báo thiếu gì (dùng `legendMissing` sẵn có).
3. **Nghi lễ** (bấm E ở ô `P` trước lõi): 1–3 bước, mỗi họ khác nhau, dựng từ **8 loại bước dùng lại được**:
   `relic` (đặt thánh vật) · `plates` (tấm nén theo thứ tự — hệ `puzzles` có sẵn) · `sequence` (chạm các vật theo thứ tự được chỉ dẫn bằng ánh sáng) · `field` (Cắt / Đập đá / Đẩy đá / Flash có sẵn) · `still` (đứng yên N giây) · `waves` (trụ vững qua các đợt Pokémon hoang) · `quiz` (chọn đáp án, dùng hộp thoại `choose` có sẵn) · `condition` (giờ / thời tiết / độ thân thiết có sẵn).
4. **Chuyển cảnh** (2–3 s, khóa điều khiển): camera trượt từ người chơi tới điểm `+`, hiệu ứng môi trường tăng dần, cổng `^` đóng, nhạc huyền thoại, huyền thoại hiện ra **theo cách riêng của loài** (bay xuống, trồi lên, bước ra khỏi tường…), bật tên + thanh máu.
5. **Trận đánh**: các pha của `bossPhases.ts`; mỗi đền tối đa **2 loại hiểm họa môi trường**, mỗi lúc chỉ 1 loại đang hoạt động, telegraph ≥ 0,8 s.
6. **Kết thúc**: thắng → cửa sổ thu phục (như hiện tại); thua / rời đi (giữ E ở cổng 1,5 s) → cổng mở, trận reset như cơ chế cũ. Lõi chuyển "đã thanh tịnh"; đánh lại sau `respawn` chỉ rơi đồ.

### 2.3 Các họ đền

| Họ | Hình học chung | Nhận diện | Cách triệu hồi | Huyền thoại hiện ra |
|---|---|---|---|---|
| **Đài Thần Điểu** | sân tròn Ø 21, 3 tượng lông vũ ở cung bắc, 4 trụ chéo trên mép, lõi nguyên tố ở tâm | cùng bố cục, khác vật liệu (băng / bazan + đồng / đá cháy) | thánh vật lông vũ + điều kiện nguyên tố | sà xuống đậu lên lõi, lõi vỡ |
| **Đền Tầng 1 cấp sự kiện** | Ø 27–29, vùng bao ngoài lớn, 1 trục nghi lễ bắc–nam, lõi ở "hậu điện" phía bắc (ngoài arena) | mỗi đền một kiến trúc riêng | 2–3 bước, có thánh vật | xuất hiện cấp "thần linh": cả màn hình đổi màu |
| **Lăng Regi** | **phòng chữ nhật kín** (không tròn như mọi đền khác), tiền sảnh có bia chữ chấm và câu đố, Regi ngủ **trong tường bắc** | đá / băng / thép | câu đố khác nhau cho từng lăng | bước ra khỏi tường, tường để lại hốc |
| **Hồ Hộ Thần** | hồ + đảo có hang (lõi) ở một phía, sân đấu trên bờ phía kia | Azelf: đầm, hồng đỏ; Uxie: thánh địa, vàng | thử thách tinh thần (Azelf: trụ vững; Uxie: trả lời) | bay ra khỏi hang, lướt qua mặt hồ |
| **Đền mộng** | hồ / đảo tròn, ánh sáng là chính | Cresselia: bạc, trăng; Darkrai: đen, sương | đêm, đi đúng đường | hiện ra từ phản chiếu / từ bóng |
| **Đền mythic nhỏ** | Ø 15–17, kiến trúc nhẹ, thiên về thiên nhiên | mỗi con một biểu tượng | 1 bước, thường không đánh (quà) | cảnh ngắn |
| **Điểm kích hoạt lang thang** | ≤ 17×11, không arena | đá / bia nhỏ | chạm 1 lần | huyền thoại bỏ đi, bắt đầu lang thang |

### 2.4 Ký hiệu sơ đồ (1 ký tự = 1 ô; bắc ở trên)

```
,  nền biome bên ngoài (đi được)          .  nền sân nghi lễ (gạch cổ theo chủ đề)
:  rune khắc / hoa văn phát sáng (đi được) =  lối vào, bậc thềm, cầu thang (đi được)
x  ô hiểm họa trong trận (đi được, có telegraph)   w  nước nông đi được (mới)
#  ranh giới cứng: vách, tường, băng khối   T  cây / bụi rậm chặn đường
~  nước (chặn)                            L  dung nham (chặn)
O  trụ / cột lớn (chặn)                   o  đá rune / trụ thấp / bệ nhỏ (chặn)
S  tượng (chặn)                           *  pha lê / lư lửa / đèn (chặn nhỏ, phát sáng)
A  lõi triệu hồi / altar (chặn)           &  tấm nén / ô cơ quan (đi được)
^  cổng niêm phong (mở = đi được)         +  điểm huyền thoại xuất hiện
P  chỗ người chơi đứng làm lễ             B  tảng đá đẩy (Đẩy đá)
%  vách nứt (Đập đá)                      @  xoáy nước (chặn)
1 2  cặp bệ dịch chuyển (đi được)
```

---

## BƯỚC 3 — Từng đền

Mỗi mục: **thông tin** · **sơ đồ** · **ghi chú vị trí**. Toạ độ là tâm đền trên bản đồ (ô), có thể dịch ±3 ô khi ráp thật; test sẽ kiểm tra lối đi và khoảng trống arena.

---

### 3.1 Thung Lũng Khởi Nguyên

#### ① Hang Tâm Linh — Mewtwo
- **Tầng / loại**: 1 · main (niêm phong muộn). **Vị trí**: Đồi Đá Xám (rocky), tâm (136, 20) — thay chỗ Zapdos cũ ở (120, 32).
- **Vai trò**: điểm quay về Thung Lũng giữa game; trước khi mở chỉ là **một vết nứt đá tối** (không sáng, không tên) — đủ để người chơi nhớ chỗ, không lộ huyền thoại.
- **Bố cục 4 lớp**: (1) lòng chảo đá xám, vách `#` cao bao quanh, 1 khe nứt phía nam thành bậc `=`; (2) nền đá tím sẫm, vành 32 mũi pha lê tím `*` mọc từ chân vách; (3) **Pha Lê Tâm Linh** `A` ở tâm, có vòng rune `:` bán kính 3; (4) arena R12, 4 tảng đá lơ lửng `o` ở r=7 là cover có chủ đích (trong trận chúng trôi chậm theo vòng).
- **Hiệu ứng**: ngủ — pha lê nhấp nháy tím 4 s/lần, tiếng ù thấp; nghi lễ — màn hình gợn sóng nhẹ, đá vụn bay lên; trận — **cầu tâm linh** (vòng tròn telegraph rồi nổ), **lực kéo** (cả arena hút về tâm 1,5 s, có viền tím báo trước).
- **Mở khóa**: `boss:articuno`, `boss:zapdos`, `boss:moltres`. **Thánh vật**: 3 lông Thần Điểu (Lông Băng / Lông Sấm / Lông Lửa — rơi khi hạ lần đầu từng con). **Điều kiện**: không.
- **Nghi lễ**: `relic` (đặt 3 lông vào 3 khe quanh pha lê, mỗi khe sáng một màu) → pha lê nứt, áp lực đẩy người chơi lùi 2 ô (chuyển cảnh) → Mewtwo **hiện ra giữa mảnh vỡ pha lê** (pha lê vỡ = bỏ va chạm tâm).
- **Phần thưởng**: Mewtwo + Mewtwonite X + Mewtwonite Y (như hiện tại); đánh lại: Life Orb (hiếm) / Ultra Ball.

```
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTT#####TTTTTTTTTTTTT
TTTTTTTTTT####***####TTTTTTTTTT
TTTTTTTT##****...****##TTTTTTTT
TTTTTT##**...........**##TTTTTT
TTTTT##**.............**##TTTTT
TTTT##*.................*##TTTT
TTTT#*...................*#TTTT
TTT#**...................**#TTT
TTT#*.....................*#TTT
TT#*......o.........o......*#TT
TT#*.......................*#TT
TT#*..........:::..........*#TT
T##*.........:...:.........*##T
T#*.........:.....:.........*#T
T#*.........:..A..:.........*#T
T#*.........:.....:.........*#T
T##*.........:...:.........*##T
TT#*..........:::..........*#TT
TT#*...........P...........*#TT
TT#*......o.........o......*#TT
TTT#*.....................*#TTT
TTT#**...................**#TTT
TTTT#*...................*#TTTT
TTTT##*.................*##TTTT
TTTTT##**.............**##TTTTT
TTTTTT##**...........**##TTTTTT
TTTTTTTT##***..=..***##TTTTTTTT
TTTTTTTTTT#####==####TTTTTTTTTT
TTTTTTTTTTTTT##==#TTTTTTTTTTTTT
TTTTTTTTTTTTTTT==TTTTTTTTTTTTTT
```

`A` tâm (cũng là `+` sau khi vỡ). Lối vào duy nhất ở đáy (khe nứt). `o` ×4 = đá lơ lửng (cover).

#### ② Tàn Tích Lặng — Mew
- **Tầng / loại**: 4 · hidden. **Vị trí**: Tàn Tích Cổ, tâm (14, 34) — chỗ đền Moltres cũ.
- **Vai trò**: bí mật hậu Mewtwo trong chính vùng khởi đầu — người chơi đi ngang nhiều lần mà không biết.
- **Bố cục**: (1) tường tàn tích `#` khép kín, lối duy nhất là **vách nứt `%`** phía nam (Đập đá) — nhìn như một đoạn tường đổ bình thường; (2) nền gạch cổ phủ rêu, 4 **tượng Pokémon không ai nhận ra** `S` ở 4 góc chéo, quay vào tâm; (3) **Phiến Đá Tổ Tiên** `A` ở hậu điện phía bắc, khắc hình xoắn kép mờ hồng; (4) arena R7 (nhỏ — Mew nhanh, đánh kiểu đuổi bắt).
- **Hiệu ứng**: ngủ — thỉnh thoảng một đốm hồng lướt qua giữa các tượng rồi tắt; trận — Mew **dịch chuyển** giữa 4 tượng (vòng hồng xuất hiện 0,8 s trước ở tượng sắp tới).
- **Mở khóa**: `boss:mewtwo` + 3 manh mối. **Thánh vật**: không. **Điều kiện**: không mưa.
- **Nghi lễ**: `sequence` — đốm sáng nhảy giữa các tượng; chạm vào tượng nó đang đậu trong 3 s, 3 lần liền → nó cười khúc khích và hiện hình ở `+`. Sai → đốm sáng biến mất 1 phút.
- **Phần thưởng**: Mew + Expert Belt + 5 Ultra Ball (như hiện tại).

```
,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,###,,,,,,,,,
,,,,,,#########,,#,,,
,#,,,##.......##,,,,,
,,,,##....A....##,,,,
,,,##S.........S##,,,
,,##......P......##,,
,,#...............#,,
,,#...............#,,
,##...............##,
,##...............##,
,##...............##,
,,#...............#,,
,,#...............#,,
,,##.............##,,
,,,##S.........S###,,
,,,###.........##,,,,
,,,,,##.......##,,,,,
,,,,,,####%####,,,,,,
```

`%` vách nứt (lối vào). Trận đánh trong vòng R7 quanh (10, 11); phiến đá ở hậu điện không vướng.

#### ③ Đá Cảm Xúc — Mesprit (điểm kích hoạt lang thang)
- Bờ tây Hồ Pha Lê. Một phiến đá hồng `A` sát mép nước, 2 viên đá nhỏ `o`. Sau `boss:mewtwo`, chạm đá → Mesprit vụt khỏi mặt hồ, bắt đầu lang thang (crystal-lake, emerald-woods, misty-swamp). Không arena.

```
~~~~~~~~~~~~~
~~~~~~~~~~~~~
~~~~~~~~~~~~~
,,,,,,A,,,,,,
,,,,o,,,o,,,,
,,,,,,P,,,,,,
,,,,,,,,,,,,,
,,,,,,=,,,,,,
,,,,,,=,,,,,,
```

---

### 3.2 Rừng Ngọc Lục Bảo

#### ④ Tháp Chuông Cầu Vồng — Ho-Oh
- **Tầng / loại**: 1 · main. **Vị trí**: Lõi Rừng Ngọc, tâm (28, 22).
- **Vai trò**: cột mốc thấy từ sớm (mái tháp nhô trên ngọn cây); là nơi **3 Thú bắt đầu lang thang** (giữa game) và nơi **Ho-Oh giáng xuống** (cuối game).
- **Bố cục**: (1) rừng già `T` dày bao tròn, lối vào phía nam có **tượng Suicune** `S` đứng giữa chia đường thành 2 làn, cổng gỗ `^` rộng 7; (2) **3 tầng thềm** đồng tâm — vòng bậc `=` ở r≈9,5 và r≈5, mở về phía bắc; nền gạch vàng ấm; (3) **thân tháp** `#` 7×3 ở hậu điện bắc, **Chuông Lớn** `A` treo trước cửa tháp, mặt trời khảm `:` ở tâm; tượng Entei (tây) và Raikou (đông) `S`, mỗi tượng có lư lửa `*` hướng vào tâm; (4) arena R13 trên 3 tầng thềm (bậc đi được, chỉ là hoa văn chuyển tầng).
- **Hiệu ứng**: ngủ — chuông tĩnh, 3 lư tắt; sau khi đánh thức 3 Thú, 3 lư cháy ngọn nhỏ màu riêng (vàng / đỏ / lam); nghi lễ — tia nắng xiên qua tán cây, cầu vồng mờ vòng qua tháp; trận — **Lửa Thiêng** (cột lửa telegraph dạng vòng tròn rơi theo hàng), **Cầu Vồng** (dải an toàn 7 màu chạy ngang arena: đứng trong dải được hồi máu nhẹ — thưởng cho việc đọc trận).
- **Mở khóa**: Thú (giữa game): `boss:mega-venusaur` → chạm từng tượng. Ho-Oh: `boss:raikou`, `boss:entei`, `boss:suicune`. **Thánh vật**: Lông Cầu Vồng. **Điều kiện**: ban ngày (như hiện tại).
- **Nghi lễ**: `relic` (đặt Lông Cầu Vồng dưới chuông) → `sequence` (gõ chuông 3 lần đúng lúc ánh nắng chạm lần lượt 3 tượng Thú) → bóng chim khổng lồ lớn dần trên nền, Ho-Oh **đáp xuống tâm `+`**.
- **Phần thưởng**: Ho-Oh + Charcoal + Sun Stone (đề xuất); đánh lại: Sitrus Berry / Ultra Ball.

```
TTTTTTTTTTTTTTT#######TTTTTTTTTTTTTTT
TTTTTTTTTTTTTTT#######TTTTTTTTTTTTTTT
TTTTTTTTTTTTTT,#######,TTTTTTTTTTTTTT
TTTTTTTTTTT,,,,,,,A,,,,,,,TTTTTTTTTTT
TTTTTTTTT,,,,,,,,...,,,,,,,,TTTTTTTTT
TTTTTTTT,,,,,.....P.....,,,,,TTTTTTTT
TTTTTTT,,,,...............,,,,TTTTTTT
TTTTTT,,,,.................,,,,TTTTTT
TTTTT,,,,...................,,,,TTTTT
TTTT,O,,......=.......=......,,O,TTTT
TTTT,,,.....==.........==.....,,,TTTT
TTT,,,.....==...........==.....,,,TTT
TTT,,,....==.............==....,,,TTT
TTT,,.....=...............=.....,,TTT
TT,,,....=.....=.....=.....=....,,,TT
TT,,,....=....=.......=....=....,,,TT
TT,,,....=...=...:::...=...=....,,,TT
TT,,.....=...=..:::::..=...=.....,,TT
TTS,*...==...=..::+::..=...==...*,STT
TT,,.....=...=..:::::..=...=.....,,TT
TT,,,....=...=...:::...=...=....,,,TT
TT,,,....=....=.......=....=....,,,TT
TT,,,....=.....=.....=.....=....,,,TT
TTT,,.....=.....=====.....=.....,,TTT
TTT,,,....==.............==....,,,TTT
TTT,,,.....==...........==.....,,,TTT
TTTT,,,.....==.........==.....,,,TTTT
TTTT,,,,......=========......,,,,TTTT
TTTTT,,,,.........=.........,,,,TTTTT
TTTTTT,,,,.................,,,,TTTTTT
TTTTTTT,,,,...............,,,,TTTTTTT
TTTTTTTT,,,,,.....*.....,,,,,TTTTTTTT
TTTTTTTTT,,,,,,^^^^^^^,,,,,,TTTTTTTTT
TTTTTTTTTTT,,,,,=,S,=,,,,,TTTTTTTTTTT
TTTTTTTTTTTTTT,,=,,,=,,TTTTTTTTTTTTTT
TTTTTTTTTTTTTTTT=TTT=TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTT=TTT=TTTTTTTTTTTTTTTT
```

Chuông `A` ở (18, 3) trước thân tháp; `P` ngay dưới. 3 tượng Thú: tây, đông, và ở giữa cổng phía nam. Arena R13 quanh `+` không có vật cản.

#### ⑤ Hồ Trăng Lục Bảo — Cresselia
- **Tầng / loại**: 2 · regional. **Vị trí**: Suối Lục Bảo, tâm (76, 38).
- **Vai trò**: đền đêm của rừng; mở Darkrai (Đầm Lầy) — cặp mộng đẹp / ác mộng nối 2 vùng.
- **Bố cục**: (1) rừng `T` + sương thác bao kín, 1 lối mòn phía nam; (2) **vành đá trăng** `:` (đi được) ôm quanh hồ, 3 **phiến trăng khuyết** `&` ở cung bắc (khuyết → bán nguyệt → tròn); 2 trụ đá `o` đông / tây; (3) **Đài Trăng Khuyết** `A` trên đảo nhỏ giữa hồ; (4) **arena = mặt hồ**: khi nghi lễ xong, mặt hồ **đông ánh trăng** thành mặt kính đi được (đổi địa hình nước → "kính trăng" trong trận, trả lại nước khi xong) → arena tròn R9 trên mặt hồ.
- **Hiệu ứng**: ngủ — ảnh trăng lung linh trên nước (lớp phản chiếu bạc); trận — **tia trăng** (vệt sáng quét chậm qua mặt kính), **vùng mộng đẹp** (vòng bạc hồi máu cho đội trong 3 s — Cresselia cũng hồi nếu đứng trong đó → người chơi phải đẩy nó ra).
- **Mở khóa**: `boss:mew`. **Thánh vật**: Lông Trăng. **Điều kiện**: ban đêm, trời quang.
- **Nghi lễ**: `plates` — bước lên 3 phiến trăng theo thứ tự tuần trăng (thứ tự được gợi ý trong manh mối thứ 3) → ảnh trăng giữa hồ sáng tròn, Cresselia **hiện ra từ phản chiếu** rồi bay lên.
- **Phần thưởng**: Cresselia + Moon Stone + Lông Trăng (giữ — cần cho Darkrai).

```
TTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTT,,,,,,,,,TTTTTTTTT
TTTTTTT,,,,::&::,,,,TTTTTTT
TTTTTT,,:::::::::::,,TTTTTT
TTTTT,,::::~~~~~::::,,TTTTT
TTTT,,::~~~~~~~~~~~::,,TTTT
TTT,,::~~~~~~~~~~~~~::,,TTT
TT,,&:~~~~~~~~~~~~~~~:&,,TT
TT,::~~~~~~~~~~~~~~~~~::,TT
T,,::~~~~~~~~~~~~~~~~~::,,T
T,,::~~~~~~~~~~~~~~~~~::,,T
T,::~~~~~~~~~~~~~~~~~~~::,T
T,::~~~~~~~~...~~~~~~~~::,T
To::~~~~~~~~.A.~~~~~~~~::oT
T,::~~~~~~~~...~~~~~~~~::,T
T,::~~~~~~~~~~~~~~~~~~~::,T
T,,::~~~~~~~~~~~~~~~~~::,,T
T,,::~~~~~~~~~~~~~~~~~::,,T
TT,::~~~~~~~~~~~~~~~~~::,TT
TT,,::~~~~~~~~~~~~~~~::,,TT
TTT,,::~~~~~~~~~~~~~::,,TTT
TTTT,,::~~~~~~~~~~~::,,TTTT
TTTTT,,::::~~~~~::::,,TTTTT
TTTTTT,,:::::P:::::,,TTTTTT
TTTTTTT,,,,::=::,,,,TTTTTTT
TTTTTTTTT,,,,=,,,,TTTTTTTTT
TTTTTTTTTTTTT=TTTTTTTTTTTTT
```

#### ⑥ Vòng Cây Cổ — Celebi
- **Tầng / loại**: 4 · hidden (quà, không đánh). **Vị trí**: Đường Mòn Ngọc, tâm (22, 68).
- **Bố cục**: (1) vòng cây cổ thụ `T` rất dày; lối mòn hẹp phía nam; (2) bãi cỏ có vòng hoa `:` r=5; 3 **gốc cây cụt** `o`; (3) **Miếu Gỗ** `A` nhỏ ở tâm, mái phủ rêu, trước miếu có chén nước sương; (4) không cần arena.
- **Hiệu ứng**: bình minh — sương xanh lá, đom đóm ban ngày; khi gặp — **thời gian trôi**: 3 gốc cây cụt hóa cây non rồi trở lại gốc (đổi sprite 2 lần trong 3 s), lá bay ngược chiều gió.
- **Mở khóa**: `boss:mega-venusaur`. **Điều kiện**: bình minh (như hiện tại). **Nghi lễ**: `relic` — dâng **chén sương** (nhặt ở 3 manh mối) lên miếu.
- **Phần thưởng**: Celebi (quà, chọn mời đồng hành hoặc để tự do — như hiện tại).

```
TTTTTTTTTTTTTTTTTTTTT
TTTTTTTT,,,,,TTTTTTTT
TTTTTT,,,,,,,,,TTTTTT
TTTTT,,,,,,,,,,,TTTTT
TTTT,,,,:::::,,,,TTTT
TTT,,,,::,,,::,,,,TTT
TTT,,,:,,,,,,,:,,,TTT
TT,,,::o,,,,,o::,,,TT
TT,,,:,,,,,,,,,:,,,TT
TT,,,:,,,,A,,,,:,,,TT
TT,,,:,,,,,,,,,:,,,TT
TT,,,::,,,P,,,::,,,TT
TTT,,,:,,,o,,,:,,,TTT
TTT,,,,::,,,::,,,,TTT
TTTT,,,,:::::,,,,TTTT
TTTTT,,,,,,,,,,,TTTTT
TTTTTT,,,,,,,,,TTTTTT
TTTTTTTT,,=,,TTTTTTTT
TTTTTTTTTT=TTTTTTTTTT
```

#### ⑦ Đài Gió Thác Ngọc — Latias / Latios (điểm kích hoạt)
- Đỉnh thác, tâm (84, 6). Bệ đá trắng nửa tròn sát mép vực (`#`, dưới là thác `~`); 2 **bia cánh** `S` (đỏ / lam); **Ngọc Tâm** `A` nhỏ ở giữa; lan can `o`. Sau `boss:lugia`, chạm Ngọc Tâm → 2 bóng đỏ / lam vụt qua màn hình → cả hai bắt đầu lang thang. Sau đó, đứng ở đây cho biết vùng chúng đang ở.

```
~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~
#################
,,,..S.....S..,,,
,,,.....A.....,,,
,,,o.........o,,,
,,,,....P....,,,,
,,,,,.......,,,,,
,,,,,o.....o,,,,,
,,,,,,,,=,,,,,,,,
,,,,,,,,=,,,,,,,,
```

---

### 3.3 Đầm Lầy Sương Mù

#### ⑧ Cổng Thế Giới Đảo Ngược — Giratina
- **Tầng / loại**: 1 · endgame. **Vị trí**: Hốc Cây Thầy Mo, tâm (92, 22) (gần chỗ cũ (100, 12)).
- **Vai trò**: trận cuối trước Arceus, nằm ở vùng giữa game → người chơi quay lại đầm với cảm giác "nơi quen đã khác".
- **Bố cục**: (1) cây chết `T` rải không đều, **các trụ gãy `O` nghiêng ra ngoài**, vòng bao cố ý méo (không tròn đều) — đền duy nhất không đối xứng; (2) nền đá đen rạn, **6 hố bùn đen `x`** rải lệch; tượng `S` đặt **ngược đầu**; đá vụn `o` chen giữa trụ; (3) **Gương Vỡ** `A` ở hậu điện bắc — khung đá nứt, mặt gương phản chiếu khu đền nhưng **lộn ngược**; (4) arena R13.
- **Hiệu ứng**: bóng của mọi vật chỉ **ngược** hướng trăng; mép màn hình méo nhẹ (shader gợn); trận — **Bóng trồi** (hố bùn `x` sẫm lại 1 s rồi Giratina lao lên từ đó), **Vùng méo** (vùng tím làm chậm 40% và kéo về tâm vùng — không đảo phím để tránh khó đọc).
- **Mở khóa**: `boss:dialga`, `boss:palkia`. **Thánh vật**: Ngọc Bạch Kim. **Điều kiện**: ban đêm.
- **Nghi lễ**: `relic` → `still` (đứng yên trước gương 5 s trong khi ảnh phản chiếu của người chơi **cử động khác**) → gương vỡ, bóng của chính người chơi tách ra và lớn thành Giratina ở `+`.
- **Phần thưởng**: Giratina + Reaper Cloth + Dusk Stone.

```
,,,,,,,,,,,,,,,,,,,T,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,T,,,,,,,,,,,,
,,,,,,,,,,,,,,T,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,T,,,,,,O.A..,,O,,,,,,,,,,,,,
,,,,,,,,,S,,,...........,,,S,,,,,,,,,
,,,,T,,,,O,.......P.......,,,,,,,,,,,
,,,,,,,,,.................o.,,,,T,,,,
,,,,,,,,.....................O,,,,,,,
,,,,,,,.......................,,,,,,,
,,,,,,,.......................,,,,,,,
,,,T,,.........................,,,,,,
,,,,,Oo................xx......,,,T,,
,,,,,...........................,,,,,
,,,,,...........................O,,,,
,,,,,.......xx..................,,,,,
,T,,.............................,,,,
,,,,.............................,T,,
,,,,..............+..............,T,,
,,,O.............................,,,,
,,,,.............................,,,,
T,,,,....xx.....................O,,,,
,,,,,....................xx.....,,,,,
,,,,,...........................,,,T,
,,,,,,.........................o,,,,,
,,,,TO........xx...............,,,,,,
,,,,,,,.......................,,,,,,,
,,,,,,,.............xx........O,,,,,,
,,,,,,,,o....................,,,T,,,,
,,,,,,,,,...................,,,,,,,,,
,,,,,,T,,,O...............,,T,,,,,,,,
,,,,,,,,,,,,,...........O,,,,,,,,,,,,
,,,,,,,,,,,,,,,,..=..,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,==,,,,,,,,,,,,,,,,,
,,,,,,,,,T,,,,,T,,==,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,==,,,,,T,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,==,,,,,,,,,,,,,,,,,
```

#### ⑨ Hồ Dũng Khí — Azelf
- **Tầng / loại**: 2 · regional (họ Hồ Hộ Thần). **Vị trí**: Lòng Đầm Độc, tâm (40, 22).
- **Bố cục**: (1) lau sậy `T` bao sân đấu, khe mở về phía hồ và phía nam; (2) hồ tròn phía bắc, 3 **cột ngọc đỏ** `o` quanh hồ; sân bùn nện phía nam; (3) **Hang trên đảo** `A` giữa hồ (hang nhỏ, cửa phát sáng đỏ hồng); (4) arena R8 trên sân phía nam, **vòng thử thách** `:` r=3 ở giữa.
- **Hiệu ứng**: gió mạnh thổi ngang hồ (lau rạp theo nhịp); trận — **cầu lửa ý chí** bay vòng.
- **Mở khóa**: `boss:mewtwo`. **Điều kiện**: không. **Nghi lễ**: `waves` — đứng trong vòng thử thách, trụ vững 3 đợt Pokémon đầm (không ra khỏi vòng) → Azelf bay ra khỏi hang, lướt qua mặt hồ, đáp xuống `P`.
- **Phần thưởng**: Azelf + Muscle Band.

```
,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,~~~~~~~,,,,,,,,,,
,,,,,,,,,~~~~~~~~~,,,,,,,,,
,,,,,,,,~~~~~~~~~~~,,,,,,,,
,,,,,,,~~~~~~~~~~~~~,,,,,,,
,,,,,,,~~~~~~~~~~~~~,,,,,,,
,,,,,,,~~~~~.A.~~~~~,,,,,,,
,,,,,,,~~~~~...~~~~~,,,,,,,
,,,,,,,~~~~~...~~~~~,,,,,,,
,,,,,,,~~~T~~~~~T~~~,,,,,,,
,,,,,,o~TTT~~~~~TTT~o,,,,,,
,,,,,,,TT~.......~TT,,,,,,,
,,,,,,T,...........,T,,,,,,
,,,,,T,.............,T,,,,,
,,,,TT...............TT,,,,
,,,,T,...............,T,,,,
,,,TT.......:::.......TT,,,
,,,T,......:...:......,T,,,
,,,T,.....:.....:.....,T,,,
,,,T,.....:..P..:.....,T,,,
,,,T,.....:.....:.....,T,,,
,,,T,......:...:......,T,,,
,,,TT.......:::.......TT,,,
,,,,T,...............,T,,,,
,,,,TT...............TT,,,,
,,,,,T,.............,T,,,,,
,,,,,,T,...........,T,,,,,,
,,,,,,,TT,.......,TT,,,,,,,
,,,,,,,,TTT,,=,,TTT,,,,,,,,
```

#### ⑩ Lăng Thép Chìm — Registeel
- **Tầng / loại**: 2 · regional (họ Lăng Regi). **Vị trí**: Bìa Đầm Lầy, tâm (60, 78).
- **Bố cục**: (1) khối lăng chữ nhật **tấm thép tán đinh** lún nửa trong bùn; tiền sảnh ngoài trời phía nam có **bia chữ chấm** `S`; (2) phòng trong 19×13 nền thép xám, **3 đèn cổ** `*` (tắt), 4 **tấm nén** `&`, đường dẫn năng lượng `:` nối các đèn tới altar; (3) **Bia lớn** `A` sát tường bắc, Registeel ngủ **trong tường** sau bia (`+`); (4) arena = cả phòng.
- **Hiệu ứng**: ánh lam lạnh, tiếng tích tắc cơ khí; trận — **dòng điện trên đường dẫn** (đường `:` sáng lên rồi giật), **vách thép** (một hàng ô trồi lên làm tường tạm 4 s).
- **Mở khóa**: `boss:mega-venusaur`. **Nghi lễ** (đọc bia → biết thứ tự): `field: flash` thắp 3 đèn → `plates` 4 tấm nén theo thứ tự chữ chấm → cửa `^` mở; vào trong bấm E vào bia → tường nứt, Registeel bước ra.
- **Phần thưởng**: Registeel + Metal Coat + **Lõi Regi Thép** (dùng cho Regigigas).

```
#######################
###########+###########
##.........A.........##
##...................##
##..*......P......*..##
##...................##
##....::.&...&.::....##
##.....::.....::.....##
##......::...:.......##
##...................##
##...................##
##.....&...:...&.....##
##.........:.........##
##.........:.........##
##.........:.........##
###########:###########
##########^^^##########
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
```

#### ⑪ Đảo Ác Mộng — Darkrai
- **Tầng / loại**: 4 · hidden. **Vị trí**: Lòng Đầm Độc, tâm (14, 40).
- **Bố cục**: (1) nước đen `~` bao quanh đảo; **đường đá ngoằn ngoèo** `=` từ bờ nam, có **2 nhánh giả cụt** — đi nhầm nhánh: màn hình tối dần và bị đưa về bờ; (2) nền đá đen, cây chết `T` lưa thưa trên mép; (3) **Giường Đá Đen** `A` ở hậu điện bắc; (4) arena R7, **tầm nhìn bị giới hạn** (lớp tối, chỉ sáng bán kính 6 ô quanh người chơi — dùng lại lớp tối của hang Flash).
- **Hiệu ứng**: sương đen trôi sát nền; trận — **Hố Đen** (vòng đen lan dần, đứng trong bị ngủ 1,5 s), Darkrai **biến mất khỏi tầm sáng** và xuất hiện sau lưng (âm thanh báo trước).
- **Mở khóa**: `boss:cresselia`. **Thánh vật**: Lông Trăng (từ Cresselia) — **cầm theo thì thấy đúng đường** (nhánh giả mờ đi). **Điều kiện**: ban đêm.
- **Nghi lễ**: đi đúng đường tới `P` → Lông Trăng tự bay lên, sáng rồi tắt → Darkrai hiện từ bóng của người chơi.
- **Phần thưởng**: Darkrai + Black Glasses.

```
~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~T,,,,,T~~~~~~~~~
~~~~~~~,,,..A..,,,~~~~~~~
~~~~~~,,.........,,~~~~~~
~~~~~,,.....P.....,,~~~~~
~~~~~,.............,~~~~~
~~~~T,.............,T~~~~
~~~~,...............,~~~~
~~~~,...............,~~~~
~~~~,.......+.......,~~~~
~~~~,...............,~~~~
~~~~,...............,~~~~
~~~~,,.............,T~~~~
~~~~~,.............,~~~~~
~~~~~,,...........,,~~~~~
~~~~~~,,.........,,~~~~~~
~~~~~~~,,,.....,,,~~~~~~~
~~~~~~~~~,,,=,,,~~~~~~~~~
~~~~~~~~~~~=~==~~~~~~~~~~
~~~~~~~~~===~~~=~~~~~~~~~
~~~~~~~~=~~~=~~~~~~~~~~~~
~~~~~~~~~~~~=~~~~~~~~~~~~
```

---

### 3.4 Bờ Biển San Hô

#### ⑫ Đảo Xoáy Bạc — Lugia
- **Tầng / loại**: 1 · main. **Vị trí**: Rạn San Hô phía bắc, tâm (88, 20) (đảo riêng).
- **Bố cục**: (1) biển `~` bao quanh đảo, các xoáy nước nhỏ lượn quanh; **đường đê đá** `=` từ phía nam nối đảo với bờ; (2) bờ cát `,` rồi **quảng trường đá trắng** `.`, **hàng cột đôi** `O` (14 cột, mặt ngoài) nhìn ra biển, 3 **tượng Thần Điểu** `S` ở ngoài hàng cột (tây bắc / bắc / đông bắc — họ Thần Điểu chào Lugia); 2 vòng sóng khắc `:` (r=4,5 và 9); (3) **Đài Gọi Biển** `A` ở mép bắc quảng trường (vỏ ốc đá khổng lồ, giữa có cây sáo bạc); (4) arena R13 quanh tâm `+`.
- **Hiệu ứng**: ngủ — biển lặng như gương; nghi lễ — mây đen kéo về, mưa nặng hạt (chuyển thời tiết cục bộ), sóng bạc đập vào hàng cột; trận — **Aeroblast** (vệt dài telegraph 1 s), **sóng tràn** (từ mép quảng trường dâng vào 3 ô, đẩy lùi).
- **Mở khóa**: 3 Thần Điểu (như hiện tại). **Thánh vật**: Lông Bạc + Sáo Thủy Triều (quest Ngư dân). **Điều kiện**: mưa / mưa to / giông (như hiện tại).
- **Nghi lễ**: `relic` (đặt Lông Bạc vào vỏ ốc) → `sequence` (thổi sáo khi lần lượt 3 tượng Thần Điểu phát sáng — chỉ sáng nếu đã hạ con đó) → biển nổi xoáy lớn phía bắc đảo, Lugia trồi lên khỏi sóng rồi lượn xuống tâm.
- **Phần thưởng**: Lugia + Mystic Water + Sharp Beak.

```
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~,,,,S,,,,~~~~~~~~~~~~~~
~~~~~~~~~~~,,,,,O,,,,,,,,,~~~~~~~~~~~
~~~~~~~~~,,,,,,,,,,,,,,O,,,,~~~~~~~~~
~~~~~~~~,,,O,,....A....,,,,,,~~~~~~~~
~~~~~~~,,,,,.............,,,,,~~~~~~~
~~~~~~,,,,........P........,O,,~~~~~~
~~~~~,,,,...................,,,,~~~~~
~~~~,SO,.......:::::::.......,,S,~~~~
~~~~,,,......:::.....:::......,,,~~~~
~~~,,,,.....::.........::.....,,,,~~~
~~~,,,.....:.............:.....O,,~~~
~~~,,,....::......:......::....,,,~~~
~~,,,.....:....:::::::....:.....,,,~~
~~,,O....::...::.....::...::....,,,~~
~~,,,....:....:.......:....:....,,,~~
~~,,,....:....:.......:....:....,,,~~
~~,,,....:...::...+...::...:....,O,~~
~~,,,....:....:.......:....:....,,,~~
~~,,,....:....:.......:....:....,,,~~
~~,,O....::...::.....::...::....,,,~~
~~,,,.....:....:::::::....:.....,,,~~
~~~,,,....::......:......::....,,,~~~
~~~,,,.....:.............:.....O,,~~~
~~~,,,,.....::.........::.....,,,,~~~
~~~~,,,......:::.....:::......,,,~~~~
~~~~,,O,.......:::::::.......,,,,~~~~
~~~~~,,,,...................,,,,~~~~~
~~~~~~,,,,.................,O,,~~~~~~
~~~~~~~,,,,,.............,,,,,~~~~~~~
~~~~~~~~,,,O,,.........,,,,,,~~~~~~~~
~~~~~~~~~,,,,,,,,===,,,O,,,,~~~~~~~~~
~~~~~~~~~~~,,,,,,===,,,,,,~~~~~~~~~~~
~~~~~~~~~~~~~~,,,===,,,~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~===~~~~~~~~~~~~~~~~~
```

#### ⑬ Xoáy Nước Sâu → Vực Nguyên Hải — Kyogre
- **Tầng / loại**: 1 · main (bản đồ riêng). **Cổng**: Rạn San Hô, tâm (88, 62). Trước khi mở: chỉ là vùng nước sẫm, không có cột. Sau `boss:lugia` + `boss:ho-oh`: 8 **cột đá chìm** `O` nhô lên khỏi mặt nước thành vòng, xoáy `@` ở giữa, bãi đá nhỏ phía nam có ô `P`.
- **Vào**: đứng ở `P`, mưa, cầm **Ngọc Lam** → bấm E → nhảy xuống xoáy (chuyển màn hình xanh thẫm) → bản đồ riêng *Vực Nguyên Hải* 41×37.
- **Bố cục bản đồ riêng**: (1) vách đá đáy biển `#` khép kín; nước sâu `~`; (2) **vành nước nông** `w` đi được, 11 cột `O` đền ngập trên mép; (3) **Đài Nguyên Hải** `A` ở hậu điện bắc, quả Ngọc Lam đặt vào thì phát ánh xanh khắp vực; (4) arena R14: lõi khô `.` R≈10 + **vành thủy triều `x`** (r 11–14).
- **Hiệu ứng**: ánh sáng xanh thẫm, tia nắng mờ rọi từ trên, bong bóng; trận — **thủy triều dâng**: mỗi 30 s vành `x` ngập dần (thành nước nông làm chậm 50%, rồi nước sâu chặn) → arena **co lại** theo pha, rút về khi Kyogre đổi pha; **Origin Pulse** (các vòng sóng lan từ Kyogre).
- **Phần thưởng**: Kyogre + Prism Scale + Water Stone; **mở Manaphy**.

```
~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~O~~~~~~~~~~
~~~~~~O~~~~~~~O~~~~~~
~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~@@@~~~~~~~~~
~~~~~O~~~@@@~~~O~~~~~
~~~~~~~~~@@@~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~
~~~~~~O~~~~~~~O~~~~~~
~~~~~~~~~,=,~~~~~~~~~
~~~~~~~~,,P,,~~~~~~~~
~~~~~~~~,,,,,~~~~~~~~
~~~~~~~~,,,,,~~~~~~~~
~~~~~~~~~,,,~~~~~~~~~
```

```
#########################################
#########################################
#########################################
################~~~~O~~~~################
#############~~~~~wwAww~~~~~#############
###########~O~wwwwwwxwwwwww~O~###########
##########~~~wwxxxxxPxxxxxww~~~##########
#########~~wwxxxxxxxxxxxxxxxww~~#########
########~~wwxxxxwwwwwwwwwxxxxww~~########
#######~~wwxxxwww.......wwwxxxww~~#######
######~~wwxxxww...........wwxxxww~~######
######O~wxxxw...............wxxxw~O######
#####~~wxxxw.................wxxxw~~#####
#####~wwxxww.................wwxxww~#####
#####~wxxxw...................wxxxw~#####
####~~wxxww...................wwxxw~~####
####~~wxxw.....................wxxw~~####
####~wwxxw.....................wxxww~####
####~wwxxw.....................wxxww~####
####Owxxxw..........+..........wxxxwO####
####~wwxxw.....................wxxww~####
####~wwxxw.....................wxxww~####
####~~wxxw.....................wxxw~~####
####~~wxxww...................wwxxw~~####
#####~wxxxw...................wxxxw~#####
#####~wwxxww.................wwxxww~#####
#####~~wxxxw.................wxxxw~~#####
######O~wxxxw...............wxxxw~O######
######~~wwxxxww...........wwxxxww~~######
#######~~wwxxxwww.......wwwxxxww~~#######
########~~wwxxxxwwwwwwwwwxxxxww~~########
#########~~wwxxxxxxxwxxxxxxxww~~#########
##########~~~wwxxxxxwxxxxxww~~~##########
###########~O~wwwwwwwwwwwww~O~###########
#############~~~~~ww=ww~~~~~#############
################~~~^^^~~~################
####################=####################
```

#### ⑭ Đỉnh Sấm Vách Hải Âu — Zapdos
- **Tầng / loại**: 2 · regional (họ Thần Điểu). **Vị trí**: Vách Đá Hải Âu, tâm (16, 78) (chỗ đền Rayquaza cũ).
- **Bố cục**: (1) mép vực phía bắc / tây là biển `~`, vòng đá bazan `#`; lối vào phía nam; (2) **nền bazan sẫm** có 8 **đường rune sét** `:` tỏa ra từ tâm; 4 **cột dẫn sét** `O` (chóp đồng) ở 4 góc chéo; 4 **tấm mạch** `&` ở 4 hướng chính (r=7); 3 tượng lông vũ `S` (họ Thần Điểu); (3) **Cột Thu Lôi** `A` ở tâm — thanh sắt vàng trên bệ bậc; (4) arena R10.
- **Hiệu ứng**: không khí tích điện (tia lửa nhỏ nhảy giữa 4 cột), tóc / lông Pokémon dựng; trận — **sét đánh nền** (vòng telegraph 0,9 s), **4 cột dẫn** hút sét: đứng sát cột khi nó sáng là bị giật → cột vừa là mốc định hướng vừa là nguy hiểm.
- **Mở khóa**: `boss:mega-venusaur`. **Thánh vật**: Lõi Sấm (hoặc không cần nếu đang **giông**). **Nghi lễ**: `plates` — giẫm 4 tấm mạch theo chiều kim đồng hồ khi sét đánh vào cột (mỗi lần sét, 1 tấm sáng) → mạch kín, sét đánh thẳng vào Cột Thu Lôi, Zapdos **sà xuống đậu lên cột**, cột gãy (bỏ va chạm tâm).
- **Phần thưởng**: Zapdos + Magnet + 3 Super Potion (như hiện tại) + Lông Sấm (cho Mewtwo).

```
~~~~~~~~~#########~~~~~~~~~
~~~~~~~####,,S,,####~~~~~~~
~~,,,,##,....:....,##,,,,,,
~~,,,#S......:......S#,,,,,
~~,,#O.......:.......O#,,,,
~~,##.:......&......:.##,,,
~~##...:.....:.....:...##,,
~~#,....:....:....:....,#,,
~##......:...:...:......##,
~##.......:..:..:.......##,
~#,........:.:.:........,#,
~#,.........:.:.........,#,
~#,.::&:::::.A.:::::&::.,#,
~#,.........:.:.........,#,
~#,........:.P.:........,#,
~##.......:..:..:.......##,
~##......:...:...:......##,
~~#,....:....:....:....,#,,
~~##...:.....:.....:...##,,
~~,##.:......&......:.##,,,
~~,,#O.......:.......O#,,,,
~~,,,##......:......##,,,,,
~~,,,,##,...^^^...,##,,,,,,
~~,,,,,####,,=,,####,,,,,,,
~~,,,,,,,###,=,###,,,,,,,,,
```

#### ⑮ Lăng Sa Thạch — Regirock
- **Tầng / loại**: 2 · regional (họ Lăng Regi). **Vị trí**: Bãi Cát Vàng (đụn cát), tâm (30, 26) — chuyển từ núi lửa về **đá sa thạch ven biển** cho đúng chất "hang đá cổ, nền cát đá".
- **Bố cục**: (1) khối lăng sa thạch giữa đụn cát; tiền sảnh cát phía nam có **bia chữ chấm** `S`, **2 tảng đá** `B` và **2 hốc** `&`; (2) phòng 19×13 nền cát đá, **6 cự thạch** `O` dọc hai tường; (3) **Bia lớn** `A`, Regirock ngủ trong tường bắc (`+`); (4) arena = cả phòng.
- **Hiệu ứng**: cát chảy rỉ từ trần; trận — **đá rơi** (bóng tròn trên nền rồi rơi), **địa chấn** (sóng đất chạy theo hàng ngang).
- **Mở khóa**: `boss:mega-venusaur`. **Nghi lễ**: `field: strength` — đẩy 2 tảng đá vào 2 hốc (bia ghi "hai hòn đá về chỗ ngủ") → cửa `^` mở → vào trong bấm E vào bia → Regirock bước ra khỏi tường.
- **Phần thưởng**: Regirock + Hard Stone + **Lõi Regi Đá**.

```
#######################
###########+###########
##.........A.........##
##.O...............O.##
##.........P.........##
##...................##
##...................##
##...................##
##.O...............O.##
##...................##
##...................##
##...................##
##...................##
##.O...............O.##
##...................##
#######################
##########^^^##########
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,&,,,,,&,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,B,,,,,=,,,,,B,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
```

#### ⑯ Rạn Ấu Hải — Manaphy / Phione
- **Tầng / loại**: 4 · hidden (trứng, không đánh). **Vị trí**: Rạn San Hô phía nam, tâm (96, 84).
- **Bố cục**: bãi cát vòng quanh một **đầm nước nông** `w` (đi được), 7 cụm **san hô sáng** `*`; **Vỏ Sò Lớn** `A` ở tâm đầm; lối vào phía nam.
- **Hiệu ứng**: san hô sáng nhịp theo sóng; cá nhỏ (hạt) bơi vòng; khi có trứng: vỏ sò mở, ánh lam.
- **Mở khóa**: `boss:kyogre` → nhận **Trứng Manaphy** ở vỏ sò (cơ chế trứng đã có). **Phione**: mang Manaphy đã nở trong đội về vỏ sò → nhận Trứng Phione (`boss:manaphy` như hiện tại).

```
~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~,,,,,~~~~~~~~
~~~~~~,,,,w,,,,~~~~~~
~~~~~,,w*www*w,,~~~~~
~~~~,,wwwwwwwww,,~~~~
~~~,,wwwwwwwwwww,,~~~
~~~,wwwwwwwwwwwww,~~~
~~,,*wwwwwwwwwww*,,~~
~~,,wwwwwwwwwwwww,,~~
~~,wwwwwwwAwwwwwww,~~
~~,,wwwwwwwwwwwww,,~~
~~,,*wwwwwPwwwww*,,~~
~~~,wwwwwwwwwwwww,~~~
~~~,,wwwwwwwwwww,,~~~
~~~~,,wwwwwwwww,,~~~~
~~~~~,,wwwww*w,,~~~~~
~~~~~~,,,,w,,,,~~~~~~
~~~~~~~~,,=,,~~~~~~~~
~~~~~~~~~~=~~~~~~~~~~
```

---

### 3.5 Núi Tuyết Vĩnh Hằng

#### ⑰ Trụ Trời Đỉnh Bão — Rayquaza
- **Tầng / loại**: 1 · main. **Vị trí**: Đỉnh Bão Tuyết, tâm (88, 22) — chỗ cao nhất của game.
- **Bố cục**: (1) vách núi `#` mọi phía, chỉ có **cầu thang xoắn** `=` khoét vào vách phía nam; quanh mép là vực mây (lớp mây trắng trôi phủ lên `#`); (2) **sân mây** đá xám xanh, **7 cột đá cao** `O` (vòng r=15, khuyết ở cầu thang) khắc rune xanh lục; 3 **trụ gió** `o` ở mép bắc; (3) **Bệ Thiên Long** `A` ở tâm — tượng rồng quấn quanh bệ, vòng rune `:` r=7 với 3 nan; (4) arena R13, bệ **chìm xuống** khi trận bắt đầu.
- **Hiệu ứng**: gió tuyết thổi theo chiều đổi mỗi 20 s; nghi lễ — mây xé toạc, tia sáng xanh từ trời; trận — **cuồng phong** (mũi tên trên nền báo hướng, đẩy mọi thứ 3 ô), **Dragon Ascent** (Rayquaza bay vút khỏi màn hình rồi bổ xuống theo đường thẳng có telegraph).
- **Mở khóa**: `boss:kyogre`, `boss:groudon`. **Thánh vật**: Ngọc Lục Thiên. **Điều kiện**: không.
- **Nghi lễ**: `relic` → `sequence` (bấm 3 trụ gió theo đúng thứ tự gió đổi chiều — tuyết bay chỉ hướng) → rồng xoắn từ trên đỉnh màn hình xuống, cuộn quanh sân 1 vòng rồi dừng ở tâm.
- **Phần thưởng**: Rayquaza + Dragon Scale + mở Thánh Địa (như hiện tại).

```
#####################################
################,,o,,################
############,,,,,,O,,,,,,############
##########,,,,,,,...,,,,,,,##########
#########,,,,...........,,,,#########
########,,,...............,,,########
#######O,,.................,,O#######
######,,,...................,,,######
#####,,,.....................,,,#####
####,,,.......................,,,####
####,,..........:::::..........,,####
###o,,........::.....::........,,o###
###,,........:.:.......:........,,###
###,,.......:..::.......:.......,,###
###,,.......:...:.......:.......,,###
##,,,......:.....:.......:......,,,##
##,,.......:.....:.......:.......,,##
##,O.......:......A.::::::.......O,##
##,,.......:.....:.......:.......,,##
##,,,......:.....:.......:......,,,##
###,,.......:...:.P.....:.......,,###
###,,.......:...:.......:.......,,###
###,,........:.:.......:........,,###
###,,,........::.....::........,,,###
####,,..........:::::..........,,####
####,,,.......................,,,####
#####,,,.....................,,,#####
######,,,...................,,,######
#######O,,.................,,O#######
########,,,...............,,,########
#########,,,,...........,,,,#########
##########,,,,,,,==.,,,,,,,##########
############,,,,,,==,,,,,############
################,==,,################
##################==#################
#################==##################
#####################################
```

#### ⑱ Băng Đài Hồ Băng Lam — Articuno
- **Tầng / loại**: 2 · regional (họ Thần Điểu). **Vị trí**: Hồ Băng Lam, tâm (22, 40).
- **Bố cục**: (1) hồ băng `~` phía bắc, **vòng gai băng** `#` bao sân, lối vào phía nam; (2) **nền băng xanh** (trơn nhẹ — dùng địa hình Ice có sẵn), 2 vòng rune băng `:` (r=4, r=8), 4 **cột pha lê** `O` ở 4 góc chéo, 3 tượng lông vũ `S` ở cung bắc; (3) **Tinh Thể Băng Ngủ** `A` ở tâm — trong đó đóng băng một chiếc lông xanh; (4) arena R10.
- **Hiệu ứng**: hơi lạnh bốc từ nền, tuyết hạt nhỏ xoáy quanh tinh thể; trận — **sương giá** (vùng trắng làm chậm), **băng nhũ rơi** (vòng telegraph).
- **Mở khóa**: `boss:mega-venusaur`. **Thánh vật**: Lông Băng **hoặc** đang có tuyết / bão tuyết. **Điều kiện**: ban đêm hoặc tuyết.
- **Nghi lễ**: `relic` → 4 cột pha lê lần lượt ngân → tinh thể nứt, Articuno **phá băng bay ra**, đậu lại trên mảnh vỡ (lõi bỏ va chạm).
- **Phần thưởng**: Articuno + Never-Melt Ice + 3 Super Potion + Lông Băng (cho Mewtwo).

```
~~~~~~~~~#########~~~~~~~~~
~~~~~~~####,,S,,####~~~~~~~
~~~~~,##,.........,##,~~~~~
~~~~##S.............S##~~~~
,,,,#O.....:::::.....O#,,,,
,,,##....::.....::....##,,,
,,##...::.........::...##,,
,,#,...:...........:...,#,,
,##...:....:::::....:...##,
,##...:...::...::...:...##,
,#,..:...::.....::...:..,#,
,#,..:...:.......:...:..,#,
,#,..:...:...A...:...:..,#,
,#,..:...:.......:...:..,#,
,#,..:...::.....::...:..,#,
,##...:...::.P.::...:...##,
,##...:....:::::....:...##,
,,#,...:...........:...,#,,
,,##...::.........::...##,,
,,,##....::.....::....##,,,
,,,,#O.....:::::.....O#,,,,
,,,,###.............###,,,,
,,,,,,##,...^^^...,##,,,,,,
,,,,,,,####,,=,,####,,,,,,,
,,,,,,,,,###,=,###,,,,,,,,,
```

#### ⑲ Lăng Băng Tĩnh — Regice
- **Tầng / loại**: 2 · regional (họ Lăng Regi). **Vị trí**: Chân Núi Tuyết, tâm (84, 76) (rời khỏi đỉnh để đỉnh dành cho Rayquaza).
- **Bố cục**: (1) lăng **băng khối** `#` vuông vức giữa tuyết; tiền sảnh có bia chữ chấm `S`; (2) phòng 19×13 nền băng, 4 **cột pha lê** `*` ở 4 góc, vòng rune `:` quanh **ô tĩnh** `&` ở tâm; (3) Bia lớn `A`, Regice trong tường bắc; (4) arena = cả phòng.
- **Hiệu ứng**: im lặng tuyệt đối (tắt nhạc nền khi đứng trong lăng), hơi thở thành khói; trận — **băng lan** (nền đóng băng từng dải → trơn), **khối băng** (hộp chặn tạm thời).
- **Mở khóa**: `boss:mega-venusaur`. **Nghi lễ**: `still` — đứng yên trên ô tĩnh 60 s (bia: "Đứng yên như băng"; nhúc nhích là đếm lại; đang **bão tuyết** thì chỉ cần 20 s) → cửa trong tường bắc nứt, Regice bước ra.
- **Phần thưởng**: Regice + Never-Melt Ice + **Lõi Regi Băng**.

```
#######################
###########+###########
##.........A.........##
##.*...............*.##
##.........P.........##
##...................##
##........:::........##
##.......:...:.......##
##......:.....:......##
##......:..&..:......##
##......:.....:......##
##.......:...:.......##
##........:::........##
##...................##
##.*...............*.##
#######################
##########^^^##########
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
,,,,,,,,,,,=,,,,,,,,,,,
```

#### ⑳ Đài Sao Băng — Jirachi
- **Tầng / loại**: 4 · hidden (quà). **Vị trí**: Chân Núi Tuyết, gò tuyết yên tĩnh, tâm (24, 80).
- **Bố cục**: nền tuyết nện tròn, **7 đá sao** `o` xếp **hình chòm Bắc Đẩu**, **mảnh thiên thạch** `A` cắm ở gần tâm, không vật cản khác (để bầu trời là nhân vật chính).
- **Hiệu ứng**: đêm quang — sao băng thỉnh thoảng vạch qua; đá sao sáng theo nhịp lấp lánh.
- **Mở khóa**: `boss:mew`; đêm, trời quang, Pokémon dẫn đầu thân thiết ≥ 180 (như hiện tại). **Nghi lễ**: `sequence` — chạm 7 đá sao theo thứ tự lấp lánh (đúng thứ tự vẽ chòm sao) → "điều ước", Jirachi thức dậy trong thiên thạch.

```
,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,
,,,,,,,.......,,,,,,,
,,,,,,.........,,,,,,
,,,,,.o.........,,,,,
,,,,o...o........,,,,
,,,.......o....o..,,,
,,,...............,,,
,,,...............,,,
,,,........o..o...,,,
,,,...............,,,
,,,.......A.......,,,
,,,...............,,,
,,,,......P......,,,,
,,,,,...........,,,,,
,,,,,,.........,,,,,,
,,,,,,,.......,,,,,,,
,,,,,,,,,,=,,,,,,,,,,
,,,,,,,,,,=,,,,,,,,,,
```

---

### 3.6 Vùng Đất Núi Lửa

#### ㉑ Đại Điện Dung Nham — Groudon
- **Tầng / loại**: 1 · main. **Vị trí**: Miệng Núi Lửa, tâm (88, 24).
- **Bố cục**: (1) **hào dung nham** `L` tròn, 1 cầu bazan `=` phía nam (rộng 3); (2) **nền obsidian** nứt, **4 đường nứt** `x` chéo (hiểm họa); 4 **tượng titan đá** `S` trên mép hào ở 4 góc chéo; (3) **Lõi Địa Tâm** `A` ở hậu điện bắc, bên trong **ao magma** `L` nhỏ; (4) arena R13.
- **Hiệu ứng**: ánh đỏ cam từ dưới lên, tro bay, sóng nhiệt làm méo nhẹ; trận — **Precipice Blades** (4 đường nứt `x` sáng đỏ rồi dựng lưỡi đá), **nắng gắt** (Groudon kích hoạt "đại hạn" làm đòn Lửa mạnh hơn — HUD báo).
- **Mở khóa**: `boss:lugia`, `boss:ho-oh`. **Thánh vật**: Ngọc Đỏ. **Điều kiện**: nắng gắt / quang (như hiện tại).
- **Nghi lễ**: `relic` (thả Ngọc Đỏ vào ao magma) → mặt đất rung 3 nhịp, 4 đường nứt sáng dần từ ngoài vào → Groudon **trồi lên từ giữa sân** làm nứt nền.
- **Phần thưởng**: Groudon + Soft Sand + Fire Stone.

```
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,LLL,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,LLLLLLLLL,,,,,,,,,,,,,,
,,,,,,,,,,,,LLLLLLLLLLLLL,,,,,,,,,,,,
,,,,,,,,,,LLLLL..LAL..LLLLL,,,,,,,,,,
,,,,,,,,LLLL.............LLLL,,,,,,,,
,,,,,,,LLL........P........LLL,,,,,,,
,,,,,,LLL...................LLL,,,,,,
,,,,,LLLS...................SLLL,,,,,
,,,,,LL.......................LL,,,,,
,,,,LL.........................LL,,,,
,,,,LL.........................LL,,,,
,,,LL...x...................x...LL,,,
,,,LL....xx...............xx....LL,,,
,,LLL.....xxx...........xx......LLL,,
,,LL........xx........xxx........LL,,
,,LL..........xx.....xx..........LL,,
,,LL.............................LL,,
,,LL..............+..............LL,,
,,LL.............................LL,,
,,LL..........xx.....xx..........LL,,
,,LL........xx.........xx........LL,,
,,LLL.....xxx...........xxx.....LLL,,
,,,LL....xx...............xx....LL,,,
,,,LL...x...................x...LL,,,
,,,,LL.........................LL,,,,
,,,,LL.........................LL,,,,
,,,,,LL.......................LL,,,,,
,,,,,LLLS...................SLLL,,,,,
,,,,,,LLL...................LLL,,,,,,
,,,,,,,LLL.................LLL,,,,,,,
,,,,,,,,LLLL.....===.....LLLL,,,,,,,,
,,,,,,,,,,LLLLL..===..LLLLL,,,,,,,,,,
,,,,,,,,,,,,LLLLL===LLLLL,,,,,,,,,,,,
,,,,,,,,,,,,,,LLL===LLL,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,===,,,,,,,,,,,,,,,,,
```

#### ㉒ Đền Lửa Thần Điểu — Moltres
- **Tầng / loại**: 2 · regional (họ Thần Điểu). **Vị trí**: Cánh Đồng Dung Nham, tâm (14, 40) — rời khỏi Thung Lũng.
- **Bố cục**: (1) **vòng dung nham** `L` bao sân, vành đá cháy `#`; cầu đá phía nam; (2) nền đá cháy đỏ sẫm, vòng rune `:` r=5, **6 lư lửa cổ** `*` (r=9) ở 6 hướng; 3 tượng lông vũ `S` ở cung bắc; (3) **Ngọn Lửa Vĩnh Cửu** `A` ở tâm (lư lớn); (4) arena R10, 6 lư là **cover có chủ đích** (ở 0,9R) và cũng là nguồn hiểm họa.
- **Hiệu ứng**: tàn lửa bay lên, glow đỏ cam theo nhịp thở; trận — **tường lửa** nối 2 lư kề nhau (xoay vòng theo thời gian), **tro mưa** (nhiều vòng nhỏ).
- **Mở khóa**: `boss:mega-venusaur` (và vào được Núi Lửa). **Thánh vật**: Lông Lửa. **Nghi lễ**: `sequence` — "hiến ngọn lửa cổ": lấy lửa từ Ngọn Lửa Vĩnh Cửu, thắp 6 lư theo thứ tự (tia lửa chỉ đường) → ngọn lửa tâm bùng cao, Moltres **bật ra từ ngọn lửa**, lư tâm tắt (bỏ va chạm).
- **Phần thưởng**: Moltres + Charcoal + 3 Super Potion (như hiện tại) + Lông Lửa (cho Mewtwo).

```
,,,,,###LLLLLLLLLLL###,,,,,
,,,,##LLLLL,.S.,LLLLL##,,,,
,,,##LLL,.........,LLL##,,,
,,##LLLS.....*.....SLLL##,,
,##LLL...............LLL##,
,#LLL.................LLL#,
##LL...................LL##
#LL,.*.....:::::.....*.,LL#
#LL.......:.....:.......LL#
LLL......:.......:......LLL
LL,.....:.........:.....,LL
LL......:.........:......LL
LL......:....A....:......LL
LL......:.........:......LL
LL,.....:.........:.....,LL
LLL......:...P...:......LLL
#LL..*....:.....:....*..LL#
#LL,.......:::::.......,LL#
##LL...................LL##
,#LLL.................LLL#,
,##LLL...............LLL##,
,,##LLL......*......LLL##,,
,,,##LLL,....=....,LLL##,,,
,,,,##LLLLL,===,LLLLL##,,,,
,,,,,###LLLL===LLLL###,,,,,
,,,,,,,###LL===LL###,,,,,,,
,,,,,,,,,##,===,##,,,,,,,,,
```

#### ㉓ Lòng Chảo Nham Tâm — Heatran
- **Tầng / loại**: 2 · regional. **Vị trí**: Cánh Đồng Dung Nham phía bắc, tâm (40, 16).
- **Bố cục**: (1) **lòng chảo** vách đá `#` cao, một **dốc xoắn** `=` ở góc đông nam đi xuống; (2) sườn tro `,` rồi đáy bazan `.`; **3 hố dung nham** `L` (r=6) — **cover có chủ đích** và hiểm họa; (3) **Khe Nham Tâm** `A` ở vách bắc, bên dưới là dung nham sôi; (4) arena R10.
- **Hiệu ứng**: hơi nóng dày, khí lưu huỳnh vàng; trận — **thanh nhiệt**: đứng gần hố dung nham lâu thì bị bỏng tăng dần (thanh nhỏ trên đầu HLV), Heatran **bò trên vách chảo** (đi vòng ngoài arena) rồi lao xuống.
- **Mở khóa**: `boss:groudon`. **Thánh vật**: Đá Nham Tâm (Magma Stone). **Điều kiện**: nắng gắt / quang (như hiện tại). **Nghi lễ**: `relic` → dung nham trong khe dâng lên, Heatran bò ra khỏi khe.
- **Phần thưởng**: Heatran + Magmarizer.

```
###########################
############LLL############
#########,,,LLL,,,#########
#######,,,..LAL..,,,#######
#####,,,...........,,,#####
####,,.......P.......,,####
####,.................,####
###,,.................,,###
###,...................,###
##,,....L.........L....,,##
##,....LL.........LL....,##
##,.....L.........L.....,##
#,,.....................,,#
#,,..........+..........,,#
#,,.....................,,#
##,.....................,##
##,.....................,##
##,,...................,,##
###,.........L........=,###
###,,.......LLL.......==###
####,........L........==###
####,,...............,==###
#####,,,...........,,,==###
#######,,,.......,,,##==###
#########,,,,,,,,,####==###
```

#### ㉔ Đồi Hoa Tái Sinh — Shaymin
- **Tầng / loại**: 4 · hidden (quà). **Vị trí**: Đồng Tro, tâm (56, 80) — **thiên nhiên hồi sinh giữa tro núi lửa**.
- **Bố cục**: khoảnh đất tro có **luống hoa Gracidea** `:` (đi được) mọc thành vòng; **5 khóm hoa héo** `&` xếp ngũ giác; **chum đá nứt** `A` ở tâm có mầm xanh.
- **Hiệu ứng**: phấn hoa bay, cỏ non lan dần ra ngoài tro khi hoa nở (đổi nền tro → cỏ trong bán kính 7, giữ sau khi xong).
- **Mở khóa**: `boss:celebi`; ban ngày, thân thiết ≥ 200 (như hiện tại). **Nghi lễ**: `sequence` — tưới 5 khóm hoa héo (nước lấy ở suối nóng gần đó) → hoa nở, Shaymin chui ra khỏi chum.

```
,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,
,,,,,,,:::::::,,,,,,,
,,,,,,:::::::::,,,,,,
,,,,,:::::&:::::,,,,,
,,,,:::::::::::::,,,,
,,,:::::::::::::::,,,
,,,::&:::::::::&::,,,
,,,:::::::::::::::,,,
,,,:::::::A:::::::,,,
,,,:::::::::::::::,,,
,,,:::::::P:::::::,,,
,,,:::::::::::::::,,,
,,,,:::&:::::&:::,,,,
,,,,,:::::::::::,,,,,
,,,,,,:::::::::,,,,,,
,,,,,,,:::::::,,,,,,,
,,,,,,,,,,=,,,,,,,,,,
,,,,,,,,,,=,,,,,,,,,,
```

---

### 3.7 Thánh Địa Huyền Thoại

#### ㉕ Thần Điện Khởi Nguyên — Arceus (+ Dialga, Palkia)
- **Tầng / loại**: 1 · endgame. **Cổng trên bản đồ**: tâm (48, 12). **Bên trong**: bản đồ riêng *Thần Điện* (~72×64) gồm sảnh giữa + 3 điện.
- **Cổng (mặt đất)**: **đại cầu thang** `=` 13 ô rộng, 2 hàng cột `O`, **Đại Môn** `^` có **18 khe** `o` (18 hệ). Mở khi vào được Thánh Địa (`boss:rayquaza`); mỗi huyền thoại đã hạ thắp 1 khe theo hệ của nó (khe là bảng tiến độ trực quan).
- **Bố cục bên trong**: sảnh giữa đối xứng hoàn hảo; **cửa tây** → Điện Thời Gian (Dialga), **cửa đông** → Điện Không Gian (Palkia), **cửa bắc** (đóng tới khi đủ điều kiện) → Ngai Khởi Nguyên (Arceus). Ánh sáng trắng vàng từ trần, bụi sáng lơ lửng.

```
,,,,,,#####################,,,,,,
,,,,,,#####################,,,,,,
,,,,,,#####ooooooooooo#####,,,,,,
,,,,,,######^^^^^^^^^######,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,O,======P======,O,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,O,=============,O,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,O,=============,O,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,=============,,,,,,,,,,
,,,,,,,,,,,,,,,,=,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,=,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,=,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,=,,,,,,,,,,,,,,,,
```

##### Điện Thời Gian — Dialga
- **Bố cục**: phòng vuông kín; (2) **mặt đồng hồ khổng lồ** khắc trên nền: vòng rune `:` r=11, **12 mốc giờ** `o` (r=12,4 — ngoài arena), kim giờ / kim phút `:`; 4 **trụ bánh răng** `O` ở 4 góc; (3) **Bệ Kim Cương** `A` ở hậu điện bắc (Ngọc Kim Cương); (4) arena R11.
- **Hiệu ứng**: tiếng tích tắc, bánh răng xoay chậm; trận — **vùng thời gian chậm** (cung tròn của mặt đồng hồ chậm 50% — cả Pokémon hai bên), **Roar of Time** (đánh dấu ô, nổ sau đúng "1 vòng kim" 2 s).
- **Mở khóa**: `boss:uxie`, `boss:mesprit`, `boss:azelf` (như hiện tại). **Thánh vật**: Ngọc Kim Cương. **Nghi lễ**: `plates` — đứng lên 3 mốc giờ theo giờ ghi trong manh mối (kim xoay theo) → kim chỉ 12 giờ, Dialga **hiện ra như đoạn phim tua ngược**.
- **Phần thưởng**: Dialga + Metal Coat.

```
###############################
#..............A..............#
#.O.........................O.#
#..............P..............#
#........o..:::::::..o........#
#.........::.......::.........#
#.......::...........::.......#
#......::.............::......#
#.....::...............::.....#
#...o.:......:::::......:.o...#
#....:.....::..:..::.....:....#
#....:....::...:...::....:....#
#...:.....:....:...::.....:...#
#...:....:.....:..::.:....:...#
#...:....:.....:::...:....:...#
#..o:....:.....+.....:....:o..#
#...:....:...........:....:...#
#...:....:...........:....:...#
#...:.....:.........:.....:...#
#....:....::.......::....:....#
#....:.....::.....::.....:....#
#...o.:......:::::......:.o...#
#.....::...............::.....#
#......::.............::......#
#.......::...........::.......#
#.........::.......::.........#
#.O......o..:::::::..o......O.#
#..............o..............#
##############^^^##############
```

##### Điện Không Gian — Palkia
- **Bố cục**: phòng vuông, nền **pha lê hồng nhạt**; 10 **mảnh pha lê lơ lửng** `*` dọc mép (ngoài arena); **2 cặp bệ dịch chuyển** `1`↔`1`, `2`↔`2` (đi lên một bệ → ra ở bệ cùng số phía đối diện); (3) **Bệ Ánh Ngọc** `A` ở hậu điện; (4) arena R11.
- **Hiệu ứng**: không gian gợn (viền phòng méo theo sóng), hạt sáng bị kéo dài; trận — **Spacial Rend** (đường cắt chéo telegraph 1 s), **dịch bệ** (giữa trận, các cặp bệ đổi chỗ 1 lần — báo trước bằng vòng hồng).
- **Mở khóa**: như Dialga. **Thánh vật**: Ngọc Ánh Ngọc. **Nghi lễ**: `sequence` — đi qua 2 cặp bệ theo thứ tự 1 → 2 → 1 → bệ ánh ngọc nối 4 bệ bằng tia sáng, Palkia **xé không gian bước ra**.
- **Phần thưởng**: Palkia + Prism Scale.

```
###############################
#..............A..............#
#.............................#
#...........*..P..*...........#
#.............................#
#.............................#
#.....*.................*.....#
#.............................#
#.............................#
#.............................#
#.............................#
#............:::::............#
#..*...1....::...::....2...*..#
#..........::.....::..........#
#..........:.......:..........#
#..........:...+...:..........#
#..........:.......:..........#
#..........::.....::..........#
#..*...2....::...::....1...*..#
#............:::::............#
#.............................#
#.............................#
#.............................#
#.............................#
#.....*.................*.....#
#.............................#
#.............................#
#...........*.....*...........#
##############^^^##############
```

##### Ngai Khởi Nguyên — Arceus
- **Bố cục**: nơi ấn tượng nhất game — (1) điện chữ nhật lớn, **2 hàng cột** `O` mỗi bên; (2) **18 bệ hệ** `o` xếp vòng r≈15 (ngoài arena), mỗi bệ một màu hệ; **chữ thập ánh sáng** `:` + vòng `:` r=6 trên nền trắng; (3) **Ngai** `A` trên **3 bậc thềm cao** `=` ở hậu điện bắc; (4) arena R14 — lớn nhất game.
- **Hiệu ứng**: cột sáng thẳng đứng xuống tâm; 18 bệ lần lượt sáng khi Arceus đổi hệ; trận — **Judgment** (mưa nhiều vòng nhỏ telegraph 1 s, rơi theo đợt), **đổi hệ**: mỗi pha Arceus đổi hệ, **nền điện nhuộm màu hệ đó** và bệ tương ứng sáng → người chơi đọc được hệ để đổi Pokémon.
- **Mở khóa**: `boss:dialga`, `boss:palkia`, `boss:giratina`, `boss:mewtwo`, `boss:rayquaza` (như hiện tại). **Thánh vật**: Sáo Thiên Giới (ghép từ 3 mảnh: Dialga, Palkia, Giratina). **Nghi lễ**: `relic` → **bước lên 3 bậc thềm**; mỗi bậc màn hình sáng thêm một nấc; tới `P`: thổi sáo → cột sáng, Arceus **giáng xuống** từ trên trần.
- **Phần thưởng**: Arceus + 1 Rare Candy mỗi hệ đã thắp (đề xuất) + danh hiệu.

```
####################A####################
########=========================########
########============P============########
########=========================########
##.....................................##
##.....................................##
##.O.................................O.##
##.....................................##
##..........o.......:.......o..........##
##..................:..................##
##..................:..................##
##.O....o...........:...........o....O.##
##..................:..................##
##..................:..................##
##..................:..................##
##................:::::................##
##.O..o.........::..:..::.........o..O.##
##.............::...:...::.............##
##.............:....:....:.............##
##............:.....:.....:............##
##............:.....:.....:............##
##.O.o..::::::::::::+::::::::::::..o.O.##
##............:.....:.....:............##
##............:.....:.....:............##
##.............:....:....:.............##
##.............::...:...::.............##
##.O..o.........::..:..::.........o..O.##
##................:::::................##
##..................:..................##
##..................:..................##
##..................:..................##
##.O....o...........:...........o....O.##
##..................:..................##
##..................:..................##
##..........o.......:.......o..........##
##.....................................##
##.O.................................O.##
##.....................................##
##################^^^^^##################
```

#### ㉖ Hồ Tri Thức — Uxie
- **Tầng / loại**: 2 · regional (họ Hồ Hộ Thần). **Vị trí**: tâm (20, 58).
- **Bố cục**: **ngược hướng Azelf** — hồ ở **phía tây**, sân đấu ở **phía đông** (cùng họ, khác hướng); (2) nền đá thánh trắng, vòng rune `:` r=4; 3 **bia tri thức** `S` quanh sân; 3 cột ngọc vàng `o` quanh hồ; (3) **Hang trên đảo** `A` giữa hồ (cửa sáng vàng); (4) arena R8.
- **Hiệu ứng**: chữ cổ trôi trên mặt nước; trận — **quên lãng** (vòng vàng: Pokémon đứng trong không ra chiêu đặc biệt 2 s).
- **Mở khóa**: vào được Thánh Địa + `boss:mewtwo`. **Nghi lễ**: `quiz` — đọc 3 bia (lore về các huyền thoại đã gặp), trả lời 3 câu hỏi (hộp thoại `choose`) → Uxie mở mắt, bay khỏi hang.
- **Phần thưởng**: Uxie + Wise Glasses.

```
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,S,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,S,,.......,,S,,,,
,,,,o,,,,,,,,,,...........,,,,,
,,,,~~~~~~~,,,.............,,,,
,,,~~~~~~~~~,...............,,,
,,~~~~~~~~~~~.....:::::.....,,,
,~~~~~~~~~~~.....::...::.....,,
,~~~~~~~~~~~....::.....::....,,
,~~~~~...~~~....:.......:....,,
,~~~~~A..~~~....:...P...:....==
,~~~~~...~~~....:.......:....,,
,~~~~~~~~~~~....::.....::....,,
,~~~~~~~~~~~.....::...::.....,,
,,~~~~~~~~~~~.....:::::.....,,,
,,,~~~~~~~~~,...............,,,
,,,,~~~~~~~,,,.............,,,,
,,,,o,,,,,,,,,,...........,,,,,
,,,,,,,,,,,,,,,,,.......,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
```

#### ㉗ Đại Điện Titan — Regigigas
- **Tầng / loại**: 2 · endgame (họ Lăng Regi, cỡ lớn). **Vị trí**: tâm (74, 56).
- **Bố cục**: (1) điện chữ nhật khổng lồ 33×26, tường đá xám; (2) **2 hàng cự trụ** `O` dọc hai tường, vòng rune `:` r=6 ở giữa; (3) **Tượng Titan** `A` 3×3 ở tường bắc — tượng chính là Regigigas đang ngủ; trước tượng **3 khe lõi** `&` (đá / băng / thép); (4) arena ≈ 31×22 — phòng to, boss chậm.
- **Hiệu ứng**: rêu và tuyết phủ tượng; khi đặt lõi, đường vân trên tượng sáng dần (đỏ / lam / xám); trận — **Khởi động chậm**: 20 s đầu Regigigas yếu và chậm (pha 1 có HUD đếm), sau đó **dậm đất** (sóng đất hình vành khuyên).
- **Mở khóa**: `boss:regirock`, `boss:regice`, `boss:registeel` + vào được Thánh Địa. **Nghi lễ**: `relic` ×3 (đặt 3 Lõi Regi vào 3 khe) → tượng nứt, Regigigas **đứng dậy** (tượng chính là nó: lõi biến mất, boss ở `+`).
- **Phần thưởng**: Regigigas + Muscle Band + Leftovers.

```
#####################################
#################AAA#################
##...............AAA...............##
##...............AAA...............##
##..O...........................O..##
##................P................##
##..........&.....&.....&..........##
##.................................##
##.................................##
##..O...........................O..##
##..............:::::..............##
##............::.....::............##
##...........::.......::...........##
##...........:.........:...........##
##..O.......:...........:.......O..##
##..........:...........:..........##
##..........:.....+.....:..........##
##..........:...........:..........##
##..........:...........:..........##
##..O........:.........:........O..##
##...........::.......::...........##
##............::.....::............##
##..............:::::..............##
##.................................##
##..O...........................O..##
##.................................##
##.................................##
##.................................##
################^^^^^################
################=====################
################=====################
################=====################
################=====################
```

#### ㉘ Hố Thiên Thạch — Deoxys
- **Tầng / loại**: 4 · hidden. **Vị trí**: tâm (16, 18).
- **Bố cục**: (1) **miệng hố** `#` tròn có 3 khe vào; (2) nền **thủy tinh hóa** do va chạm, **rune xoắn ốc** `:` (hình chuỗi DNA); (3) **Thiên Thạch Lõi** `A` ở mép bắc, phát sáng theo dạng (đỏ / lam / xanh / tím); (4) arena R8.
- **Hiệu ứng**: hạt sáng bay **ngược lên trời**; trận — **đổi dạng** (Tấn công / Phòng thủ / Tốc độ: màu lõi báo dạng sắp tới 1 s trước), **mảnh thiên thạch** rơi.
- **Mở khóa**: `boss:rayquaza`; ban đêm (như hiện tại). **Nghi lễ**: `condition` + chạm lõi → lõi tách, Deoxys tụ hình ở tâm.
- **Phần thưởng**: Deoxys + Life Orb.

```
,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,#####,,,,,,,,,,
,,,,,,,###########,,,,,,,
,,,,,,###...A...###,,,,,,
,,,,,##...........##,,,,,
,,,,,#......P..:...#,,,,,
,,,,,....:..........,,,,,
,,,,,...............,,,,,
,,,#....:.........:..#,,,
,,##.................##,,
,,##.................##,,
,,##...:....+.:......##,,
,,##..........:......##,,
,,##....:............##,,
,,,#......:.::.......#,,,
,,,##...............##,,,
,,,##...............##,,,
,,,,##.............##,,,,
,,,,,##...........##,,,,,
,,,,,,###.......###,,,,,,
,,,,,,,####,,,####,,,,,,,
,,,,,,,,,,#,,,#,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,
```

---

## 4. Hệ asset

Tất cả là **ô 16 px phóng ×3**, vẽ thủ tục trong `src/render/tileset.ts` (giống các ô "extras" 264+ hiện có) hoặc đặt trong `public/assets/` nếu tìm được bộ CC0 phù hợp. Không thêm thư viện.

| Nhóm | Asset | Số lượng | Ghi chú |
|---|---|---|---|
| **Nền sân** | `shrineFloor.<theme>` ×2 biến thể + `rune.<theme>` (có 2 khung phát sáng) | 12 theme × 3 = 36 ô | theme: frost, storm, ember, tide (đá trắng biển), dawn (gạch vàng), sky, magma, void (đá đen nứt), psychic (tím), moon (đá trăng), titan (đá xám), sanctum (trắng thánh). Tương phản hoa văn ≤ 25% |
| **Nền đặc biệt** | kính trăng (Cresselia), nước nông `w`, obsidian nứt `x`, bazan, đá thủy tinh hóa, tuyết nện | 6 ô (+khung) | `w` và kính trăng là địa hình đi được mới |
| **Lõi / altar** | 1 lõi riêng cho mỗi đền (3 trạng thái: ngủ / thức / thanh tịnh) | ~26 × 3 khung | 16×16 hoặc 32×32 (Tháp Chuông, Ngai, Tượng Titan: 48×48) |
| **Trụ / cột** | trụ đá cổ (có sẵn `DUNGEON.pillar`), cột băng, cột dẫn sét, trụ gãy, cột trắng biển, cột thánh, trụ bánh răng, cự thạch, cột đá trời | 9 loại | mỗi loại 16×32 (2 ô cao, phần trên vẽ lớp trên để đi phía sau được) |
| **Tượng / relic** | tượng lông vũ (3 màu), tượng Thú ×3, tượng titan, tượng ngược đầu, tượng Pokémon lạ, bia chữ chấm, bia tri thức, bia cánh ×2 | 14 | |
| **Vật nhỏ** | lư lửa (tắt / cháy), đèn cổ (tắt / sáng), pha lê nhỏ, đá rune thấp, đá sao, khóm hoa héo / nở, san hô sáng, gốc cây / cây non, khe lõi Regi | ~16 | |
| **Hiệu ứng môi trường** | hạt: tuyết, tàn lửa, tia điện, bong bóng, lá, phấn hoa, bụi sáng, sương đen, chữ cổ trôi; lớp phủ: tia nắng xiên, sóng nhiệt, méo không gian, tối có vòng sáng (dùng lại lớp tối của Flash) | 9 loại hạt + 4 lớp | dùng hệ vfx / thời tiết sẵn có (`renderer_.vfx`, `EnvironmentController`) |
| **Telegraph** | vòng tròn, đường thẳng, vành khuyên, cung tròn, mũi tên gió — 1 bộ dùng chung, tô màu theo hệ | 5 | đồng nhất toàn game để người chơi học một lần |
| **Biến thể theo biome** | cùng một lõi họ Thần Điểu / Regi / Hộ Thần đổi bảng màu theo biome | — | giảm số asset vẽ tay |

---

## 5. Tiêu chí gameplay và cách kiểm tra

| Tiêu chí | Kiểm tra được bằng |
|---|---|
| Hiếm và đặc biệt | unit: đếm đền theo tầng trên từng bản đồ (Tầng 1 ≤ 1, Tầng 2 ≤ 2, Tầng 4 ≤ 1, Thung Lũng Tầng 2 = 0); lang thang 5–7 loài, không có `starter-valley` / `farm` |
| Khác biệt | unit: không có 2 đền dùng cùng (theme nền, kiểu lõi, chuỗi nghi lễ); mỗi họ có hình học riêng (tròn / chữ nhật / hồ + sân) |
| Combat dễ đọc | unit: quét bán kính R−1 quanh `+` chỉ có ô đi được hoặc cover được khai báo (đúng như script sinh sơ đồ ở tài liệu này); tối đa 2 loại hiểm họa / đền; telegraph ≥ 0,8 s |
| Không rối | arena không có vật trang trí cao; tương phản nền ≤ 25%; ảnh chụp từng đền được xem lại |
| Tâm không trống | unit: mọi đền có `A` |
| Đi tới được | unit BFS: từ điểm xuất phát bản đồ tới `P` (sau khi giải câu đố của đền); vùng bao ngoài không cắt đường chính |
| Vùng khởi đầu không quá tải | unit: trong Đồng Cỏ Gió / Làng / Nông Trại không có đền; Hang Tâm Linh chỉ là "vết nứt" khi chưa có 3 Thần Điểu |
| Nghi lễ không tự kích hoạt | e2e: đi ngang qua đền đủ điều kiện → không có trận cho tới khi bấm E ở `P` |
| Lưu / tải | e2e: lưu giữa nghi lễ / giữa trận → tải lại: cổng mở, trận reset, thánh vật không mất |

---

## 6. Triển khai đề xuất (theo thứ tự)

1. **Dữ liệu + dựng đền**: `data/world/shrines.json` (id, legend, tầng, họ, bản đồ, tâm, sơ đồ ASCII + bảng ký hiệu, arena, cover, nghi lễ, thánh vật, phần thưởng) và `core/shrines.ts` (đọc sơ đồ, kiểm tra arena — pure, có unit test). `valley.ts`: thay khối vẽ 12 trụ bằng `stampShrine()` (ghi đè địa hình + đặt vật; tương tự cách đã làm `orchard` / `paddy` / `nook`). `legendaries` trong bản đồ giữ nguyên để không vỡ save, chỉ trỏ tới `shrine`.
2. **Nghi lễ**: `ShrineRitual` (máy trạng thái 8 loại bước) trong `core/`; `AdventureScene.updateWorldBoss()` đổi từ "bước vào là đánh" sang "bấm E ở `P`"; chuyển cảnh + vòng chắn arena.
3. **Asset**: ô và vật trong `tileset.ts` theo bảng mục 4.
4. **Dời đền + lang thang**: cập nhật toạ độ trong các file bản đồ và `legends.json`; manh mối mới; thánh vật (key item).
5. **Bản đồ riêng**: `ShrineMap implements MapProvider` từ sơ đồ ASCII (Vực Nguyên Hải, Thần Điện) — tái dùng cách vào / ra của hầm ngục.
6. **Hiểm họa arena**: mỗi đền ≤ 2 loại, gắn vào pha boss trong `bossPhases.ts`.

Tương thích save: cờ `boss:*`, trạng thái `legends[id]`, `bossDefeatedAt` giữ nguyên theo id loài → dời đền không làm mất tiến độ. Save đang đứng trong khu vực mới thành tường / nước được đặt sang ô trống gần nhất khi tải (đã có từ bản V22 trước).
