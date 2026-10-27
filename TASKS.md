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
- [x] IMPLEMENTED+TESTED — Vĩnh Long (T23-1): Văn Thánh Miếu, Cù lao An Bình (đò), lò gạch Mang Thít, vườn bưởi Bình Minh, ruộng khoai Bình Tân, 8 nhiệm vụ, 5 HLV, boss Torkoal — Thần Lò Mang Thít, Huy hiệu Gốm Đỏ
- [x] IMPLEMENTED+TESTED — Trà Vinh (T23-2): Ao Bà Om, Chùa Âng, rừng dầu cổ thụ, Chùa Hang (vườn cò), dừa sáp Cầu Kè, biển Ba Động, rừng ngập mặn Duyên Hải, 9 nhiệm vụ, 5 HLV, boss Trevenant — Thần Cây Dầu, Huy hiệu Cây Dầu
- [ ] NOT IMPLEMENTED — 29 tỉnh còn lại (tiếp theo: Bến Tre — cổng Cầu Cổ Chiên đã có, đang khóa), Fly/phà liên tỉnh
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
- [x] Rừng Ngọc Lục Bảo thành bản đồ riêng (`emerald-woods`, V21; Khu Rừng Thiêng vẫn là khu boss trong Thung Lũng)

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
- [x] IMPLEMENTED+TESTED — Relay qua Cloudflare Workers + Durable Objects (thay WebRTC mặc định, chạy được sau 4G / mạng công ty): phòng PvP/co-op/thế giới chung theo mã, tự kết nối lại + gửi bù, Thế giới online chạy trên Durable Object SQLite; e2e hai trình duyệt trên bản triển khai thật (ONLINE_SERVER.md → *Máy chủ Cloudflare*)
- [ ] NOT IMPLEMENTED — quan sát trận (khán giả); trao đổi Pokémon; > 2 người cùng phòng
- [ ] NOT TESTED — điện thoại 4G thật qua relay (đã thử trình duyệt desktop; độ trễ phụ thuộc định tuyến của nhà mạng tới workers.dev)
- [ ] Chống gian lận đầy đủ cần server (P2P chỉ kiểm tra được dữ liệu hợp lệ, không chứng minh được quyền sở hữu)

## V20 — Master Prompt "Complete Game Improvement" (nhánh `improve/complete-game-v1`)
Trạng thái: `[x]` đã làm + build + unit + e2e · `[~]` một phần · `[ ]` chưa làm. Báo cáo: `GAME_AUDIT.md`, `TEST_REPORT.md`.

| ID | Mục tiêu | File đã sửa | Trạng thái | Kiểm thử | Còn tồn tại |
|---|---|---|---|---|---|
| T20-0 | Audit hiện trạng | `GAME_AUDIT.md` | [x] | baseline build + 370/370 unit | — |
| T20-1 | Kỹ năng chủ động: lõi (`requestSkill`, hàng đợi, GCD 1,2 s, giữ chiêu), UI thanh 4 ô, phím Q/T, chuột phải / nhấn giữ, cảm ứng | `src/core/world.ts`, `src/scenes/AdventureScene.ts`, `src/scenes/AdventureUI.ts` | [x] | `tests/v20_active_skills.test.ts` 9/9; e2e `v20_starter` (Q, click, chuột phải, giữ qua thả lại, chạm trên điện thoại dọc, không đè nút) | PvP / khách co-op / lưu giữ chiêu: xong ở T21-1, T21-2; Thế giới online chưa có |
| T20-2 | Làng: Trung tâm Pokémon (PC), y tá hồi phục, bảng nhiệm vụ, biển hướng dẫn, NPC đi lại (`wander`) | `src/data/world/starter-valley.json`, `src/core/map/valley.ts`, `src/scenes/AdventureScene.ts`, `src/render/spriteRegistry.ts` | [x] | `v17_maps` (vật thể trên ô đi được), `v20_starter_valley`, e2e (y tá hồi đầy máu, NPC di chuyển ban ngày và quanh chỗ) | lịch NPC chỉ ngày/đêm |
| T20-3 | Trại Huấn Luyện + chuỗi 3 nhiệm vụ + 2 nhiệm vụ bảng tin | `starter-valley.json`, `src/data/world/quests.json`, `scripts/patch-starter-valley.mjs` | [x] | `v20_starter_valley` (chuỗi từ đầu tới cuối, sai HLV không tiến triển, thưởng 1 lần, cờ mở rương); e2e (vào khu trại, nhận nhiệm vụ qua hội thoại thật) | trận với 3 học viên chưa được e2e đánh trọn (dùng chung luồng HLV đã có test) |
| T20-4 | BUG-NET-1/2: phần thưởng co-op mất khi rớt mạng | `src/net/transport.ts`, `src/net/coop.ts`, `src/net/coopRewards.ts`, `src/net/protocol.ts`, `src/scenes/CoopGuestScene.ts`, `src/systems/saveSchema.ts`, `tests/coop.test.ts` | [x] | `tests/v20_net_reliability.test.ts` 5/5, `coop.test.ts`, `coop_rewards.test.ts` | bộ đệm máy chủ relay: sửa ở T21-0 |
| T20-5 | Tài liệu | `GAME_DESIGN.md`, `MAP_DESIGN.md`, `GAMEPLAY_IMPROVEMENTS.md`, `TEST_REPORT.md`, `CHANGELOG.md`, `TASKS.md` | [x] | — | — |
| T20-6 | Câu cá, thu thập nguyên liệu, lối đi ẩn (Khu 2, 4) | xem T21-3, T22 (chướng ngại khám phá) | [x] | `v22_field_boat` (bụi rậm / đá nứt / tảng đá mở hốc ẩn) | — |
| T20-7 | Nâng cấp các vùng còn lại theo 10 tiêu chí (Phần 2.3) | — | [ ] | — | — |
| T20-8 | Đo hiệu năng trên điện thoại thật | — | [ ] | — | không có thiết bị trong môi trường này |

