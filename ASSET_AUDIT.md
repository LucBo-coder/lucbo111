# ASSET AUDIT

Danh mục máy-đọc-được: [`ASSET_MANIFEST.json`](ASSET_MANIFEST.json).

## Quy chuẩn pixel thống nhất
| Thông số | Giá trị |
|---|---|
| Kích thước tile / sinh vật | 16×16 px gốc |
| Tỉ lệ hiển thị thế giới | ×3 (1 tile = 48 px) — **mọi** tile, sinh vật, NPC, vật thể dùng cùng tỉ lệ |
| Lọc ảnh | nearest-neighbour (`pixelArt: true`, `roundPixels: true`) |
| Viền | 1 px tối (#1a1420) cho sinh vật; viền gốc của Kenney cho môi trường |
| Ngoại lệ có chủ đích | Boss Onix ×5.5 (sinh vật khổng lồ), Elite ×1.35 — phóng to bội số nguyên/gần nguyên, không kéo giãn lệch tỉ lệ |

## Tài nguyên đang dùng
| Tài nguyên | Nguồn | Giấy phép | Dùng cho |
|---|---|---|---|
| `public/assets/kenney/tiny-town/tilemap_packed.png` | Kenney Tiny Town 1.1 | CC0 | mái + tường nhà, hàng rào, biển báo, giếng, tổ ong, khúc gỗ (cỏ, đường đất, lát đá và cây đã được vẽ lại kiểu GBA trong `tileset.ts`, cùng chỉ số ô) |
| `public/assets/ishtar/adventure-awaits/*.png` | [Adventure Awaits Asset Pack 1.0](https://opengameart.org/content/adventure-awaits-asset-pack-10), Ishtar Pixels | CC0 (License.txt trong gói) | 3 nhà cottage (mái đỏ / nâu / xanh, kiểu nhà `style: "cottage"`, khung rộng 3 ô) và 2 cây cổ thụ (cây đứng riêng trên cỏ, còn 2 ô trống quanh gốc). Vẽ ×3 như mọi ô; ô đất / vách / hồ của gói chưa dùng (bảng màu ô-liu khác nền GBA) |
| `public/assets/kenney/tiny-dungeon/tilemap_packed.png` | Kenney Tiny Dungeon 1.0 | CC0 | sàn/tường hang, đuốc, cột, cửa, rương đóng/mở, phiến đá, NPC (giáo sư, nông dân, kiểm lâm…), bình thuốc |
| Sprite 11 Pokémon + HLV + Onix | vẽ bằng pixel map trong `src/render/pixelArt.ts` | nguyên bản | sinh vật |
| Khung animation | `src/render/animation.ts` sinh từ bản vẽ gốc | nguyên bản | xem mục dưới |
| Tile bổ sung | `src/render/tileset.ts` | nguyên bản | nước 2 khung + 15 kiểu bờ × 2 khung, cỏ cao 2 khung, cát, đất đá, ruộng, cỏ rừng sẫm, đá lát tàn tích |
| Vật thể bổ sung | `src/render/tileset.ts` | nguyên bản | tảng đá, cột pha lê dịch chuyển, cửa hang, Poké Ball, icon `!`/`zzz`, sương mù, glow |
| Hạt & hiệu ứng | `src/render/pixelArt.ts`, `vfx.ts` | nguyên bản | 18 preset hệ + tiện ích |
| Âm thanh | WebAudio tổng hợp (`src/systems/audio.ts`) | nguyên bản | 20 SFX |
| Font VT323 | Google Fonts | OFL 1.1 | toàn bộ chữ (có dấu tiếng Việt) |
| Sprite tạm (loài Gen 1 chưa có bản vẽ) | `placeholderGrid` trong `src/render/spriteRegistry.ts` | nguyên bản | hình bóng 16×16 theo màu hệ |
| `public/assets/official/` (tùy chọn) | PokeAPI/sprites qua `scripts/fetch-official-sprites.mjs` | © The Pokémon Company — **chỉ dùng cá nhân**, gitignore, không phân phối | icon thực địa (×2) + front UI khi bật trong Cài đặt |

## Animation — mô tả trung thực
Mỗi Pokémon có **một** bản vẽ gốc 16×16. Lúc khởi động, hệ thống tạo 14 khung bằng phép biến đổi lưới pixel và đóng thành một **sprite atlas** riêng cho từng loài:

| Animation | Số khung | Cách tạo |
|---|---|---|
| Idle | 2 | thân trên dịch 1 px (thở) |
| Walk | 4 | 4 hàng chân dịch ±1 px + nảy 1 px |
| Attack | 2 | thân nghiêng/lao về trước 1–2 px |
| Cast | 2 | viền phát sáng trắng + nhấc 1 px |
| Hit | 1 | lùi 2 px, pha sáng 55 % |
| Faint | 3 | ép dẹt 75 % → 50 % → 25 %, chuyển xám |
| Evolution | — | **chưa có** (chưa triển khai tiến hóa) |

Đây là animation khung hình thật nhưng **dẫn xuất thủ tục**, không phải animation vẽ tay từng khung.

## Tài nguyên còn thiếu
- Animation vẽ tay nhiều khung cho sinh vật.
- Sprite các dạng tiến hóa (Charmeleon, Ivysaur, Wartortle, Metapod, Pidgeotto…).
- Tileset tuyết, dung nham, phế tích lớn cho các vùng tương lai.
- Nhạc nền.

## Ứng viên đã thẩm định (chưa tích hợp) — 2026-10-30
| Gói | Giấy phép | Kiểm chứng | Ghi chú |
|---|---|---|---|
| [Kenney Roguelike/RPG pack](https://opengameart.org/content/roguelikerpg-pack-1700-tiles) | CC0 | đã tải, đọc License.txt | 16×16 cách 1 px, 1700 ô: tường, mái, cửa, cửa sổ, lều, sạp chợ, mộ, giếng, cây, hàng rào cây. Phong cách phẳng, không viền tối — hợp Tiny Town, kém hợp nền GBA |
| [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) (Pixel-boy & AAA) | CC0 theo lời tác giả | itch.io chặn tải tự động (403); chưa đọc file giấy phép | nhiều nhà, cây, đạo cụ 16×16 top-down; cần tải tay + đọc giấy phép trước khi dùng |

## Fallback
`src/systems/assets.ts` ghi lại file tải lỗi; `buildTileset` thay ô bị thiếu bằng lưới màu phẳng để game vẫn chơi được, đồng thời in cảnh báo console. Nhà cottage / cây cổ thụ (Adventure Awaits) không tải được thì vẽ bằng ô Tiny Town (nhà ghép ô, cây tròn 1 ô).
