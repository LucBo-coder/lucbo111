# Changelog

## Chưa phát hành — V30: Hệ thống nhiệm vụ, mạch nhiệm vụ Việt Nam, hướng dẫn trong game

- **Không còn nhiệm vụ kẹt**: việc chỉ xảy ra một lần trong save (kích hoạt trạm, thắng HLV, hạ boss, mở rương, giải câu đố, dọn chướng ngại, điểm bảo tồn) giờ được tính cả khi đã làm trước lúc nhận nhiệm vụ. Nhận nhiệm vụ khám phá khi đang đứng trong khu đó thì tính ngay. Save có nhiệm vụ vượt quá số bước được kéo về bước cuối.
- **Thứ tự hợp lý hơn**: đánh, bắt, khám phá, thu thập… làm sớm khi nhiệm vụ đang chạy được giữ lại và tính khi tới bước; chỉ nói chuyện / báo cáo, lựa chọn và tình huống cốt truyện phải đúng lượt. Nhật ký đánh dấu ☑ / số đếm cho bước làm sớm.
- **Mạch nhiệm vụ Việt Nam**: mỗi tỉnh đi theo *đến nơi → Linh phá thiết bị Bình Minh → thần hộ vệ → huy hiệu*.
  - Sửa: nhiệm vụ An Giang tự bật ngay từ đầu game; Chúa Rừng U Minh, Magnezone, Torterra phải đánh hai lần (hai nhiệm vụ cùng boss); nhiệm vụ Seviper của cốt truyện không nhắc phải thắng Vy.
  - Cà Mau sắp lại: Trạm nước → Lưới → Vào rừng U Minh (Chú Sáu) → Khu làm tổ của Seviper (Kiểm lâm Nam) → *Rừng U Minh bình yên* → Huy hiệu. Sài Gòn / Hà Nội: boss trong cốt truyện, nhiệm vụ tỉnh thành đoạn kết.
  - Save v10 tự chuyển đổi (nhiệm vụ đang dở giữ đúng chỗ).
- **Cấp tỉnh theo dải**: tỉnh 1–7 Lv 1–25, 8–15 Lv 25–45, 16–24 Lv 45–65, 25–32 Lv 65–85, 33–36 Lv 85–100 (trước đây tăng đều Lv 12 → 100, giữa hành trình quá dốc). Khu, HLV, cứu hộ, boss và vùng gặp Pokémon dời cùng nhau; Pokémon của HLV về dạng tiến hóa hợp cấp.
- **Dân làng theo kịp câu chuyện**: hạ xong thần hộ vệ, người dẫn đường và dân trong tỉnh nói chuyện yên bình trở lại thay vì kể mãi chuyện rắc rối cũ (cả 36 tỉnh). Ở Quần Đảo Khởi Nguyên, người giữ hải đăng, bà đồng đầm lầy, trưởng làng… đổi lời sau từng chương.
- **Hướng dẫn trong game** (K / F1 / nút **?**): bảng phím đầy đủ, điều khiển cảm ứng, 5 trang cách chơi; lời nhắc lần đầu.
- **Phím O** mở PC. Gõ chữ trong ô nhập (tìm PC, đặt tên hộp) không còn kích hoạt phím tắt (trước đây gõ x / i / m / j làm nhảy tab).
- `src/core/questAudit.ts`: rà dữ liệu nhiệm vụ của cả hai chiến dịch (0 lỗi).
- Test mới `v30_quest_catchup`, `v30_quest_audit`, `v30_quest_flow` (chơi trọn mạch chính 36 tỉnh), `v29_shared_boss`; e2e `v30_help`. E2e `v29_story` tự phá thiết bị thay vì chờ đồng đội (hết bị hết giờ khi máy bận).

## Chưa phát hành — V29: Một Pokémon trên sân, cốt truyện "Mạch Nguồn" và "Quần Đảo Khởi Nguyên"

- **Một Pokémon trên sân mỗi huấn luyện viên** ở Phiêu lưu, Việt Nam Odyssey và co-op (cả HLV NPC). Mọi con số nằm trong `src/data/field-rules.json`.
  - **Vòng đổi nhanh** (T / nút **Đổi**, tự mở khi Pokémon gục): HP, hệ, trạng thái, thời gian hồi; phím 1–5. Đổi lúc yên bình hồi 0,8 s; đang giao chiến ~0,6 s, hồi 6 s.
  - Pokémon gục về bóng, sau 4 s game tự thả con khỏe hợp hệ nhất; hết con khỏe thì ngất. Con trong bóng vẫn hồi chiêu và năng lượng.
  - EXP: con đã đánh nhận đủ, con khỏe trong bóng 50%.
  - Boss chỉnh cho trận một-con (HP, sát thương, kháng sát thương theo thời gian, khống chế ngắn hơn, ít quân tiếp viện hơn).
  - Chặt cây / đập đá / đẩy đá / đền tự thả đúng con có năng lực. Ném bóng thì đồng đội ngừng đánh con đang bị bắt.
  - Khách co-op mang tới 6 con, 1 con trên sân, đổi qua chủ phòng. Save v9 tự chuyển đổi.
- **Combat UI**: Q nhắm con địch dưới chuột; lệnh "Đi theo" / "Rút lui" đổi tên thành **Ngừng tấn công** / **Quay về HLV**; HUD đội: con trên sân lớn, dự bị gọn.
- **Cốt truyện cho cả hai chiến dịch** (`src/data/story/*.json`, sinh bằng `npx tsx scripts/gen-story.ts`):
  - **Mạch Nguồn** (Việt Nam Odyssey): 7 hồi từ Cà Mau tới Hà Nội rồi về lại Đất Mũi; 46 nhiệm vụ, 20 cảnh; Linh chờ ở cả 36 tỉnh; Khải, Tiến sĩ Vũ, Chú Sáu; ngã rẽ ở Huế; trận cuối 3 bước ở Cổ Loa. Giáo sư Mai đổi tên thành **Giáo sư An**.
  - **Quần Đảo Khởi Nguyên** (Phiêu lưu): 7 chương trên 7 bản đồ tìm bảy mảnh Lõi Khởi Nguyên để thắp lại hải đăng; 9 nhiệm vụ, 9 cảnh; ngã rẽ ở Bờ Biển.
  - Cảnh tự phát lúc yên, **bỏ qua được**, đọc lại trong nhật ký. NPC cốt truyện xuất hiện / rời đi theo tiến độ.
  - Mục tiêu mới: **giữ vị trí** trước các đợt Pokémon, **phá thiết bị**, **hộ tống**.
- **Nhật ký**: thêm bộ lọc **Chính** / **Phụ** và trang **Cốt truyện** (hồi / chương, nhân vật đã gặp, cảnh đã xem với nút Xem lại).
- Hộ chiếu không tính HLV cốt truyện (xuất hiện theo cờ) vào số HLV của tỉnh.
- Test mới `v29_one_active` (15), `v29_story` (14), e2e `v29_story` (2).
- Chưa làm (ghi ở TASKS T29-4/5): đổi dải cấp các tỉnh theo bảng tham khảo; Torterra là đồng minh kịch bản; khách co-op xem cảnh.

## Chưa phát hành — Sửa hoạt ảnh Pokémon (gói PMD cá nhân)

