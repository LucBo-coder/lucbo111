# Architecture

```
src/
  core/            ← mô phỏng thuần TypeScript, KHÔNG import Phaser (test được bằng Vitest)
    types.ts         kiểu dữ liệu (18 hệ, Pokémon, Skill, Enemy, Boss)
    data.ts          nạp JSON + validateData() kiểm tra tham chiếu chéo khi boot & trong test
    typeChart.ts     ma trận khắc hệ 18×18
    damage.ts        công thức sát thương
    stats.ts         công thức chỉ số, đường cong EXP
    skillSelector.ts AI chọn kỹ năng (utility scoring, hàm thuần)
    director.ts      Enemy Director + các đường cong độ khó
    upgrades.ts      roll 3 thẻ nâng cấp, độ hiếm, giới hạn
    spatialGrid.ts   hash grid cho truy vấn lân cận
    rng.ts           PRNG có seed (mulberry32) → mô phỏng tái lập được
    world.ts         World: entity, AI vai trò, kỹ năng, đạn, vùng, trạng thái, EXP, Boss
  data/*.json      ← toàn bộ nội dung game (data-driven)
  render/pixelArt.ts  sinh toàn bộ texture pixel-art từ pixel map lúc boot (0 file ảnh)
  systems/
    audio.ts         SFX tổng hợp bằng WebAudio (0 file âm thanh), có throttle
    saveSchema.ts    schema save + migration (thuần, test được)
    save.ts          IndexedDB + fallback bộ nhớ
  scenes/
    BootScene        validate data → sinh texture → load save
    MenuScene        chọn starter, âm thanh, thống kê
    GameScene        chạy World theo fixed step, render đồng bộ, VFX, damage number
    UIScene          HUD, minimap, thẻ lên cấp, tạm dừng, joystick ảo, banner
    ResultScene      kết quả, sát thương từng Pokémon, chơi lại
tests/             Vitest: core + world simulation + save
e2e/               Playwright (Edge): smoke desktop/mobile + stress hiệu năng
scripts/           probe cân bằng (headless bot chơi 9 run)
```

## Nguyên tắc
1. **Simulation tách khỏi rendering.** `World.step(dt)` không biết đến Phaser. GameScene chỉ đọc state và phát VFX từ `world.drainEvents()` (dmg, heal, vfx, sfx, death, banner, shake...).
2. **Độc lập FPS.** GameScene tích lũy delta và gọi `world.step(1/60)` với accumulator, tối đa 6 bước/frame (chống spiral-of-death). Test `fixed step` xác nhận kết quả giống nhau bất kể cách gom frame.
3. **Data-driven.** Thêm Pokémon/kỹ năng/kẻ địch = thêm JSON. `validateData()` bắt lỗi id sai, thiếu trường bắt buộc theo `kind`, số kỹ năng ≠ 4, hệ không hợp lệ.
4. **Tái lập.** Mọi ngẫu nhiên đi qua `Rng` có seed → bot cân bằng và test xác định.

## Luồng một bước mô phỏng
```
director.update → spawn / boss / swarm
grid rebuild (enemies)
trainer move → allies (AI tick 0.18s, so le theo id) → enemies (AI tick 0.3s) → boss pattern
separation (qua grid) → projectiles → zones (telegraph/blast/field) → statuses (DoT)
gems (magnet/collect/EXP) → cleanup → kiểm tra thua/thắng/lên cấp
```

## Kỹ năng
`kind` quyết định thực thi: `projectile | melee | aoe | field | beam | dash | heal | shield | buff | debuff`.
- `telegraph` > 0 → tạo Zone cảnh báo; sát thương khi hết delay (AI đồng minh đọc các zone này để né).
- Dash có telegraph → zone dạng `line` chỉ để hiển thị, đơn vị khóa hướng trong lúc vận chiêu.
- Va chạm tiếp xúc của địch dùng pseudo-skill sinh từ `contactPower` để đi chung pipeline sát thương.

## Hiệu năng
| Kỹ thuật | Ở đâu |
|---|---|
| Spatial grid (72px) | truy vấn địch: chọn mục tiêu, AoE, đạn, tách đám đông |
| Obstacle grid tĩnh (128px) | va chạm cây, đạn chạm cây |
| AI tick scheduling | đồng minh 0.18s, địch 0.3s, so le theo id |
| Projectile pool | 600 slot cố định, sprite 1:1 |
| Zone/gem pool | tái sử dụng object, gem cap 450 (gộp giá trị khi đầy) |
| Particle limits | mỗi emitter `maxParticles: 260` |
| Damage text pool | 90 Text, ≤30 số mới/frame |
| Animation culling | địch ngoài camera (+120px) ẩn sprite, không cập nhật |
| Entity cap | Director 260, cứng 300 |
| Không pathfinding | steering + đẩy khỏi chướng ngại, không A* |
| Profiling | `F` hoặc menu Tạm dừng → FPS, frame ms, sim ms, entity, particle, heap |

