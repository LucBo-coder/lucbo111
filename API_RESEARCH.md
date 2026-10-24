# API & NGUỒN DỮ LIỆU — NGHIÊN CỨU

Tất cả kết luận dưới đây được kiểm chứng trực tiếp ngày 2026-10-24 (request HTTP thật từ máy phát triển).

## 1. PokéAPI — https://pokeapi.co
| Mục | Kết quả |
|---|---|
| Truy cập | `GET /api/v2/pokemon/1` → 200 |
| Điều khoản | Fair Use Policy: không giới hạn cứng, yêu cầu **cache cục bộ** và không spam. Dữ liệu/tên Pokémon © Nintendo / Game Freak / The Pokémon Company |
| Endpoint dùng | `/pokemon/{name}`, `/pokemon-species/{name}`, `evolution_chain.url`, `/move/{name}`, `/growth-rate/{name}` |
| Đã tích hợp | 12 loài · 36 chiêu · 2 growth rate (`medium`, `medium-slow`) → `src/data/pokeapi/pokeapi-cache.json` (31 KB) |

### Quy trình Fetch → Validate → Normalize → Cache → Local Database
1. **Fetch** (`scripts/sync-pokeapi.mjs`, chạy lúc build): tuần tự, nghỉ 80–120 ms giữa request, `AbortController` timeout 12 s, retry 3 lần với backoff lũy thừa.
2. **Validate**: 1–2 hệ, 6 chỉ số nguyên dương, capture rate 1..255, damage class hợp lệ, bảng growth đủ 100 cấp & bắt đầu từ 0. Sai → dừng, **giữ nguyên cache cũ**.
3. **Normalize**: đổi tên stat (`special-attack` → `spa`…), sắp hệ theo slot, ghép flavor text FireRed, làm phẳng chuỗi tiến hóa, lọc learnset FRLG level-up.
4. **Cache**: ghi JSON có `meta.fetchedAt`, `previousFetch`.
5. **Local database**: game chỉ đọc bản bundle; `PokemonDataProvider` (runtime) đọc theo thứ tự *bộ nhớ → bundle → IndexedDB `pokeapi-cache` → mạng*. Mạng **chỉ** dùng khi người chơi bấm "Làm mới PokéAPI" trong Pokédex (timeout 8 s, retry 2, fallback cache). Không bao giờ gọi mỗi frame hay mỗi đòn đánh.

### Dữ liệu PokéAPI được dùng thật trong gameplay
- **Base stats & hệ** của 11 loài chơi được — test `tests/adventure.test.ts` khẳng định khớp 100% cache.
- **Kiểu & loại sát thương** của cả 36 kỹ năng — có test đối chiếu.
- **Capture rate** → công thức bắt (Pikachu 190, Pidgey/Caterpie/Rattata 255, Onix 45…).
- **Growth rate** → EXP vĩnh viễn (vd. Charmander Lv5 = 135 EXP theo bảng `medium-slow`).
- **base_experience** → EXP nhận được khi hạ Pokémon.
- **Abilities, flavor text, chiều cao, cân nặng, chuỗi tiến hóa, shortEffect của chiêu** → Pokédex & chi tiết Pokémon.
- Sức mạnh chiêu **có chủ đích lệch** bản gốc ở vài chiêu để hợp combat thời gian thực (vd. Flame Burst 70 → 60); test chỉ khóa hệ & loại sát thương, không khóa power.

## 2. PokeAPI/sprites — https://github.com/PokeAPI/sprites
| Kiểm tra | Kết quả |
|---|---|
| Front/back/shiny PNG | có, 96×96, gần như mọi loài |
| Animated GIF (BW) | `versions/generation-v/black-white/animated/{id}.gif` tồn tại cho **#1–#649**; **#650 → 404** |
| `other/showdown` GIF | có cho phần lớn loài (sprite > #650 là của cộng đồng Smogon) |
| Giấy phép | `LICENCE.txt`: *"All image contents within are Copyright The Pokémon Company."* — CC0 chỉ áp dụng cho repo |
| **Quyết định** | **Không đóng gói, không hotlink.** Sprite mặc định là pixel art nguyên bản vẽ bằng code |
| **0.4.0** | Theo yêu cầu dùng cá nhân của chủ dự án: `scripts/fetch-official-sprites.mjs` tải icon Gen 7 (40×30) + front (96×96) về máy vào `public/assets/official/` (gitignore, tắt mặc định). Không nằm trong repo/bản phân phối |

## 3. Pokémon Showdown — https://github.com/smogon/pokemon-showdown
| Kiểm tra | Kết quả |
|---|---|
| Giấy phép mã | MIT (`LICENSE` đọc trực tiếp) |
| Sprite | lưu ở `play.pokemonshowdown.com/sprites`, là hình ảnh Pokémon có bản quyền → **không dùng** |
| Đã tham khảo | cách tổ chức dữ liệu (pokedex/moves/typechart tách riêng, khóa id dạng chuỗi) → áp dụng cho `pokemon.json`/`skills.json` |
| Không dùng | engine theo lượt; **không sao chép mã** |

## 4. Kenney — https://kenney.nl/assets
| Gói | Giấy phép | Tình trạng |
|---|---|---|
| Tiny Town 1.1 | CC0 (đọc `License.txt` trong zip) | **Tích hợp** — đất, đường, cây, hàng rào, nhà, biển báo, giếng |
| Tiny Dungeon 1.0 | CC0 | **Tích hợp** — sàn/tường hang, cửa, rương, NPC, bình thuốc, phiến đá |
| Particle Pack | CC0 | **Loại** — hạt mịn độ phân giải cao, lệch phong cách pixel 16px |
| Tiny Ski, Pixel Platformer | CC0 | Ứng viên cho vùng tuyết/núi (chưa tải) |

## 5. OpenGameArt / itch.io
- Đã xác nhận truy cập được (OpenGameArt 200). **Chưa đánh giá từng asset** — giấy phép trên hai nền tảng thay đổi theo từng file/gói (CC0, CC-BY, CC-BY-SA, GPL, hoặc giấy phép riêng cấm phân phối lại trong repo mở).
- Quy tắc trước khi dùng bất kỳ file nào: mở trang asset, chép nguyên văn giấy phép, lưu file license cạnh asset, thêm bản ghi vào `ASSET_MANIFEST.json`. Chưa có asset nào từ hai nguồn này trong repo.

## 6. Kết luận
- Dữ liệu: **PokéAPI** (đã tích hợp, có cache & fallback).
- Môi trường/UI: **Kenney CC0** (đã tích hợp).
- Hình Pokémon: **nguyên bản** (vẽ bằng code); không dùng sprite chính thức.
- Mã nguồn bên thứ ba bị sao chép: **không có**.
