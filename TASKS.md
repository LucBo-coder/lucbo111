# TASKS

Trạng thái: `[x]` xong & đã kiểm chứng (build + test) · `[~]` có nền móng, chưa đủ spec · `[ ]` chưa làm

## PHASE 1 — Survivor vertical slice ✅ (0.1.0)
- [x] Toàn bộ mục Phase 1 cũ (xem CHANGELOG 0.1.0) — vẫn pass sau nâng cấp 0.2.0

## PHASE A — Project audit ✅
- [x] Kiểm tra repo, engine, combat, database, skill, animation, VFX, asset, UI, save, hiệu năng → `PROJECT_AUDIT.md`
- [x] Nghiên cứu API & asset có kiểm chứng giấy phép → `API_RESEARCH.md`, `ASSET_AUDIT.md`, `ASSET_MANIFEST.json`

## PHASE B — Graphics foundation ✅
- [x] Asset manager đọc manifest + fallback khi tải lỗi
- [x] PokémonDataProvider: Fetch → Validate → Normalize → Cache → Local DB; retry/timeout/fallback; IndexedDB runtime cache (có unit test với fetch giả)
- [x] Script đồng bộ PokéAPI (12 loài, 36 chiêu, growth rate) — đã chạy với API thật
- [x] Sprite pipeline: atlas tile hợp nhất (Kenney CC0 + thủ tục) + atlas riêng từng sinh vật
- [x] Animation system: idle/walk/attack/cast/hit/faint (khung dẫn xuất thủ tục — xem ASSET_AUDIT)
- [x] Animation tiến hóa (0.3.0)
- [x] VFX library 18 hệ, pooled, quality settings, ngân sách hạt
- [x] UI style system (panel/button/badge dùng chung)

## PHASE C — Game mode system ✅
- [x] GameModeManager; chọn chế độ ở Main Menu
- [x] Database / stats / type / skill / animation / VFX / inventory / collection / save dùng chung
- [x] Survivor tách biệt (director, gem, thẻ nâng cấp chỉ chạy ở `mode: 'survivor'`); có test "run Survivor không đổi Collection"
- [x] WorldRenderer dùng chung cho cả 2 chế độ

## PHASE D — Open World vertical slice ✅
- [x] Starter Valley: 7 khu, chunk streaming, va chạm tile + vật thể, camera bounds
- [x] Di chuyển desktop (WASD/Shift/E/M/Tab/F) + mobile (joystick, E, bóng, đội, map, lệnh, chạy)
- [x] Pokémon đi theo theo đội hình
- [x] Hệ sinh thái hoang dã: 9 trạng thái, giờ, thời tiết, tính khí, mật độ
- [x] Auto combat dùng chung engine + 6 lệnh chiến thuật
- [x] Thu phục (công thức Gen III/IV, 3 loại bóng, lắc, bỏ chạy, UI % bắt)
- [x] Quest system (9 nhiệm vụ, 7 loại, theo dõi HUD, nhật ký)
- [x] 1 hầm ngục đủ: sóng quái, Elite, bẫy, câu đố, phòng Boss, rương, 3 độ khó, trạng thái hoàn thành
- [x] 1 Boss (Onix, 2 phase, telegraph)
- [x] NPC & hội thoại có lựa chọn, trainer battle, giải cứu, câu đố môi trường (tàn tích), rương ẩn
- [x] Ngày/đêm, mưa, sương, đèn, hạt môi trường, nước & cỏ động, cây đung đưa
- [x] Save/Load (autosave 20 s + sự kiện); test tải lại trang
- [x] Menu: Đội hình + chi tiết, Pokédex (làm mới PokéAPI), Túi đồ, Nhiệm vụ, Bản đồ thế giới (zoom/pan/fog/dịch chuyển), Cài đặt