### V21 — tiếp nối V20
| ID | Mục tiêu | File đã sửa | Trạng thái | Kiểm thử | Còn tồn tại |
|---|---|---|---|---|---|
| T21-0 | Bộ đệm máy chủ relay bỏ tin tạm thời trước | `pokemon-server/src/room.ts` | [~] | typecheck + `wrangler deploy --dry-run` + thử hàm cắt bộ đệm | chưa triển khai (chờ xác nhận) |
| T21-1 | Kỹ năng chủ động PvP + khách co-op (tin tùy chọn), thanh kỹ năng dùng chung | `src/net/protocol.ts`, `src/net/skillWire.ts`, `src/net/duel.ts`, `src/net/coop.ts`, `src/scenes/DuelScene.ts`, `DuelUI.ts`, `CoopGuestScene.ts`, `CoopGuestUI.ts`, `src/ui/SkillBar.ts`, `AdventureUI.ts` | [x] | `v21_remote_skills` (host ra chiêu cho khách, mirror nhận hồi chiêu / giữ chiêu / GCD, epoch sai bị bỏ, không điều khiển Pokémon của chủ phòng); e2e Q trong PvP luyện tập | thanh kỹ năng khách co-op chưa chụp ảnh kiểm trên điện thoại |
| T21-2 | Lưu giữ chiêu vào save (theo mã chiêu) | `src/core/keptSkills.ts`, `src/core/progression.ts`, `AdventureScene.ts` | [x] | unit (tải lại, chiêu mới chèn trước, bỏ hết thì xóa trường); e2e V20 giữ chiêu qua thả lại | — |
| T21-3 | Câu cá Hồ Pha Lê + bụi quả Đồng Cỏ + Ông Sáu + 2 nhiệm vụ | `src/core/gathering.ts`, `src/data/world/gathering.json`, `valley.ts`, `mapProvider.ts`, `saveSchema.ts`, `AdventureScene.ts`, `AdventureUI.ts`, `scripts/patch-valley-gathering.mjs` | [x] | `v21_gathering` (bảng hợp lệ, tung kết quả, cửa sổ phản xạ, hồi điểm + lưu, vị trí trên bờ / phao trên nước, chuỗi nhiệm vụ); e2e câu cá + hái quả bằng phím thật | — |
| T21-4 | Rừng Ngọc Lục Bảo thành bản đồ riêng | `src/data/world/emerald-woods.json`, `regions.json`, `starter-valley.json`, `quests.json`, `regionDefs.ts`, `scripts/build-emerald-woods.mjs` | [x] | `v21_gathering` (đăng ký, cổng 2 chiều, đi bộ tới mọi vật thể), `v17_maps`, `fish live in water`; e2e qua cổng | Rìa Rừng Ngọc vẫn là khu trong Thung Lũng (giữ nhiệm vụ / huyền thoại) |
| T21-5 | Sửa Mega thiếu hình riêng | `scripts/fetch-pmd-megas.py`, `public/assets/pmd/*-mega*`, `src/scenes/BootScene.ts` | [x] | e2e `v21_mega_sprites` + ảnh chụp | 20 dạng Mega chưa có hoạt ảnh PMD (dùng ảnh tĩnh chính thức) |

