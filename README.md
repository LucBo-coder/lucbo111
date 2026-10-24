# Pokémon Survivor

Fan-made Pokémon game (Phaser 3 + TypeScript) với 2 chế độ:
- **Sinh tồn** — auto-battle roguelite 15 phút.
- **Phiêu lưu** — thế giới mở 2D: khám phá, thu phục, nhiệm vụ, hầm ngục.

Pokémon tự chiến đấu — bạn di chuyển, chỉ huy và thu phục.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build production vào dist/
npm test           # 229 unit test (Vitest)
node scripts/sync-pokeapi.mjs   # đồng bộ lại dữ liệu PokéAPI (151 loài Gen 1 + bổ sung)
node scripts/build-dex.mjs      # sinh src/data/dex/* (493 loài, kỹ năng, sinh thái, boss huyền thoại) từ cache PokéAPI
node scripts/fetch-official-sprites.mjs   # (TÙY CHỌN, CHỈ DÙNG CÁ NHÂN) tải sprite Pokémon (thường + Shiny), vật phẩm (PokeAPI) và huấn luyện viên (Pokémon Showdown) vào public/assets/official/
npm run e2e        # Playwright (dùng Microsoft Edge đã cài sẵn), cần build trước
npx vitest run --config scripts/vitest.balance.ts   # probe cân bằng bằng bot
npx vitest run --config scripts/vitest.legend.ts    # probe cân bằng từng boss huyền thoại
```

Tài liệu: [GAME_DESIGN.md](GAME_DESIGN.md) · [OPEN_WORLD_DESIGN.md](OPEN_WORLD_DESIGN.md) · [EVOLUTION_EQUIPMENT_MEGA.md](EVOLUTION_EQUIPMENT_MEGA.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PROJECT_AUDIT.md](PROJECT_AUDIT.md) · [API_RESEARCH.md](API_RESEARCH.md) · [ASSET_AUDIT.md](ASSET_AUDIT.md) · [GRAPHICS_UPGRADE_PLAN.md](GRAPHICS_UPGRADE_PLAN.md) · [TASKS.md](TASKS.md) · [CHANGELOG.md](CHANGELOG.md)

Dự án fan, phi thương mại. Pokémon là thương hiệu của Nintendo / Game Freak / The Pokémon Company. Sprite Pokémon mặc định được vẽ lại bằng code (không kèm hình chính thức). **Gói sprite chính thức** (`fetch-official-sprites.mjs`, © The Pokémon Company, nguồn PokeAPI/sprites) chỉ để dùng cá nhân trên máy bạn: thư mục `public/assets/official/` đã gitignore — **không commit, không chia sẻ thư mục đó hay bản `dist/` có chứa nó**; môi trường dùng Kenney Tiny Town / Tiny Dungeon (CC0); sprite Diglett, Gulpin, Hoothoot, Paras, Canight, Perropello và chân dung trainer của **IcyEthics** (github.com/icyethics/PokemonAssets — dùng phi thương mại, dự án dẫn xuất phải miễn phí & cho phép chỉnh sửa); dữ liệu từ PokéAPI.
