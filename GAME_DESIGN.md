# Pokémon Survivor — Game Design

Auto-battle roguelite 2D top-down. Người chơi **chỉ di chuyển** huấn luyện viên (HLV); đội Pokémon tự tìm mục tiêu, tự chọn kỹ năng, tự né đòn. Mục tiêu: sống sót và hạ Boss cuối ở phút 15.

## Vòng lặp chính
1. Chọn Pokémon khởi đầu (Charmander / Squirtle / Bulbasaur).
2. Kẻ địch xuất hiện liên tục ngoài màn hình, ngày càng đông, nhanh, đa dạng.
3. Pokémon tự chiến đấu → kẻ địch rơi **EXP gem** → HLV đi nhặt (bán kính nam châm).
4. Lên cấp → game **tạm dừng**, hiện **3 thẻ nâng cấp** ngẫu nhiên có độ hiếm.
5. Mỗi 5 phút có Boss (5:00, 10:00, 15:00 = Boss cuối). Hạ Boss cuối = chiến thắng.
6. HLV hết HP = thua. Pokémon hết HP chỉ **kiệt sức 15s** rồi hồi sinh 50% HP.

## Điều khiển
| Thiết bị | Di chuyển | Khác |
|---|---|---|
| Desktop | WASD / phím mũi tên | ESC/P tạm dừng · 1/2/3 chọn thẻ · F bật/tắt FPS |
| Mobile | Chạm-kéo bất kỳ đâu (joystick ảo động) | Nút `II` tạm dừng · chạm thẻ |

Game tự tạm dừng khi tab mất focus.

## Chiến đấu (thời gian thực, fixed-step 60Hz)
- Sát thương kiểu main-series: `((2L/5+2)·Power·A/D/50+2) × STAB(1.5) × Hệ × Crit(1.5) × Random(0.85–1) × Modifier`.
- Physical dùng Atk/Def, Special dùng SpA/SpD. Đủ **18 hệ**, Pokémon hai hệ nhân cả hai hệ số. Miễn nhiễm = 0 sát thương (AI không bao giờ dùng chiêu bị miễn nhiễm).
- Modifier gồm: nâng cấp sát thương, cấp kỹ năng, atkUp/defDown, passive Blaze/Torrent/Overgrow (+50% khi HP < 33%).
- Số sát thương: vàng = siêu hiệu quả, xám = kém hiệu quả, cam + `!` = chí mạng, đỏ = phe ta bị đánh.

### Trạng thái
`burn`, `poison`, `leech` (hút máu về người gieo), `slow`, `stun`, `taunt` (kéo aggro), `atkUp`, `defDown`. DoT tính theo %HP tối đa; Boss kháng 94%, Elite kháng 60% để DoT không phá game.

## Vai trò AI
| Vai trò | Chọn mục tiêu | Di chuyển |
|---|---|---|
| Tank | kẻ địch gần HLV nhất / đang đánh HLV | lao vào cận chiến, Withdraw = khiên + taunt |
| Fighter | gần bản thân | áp sát tầm cận chiến |
| Assassin | máu thấp nhất, né Boss | vòng ra sau mục tiêu, nhanh hơn 15% |
| Marksman | gần nhất | giữ 75% tầm bắn, thả diều |
| Mage | cụm địch đông nhất | giữ khoảng cách, thả diều |
| Support | gần HLV | đứng cạnh đồng đội yếu nhất, hồi máu |

Mọi vai trò: dính chặt mục tiêu (+45 điểm) để không giật mục tiêu, cộng điểm theo lợi thế hệ, **ưu tiên tuyệt đối thoát khỏi vùng cảnh báo** của địch, dịch chuyển về HLV nếu bị kéo quá 700px.

### Chọn kỹ năng (utility scoring, không ngẫu nhiên)
Theo đúng thứ tự spec: (1) mục tiêu trong tầm, (2) hết cooldown, (3) đủ năng lượng, (4) lợi thế hệ × STAB, (5) số địch trong vùng ảnh hưởng (AoE/field/đa đạn), (6) đồng đội cần hồi máu, (7) bản thân gặp nguy (khiên). Chi phí năng lượng có trọng số cơ hội. Xem `src/core/skillSelector.ts`.

## Pokémon (Phase 1)
| Pokémon | Hệ | Vai trò | Kỹ năng |
|---|---|---|---|
| Charmander | Fire | Mage | Ember (đạn, burn) · Flame Burst (AoE) · Fire Spin (vùng lửa) · Scratch |
| Squirtle | Water | Tank | Tackle · Water Gun · Withdraw (khiên+taunt) · Bubble (3 đạn, slow) |
| Bulbasaur | Grass/Poison | Support | Vine Whip · Razor Leaf (2 đạn xuyên, crit cao) · Synthesis (hồi máu) · Leech Seed |