### V22 — Master Prompt "Adventure & Vietnam Odyssey 2.0" (đang làm theo P0 → P1 → P2)
| ID | Mục tiêu | File đã sửa | Trạng thái | Kiểm thử | Còn tồn tại |
|---|---|---|---|---|---|
| T22-0 | Kiểm tra hiện trạng (danh tiếng, HLV, phà, Alpha, hầm ngục, huyền thoại) | — | [x] | — | danh tiếng chỉ có 1 số chung; HLV không đổi Pokémon, không tái đấu |
| T22-1 | AI huấn luyện viên: 2 trên sân + dự bị, đổi Pokémon khi yếu hệ, gửi dự bị hợp hệ, Potion | `src/core/trainerAI.ts`, `AdventureScene.ts` | [x] | unit (đổi / không đổi / không đổi sang yếu hệ / chọn dự bị / Potion); e2e Cà Mau 2 ra sân + 1 dự bị ra sau khi gục; e2e v8, v13 (HLV cốt truyện) vẫn qua | HLV chưa dùng chiêu phòng thủ riêng (dùng AI chiêu chung) |
| T22-2 | Tái đấu HLV (hồi 10 phút, cấp theo đội, chỉ thưởng tiền) | `trainerAI.ts`, `AdventureScene.ts`, `saveSchema.ts` | [x] | unit (hồi, cấp có giới hạn, tiền); e2e: từ chối khi chưa hồi, tái đấu cấp cao hơn, không lặp vật phẩm, còn sau tải lại | — |
| T22-3 | Danh tiếng theo tỉnh + hạng + quà một lần + NPC chào theo hạng + 3 nhiệm vụ mở bằng danh tiếng | `src/core/reputation.ts`, `src/data/world/reputation.json`, `AdventureState.ts`, `AdventureUI.ts`, `src/data/vietnam/quests.json` | [x] | unit (tách theo vùng, quà không trả lại sau tải lại, nhiệm vụ khóa → mở); e2e lời chào + tải lại | chưa có cửa hàng mở theo danh tiếng |
| T22-4 | Năng lực khám phá: Cắt cây, Đập đá, Đẩy đá + 3 hốc bí mật ở Thung Lũng | `src/core/field.ts`, `src/data/world/field-abilities.json`, `valley.ts`, `mapProvider.ts`, `AdventureScene.ts`, `saveSchema.ts`, `starter-valley.json`, `scripts/patch-v22-field.py` | [x] | unit (ai làm được, vòng chắn chỉ 1 lối, hướng đẩy, rương trong hốc, lưu / tải lại); e2e bấm E thật: bị chặn khi chưa đủ Pokémon, cắt / đập / đẩy, đi vào mở rương, tải lại vẫn mở | *Flash* thêm ở T22-6a (dùng trong hầm ngục); chưa đặt chướng ngại ở các vùng khác |
| T22-5 | Sinh thái Pokémon: đàn (14 loài, đầu đàn, phản ứng chung, tan đàn), lãnh thổ (12 loài, cảnh báo vòng đỏ → tấn công → thôi đuổi khi ra khỏi vùng), điều kiện hiếm (8 quy tắc, 3 riêng Việt Nam) | `src/core/ecologyRules.ts`, `src/data/world/ecology-rules.json`, `src/core/wildAI.ts`, `src/adventure/SpawnManager.ts`, `AdventureScene.ts`, `saveSchema.ts` | [x] | unit 10 (dữ liệu, kích thước đàn / đầu đàn theo cấp, đàn phản ứng chung, tan đàn, lãnh thổ cảnh báo → tấn công → bỏ đuổi, điều kiện hiếm theo giờ / thời tiết / vùng / nước, tỉ lệ, spawner giữ giới hạn); e2e: vòng lãnh thổ, đàn Mightyena, thông báo hiếm + `ecoSeen` | chưa có bảng tra cứu điều kiện hiếm trong Pokédex (chỉ có thông báo khi gặp) |
| T22-6a | Hầm ngục 2.0: biến thể theo ngày (6 loại, thưởng theo hệ số), Flash cho hang tối, bẫy sàn, phòng bí mật sau vách nứt (Đập đá) | `src/core/dungeonMods.ts`, `src/data/world/dungeon-mods.json`, `DungeonController.ts`, `dungeonMap.ts`, `dungeons.json`, `field.ts`, `field-abilities.json`, `AdventureScene.ts`, `AdventureUI.ts` | [x] | unit 8 (biến thể cố định theo ngày, số lượng theo độ khó, thưởng, bầy đàn / tinh anh / địa chấn, vị trí bẫy, bẫy nổ một lần, vách nứt + rương một lần mỗi lượt, Flash); e2e: hang tối khi không có Flash, bẫy, đập vách đi vào lấy rương, có Pikachu thì sáng | chưa có bố cục hầm mới (4 hầm vẫn chung bố cục Hang Đá Cổ) |
| T22-6b | Điều tra huyền thoại: 13 huyền thoại × 3 manh mối, hoàn tất → lộ điều kiện + 1 lượt ném, Pokédex hiện tiến độ | `src/core/legendClues.ts`, `src/data/world/legend-clues.json`, `scripts/gen-legend-clues.ts`, `AdventureScene.ts`, `AdventureUI.ts`, `mapProvider.ts` | [x] | unit 4 (dữ liệu, manh mối trên đất khô đi tới được từ điểm xuất phát, chỉ hiện khi mở khóa / chưa bắt, hoàn tất, tóm tắt điều kiện); e2e Lugia: khóa thì không có manh mối, mở khóa có 3, bấm E từng cái, hoàn tất, cửa sổ bắt 6 lượt, tải lại không hiện lại | WEAKENED / cửa sổ bắt / chống tải save đã có từ V6; chưa có manh mối cho huyền thoại ở Việt Nam Odyssey (chưa có huyền thoại VN) |
| T22-7 | Việt Nam: ghe / xuồng — Cần Thơ 5 bến + Bãi Bồi, Cà Mau 2 bến, An Giang 2 bến, dòng chảy, nước lớn / nước ròng, 4 nhiệm vụ | `src/core/field.ts`, `can-tho.json`, `valley.ts` (cửa sông `mouth`), `AdventureScene.ts`, `AdventureUI.ts`, `src/data/vietnam/quests.json` | [x] | unit (bến trên bờ / nước, mọi bến chung một đường thủy theo từng tỉnh, Bãi Bồi chỉ đến bằng ghe, dòng chảy xuôi, con nước); e2e: khóa khi chưa có ghe, xuống ghe, nước đẩy ghe, không lên bờ ngoài bến, lưu giữa sông → tải lại vẫn trên ghe, lên Bãi Bồi | đồng đội bơi theo ghe (chưa ngồi trong ghe) |
| T22-17 | Đền huyền thoại bước 1: 32 sơ đồ đền (dữ liệu + script sinh), đóng dấu lên bản đồ thay vòng trụ (địa hình tường, vật liệu theo chủ đề, trụ / tượng / pha lê / lư lửa / lõi / tấm nén), dời 22 đền về chỗ thiết kế, manh mối theo đền | `src/core/shrines.ts`, `data/world/shrines.json`, `valley.ts`, `tiles.ts`, `mapProvider.ts`, `AdventureScene.ts`, 7 bản đồ, `legends.json`, `legend-clues.json`, `scripts/gen-shrines.py`, `patch-shrine-sites.py`, `place-shrines.ts`, `check-shrines.ts`, `place-clues.ts` | [x] | unit 8 (32 sơ đồ hợp lệ, arena sạch; tầng; mép đền hòa vào bản đồ nhưng tường quanh sân kín; 22 điểm khớp legends.json; ≤ 4 đền / bản đồ, không chồng nhau, không ở Việt Nam; tường đặc / sân đi được / arena chỉ có cover; không cây ngẫu nhiên trong đền, đủ vật của đền; chỗ làm lễ + arena + mọi NPC / trạm / cổng đi tới được); cập nhật 6 test cũ theo vị trí mới; e2e: 12 đền trên 7 bản đồ (tường, sân, không lỗi), Articuno / Lugia / Rayquaza / Celebi ở chỗ mới | nghi lễ, ảnh đền riêng, bản đồ riêng (Kyogre, Thần Điện), vùng lang thang: bước 2–6 |
| T22-18 | Đền huyền thoại bước 2: nghi lễ bấm E (7 loại bước), chuyển cảnh, arena niêm phong + rời trận, lõi đền 3 trạng thái, nhớ nghi lễ trong save; đi vào đền không còn tự gọi huyền thoại | `src/core/rituals.ts`, `data/world/rituals.json`, `src/adventure/ShrineController.ts`, `AdventureScene.ts`, `saveSchema.ts`, `mapProvider.ts`, `field.ts` | [x] | unit (32 nghi lễ dùng đúng vật có trong sơ đồ, không trùng chuỗi; chạm theo lượt / sai → làm lại; Mew có giờ + thời gian chờ; tấm nén theo thứ tự / ẩn; đứng yên, bão tuyết rút ngắn; đợt; theo chiều kim đồng hồ); e2e Articuno: đứng giữa sân 3 s không có gì, chuỗi cột sai → làm lại, đúng → chuyển cảnh → boss, bị giữ trong arena, rời trận → reset, đánh lại chỉ cần E; Groudon: thiếu Ngọc Đỏ → dừng, đứng yên → boss, lưu giữa trận → tải lại reset, giữ thánh vật | một số nghi lễ giản lược (Regirock: kiểm tra Đẩy đá rồi giẫm 2 hốc thay vì đẩy đá thật) |
| T22-19 | Đền bước 3: 14 ô pixel đền mới (tượng, lõi, cột băng / thu lôi / trắng / gãy, đá rune / sao, hoa héo / nở, phiến trăng, bệ, vách nứt, khe Regi), vật liệu theo đền; ảnh 16 thánh vật | `tiles.ts`, `tileset.ts`, `shrines.ts`, `valley.ts`, `scripts/gen-shrines.py`, `shrines.json`, `scripts/fetch-official-sprites.mjs` | [x] | build + ảnh chụp đền Articuno / Zapdos / Vực Nguyên Hải (chưa có unit riêng cho ảnh) | chưa có 36 ô nền theo 12 chủ đề, lõi riêng từng đền |
| T22-20 | Đền bước 4: 16 thánh vật (nhận theo cờ boss / điều tra), vùng lang thang theo bảng 1.4 + điểm kích hoạt (3 tượng Thú, Đài Gió, Đá Cảm Xúc), Cresselia thành đền, 6 đền mới (Hồ Trăng, Rạn Ấu Hải, Đài Gió, Đá Cảm Xúc, Xoáy Nước Sâu, Cổng Thần Điện), Mew sau vách nứt | `relics.json`, `items.json`, `legends.json`, `rituals.json`, 4 bản đồ, `ShrineController.ts`, `AdventureScene.ts` | [x] | unit (thánh vật là key item có nguồn thật, nhận theo cờ / điều tra; mỗi con lang thang có điểm kích hoạt; `legendary.test` vùng lang thang); e2e Mesprit: Đá Cảm Xúc → cờ `roam:mesprit` | vùng lang thang chưa có dấu vết để lần theo |
| T22-21 | Đền bước 5: 2 mặt phẳng đền — Vực Nguyên Hải (Kyogre) và Thần Điện Khởi Nguyên (Dialga / Palkia / Arceus), vào bằng cổng đền | `regionDefs.ts` (`void`), `valley.ts`, `abyssal-depths.json`, `origin-temple.json`, `AdventureUI.ts` | [x] | unit (cổng dẫn vào nền đi được, cổng về đặt cạnh cổng vào; `v17_maps` 2 mặt phẳng); e2e: Xoáy Nước Sâu (mưa + Ngọc Lam) → Vực Nguyên Hải → nghi lễ → Kyogre | dùng lại ValleyMap thay vì lớp ShrineMap riêng (tránh hệ trùng) |
| T22-22 | Đền bước 6: hiểm họa arena (strike / ring / line / floor), ≤ 2 loại mỗi đền, đổi theo pha boss, có cảnh báo 1 s | `src/core/shrineHazards.ts`, `rituals.json`, `ShrineController.ts` | [x] | unit (≤ 2 loại, cảnh báo ≥ 0,8 s, một loại mỗi lúc đổi theo pha, đòn luôn trong arena, floor = ô `x`); e2e Articuno: hiểm họa xuất hiện trong trận | — |
| T22-23 | Mục "Có gì mới" ở góc phải trên menu chính: danh sách cập nhật (dữ liệu), chấm đỏ số mục chưa đọc, cuộn được; điện thoại dọc dùng nút ✨ và thu gọn tiêu đề | `src/data/whatsnew.json`, `src/core/whatsNew.ts`, `MenuScene.ts` | [x] | unit 2 (dữ liệu hợp lệ, đếm chưa đọc); e2e 3 cỡ màn hình: nút ở góc phải, không đè tiêu đề / phụ đề / thẻ người chơi, có số chưa đọc, mở ra đủ mục + nhãn MỚI, cuộn trong giới hạn, đọc xong mất số (cả sau khi tải lại); `v22_mobile_layout` vẫn qua | thêm mục mới vào `whatsnew.json` mỗi lần phát hành |
| T22-24 | Đền ẩn: không còn đền nào trên bản đồ thường; 10 huyền thoại Tầng 1 có dimension riêng (6 dimension mới + Vực Nguyên Hải, Thần Điện), các đền khác vào Bí Cảnh của từng bản đồ (7 bí cảnh, mỗi đền một khoang kín); 28 lối vào ẩn (sau bụi rậm / tảng đá nứt, hoặc hiện khi đọc đủ manh mối; Lugia / Kyogre chỉ mở khi mưa), nhớ trong save; dimension có thời tiết cố định | `src/core/secrets.ts`, `src/adventure/SecretController.ts`, `valley.ts` (`secrets`, `weather`, nền đền trong mặt phẳng), `regionDefs.ts`, `AdventureScene.ts`, 13 bản đồ mới, 7 bản đồ thường, `legends.json`, `rituals.json`, `shrines.json`, `legend-clues.json`, `scripts/gen-legend-planes.ts`, `gen-shrines.py`, `place-clues.ts` | [x] | unit 7 mới (không đền trên bản đồ thường, mỗi sơ đồ đúng 1 mặt phẳng; mỗi Tầng 1 một dimension riêng; mỗi khoang: từ chỗ đến tới được chỗ làm lễ + arena + cổng về, không sang khoang khác; 28 lối vào tới được, có chướng ngại / manh mối thật, whirlpool trên nước, cổng về đáp cạnh lối vào; cách nhau ≥ 8 ô; logic ẩn / lộ / phong ấn / thời tiết) + cập nhật 4 test cũ; e2e mới: đập đá lộ lối vào Mew → bị phong ấn → vào Bí Cảnh đúng khoang → về cạnh lối vào → tải lại vẫn nhớ; 13 bản đồ mới tải không lỗi; Lugia: xoáy nước đóng khi trời quang, mở khi mưa, trong dimension luôn mưa; Kyogre: ẩn tới khi đủ manh mối | lối vào chưa có hướng dẫn NPC riêng (chỉ manh mối + lấp lánh) |
| T22-25 | Nhiệm vụ theo đền ẩn: mục tiêu huyền thoại chỉ đường theo bước (manh mối → vùng chướng ngại (vòng tròn gần đúng) → lối vào → đền), sổ nhiệm vụ lọc theo bản đồ có lối vào; viết lại 5 nhiệm vụ Gen 1; nhiệm vụ đang theo dõi lưu trong save | `src/core/questGuide.ts`, `quests.ts` (`marker.approx`), `journal.ts`, `AdventureScene.ts` (`shownObjective`), `AdventureUI.ts`, `AdventureState.ts`, `saveSchema.ts`, `quests.json` | [x] | unit 4 mới (mỗi đền trong mặt phẳng có lối vào; vòng tròn chứa chướng ngại; manh mối kế tiếp + đếm; lối vào + mưa; trong dimension → đền; mục tiêu khác giữ nguyên; bộ lọc vùng) ; e2e mới: HUD đổi dòng qua 3 bước, bản đồ vẽ vòng tròn, không lỗi | — |
| T22-26 | Cảnh trí riêng cho 13 dimension / bí cảnh (dữ liệu `decor`); NPC kể tin đồn về khu vực có lối vào ẩn còn thiếu | `valley.ts` (`decor`, `decorAt`), `scripts/gen-legend-planes.ts`, 13 bản đồ mặt phẳng, `questGuide.ts` (`entranceRumor`), `AdventureScene.ts` | [x] | unit: mọi mặt phẳng mới có cảnh trí, vật lớn chỉ trên đất trống 2 ô và ngoài arena (+ các test đường đi cũ vẫn qua); tin đồn: đúng bản đồ, không số, im khi đã tìm / đã dọn, xoay vòng, cổng chung 1 tin; e2e: NPC Bờ Biển kể tin đồn về tảng đá của Zapdos | hoạt cảnh riêng từng loài, nhánh đường giả của Darkrai, ảnh lõi theo 12 chủ đề — chưa |
| T23-1 | Việt Nam Odyssey tỉnh 4 — **Vĩnh Long** (128×112, Lv 22–30): Bến Vĩnh Long, Văn Thánh Miếu, Cù lao An Bình (chỉ đi đò), ruộng khoai Bình Tân, lò gạch Mang Thít (cầu qua kênh), vườn bưởi Bình Minh, sông Tiền / Cổ Chiên; 9 NPC, 5 HLV, giải cứu Phanpy, boss Torkoal — Thần Lò Mang Thít → Huy hiệu Gốm Đỏ; 8 nhiệm vụ; 6 điểm bảo tồn (dọn tro trấu ven kênh); danh tiếng, hộ chiếu (3 địa danh); cổng Cần Thơ mở bằng Huy hiệu Sông Hậu; cổng tới Trà Vinh có sẵn, đang khóa | `src/data/vietnam/vinh-long.json`, `regionDefs.ts`, `passport.ts`, `can-tho.json`, `bosses.json`, `regions.json`, `reputation.json`, `vietnam/quests.json`, `conservation.json` (+ `scripts/gen-conservation.ts` giữ điểm tỉnh cũ, `--all` để sinh lại), `spriteRegistry.ts` | [x] | unit 6 mới (`v23_vinh_long`: cổng 2 chiều đáp đất; đất liền đi bộ tới mọi NPC / HLV / rương / boss, cù lao chỉ bằng đò; chuỗi nhiệm vụ khóa theo huy hiệu, không kẹt cổng boss; đội HLV trên cạn Lv 22–30; Torkoal thắng được với đội Lv 28–30 (Nước 34 s, Cỏ 262 s); hộ chiếu) + cập nhật 4 test cũ; e2e mới `v23_vinh_long`: cổng khóa → mở → Văn Thánh Miếu → đò ra cù lao → HLV → Bác Hai → lò gạch → Torkoal bị niêm phong tới khi hạ thợ lò → hạ boss → huy hiệu, không bắt được → hộ chiếu đủ 3 dấu | Trà Vinh và 29 tỉnh còn lại chưa làm; tileset riêng (dùng chủ đề mekong chung) |
| T25-1 | **Chống đơ game**: một lỗi trong một khung hình từng làm vòng lặp Phaser dừng hẳn (màn hình đứng, phải tải lại trang). `systems/crashGuard.ts` bắt lỗi từng khung (vẫn báo lỗi), lỗi lặp liên tục → lưu ngay + bảng "Lưu và tải lại / Tiếp tục". Hội thoại / tiến hóa / chọn starter dùng `finally` nên không khóa nhân vật. **Không mất tiến trình khi tải lại**: lưu khi ẩn tab / đóng / tải lại trang + bản cứu hộ đồng bộ trong localStorage (thắng bản lưu chỉ khi mới hơn). Test `v25_stability` (unit + e2e) | ✅ |
| T25-2 | **Khởi động nhanh hơn** (đo bản build, CPU chậm 4×, mạng 20 Mbit): ~6,6–7 s → ~4,4–4,8 s tới menu; request trước menu 221 → 32. Ảnh vật phẩm (~170) và HUD boss tải nền sau menu; font tải song song thay vì chặn 2,5 s; ~1000 biểu tượng chiêu vẽ khi cần (`ensureSkillIcon`). Log `[boot]` từng giai đoạn | ✅ |
| T24-1 | NPC về **nhân vật pixel có hoạt ảnh** (thay ảnh trainer Pokémon Showdown): `core/npcLooks.ts` 15 dáng 16×16 (mũ lưỡi trai, cô gái, người leo núi, nhà khoa học, kiểm lâm, cựu binh, nón lá nam/nữ, áo dài, trẻ em, cụ ông, cụ bà, áo choàng…), bộ màu riêng theo id (FNV-1a), giới/tuổi theo danh xưng tiếng Việt, Mekong dùng nón lá; sprite sheet idle/walk (`buildNpcLook`), chân dung hội thoại cùng mẫu; HLV phục kích + thương nhân dùng mẫu ngẫu nhiên. Test `v24_npc_looks_starters`, e2e `v24_npc_starters` | ✅ |
| T24-2 | **Starter Gen 1–9** ở Phiêu lưu cổ điển + Việt Nam Odyssey (`core/starters.ts`, `AdventureUI.pickStarter`): 27 loài, tab theo thế hệ, mở sẵn ở bộ ba của chiến dịch (Kanto / Hoenn), phím 1–3, ←/→, Enter. Sửa: phím chọn starter không còn lọt thành lệnh đội. Sinh tồn / online / Thế giới online không đổi | ✅ |
| T23-2 | Việt Nam Odyssey tỉnh 5 — **Trà Vinh** (128×112, Lv 28–34): thành phố, Ao Bà Om (ao nước + Chùa Âng), rừng dầu cổ thụ, Chùa Hang (vườn cò), vườn dừa Cầu Kè (liếp vườn + mương), bờ sông Cổ Chiên, biển Ba Động (bãi cát, biển phía đông), rừng ngập mặn Duyên Hải (kênh + cầu); 9 NPC, 5 HLV, giải cứu Ducklett, boss Trevenant — Thần Cây Dầu → Huy hiệu Cây Dầu; 9 nhiệm vụ; 6 điểm bảo tồn (nhặt rác bãi biển); danh tiếng, hộ chiếu (Ao Bà Om, Chùa Hang, Biển Ba Động); cổng Vĩnh Long mở bằng Huy hiệu Gốm Đỏ; cổng tới Bến Tre có sẵn, đang khóa | `src/data/vietnam/tra-vinh.json`, `regionDefs.ts`, `passport.ts`, `vinh-long.json`, `bosses.json`, `regions.json`, `reputation.json`, `vietnam/quests.json`, `conservation.json`, `scripts/gen-conservation.ts`, `spriteRegistry.ts` | [x] | unit 6 mới (`v23_tra_vinh`: cổng 2 chiều đáp đất, cổng Bến Tre khóa; mọi NPC / HLV / rương / trạm / cổng / điểm thu thập / rừng boss đi bộ tới được; ao là nước, có cầu; chuỗi nhiệm vụ khóa theo huy hiệu, không kẹt cổng boss, 3 địa danh hộ chiếu; đội HLV trên cạn Lv 28–34; Trevenant thắng được (đội Lửa 33 s, đội Nước bị kháng 230 s); hộ chiếu) + cập nhật 4 test cũ; test điểm câu bắt được 1 điểm câu xa nước → đã dời; e2e mới `v23_tra_vinh`: cổng khóa → mở → trạm → Ao Bà Om (Ông Ba) → Chùa Hang (cò, múa Apsara, Ông Achar) → rừng dầu: Trevenant ngủ tới khi hạ người giữ rừng → hạ boss → huy hiệu, không bắt được → biển Ba Động → hộ chiếu đủ 3 dấu | Bến Tre và 28 tỉnh còn lại chưa làm; tileset riêng (dùng chủ đề mekong chung) |
| T22-16 | Thiết kế bản đồ — An Giang & Cà Mau theo mẫu Cần Thơ: Đồng Nước Nổi thành ruộng ngập + bờ đê (dữ liệu `paddy`), 16 điểm thu thập (5 bảng mới), 4 hốc bí mật, cần câu ở Cà Mau, nhiệm vụ mùa nước nổi; sửa rương trùng id; save cũ đứng trong nước được dời ra | `valley.ts`, `mapProvider.ts`, `AdventureScene.ts`, `an-giang.json`, `ca-mau.json`, `can-tho.json`, `conservation.json`, `gathering.json`, `quests.json`, `scripts/patch-v22-angiang-camau.py` | [x] | unit 10 (ô ngập > 600 ô + lúa đứng, không cây nào chặn bờ đê; mọi ngã tư bờ đê đi tới được từ thị trấn; điểm thu thập hợp lệ, đi tới được, điểm câu có nước gần; hốc bí mật: chướng ngại đi tới được, rương bên trong không tới được cho tới khi phá; id rương duy nhất; NPC / HLV đứng trên đất đi tới được; 2 nhiệm vụ mới); test cũ bắt được biển, 3 điểm bảo tồn, điểm đến cổng rơi xuống nước → đã dời; e2e: điểm câu chưa có cần chỉ tới Tư Sáu, nhiệm vụ ốc len → cần câu, câu trên lạch, cắt rễ đước → rương; ruộng ngập trên màn hình, nhiệm vụ Cô Sáu (mật + bông + câu trên ruộng) hoàn thành, đập đá Thất Sơn → rương | lời thoại NPC hằng ngày chưa nhắc tới ruộng / ốc len |
| T22-15 | Thiết kế bản đồ — Cần Thơ vùng mẫu: miệt vườn thành vườn cây ăn trái thật (liếp cây, luống, mương + cầu ván, theo dữ liệu `orchard`), 5 bụi trái cây, 3 điểm câu trên mương, cần câu tre, 2 hốc bí mật có rương | `src/core/map/valley.ts`, `mapProvider.ts`, `gathering.ts`, `AdventureScene.ts`, `can-tho.json`, `gathering.json`, `quests.json`, `scripts/patch-v22-cantho.py` | [x] | unit 6 (mương + cầu + > 200 cây — trước là 0; mọi NPC / rương / điểm đứng trên đất; toàn bộ miệt vườn đi tới được từ điểm xuất phát (BFS); hốc bí mật kín cho tới khi phá chướng ngại — Cần Thơ và Thung Lũng; bảng thu thập hợp lệ, điểm câu có nước gần; điểm câu hồ ở Thung Lũng giữ nguyên); e2e: mương + cây trên màn hình, điểm câu chưa có cần chỉ tới Ông Sáu, nhiệm vụ hái 2 bụi → cần câu, câu trên mương (phao trên nước, cá cắn câu), bụi rậm chặn → Treecko cắt → vào hốc mở rương | An Giang / Cà Mau: xem T22-16 |
| T22-14 | Hiệu năng: kiểm tra hiện trạng (chunk streaming, culling, pooling, despawn, LOD AI hoang dã đã có); LOD giờ bỏ qua cả bước quét mối đe dọa giữa các tick; test rò rỉ bộ nhớ khi chuyển vùng | `src/core/wildAI.ts` | [x] | unit 3 (200 Pokémon xa: 24 000 → < 1 500 lần quét / 2 s — đối chứng trên bản cũ; gần / hung hăng vẫn chạy mỗi frame; ở xa vẫn đi lang thang, phản ứng lại trong ≤ 0,4 s khi HLV tới gần); e2e: 9 lần chuyển Cà Mau ↔ An Giang ↔ Cần Thơ không tăng listener / timer / tween / object; 150 Pokémon xa đều được giảm tần suất, ~0,1 ms mỗi bước world | chưa đo trên thiết bị di động thật |
| T22-13 | Chiến đấu & bạn đồng hành: combo nguyên tố trong Adventure (6 s / mục tiêu), AI lùi khi yếu + bảo vệ HLV, Pokémon tự hái bụi quả | `src/core/world.ts`, `src/core/synergy.ts`, `AdventureScene.ts` | [x] | unit 5 (combo Adventure + giới hạn 6 s; PvP / Survivor không bị ảnh hưởng; `wounded` chỉ Adventure; Pokémon yếu đánh gần HLV hơn; đi tới điểm việc vặt rồi về); e2e: Bulbasaur tự hái bụi quả (vật phẩm / Pokémon nhảy ra, bụi bắt đầu hồi), giao chiến gọi về, "Hơi Nước!" trong Adventure | kỹ năng chủ động / lệnh / thanh cooldown–năng lượng đã có từ trước; combo chưa có gợi ý trên HUD |
| T22-12 | Nhiệm vụ phân nhánh: mục tiêu `choose`, nhánh lưu trong save + cờ `choice:`, thưởng / lời kết theo nhánh; 3 ngã rẽ (1/tỉnh) + 6 nhiệm vụ nối tiếp loại trừ nhau | `src/core/quests.ts`, `AdventureState.ts`, `AdventureScene.ts`, `AdventureUI.ts`, `scripts/patch-v22-branch.py`, `quests.json` | [x] | unit 4 (chờ lựa chọn, bỏ qua nhánh khác, cộng thưởng; không chọn 2 lần / sớm; giữ sau khi lưu; mỗi hướng chỉ mở đúng nhiệm vụ nối tiếp; dữ liệu hợp lệ — bắt được 2 vật phẩm không tồn tại khi viết); e2e Cần Thơ: nhận → nghe 2 bên → NPC hiện "?" → hộp thoại 3 hướng + suy nghĩ thêm → chọn Chia giờ → nhật ký hiện lựa chọn và chỉ mục tiêu nhánh → tải lại vẫn giữ → hoàn tất +15 danh tiếng, nhiệm vụ nối tiếp của hướng khác vẫn khóa | NPC chưa đổi lời thoại thường ngày theo lựa chọn |
| T22-11 | Sự kiện vùng miền: 6 phiên bản địa phương của sự kiện thế giới (loài / thời tiết / hàng / quà / tên riêng) | `src/core/regionalEvents.ts`, `src/data/world/regional-events.json`, `WorldEventController.ts` | [x] | unit 4 (dữ liệu hợp lệ: vùng, loài không huyền thoại, thời tiết, hàng có trong danh mục, quà; mỗi tỉnh VN có ít nhất 1; chỉ đúng vùng/loại, tỉ lệ ~70%; id sau khi lưu); e2e: Mùa cá linh về (loài đúng, tên, +3 Net Ball khi xong), Lễ hội trái cây (4 món đúng, giảm giá, tiêu đề sạp), Triều cường (mưa lớn) | thêm phiên bản cho vùng khác |
| T22-10 | Bảo tồn + hậu truyện 3 tỉnh: 18 điểm phục hồi, sức khỏe sinh thái theo tỉnh, tăng tỉ lệ Pokémon hiếm, quà Trù phú, 3 nhiệm vụ sau boss | `src/core/conservation.ts`, `src/data/vietnam/conservation.json`, `scripts/gen-conservation.ts`, `scripts/patch-v22-eco.py`, `ecologyRules.ts`, `SpawnManager.ts`, `AdventureScene.ts`, `AdventureUI.ts`, `quests.json` | [x] | unit 4 (điểm ven nước, trong khu, cách nhau; nhiệm vụ sau boss; điểm chỉ hiện sau cốt truyện; sức khỏe / hạng; tỉnh độc lập; tỉ lệ hiếm ×2); e2e Cà Mau: chưa có điểm → hoàn tất Seviper → 6 điểm hiện ngay, bấm E trồng hết, nhiệm vụ đếm đủ, quà Trù phú một lần, tải lại cây vẫn còn, bảng Danh tiếng hiện 100/100 | ghe hàng / NPC chưa nói gì khác theo sinh thái |
| T22-9 | Chợ nổi Cái Răng: 5:00–9:00, 4 ghe, hàng có hạn theo phiên, giảm giá mối quen, nhiệm vụ *Phiên chợ sớm*, đếm ngày trong game | `src/core/floatingMarket.ts`, `src/data/vietnam/floating-market.json`, `AdventureScene.ts`, `saveSchema.ts`, `can-tho.json`, `quests.json` | [x] | unit (giờ họp, ghe trên nước sát bờ, kho theo ngày, giảm giá, không đắt hơn Poké Mart, lưu sổ chợ); e2e: không có chợ buổi trưa, ghe xuất hiện lúc bình minh, mua hết từ bờ, cùng phiên hết hàng, 9 giờ tan chợ, hôm sau có hàng | ghe hàng chưa có hình người bán riêng (dùng hình nông dân) |
| T22-8 | Nhật ký nhiệm vụ (lọc Tất cả / Vùng này / Đã xong), bảng Danh tiếng riêng, bản đồ sương mù + bến ghe + chướng ngại | `src/core/journal.ts`, `AdventureUI.ts` | [x] | unit 4 (nhiệm vụ VN thuộc đúng tỉnh, nhiệm vụ cũ thuộc Thung Lũng, dòng danh tiếng: hạng / tiến độ / còn thiếu / quà, bảng theo chiến dịch); e2e Cà Mau: bảng danh tiếng 3 tỉnh, lọc Vùng này không có nhiệm vụ Cần Thơ, bến ghe hiện trên bản đồ | sương mù bản đồ đã có từ trước (theo chunk đã khám phá) |

## PHASE E — World expansion
- [x] Rừng Ngọc Lục Bảo (V21) và 5 vùng còn lại (Núi Tuyết, Núi Lửa, Thánh Địa, Đầm Lầy, Bờ Biển — 0.7–0.9)
- [x] World Boss ngoài bản đồ (Mega Venusaur — 0.3.0)
- [x] Thêm loài: các dạng tiến hóa + mọi hệ (National Dex 1025 loài, 0.11.0)
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