## 0.3.0 — Tiến hóa · Trang bị · Mega · World Boss ✅
- [x] Tích hợp IcyEthics/PokemonAssets (6 loài + chân dung), pipeline chuyển đổi mật độ điểm ảnh, ghi công
- [x] Hệ thống tiến hóa theo chuỗi PokéAPI (cấp + đá), từ chối/hỏi lại, hoạt ảnh, báo lý do khi không hỗ trợ
- [x] 17 dạng tiến hóa + 5 dạng Mega (pixel art nguyên bản), dữ liệu PokéAPI
- [x] Trang bị 18 món + cửa hàng + tiền
- [x] Mega Evolution (Key Stone, Mega Stone, G/MEGA, thời lượng, hồi, hào quang)
- [x] World Boss Mega Venusaur 3 phase, cơ chế bóng râm, hồi sinh, thưởng
- [x] Survivor: thẻ tiến hóa/Mega trong run, cân bằng lại
- [x] Sprite cho Swalot, Noctowl, Parasect — có từ khi đồng bộ 493 loài (0.6.0)
- [x] Tiến hóa trade/thân thiết/địa điểm — EvolutionRuleEngine (Linking Cord, thân thiết, môi trường) (0.5.0)
- [x] Trang bị trong Sinh tồn — Pokémon khởi đầu mang vật phẩm của bản trong Bộ sưu tập (0.8.0)
- [~] Tileset IcyEthics: sàn đá/băng cho hầm ngục mới (0.8.0); tileset vùng (Mycor Town, Bog of Yore) là autotile 32 px — chưa ghép

## 0.4.0 — Toàn bộ Gen 1 ✅
- [x] Đồng bộ PokéAPI 151 loài Gen 1 + 285 chiêu + 15 Mega + 40 vật phẩm
- [x] Sinh dữ liệu loài/kỹ năng/spawn tự động (`scripts/build-gen1.mjs`), hợp lệ qua `validateData`
- [x] Tiến hóa trade bằng Linking Cord, đá tiến hóa mới, Mega Stone Gen 1 trong cửa hàng
- [x] Gói sprite chính thức tùy chọn (cá nhân, gitignore) + sprite tạm nguyên bản
- [x] Tùy chọn Sinh tồn toàn bộ Gen 1 + phân trang màn chọn
- [x] Build, 106 unit, 14 e2e, probe cân bằng, kiểm tra trực quan bằng ảnh chụp
- [~] Moveset/vai trò/đặc tính của 132 loài tự sinh là xấp xỉ (chưa tinh chỉnh tay như 40 loài gốc)
- [x] 5 điện thờ huyền thoại (Articuno, Zapdos, Moltres, Mewtwo, Mew): AI `legendary` dùng chung, 3 pha, 4 kiểu chiêu cuối; khóa theo cốt truyện; chuỗi 5 nhiệm vụ (từ 0.8.0: hạ hết phase → Weakened → bắt)
- [x] e2e ổn định: giới hạn 3 worker Playwright, test smoke chơi tới khi lên cấp thay vì số nhịp cố định
- [x] Tiến hóa sang Gen 2–4 — mở từ 0.5.0/0.6.0

