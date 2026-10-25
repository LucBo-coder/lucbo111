# Pokémon Survivor

Fan-made Pokémon game (Phaser 3 + TypeScript) với 2 chế độ:
- **Sinh tồn** — auto-battle roguelite 15 phút.
- **Phiêu lưu** — thế giới mở 2D: khám phá, thu phục, nhiệm vụ, hầm ngục.

Pokémon tự chiến đấu — bạn di chuyển, chỉ huy và thu phục.

**Online** (0.13.0): menu chính → *⚔ Đấu online* — tạo phòng / vào bằng mã 6 ký tự, đấu đội thời gian thực; hoặc trong Phiêu lưu → Cài đặt → *Chơi online cùng bạn* để đi chung thế giới và thách đấu nhau. Kết nối WebRTC trực tiếp giữa hai trình duyệt (PeerJS), không cần server riêng. Thêm `?net=local` để chơi 2 tab trên cùng máy.

**Hồ sơ người chơi**: thẻ ở sảnh chính hiển thị avatar, tên, ô lưu, số Pokémon/Pokédex/xu và thành tích; bấm *✎ Hồ sơ* (hoặc chạm avatar) để chọn một trong **8 avatar pixel** và đặt tên 1–16 ký tự. Avatar + tên lưu theo thiết bị nên không mất khi chơi mới hay đổi ô lưu; tên là thứ bạn bè thấy khi đấu online / co-op. Sảnh đấu online dùng chung hồ sơ này. Avatar cũng chính là nhân vật của bạn trong thế giới mở, co-op và đấu PvP: hai người chơi thấy đúng avatar của nhau, và đổi avatar khi đang online thì bên kia đổi theo ngay.

**Co-op PvE (2 người)**: Sinh tồn → Esc → *Co-op cùng bạn*; Phiêu lưu / Việt Nam Odyssey → Cài đặt → *Co-op: cùng đánh quái*. Chủ phòng tạo mã, khách chọn tham gia bằng mã. Cả hai cùng đánh quái và boss; khách theo chủ phòng khi chuyển vùng hoặc vào hầm ngục. Khách mang tối đa 3 Pokémon, điều khiển WASD/Shift hoặc kéo bên trái màn hình, chạm quái để tập trung tấn công, phím \` và 1–5 để ra lệnh. Đứng gần người bị gục 3 giây để cứu; đi cách chủ phòng quá 900 px sẽ được đưa về cạnh họ.

Chủ phòng xử lý mô phỏng và tương tác cốt truyện, chọn nâng cấp Sinh tồn. **Chiến lợi phẩm được chia cho cả hai**: Pokémon hoang dã chủ phòng bắt được, đồ trong rương, phần thưởng hầm ngục và xu cuối lượt Sinh tồn đều được cộng vào ô lưu riêng của khách (hiện trên HUD khách). Nhiệm vụ, cờ cốt truyện và huy hiệu vẫn chỉ thuộc chủ phòng để không phá tiến trình chiến dịch của khách; khách không mất Pokémon/HP vì chuyến hỗ trợ. Tham gia từ Sinh tồn kết thúc lượt riêng đang chơi. Hai máy cần cùng phiên bản giao thức; co-op dùng giao thức v2. Cả hai thấy avatar đã chọn của nhau và hoạt ảnh tấn công/cast của Pokémon bên kia; ở thế giới mở, Pokémon dẫn đầu của bạn cũng diễn hoạt ảnh đi/đánh/cast trên màn hình người kia.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build production vào dist/
npm test           # unit tests (Vitest)
node scripts/sync-pokeapi.mjs   # đồng bộ lại dữ liệu PokéAPI (151 loài Gen 1 + bổ sung)
node scripts/sync-ev-yield.mjs  # đồng bộ EV yield của 1025 loài từ PokéAPI → src/data/pokeapi/ev-yield.json
node scripts/build-dex.mjs      # sinh src/data/dex/* (493 loài, kỹ năng, sinh thái, boss huyền thoại) từ cache PokéAPI
node scripts/fetch-official-sprites.mjs   # (TÙY CHỌN, CHỈ DÙNG CÁ NHÂN) tải sprite Pokémon (thường + Shiny), vật phẩm (PokeAPI) và huấn luyện viên (Pokémon Showdown) vào public/assets/official/
npm run e2e        # Playwright (dùng Microsoft Edge đã cài sẵn), cần build trước
npx vitest run --config scripts/vitest.balance.ts   # probe cân bằng bằng bot
npx vitest run --config scripts/vitest.legend.ts    # probe cân bằng từng boss huyền thoại
```

Tài liệu: [GAME_DESIGN.md](GAME_DESIGN.md) · [OPEN_WORLD_DESIGN.md](OPEN_WORLD_DESIGN.md) · [EVOLUTION_EQUIPMENT_MEGA.md](EVOLUTION_EQUIPMENT_MEGA.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PROJECT_AUDIT.md](PROJECT_AUDIT.md) · [API_RESEARCH.md](API_RESEARCH.md) · [ASSET_AUDIT.md](ASSET_AUDIT.md) · [GRAPHICS_UPGRADE_PLAN.md](GRAPHICS_UPGRADE_PLAN.md) · [TASKS.md](TASKS.md) · [CHANGELOG.md](CHANGELOG.md)

Dự án fan, phi thương mại. Pokémon là thương hiệu của Nintendo / Game Freak / The Pokémon Company. Sprite Pokémon mặc định được vẽ lại bằng code (không kèm hình chính thức). **Gói sprite chính thức** (`fetch-official-sprites.mjs`, © The Pokémon Company, nguồn PokeAPI/sprites) chỉ để dùng cá nhân trên máy bạn: thư mục `public/assets/official/` đã gitignore — **không commit, không chia sẻ thư mục đó hay bản `dist/` có chứa nó**; môi trường dùng Kenney Tiny Town / Tiny Dungeon (CC0); sprite Diglett, Gulpin, Hoothoot, Paras, Canight, Perropello và chân dung trainer của **IcyEthics** (github.com/icyethics/PokemonAssets — dùng phi thương mại, dự án dẫn xuất phải miễn phí & cho phép chỉnh sửa); dữ liệu từ PokéAPI.
