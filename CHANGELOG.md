# Changelog

## Chưa phát hành — co-op PvE
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
- **Ảnh huấn luyện viên** (Pokémon Showdown trainer sprites, 80×80) cho mọi NPC của cả 4 vùng (Giáo sư → Oak, Bác Tư → Rancher, Kiểm lâm → Pokémon Ranger, Y tá → Nurse, Chủ tiệm → Gentleman, Người leo núi → Hiker, Nhà địa chất → Scientist, Nhà tiên tri → Psychic…), huấn luyện viên đối chiến và huấn luyện viên phục kích (Ace Trainer, Blackbelt, Beauty, Veteran, Cyclist, Skier): sprite ngoài sân + **chân dung trong hội thoại** (mọi câu trong cuộc nói chuyện, lời thách đấu / thắng / thua).
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