## 0.5.0 — Master Prompt V2 (đợt 1)
- [x] Sprint 1 — Audit (`GAMEPLAY_AUDIT.md`), IV/Nature/Friendship, save v4, mở khóa chiêu theo learnset, EvolutionRuleEngine + 9 loài Gen 2, test tiến hóa Phần XIV
- [x] Sprint 2 — 6 trạng thái real-time + quy tắc, accuracy, flinch, burn ½ vật lý, test combat Phần XIV
- [x] Sprint 3 (một phần) — AI state machine tường minh có hysteresis + test không rung/không kẹt; role AI, né telegraph, giữ khoảng cách đã có từ trước
- [x] Sprint 4 (một phần) — camera pixel-perfect; lá rơi
- [x] Sprint 5 — icon 18 hệ, trạng thái, kỹ năng, vật phẩm + registry
- [x] Sprint 6 (một phần) — đạn pixel & va chạm riêng 18 hệ, icon/text trạng thái
- [x] Sprint 7 (một phần) — màn tiến hóa (bỏ qua, chỉ số, chiêu mới), chi tiết Pokémon, thẻ Survivor
- [~] Animation: sprite chính thức + 14 khung dẫn xuất (thở, bước, đòn, niệm, trúng đòn, gục) — không có bộ khung chạy chính thức dùng được cho góc nhìn này
- [x] Đòn & VFX dạng nón (0.7.0)
- [~] VFX riêng từng chiêu: theo dạng đòn × hệ + tên hiệu ứng riêng cho các chiêu tiêu biểu; chưa có hiệu ứng vẽ riêng cho cả 434 chiêu
- [x] Thanh EXP động trên HUD; tuyết; sông & cầu ở vùng mới (0.7.0)
- [ ] Đo hiệu năng trên thiết bị thật (xem PHASE F)
- [x] Tách bundle (0.12.0): code 453 KB / dữ liệu game / dữ liệu PokéAPI / Phaser thành 4 chunk — tải song song, bản cập nhật chỉ sửa code không làm tải lại dữ liệu (tổng dung lượng không đổi; tải lười dữ liệu cần refactor nạp đồng bộ)

## 0.6.0 — Master Prompt V3
- [x] Sprint 1 — đồng bộ & kiểm tra 493 loài (không trùng id, không Gen 5+, chuỗi tiến hóa hợp lệ, type/move hợp lệ)
- [x] Sprint 2 — RegionalLevelManager, BiomeSpawnManager, Rarity 60/25/10/4/1, giới hạn cấp theo giai đoạn tiến hóa
- [x] Sprint 3 — WorldEventDirector + 7 sự kiện có gameplay, cooldown, giới hạn, dọn dẹp
- [x] Sprint 4 — Shiny (1/4096, lưu, Pokédex), UI sự kiện, nhật ký, đánh dấu bản đồ
- [x] Sprint 5–7 — LegendaryEncounterManager: 35 huyền thoại/thần thoại (điện thờ, lang thang, gặp gỡ, trứng), boss AI + 3 chiêu cuối mới, chuỗi nhiệm vụ tới Arceus
- [x] Sprint 8 — save v5 + migration, tải creature theo nhu cầu, 165 unit + 17 e2e, probe cân bằng Sinh tồn không đổi
- [x] Núi Tuyết / Vùng Núi Lửa / Thánh Địa có bản đồ riêng, cổng mở theo cốt truyện, dải cấp đúng đề xuất; loài tuyết/núi lửa hoang dã tại đó; Arceus ở Thánh Địa (0.7.0)
- [~] Hồ / Đồi Đá / Tàn Tích trong Thung Lũng giữ dải 10–20 / 12–24 / 14–26 (nhiệm vụ chính đi qua đó ở Lv8–14); các dải cao của đề xuất nằm ở 3 vùng mới
- [x] Sprite chính thức (gói cá nhân) cho toàn bộ 493 loài + Mega, tự bật, tải theo nhu cầu (0.6.1)
- [x] Shiny chính thức (front Shiny + màu icon lấy từ sprite Shiny thật) khi có gói (0.7.0)
- [~] Không có gói chính thức (máy khác / bản chia sẻ): 470 loài dùng hình bóng tạm, Shiny dùng đổi tông palette
- [x] Huấn luyện viên phục kích có hình người + tên (0.7.0)
- [x] Net / Dusk / Quick / Timer / Luxury Ball (0.7.0)