Đo (Edge headless, 260+ entity): sim ≈ 0.2–0.8 ms/frame, tổng CPU frame ≈ 0.4–3 ms.

## Save (IndexedDB)
`pokemon-survivor` / store `save` / key `main`. `SaveData.version` hiện là 2; `MIGRATIONS[n]` nâng từ n → n+1; `migrate()` luôn deep-merge vào default để trường mới luôn tồn tại. Đã lưu: settings, Pokémon mở khóa, permanent upgrades (khung), currency, achievements (khung), run statistics.

## Debug
`?debug` trên URL: `B` gọi Boss ngay, `K` cộng 1 cấp. `window.__game` để kiểm tra trong console/e2e.


---

# 0.2.0 — Kiến trúc hai chế độ

```
src/
  core/                    (thuần TS, không Phaser)
    world.ts               combat engine DÙNG CHUNG — mode 'survivor' | 'adventure'
    wildAI.ts              máy trạng thái hệ sinh thái hoang dã (gọi lại skill selector/cast của World)
    capture.ts             công thức bắt Gen III/IV
    progression.ts         EXP vĩnh viễn theo growth rate PokéAPI, OwnedPokemon
    quests.ts              QuestManager (mục tiêu tuần tự, điều kiện, phần thưởng)
    map/                   MapProvider: valley.ts (terrain thủ tục + layout JSON), dungeonMap.ts (ASCII), tiles.ts, noise.ts
  adventure/               logic phiêu lưu thuần (có unit test)
    AdventureState.ts      Collection, đội hình, túi, nhiệm vụ, cấp thế giới, khám phá
    SpawnManager.ts        spawn theo sinh cảnh/giờ/thời tiết, giới hạn mật độ, despawn
    DungeonController.ts   waves → hazard → puzzle → boss → reward
  render/
    WorldRenderer.ts       render DÙNG CHUNG (sprite + animation, đạn, telegraph, thanh máu, số sát thương)
    animation.ts           atlas 14 khung/loài từ bản vẽ gốc
    vfx.ts                 thư viện VFX 18 hệ, pool, quality
    tileset.ts             atlas 'ow_tiles' (Kenney CC0 + thủ tục)
    ChunkView.ts           tilemap theo chunk, load/unload theo camera
  systems/
    gameMode.ts            GameModeManager (chỉ 1 chế độ chạy tại một thời điểm)
    pokemonDataProvider.ts PokéAPI provider (bundle → IndexedDB → mạng)
    assets.ts              asset manager đọc ASSET_MANIFEST.json
    saveSchema.ts          schema v3 + migration
  scenes/
    MenuScene              chọn chế độ, starter Survivor, cài đặt, ghi công
    GameScene/UIScene/ResultScene   Survivor
    AdventureScene         Open World + hầm ngục (cùng scene, khác MapProvider)
    AdventureUI            HUD, hội thoại, menu Đội/Pokédex/Túi/Nhiệm vụ/Bản đồ/Cài đặt, nút cảm ứng
  data/world/              starter-valley.json, quests.json, dungeons.json
  data/pokeapi/            pokeapi-cache.json (build-time)
scripts/sync-pokeapi.mjs   đồng bộ PokéAPI
public/assets/kenney/      tileset CC0 + License.txt
```

## Cách hai chế độ chia sẻ engine
| Tính năng | Survivor | Adventure |
|---|---|---|
| Director/gem/thẻ nâng cấp | bật | tắt |
| Kích thước & va chạm | 3200² + cây | theo MapProvider + `Terrain` (tile) + obstacle theo chunk |
| Đồng minh chọn mục tiêu | mọi kẻ địch | chỉ kẻ địch `hostile` + lệnh chiến thuật |
| Kẻ địch | `spawnEnemy` (enemies.json) | `spawnWild` (pokemon.json, 4 kỹ năng thật) + wildAI |
| Cái chết của kẻ địch | rơi gem | sự kiện `death` → scene cộng EXP/quest |
| Trainer gục | game over | bất tỉnh → hồi ở trạm |

## Luồng streaming
`ChunkView.update(camera.worldView)` → nạp chunk trong khung + 1 chunk đệm, gỡ chunk ngoài khung + 2 (trễ) → `onChunkLoad` tạo ảnh vật thể, đăng ký obstacle (tag `chunk-N`), interactable, đèn; `onChunkUnload` hủy tất cả. Terrain tính lười từng ô và nhớ trong mảng byte (20 KB cho cả vùng); vật thể chỉ tồn tại khi chunk được nạp. Đo: tối đa 24/80 chunk, ≤ 2.4k object.
