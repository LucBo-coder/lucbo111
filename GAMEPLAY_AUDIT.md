# GAMEPLAY AUDIT (Master Prompt V2)

Ngày: 2026-10-24 · Phạm vi: toàn bộ `src/` (≈10.3k dòng TS), dữ liệu `src/data/`, test `tests/` + `e2e/`.
Đánh giá dựa trên đọc mã nguồn + chạy test, không phỏng đoán. Cột "Hành động" là việc đã/ sẽ làm trong đợt V2.

## 1. Đã hoàn chỉnh (giữ nguyên, chỉ mở rộng)
| Hệ thống | Bằng chứng | Ghi chú |
|---|---|---|
| Engine Phaser 3 + World fixed-step 60 Hz | `src/core/world.ts`, `GameScene`/`AdventureScene` | sim tách khỏi render, dùng chung 2 chế độ |
| Bảng khắc hệ 18 hệ (Gen 6+), hệ kép, miễn nhiễm | `src/core/typeChart.ts` + `tests/core.test.ts` | đã đối chiếu từng dòng với bảng chính thức |
| Công thức sát thương kiểu main-series (Level, Power, A/D vật lý–đặc biệt, STAB 1.5, crit 1.5, random 0.85–1, modifier) | `src/core/damage.ts` | real-time: power đã được nhân theo cooldown của skill khi chuyển từ PokéAPI |
| Chỉ số riêng từng loài từ PokéAPI (base stats), tính theo level | `src/core/stats.ts`, `src/data/gen1/pokemon.json` | role không ghi đè base stats |
| Nhóm tăng trưởng EXP chính thức (6 growth rate) | `src/core/progression.ts` | Adventure dùng EXP thật, Survivor dùng EXP run riêng |
| Tiến hóa level/đá/trade (Linking Cord), Mega, prompt + animation | `src/core/evolution.ts`, `AdventureScene.playEvolution` | giữ uid, level, exp, held item |
| Pooling: projectile, zone, gem, particle; spatial grid | `world.ts` (`zones`, `projectiles` reuse), `spatialGrid.ts`, `vfx.ts` | đo trong `e2e/perf.spec.ts` |
| Chunk streaming + culling bản đồ | `ChunkView.ts` | |
| Save IndexedDB v3 + migrate | `systems/save.ts`, `saveSchema.ts` | |
| Pixel-perfect: `pixelArt: true`, `roundPixels: true`, nearest-neighbour | `src/main.ts` | |

## 2. Hoạt động nhưng chưa đúng / chưa đủ spec
| Vấn đề | Chi tiết | Hành động |
|---|---|---|
| Tiến hóa chỉ hiểu `level-up` (có min_level), `use-item`, `trade` | cache v1 chỉ lưu `trigger/minLevel/item` → thân thiết, thời gian, vật phẩm cầm, chiêu đã biết, địa điểm, mưa bị báo "chưa hỗ trợ" | cache schema v2 (đủ `evolution_details`) + `EvolutionRuleEngine` với evaluator theo từng điều kiện |
| Không có độ thân thiết (Friendship) | `OwnedPokemon` thiếu field | thêm `friendship` (khởi tạo từ `base_happiness` của loài), tăng khi lên cấp/chiến đấu, giảm khi gục |
| Không có IV / Nature | công thức stat = base + level (tương đương IV 0) | thêm IV 0–31 + 25 Nature cho Pokémon sở hữu; Survivor giữ "thuê" trung tính để không đổi cân bằng |
| Chiêu không mở khóa theo cấp | 4 skill luôn có ngay từ Lv1 | `skillUnlockLevel` từ learnset FRLG (PokéAPI), nén theo ô kỹ năng |
| Không có Accuracy (đòn không bao giờ trượt) | `SkillDef` thiếu `accuracy` | thêm accuracy từ PokéAPI, trượt có phản hồi "Trượt!" |
| Trạng thái thiếu: Sleep, Freeze, Paralysis, Confusion, Flinch, Badly Poisoned | chỉ có burn/poison/slow/stun/atkUp/defDown/leech/taunt | thêm 6 trạng thái real-time có thời lượng, giới hạn cộng dồn, quy tắc giải trừ |
| AI không có state machine tường minh | hành vi ẩn trong `allyThink`/`allyMove`; không debug được trạng thái | `aiState` tường minh (Idle/Follow/Chase/Position/Cast/Dodge/Stunned/Fainted…) có thời gian tối thiểu chống rung |
| Hiển thị trạng thái chỉ tô màu sprite | `WorldRenderer` tint theo status đầu tiên | icon trạng thái pixel trên đầu unit |