## 0.8.0 — Master Prompt V4 + save nhiều ô ✅
- [x] 3 ô lưu + màn Tải game + Xóa; Chơi mới xóa sạch ô; migration save cũ → ô 1; save v6
- [x] Bộ UI boss (zip người dùng): kiểm tra alpha/chữ dính/icon gộp, xử lý bằng `scripts/prepare-boss-ui.py`
- [x] BossHUDController dữ liệu thật (HP động + vệt trễ, badge, phase, trạng thái, cảnh báo cast, enrage, bất tử, weakened)
- [x] BossPhaseManager dùng chung (6 state + WEAKENED, 1 lần/phase, đòn vượt nhiều ngưỡng, bất tử có giới hạn, xóa hitbox cũ, không rò rỉ)
- [x] Rayquaza 3 phase + Mega Rayquaza thật (#10079) + Sky Cataclysm
- [x] PokemonSummonManager (summon / recall / switch, khóa + hồi chiêu, phím / chuột / chạm)
- [x] Bắt huyền thoại sau khi hết phase, luật riêng từng boss, không bản sao; checkpoint boss an toàn
- [x] Test boss / Poké Ball / tích hợp (unit + e2e)
- [~] Animation boss: telegraph + bay lên/lao xuống + đổi dạng; không có bộ khung riêng cho từng chiêu

## 0.10.0 — Việt Nam Odyssey (Master Prompt V6) — đợt 1: Cà Mau + An Giang
Trạng thái theo V6: IMPLEMENTED+TESTED · PARTIAL · DATA ONLY · NOT IMPLEMENTED
- [x] IMPLEMENTED+TESTED — chế độ riêng theo ô lưu, menu, sổ nhiệm vụ riêng, migration
- [x] IMPLEMENTED+TESTED — Cà Mau chơi trọn (starter, bắt, nhiệm vụ, HLV, boss khu vực, huy hiệu, lưu/tải, cổng tiếp theo)
- [x] IMPLEMENTED+TESTED — An Giang (giải cứu, câu đố đền, boss, đảo + phà, 3 HLV, 6 nhiệm vụ)
- [x] IMPLEMENTED+TESTED — boss khu vực / starter / giải cứu / câu đố / đảo / loại trừ hệ theo dữ liệu; Hộ chiếu (cơ bản, trong tab Bản đồ)
- [x] IMPLEMENTED+TESTED — Cần Thơ (0.12.0): Bến Ninh Kiều, Chợ nổi Cái Răng, miệt vườn, đồng lúa, vườn cò, Cồn Sơn (đò), 6 nhiệm vụ, 4 HLV, boss Whiscash — Chúa Sông Hậu, Huy hiệu Sông Hậu
- [ ] NOT IMPLEMENTED — 31 tỉnh còn lại (tiếp theo: Vĩnh Long — cổng đã có, đang khóa), Fly/phà liên tỉnh
- [x] National Dex Gen 5–9 — xong ở 0.11.0 (1025 loài)
- [x] IMPLEMENTED+TESTED — EV (0.12.0): yield PokéAPI 1025 loài, 252/510, Power item, Macho Brace, 6 vitamin, 6 berry giảm EV, hiển thị chi tiết Pokémon
- [ ] NOT IMPLEMENTED — Z-Move, Dynamax/Gigantamax, Tera, Primal
- [ ] NOT IMPLEMENTED — Survivor Equipment (Core/Armor/Relic), Crafting, Battle Rulesets, LegendaryQuestManager 7 giai đoạn, Regional Festivals
- [x] IMPLEMENTED+TESTED — Held items: thêm Life Orb / Choice Band·Specs·Scarf / Assault Vest / Rocky Helmet / Eviolite / Sitrus / Focus Sash (0.12.0)
- [x] IMPLEMENTED+TESTED — Hộ chiếu: tab riêng (phím P), dấu "ĐÃ ĐẾN" + ngày đến lần đầu, khu vực / nhiệm vụ / HLV / rương / trạm / câu đố / giải cứu / boss / địa danh / huy hiệu từng tỉnh (0.12.0)

## 0.9.0 — Mở rộng bản đồ, nội dung, màn hình chính, UI ✅
- [x] Đầm Lầy Sương Mù (Lv22–32) + Bờ Biển San Hô (Lv26–38): bản đồ, theme, tile, biome, nhạc, cổng theo cốt truyện
- [x] 7 nhiệm vụ, 6 NPC, 4 huấn luyện viên, 6 rương, 2 trạm
- [x] Màn hình chính động + bố cục điện thoại dọc
- [x] panel/button mới cho toàn game
- [ ] Rừng Ngọc Lục Bảo / Khu Rừng Thiêng thành bản đồ riêng (hiện là khu trong Thung Lũng)

## 0.13.0 — Online
- [x] Thế giới online qua WebSocket: màn đăng ký/đăng nhập, Cà Mau chung, chat, đội/PC/kẹo, bạn bè/nhóm, Alpha/sự kiện; dữ liệu SQLite riêng (xem ONLINE_SERVER.md).
- [x] Sửa tọa độ xuất hiện, phản hồi vị trí bị từ chối, khôi phục vị trí khi đăng nhập lại và chống lùi trạng thái khi gửi lại thao tác cũ.
- [ ] Thế giới server: bắt hoang dã/nhiệm vụ/chiến đấu Adventure đầy đủ, chuyển vùng từ UI và triển khai Internet/WSS (tự kết nối lại: xong ở 0.14.0).

## 0.14.0 — Master Prompt V7 (Online Multiplayer) — trạng thái theo Phần XVIII
Mốc First Playable (Phần XVII), kiểm bằng server thật + client độc lập (unit `ws` + e2e 2 trình duyệt):
- [x] TESTED — 2 tài khoản khác nhau, cùng xuất hiện ở Cà Mau, thấy nhau di chuyển (nội suy, presence delta)
- [x] TESTED — mỗi người gọi 1 Pokémon, thấy Pokémon của người kia, thu hồi / đổi (hồi chiêu + trạng thái summoning/recalling do server giữ, hiệu ứng đồng bộ)
- [x] TESTED — mời nhóm (thẻ lời mời, đồng ý/từ chối), cùng đánh Alpha, nhận EXP + vật phẩm (thưởng nhóm có trần, chỉ tính người đã đánh)
- [x] TESTED — dùng EXP Candy (hộp thoại số lượng + xem trước), tiến hóa sau khi lên cấp, gửi PC, thoát rồi đăng nhập lại còn dữ liệu, tự kết nối lại khi rớt mạng
- [x] TESTED — lịch sự kiện server 10 phút (test dùng chu kỳ ngắn), thông báo trước, hai người cùng tham gia, kết thúc và thưởng đúng một lần
- [x] IMPLEMENTED+TESTED — bảng sự kiện riêng Cà Mau / An Giang / Cần Thơ, có trọng số, không lặp liền, khóa sự kiện huyền thoại theo cấp
- [x] IMPLEMENTED+TESTED — kênh theo vùng (30 người/kênh), interest management theo bán kính, nhắn riêng giữa bạn bè, biểu cảm, chặn/báo cáo, trao trưởng nhóm/giải tán
- [x] TESTED — load test 10/20/30/50 bot trên cùng máy (bảng số liệu trong ONLINE_SERVER.md, `reports/load-test.json`)
- [x] IMPLEMENTED+TESTED — PC online: máy PC tại Trung tâm Pokémon / phòng thí nghiệm (server kiểm tra khoảng cách), hộp thoại box/lưới/tìm/lọc/sắp xếp/chi tiết/di chuyển/khóa/biệt danh, bàn phím + lăn chuột + chạm
- [x] IMPLEMENTED+TESTED — 3 vùng online (Cà Mau, An Giang, Cần Thơ), đổi vùng chỉ qua cổng, cổng huy hiệu mở theo cấp đội, Alpha theo vùng
- [~] PARTIAL — Boss Raid: Alpha chung có thưởng theo đóng góp; chưa có sảnh raid, ready check, nhiều phase, hồi sinh
- [x] IMPLEMENTED+TESTED — khôi phục tài khoản bằng mã khôi phục một lần (không cần e-mail), đổi mật khẩu, tạo mã mới, đăng xuất mọi thiết bị
- [ ] NOT IMPLEMENTED — bắt Pokémon hoang dã / nhiệm vụ / chiến đấu PvE real-time qua server; trao đổi; khôi phục qua e-mail
- [ ] NOT TESTED — máy chủ Internet thật (độ trễ xa), điện thoại thật, > 50 người, nhiều vùng bật cùng lúc dưới tải
- [x] IMPLEMENTED+TESTED — PvP thời gian thực qua WebRTC (PeerJS), phòng bằng mã, 3 luật, đội từ Bộ sưu tập / đội thuê, dự bị + đổi + Mega, đầu hàng, thành tích
- [x] IMPLEMENTED+TESTED — Đi chung thế giới mở + thách đấu tại chỗ (E)
- [x] IMPLEMENTED+TESTED — Engine hai phe, công bằng đã đo (47–54 % đấu gương), tất định
- [x] Luyện tập với máy (offline)
- [~] PARTIAL — Bảng xếp hạng: chỉ thành tích của từng ô lưu (không có server nên không có bảng chung)
- [ ] NOT IMPLEMENTED — TURN relay (một số mạng 4G / công ty chặn WebRTC trực tiếp); quan sát trận (khán giả); trao đổi Pokémon; > 2 người cùng phòng
- [ ] Chống gian lận đầy đủ cần server (P2P chỉ kiểm tra được dữ liệu hợp lệ, không chứng minh được quyền sở hữu)

## PHASE E — World expansion
- [ ] Rừng Ngọc Lục Bảo (cờ mở đã có) và 5 vùng còn lại
- [x] World Boss ngoài bản đồ (Mega Venusaur — 0.3.0)
- [ ] Thêm loài: các dạng tiến hóa + hệ chưa có (Ice, Fighting, Psychic, Ghost, Dragon, Dark, Steel thuần, Fairy)
- [x] Hệ thống tiến hóa (0.3.0)
- [x] Hầm ngục Elemental (Hang Băng, Lò Dung Nham) + Challenge tính giờ (Tháp Thử Thách) (0.8.0)
- [x] Hiệu ứng môi trường: băng/tuyết/bão tuyết, nhiệt dung nham/phun trào (0.8.0)
- [x] Đầm lầy độc — Đầm Lầy Sương Mù (0.9.0)
- [x] Cửa hàng (0.3.0) & Permanent Upgrades (0.8.0)

## PHASE F — Polish
- [ ] Animation vẽ tay
- [x] Tile góc trong cho đường đất (0.8.0)
- [x] Nhạc nền chiptune tự tổng hợp, 9 vòng (0.8.0)
- [x] Synergy & Elemental Combo cho Sinh tồn (0.8.0)
- [ ] Đo trên thiết bị mobile thật — không làm được từ môi trường phát triển (chỉ có Edge headless + viewport mobile)

## Hạn chế đã biết (trung thực)
- Animation là khung **dẫn xuất** từ 1 bản vẽ, chưa phải vẽ tay.
- 6 bản đồ chơi được ở chế độ cổ điển (Thung Lũng, Đầm Lầy, Bờ Biển, Núi Tuyết, Núi Lửa, Thánh Địa) + 4 hầm ngục; Việt Nam Odyssey có 3 tỉnh (Cà Mau, An Giang, Cần Thơ).
- e2e `overworld_visual` (phím F8) thỉnh thoảng lỗi khi chạy song song 3 worker; chạy riêng thì qua (đã thử 3/3).
- OpenGameArt/itch.io: mới xác nhận truy cập, chưa thẩm định từng asset nên **chưa dùng**.
- FPS đo trong e2e là WebGL phần mềm (headless); chỉ số tin cậy là `sim ms`/`frame ms` và số chunk/object/heap.