- **Script mới `scripts/fetch-pmd-missing.py`**: tải từ PMDCollab SpriteCollab các loài còn thiếu trong gói hoạt ảnh, và tải lại những loài có sheet lệch kích thước khung (sheet lệch bị game từ chối nên loài đó mất hoạt ảnh). Kết quả trên máy: thêm 6 loài (Jellicent, Rolycoly, Sirfetch'd, Copperajah, Toedscool, Pecharunt), sửa 32 loài (Victini, Meowscarada và 30 sheet shiny). 55 loài SpriteCollab chưa vẽ vẫn dùng ảnh chính thức có hoạt ảnh dựng bằng code.
- **Shiny không có sheet dùng được** (Dewott, Archen, Minior, Marshadow, Mega Charizard X…) giờ vẫn có hoạt ảnh 8 hướng bằng sheet thường, thay vì hiện icon tĩnh. Hoạt ảnh shiny bị thiếu lẻ (`shinySkip`, ví dụ Faint) không còn được tải.
- e2e `v11_pmd` thêm trường hợp kiểm tra các loài vừa sửa.

## Chưa phát hành — V28: Phố cổ phương Đông

- **Thành phố trung tâm của 36 tỉnh Việt Nam Odyssey thành phố cổ phương Đông**: nhà mái ngói cong có đầu đao vút, bờ nóc, cột sơn son, cửa bức bàn sơn đỏ đinh vàng, song cửa giấy, nền đá và đèn lồng đỏ trước cửa. Có 4 màu ngói: đỏ nâu, xám xanh, vàng lưu ly, men xanh. Trung tâm Pokémon và cửa hàng có hoành phi (Poké Ball / túi hàng) trên cửa; đình, chùa, bảo tàng, Văn Miếu dùng mái chồng diêm hai tầng với "lưỡng long chầu nguyệt" trên nóc. Toàn bộ hình vẽ bằng code (`src/render/orientalArt.ts`), không dùng asset bên ngoài.
- **Cổng tam quan** bắc qua đường dẫn vào quảng trường ở 33/36 tỉnh: hai trụ chặn đường, lối giữa đi qua được; có câu đối và hoành phi.
- **Quảng trường lát gạch đỏ Bát Tràng** (ô tile mới `EX.brick`, lát kín vùng `paved`, bật bằng `town: 'oriental'`).
- **Dãy nhà phố** (hiệu thuốc bắc, tiệm trà, hiệu may áo dài, tiệm gốm, tiệm đèn lồng…): tối đa 10 nhà mỗi thành phố (tổng cộng 256), dựng ở chỗ trống cạnh quảng trường và các trục đường, cửa quay ra đường.
- **Đồ trang trí đường phố**: cột đèn lồng (sáng ấm về đêm) ở các góc quảng trường và hai bên cổng, chậu bonsai bên cửa Trung tâm / cửa hàng / nhà, đèn đá và lư hương trước đình chùa.
- Script `scripts/orientalize.ts`: chạy lại được nhiều lần cho mọi tỉnh hoặc một tỉnh. Mọi vị trí đều được kiểm tra: không chắn đường, cửa, NPC, rương, cổng; không mọc chồng lên cây hay trong đấu trường boss.
- Test mới `v28_oriental`; `v26_world_art` giữ trường hợp nhà Adventure Awaits ở Thung lũng Khởi đầu.

## Chưa phát hành — V27: Việt Nam Odyssey mở rộng ra cả nước

- **Tỉnh 7 — Đồng Tháp** (gồm Tiền Giang cũ, Lv 36–42): qua cầu Rạch Miễu từ Bến Tre (cổng mới ở bờ bắc Bến Tre, mở bằng Huy hiệu Dừa Xiêm); Mỹ Tho bên sông Tiền, chợ nổi Cái Bè (2 bến ghe), làng hoa Sa Đéc, Gò Tháp, vườn xoài Cao Lãnh, Vườn quốc gia Tràm Chim, đồng sen Tháp Mười; 7 NPC, 5 huấn luyện viên, giải cứu Swanna, 8 nhiệm vụ, 6 điểm trồng tràm; boss Ludicolo — Thần Sen Tháp Mười → Huy hiệu Sen Hồng.
- **Tỉnh 8 — Tây Ninh** (gồm Long An cũ, Lv 38–44): đi từ Gò Tháp theo quốc lộ; cánh đồng lúa Long An, làng nổi Tân Lập (rừng tràm), Tòa Thánh Cao Đài (mái vàng), hồ Dầu Tiếng, Núi Bà Đen; giải cứu Chimecho, 9 nhiệm vụ, 6 điểm vớt rác; boss Golurk — Thần Núi Bà Đen → Huy hiệu Núi Bà.
- **Tỉnh 9 — TP. Hồ Chí Minh** (gồm Bình Dương, Bà Rịa – Vũng Tàu cũ, Lv 40–46): địa đạo Củ Chi, vườn trái Lái Thiêu, Thảo Cầm Viên, trung tâm Sài Gòn (chợ Bến Thành, Nhà thờ Đức Bà, Bưu điện, Dinh Độc Lập), bến Bạch Đằng, rừng Sác Cần Giờ, biển Vũng Tàu; giải cứu Buizel, 9 nhiệm vụ, 6 điểm trồng đước; boss Magnezone — Thần Điện Sài Gòn → Huy hiệu Sài Gòn.
- **Tỉnh 10 — Đồng Nai** (gồm Bình Phước cũ, Lv 42–48): Vườn quốc gia Cát Tiên, Bàu Sấu, đồi điều Bình Phước, Biên Hòa (Văn miếu Trấn Biên), Bửu Long, thác Giang Điền, sông Đồng Nai (bến đò); giải cứu Chatot, 9 nhiệm vụ, 6 điểm gỡ lưới; boss Tauros — Bò Tót Cát Tiên → Huy hiệu Bò Tót.
- **Tỉnh 11 — Lâm Đồng** (gồm Đắk Nông, Bình Thuận cũ, Lv 44–50): Đà Lạt (ga, chợ, hồ Xuân Hương), núi Langbiang, đồi thông, làng hoa Vạn Thành, đồi chè Cầu Đất, đồi cát Mũi Né; giải cứu Stantler, 9 nhiệm vụ; boss Florges — Thần Hoa Đà Lạt → Huy hiệu Ngàn Hoa.
- **Tỉnh 12 — Khánh Hòa** (gồm Ninh Thuận cũ, Lv 46–52): Nha Trang, tháp Bà Ponagar, vịnh Nha Trang và đảo yến, đèo Khánh Lê, vườn nho và đàn cừu Phan Rang, tháp Po Klong Garai, vịnh Cam Ranh; giải cứu Tirtouga, 9 nhiệm vụ; boss Kingdra — Thần Vịnh Nha Trang → Huy hiệu Vịnh Biển.
- **Tỉnh 13 — Đắk Lắk** (gồm Phú Yên cũ, Lv 48–54): Buôn Ma Thuột (cà phê, nhà dài Ê Đê), Buôn Đôn, rừng khộp Yok Đôn, đồi cà phê, hồ Lắk, thác Dray Nur, Gành Đá Đĩa; giải cứu Phanpy, 9 nhiệm vụ; boss Donphan — Voi Thần Yok Đôn → Huy hiệu Voi Rừng.
- **Tỉnh 14 — Gia Lai** (gồm Bình Định cũ, Lv 50–56): Pleiku (nhà rông Ba Na), Biển Hồ, đồi chè, núi lửa Chư Đăng Ya, rừng Kon Ka Kinh, võ đường Tây Sơn, Eo Gió Quy Nhơn; giải cứu Passimian, 9 nhiệm vụ; boss Conkeldurr — Võ Thần Tây Sơn → Huy hiệu Võ Tây Sơn.
- **Tỉnh 15 — Quảng Ngãi** (gồm Kon Tum cũ, Lv 52–58): TP. Quảng Ngãi, làng Kon Klor (nhà rông Ba Na), rừng thông Măng Đen, núi Ngọc Linh, Sa Huỳnh, bến tàu và đảo tỏi Lý Sơn; giải cứu Comfey, 9 nhiệm vụ; boss Dhelmise — Hồn Neo Lý Sơn → Huy hiệu Đảo Tỏi.
- **Tỉnh 16 — Đà Nẵng** (gồm Quảng Nam cũ, Lv 54–60): sông Hàn và cầu Rồng (cầu bắc qua sông), bán đảo Sơn Trà, Bà Nà — Cầu Vàng, biển Mỹ Khê — Ngũ Hành Sơn, Hội An và làng rau Trà Quế, thánh địa Mỹ Sơn; giải cứu Oranguru, 9 nhiệm vụ; boss Salamence — Rồng Sông Hàn → Huy hiệu Cầu Rồng.
- **Tỉnh 17 — Huế** (Lv 56–62): sông Hương và cầu Trường Tiền, Hoàng thành Đại Nội (Ngọ Môn), chùa Thiên Mụ, lăng Tự Đức, phá Tam Giang, Bạch Mã, vịnh Lăng Cô; giải cứu Unfezant, 9 nhiệm vụ; boss Aegislash — Gươm Báu Hoàng Thành → Huy hiệu Cố Đô.
- **Tỉnh 18 — Quảng Trị** (gồm Quảng Bình cũ, Lv 58–64): Đồng Hới (Quảng Bình Quan), Phong Nha — Kẻ Bàng, biển Nhật Lệ, rừng Trường Sơn, địa đạo Vịnh Mốc — Cửa Tùng, cầu Hiền Lương bắc qua sông Bến Hải, Thành cổ; giải cứu Sawsbuck (sao la), 9 nhiệm vụ; boss Noivern — Dơi Thần Sơn Đoòng → Huy hiệu Hang Động.
- **Tỉnh 19 — Hà Tĩnh** (Lv 60–66): núi Hồng Lĩnh, chùa Hương Tích, khu lưu niệm Nguyễn Du, rừng Vũ Quang, vườn bưởi Phúc Trạch, ngã ba Đồng Lộc, biển Thiên Cầm; giải cứu Bouffalant, 9 nhiệm vụ; boss Braviary — Đại Bàng Hồng Lĩnh → Huy hiệu Hồng Lĩnh.
- **Tỉnh 20 — Nghệ An** (Lv 62–68): thành phố Vinh (thành cổ, ví giặm), làng Sen — Kim Liên, rừng Pù Mát, đảo chè Thanh Chương, mỏ đá quý Quỳ Châu, biển Cửa Lò; giải cứu Furret, 9 nhiệm vụ; boss Decidueye — Cú Thần Pù Mát → Huy hiệu Sông Lam.
- **Tỉnh 21 — Thanh Hóa** (Lv 64–70): suối cá thần Cẩm Lương, ruộng bậc thang Pù Luông, thành nhà Hồ, hồ Bến En — Lam Kinh, đền Bà Triệu, biển Sầm Sơn; giải cứu Ambipom, 9 nhiệm vụ; boss Milotic — Nữ Thần Suối Cẩm Lương → Huy hiệu Cá Thần.
- **Tỉnh 22 — Ninh Bình** (gồm Hà Nam, Nam Định cũ, Lv 66–72): cố đô Hoa Lư, Tràng An, Hang Múa, đồng lúa Tam Cốc, chùa Bái Đính — Tam Chúc, rừng Cúc Phương; giải cứu Cinccino, 9 nhiệm vụ; boss Hydreigon — Rồng Ba Đầu Hang Múa → Huy hiệu Hạ Long Cạn.
- **Tỉnh 23 — Hưng Yên** (gồm Thái Bình cũ, Lv 68–74): Phố Hiến (Văn Miếu Xích Đằng), vườn nhãn lồng, sông Hồng và đền Chử Đồng Tử, chùa Keo, đồng lúa Thái Bình, biển Đồng Châu; giải cứu Swadloon, 9 nhiệm vụ; boss Tsareena — Nữ Hoàng Nhãn Lồng → Huy hiệu Nhãn Lồng.
- **Tỉnh 24 — Hải Phòng** (gồm Hải Dương cũ, Lv 70–76): thành phố hoa phượng (nhà hát lớn), cảng Hải Phòng, đảo Cát Bà, bán đảo Đồ Sơn, Côn Sơn — Kiếp Bạc, vườn vải Thanh Hà; giải cứu Infernape (voọc Cát Bà), 9 nhiệm vụ; boss Talonflame — Chim Lửa Hoa Phượng → Huy hiệu Hoa Phượng.
- **Tỉnh 25 — Bắc Ninh** (gồm Bắc Giang cũ, Lv 72–78): đồi Lim và ao làng quan họ, đền Đô, làng tranh Đông Hồ, chùa Dâu — Phật Tích, Tây Yên Tử, vải thiều Lục Ngạn; giải cứu Kricketune, 9 nhiệm vụ; boss Primarina — Nàng Quan Họ → Huy hiệu Quan Họ.
- **Tỉnh 26 — Quảng Ninh** (Lv 74–80): vịnh Hạ Long — Bãi Cháy (đảo đá ngoài vịnh), núi Yên Tử (chùa Đồng), mỏ than Cẩm Phả, thương cảng Vân Đồn, rừng ngập mặn Đồng Rui; giải cứu Mantine, 9 nhiệm vụ; boss Dragonite — Rồng Mẹ Hạ Long → Huy hiệu Rồng Hạ Long.
- **Tỉnh 27 — Lạng Sơn** (Lv 76–82): núi Tô Thị và chùa Tam Thanh, chợ Kỳ Lừa, ải Chi Lăng, núi Mẫu Sơn, đồi hồi, sông Kỳ Cùng; giải cứu Gogoat, 9 nhiệm vụ; boss Gigalith — Nàng Tô Thị Hóa Đá → Huy hiệu Vọng Phu.
**Tỉnh 28 — Cao Bằng** (`cao-bang`): thác Bản Giốc, động Ngườm Ngao, Pác Bó, hồ Thang Hen, đèo Mã Phục, làng rèn Phúc Sen; 9 nhiệm vụ; boss Incineroar — Hổ Lửa Ngườm Ngao Lv84 (Huy hiệu Hang Hổ).
**Tỉnh 29 — Thái Nguyên** (`thai-nguyen`, tiền tố `ty`): đồi chè Tân Cương, hồ Núi Cốc, hang Phượng Hoàng, ATK Định Hóa, mỏ sắt Trại Cau; 9 nhiệm vụ; boss Polteageist — Hồn Ấm Chè Tân Cương Lv86 (Huy hiệu Đệ Nhất Danh Trà).
**Tỉnh 30 — Tuyên Quang** (`tuyen-quang`): đèo Mã Pí Lèng, hồ Na Hang, Tân Trào, ruộng bậc thang Hoàng Su Phì, cao nguyên đá Đồng Văn; 9 nhiệm vụ; boss Mudsdale — Ngựa Thần Mã Pí Lèng Lv88 (Huy hiệu Mã Pí Lèng).
**Tỉnh 31 — Lào Cai** (`lao-cai`): đỉnh Fansipan phủ tuyết (vùng tuyết duy nhất có hệ Băng — `noIce: false` giờ chỉ mở cho vùng `snow`), thị trấn Sa Pa, thác Bạc, bản Cát Cát, thung lũng Mường Hoa, đèo Ô Quy Hồ; 9 nhiệm vụ; boss Abomasnow — Thần Tuyết Fansipan Lv90 (Huy hiệu Nóc Nhà Đông Dương).
**Tỉnh 32 — Lai Châu** (`lai-chau`, tiền tố `lh`): đỉnh Bạch Mộc Lương Tử (biển mây), hồ thủy điện, rừng Pu Sam Cáp, đồi chè Tam Đường, cao nguyên Sìn Hồ; 9 nhiệm vụ; boss Altaria — Chim Mây Bạch Mộc Lv92 (Huy hiệu Biển Mây).
**Tỉnh 33 — Điện Biên** (`dien-bien`): đèo Pha Đin, hồ Pá Khoang, Điện Biên Phủ (bảo tàng chiến thắng), rừng Mường Phăng, cánh đồng Mường Thanh, A Pa Chải; 9 nhiệm vụ; boss Aggron — Hộ Thần Đèo Pha Đin Lv94 (Huy hiệu Pha Đin).
**Tỉnh 34 — Sơn La** (`son-la`): sống lưng khủng long Tà Xùa, lòng hồ Quỳnh Nhai, rừng thông Bản Áng, đồi chè và thảo nguyên Mộc Châu; 9 nhiệm vụ; boss Tyrantrum — Bạo Long Tà Xùa Lv96 (Huy hiệu Sống Lưng Khủng Long).
**Tỉnh 35 — Phú Thọ** (`phu-tho`): Đền Hùng trên núi Nghĩa Lĩnh, ngã ba Bạch Hạc, Việt Trì, Xuân Sơn, đồi chè Long Cốc, núi Tam Đảo; truyền thuyết Sơn Tinh — Thủy Tinh; 9 nhiệm vụ; boss Gyarados — Thủy Tinh Nổi Giận Lv98 (Huy hiệu Đất Tổ).
**Tỉnh 36 — Hà Nội, chặng cuối** (`ha-noi`): thành Cổ Loa, Hồ Gươm — tháp Rùa, phố cổ, Văn Miếu, Ba Vì, vườn đào Nhật Tân, chùa Hương; 9 nhiệm vụ; boss Torterra — Thần Kim Quy Cổ Loa Lv100 (Huy hiệu Thăng Long, lời kết hành trình). Cấp quái tinh nhuệ/alpha giờ chặn ở Lv100 (`gen-province`, `WorldEventController`).
**Sửa lỗi bản đồ V27**: NPC kiểu `hiker` giờ có ngoại hình (trước đó trả về null); 26 điểm câu cá ở các tỉnh dời sát mép nước để phao rơi xuống nước (TP.HCM, Đồng Nai, Lâm Đồng, Khánh Hòa, Đắk Lắk, Đà Nẵng, Huế, Quảng Trị, Hà Tĩnh, Nghệ An, Thanh Hóa, Ninh Bình, Hưng Yên, Hải Phòng, Bắc Ninh và 9 tỉnh phía Bắc).
- **Làm tỉnh mới nhanh hơn**: mỗi tỉnh = 1 bản đồ (`src/data/vietnam/<id>.json`) + 1 spec cốt truyện (`scripts/provinces/<id>.ts`); `npx tsx scripts/gen-province.ts <id>` sinh trang hộ chiếu (`src/data/vietnam/provinces.json`), vùng gặp Pokémon, boss, danh tiếng, nhiệm vụ (điểm đánh dấu lấy từ bản đồ), điểm bảo tồn, cổng trên bản đồ tỉnh trước và mục "Có gì mới". `scripts/ascii-map.ts <id>` in bản đồ dạng chữ để soát bố cục. Test chung `tests/vn_provinces.test.ts` + e2e `e2e/vn_provinces.spec.ts` cho mọi tỉnh làm theo cách này.
- **Giao diện cho hành trình dài**: danh sách tỉnh cạnh bản đồ chỉ hiện các tỉnh quanh tỉnh đang đứng (phần còn lại trong Hộ chiếu); bảng danh tiếng chia trang (6 tỉnh / trang); Hộ chiếu và bảng danh tiếng mở đúng trang của tỉnh hiện tại.

## Chưa phát hành — V22–V26: AI huấn luyện viên, danh tiếng theo tỉnh, Việt Nam Odyssey (đến Bến Tre), online

- **Đồ họa nền kiểu GBA (Ruby/Emerald)** (`src/render/tileset.ts`): cỏ 3 tông có búi và hoa, đường đất màu cát có viền và sỏi (kể cả góc trong), quảng trường lát đá, cỏ cao (ô gặp Pokémon hoang dã) thành các búi lá nhọn xếp so le và lắc theo gió, cỏ sâu cùng kiểu với cỏ thường (không còn mảng sọc tối), bờ nước có dải nước nông và cát ướt. Áp dụng cho mọi bản đồ ngoài trời; chỉ số ô không đổi.
- **Nhà cottage, cây cổ thụ, cây và cỏ chi tiết hơn**: gói [Adventure Awaits](https://opengameart.org/content/adventure-awaits-asset-pack-10) (Ishtar Pixels, CC0) cho 3 kiểu nhà mái ngói có ống khói (kiểu nhà mới `style: "cottage"`: nhà cô Ba Lựu, nhà ông Năm ở Bến Tre, nhà cụ Ba ở Thung Lũng) và 2 cây cổ thụ tán rộng mọc ở chỗ cây đứng riêng trên đồng cỏ (Thung Lũng, Rừng Ngọc Lục Bảo và 5 tỉnh miền Tây). Cây 1 ô (tròn, cao, thông, lá thu, bụi, đước, tràm) vẽ lại có viền tối, tán 4 tông và đốm sáng; cỏ thêm cụm cỏ ba lá. Chế độ co-op hiển thị giống chủ phòng.
- **Mép cát / bãi đá giáp cỏ và đồ họa theo vùng**: cát và bãi đá trên nền cỏ (Thung Lũng, bờ biển, miền Tây) có mép cỏ răng cưa thay cho cạnh vuông; đường ở vùng tuyết là lối tuyết nén có vết chân, ở núi lửa là đá bazan (trước là gạch lấm tấm rêu xanh); tuyết có gợn gió, tuyết sâu thành ụ tuyết, tro có búi cỏ phủ tro, đá núi lửa thành nền bazan nứt liền mạch, dung nham có mảng vỏ nguội trôi, cỏ đầm lầy và bùn chi tiết hơn.
- **Góc trong của cát / đá, mái chùa và biển hiệu**: cát và bãi đá có thêm khía cỏ ở góc chéo (không còn góc vuông lọt vào giữa thảm cỏ); Chùa Âng, Chùa Hang (Trà Vinh) lợp mái vàng, Văn Thánh Miếu (Vĩnh Long) mái men xanh; Trung tâm Pokémon có biển Poké Ball, cửa hàng có biển "M" xanh phía trên cửa.
- **Xem bản đồ trong Tiled** (`npm run tiled`, `scripts/export-tiled.ts`): xuất atlas `ow_tiles` đúng như game vẽ, tileset `.tsx` có hoạt ảnh nước / cỏ cao / bờ / dung nham, và 28 bản đồ ngoài trời thành `.tmx` (lớp Ground, Buildings, đối tượng cây / đạo cụ / NPC) vào thư mục `tiled/` để soát đồ họa trong trình biên tập Tiled.
- **Việt Nam Odyssey — tỉnh thứ sáu: Bến Tre** (`data/vietnam/ben-tre.json`, Lv 34–40): đi từ Trà Vinh qua cầu Cổ Chiên khi có Huy hiệu Cây Dầu; làng kẹo dừa, vườn dừa Thới Sơn, rừng tràm, bờ sông Hàm Luông; boss Exeggutor — Dừa Trăm Thân (Huy hiệu Dừa Xiêm); 7 nhiệm vụ và 6 điểm bảo tồn.
- **Hết đơ game, không mất tiến trình** (`src/systems/crashGuard.ts`): trước đây chỉ một lỗi trong một khung hình là vòng lặp game dừng hẳn (màn hình đứng, phải tải lại trang). Giờ game chạy tiếp; lỗi lặp liên tục thì lưu ngay và hiện bảng "Lưu và tải lại / Tiếp tục". Game lưu ngay khi ẩn tab, đóng hoặc tải lại trang (thêm bản cứu hộ localStorage), nên tải lại không còn mất tới 20 s tiến trình. Hội thoại / tiến hóa / chọn starter lỗi không còn khóa nhân vật.
- **Khởi động nhanh hơn ~30 %**: ảnh vật phẩm và HUD boss tải nền sau khi vào menu, font không còn chặn khởi động, biểu tượng chiêu thức vẽ khi cần.
- **NPC về nhân vật pixel có hoạt ảnh, đa dạng hơn** (`src/core/npcLooks.ts`): thay ảnh trainer Pokémon Showdown bằng 15 dáng pixel 16×16 có hoạt ảnh thở / bước (nón lá, áo dài, trẻ em, cụ ông / cụ bà, kiểm lâm, nhà khoa học, cựu binh…), mỗi NPC một bộ màu riêng cố định; giới / tuổi theo danh xưng (Cô, Bà, Chú, Bé…), miền Tây dùng nón lá. Chân dung hội thoại, HLV phục kích, thương nhân cũng dùng mẫu này.
- **Chọn starter Gen 1–9** ở Phiêu lưu cổ điển và Việt Nam Odyssey (`src/core/starters.ts`): bảng chọn có tab theo thế hệ (Kanto → Paldea, 27 loài), mở sẵn ở bộ ba của chiến dịch; phím 1–3, ←/→, Enter hoặc chạm. Phím chọn không còn lọt thành lệnh đội. Sinh tồn, Co-op, PvP, Thế giới online không đổi.
- **Việt Nam Odyssey — tỉnh thứ năm: Trà Vinh** (`data/vietnam/tra-vinh.json`, Lv 28–34): cổng góc đông nam Vĩnh Long mở khi có Huy hiệu Gốm Đỏ; thành phố Trà Vinh, Ao Bà Om + Chùa Âng, rừng dầu cổ thụ, Chùa Hang (vườn cò), vườn dừa Cầu Kè, bờ sông Cổ Chiên, biển Ba Động, rừng ngập mặn Duyên Hải. 9 NPC, 5 HLV, giải cứu Ducklett, 9 nhiệm vụ, boss **Trevenant — Thần Cây Dầu** (giả tưởng, không bắt được; ngủ tới khi hạ Người giữ rừng Sơn) → Huy hiệu Cây Dầu, 6 điểm bảo tồn trên bãi biển, danh tiếng, hộ chiếu. Cổng Cầu Cổ Chiên tới Bến Tre có sẵn, đang khóa.
- **Việt Nam Odyssey — tỉnh thứ tư: Vĩnh Long** (`data/vietnam/vinh-long.json`, Lv 22–30): cổng phía đông Cần Thơ mở khi có Huy hiệu Sông Hậu; Bến Vĩnh Long, Văn Thánh Miếu, Cù lao An Bình (chỉ đi đò), ruộng khoai Bình Tân, lò gạch Mang Thít (cầu qua kênh), vườn bưởi Bình Minh, sông Tiền / Cổ Chiên. 9 NPC, 5 HLV, giải cứu Phanpy, 8 nhiệm vụ, boss **Torkoal — Thần Lò Mang Thít** (giả tưởng, không bắt được; niêm phong tới khi hạ Thợ lò Ba Lò) → Huy hiệu Gốm Đỏ, 6 điểm bảo tồn ven kênh, danh tiếng, hộ chiếu. Cổng tới Trà Vinh có sẵn, đang khóa. `scripts/gen-conservation.ts` giờ giữ nguyên điểm bảo tồn của tỉnh cũ (`--all` để sinh lại).
- **Dimension có cảnh trí riêng, dân làng kể tin đồn**: tinh thể, hoa, lau sậy, đá tro, cột trắng, thông tuyết… theo từng dimension / bí cảnh (không chặn đường, không vào arena). Khi đang làm nhiệm vụ huyền thoại, NPC trên bản đồ có lối vào ẩn sẽ kể khu vực có tảng đá / bụi cây lấp lánh hay dấu vết lạ — không bao giờ chỉ đúng chỗ.
- **Nhiệm vụ huyền thoại chỉ đường theo đền ẩn**: dòng mục tiêu và đánh dấu đổi theo bước — manh mối cần điều tra tiếp, một vòng tròn quanh khu vực có chướng ngại giấu lối vào (không lộ đúng chỗ), rồi lối vào, rồi ngôi đền khi đã ở trong dimension. Nhiệm vụ Articuno / Zapdos / Moltres / Mewtwo / Mew không còn chỉ tới vị trí cũ. Nhiệm vụ đang theo dõi không còn bị đổi khi sang bản đồ khác.
- **Đền huyền thoại giờ là bí mật** (LEGENDARY_SHRINES.md mục 8): bản đồ thường không còn đền nào. 10 huyền thoại Tầng 1 (Mewtwo, Ho-Oh, Lugia, Kyogre, Groudon, Rayquaza, Giratina, Dialga, Palkia, Arceus) ở trong **dimension riêng** — Khe Nứt Tâm Linh, Thiên Đài Cầu Vồng, Biển Xoáy Bạc (luôn có bão), Lõi Dung Nham (luôn nắng nóng), Tầng Trời, Thế Giới Đảo Ngược, Vực Nguyên Hải, Thần Điện Khởi Nguyên. Các đền khác ở **Bí Cảnh** của từng bản đồ, mỗi đền một khoang kín. Trên bản đồ chỉ có 28 **lối vào ẩn**: sau bụi rậm (Cắt cây), sau tảng đá nứt (Đập đá) hoặc chỉ hiện khi điều tra đủ 3 manh mối; lối vào của Lugia và Kyogre là xoáy nước chỉ mở khi trời mưa. Tìm thấy rồi thì nhớ mãi; cổng trong bí cảnh đưa về ngay cạnh lối vào.
- **Menu chính: nút "✨ Có gì mới" ở góc phải trên** (`data/whatsnew.json`, `src/core/whatsNew.ts`): danh sách cập nhật mới nhất cho người chơi, cuộn bằng chuột / kéo; chấm đỏ đếm số mục chưa đọc trên máy này, đọc xong thì mất. Điện thoại dọc: nút biểu tượng ✨, tiêu đề game thu gọn để không bị đè. Khi phát hành tính năng mới, thêm một mục ở đầu `whatsnew.json`.
- **Đền huyền thoại bước 2–6** (LEGENDARY_SHRINES.md):
  - Đi vào đền không còn tự gọi huyền thoại: bấm E ở chỗ làm lễ → nghi lễ (chạm cột theo lượt, giẫm tấm nén, đứng yên, trụ qua các đợt, câu đố, năng lực khám phá, thánh vật) → chuyển cảnh → trận trong arena niêm phong. E lần nữa để rời trận. Nghi lễ đã làm được nhớ, đánh lại chỉ cần E.
  - 16 thánh vật (Lông Băng / Sấm / Lửa, Lông Bạc, Lông Cầu Vồng, Ngọc Lam / Đỏ / Lục, Đá Dung Nham, Lông Trăng, Chén Sương, 3 Lõi Regi, Ngọc Bạch Kim, Sáo Thiên Giới), nhận khi hạ boss / điều tra xong.
  - Thú huyền thoại, Latias / Latios, Mesprit chỉ lang thang sau khi đánh thức ở điểm kích hoạt; Cresselia có đền Hồ Trăng; 6 đền mới; Trứng Manaphy ở Rạn Ấu Hải.
  - 2 bản đồ đền: Vực Nguyên Hải (Kyogre, vào từ Xoáy Nước Sâu khi mưa) và Thần Điện Khởi Nguyên (Dialga, Palkia, Arceus).
  - Hiểm họa trong arena theo từng đền (sét, thủy triều, vòng lửa, khe nứt…), có cảnh báo trước; 14 ô pixel mới cho đền.
- **Giao diện điện thoại: nút không đè nhau, chữ không tràn khung** (dọc 390×844 và ngang 844×390):
  - Menu chính: 4 nút cuối (Cài đặt, Chơi online, Nâng cấp, Thế giới online) xếp lưới 2 × 2 khi màn hình dọc thay vì 4 nút chen một hàng đè lên nhau và tràn khỏi màn hình; mô tả Việt Nam Odyssey nằm gọn trong thẻ; bỏ dòng gợi ý bàn phím trên điện thoại dọc.
  - Chọn Pokémon khởi đầu: nút "Bắt đầu" không còn tràn khỏi mép phải.
  - HUD Phiêu lưu: dòng HP và dòng "★ ngoài bóng / trong bóng" của bảng đội nằm trong khung.
  - Bản đồ: danh sách vùng xếp theo chiều cao thật của từng dòng (gợi ý dài 3 dòng từng đè lên tên vùng kế tiếp), tối đa 2 dòng rồi cắt "…"; dòng thống kê tự xuống dòng.
  - Chi tiết Pokémon: dòng EXP / nhóm tăng trưởng không tràn khung.
  - Thẻ lên cấp (Sinh tồn): tiêu đề có nền riêng, không còn chồng lên đồng hồ HUD.
  - Mọi nút trong game: chữ dài hơn nút thì tự thu nhỏ, vẫn dài thì cắt "…" (`fitText` / `fitWidth` trong `scenes/ui.ts`).
- **Sửa: Mega Tiến Hóa không đổi dạng trên bảng đội** — Pokémon trên sân đã đổi sprite / hệ / chỉ số sang dạng Mega, nhưng bảng đội góc trái vẫn hiện tên và icon dạng gốc (bảng đọc loài từ save thay vì từ Pokémon đang ở ngoài). Giờ bảng đội hiện dạng hiện tại (Mega Charizard X…) và trở lại dạng gốc khi hết Mega; save vẫn giữ loài gốc. E2E Mega kiểm tra thêm sprite trên sân và bảng đội.
- **Đền huyền thoại, bước 1 — đền thiết kế thay vòng 12 trụ** (`src/core/shrines.ts`, `data/world/shrines.json` sinh bằng `scripts/gen-shrines.py`; xem `LEGENDARY_SHRINES.md` mục 7): 22 huyền thoại trên mặt đất giờ đứng giữa một ngôi đền dựng theo sơ đồ riêng — vách đá, hồ / biển / hào dung nham, sân lát theo chủ đề với vòng rune, trụ, tượng, pha lê hoặc lư lửa, lõi triệu hồi, bậc lối vào. Đền được dời về bản đồ đúng chất (Rayquaza lên Núi Tuyết, Ho-Oh và Celebi vào Rừng Lục Bảo, Zapdos ra vách biển, Moltres vào núi lửa, Mewtwo / Mew ở lại Thung Lũng, Uxie và Regigigas về Thánh Địa, Regirock / Registeel ra biển / đầm lầy). Vùng đánh = sân của đền (bán kính tiếp cận theo arena). Địa hình mới *tường đền* chặn người và đạn. Manh mối điều tra dời theo đền. Save cũ: tiến độ giữ nguyên theo id; người chơi lưu game đúng chỗ giờ là tường được đặt sang ô trống gần nhất.
- **Huấn luyện viên đánh có chiến thuật** (Phiêu lưu và Việt Nam Odyssey dùng chung): chỉ 2 Pokémon ra sân cùng lúc, số còn lại chờ dự bị. Khi một Pokémon gục, HLV gửi Pokémon dự bị **hợp hệ nhất** với Pokémon của bạn. Pokémon bị yếu hệ và còn dưới 50% HP được **gọi về** đổi lấy Pokémon kháng hệ (không bao giờ đổi sang một Pokémon cũng yếu hệ); máu được giữ khi gọi về / ra lại. HLV có 1–2 Potion, dùng khi Pokémon dưới 30% HP. Thông báo trên màn hình cho mỗi lần gửi ra, gọi về, dùng thuốc.
- **Tái đấu**: thắng xong 10 phút chơi thì HLV mời tái đấu. Cấp đội theo Pokémon mạnh nhất của bạn (tối đa +15 so với đội gốc, +2 mỗi lần thắng tái đấu, không quá 100). Thắng tái đấu chỉ nhận tiền (300 → 800) và +2 danh tiếng — vật phẩm lần thắng đầu không bao giờ trả lại lần hai. Lưu trong save (`rematch`).
- **Danh tiếng theo từng tỉnh / vùng** (`repBy` trong save của từng chiến dịch — Phiêu lưu và Việt Nam Odyssey không dùng chung điểm): 4 hạng *Người lạ → Quen mặt (15) → Được tin cậy (40) → Người nhà (80)*. Lên hạng nhận quà một lần (cờ `rep:<vùng>:<hạng>`, không nhận lại khi tải lại save). NPC ở Cà Mau, An Giang, Cần Thơ chào theo hạng danh tiếng. Bảng Thống kê hiện hạng của vùng đang đứng.
- **3 nhiệm vụ mở bằng danh tiếng "Được tin cậy"**: *Tuần tra rừng tràm U Minh* (Kiểm lâm U Minh, Cà Mau), *Lời nhờ của Sư cô Núi Cấm* (An Giang), *Mối hàng chợ nổi* (giao trái cây từ vườn Chú Tám cho Chủ ghe Tư Hiền, Cần Thơ).
- Sửa trong lúc làm: trận HLV có thể kết thúc ngay khi Pokémon dự bị cuối cùng vừa được gửi ra (bắt được bằng e2e trước khi phát hành).
- **Năng lực khám phá** (`src/core/field.ts`, `data/world/field-abilities.json`): *Cắt cây* (Pokémon hệ Cỏ / Bọ / Thép Lv 8+), *Đập đá* (Giác Đấu / Đá / Đất Lv 14+), *Đẩy đá* (Giác Đấu / Đất / Thép Lv 18+) — bất kỳ Pokémon nào trong đội đủ điều kiện đều làm được, game báo tên Pokémon. Thiếu điều kiện thì hiện gợi ý cần hệ / cấp nào.
- **3 hốc bí mật ở Thung Lũng**: khoảng rừng sau bụi cây rậm (Rìa Rừng Ngọc), túi đá sau tảng đá nứt (Đồi Đá Xám), vòng đá ở Đồng Cỏ Gió mở bằng cách đẩy tảng đá lấp ổ. Mỗi hốc có một rương riêng, chỉ mở được sau khi dọn chướng ngại. Bảng gỗ giải thích ở lối vào khoảng rừng. Đã dọn thì giữ nguyên sau khi tải lại.
- **Đi ghe trên sông Hậu (Cần Thơ)**: 5 bến ghe (Ninh Kiều, Cồn Sơn, Bãi Bồi giữa sông, Cái Răng, Phong Điền). Trên ghe chỉ đi được trên nước, lên bờ ở bến. **Dòng nước đẩy ghe xuôi** theo hướng sông, mạnh nhất lúc **nước ròng**, yếu lúc **nước lớn** (2 con nước mỗi ngày theo giờ trong game); HUD hiện trạng thái con nước. Lưu game giữa sông → tải lại vẫn ở trên ghe. Cửa sông Hậu giờ thông ra vùng nước Cồn Sơn (cờ dữ liệu `mouth` của sông; các bản đồ khác không đổi).
- **Bãi Bồi giữa sông** (giả tưởng): đảo nhỏ có rương, chỉ đến được bằng ghe.
- **Chợ nổi Cái Răng** (`src/core/floatingMarket.ts`, `data/vietnam/floating-market.json`): từ 5:00 đến 9:00 giờ trong game, 4 ghe hàng (trái cây, thuốc, đồ nghề sông nước, miệt vườn Phong Điền) đậu dọc bờ, mỗi ghe treo cây bẹo cho biết bán gì. Mua từ bờ hoặc từ ghe. Hàng **có hạn theo từng phiên chợ** (mỗi ngày trong game một phiên, lưu trong save), giá không cao hơn Poké Mart và không bán ngược lại được → không có vòng lặp kiếm tiền. Danh tiếng Cần Thơ "Được tin cậy" được bớt 10%. Nhiệm vụ *Phiên chợ sớm*. Game đếm ngày trong game (`day` trong save).
- **Bến xuồng ở Cà Mau và An Giang**: Đất Mũi ↔ U Minh Hạ (ngược kênh), thị trấn Bảy Núi ↔ Đồng Nước Nổi. Nhận xuồng sớm ở Cà Mau với nhiệm vụ *Chiếc xuồng ba lá* (Ngư dân Út Mũi), rồi *Ngược kênh vào U Minh*.
- **Sinh thái: đàn, lãnh thổ, điều kiện hiếm** (`src/core/ecologyRules.ts`, `data/world/ecology-rules.json`; Phiêu lưu và Việt Nam Odyssey):
  - **Đàn**: 14 loài (Poochyena, Mareep, Doduo, Zubat, Spearow, Starly, Combee, Mankey, Houndour, Murkrow, Wingull, Lotad, Ducklett, Sentret) xuất hiện theo nhóm 2–4 con, có **con đầu đàn** — dạng tiến hóa (Mightyena, Flaaffy, Vespiquen…) chỉ khi cấp của đàn đủ gần cấp tiến hóa, nếu không thì là con mạnh nhất cùng loài. Cả đàn đi theo con đầu đàn. Đánh một con → cả đàn xông vào (loài nhút nhát thì tản ra, riêng con đầu đàn vẫn đánh). Con đầu đàn gục → các con không hung hăng bỏ chạy. Đàn không bao giờ vượt giới hạn số Pokémon hoang dã.
  - **Lãnh thổ**: 12 loài (Tauros, Heracross, Pinsir, Scyther, Kangaskhan, Gligar, Skarmory, Gible, Seviper, Zangoose, Teddiursa, Phanpy) giữ một vùng quanh chỗ ở. Bước vào là chúng **cảnh báo** (vòng đỏ hiện trên mặt đất, 1,3 giây), còn đứng trong vùng thì **lao vào đánh**; rời vùng đủ xa thì chúng thôi đuổi và quay về.
  - **Điều kiện hiếm**: 8 loài chỉ hiện khi đủ điều kiện sinh cảnh / vùng / giờ / thời tiết — Absol (đêm giông trên vùng đá), Misdreavus (đêm sương mù), Chatot (rạng sáng trời quang), Tropius (rừng ngày mưa), Relicanth (mặt nước lúc tờ mờ sáng), và 3 điều kiện Việt Nam: Seviper rừng U Minh (đêm mưa / sương, Cà Mau), Sableye Bảy Núi (về khuya, An Giang), Zangoose đồng ruộng Cần Thơ (ngày nắng). Khi xuất hiện, game báo kèm lời gợi ý (không lộ vị trí) và ghi nhớ vào save (`ecoSeen`).
- **Hầm ngục 2.0** (`src/core/dungeonMods.ts`, `data/world/dungeon-mods.json`; cả 4 hầm ngục):
  - **Biến thể theo ngày**: mỗi hầm, mỗi độ khó có 1–2 biến thể mỗi ngày trong game (Thường 1, Khó 1–2, Chuyên gia 2; cùng ngày luôn giống nhau, ra vào lại không đổi): *Hang tối* (+25% EXP), *Bầy đàn* (+2 kẻ địch mỗi đợt, +20%), *Địa chấn* (đá rơi dày gần gấp đôi, +15%), *Tinh anh* (thêm 1 tinh anh mỗi đợt, +25%), *Bẫy ngầm* (+5 bẫy, +15%), *Mạch quặng* (rương thêm kẹo EXP + Dusk Ball). Cửa hang cho xem trước biến thể hôm nay của cả 3 độ khó; HUD trong hầm hiện tên biến thể; rương cuối trả EXP / EXP thế giới theo hệ số (danh tiếng không đổi).
  - **Flash** (năng lực khám phá mới): hang *Hang tối* gần như tối đen, chỉ có vòng sáng quanh người chơi — trừ khi trong đội có Pokémon hệ Điện, Lửa hoặc Tiên Lv 10+ (game báo "X dùng Flash! Cả hang sáng lên.").
  - **Bẫy sàn**: 2 / 4 / 6 bẫy (theo độ khó) trong phòng đánh và phòng câu đố, chỉ có vết nứt mờ trên sàn. Giẫm lên → tiếng "cạch", nửa giây sau đá / băng / lửa (theo hệ của hầm) rơi đúng chỗ đó. Mỗi bẫy kích hoạt một lần.
  - **Phòng bí mật**: cạnh phòng câu đố có một vách đá nứt; Pokémon dùng được *Đập đá* (Lv 14+) phá vách, bên trong có rương bí mật (Thường: Great Ball + Oran Berry; Khó / Chuyên gia: Ultra Ball, Super Potion, kẹo EXP), mỗi lượt vào hầm mở được một lần.
- **Điều tra huyền thoại** (`src/core/legendClues.ts`, `data/world/legend-clues.json`, sinh bằng `scripts/gen-legend-clues.ts`): 13 huyền thoại (Lugia, Kyogre, Groudon, Rayquaza, Regice, Regirock, Registeel, Heatran, Giratina, Darkrai, Raikou, Entei, Suicune) mỗi con có 3 manh mối — ánh sáng mờ trên mặt đất, bấm E đọc dấu vết (lông vũ, vết cháy, bia khắc…). Manh mối chỉ hiện khi huyền thoại đã mở khóa theo cốt truyện và chưa bị bắt. Đủ 3 manh mối → biết chính xác điều kiện xuất hiện (giờ / thời tiết / độ thân thiết), +5 danh tiếng, **thêm 1 lượt ném** trong cửa sổ thu phục. Pokédex hiện "Điều tra: n/3" hoặc điều kiện đã biết. Lưu dưới dạng cờ trong save của từng chiến dịch. Trạng thái WEAKENED, cửa sổ thu phục và việc không thể thử lại bằng tải save giữ nguyên như trước.
- **Nhật ký & bản đồ** (`src/core/journal.ts`): Nhật ký nhiệm vụ có bộ lọc *Tất cả / Vùng này / Đã xong / Danh tiếng*. "Vùng này" chỉ hiện nhiệm vụ của bản đồ đang đứng (theo người giao hoặc điểm đánh dấu). **Bảng danh tiếng** riêng cho từng chiến dịch: mỗi tỉnh / vùng có hạng, điểm, thanh tiến độ, số điểm còn thiếu và quà của hạng tiếp theo. Bản đồ (đã có sương mù theo vùng đã khám phá) thêm biểu tượng bến ghe ⚓ và chướng ngại khám phá chưa dọn.
- **Bảo tồn & hậu truyện từng tỉnh** (`src/core/conservation.ts`, `data/vietnam/conservation.json` sinh bằng `scripts/gen-conservation.ts`, nhiệm vụ bằng `scripts/patch-v22-eco.py`): sau khi hạ Seviper / Claydol / Whiscash, mỗi tỉnh mở 6 điểm phục hồi ven nước — *Trồng lại rừng đước* (Cà Mau, cây con mọc lại trên bản đồ và giữ nguyên sau khi tải lại), *Gỡ lưới bỏ hoang* (Đồng Nước Nổi, An Giang), *Dòng Hậu trong xanh* (vớt rác bờ sông Hậu, Cần Thơ). Mỗi tỉnh có **sức khỏe sinh thái** 0–100 (15 mỗi điểm + 10 khi đã hạ boss tỉnh): *Suy thoái → Hồi phục (40) → Trù phú (80)*. Sinh thái càng tốt thì Pokémon hiếm theo điều kiện càng hay ghé (tối đa ×2). Đạt Trù phú được quà một lần. Bảng Danh tiếng hiện sinh thái từng tỉnh. Mỗi điểm phục hồi +2 danh tiếng tỉnh.
- **Sự kiện vùng miền** (`src/core/regionalEvents.ts`, `data/world/regional-events.json`): sự kiện thế giới có "phiên bản địa phương" — khi một sự kiện nổ ra ở vùng có phiên bản riêng thì 70% là phiên bản đó, với tên, lời báo, loài / thời tiết / hàng hóa và quà thêm riêng: *Mùa cá linh về* (Đồng Nước Nổi, An Giang — bầy Buizel / Wooper / Lotad, +3 Net Ball), *Nước nổi tràn đồng* (An Giang, mưa dầm), *Triều cường* (Cà Mau), *Cò về vườn* (Cần Thơ / rừng đước — đàn chim nước di cư), *Lễ hội trái cây miệt vườn* (Phong Điền / Cái Răng — sạp riêng bán Sitrus Berry, Leaf Stone, Miracle Seed, Exp. Candy S giá lễ hội), *Đêm đom đóm* (Thung lũng khởi đầu / Rừng Ngọc Bích — Volbeat & Illumise, +2 Dusk Ball). Thiếu loài / hàng hợp lệ thì quay về sự kiện thường.
- **Nhiệm vụ phân nhánh** (`src/core/quests.ts`, nội dung bằng `scripts/patch-v22-branch.py`): mục tiêu mới `choose` — NPC hỏi, người chơi chọn một hướng (hoặc "Để tôi suy nghĩ thêm"). Lựa chọn lưu trong save, đặt cờ `choice:<nhiệm vụ>:<hướng>`, chỉ các mục tiêu của hướng đó còn hiệu lực, phần thưởng và lời kết theo hướng. Mỗi tỉnh một ngã rẽ: *Bẫy trong rừng U Minh* (Cà Mau — báo kiểm lâm hay tự khuyên Út Mũi), *Mùa nước nổi: lưới dày hay câu vừa đủ* (An Giang), *Hai ghe một bến* (Cần Thơ — 3 cách phân xử). Mỗi hướng mở nhiệm vụ nối tiếp riêng (Tuần tra rừng tràm / Nghề mới cho Út Mũi, Đồng vắng cá / Cá linh về năm sau, Chuyến hàng sớm của Tư Hiền / Mùa trái chín của Chú Tám); hướng kia khóa vĩnh viễn. Nhật ký hiện lựa chọn đã chọn và chỉ mục tiêu của hướng đó.
- **Chiến đấu & bạn đồng hành** (`src/core/world.ts`, `synergy.ts`, `AdventureScene.ts`; chỉ Adventure / Hành trình Việt Nam, không áp dụng PvP; Survivor giữ nguyên): *combo nguyên tố* giờ có trong Adventure (Hơi Nước, Vỡ Băng, Quá Tải, Cháy Lan, Kịch Độc…) nhưng giới hạn 6 giây mỗi mục tiêu (Survivor 2 giây), không có cộng hưởng đội; *AI theo tình huống*: Pokémon (trừ tank) dưới 30% HP lùi về đánh từ cạnh HLV, khi HLV dưới 50% HP thì tank / fighter ưu tiên kẻ đang đánh HLV; *tương tác vật thể*: khi yên bình, một Pokémon trong đội tự chạy tới bụi quả chín gần HLV (≤ 260px) và hái giúp (cùng bảng vật phẩm và thời gian hồi như hái tay; có thể làm một Pokémon hoang dã nhảy ra), bị gọi về khi có giao chiến / hội thoại / đi ghe / câu cá.
- **Hiệu năng** (`src/core/wildAI.ts`): kiểm tra hiện trạng cho thấy đã có chunk streaming, culling sprite ngoài màn hình, pool icon / nhãn, despawn Pokémon xa và LOD cho AI hoang dã (2,5 lần/giây khi xa > 1000px). Chỗ còn lãng phí: LOD vẫn quét mối đe dọa (`friendlyUnits()` tạo mảng mới) **mỗi frame** cho mọi Pokémon xa trước khi kiểm tra. Giờ giữa hai tick LOD không chạy gì cả: 200 Pokémon xa trong 2 giây quét 24 000 → < 1 500 lần. Không thêm hệ thống LOD thứ hai (bản nháp ở `world.ts` đã gỡ vì trùng). Test rò rỉ bộ nhớ mới: chuyển vùng 9 lần — listener của game / bàn phím / scale, timer, tween và số object không tăng.
- **Thiết kế bản đồ — Cần Thơ làm vùng mẫu** (`src/core/map/valley.ts`, `mapProvider.ts`, `gathering.ts`, dữ liệu bằng `scripts/patch-v22-cantho.py`): kiểm tra cho thấy *Miệt vườn Phong Điền* chỉ là bãi cỏ trống — habitat `farm` chỉ vẽ luống rau ở toạ độ cứng của Thung Lũng. Giờ khu vực có thể khai báo `orchard` (dữ liệu): liếp cây ăn trái / dừa so le, luống đất, mương nước mỗi 7 hàng với cầu ván mỗi 14 ô; NPC / rương / điểm thu thập luôn được chừa đất. Thêm 5 bụi trái cây miệt vườn (bảng `orchard-forage`: Cherubi, Combee, Bounsweet, Applin, Tropius…), 3 điểm câu trên mương (`canal-fish`: Barboach — tiền tiến hóa của Whiscash chúa sông Hậu, Wooper, Corphish, Basculin…), nhiệm vụ *Cần câu tre của Ông Sáu*, 2 hốc bí mật (chặt bụi ở miệt vườn, đập đá ở vườn cò) có rương. Điểm câu bên sông / mương đặt phao trên ô nước gần nhất (hồ giữ như cũ); bảng thu thập có `lockedText` riêng thay vì lời nhắc cứng của Thung Lũng.
- **Thiết kế bản đồ — An Giang & Cà Mau theo mẫu Cần Thơ** (`valley.ts`, `mapProvider.ts`, dữ liệu bằng `scripts/patch-v22-angiang-camau.py`): *Đồng Nước Nổi* (An Giang) trước là bãi cỏ trống, giờ là **ruộng mùa nước nổi** — khu vực khai báo `paddy` (dữ liệu): các ô ruộng ngập nước 5×5 ngăn bằng bờ đê đi bộ được, khoảng 30% ô là lúa đứng (cỏ cao, có Pokémon), vài cây thốt nốt; NPC / rương / điểm thu thập luôn có đất. An Giang thêm 3 điểm câu trên ruộng ngập (`paddy-fish`: Barboach, Goldeen, Poliwag, Buizel…), 3 khóm bông điên điển trên bờ đê (`flood-forage`), 2 bọng ong rừng tràm Trà Sư (`melaleuca-honey`), hốc bí mật sau bụi rậm ở Trà Sư và sau tảng đá nứt ở Thất Sơn, nhiệm vụ *Mùa nước nổi của Cô Sáu* (hái bông / lấy mật + câu một mẻ). Cà Mau thêm 3 bãi ốc len trên bãi bùn rừng đước (`mangrove-forage`), 3 điểm câu trên lạch (`mangrove-fish`: Magikarp, Tentacool, Krabby, Remoraid, Finneon, Skrelp), 2 bọng ong ở U Minh, 2 hốc bí mật (rễ đước, bụi tràm U Minh), nhiệm vụ *Cần câu của Ngư dân Tư Sáu* — cần câu giờ lấy được ngay ở tỉnh đầu tiên (trước chỉ có ở Cần Thơ).
- Sửa: hai rương Cà Mau trùng id `chest-cm-mangrove` (mở một cái thì cái kia cũng tính là đã mở) → rương phía tây thành `chest-cm-mangrove-west`. Save cũ đứng ở chỗ nay là nước (ruộng ngập) được đặt sang ô trống gần nhất khi tải (trừ khi đang ngồi ghe). Dời 1 biển chỉ đường, 3 điểm bảo tồn An Giang và điểm đến cổng Cần Thơ → An Giang lên bờ đê.
- Sửa trong lúc làm: sự kiện bùng phát / di cư có thể sinh 0 Pokémon khi mọi vị trí quanh tâm là nước (Đồng Nước Nổi) — giờ thử thêm vị trí gần / xa / lệch góc.
- Sửa trong lúc làm: Pokémon dưới nước có thể sinh nhiều con trong cùng một nhịp (vượt giới hạn tổng); giờ mỗi nhịp chỉ sinh một con, kể cả dưới nước.
- Nhiệm vụ: *Chiếc ghe của cô lái đò* (xin dầu chai ở chợ nổi → nhận ghe, cờ `vehicle:ghe`), *Xuôi dòng Hậu giang* (cập Bãi Bồi, xuôi xuống Cái Răng).
- Dữ liệu mới: `src/data/world/reputation.json`, `src/data/world/field-abilities.json`, trường `field` / `docks` của vùng, `boulders` / `boat` trong save. Lõi mới: `src/core/trainerAI.ts`, `src/core/reputation.ts`, `src/core/field.ts`. Script: `scripts/patch-v22-field.py`.
- Test: `tests/v22_trainer_rep.test.ts` (11), `tests/v22_field_boat.test.ts` (10), `tests/v22_ecology.test.ts` (10), `tests/v22_dungeon2.test.ts` (8), `tests/v22_legend_clues.test.ts` (4), `tests/v22_journal.test.ts` (4), `tests/v22_conservation.test.ts` (4), `tests/v22_regional_events.test.ts` (4), `tests/v22_branching.test.ts` (4), `tests/v22_combat.test.ts` (5), `tests/v22_perf.test.ts` (3), `tests/v22_map_cantho.test.ts` (6), `e2e/v22_trainer_rep.spec.ts`, `e2e/v22_field_boat.spec.ts`, `e2e/v22_ecology.spec.ts`, `e2e/v22_dungeon2.spec.ts`, `e2e/v22_legend_clues.spec.ts`, `e2e/v22_journal.spec.ts`, `e2e/v22_conservation.spec.ts`, `e2e/v22_regional_events.spec.ts`, `e2e/v22_branching.spec.ts`, `e2e/v22_combat.spec.ts`, `e2e/v22_perf.spec.ts`, `e2e/v22_map_cantho.spec.ts`.

## Chưa phát hành — V21: Kỹ năng chủ động online, câu cá & hái lượm, Rừng Ngọc Lục Bảo, sprite Mega

- **Kỹ năng chủ động cho PvP và khách co-op**: cùng thanh 4 ô + phím **Q** / **T** như Phiêu lưu (chuột phải / nhấn giữ = giữ chiêu). Chủ phòng vẫn là bên quyết định: khách gửi lệnh (`act` skill / reserve trong PvP, `coopSkill` / `coopReserve` trong co-op), chủ phòng chạy cùng luật (hồi chiêu, năng lượng, hồi chiêu chung 1,2 s) và gửi lại lý do khi chiêu không ra (`skillRes`); snapshot mang hồi chiêu thật, ô đang giữ, chiêu đang chờ và hồi chiêu chung của khách. Tin nhắn đều tùy chọn — bản cũ bỏ qua, không đổi phiên bản giao thức. Thanh kỹ năng tách thành thành phần dùng chung `src/ui/SkillBar.ts`.
- **Giữ chiêu được lưu vào save** (theo mã chiêu trên từng Pokémon, `keptSkills`): còn sau khi tải lại, học chiêu mới hay tiến hóa.
- **Câu cá ở Hồ Pha Lê**: 4 chỗ câu có gợn sóng quanh hồ. Bấm E thả câu → chờ phao chìm và dấu "!" → bấm lại trong 0,9 s. Giật sớm / chậm thì cá chạy (không mất lượt); câu được vật phẩm hoặc Pokémon hệ Nước (ở lại dưới nước, đánh và bắt như thường). Mỗi chỗ cần 60 s thời gian chơi để cá quay lại. Cần câu: nhiệm vụ của **Ông Sáu** ở bờ tây hồ.
- **Bụi quả mọng ở Đồng Cỏ Gió**: 5 bụi, hái ra quả mọng / thuốc / bóng / kẹo EXP, đôi khi một Pokémon nhảy ra. Bụi ra quả lại sau 4 phút chơi.
- Nhiệm vụ mới: *Cần câu của Ông Sáu* (hái 3 bụi làm mồi → nhận cần câu), *Mẻ cá đầu tiên* (câu thành công 3 lần), *Tuần tra Rừng Ngọc Lục Bảo*.
- **Rừng Ngọc Lục Bảo — bản đồ riêng** (96×84, Lv12–19): Đường Mòn Ngọc, Lõi Rừng Ngọc, Suối Lục Bảo (hồ + suối có cầu), Chòi Kiểm Lâm, 2 NPC, 3 HLV, 3 rương, 2 trạm dịch chuyển, bụi quả rừng và chỗ câu cá riêng. Vào bằng **Cổng Rừng Ngọc Lục Bảo** ở cuối đường mòn Rìa Rừng Ngọc, mở bằng cờ `region:emerald-forest` (sau Hang Đá Cổ). Rìa Rừng Ngọc trong Thung Lũng giữ nguyên (nhiệm vụ, huyền thoại lang thang không đổi).
- **Sửa: Mega Tiến Hóa thiếu hình riêng** — trước đây mọi dạng Mega vẽ bằng sprite của loài gốc. Giờ 30/50 dạng Mega có hoạt ảnh PMD riêng (lấy từ PMDCollab SpriteCollab bằng `scripts/fetch-pmd-megas.py`); 20 dạng SpriteCollab chưa vẽ dùng ảnh chính thức của chính dạng Mega đó, chỉ khi không có gói ảnh mới quay về loài gốc.
- **Máy chủ relay** (`pokemon-server`): bộ đệm khi một bên rớt mạng giờ bỏ snapshot / input / ping cũ trước, giữ tin một lần (phần thưởng, vào phòng, kết thúc) — cùng cách với client.
- Hệ thống dữ liệu mới: `src/data/world/gathering.json` (bảng câu cá / hái lượm), trường `nodes` của vùng, `AdventureSave.nodes` (hồi điểm theo thời gian chơi). Script: `scripts/patch-valley-gathering.mjs`, `scripts/build-emerald-woods.mjs`.
- Test: `tests/v21_remote_skills.test.ts` (7), `tests/v21_gathering.test.ts` (9), `e2e/v21_world.spec.ts` (câu cá, hái quả, cổng rừng, Q trong PvP luyện tập), `e2e/v21_mega_sprites.spec.ts`.

## Chưa phát hành — V20: Kỹ năng chủ động, Trại Huấn Luyện, phần thưởng co-op tin cậy

- **Kỹ năng chủ động** (Phiêu lưu / Việt Nam Odyssey): **Q** = Pokémon đang điều khiển dùng chiêu tốt nhất ngay, click / chạm ô trên **thanh kỹ năng** mới = dùng đúng chiêu đó, chuột phải / nhấn giữ = giữ chiêu cho mình (AI không dùng), **T** = đổi Pokémon điều khiển. Cùng luật với AI (hồi chiêu, năng lượng, Choice / Assault Vest, miễn nhiễm) + hồi chiêu chung 1,2 s chống spam; ngoài tầm thì Pokémon tự đi tới đúng tầm (chờ tối đa 3 s). Thanh 4 ô có icon, thời gian hồi, năng lượng, trạng thái chờ / niệm / giữ; điện thoại dọc đặt ở góc trái dưới. Sinh tồn, PvP, khách co-op, Thế giới online không đổi.
- **Thung Lũng Khởi Nguyên**: tòa **Trung tâm Pokémon** (máy PC + y tá Chị Mai hồi phục cả đội), **bảng nhiệm vụ** làng (2 nhiệm vụ), 2 biển hướng dẫn ở cổng bắc, **dân làng đi lại** (ban ngày đi dạo, dừng khi bạn tới gần, đêm về chỗ — dữ liệu `wander`).
- **Trại Huấn Luyện** (khu mới phía tây làng): rào, 2 cổng nối đường làng và đường đồng cỏ, bia tập; Thầy Khang + 3 học viên (phòng thủ, tốc độ, hệ đặc biệt); chuỗi 3 nhiệm vụ *Phá phòng ngự → Né và rút → Tốt nghiệp*, tốt nghiệp mở rương trại.
- **Sửa: phần thưởng co-op có thể mất khi rớt mạng** — hàng đợi gửi 400 tin xóa tin cũ nhất nên snapshot đẩy mất `coopLoot`. Hàng đợi giờ bỏ snapshot / input / ping trước; `coopLoot` có id, khách xác nhận (`coopLootAck`), chủ phòng gửi lại tới khi được xác nhận, khách nhớ id đã nhận trong save (không cộng hai lần). Tương thích bản cũ, không đổi phiên bản giao thức.
- Công cụ: `scripts/map-ascii.ts` (xem bản đồ dạng ký tự), `scripts/patch-starter-valley.mjs` (bản vá nội dung, chạy lại không nhân đôi).
- Tài liệu: `GAME_AUDIT.md`, `MAP_DESIGN.md`, `GAMEPLAY_IMPROVEMENTS.md`, `TEST_REPORT.md`; cập nhật `GAME_DESIGN.md`, `TASKS.md`.
- Test: `tests/v20_active_skills.test.ts` (9), `tests/v20_starter_valley.test.ts` (6), `tests/v20_net_reliability.test.ts` (5), `e2e/v20_starter.spec.ts` (máy tính + điện thoại dọc).

## Chưa phát hành — Ba loại tiền theo chế độ

- **Mỗi chế độ một loại tiền**, không dùng chung nữa:
  - *Ngọc Sinh tồn* (ngọc): kiếm từ trận Sinh tồn và co-op Sinh tồn, chỉ dùng mua Nâng cấp vĩnh viễn.
  - *Xu Phiêu lưu* (xu): Phiêu lưu (Thung Lũng Khởi Nguyên) và Thế giới online — cửa hàng, thương nhân, phần thưởng sự kiện / boss / hầm ngục.
  - *Đồng Odyssey* (đồng): Việt Nam Odyssey.
- Co-op trả thưởng theo chế độ của chủ phòng (Sinh tồn → ngọc, Phiêu lưu → xu, VN → đồng), kể cả dòng thử thách "+250 ngọc/người".
- Menu hiện ngọc ở thẻ người chơi, thẻ Sinh tồn, màn Nâng cấp và danh sách ô lưu; HUD / túi đồ / cửa hàng Phiêu lưu hiện đúng đơn vị (xu hoặc đồng).
- **Lưu game v8**: không ai mất tiền — ví nào cũng bắt đầu bằng số xu chung cũ. Máy chủ online vẫn dùng trường `currency` như trước (không cần deploy lại).
- Test: `tests/v19_wallets.test.ts`; cập nhật e2e co-op theo từng chế độ.

## Chưa phát hành — Cửa hàng mới, đá Mega & sự kiện

- **Cửa hàng hoàn chỉnh** (Phiêu lưu, Chú Lâm): thay danh sách chọn bằng cửa sổ riêng chia 8 kệ theo chức năng — Bóng · Hồi phục · Kẹo EXP · Tiến hóa · Đá Mega · Chiến đấu · Tăng hệ · Huấn luyện. Mỗi món có ảnh, giá, số đang có; bảng chi tiết hiện mô tả, Pokémon dùng được ("Dùng cho: Onix → Steelix (cầm + Dây Liên Kết)"), dạng Mega và trạng thái Vòng Mega.
- **Mua nhiều cùng lúc**: chọn số lượng −/+ hoặc nhanh ×1 / ×5 / ×10 / Tối đa, thấy tổng tiền và tiền còn lại trước khi mua; mua trọn gói hoặc không mua (không trừ nửa chừng), tối đa 999 mỗi món. Phím: Enter mua, ←/→ đổi số lượng, PageUp/PageDown đổi trang, Esc đóng. Điện thoại: tab 2 hàng, danh sách trên – chi tiết dưới.
- **Đá tiến hóa mở rộng**: Ice / Sun / Shiny / Dusk / Dawn Stone, táo Tart / Sweet / Syrupy, ấm Cracked / Chipped, chén trà, Metal Alloy, Galarica Cuff / Wreath, Black Augurite, Peat Block, giáp Auspicious / Malicious, Scroll of Darkness / Waters; vật phẩm cầm tiến hóa Protector, Electirizer, Magmarizer, Up-Grade, Dubious Disc, Razor Claw / Fang, Prism Scale, Reaper Cloth, Deep Sea Tooth / Scale, Sachet, Whipped Dream, Oval Stone (kèm hiệu ứng khi cầm). Dawn Stone tiến hóa đúng Kirlia → Gallade, Snorunt → Froslass.
- **32 đá Mega mới** (Ampharos, Steelix, Scizor, Heracross, Houndoom, Tyranitar, Sceptile, Blaziken, Swampert, Gardevoir, Sableye, Mawile, Aggron, Medicham, Manectric, Sharpedo, Camerupt, Altaria, Banette, Absol, Glalie, Salamence, Metagross, Latias, Latios, Lopunny, Garchomp, Lucario, Abomasnow, Gallade, Audino, Diancie) và 32 dạng Mega tương ứng với chỉ số / hệ đúng PokéAPI. Dạng Mega chưa có sprite riêng dùng sprite của loài gốc.
- **Ảnh vật phẩm**: biểu tượng pixel mới cho táo, chén, giáp, cuộn giấy, đĩa, móng vuốt, vảy, quả mọng, lọ thuốc, kẹo EXP và mảnh sao.
- **Sự kiện mới**:
  - *Thương nhân lưu động* (nhỏ, 4 phút): dừng chân ở một vùng với 6 món hiếm giảm 30% (2 đá Mega, 2 vật phẩm tiến hóa, kẹo, bóng / đồ chiến đấu), mỗi món có hạn; bán hết → quà 2 Ultra Ball. Thời gian dừng khi đang mua.
  - *Mưa sao băng* (lớn, ~3 phút): 5 mảnh sao rơi quanh một vùng, nhặt bằng E; nhặt đủ → 1 đá tiến hóa ngẫu nhiên + 1500 xu, 30% thêm đá Mega; hết giờ → mỗi mảnh đã nhặt bán 250 xu. Clefairy, Minior, Lunatone, Solrock, Staryu… xuất hiện nhiều hơn.
- **Chữ trên máy tính rõ hơn**: canvas vẽ theo đúng tỉ lệ màn hình (Windows 125% / 150% → 1.25× / 1.5×, tối đa 2×, giới hạn ~4,2 triệu điểm ảnh) thay vì 1× rồi bị trình duyệt phóng to mờ; zoom thế giới chọn theo lưới pixel sau khi nhân tỉ lệ nên ô pixel vẫn đều. Chữ nút không còn bị giới hạn 28 px trên màn dày.
- Test: `tests/v18_shop.test.ts` (kệ hàng, mua số lượng, đá / Mega mới hợp lệ, hàng thương nhân), `e2e/v18_events.spec.ts` (thương nhân, mưa sao băng), e2e cửa hàng mới trong `e2e/evolution.spec.ts`.

## Chưa phát hành — Bản đồ, huyền thoại & giao diện điện thoại

- **Phân bố lại đền huyền thoại** (Phiêu lưu): Thung Lũng Khởi Nguyên không còn giữ 25 đền; 17 đền chuyển về vùng hợp chủ đề, tối đa 8 đền mỗi bản đồ.
  - Thung Lũng: Zapdos, Moltres, Mewtwo, Mew, Ho-Oh, Celebi, Jirachi, Shaymin.
  - Núi Tuyết: Articuno, Uxie, Regice, Regigigas · Vùng Đất Núi Lửa: Regirock, Groudon, Heatran · Đầm Lầy Sương Mù: Azelf, Darkrai, Giratina · Bờ Biển San Hô: Lugia, Kyogre, Rayquaza, Registeel · Thánh Địa: Arceus, Dialga, Palkia, Deoxys.
  - Gợi ý / nhiệm vụ huyền thoại ghi rõ bản đồ; huyền thoại lang thang (Raikou, Entei, Suicune, Latias/Latios, Mesprit, Cresselia) đi thêm các vùng chủ đề.
- **Bản đồ đầy đặn hơn**: mỗi vùng chủ đề có thêm NPC, huấn luyện viên, rương, biển chỉ đường, đạo cụ, đường đi và trạm dịch chuyển thứ hai; Thánh Địa có hiền giả, nhà thiên văn và Nhà vô địch; Cà Mau / An Giang / Cần Thơ mỗi tỉnh thêm NPC, 2 huấn luyện viên, đạo cụ, biển và rương. Thời tiết theo vùng (bão tuyết trên núi, nắng nóng ở núi lửa).
- Sửa: rương Hồ Băng nằm giữa sông, rương miệng núi lửa nằm trong dung nham, Chú làm vườn Cần Thơ đứng trên ô chặn.
- **Bảng tên**: Pokémon đối thủ hiện tên + cấp (α Alpha, ★ tinh anh, ✦ shiny); NPC và huấn luyện viên có tên dưới chân (⚔ cam = chưa đấu, ✓ xám = đã thắng).
- **Giao diện điện thoại**: canvas vẽ ở 2× trên điện thoại / máy tính bảng màn hình dày nên chữ nét thay vì bị phóng to mờ. Màn dọc: menu chiếm cả màn hình, tab 2 hàng, chữ lớn hơn, danh sách nằm trên – chi tiết nằm dưới (Đội hình, PC, Pokédex, Nhiệm vụ có phân trang), Túi đồ 1 cột, Bản đồ có thông tin bên dưới, Hộ chiếu 1 thẻ/trang; HUD dời đồng hồ và tên khu vực để không đè thanh HP.
- Test: `tests/v17_maps.test.ts` (phân bố đền, vật thể đứng trên nền đi được, đội hình huấn luyện viên hợp lệ).

## Chưa phát hành — Multiplayer qua Cloudflare

- **Sửa lỗi "Hết thời gian chờ — mạng chặn kết nối trực tiếp (WebRTC)"**: PeerJS chỉ có STUN, không có TURN, nên mạng 4G / công ty (NAT đối xứng) không nối được. Mọi chế độ online giờ mặc định đi qua máy chủ Cloudflare `wss://pokemon-server.pokemon-server.workers.dev` (Workers + Durable Objects, gói Free): PvP, co-op Sinh tồn / Phiêu lưu / Việt Nam Odyssey, thế giới mở chung + thách đấu, và Thế giới online (tài khoản).
- Phòng theo mã (mỗi mã một Durable Object, WebSocket Hibernation): giữ chỗ 60 s khi rớt mạng, tự kết nối lại bằng token, gửi bù tin nhắn bị lỡ; giao thức game giữ nguyên (relay chỉ chuyển tiếp, chủ phòng vẫn kiểm tra như trước).
- Thế giới online chạy cùng mã `server/world.ts` trên SQLite của Durable Object; máy chủ Node (`npm run server`) vẫn dùng được như cũ.
- Bảo vệ: chỉ nhận trang GitHub Pages + localhost, giới hạn mở kết nối theo IP, giới hạn kích thước / tần suất khung tin.
- `?net=peer` dùng lại WebRTC, `?net=local` (thử trong một trình duyệt), `?cloud=wss://…` chọn máy chủ khác. Gameplay, UI, save không đổi.
- **Sửa giao diện khách co-op**: người vào phòng trước đây chỉ thấy một khối chữ và nút *Rời co-op*. Giờ có HUD riêng (`CoopGuestUI`) giống chủ phòng: thanh HP huấn luyện viên, đội Pokémon (biểu tượng, HP, năng lượng), thẻ đồng đội + ping, bản đồ nhỏ, thử thách co-op, thanh boss, khung mục tiêu đang đánh, thanh lệnh đội (Tự do / Tấn công / Bảo vệ / Đi theo / Giữ / Rút, thêm *Chạy* trên cảm ứng), cần điều khiển ảo, màn chờ chủ phòng và thông báo khi phiên kết thúc. Tự co giãn theo màn dọc / ngang, chữ dài được rút gọn hoặc xuống dòng. Sửa thông báo "Chưa nhận được trận co-op" hiện ngay lập tức.
- **Thế giới online — giao diện mới**: thanh trên gọn (◀, tên · vùng · xu, ☰ Menu); HUD Alpha (HP) + sự kiện + bản đồ nhỏ (bạn, người khác, đồng đội, Alpha, máy PC, cổng); cụm nút lớn *Tấn công Alpha* (vòng hồi chiêu, mờ khi ngoài tầm) / *Tự đánh* / *Chỉ đường* và nút máy PC / cổng khi đứng gần; menu dạng ngăn kéo có tab Đội · Sự kiện · Bạn bè · Chat · Khác (ngăn trái trên máy tính và màn ngang, bảng trượt từ dưới trên màn dọc, đóng sẵn trên điện thoại); vài dòng chat mới nổi trên bản đồ; thông báo tự mờ sau 4 s. Chữ dài xuống dòng / rút gọn, không tràn khung; máy PC ở màn ngang thấp hiện đủ 5 hàng.
- **Thế giới online — đồ họa & gameplay**: nhân vật và Pokémon có hoạt ảnh đi / đứng, quay theo hướng, bóng đổ, bảng tên (vàng = bạn, xanh = cùng nhóm); Pokémon chạy theo sau thay vì đứng cố định; sửa Pokémon của người khác luôn hiện là Charmander. Alpha có hào quang, hoạt ảnh, thanh HP và vòng tầm đánh (xanh khi trong tầm); đòn đánh bắn quả cầu màu theo hệ, Alpha nháy trắng + rung, số sát thương lớn hơn khi ≥ 100, hiệu ứng khi hạ Alpha. Phím Space / F tấn công, M mở menu, Enter chat; *Tự đánh* tự tấn công khi Alpha trong tầm (theo hồi chiêu của máy chủ).
- **Giảm độ trễ co-op**: chủ phòng gửi snapshot dạng delta (chỉ trường thay đổi; keyframe mỗi 1 s), không gửi lại danh sách vật cản tĩnh khi khách đã có (`obsSig`), làm tròn số; snapshot / input / ping gửi ngay thay vì chờ gộp 50 ms. Dung lượng chủ phòng gửi lên: ~275 → ~31 kB/s (20 quái, đo qua relay). Khách dự đoán chuyển động của chính mình (phát lại input chưa được xác nhận, va tường như máy chủ) và nội suy có ngoại suy vận tốc cho người / quái khác. Chủ phòng vẫn quyết định mọi sát thương, phần thưởng, vị trí.
- Thống kê mạng: `?netstats` trên URL hiện ping p50 / p95 / jitter, % ping mất, RTT tới riêng máy chủ relay, input → host xác nhận, thời gian host giữ input, khoảng cách giữa 2 snapshot. Ping hiển thị = trung vị 5 lần đo gần nhất. Room relay trả lời echo `{"p"}`, chuyển tiếp nguyên khung không mã hóa lại, đặt phòng gần trạm Cloudflare của người tạo (châu Âu / Bắc Mỹ khi nhà mạng định tuyến qua đó). Giao thức game lên v3 (hai bên phải cùng bản).
- Test: `scripts/cloud-room-test.mjs` (19 kiểm tra relay), `e2e/relay_reconnect.spec.ts`; các e2e co-op/PvP/thế giới chung chạy được qua relay (`E2E_NET=cloud=…`), e2e Thế giới online chạy được với máy chủ thật (`SERVER_WS=…`).

## 0.14.0 — Sảnh Online, thử thách co-op & server tài khoản

- Sảnh **Chơi online** chung: tạo/vào phòng co-op Sinh tồn, Phiêu lưu, Việt Nam Odyssey; chọn ô lưu và Pokémon khởi đầu; truy cập PvP hoặc Thế giới online.
- Sáu thử thách co-op có mục tiêu riêng, đồng bộ tiến độ và đồng hồ, thưởng xu cho cả hai, không tiến triển lúc tạm dừng hoặc chưa có đồng đội. Sự kiện khám phá chia thêm chiến lợi phẩm cho khách.
- Server WebSocket/SQLite: tài khoản, lưu v7, một Pokémon hoạt động, PC, kẹo, chat, bạn bè, nhóm, Alpha chung. Giao diện desktop/mobile độc lập với save offline.
- Tám sự kiện server luân phiên: bảo vệ rừng tràm, bão Đất Mũi, di cư Alpha, giữ dòng sông, tiếp sức sấm sét, phòng tuyến thép, tuần tra đêm, tiếng gọi huyền thoại; mục tiêu theo sát thương/số đòn/số Alpha. Alpha hồi sinh trong sự kiện dùng loài tương ứng.
- Sửa lịch sự kiện và hồi sinh Alpha độc lập từng vùng; ghi đóng góp mỗi đòn, trao thưởng một lần và gửi dữ liệu túi mới về người chơi. Sửa vị trí đăng nhập, hiệu chỉnh di chuyển và phát lại thao tác cũ.
- **Một Pokémon ngoài sân do server giữ**: hồi chiêu đổi 1,5 s, trạng thái `summoning → active → recalling`, không tấn công khi đang gọi ra; đổi = thu hồi rồi gọi; người xung quanh thấy hoạt ảnh ném bóng / tia thu hồi (`petFx`).
- **EXP khi hạ Alpha** cho Pokémon đã đánh (×1,5), thưởng nhóm +10 %/đồng đội cũng đã đánh, tối đa +30 %; không vượt EXP Lv100.
- **Hộp thoại kẹo**: chọn loại, ×1/×5/×10/Max/tự nhập, xem EXP và cấp dự kiến, xác nhận; tiến hóa sau khi lên cấp (`pokemon.evolve`, server kiểm tra lại).
- **SỰ KIỆN SẮP DIỄN RA** 60 s trước mỗi chu kỳ 10 phút (độ khó, cấp gợi ý, phần thưởng, đếm ngược); bảng sự kiện riêng từng vùng (Cà Mau 8, An Giang 4, Cần Thơ 3), chọn theo trọng số, không lặp liền; theo dõi số người tham gia và đóng góp của chính mình.
- **Xã hội**: nhắn riêng `/w` giữa bạn bè, biểu cảm (vẫy/cổ vũ/ngồi/chỉ), menu khi chạm người chơi khác (kết bạn, mời nhóm, nhắn, chặn, báo cáo), từ chối lời mời, trao trưởng nhóm, giải tán, trưởng nhóm rời thì chuyển quyền, chống mời liên tục; bảng nhóm hiện Pokémon, HP, vùng, khoảng cách.
- **Kênh** (30 người/kênh/vùng) và **interest management**: chỉ nhận người chơi trong bán kính 1600 px cùng kênh; presence gửi delta thay vì cả danh sách; Alpha chỉ gửi 8 người đóng góp cao nhất. Load test 30 bot: 204 → 103 KB/s mỗi client.
- **Tự kết nối lại** bằng token khi rớt mạng (giữ thế giới đang mở); đăng nhập nơi khác đóng phiên cũ mà không tranh lại. Nội suy vị trí người chơi khác.
- `scripts/load-server.mjs` (10/20/30/50 bot, CPU/RAM/tick lag/băng thông/RTT/độ trễ giao dịch), `server/.env.example`, tài liệu kiến trúc + giao thức + triển khai trong ONLINE_SERVER.md. Giao thức server lên v2.
- Test mới: `tests/server_v7.test.ts` (10 test, nhiều client `ws` thật); e2e thế giới server thêm hộp thoại kẹo, hồi chiêu đổi, biểu cảm, nhóm, rớt mạng → tự kết nối lại.
- **Máy PC trong bản đồ online**: đứng trước cửa Trung tâm Pokémon / phòng thí nghiệm, bấm E. Hộp thoại PC kiểu GBA: 16 box × 30 ô, đổi box bằng nút / lăn chuột / `[` `]`, tìm, lọc (khóa / Shiny / hệ), sắp xếp, chi tiết (IV, EV, chiêu, tính cách, đặc tính, vật phẩm), rút / gửi, khóa ★, biệt danh, di chuyển ô / box, đổi tên box; điều khiển bằng phím. Server từ chối thao tác PC ở xa máy PC (`NOT_AT_PC`).
- **Ba vùng online + cổng**: An Giang và Cần Thơ bật mặc định, Alpha riêng từng vùng; đổi vùng chỉ khi đứng ở cổng (`travel`), cổng huy hiệu mở khi đội đạt Lv12 / Lv16; `enter` không còn dịch chuyển sang vùng khác.
- **Khôi phục tài khoản**: mã khôi phục một lần khi đăng ký (chỉ lưu bản băm), *Quên mật khẩu?* đặt lại mật khẩu + thu hồi mọi phiên + cấp mã mới; đổi mật khẩu, tạo mã mới, đăng xuất mọi thiết bị (migration `003_account_recovery.sql`).
- **Sửa lỗi không đăng nhập được Thế giới online ("Kết nối quá hạn")**: bản GitHub Pages trước đây mặc định nối tới `wss://<trang>.github.io:8787/ws` — không tồn tại. Giờ địa chỉ mặc định lấy từ `VITE_SERVER_URL` (biến `SERVER_URL` của repo) hoặc `ws://localhost:8787/ws`; bỏ địa chỉ hỏng đã lưu; cho phép `ws://localhost` từ trang HTTPS; thông báo lỗi ghi rõ địa chỉ và cách chạy máy chủ (`npm run server`); khung hướng dẫn khi bản web chưa cấu hình máy chủ; nhớ tên đăng nhập.
- **Giao diện online đồng nhất**: Sảnh online, đăng nhập Thế giới online, bảng điều khiển trong thế giới và máy PC dùng chung một theme (`onlineTheme.css`) theo bảng màu, khung và nút của game; thanh trên cùng ◀ Quay lại + tiêu đề vàng giống sảnh PvP; khung đăng nhập nằm giữa màn hình (cả điện thoại).
- Cửa hàng: Poké Ball trở lại vị trí #1, kẹo EXP xếp sau thuốc hồi phục.
- Sửa: đám đông Pokémon hoang dã không còn đẩy nhau xuống nước / vào tường (đẩy tách nhóm tôn trọng địa hình).
- E2E cập nhật theo quy tắc một Pokémon ra trận (gọi ra / thu hồi / đổi, Mega, boss).
- CI dùng Node 24 để kiểm tra server SQLite cùng build và unit tests. GitHub Pages phục vụ client; backend tài khoản cần máy chủ Node riêng (ONLINE_SERVER.md).

## Chưa phát hành — hồ sơ người chơi & co-op PvE

### Sảnh chính / hồ sơ người chơi
- **Thẻ người chơi trong sảnh chính**: avatar đã chọn, tên, ô lưu đang dùng, số Pokémon, Pokédex, số xu, thời gian chơi và thành tích PvP (bản ngang); bản dọc rút gọn để vừa màn hình điện thoại.
- **Đặt tên người chơi** trong hồ sơ (nút *✎ Hồ sơ* → *✎ Đổi tên*, bàn phím HTML nên dùng tốt trên điện thoại): 1–16 ký tự, tự cắt khoảng trắng / ký tự điều khiển, tên rỗng quay về “Huấn luyện viên”. Tên lưu **theo thiết bị** (`meta.profile`) nên không mất khi chơi mới, đổi ô lưu hay xóa ô; save cũ có `playerName` được tự động chuyển lên hồ sơ thiết bị.
- **8 avatar pixel tự vẽ**: huấn luyện viên, cô bé, nhà leo núi, nhà nghiên cứu, kiểm lâm, bơi lội, cựu binh và ninja. Mở *✎ Hồ sơ* (hoặc chạm thẳng vào avatar ở thẻ người chơi), chọn trong lưới 4×2 trên máy ngang / 2×4 trên điện thoại dọc; ô đang dùng có viền vàng và dấu ✓. Avatar lưu cùng hồ sơ thiết bị (`profile.avatar`), tự làm sạch id lạ về avatar cổ điển, nên không mất khi chơi mới/đổi ô/tải lại. Ảnh cũng đổi theo ở thẻ hồ sơ sảnh online, hình minh họa thẻ Phiêu lưu và nhân vật trong thế giới mở/co-op/đấu PvP.
- Tên được đồng bộ vào `net.myName` khi mở sảnh, tạo/vào phòng đấu, co-op và thế giới mở — bạn bè thấy đúng tên này; đổi tên khi đang trong phòng sẽ gửi `hello` để đối phương cập nhật ngay. Sảnh đấu online dùng chung hồ sơ (avatar + tên + thành tích) và cùng trình chọn avatar.
- **Avatar đồng bộ khi online**: `hello` và `coopJoin` mang thêm `avatar` (trường tùy chọn, giao thức v2 giữ nguyên), nên sảnh chờ, thế giới mở, co-op và đấu PvP đều vẽ đúng avatar của từng người; đổi avatar trong hồ sơ gửi `hello` ngay để bên kia đổi theo. Avatar mặc định dùng chung hình với trainer cũ nên diện mạo mặc định không đổi. Sảnh chờ hiển thị thêm avatar của đối thủ.
- **Thấy hoạt ảnh đánh của nhau**: thế giới mở gửi thêm `leadAnim` trong `pos`, nên Pokémon dẫn đầu của bạn diễn hoạt ảnh đi/đánh/cast trên màn hình người kia thay vì đứng yên; co-op đã chia sẻ `animCast`/`lastSkill`, đạn, vùng chiêu và `vfx` nên hai bên thấy hoạt ảnh tấn công của nhau. Trong đấu PvP, avatar giữ nguyên màu và đối thủ được đánh dấu bằng bóng đỏ thay vì nhuộm cả nhân vật.
- Test mới: e2e co-op kiểm tra hai bên thấy avatar của nhau và cùng thấy trạng thái cast; e2e thế giới chung kiểm tra avatar, hoạt ảnh Pokémon dẫn đầu và avatar trong trận đấu PvP.
- Sửa nội dung bảng co-op còn ghi “phần thưởng thuộc chủ phòng” thành đúng hành vi chia chiến lợi phẩm hiện tại.
- Test mới: 8 unit cho hồ sơ (làm sạch tên/avatar, giữ cả hai qua chơi mới/đổi ô/tải lại, chuyển từ save cũ, chọn avatar không tạo ô lưu rỗng) + 3 unit kiểm tra lưới pixel avatar; 2 e2e (đổi tên + chọn avatar trong sảnh chính rồi tải lại; thẻ hồ sơ và trình chọn avatar vừa khung dọc 390×844).

### Co-op PvE
- Phòng co-op 2 người trong Sinh tồn, Phiêu lưu, Việt Nam Odyssey và hầm ngục; tách khỏi chế độ đi chung/PvP cũ.
- Đồng minh có nhân vật, đội Pokémon và lệnh riêng; dùng chung quái, boss và HP do chủ phòng mô phỏng. Cứu đồng đội bằng cách đứng gần 3 giây.
- Khách xem snapshot có nội suy, gửi input có số thứ tự; dừng di chuyển khi input quá hạn, dọn đội khi mất kết nối, theo bản đồ chủ phòng khi chuyển cảnh.
- **Chia chiến lợi phẩm cho khách** (message `coopLoot`): Pokémon hoang dã chủ phòng bắt được, đồ trong rương, phần thưởng hầm ngục và xu cuối lượt Sinh tồn được cộng vào **ô lưu riêng của khách**; hiện trên HUD khách. Dữ liệu được làm sạch trước khi ghi (chỉ item đã biết, cấp 1–100, trần số lượng/xu). Nhiệm vụ, cờ cốt truyện, huy hiệu và legendary vẫn thuộc chủ phòng — không phá tiến trình chiến dịch của khách.
- Giao thức online v2 (thêm `coopLoot`, tương thích ngược); bổ sung kiểm tra logic và kiểm tra hai trình duyệt.
- Test mới: 5 unit cho `applyCoopLoot` (làm sạch dữ liệu, trần cấp/số lượng, cộng dồn), 1 unit cho `CoopHost.grant`; e2e co-op kiểm tra save khách nhận đúng phần thưởng và không đổi gì khác.

## [0.13.0] — 2026-10-25 — Chơi online: thách đấu người chơi, đi chung thế giới mở; engine chiến đấu hai phe

### Đấu online (menu chính → ⚔ Đấu online)
- **Kết nối trực tiếp giữa hai trình duyệt (WebRTC qua PeerJS)**: một người *Tạo phòng* và nhận mã 6 ký tự, người kia *Vào phòng bằng mã*. Máy chủ mai mối công cộng của PeerJS chỉ trao đổi lời mời kết nối; dữ liệu trận đấu đi thẳng giữa hai máy. Không cần server riêng, chạy được trên GitHub Pages. Thư viện PeerJS chỉ được tải khi vào online (chunk riêng 123 KB).
- **Sảnh**: đặt tên, chọn luật (*Chuẩn* — Lv50, cấm huyền thoại, không trùng loài · *Tự do* — cấp thật · *Huyền thoại* — Lv50, cho phép huyền thoại), chọn đội tối đa 6 con từ Bộ sưu tập của ô lưu đang mở (giữ IV / EV / tính cách / trang bị / Shiny) hoặc 1 trong 3 **đội thuê**; xem đội và trạng thái sẵn sàng của đối thủ; cả hai *Sẵn sàng* → vào trận.
- **Trận đấu thời gian thực** trên đấu trường riêng: 3 con trên sân, còn lại dự bị; con gục được thay tự động; **đổi Pokémon** (chạm con dự bị hoặc Z X C, hồi 4 s, HP giữ nguyên); 6 lệnh chiến thuật (\` 1–5, chạm Pokémon đối thủ để cả đội tấn công nó); **Mega Tiến Hóa 1 lần mỗi trận** (G, cần Mega Stone đúng loài, kéo dài hết trận); đầu hàng; 3 phút — hết giờ bên còn nhiều HP (tỉ lệ cả đội) thắng. Mỗi người luôn thấy mình đứng bên trái (hình bên khách được lật gương).
- **Chủ phòng là trọng tài**: máy chủ phòng chạy mô phỏng, gửi ảnh chụp trạng thái 20 lần/giây (~14 KB/s), máy khách gửi lệnh / di chuyển và vẽ lại có nội suy. Chủ phòng kiểm tra đội của khách (loài, cấp 1–100, IV ≤ 31, EV ≤ 252/510, tính cách, vật phẩm, luật) — dữ liệu không thể có bị từ chối kèm lý do. (Kết nối ngang hàng nên không chứng minh được khách thật sự sở hữu Pokémon đó.)
- **Luyện tập với máy**: cùng màn đấu, đối thủ là một đội thuê do máy điều khiển (đổi con sắp gục, Mega khi có thể), không cần mạng, không tính thành tích.
- **Thành tích**: thắng / thua / hòa online và 20 trận gần nhất lưu theo ô lưu (`SaveData.pvp`); đối thủ rời trận / mất kết nối = thắng.
- Hai tab trên cùng một máy: thêm `?net=local` vào địa chỉ (BroadcastChannel, không cần internet) — dùng cho e2e.

### Đi chung thế giới mở (Phiêu lưu → Cài đặt → Chơi online cùng bạn)
- Tạo / vào phòng ngay trong chế độ Phiêu lưu: hai người thấy nhau đi trên cùng bản đồ (trainer + Pokémon đầu đội, tên, 10 cập nhật/giây có nội suy); HUD hiện trạng thái phòng và ping. Pokémon hoang dã, nhiệm vụ, đồ, tiến trình vẫn là của riêng mỗi người.
- Lại gần người kia → **[E] Thách đấu**: người kia nhận hộp thoại (chờ tới lúc rảnh nếu đang nói chuyện / mở menu), nhận lời → cả hai vào trận với **đội hiện tại, cấp thật** (luật Tự do), xong trận trở về đúng chỗ cũ, vẫn còn kết nối.

### Engine chiến đấu
- **Hai phe người chơi** (`Side`): Sinh tồn / Phiêu lưu chỉ có phe `home` (các trường `trainer`, `allies`, `command`… nay là accessor vào nó, API cũ giữ nguyên); trận đấu có thêm phe `rival` dùng **đúng AI đồng đội** (chọn mục tiêu theo vai trò, chọn chiêu, né telegraph, lệnh). Trainer không bị tấn công trong trận đấu, không hồi sinh.
- **Công bằng đã đo**: hai đội giống hệt nhau thắng 47–54 % (300 seed mỗi cấu hình, 2 đội khác nhau, cả hai bên sân). Để đạt được: hai phe hành động từ cùng một trạng thái đầu bước rồi mới cùng di chuyển; phe giải quyết trước bốc thăm mỗi bước; đội hình phe rival đối xứng gương; nhịp suy nghĩ AI theo vị trí trong đội; chiêu trong trận quét trực tiếp đội đối phương (không qua lưới đã cũ); né tia trúng tâm hướng vào giữa sân.
- **Tất định**: cùng seed + cùng lệnh → cùng trận (có test).
- **Lệnh có hiệu lực ngay** (bước AI kế tiếp) thay vì chờ chu kỳ suy nghĩ 0,18 s.

### Sửa lỗi tìm ra trong lúc làm
- **Pokémon hoang dã / huấn luyện viên dùng chiêu tăng chỉ số lại buff cho đội người chơi** — nay chỉ buff chính nó (phe người chơi buff cả đội như cũ).
- **Crash**: một Pokémon đang có ≥ 2 trạng thái gục vì độc / bỏng / hút máu làm vòng lặp trạng thái đọc phần tử đã bị xóa.
- **Phe thứ hai không được đếm ngược trạng thái** (lộ ra khi thêm PvP: Flinch vĩnh viễn).
- Test EV đợt trước phụ thuộc tính cách ngẫu nhiên (thỉnh thoảng lỗi) — nay so với công thức đầy đủ.

### Hiệu năng
- Đo bằng `scripts/bench.test.ts` (`npx vitest run --config scripts/vitest.bench.ts`) và CPU profile (Node + trình duyệt). Mô phỏng Sinh tồn 6 vs 250 ≈ 0,22 ms/bước (trước 0,234), Phiêu lưu 6 vs 40 ≈ 0,04 ms, trận đấu 3v3 ≈ 0,02 ms; khung hình trong trình duyệt do Phaser vẽ sprite chiếm phần lớn.
- Lưới không gian: khóa ô là số nguyên 32 bit (nhanh hơn khi băm); vòng tách kẻ địch loại cặp xa bằng bình phương khoảng cách trước — **kết quả Sinh tồn giống hệt từng bit** (36 trận probe trùng khít bản cũ). Một cách tách luân phiên nhanh hơn ~40 % đã thử nhưng **không giữ** vì làm thay đổi hành vi đám đông.
- Renderer: cache điểm chân và hồ sơ hiển thị theo loài (trước đây quét lại hình vẽ cho mọi đơn vị mỗi khung hình).

### Tests
- 278 unit (mới: `v15_duel` — công bằng, tất định, lệnh theo phe, dự bị / đổi / Mega, hết giờ; `v15_net` — luật & kiểm tra đội, host mô phỏng ↔ khách phản chiếu qua JSON, lật góc nhìn, kết nối + bắt tay 2 phiên, từ chối đội phạm luật, phòng đầy / sai mã).
- e2e mới: `v15_online` (2 trang: tạo phòng → vào → đội → sẵn sàng → đấu thật → lệnh / di chuyển / đổi từ phía khách tới máy chủ → đầu hàng → thành tích → về phòng; luyện tập), `v15_shared_world` (2 ô lưu thấy nhau trên bản đồ → E thách đấu → nhận lời → đấu với cấp thật → về thế giới, vẫn kết nối → rời phòng), `v15_peerjs` (kết nối WebRTC thật qua máy chủ mai mối PeerJS; tự bỏ qua khi không có mạng).

## [0.12.0] — 2026-10-25 — Cần Thơ, EV, Hộ chiếu, 9 trang bị mới, tách bundle

### Việt Nam Odyssey: Cần Thơ (Lv16–26)
- Cổng An Giang → Cần Thơ mở bằng **Huy hiệu Bảy Núi** (trước đây là cổng khóa "chưa có").
- Bản đồ: **Bến Ninh Kiều** (nơi sông Cần Thơ đổ ra sông Hậu — Trung tâm, cửa hàng, Bảng nhiệm vụ), **Bờ Sông Hậu**, **Cồn Sơn** (cồn giữa sông, đi bằng đò 2 chiều), **Chợ nổi Cái Răng** (qua cầu bắc sông Cần Thơ), **Miệt vườn Phong Điền** (kênh rạch), **Đồng lúa Thới Lai**, **Vườn cò Bằng Lăng**. Biển tên chỉ ghi thông tin chắc chắn (cây bẹo ở chợ nổi, Cầu Cần Thơ khánh thành 2010…); boss và truyền thuyết ghi rõ là giả tưởng.
- 6 nhiệm vụ: chuỗi chính *Tây Đô bên dòng Hậu → Chợ nổi Cái Răng → Chúa Sông Hậu*, *Giải cứu vườn cò* (Ducklett bị Ekans/Arbok vây), 2 nhiệm vụ Bảng (*Trái ngọt miệt vườn*, *Cao thủ Tây Đô*). 7 NPC, 4 huấn luyện viên (không có cá trong đội), 3 rương, 2 trạm.
- **Boss khu vực Whiscash — Chúa Sông Hậu** (3 phase, Sóng Dữ Sông Hậu, không bắt được), mở sau khi thắng Tiểu thương Hạnh → **Huy hiệu Sông Hậu**. Cân bằng: đội Cỏ Lv22–24 hạ trong 28 s, đội không khắc hệ trong 42 s (Claydol: 42 s).
- Hộ chiếu ghi 2 địa danh: Bến Ninh Kiều, Chợ nổi Cái Răng. Cổng tiếp theo (Vĩnh Long) có nhưng đang khóa.
- Vòng cột đá của boss khu vực không còn đặt cột xuống nước (đảo nhỏ như Cồn Sơn).

### Hộ chiếu hành trình (tab riêng, phím P — chỉ ở Việt Nam Odyssey)
- Mỗi tỉnh một trang: dấu đỏ **ĐÃ ĐẾN** + ngày đến lần đầu, khu vực / nhiệm vụ / huấn luyện viên / rương / trạm / câu đố / giải cứu đã xong trên tổng, boss khu vực, địa danh, huy hiệu, % hoàn thành. Tỉnh chưa mở ghi điều kiện mở.
- Ngày đến lưu trong `AdventureSave.visited` (trường tùy chọn, không đổi SAVE_VERSION); save cũ vẫn tính "đã đến" từ bản đồ đã khám phá.

### EV (Effort Values)
- Công thức chỉ số gốc có EV: `floor(EV/4)` trong số hạng cơ bản; tối đa **252 / chỉ số, 510 tổng**.
- Hạ Pokémon (hoang dã, HLV, boss) → mọi Pokémon trong đội đang ra trận nhận **EV yield thật của loài đó** (PokéAPI `stats[].effort`, 1025 loài, `scripts/sync-ev-yield.mjs`).
- **Power Weight / Bracer / Belt / Lens / Band / Anklet** (+8 EV chỉ số tương ứng mỗi lần hạ), **Macho Brace** (×2). Không có phạt tốc độ như bản gốc (game thời gian thực: Pokémon đi theo sẽ bị tụt lại).
- 6 vitamin (+10) và 6 berry giảm EV (−10, tăng thân thiết) dùng từ Túi đồ; không mất vật phẩm nếu không có tác dụng.
- Chi tiết Pokémon hiện dãy EV + tổng. EV giữ qua tiến hóa, lưu trong Bộ sưu tập; save cũ = 0 EV (chỉ số không đổi). Pokémon khởi đầu Sinh tồn dùng cá thể của bản trong Bộ sưu tập nên mang cả EV (như IV/Tính cách).

### 9 trang bị mới (cửa hàng + rương)
- Life Orb, Choice Band / Specs / Scarf (khóa vào chiêu tấn công đầu tiên tới khi hết giao tranh), Assault Vest, Rocky Helmet, Eviolite, Sitrus Berry, Focus Sash — hiệu ứng thật trong combat engine, chuyển sang thời gian thực (xem EVOLUTION_EQUIPMENT_MEGA.md).

### Tách bundle
- Trước: 1 file code + dữ liệu 3,25 MB. Nay: code **453 KB** (gzip 157 KB), dữ liệu game 1,0 MB, dữ liệu PokéAPI 1,8 MB, Phaser 1,5 MB — tải song song, bản cập nhật chỉ sửa code không bắt tải lại dữ liệu. Tổng dung lượng không giảm (dữ liệu vẫn nạp đồng bộ khi khởi động).

### Tests
- 260 unit (mới: `v12_held`, `v12_passport`, `v13_can_tho`, `v14_ev`), e2e mới `v13_can_tho` (chơi thật từ cổng An Giang tới huy hiệu + Hộ chiếu), `v14_ev` (vitamin qua hội thoại, Power item trong trận thật, lưu/tải); `v8_vietnam` kiểm tra tab Hộ chiếu.

## [0.11.1] — 2026-10-24 — Sửa tốc độ hoạt ảnh PMD

### Fixed
- **Hoạt ảnh PMD chạy quá nhanh, chỉnh `PMD_SLOWDOWN` không có tác dụng** — 2 nguyên nhân (đã đo trong game):
  1. Phaser 3.88 bỏ qua thời lượng riêng của từng khung (`nextTick = msPerFrame || frame.duration`, mà `msPerFrame` không bao giờ bằng 0) → mọi sheet chạy cố định 24 khung/giây. Nay hoạt ảnh chạy theo nhịp 1 khung PMD × `PMD_SLOWDOWN` (1.5) và mỗi hình được lặp đúng số nhịp của SpriteCollab (vd. Bulbasaur đứng: giữ ~1 s rồi chớp 2 khung).
  2. Vận tốc AI rung qua lại làm sprite đổi hướng / đổi đi-đứng ~5–12 lần mỗi giây và chơi lại từ khung đầu. Nay hướng nhìn dùng vận tốc làm mượt (~0,3 s), đi/đứng có ngưỡng trễ, quay về mục tiêu chỉ khi mục tiêu không sát bên và tối đa 1 lần/0,6 s, đổi hướng giữ khung đang chạy.
- Đo lại: 0 lần khởi động lại hoạt ảnh trong 3 s (trước: 19–37). e2e `v11_pmd` kiểm tra nhịp khung và số khung theo SpriteCollab.

## [0.11.0] — 2026-10-24 — National Dex tới Gen 9 + hoạt ảnh PMD 8 hướng

### Pokémon Gen 1–9 (1025 loài)
- `sync-pokeapi.mjs`: #1–#1025, learnset Gen 5–9 lấy từ Black/White → Scarlet/Violet (sau các nguồn Gen 3/4 cũ). Cache: 1025 loài, 743 chiêu (từ 434).
- `build-dex.mjs`: đánh số thế hệ 5–9; starter / hóa thạch Gen 5–9, **Ultra Beast**, **Paradox** (cờ `paradox`) chỉ qua sự kiện; giả-huyền-thoại mới (Deino, Goomy, Jangmo-o, Dreepy, Frigibax); cá mới vào nhóm thủy sinh (Basculin, Arrokuda, Finizen, Dondozo…; sư tử biển Popplio không tính).
- Chiêu dự phòng chỉ lấy từ chiêu có ở thế hệ của loài trở về trước → **493 loài cũ và 30 boss huyền thoại giữ nguyên 100%** (đã so sánh từng file). 7 loài cũ đổi dữ liệu sinh thái vì có tiến hóa mới ở Gen 8–9 (Primeape → Annihilape…), đúng như dữ liệu.
- 94 huyền thoại/thần thoại: 35 loài Gen 1–4 có điểm gặp như cũ; 59 loài Gen 5–9 là **DATA ONLY** (không bao giờ spawn ngẫu nhiên; sẽ đặt theo cốt truyện các tỉnh sau).
- Bể spawn các vùng tự có loài Gen 5–9 theo môi trường (vd. U Minh: 37 loài Gen 5+), vẫn không có hệ Băng ở miền Nam.

### Hoạt ảnh PMD (gói cá nhân, tùy chọn)
- Bộ assets `assets/pokemon` của github.com/JPTER78/pokesurvivor = sprite **PMDCollab SpriteCollab (CC BY-NC 4.0)**: 966 loài, mỗi loài Walk / Idle / Attack / Shoot / Charge / Hurt / Faint theo **8 hướng** + bản Shiny. Chỉ lấy ảnh (code của repo là PolyForm, không dùng); kích thước khung lấy từ `AnimData.xml` gốc của SpriteCollab.
- `scripts/import-pmd-sprites.py` → `public/assets/pmd/` (gitignore, ~100 MB), `index.json`, `CREDITS.md`.
- `render/pmdPack.ts` + `WorldRenderer`: sprite ngoài sân dùng hoạt ảnh thật — hướng theo chuyển động / mục tiêu, không lật ảnh, thời lượng từng khung đúng SpriteCollab, Attack/Hurt/Faint chạy hết mới đổi, bản Shiny riêng; tải theo nhu cầu (6 loài mỗi lượt); loài chưa tải / không có trong gói dùng sprite cũ.
- Bật/tắt trong Cài đặt; màn Ghi công có dòng ghi công + nút mở danh sách họa sĩ.
- Sprite ngoài sân cho Gen 8–9 khi không có gói PMD: ảnh front chính thức thu nhỏ (PokeAPI không có icon sau #809).

### Tests
- 229 unit (mới `v10_gen9`), e2e mới `v10_gen9` (mô hình Gen 5–9 trong game), `v11_pmd` (sheet PMD được dùng, Shiny, đổi hướng khi di chuyển).
- Bundle: 3,2 MB (gzip 534 KB) — tăng do dữ liệu 1025 loài, cần tách tải sau.

## [0.10.1] — 2026-10-24 — Cá phải ở dưới nước

### Changed
- **Loài thủy sinh** (31 loài: dạng `fish` của PokéAPI + Tentacool/Tentacruel, Octillery, Horsea/Seadra/Kingdra, Gyarados, Milotic, Huntail, Gorebyss, Mantine/Mantyke; trừ hải cẩu Seel/Dewgong/Spheal/Sealeo — chúng lên bờ) có cờ `aquatic` trong `ecology.json`.
- **Spawn**: cá chỉ xuất hiện trên ô nước (ô nước có ≥ 6/8 ô kề cũng là nước — tính cả kênh rạch hẹp), từ bể biển (vùng bờ biển) hoặc nước ngọt; ô đất **không bao giờ** bốc ra cá. Sự kiện thế giới cũng không đặt cá lên cạn.
- **Di chuyển**: cá hoang dã đặt trong nước chỉ bơi trong nước (va chạm ngược: đất là tường); Pokémon cạn vẫn bị nước chặn như cũ. Ném bóng từ bờ vẫn bắt được.
- **Hiển thị**: cá không có bóng đổ trên đất mà có gợn nước nhạt quanh mực nước, thân nhấp nhô.
- Đội huấn luyện viên có cá được thay loài sống trên cạn: Ngư dân Hai Lúa (Magikarp → Poliwag), Bạn chèo xuồng Mai (Barboach → Wooper), Vận động viên bơi Thu (Seaking/Lanturn → Golduck/Floatzel), Thủy thủ Bền (Tentacruel → Crawdaunt).
- Pokémon cá **trong đội của người chơi** vẫn đi theo trên cạn như trước (để không mất khả năng dùng chúng).

### Tests
- 225 unit (mới `v9_aquatic`), 27 e2e (mới `v9_aquatic`: Cà Mau + Bờ Biển San Hô, spawn thật + AI thật, mọi cá hoang dã trên ô nước, mọi Pokémon cạn trên đất trong suốt thời gian quan sát).

## [0.10.0] — 2026-10-24 — Chế độ Việt Nam Odyssey: Cà Mau & An Giang (bản kiểm nghiệm)

Master Prompt V6, theo yêu cầu: hệ thống đã có thì giữ nguyên, thêm **chế độ riêng** và chỉ làm 2 tỉnh đầu để kiểm nghiệm.

### Chế độ
- **Việt Nam Odyssey** là một hành trình riêng theo **ô lưu** (`AdventureSave.campaign: 'classic' | 'vietnam'`): bản đồ, sổ nhiệm vụ (`src/data/vietnam/quests.json`), điểm xuất phát và Hộ chiếu riêng; dùng chung engine Phiêu lưu (combat real-time, bắt/thả, Mega, BossPhaseManager, sự kiện, cửa hàng, save). Save cũ tự là `classic` (không đổi SAVE_VERSION; migration điền mặc định).
- Menu: dải **VIỆT NAM ODYSSEY** (cờ đỏ sao vàng vẽ bằng code) với Tiếp tục / Chơi mới; ô lưu ghi `[Việt Nam]`.

### Cà Mau (Lv1–10) — chơi được từ đầu tới cuối
- Thị trấn Đất Mũi: Trung tâm Pokémon (trạm hồi phục / dịch chuyển), cửa hàng, Trạm Nghiên cứu, **Bảng nhiệm vụ**; Mũi Cà Mau (bãi biển, biển phía tây nam, biển tên + hướng dẫn viên); Rừng Ngập Mặn Đất Mũi (kênh rạch, bãi bùn, lau sậy, **cây đước**); Rừng Tràm U Minh Hạ (**cây tràm**, trạm kiểm lâm).
- Pokémon khởi đầu Treecko / Torchic / Mudkip (qua hội thoại Giáo sư Mai); 3 huấn luyện viên; 3 rương; 8 NPC.
- 7 nhiệm vụ: chuỗi chính *Khởi hành từ Đất Mũi → Vào rừng U Minh → Chúa Rừng U Minh*, *Bí ẩn ánh sáng giữa rừng* (chỉ gợi mở, không có huyền thoại), 2 nhiệm vụ Bảng, *Điểm cực Nam*.
- **Boss khu vực Seviper — Chúa Rừng U Minh** (3 phase, không bắt được), mở sau khi thắng HLV Vy → **Huy hiệu Rừng Tràm** → mở đường lên An Giang.

### An Giang (Lv8–18)
- Thị trấn Bảy Núi (Trung tâm, cửa hàng, Bảng nhiệm vụ), Rừng Tràm Trà Sư, Đồng Nước Nổi, Núi Sam, Bảy Núi (Thất Sơn), **Đền Cổ Thất Sơn (giả tưởng)**, **Đảo Phú Quốc** (đảo thật trong biển + bến phà 2 chiều).
- 6 nhiệm vụ: *Bảy Núi giữa đồng bằng*, **Giải cứu nhóm khảo sát** (Smeargle bị Geodude vây), **Đền Cổ Thất Sơn** (câu đố 3 phiến đá NƯỚC → RỪNG → NÚI mở phong ấn) → **Claydol — Hộ Vệ Đền Cổ** → **Huy hiệu Bảy Núi**; *Mùa nước nổi*, *Cao thủ Bảy Núi* (3 HLV: núi, rừng tràm, đảo), *Ra đảo Phú Quốc*.
- Đường tới Cần Thơ: có cổng nhưng khóa ("chưa có trong phiên bản này").

### Hệ thống dùng chung được tổng quát hóa (để các tỉnh sau chỉ cần dữ liệu)
- Boss khu vực theo dữ liệu (`worldBoss.rewards`: vật phẩm lần đầu / lặp lại, tiền, cờ huy hiệu, thông điệp; `worldBoss.requires`).
- Nhiệm vụ trao Pokémon khởi đầu (`QuestDef.starter`), giải cứu (`rescue.quest/reporter`), câu đố mở rương (`puzzle.chest`), đảo trong biển (`islands`), loại trừ hệ theo vùng (`excludeTypes`: **không có Pokémon hệ Băng ở miền Nam nhiệt đới**), mỗi khu một dải cấp riêng, NPC dạng vật thể (bảng nhiệm vụ, đốm sáng).
- Tab Bản đồ: danh sách tỉnh + **Hộ chiếu hành trình** (huy hiệu, địa danh).
- Nội dung lịch sử/địa lý chỉ dùng thông tin chắc chắn; Pokémon, đền cổ và sự kiện ghi rõ là giả tưởng.

### Sửa trong lúc làm
- Boss Cà Mau ban đầu cần cờ chỉ được trao sau khi hạ chính nó (kẹt tiến trình) — đổi sang "đã thắng HLV Vy", thêm test chống kẹt.
- Theme mới làm nền thành màu Thánh Địa và đường thành đá lát — sửa + test chống dùng tile của theme khác.
- Rương trên đảo nằm dưới nước — dời lên bờ (test bắt được).

### Tests
- 221 unit (mới `v8_vietnam`: tách chế độ, bản đồ, đảo, bể loài không hệ Băng, nhiệm vụ trỏ đúng, chống kẹt, cân bằng boss: Seviper Lv12 hạ trong 26 s, Claydol Lv20 trong 42 s), 25 e2e (mới `v8_vietnam`: **chơi thật từ menu → starter → bắt bằng bóng → nhiệm vụ → HLV → boss → huy hiệu → lưu / tải lại → qua cổng An Giang**; An Giang: giải cứu → câu đố → Claydol → phà ra Phú Quốc → Hộ chiếu).

## [0.9.0] — 2026-10-24 — Mở rộng bản đồ & nội dung, màn hình chính và UI mới

### Bản đồ mới (lấp khoảng Lv26 → Lv32 giữa Thung Lũng và Núi Tuyết)
- **Đầm Lầy Sương Mù** (Lv22–32, cổng phía tây nam Thung Lũng, mở sau Hang Đá Cổ): 3 khu (Bìa Đầm Lầy, Lòng Đầm Độc, Hốc Cây Thầy Mo), lối ván gỗ, lau sậy, bùn, nước đầm, cây khô; **vũng bùn độc** (mỗi giây 35 % trúng độc, hệ Độc/Thép miễn) — mục "đầm lầy độc" còn thiếu từ 0.8.0.
- **Bờ Biển San Hô** (Lv26–38, cổng phía đông nam, mở sau nhiệm vụ đầm lầy): Bãi Cát Vàng, Vách Đá Hải Âu, Rạn San Hô; biển, cát, cây dừa, hải đăng, quán hải sản (cửa hàng).
- Biome mới `swamp` (61 loài: Độc, Nước+Đất, bọ/cỏ ven nước, Ma+Cỏ) và `coast` (65 loài: loài biển, Nước+Bay, Nước+Đá) — chỉ **thêm** biome, không loài nào mất nơi sống cũ.
- 10 tile mới vẽ bằng code (bùn ×2, vũng độc ×2 khung, nước đầm ×2, cỏ đầm, lau sậy ×2, cây dừa); nhạc nền riêng cho 2 vùng (tổng 11 bản).

### Nội dung
- 7 nhiệm vụ: chuỗi chính *Vùng đất phía tây → Màn sương độc → Ngọn hải đăng tắt*, phụ *Cá đầm nhiễm độc*, *Báu vật rạn san hô*, thách đấu *Cao thủ đầm lầy*, *Vua biển cả*.
- 6 NPC (Bà Thầy Mo, Ngư dân, Kiểm lâm, Thợ lặn, Ông giữ hải đăng, Chủ quán), 4 huấn luyện viên (đội 3 con Lv23–32), 6 rương, 2 trạm dịch chuyển, chân dung chính thức cho NPC mới (gói cá nhân).

### Màn hình chính
- Nền động: trời đêm chuyển màu, sao lấp lánh, 2 lớp đồi, đồng cỏ cuộn với **đoàn Pokémon đi ngang** (lấy từ Bộ sưu tập của ô đang dùng); logo có biểu tượng Poké Ball xoay, hiện ra có nảy; thẻ chế độ có dải tiêu đề màu, thống kê, trượt vào lần lượt; số phiên bản.
- Bố cục điện thoại dọc: tỉ lệ riêng (trước đây mọi thứ bị thu nhỏ theo bề ngang 960 px), nhãn nút rút gọn.

### UI chung (cả game)
- `panel()` / `button()` mới: nền chuyển màu, viền tối + viền màu, vát sáng/tối, đinh góc; nút nổi lên khi rê chuột, lún xuống khi nhấn.
- Sửa chi tiết Pokémon: dòng Tính cách/IV đè lên chỉ số Tốc độ.

### Fixed (trong lúc làm)
- Script sinh dữ liệu suýt ghi đè nhiệm vụ `q-main-4` (Mega Venusaur) — đã khôi phục từ bản sao lưu, nhiệm vụ mới dùng id riêng, có test giữ nguyên.

### Tests
- 214 unit (mới `v7_regions`), 23 e2e (mới `v7_regions`: cổng khóa/mở, Pokémon hoang dã đúng biome, bùn độc, đường về).
- Probe cân bằng Sinh tồn không chạy lại (code Sinh tồn không đổi trong bản này).

## [0.8.0] — 2026-10-24 — Save nhiều ô, Boss nhiều phase (Rayquaza), Summon/Recall, bắt huyền thoại, nội dung tồn đọng

### Save
- **3 ô lưu** độc lập + màn **Tải game** (vùng, thời gian chơi, giờ lưu, số Pokémon, Pokédex, huyền thoại, xu, số trận Sinh tồn, icon đội hình) + **Xóa ô**.
- **Chơi mới xóa sạch ô đó**: Pokémon, Pokédex, túi đồ, xu, nhiệm vụ, trạm, cờ cốt truyện, huyền thoại, trứng, thành tích/mở khóa/nâng cấp Sinh tồn — không còn gì mang theo (trước đây giữ lại bộ sưu tập). Chỉ cài đặt thiết bị (đồ họa, âm thanh, sprite) dùng chung.
- Save cũ (một ô) tự chuyển vào **ô 1**; bản gốc giữ nguyên làm dự phòng. Đổi cài đặt không bao giờ làm "đầy" một ô trống.
- `SAVE_VERSION 6` + migration v5→v6: `savedAt`, checkpoint trận boss (`bossFights`), Pokémon đang trong bóng (`recalled`), loại bóng đã bắt (`ball`), trạng thái giữ trong bóng.

### Boss
- **BossPhaseManager** dùng chung cho mọi boss: `ACTIVE → TRANSITION_PENDING → TRANSITION_CINEMATIC → [FORM_CHANGE] → PHASE_READY → ACTIVE`, cuối cùng `WEAKENED` (huyền thoại) hoặc `DEFEATED`. Mỗi phase chỉ kích hoạt 1 lần; **một đòn không thể bỏ qua phase** (HP dừng ở ngưỡng); bất tử chỉ trong lúc chuyển phase, tối đa `maxInvuln` giây; chuyển phase xóa mọi vùng đòn/cast/dash cũ của boss; không có timer riêng nên không rò rỉ khi scene bị hủy.
- **Rayquaza 3 phase**: Thường (100–70 %: Dragon Pulse, Extreme Speed, Hurricane hình nón, Dragon Dance) → **Mega Rayquaza** (≤ 70 %, cinematic + đổi dạng thật — dữ liệu `rayquaza-mega` #10079 lấy từ PokéAPI, chỉ dành cho boss, người chơi không Mega được) với Dragon Ascent, Hyper Beam (nạp lại 1,8 s), Extreme Speed ×3, Dragon Pulse quét → **Cuồng Nộ** (≤ 30 %) mở bằng **Sky Cataclysm**: bay lên (không thể bị đánh) → 12 vùng sét → lao xuống vùng đánh dấu → sóng xung kích (đứng sát tâm hoặc thật xa) → nghỉ 2,6 s. Mỗi chiêu có windup / telegraph đúng bằng hitbox / recovery và cảnh báo tên chiêu.
- Các boss khác chuyển phase bằng **stance / enrage** (không gán Mega cho loài không có Mega).
- **Boss HUD** từ bộ UI người dùng cung cấp (`rayquaza_boss_ui_separated.zip`): khung xanh/đỏ, chân dung, tên (đổi thành "Mega Rayquaza" khi đổi dạng), cấp, **thanh HP động** (cắt chứ không kéo giãn, vệt sát thương trễ), màu theo phase (lục / tím Mega / lam / đỏ cuồng nộ), huy hiệu LEGENDARY, bảng phase (phase hiện tại nhấp nháy, phase chưa tới bị làm mờ), icon trạng thái + khiên khi bất tử, bảng cảnh báo chiêu có đếm ngược, bảng chuyển phase, nhãn CUỒNG NỘ, dòng "kiệt sức — ném bóng". Banner/popup tự dời xuống dưới HUD.
- Xử lý ảnh (`scripts/prepare-boss-ui.py`): xóa thanh HP tĩnh dính trong khung HUD, tách icon gộp (element 9, status 9, party 7, nút 3), bỏ mảnh vụn ở mép phải; màu fill lam/tím dựng bằng đổi tông từ fill lục của chính HUD (cùng kích thước, không kéo méo). **Không dùng** `command_menu.png` (chữ dính sẵn, sai chính tả "Pokénon", là menu theo lượt).

### Bắt huyền thoại
- Huyền thoại (điện thờ & lang thang) không còn tự gia nhập khi thắng: hết mọi phase → **WEAKENED** ở 4 % HP, đứng yên, vòng xanh → **cửa sổ bắt** theo luật riêng từng boss (`core/legendCapture.ts`: số lượt ném, thời gian, tỉ lệ sàn, loại bóng được phép — Arceus chỉ chịu bóng cao cấp). Hết lượt/hết giờ → bay đi, quay lại sau và đánh lại được.
- Cờ cốt truyện + phần thưởng trao ngay khi hạ hết phase (tiến trình không phụ thuộc may rủi). Không bao giờ có bản sao (đã bắt → không mở cửa sổ bắt).
- Checkpoint: lưu giữa trận lưu HP + phase (lưu giữa cinematic → tải lại ở phase đó, ACTIVE, không lặp/không bỏ phase) + số lượt ném còn lại.

### Summon / Recall
- **PokemonSummonManager**: thả (ném bóng đúng loại đã bắt → mở → chớp trắng → cột sáng → hiện hình), thu hồi (tia đỏ → thu nhỏ), **đổi** (thu hồi rồi thả vào đúng chỗ). Khóa theo từng Pokémon + khóa toàn cục suốt animation, hồi chiêu 0,8 s → không race condition; trong bóng **không hồi máu**, giữ trạng thái kéo dài; luôn ≥ 1 Pokémon trên sân. Hồi phục ở trạm / khi ngất cũng hồi Pokémon trong bóng.
- Party UI: bấm / chạm vào hàng trong danh sách đội (khung ô từ bộ UI), phím **Shift + 1–6**. Tách biệt hoàn toàn với hệ thống bắt.

### Việc tồn đọng
- **Trang bị trong Sinh tồn**: Pokémon khởi đầu mang vật phẩm + IV/tính cách của bản trong Bộ sưu tập (hiện ở màn chọn).
- **Nhạc nền**: 9 vòng nhạc chiptune tự sáng tác, tổng hợp bằng WebAudio (menu, Thung Lũng, Núi Tuyết, Núi Lửa, Thánh Địa, hầm ngục, Sinh tồn, boss, boss huyền thoại), chuyển mượt; nút **Nhạc** riêng trong mọi màn cài đặt.
- **Synergy & Elemental Combo (Sinh tồn)**: đồng hệ 2/3+ con → +10/20 % sát thương hệ đó, đội ≥ 5 hệ → +5 %; 5 combo (Hơi Nước, Vỡ Băng, Quá Tải, Cháy Lan, Kịch Độc) với hồi 2 s mỗi mục tiêu; hiển thị dưới minimap. Phiêu lưu không đổi.
- **Nâng cấp vĩnh viễn**: 6 dòng × 5 cấp (Sức mạnh, Sinh lực, Tập trung, Nhanh nhẹn, Nam châm, Chí mạng), mua bằng xu ở menu, theo từng ô lưu.
- **Hầm ngục mới**: Hang Băng Vĩnh Cửu (Núi Tuyết, boss Mamoswine, băng rơi làm chậm), Lò Dung Nham (Núi Lửa, boss Magmortar, đá nóng gây bỏng), **Tháp Thử Thách** (Thánh Địa, boss Tyranitar, giới hạn 300/270/240 s — hết giờ bị đưa ra, không thưởng). Mỗi hầm 3 độ khó, phần thưởng lần đầu riêng, ra ngoài về đúng cửa hầm.
- **Hiệu ứng môi trường**: Núi Tuyết — mặt băng chậm 30 %, tuyết dày 15 %, **bão tuyết** định kỳ (chậm 25 % trừ hệ Băng / đứng gần Pokémon hệ Lửa); Núi Lửa — **nhiệt** gần dung nham (−2 % HP/2 s, không xuống dưới 25 %, hệ Lửa/Nước/Đất miễn), **phun trào** định kỳ (tàn lửa có cảnh báo, 25 % bỏng). Phủ màu toàn màn hình khi có sự kiện.
- **Tile IcyEthics**: sàn đá xám / băng lam lấy từ `padded_caveTiles.png` (pixel art 16 px gốc đã nhân 2 → lấy mẫu 2:1, không méo) cho Hang Băng và Tháp Thử Thách (`scripts/prepare-icy-tiles.py`).
- **Góc trong của đường đất** (4 ô) — hết góc vuông cứng ở chỗ đường giao/rẽ.

### Fixed
- `npm run build` hỏng từ 0.7.1 (`tests/v5_official_art.test.ts` dùng `node:fs` không có kiểu) → dùng `import.meta.glob`.

### Tests
- 210 unit (mới: `v6_slots`, `v6_boss`, `v6_meta`, `v6_dungeons`), 22 e2e (mới: `v6_slots`, `v6_rayquaza`, `v6_summon`, `v6_dungeons`). Test boss cũ cập nhật theo luật mới (đánh qua từng phase, bắt khi weakened).
- Probe Sinh tồn: bot thắng **2/9** (0.7.1: 3/9) — boss bất tử trong lúc chuyển phase làm trận dài hơn; 1 trận còn sống tới 960 s nhưng chưa hạ boss cuối.
- Probe huyền thoại: 30/30 bị đánh tới WEAKENED trong 43–142 s (Rayquaza 49 s).

### Chưa làm được / hạn chế
- Đo hiệu năng trên thiết bị thật: không thể làm từ môi trường này.
- Đầm lầy độc: chưa có bản đồ đầm lầy nên chưa có hiệu ứng này.
- Tile IcyEthics mới dùng cho sàn hầm ngục; các tileset vùng (Mycor Town, Bog of Yore, núi) là autotile 32 px kiểu RPG Maker — chưa ghép.

## [0.7.1] — 2026-10-24 — Ảnh vật phẩm & nhân vật từ API (gói cá nhân)

### Added
- **Ảnh vật phẩm chính thức** (PokeAPI/sprites `items/`, 30×30) cho **toàn bộ 55 vật phẩm** của game — 8 loại bóng, thuốc, Oran Berry, đá tiến hóa, Mega Stone, vật phẩm cầm, Linking Cord, Key Stone (Mega Ring): túi đồ, quả bóng bay khi ném.
- *(V24: đã thay bằng nhân vật pixel có hoạt ảnh — xem đầu file)* **Ảnh huấn luyện viên** (Pokémon Showdown trainer sprites, 80×80) cho mọi NPC của cả 4 vùng (Giáo sư → Oak, Bác Tư → Rancher, Kiểm lâm → Pokémon Ranger, Y tá → Nurse, Chủ tiệm → Gentleman, Người leo núi → Hiker, Nhà địa chất → Scientist, Nhà tiên tri → Psychic…), huấn luyện viên đối chiến và huấn luyện viên phục kích (Ace Trainer, Blackbelt, Beauty, Veteran, Cyclist, Skier): sprite ngoài sân + **chân dung trong hội thoại** (mọi câu trong cuộc nói chuyện, lời thách đấu / thắng / thua).
- Tải cùng lúc khởi động (~80 ảnh 1–2 KB); không có gói thì quay về icon pixel / tile Kenney / chân dung IcyEthics.
- Tests: 179 unit (mới `v5_official_art`, chỉ chạy khi gói có trên máy).

### Không có trong API
- Ảnh **môi trường** (tile, cây, nhà, địa hình) không có ở PokéAPI hay Pokémon Showdown — giữ Kenney CC0 + tile nguyên bản.
- Ảnh huấn luyện viên chỉ có tư thế đứng nhìn thẳng → nhân vật người chơi giữ sprite đi bộ 4 hướng nguyên bản.

## [0.7.0] — 2026-10-24 — Vùng mới, Shiny thật, bóng đặc biệt, cân bằng huyền thoại

### Added
- **3 vùng overworld mới** qua cổng dịch chuyển (mở theo cốt truyện), đúng dải cấp đề xuất: **Núi Tuyết Vĩnh Hằng** Lv32–45 (Elite 48–52, mở sau Mega Venusaur), **Vùng Đất Núi Lửa** Lv42–58 (Elite 60–65, sau 3 Thần Điểu), **Thánh Địa Huyền Thoại** Lv65–85 (boss 80–100, sau Rayquaza). Địa hình riêng (tuyết, tuyết dày, băng, tro, đá núi lửa, dung nham động, đá thánh), cây thông tuyết / cây cháy / pha lê, trại, NPC, biển báo, trạm dịch chuyển, rương; khí hậu riêng (tuyết rơi, tro & than hồng, ánh sáng thánh; Núi Lửa không mưa). Bản đồ / minimap / độ khám phá theo từng vùng; nhiệm vụ & sự kiện chỉ hiện trên đúng bản đồ.
- Loài tuyết & núi lửa nay **hoang dã** ở vùng của chúng; Thánh Địa có các dạng cuối và loài cực hiếm. **Arceus** chuyển về Thánh Địa (Lv80).
- **Sông & cầu** (`rivers` trong dữ liệu bản đồ): sông nước ở Núi Tuyết, sông dung nham ở Núi Lửa; đường cắt qua sông thành cầu gỗ.
- **Shiny chính thức**: ảnh front Shiny 96×96 trong UI; icon Shiny ngoài sân lấy màu thật bằng cách so ảnh front thường ↔ Shiny từng điểm ảnh rồi ánh xạ palette (thay cho đổi tông ngẫu nhiên); HUD & bộ sưu tập hiện Shiny.
- **5 quả cầu đặc biệt** (Gen IV, chuyển sang thời gian thực): Net ×3.5 (Bọ/Nước), Dusk ×3.5 (đêm/hang), Quick ×4 (trước khi giao chiến), Timer (1 + giây/10, tối đa ×4), Luxury (+50 thân thiết); bán ở cửa hàng, icon pixel, phím R xoay vòng đủ 8 loại.
- **Đòn hình nón** (`cone`): Icy Wind, Powder Snow, Air Cutter, Twister, Heat Wave, Muddy Water, Hurricane, Blizzard trúng mọi đối thủ phía trước, hiệu ứng quạt riêng + icon dạng đòn mới.
- Huấn luyện viên phục kích có hình người + tên; **thanh EXP động** trên HUD (chạy dần, đầy & nháy vàng khi lên cấp).
- `scripts/legend-balance.test.ts` (+ `vitest.legend.ts`): mô phỏng từng boss huyền thoại; chỉnh riêng Lugia, Latias, Uxie, Mesprit, Cresselia (150–220 s → ~50–150 s).
- Tests: 177 unit (mới `v4_regions`, `v4_balls`), 18 e2e (mới `e2e/v4_regions.spec.ts`).

### Fixed
- Đi qua cổng: vị trí đích bị ghi đè bởi vị trí cũ (HLV xuất hiện ngoài bản đồ mới).
- Scene cũ đọc dữ liệu vùng mới trong lúc chuyển cảnh (bản đồ của scene giờ cố định lúc tạo).

## [0.6.1] — 2026-10-24 — Sprite chính thức cho toàn bộ Dex

### Changed
- Gói sprite chính thức (dùng cá nhân, `public/assets/official/`, gitignore) đủ **508/508** (493 loài + 15 Mega): icon Gen 7 ngoài sân, front 96×96 cho UI. **Tự bật** khi gói có trên máy (trừ khi người chơi tự tắt trong Cài đặt); khi bật, mọi Pokémon — kể cả loài trước đây có art vẽ tay / IcyEthics và boss Onix — dùng sprite chính thức. Chỉ 2 fakemon (Canight, Perropello) giữ art IcyEthics vì không có sprite chính thức.
- Tải **theo nhu cầu**: lúc khởi động chỉ đọc danh mục; icon của một loài được tải khi nó cần hiện ra (hình bóng cùng kích thước trong lúc chờ, rồi vẽ đè lên cùng texture), ảnh front khi UI cần. Khởi động với gói bật: 12 s → ~1 s.

### Fixed
- Sprite chính thức bị vẽ thành hai con (ảnh đã cắt sát lệch khung với sheet 40×30) — đệm lại đúng khung.
- Đệ quy vô hạn khi UI hỏi ảnh front lần đầu.

## [0.6.0] — 2026-10-24 — Master Prompt V3: National Dex 1–493, sinh thái, sự kiện thế giới, huyền thoại

### Added
- **National Dex #1–#493 (Gen 1–4)** đồng bộ từ PokéAPI (species endpoint, phân biệt species / form, learnset FRLG → Emerald/RS → Platinum/DP/HGSS, `generation`, `isBaby`), 434 chiêu, 6 nhóm tăng trưởng; script đồng bộ có checkpoint & resume. `scripts/build-dex.mjs` (thay `build-gen1.mjs`) sinh `src/data/dex/{pokemon,skills,ecology,legend-bosses}.json`.
- **Ecology cho 493 loài**: biome (habitat PokéAPI + hệ), độ hiếm, giai đoạn tiến hóa, cấp sàn tự nhiên (dạng giữa/cuối chỉ xuất hiện từ cấp tiến hóa; baby tiến hóa theo cấp cũng tính), giờ, hệ số thời tiết, cách gặp (hoang dã 428 · chỉ qua sự kiện 30 · huyền thoại 26 · thần thoại 9).
- **RegionalLevelManager** (`src/data/world/regions.json`): 7 vùng của Thung Lũng có dải cấp, Elite, Boss, cấp khuyến nghị, độ nguy hiểm, điều kiện mở khóa.
- **BiomeSpawnManager + PokémonRaritySystem** (`src/core/encounters.ts`): vùng → biome → ngày/đêm → thời tiết → sự kiện → loài hợp lệ → tier 60/25/10/4/1 (chuẩn hóa lại khi tier trống) → loài trong tier → cấp → Shiny. Giới hạn mật độ theo chunk / vùng / ngân sách sự kiện.
- **ShinyEncounterSystem**: 1/4096 mỗi Pokémon sinh ra (độc lập với độ hiếm), 1/1024 trong Bùng phát; trạng thái Shiny lưu theo cá thể (giữ qua tiến hóa), Pokédex Shiny, sprite đổi tông palette (phương án dự phòng có ghi rõ) + lấp lánh.
- **WorldEventDirector** (7 loại, có gameplay thật): Bùng phát (đàn + tăng spawn + mục tiêu 6), Pokémon Alpha (to hơn, cấp Elite+2, sát thương ×1.25, hồi chiêu ×0.7, không bị khựng, khó bắt ×2, phần thưởng), Di cư hiếm (đàn đi theo tuyến), Thời tiết dị thường (Giông sét có sét đánh, Bão tuyết mở biome tuyết, Sóng nhiệt mở biome núi lửa, Mưa xối xả, Sương huyền bí; hệ số sát thương theo hệ; hiệu ứng tuyết/nóng/mưa/sương), Huấn luyện viên phục kích, Kho báu ẩn (rương có Pokémon canh giữ), Vùng biến dạng (Pokémon cổ đại/hiếm, cấp cao). Kiểm tra 5 phút / 15 phút, xác suất, ưu tiên, cooldown, tối đa 2 sự kiện (1 lớn), chỉ vùng đã mở khóa, dọn sạch khi kết thúc / rời scene.
- **UI sự kiện**: thông báo dạng bảng pixel, cảnh báo Pokémon hiếm / lấp lánh (không lộ vị trí), bảng theo dõi đếm ngược + tiến độ, đánh dấu trên minimap & bản đồ (kho báu chỉ là vòng ước lượng), tab **Sự kiện** (nhật ký, phím V), đồng hồ hiện thời tiết dị thường. Pokédex: môi trường, độ hiếm, giờ, thời tiết ưa thích, cách gặp, cấp sàn, Shiny đã bắt.
- **LegendaryEncounterManager — 35 huyền thoại / thần thoại Gen 1–4**: 26 điện thờ (20 mới tự động đặt trên đất trống), 7 lang thang (Raikou, Entei, Suicune, Latias, Latios, Mesprit, Cresselia — xuất hiện theo vùng / thời tiết / giờ, bỏ chạy sau 35 s, giữ máu giữa các lần gặp), 3 gặp gỡ không chiến đấu (Celebi lúc bình minh, Jirachi đêm trời quang + thân thiết ≥180, Shaymin ban ngày + thân thiết ≥200), 2 trứng (Manaphy từ Kyogre, Phione khi có Manaphy + Ditto ở Nông Trại). Điều kiện thời tiết / giờ cho điện thờ (Lugia mưa bão, Kyogre mưa lớn, Groudon/Heatran nắng gắt, Regice bão tuyết, Deoxys/Darkrai/Giratina ban đêm). Trạng thái locked → available → active → caught được lưu; huyền thoại đã gia nhập không bao giờ thành bản sao.
- 30 boss huyền thoại sinh tự động (chiêu đặc trưng Aeroblast, Sacred Fire, Roar of Time, Spacial Rend, Shadow Force, Magma Storm, Doom Desire…), chiêu cuối mới: **Dừng thời gian** (Dialga), **Xé không gian** (Palkia), **Phán xét** (Arceus: cả ba kiểu nối tiếp).
- **Chuỗi nhiệm vụ huyền thoại** sinh từ dữ liệu: Thần Điểu → Lugia; Tam Thú → Ho-Oh; Lugia + Ho-Oh → Kyogre / Groudon → Rayquaza → Deoxys; Mewtwo → bộ ba hồ → Dialga / Palkia → Giratina; Regi → Regigigas; … → **Arceus** (cần Dialga, Palkia, Giratina, Mewtwo, Rayquaza).
- **Tải creature theo nhu cầu**: chỉ dựng sẵn art vẽ tay; texture + sheet 14 khung + animation của các loài khác được tạo lần đầu cần đến (texture lúc khởi động 1556 → 616, animation 3072 → 252, heap 42 → 26 MB).
- Save v5: lịch & lịch sử sự kiện, trạng thái huyền thoại (suy ra từ cờ cũ), máu huyền thoại lang thang, trứng, Pokédex Shiny.
- Tests: 165 unit (mới `v3_world`, `v3_legends`, `v3_ai_reach`), 17 e2e (mới `e2e/v3_events.spec.ts`).

### Changed
- Cấp hoang dã theo vùng thay vì theo khu vực cũ; giữ đúng khung đề xuất cho Đồng Cỏ (2–8) & Rừng (7–16), các vùng sau được nén để không chặn chuỗi nhiệm vụ chính (xem TASKS).
- 9 loài Gen 2 thêm ở 0.5.0 nay nằm trong toàn bộ Dex; Magnezone (Gen 4) làm tiến hóa theo địa điểm chơi được thật.

### Fixed
- AI đứng yên khi bộ chiêu mở khóa sớm chỉ có đòn cận chiến nhưng vai trò là tầm xa (Bulbasaur Lv5 chỉ có Vine Whip) — định vị theo tầm thực của bộ chiêu; Sinh tồn không đổi (probe giống hệt).
- Sự kiện hết giờ không trả lại thời tiết / hệ số sát thương (director gỡ sự kiện trước khi controller dọn).
- Huyền thoại lang thang bị hạ không được ghi nhận (tham chiếu bị xóa trước khi xử lý sự kiện chết).

## [0.5.0] — 2026-10-24 — Master Prompt V2: chỉ số, tiến hóa, combat real-time, icon pixel

### Added
- **GAMEPLAY_AUDIT.md**: kiểm tra toàn bộ hệ thống, phân loại hoàn chỉnh / sai / thiếu / tái sử dụng.
- **Chỉ số cá thể**: IV 0–31 + 25 Nature cho Pokémon sở hữu (công thức main-series, EV không dùng); base / calculated / temporary tách riêng (buff là status, không bao giờ ghi vào chỉ số). Save v4 điền IV/Nature cố định theo uid cho Pokémon cũ.
- **Friendship** 0–255 (khởi tạo từ base_happiness PokéAPI): +khi lên cấp, +khi thắng Trainer/Boss, −1 khi gục.
- **Mở khóa chiêu theo cấp** (Phiêu lưu) từ learnset FireRed/LeafGreen, ô 2–4 mở chậm nhất Lv10/20/30; thông báo "X học được Y!". Sinh tồn giữ bộ chiêu thuê đầy đủ (không đổi cân bằng).
- **EvolutionRuleEngine**: mỗi `evolution_details` PokéAPI là một rule, mỗi điều kiện có evaluator riêng (cấp, thân thiết, ngày/đêm, vật phẩm cầm, chiêu đã biết, hệ chiêu, địa điểm→habitat, mưa, chỉ số tương đối; giới tính / trao đổi loài cụ thể được báo "chưa hỗ trợ"). Nhánh rẽ hiển thị đúng các lựa chọn hợp lệ, không ngẫu nhiên. Trade = Linking Cord + vật phẩm cầm (bị tiêu hao). Cache PokéAPI schema v2.
- **9 dạng tiến hóa Gen 2 của loài Gen 1** để các điều kiện mới chơi được thật: Crobat, Blissey (thân thiết), Espeon/Umbreon (thân thiết + ngày/đêm), Steelix, Scizor, Kingdra, Politoed, Slowking (Linking Cord + Metal Coat / Dragon Scale / King's Rock). Vật phẩm mới: Metal Coat, King's Rock (10% khựng), Dragon Scale.
- **Hệ trạng thái real-time**: Sleep (tỉnh khi bị đánh sau 0.6 s), Freeze (đòn Lửa làm tan), Paralysis (−50% tốc độ, 25% tê cứng khi ra đòn), Confusion (33% tự đánh, đi lảo đảo), Flinch (ngắt chiêu, miễn 2 s), Badly Poisoned (sát thương tăng dần, trần ×4). Một trạng thái chính mỗi lúc, miễn nhiễm theo hệ & đặc tính, boss kháng khống chế, trần 8 s, không cộng dồn vô hạn. Bỏng giảm ½ sát thương vật lý (Guts ngược lại).
- **Accuracy** từ PokéAPI cho đòn cận chiến / tia / lao / debuff ("Trượt!"); đạn và AoE vẫn né bằng vị trí. **Flinch chance** từ PokéAPI (Bite, Rock Slide, Air Slash…).
- **AI state machine tường minh** (idle/follow/search/chase/position/attack/cast/dodge/recover/stunned/flee/fainted) với thời gian dừng tối thiểu chống rung.
- **Icon pixel art nguyên bản** (vẽ từ bản đồ ký tự, không emoji, không file ảnh): 18 icon hệ, 14 icon trạng thái, icon cho cả 227 kỹ năng (24 vẽ tay + ghép theo dạng đòn × hệ × loại × sức mạnh × trạng thái × số đòn), icon vật phẩm, đạn pixel riêng 18 hệ. `TypeIconRegistry`, `SkillIconRegistry`, `StatusIconRegistry`, `ItemIconRegistry`, `MoveAssetRegistry`.
- **VFX va chạm riêng từng hệ** (nổ lửa, vòng nước, tia điện, lá, băng vụn, độc, nứt đất, sóng đá, lông vũ, vòng tâm linh, hồn ma, xung rồng, bóng tối, tia thép, lấp lánh tiên, sóng đấm, bầy bọ, sao trung tính), có ngân sách mỗi bước.
- Icon trạng thái trên đầu unit + chữ phản hồi ("Bỏng!", "Tê cứng!", "Tự đánh mình!", "Tỉnh giấc!", "Tan băng!", "Miễn nhiễm", "Trượt!").
- **Màn tiến hóa**: hạt sáng xoay quanh, bỏ qua bằng phím/chạm, bảng chỉ số trước→sau, hệ/đặc tính mới, chiêu mới.
- Chi tiết Pokémon: icon chiêu, loại, sức mạnh, độ chính xác, tầm, cấp mở khóa, Nature/IV/Thân thiết, điều kiện tiến hóa còn thiếu. Thẻ nâng cấp kỹ năng Sinh tồn dùng icon chiêu.
- **Camera pixel-perfect**: zoom chốt bội số 1/3 (mỗi pixel art ×3 luôn là số nguyên pixel màn hình).
- Lá rơi trong rừng (ambient).
- Tests: 139 unit (mới `v2_progression`, `v2_combat`, `v2_assets`), 14 e2e.

### Changed
- Chiêu PokéAPI có ailment ngủ/tê/đóng băng/rối loạn trước đây bị nén thành `stun`/`slow`; nay dùng trạng thái đúng. Đặc tính miễn nhiễm ánh xạ đúng nghĩa (Insomnia → ngủ, Limber → tê, Own Tempo → rối loạn, Inner Focus → khựng…).
- Hệ số bắt theo trạng thái Gen III/IV (ngủ/băng ×2; tê/độc/bỏng ×1.5).
- Playwright giới hạn 3 worker.

## [0.4.0] — 2026-10-24 — Toàn bộ Gen 1

### Added
- **Đủ 151 loài Gen 1** (+ Gulpin/Swalot/Hoothoot/Noctowl, fakemon Canight/Perropello): 132 loài mới sinh tự động từ PokéAPI bằng `scripts/build-gen1.mjs` → `src/data/gen1/{pokemon,skills,spawns}.json` (chỉ số, hệ, đặc tính, nhóm EXP, tỉ lệ bắt, mô tả Pokédex, chuỗi tiến hóa). Tổng 157 loài chơi được + 15 dạng Mega Gen 1.
- **+159 kỹ năng** chuyển từ chiêu PokéAPI (sức mạnh, độ chính xác, hiệu ứng trạng thái, hút máu, hồi máu, đổi chỉ số, đa đòn).
- **Spawn Gen 1 theo môi trường sống** (8 habitat, 169 mục) gộp vào bảng spawn Thung Lũng; huyền thoại/thần thoại không xuất hiện hoang dã.
- **Tiến hóa trade → dùng Linking Cord**; thêm Fire/Water/Moon Stone, Linking Cord và 10 Mega Stone Gen 1 vào túi đồ + cửa hàng.
- **Gói sprite chính thức — chỉ dùng cá nhân** (`node scripts/fetch-official-sprites.mjs`): icon Gen 7 cho thực địa, front 96×96 cho UI/Pokédex/hoạt cảnh tiến hóa. Lưu ở `public/assets/official/` (đã gitignore), **tắt mặc định**, bật trong Cài đặt (tải lại trang).
- **Sprite tạm nguyên bản** (bóng theo hệ) cho loài chưa có bản vẽ khi không bật gói chính thức.
- Cài đặt **"Sinh tồn: toàn bộ Gen 1"**: chọn khởi đầu & chiêu mộ từ cả 157 loài; màn chọn có phân trang.
- UI co giãn sprite theo kích thước thật (`fitScale`) ở đội hình, bộ sưu tập, chi tiết, kết quả, menu, thẻ lên cấp.
- **5 điện thờ huyền thoại** ở Thung Lũng: Articuno (Băng Đài, Hồ Pha Lê), Zapdos (Đỉnh Sấm, Đồi Đá Xám), Moltres (Đền Lửa, Tàn Tích Cổ) mở sau Mega Venusaur; Mewtwo (Vết Nứt Tâm Linh) sau cả ba chim; Mew (Đồi Hoa Huyền Bí) sau Mewtwo. AI `legendary` dữ liệu hóa: tia báo trước, mưa đòn theo vị trí dự đoán, nổ cận thân, vùng độc hại (chậm/tê/bỏng/giảm thủ), quân tiếp viện ở pha 2, chiêu cuối pha 3 (vùng an toàn / bão sét / nan hoa xoay / ngẫu nhiên), chim bay vòng, Mewtwo & Mew dịch chuyển. Hạ lần đầu: huyền thoại gia nhập đội (cấp −8) + vật phẩm riêng (Mewtwo: Mewtwonite X & Y); hồi sinh 15–20 phút. Chuỗi 5 nhiệm vụ tự kích hoạt có đánh dấu bản đồ.
- Tests: 106 unit (mới `tests/gen1.test.ts`, `tests/legendary.test.ts`), 14 e2e.

### Changed
- `survivorPool(save, allSpecies?)`; Boot nạp save trước để biết có bật gói sprite không.
- e2e/unit kiểm tra spawn theo bảng spawn thực tế (valley + gen1) thay vì danh sách cứng.
- World boss tổng quát thành danh sách điểm (grove + điện thờ), tối đa 1 boss hoạt động; kích thước boss theo mật độ sprite.

### Fixed
- e2e chập chờn: test bắt Pokémon giả định tỉ lệ 255 (loài Gen 1 có tỉ lệ thấp hơn); smoke "lên cấp" phụ thuộc tốc độ máy; Playwright giới hạn 3 worker.

## [0.3.0] — 2026-10-24 — IcyEthics assets, Evolution, Equipment, Mega, World Boss

### Added
- **IcyEthics/PokemonAssets** (non-commercial, credit IcyEthics): Diglett, Gulpin, Hoothoot, Paras + fakemon Canight, Perropello as full playable species; in-engine conversion pipeline to the game's pixel density; trainer portraits in dialogue; Dugtrio built from 3 Digletts.
- **Evolution**: PokéAPI chain rules (level / stone), unsupported triggers reported explicitly; Adventure prompt + accept/decline + full evolution animation; stone use from the Bag; Survivor "Tiến hóa" cards (run-only).
- **17 evolved forms + 5 Mega forms** (original pixel art, 18–24 px grids at the same ×3 scale), stats/types/abilities from PokéAPI (`forms`).
- **Equipment**: 18 held items with real combat effects, equip/unequip UI, Shop (Chú Lâm), money system.
- **Mega Evolution**: Key Stone + Mega Stone, G key / MEGA button, 90 s / idle revert / 120 s cooldown, rainbow aura; 4 new passive kinds (Tough Claws, Drought, Mega Launcher, Thick Fat).
- **World Boss Mega Venusaur** in the Sacred Grove: own 3-phase AI (charged Solar Beam lines, Petal Storm rings, Sleep Powder fields, Oddish summons, arena-wide "Ánh Dương" with shade safe spots), respawn timer, unique rewards.
- Engine: damaging line telegraphs, safe-spot zones, data-driven boss AI/sprite/scale, `transformAlly`, `revertMega`, held-item hooks.
- +30 skills (66 total), 2 quests, Mega Stone first-clear dungeon rewards, Pokédex paging + fakemon + Mega info.
- Tests: 94 unit (new `tests/evolution.test.ts`), 15 e2e (new `e2e/evolution.spec.ts`).

### Changed
- Survivor late-game enemy level ramp (+0.12·m²) to compensate evolution/Mega power (bot win rate 9/9 → 2/9).
- Evolution prompts never interrupt dungeon waves (deferred to the reward room).

### Fixed
- Survivor director could pick the Adventure world boss (crash on Oddish summon) — bosses now flag `survivor`.

## [0.2.0] — 2026-10-24 — Graphics overhaul & Open World Adventure

### Added
- **Chế độ PHIÊU LƯU (Open World)**: Thung Lũng Khởi Nguyên 160×128 tile chia 80 chunk tải/giải phóng động; 7 khu; NPC, hội thoại có lựa chọn; 9 nhiệm vụ (chính, phụ, thu phục, thách đấu, khám phá, hầm ngục, boss); trainer battle; giải cứu Pikachu; câu đố phiến đá + rương phong ấn; 5 rương; 4 trạm dịch chuyển (hồi máu + dịch chuyển nhanh).
- **Hệ sinh thái hoang dã**: 9 trạng thái AI, theo giờ/thời tiết/tính khí, spawn ngoài màn hình có giới hạn mật độ, AI LOD.
- **Thu phục**: công thức Gen III/IV với capture rate PokéAPI, Poké/Great/Ultra Ball, lắc bóng, bỏ chạy, UI ngắm hiển thị % bắt.
- **Hầm ngục Hang Đá Cổ**: sóng quái + Elite, hành lang đá rơi, câu đố ghi nhớ, phòng Boss Onix, rương, 3 độ khó có điều kiện mở.
- **Lệnh chiến thuật**: Tự do / Tấn công mục tiêu / Bảo vệ / Đi theo / Giữ vị trí / Rút lui.
- **Tiến trình**: cấp thế giới, % khám phá, danh tiếng, cờ mở vùng, EXP vĩnh viễn theo growth rate PokéAPI.
- **UI**: Main Menu chọn chế độ, Đội hình + chi tiết, Pokédex (nút làm mới PokéAPI), Túi đồ, Nhiệm vụ, Bản đồ thế giới (zoom/pan/fog/dịch chuyển), Cài đặt chất lượng, Ghi công; HUD đồng hồ/thời tiết/nhiệm vụ/minimap/hồi chiêu; nút cảm ứng.
- **GameModeManager** & **Collection chung**: bắt ở Phiêu lưu → dùng trong Survivor; Survivor đạt 10:00 hoặc 2 Boss → loài đã chiêu mộ vào Collection Lv5.
- **PokéAPI**: script đồng bộ (đã chạy thật) + `PokemonDataProvider` (cache bundle → IndexedDB → mạng, retry/timeout/fallback).
- **Asset pipeline**: Kenney Tiny Town & Tiny Dungeon (CC0) + `ASSET_MANIFEST.json` + fallback.
- **Đồ họa**: atlas animation 14 khung/loài (idle, walk, attack, cast, hit, faint), thư viện VFX 18 hệ có pool & chất lượng, nước/cỏ động, cây đung đưa, ngày/đêm + đèn, mưa, sương, hạt môi trường.
- **Nội dung**: +8 loài chơi được (Pikachu, Pidgey, Caterpie, Oddish, Zubat, Rattata, Geodude, Magnemite) — đủ 6 vai trò; +18 kỹ năng (tổng 36); 7 passive mới theo ability thật (Static, Keen Eye, Shield Dust, Chlorophyll, Inner Focus, Guts, Sturdy).
- Save schema **v3** + migration v2→v3.
- Tài liệu: PROJECT_AUDIT, ASSET_AUDIT, API_RESEARCH, GRAPHICS_UPGRADE_PLAN, OPEN_WORLD_DESIGN.
- Test: 74 unit, 9 e2e (thêm Open World, hầm ngục, chuyển chế độ + bộ nhớ có GC, mobile, streaming).

### Changed
- `World` có `mode: 'survivor' | 'adventure'`, kích thước & terrain tùy biến, `spawnWild`, capture, hazard, obstacle theo chunk — Survivor giữ nguyên hành vi (probe cân bằng & e2e cũ vẫn pass).
- Rendering tách khỏi `GameScene` thành `WorldRenderer` dùng chung.
- Survivor chỉ chiêu mộ loài trong Collection/mở khóa (trước đây lấy mọi loài trong data).
- Menu: Enter ở trang chủ → chọn starter Survivor, Enter lần nữa → bắt đầu.

### Fixed
- Crash khi restart scene (tween đã xóa, object đã hủy), bóng trúng nhầm mục tiêu, mưa không hiện, nông trại không spawn, cây thông khó nhìn, sàn rừng kiểu bàn cờ, fog bản đồ lộ địa hình, banner vùng chồng nhau (chi tiết: PROJECT_AUDIT.md §4).

## [0.1.0] — 2026-10-23 — Phase 1 vertical slice

### Added
- Dự án Vite 5 + TypeScript 5.6 (strict) + Phaser 3.88 (WebGL, pixelArt, Scale.RESIZE).
- Mô phỏng thuần TS độc lập FPS (fixed step 60Hz) tách hoàn toàn khỏi Phaser.
- 18 hệ + ma trận khắc hệ, Pokémon hai hệ, công thức sát thương main-series (STAB, crit, variance, buff).
- 3 Pokémon, 18 kỹ năng (projectile, melee, AoE, field, dash, heal, shield, debuff), 3 passive.
- AI vai trò (chọn mục tiêu, giữ khoảng cách, thả diều, né telegraph, leash) + bộ chọn kỹ năng utility.
- 3 kẻ địch + Elite, Enemy Director với đường cong độ khó đa trục và sự kiện bầy đàn có khe thoát.
- Boss Onix nhiều đốt: Rock Throw (đón đầu), Earthquake, Body Slam (telegraph thẳng), Rock Tomb, phase 2, triệu hồi, phần thưởng Sử Thi+.
- Hệ thống nâng cấp roguelite 4 độ hiếm, có giới hạn và stat preview; tuyển Pokémon qua thẻ.
- Map Forest: cây va chạm & chặn đạn, decor, viền.
- Pixel art + icon + VFX sinh hoàn toàn bằng code; SFX tổng hợp WebAudio.
- Menu, HUD (HP, party, cooldown 4 kỹ năng, năng lượng, EXP, timer, kill, minimap, boss bar), thẻ lên cấp, tạm dừng, kết quả.
- Joystick ảo cảm ứng, layout responsive dọc/ngang, tự tạm dừng khi mất focus.
- Save IndexedDB có schema version 2 + migration từ v1, fallback bộ nhớ.
- Overlay profiling; `?debug` (B = Boss, K = lên cấp).
- 40 unit test (Vitest), 4 e2e (Playwright/Edge), probe cân bằng headless.

### Balancing (từ probe bot)
- Pokémon HP ×4, sát thương địch lên Pokémon ×0.7 — trước đó cả đội kiệt sức trước phút 3.
- Đường cong EXP dốc hơn (`4 + 5L + L^1.85`) — trước đó cấp đội vượt xa cấp địch, Boss bị hạ trong vài giây.
- Boss HP ×120 base; Magnemite yếu hơn & bắn mục tiêu gần nhất (trước đó gây 65% sát thương lên HLV).
- Spawn đầu trận nhẹ hơn; vòng bầy đàn chừa khe 20% để thoát.

### Fixed
- Buffer truy vấn spatial grid dùng chung bị ghi đè khi truy vấn lồng nhau (crash `undefined.x`).
- Chuyển phase Boss bị bỏ qua khi Boss đang vận chiêu/lao.
- Boss trắng xóa liên tục do hit-flash; thay bằng tint nhẹ.
- Font Press Start 2P không có dấu tiếng Việt → đổi sang VT323.