## 3. Còn thiếu
| Thiếu | Hành động |
|---|---|
| Icon pixel 18 hệ (hiện là nhãn chữ trên nền màu) | vẽ 18 icon pixel 10×10, dùng trong badge, chi tiết, thẻ |
| Icon riêng cho kỹ năng (hiện 1 icon `icon_skill` chung) | `SkillIconRegistry`: glyph hệ × dạng đòn + icon vẽ tay cho các chiêu tiêu biểu |
| Registry asset tập trung (move → icon/VFX/SFX/projectile) | `MoveAssetRegistry` |
| Icon trạng thái, icon vật phẩm | vẽ pixel |
| Màn tiến hóa hiển thị thay đổi chỉ số / chiêu mới, nút bỏ qua | nâng cấp `playEvolution` |
| EXP bar animation khi nhận EXP | nâng cấp HUD đội hình |

## 4. Có thể tái sử dụng
`chooseSkill` (skillSelector), `dangerVector` (né telegraph), `addZone`/`lineHit`/`areaHit`, `VFX.named`, `typeBadge`, `drawMap` (vẽ pixel từ chuỗi), `PokemonDataProvider` (cache + validate + fallback), `QuestManager`.

## 5. Cần thiết kế lại
Không hệ thống nào cần viết lại toàn bộ. Combat engine được mở rộng (status, accuracy, AI state), không thay thế.

## 5b. Trạng thái xử lý (đợt V2-1)
| Mục mục 2/3 | Trạng thái | Kiểm chứng |
|---|---|---|
| Tiến hóa đủ điều kiện | ✅ `EvolutionRuleEngine` | `tests/v2_progression.test.ts` |
| Friendship, IV, Nature | ✅ | `tests/v2_progression.test.ts` |
| Mở khóa chiêu theo cấp | ✅ (Phiêu lưu) | `tests/v2_progression.test.ts` |
| Accuracy, 6 trạng thái mới | ✅ | `tests/v2_combat.test.ts` |
| AI state machine | ✅ | `tests/v2_combat.test.ts` |
| Icon hệ / trạng thái / kỹ năng / vật phẩm | ✅ | `tests/v2_assets.test.ts` + ảnh chụp e2e |
| Màn tiến hóa: chỉ số, chiêu mới, bỏ qua | ✅ | e2e `evolution.spec.ts` |
| EXP bar animation | ⏳ chưa | — |

## 6. Giới hạn trung thực
- Sprite Pokémon mặc định là pixel art nguyên bản cho ~40 loài; 117 loài còn lại dùng hình bóng tạm theo hệ, trừ khi người chơi tự bật gói sprite chính thức (dùng cá nhân, không phân phối).
- Animation sinh từ 1 bản vẽ (14 khung dẫn xuất: idle/walk/attack/cast/hit/faint), không phải vẽ tay từng khung.
- Các điều kiện tiến hóa dẫn tới loài ngoài Gen 1 vẫn bị khóa (đích chưa có trong game) dù engine đã hiểu điều kiện.


## V3 (0.6.0) — quy tắc sinh thái & sự kiện
- **Biome**: habitat PokéAPI (grassland→đồng cỏ, forest→rừng, waters-edge/sea→hồ, cave/mountain/rough-terrain→đồi đá/tàn tích, urban→nông trại); Gen 4 (không có habitat) suy ra từ hệ; hệ Băng thêm biome *tuyết*, hệ Lửa thêm *núi lửa* (hai biome này chưa có trên bản đồ → chỉ qua sự kiện thời tiết). Baby chỉ ở Nông Trại.
- **Độ hiếm**: theo tỉ lệ bắt (≥190 phổ biến · ≥120 ít gặp · ≥60 hiếm · ≥25 rất hiếm · thấp hơn cực hiếm); dạng giữa tối thiểu "ít gặp", dạng cuối tối thiểu "hiếm"; pseudo-legendary cơ bản (Dratini, Larvitar, Bagon, Beldum, Gible) cực hiếm.
- **Cấp sàn**: cấp tiến hóa thật từ loài trước (đá / trao đổi / thân thiết: 20 cho dạng giữa, 30 cho dạng cuối); một loài chỉ vào pool của vùng có cấp tối đa ≥ cấp sàn.
- **Sự kiện chỉ-sự-kiện (30 loài)**: starter các thế hệ, hóa thạch, Porygon, Spiritomb, Rotom, Castform, Kecleon + loài tuyết/núi lửa — xuất hiện qua Bùng phát, Vùng biến dạng, Bão tuyết / Sóng nhiệt.
- **Save/Load của sự kiện**: lịch kiểm tra, cooldown, lịch sử được lưu; sự kiện đang chạy kết thúc khi rời scene / tải lại (không để lại Pokémon, rương, thời tiết).