HP Pokémon = HP công thức × 4 (để đứng được trong combat real-time); sát thương địch lên Pokémon × 0.7.

## Kẻ địch
| Địch | Hệ | Hành vi | Xuất hiện |
|---|---|---|---|
| Rattata | Normal | Melee bầy đàn | 0:00 |
| Magnemite | Electric/Steel | Ranged, giữ khoảng 210px, bắn Thunder Shock (slow) | 0:50 |
| Geodude | Rock/Ground | Tank chậm, trâu, đánh mạnh | 2:20 |
| **Elite** (mọi loại) | — | ×4 HP, to hơn, viền vàng, +2 cấp, ×5 EXP, 50% rơi Oran Berry | tăng dần tới 7% |

## Boss: Onix (Rock/Ground)
- Thân rắn 6 đốt bám theo quỹ đạo đầu, trườn uốn lượn.
- **Rock Throw**: 3 (phase 2: 6) vòng tròn cảnh báo 1.0s, ngắm *đón đầu* HLV và đồng đội.
- **Earthquake**: vòng cảnh báo 230px quanh Boss 1.5s, khi HLV ở gần.
- **Body Slam**: cảnh báo dạng đường thẳng 0.9s rồi lao 460px.
- **Rock Tomb** (chỉ phase 2): vùng đá gây sát thương + làm chậm 4s.
- **Phase 2** (<50% HP): banner, rung màn hình, triệu hồi 5 Geodude Elite, nhanh +25%, hồi chiêu ×0.7.
- **Phần thưởng riêng**: mưa EXP gem, Oran Berry, hồi 50% HP đội, và **thẻ nâng cấp Sử Thi+**.
- Boss 10:00 và 15:00 mạnh hơn theo cấp; Boss cuối ×1.5 HP.

## Enemy Director — độ khó không chỉ là HP
- Tốc độ spawn: `0.6 + 0.5m + 0.012m²` con/giây (m = phút), giới hạn `16 + 13m` (trần cứng 260–300).
- Cấp địch `3 + 2.6m`; tốc độ di chuyển +1.8%/phút; ranged bắn nhanh hơn (aggression +4%/phút, tối đa ×1.6).
- Mở khóa loại địch mới theo thời gian, ramp-in trọng số trong 60s.
- Tỉ lệ Elite tăng dần.
- **Sự kiện bầy đàn** 2:30 / 7:30 / 12:30: vòng Rattata khép lại quanh HLV, luôn chừa **khe 20%** để thoát.
- Khi Boss sống, spawn thường giảm còn 35%.

## Nâng cấp roguelite
Độ hiếm: Thường 62% · Hiếm 26% · Sử Thi 10% · Huyền Thoại 2% (giá trị ×1 / 1.6 / 2.4 / 3.5).
| Thẻ | Giới hạn |
|---|---|
| Pokémon mới (gia nhập đội) | đội tối đa 6 |
| Nâng cấp kỹ năng (+15%×độ hiếm sức mạnh, −4% hồi chiêu/cấp) | cấp 5 |
| Sức mạnh +8% | +80% |
| Hồi chiêu −5% | −40% (tổng với cấp kỹ năng ≤ 60%) |
| Sinh lực +10% | +100% |
| Phạm vi AoE +10% | +60% |
| Chí mạng +4% | +40% |
| Tốc chạy +6% | +40% |
| Nam châm +20% | +150% |
| Năng lượng +10% | +80% |
| Đa phóng +1 đạn (chỉ Sử Thi+) | +2 |
Mọi giới hạn nằm trong `src/data/upgrades.json`. Khi mọi thứ đã max, thẻ dự phòng là Oran Berry (hồi 50%). Mỗi thẻ hiển thị **stat preview** (`hiện tại → sau khi chọn (tối đa)`).

## Bản đồ: Forest (Phase 1)
3200×3200px, ~95 cây có va chạm; **cây chặn đạn** (che chắn = yếu tố địa hình của Forest), hàng rào bụi ở biên. Kẻ địch đi lạc quá xa được tái định vị gần người chơi.

## Cân bằng (đo bằng bot headless, `scripts/balance.test.ts`)
Bot ngây thơ (không né đòn, chọn thẻ đầu tiên trừ khi có Pokémon mới) qua 9 run: thắng 3/9, các run thua chết ở 8:30–12:00. Người chơi thật biết né vùng cảnh báo sẽ dễ hơn — phù hợp vertical slice với 3 Pokémon.
