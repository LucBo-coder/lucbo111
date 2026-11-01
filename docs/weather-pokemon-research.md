# Pokémon và thời tiết: nghiên cứu làm cơ sở thiết kế sự kiện

Ngày: 2026-11-01. Tài liệu này chỉ phân tích và đề xuất, chưa có thay đổi code nào đi kèm.

## 0. Nguồn và cách đọc

**Ba nhóm thông tin luôn được tách riêng:**

- **[Chính thức]**: Ability, chiêu hoặc luật trong các game Pokémon chính.
- **[Lore]**: Pokédex hoặc cốt truyện mô tả. Đây **không phải** cơ chế chiến đấu.
- **[Đề xuất]**: ý tưởng thiết kế cho game này, không phải khả năng chính thức.

**Nguồn đã đối chiếu trong phiên này:**

- **PokéAPI** (dữ liệu trích từ các game chính, có cờ Ability ẩn):
  - Ability: `https://pokeapi.co/api/v2/ability/<tên>`, ví dụ `drizzle`, `drought`, `sand-stream`, `sand-spit`, `snow-warning`, `primordial-sea`, `desolate-land`, `delta-stream`, `orichalcum-pulse`, `air-lock`, `cloud-nine`, `forecast`, `flower-gift`.
  - Chiêu: `https://pokeapi.co/api/v2/move/<tên>`, ví dụ `rain-dance`, `sunny-day`, `sandstorm`, `hail`, `snowscape`, `chilly-reception`, `max-geyser`, `max-flare`, `max-rockfall`, `max-hailstorm`, `weather-ball`.
  - Văn bản Pokédex theo từng phiên bản game: `https://pokeapi.co/api/v2/pokemon-species/<loài>` (trường `flavor_text_entries`). Phần trích dẫn bên dưới ghi kèm tên phiên bản.
- **Serebii, trang Weather** (`https://www.serebii.net/games/weather.shtml`), dùng cho:
  - thời lượng thời tiết từ X & Y trở đi;
  - Heavy Rain, Extremely Harsh Sunlight, Strong Winds;
  - sương mù (Fog);
  - thời tiết trên bản đồ của từng game.
- **Dữ liệu của project**:
  - `src/data/pokeapi/pokeapi-cache.json`, `src/data/dex/megas.json`, `src/data/pokemon.json`, `src/data/world/legends.json`, `src/data/dex/ecology.json`;
  - `src/core/battleWeather.ts`, `src/core/worldEvents.ts`, `src/core/encounters.ts`.

**Những chỗ chưa xác minh được trong phiên này** (Bulbapedia chặn truy cập tự động, HTTP 403):

- **Chưa xác minh:** đổi Ability theo thế hệ của Gigalith (PokéAPI hiện ghi Sand Stream là Ability thường, nhưng không rõ từ thế hệ nào) và của Torkoal, Pelipper.
- **Chưa xác minh:** luật Snow thay Hail trong Scarlet/Violet. Trang Serebii về Snow bị lỗi hiển thị.
- **Chưa xác minh:** thứ tự kích hoạt khi hai Ability thời tiết vào sân cùng lúc.
- **Chưa xác minh:** thời lượng 8 lượt khi cầm đá kéo dài (Damp/Heat/Smooth/Icy Rock).
- **Chưa xác minh:** chi tiết anime. Báo cáo này **không dùng anime làm nguồn**.

Các mục trên được ghi là "kiến thức chung, chưa đối chiếu trong phiên này" ở chỗ có nhắc tới.

---

## 1. Hiện trạng trong project

### 1.1 Đã hỗ trợ: Pokémon gọi thời tiết (`src/core/battleWeather.ts`)

- **Cách hoạt động trong game:**
  - Đặc tính thời tiết được kích hoạt khi Pokémon vào trận, hoặc khi người chơi bấm phím C / nút thời tiết.
  - Thời tiết kéo dài 40 s; dạng Primal là 90 s.
  - Mỗi lúc chỉ có một thời tiết; cái mới thay cái cũ.
  - Phạm vi là **toàn bản đồ đang chơi**, không giới hạn quanh Pokémon gọi.
- **Loài có trong dữ liệu game** (`*` = Ability ẩn; khớp với PokéAPI):
  - Drizzle: Kyogre, Pelipper, Politoed*
  - Drought: Groudon, Torkoal, Vulpix*, Ninetales*, Mega Charizard Y (qua passive của dạng Mega)
  - Sand Stream: Tyranitar, Hippopotas, Hippowdon, Gigalith, Mega Tyranitar
  - Sand Spit: Silicobra, Sandaconda
  - Snow Warning: Snover, Abomasnow, Vanilluxe, Amaura*, Aurorus*, Mega Abomasnow
  - Orichalcum Pulse: Koraidon
  - Primordial Sea / Desolate Land: Primal Kyogre / Primal Groudon (`megas.json`)
- **Không phải cá thể nào cũng gọi được.** Pokémon hoang dã được chọn ngẫu nhiên đặc tính, nên ví dụ Politoed chỉ gọi mưa khi trúng Ability ẩn. Boss dùng Ability *thường* của loài.

### 1.2 Lệch so với bản chính thức, hoặc còn thiếu

| # | Vấn đề | Chi tiết |
|---|---|---|
| 1 | **Sand Spit sai điều kiện kích hoạt** | Bản chính thức (PokéAPI): "Creates a sandstorm **when hit by an attack**", tức là kích hoạt khi bị trúng đòn. Game đang cho Silicobra/Sandaconda gọi bão cát ngay khi vào trận. |
| 2 | Dạng Primal / Mega có thể không gọi thời tiết khi biến hình | Cờ `weatherCalled` chỉ đặt một lần mỗi lần ra sân. `transformAlly` không đặt lại cờ này. Hệ quả: Kyogre đã gọi Mưa rồi Primal Reversion sẽ **không** gọi Mưa lớn 90 s. Tương tự với Tyranitar → Mega Tyranitar. *Đã kiểm chứng bằng một test tạm: Kyogre gọi Mưa 40 s, sau khi Primal thì passive là `primordial-sea` nhưng không có thời tiết nào được gọi.* |
| 3 | Thời tiết mạnh chưa có luật riêng | Bản chính thức: Mưa lớn làm chiêu Lửa gây sát thương thất bại; Nắng cực mạnh làm chiêu Nước thất bại; không bị thời tiết thường thay thế. Game chỉ kéo dài thời gian lên 90 s. |
| 4 | **Delta Stream** (Mega Rayquaza) chưa có tác dụng | Hiện được quy thành `critBonus`. Chưa có "gió mạnh". |
| 5 | Air Lock / Cloud Nine chưa vô hiệu hóa thời tiết | Đang quy thành +5% chí mạng (`critBonus`, đã kiểm tra bằng test tạm). Đây là nhóm **vô hiệu hóa**, không tạo thời tiết. |
| 6 | Forecast (Castform), Flower Gift (Cherrim) chưa đổi dạng | Dữ liệu chỉ có dạng gốc; passive là +5% chí mạng (`critBonus`, đã kiểm tra). |
| 7 | Thiếu dạng và loài | Không có Alolan Vulpix / Alolan Ninetales (Snow Warning ẩn), Mega Froslass (Snow Warning) và dạng Castform thời tiết. |
| 8 | Thiếu chiêu tạo thời tiết | Không có Rain Dance, Sunny Day, Weather Ball, Solar Beam, Chilly Reception. Sandstorm, Hail, Snowscape có trong dữ liệu chiêu nhưng **không tạo thời tiết trận** (không có code nào nối các chiêu này với `battleWeather`). |
| 9 | Thời tiết bản đồ ngược với lore | `ecology.json` cho Tornadus hệ số 0,5 khi có giông (`thunderstorm`), tức là *ít* xuất hiện hơn. Rayquaza và Landorus cũng 0,5. Lore lại mô tả Tornadus gây bão. Raikou, Suicune, Kyogre, Zapdos thì đúng hướng (tăng khi mưa/giông). |

### 1.3 Ba lớp "thời tiết" đang tồn tại song song trong game

1. **Thời tiết bản đồ (bầu trời)**, kiểu `WeatherKind`: `clear`, `rain`, `fog`, `thunderstorm`, `blizzard`, `heatwave`, `heavyRain`, `mysticFog`.
   - Ảnh hưởng hình ảnh và tỉ lệ xuất hiện Pokémon (`ecology.json`).
2. **Sự kiện "Thời tiết dị thường"** (`worldEvents.ts`).
   - Kéo dài 180 s, hồi 900 s.
   - Ghi đè bầu trời và có hệ số sát thương nhẹ: Giông sét Điện ×1,2; Sóng nhiệt Lửa ×1,2; Mưa xối xả Nước ×1,2 / Lửa ×0,7…
3. **Thời tiết do Pokémon gọi** (`battleWeather.ts`).
   - Mưa, Nắng gắt, Bão cát, Tuyết; Nước/Lửa ×1,5 hoặc ×0,5.
   - Ghi đè hình ảnh bầu trời trong lúc còn hiệu lực.

Đề xuất ở mục 6 sắp xếp ba lớp này thành thứ tự ưu tiên rõ ràng.

---

## 2. Phân biệt khái niệm

| Khái niệm | Là gì | Ví dụ | Không nhầm với |
|---|---|---|---|
| **Thời tiết (Weather)** [Chính thức] | Trạng thái toàn sân, ảnh hưởng cả hai bên | Rain, Harsh Sunlight, Sandstorm, Hail/Snow | — |
| **Thời tiết mạnh** [Chính thức] | Ba loại đặc biệt, không bị thời tiết thường thay thế, kéo dài khi Pokémon nguồn còn trong trận | Heavy Rain (Primordial Sea), Extremely Harsh Sunlight (Desolate Land), Strong Winds (Delta Stream) | Mưa hoặc nắng thường |
| **Terrain (địa hình)** [Chính thức] | Hiệu ứng mặt đất, chỉ tác động Pokémon đứng trên đất | Electric/Grassy/Misty/Psychic Terrain. Hadron Engine của Miraidon tạo **Electric Terrain**, không phải thời tiết. | Giông sét |
| **Chiêu dùng thời tiết** [Chính thức] | Chiêu mạnh hoặc yếu đi theo thời tiết, nhưng không tạo thời tiết | Thunder và Hurricane trúng 100% khi mưa; Solar Beam không cần sạc khi nắng; Weather Ball đổi hệ | Rain Dance (chiêu tạo mưa) |
| **Ability hưởng lợi** [Chính thức] | Chỉ được buff khi có thời tiết | Swift Swim, Chlorophyll, Sand Rush, Slush Rush, Solar Power… | Ability tạo thời tiết |
| **Ability vô hiệu hóa** [Chính thức] | Thời tiết vẫn còn nhưng mất tác dụng | Air Lock, Cloud Nine | Ability xóa thời tiết |
| **Đổi dạng theo thời tiết** [Chính thức] | Hình dạng hoặc hệ đổi theo thời tiết | Forecast (Castform), Flower Gift (Cherrim) | Tạo thời tiết |
| **Thời tiết bản đồ** [Chính thức, ngoài trận] | Thời tiết trên tuyến đường | Ruby/Emerald: Routes 124–130 nắng hoặc mưa sau khi Groudon / Kyogre thức giấc. Black/White: tuyến có Tornadus / Thundurus lang thang thì mưa (Serebii). | Ability trong trận |
| **Sương mù (Fog)** [Chính thức] | Chỉ có trong Diamond/Pearl (Route 210…). Giảm độ chính xác; Defog xóa được. Từ Sword/Shield, Misty Terrain thay cho vai trò này (Serebii). | Misty Terrain (đây là Terrain) |

---

## 3. Bảng tổng hợp

Quy ước chung cho các bảng 3A–3C:

- **Phạm vi = "toàn sân"** nghĩa là ảnh hưởng mọi Pokémon trong trận, cả hai bên.
- **Thời lượng theo thế hệ** (áp dụng cho Ability thời tiết thường):
  - Gen III–V: vô hạn. Đây cũng là nội dung câu mô tả ngắn trên PokéAPI.
  - Từ X & Y (Gen VI): 5 lượt (Serebii).
  - Thời tiết mạnh: kéo dài khi Pokémon nguồn còn trong trận.

### 3A. [Chính thức] Tạo thời tiết bằng Ability

| Pokémon | Dạng | Hiện tượng | Ability | Điều kiện kích hoạt | Phạm vi | Nguồn xác minh | Game hiện tại |
|---|---|---|---|---|---|---|---|
| **Kyogre** | Thường | Mưa | Drizzle (thường) | Vào trận | Toàn sân | PokéAPI ability/drizzle | ✓ |
| **Primal Kyogre** | Primal (Primal Reversion) | **Mưa lớn** | Primordial Sea | Ở dạng Primal; không bị thay bằng thời tiết thường; chiêu Lửa gây sát thương thất bại | Toàn sân, khi còn trong trận | PokéAPI primordial-sea; Serebii | Một phần (90 s, chưa chặn chiêu Lửa) |
| **Groudon** | Thường | Nắng gắt | Drought (thường) | Vào trận | Toàn sân | PokéAPI drought | ✓ |
| **Primal Groudon** | Primal | **Nắng cực mạnh** | Desolate Land | Ở dạng Primal; chiêu Nước gây sát thương thất bại; không bị thay thế | Toàn sân, khi còn trong trận | PokéAPI desolate-land; Serebii | Một phần |
| **Mega Rayquaza** | Mega | **Gió mạnh** (Strong Winds) | Delta Stream | Ở dạng Mega; chiêu siêu hiệu quả lên hệ Bay bị giảm; ghi đè Mưa lớn và Nắng cực mạnh | Toàn sân | PokéAPI delta-stream; Serebii | ✗ (đang là `critBonus`) |
| Pelipper | Thường | Mưa | Drizzle (thường) | Vào trận | Toàn sân | PokéAPI | ✓ |
| Politoed | Thường | Mưa | Drizzle (**ẩn**) | Vào trận, chỉ cá thể có Ability ẩn | Toàn sân | PokéAPI | ✓ |
| Torkoal | Thường | Nắng gắt | Drought (thường) | Vào trận | Toàn sân | PokéAPI. Thế hệ thêm Ability này: chưa xác minh | ✓ |
| Vulpix / Ninetales | Dạng Kanto | Nắng gắt | Drought (**ẩn**) | Vào trận | Toàn sân | PokéAPI | ✓ |
| Charizard | Mega Charizard Y | Nắng gắt | Drought | Khi Mega tiến hóa | Toàn sân | PokéAPI | Có dữ liệu; xem lỗi #2 |
| Koraidon | Mọi dạng Build | Nắng gắt | Orichalcum Pulse | Vào trận; tăng Attack khi đang nắng | Toàn sân | PokéAPI orichalcum-pulse | ✓ (chưa tăng Attack) |
| Tyranitar | Thường + Mega | Bão cát | Sand Stream | Vào trận hoặc khi Mega | Toàn sân | PokéAPI sand-stream | ✓ / xem lỗi #2 |
| Hippopotas / Hippowdon | Thường | Bão cát | Sand Stream | Vào trận | Toàn sân | PokéAPI | ✓ |
| Gigalith | Thường | Bão cát | Sand Stream (thường, theo dữ liệu hiện hành) | Vào trận | Toàn sân | PokéAPI. Thế hệ thay đổi: chưa xác minh | ✓ |
| Silicobra / Sandaconda (cả G-Max) | Thường | Bão cát | Sand Spit | **Khi bị trúng đòn** | Toàn sân | PokéAPI sand-spit | ⚠ đang kích hoạt khi vào trận |
| Snover / Abomasnow | Thường + Mega | Mưa đá (≤ Gen VIII) / Tuyết (Gen IX) | Snow Warning | Vào trận hoặc khi Mega | Toàn sân | PokéAPI snow-warning; Hail → Snow là kiến thức chung, chưa đối chiếu | ✓ |
| Vanilluxe | Thường | Mưa đá / Tuyết | Snow Warning (thường) | Vào trận | Toàn sân | PokéAPI | ✓ |
| Amaura / Aurorus | Thường | Mưa đá / Tuyết | Snow Warning (**ẩn**) | Vào trận | Toàn sân | PokéAPI | ✓ |
| Vulpix / Ninetales | **Dạng Alola** | Mưa đá / Tuyết | Snow Warning (**ẩn**) | Vào trận | Toàn sân | PokéAPI | ✗ (game chưa có dạng Alola) |
| Froslass | **Mega Froslass** | Mưa đá / Tuyết | Snow Warning | Khi Mega | Toàn sân | PokéAPI (danh sách snow-warning có `froslass-mega`) | ✗ |

### 3B. [Chính thức] Tạo thời tiết bằng chiêu thức (gom nhóm)

Nhiều loài học được các chiêu này, nên chúng **không** được coi là "Pokémon thời tiết". Số loài học được lấy từ trường `learned_by_pokemon` của PokéAPI.

| Chiêu | Hiện tượng | Thời lượng | Thế hệ | Số loài học được | Ghi chú |
|---|---|---|---|---|---|
| Rain Dance | Mưa | 5 lượt | II | 873 | Gần như mọi loài |
| Sunny Day | Nắng gắt | 5 lượt | II | 862 | |
| Sandstorm | Bão cát | 5 lượt | II | 338 | |
| Hail | Mưa đá | 5 lượt | III | 202 | Theo kiến thức chung, bị bỏ ở Gen IX (chưa đối chiếu) |
| Snowscape | Tuyết | 5 lượt | IX | 122 | |
| Chilly Reception | Tuyết, rồi đổi Pokémon | — | IX | 2 (Slowking, Galarian Slowking) | Chiêu riêng |
| Max Geyser / Max Flare / Max Rockfall / Max Hailstorm | Mưa / Nắng / Cát / Mưa đá | 5 lượt | VIII | Chỉ dùng khi Dynamax | Chiêu Max theo hệ |
| *Weather Ball* | — (dùng thời tiết) | — | III | 185 | Không tạo thời tiết: nhân đôi sức mạnh và đổi hệ theo thời tiết |

Đá kéo dài thời tiết từ chiêu: Damp Rock (mưa), Heat Rock (nắng), Smooth Rock (cát), Icy Rock (mưa đá/tuyết) (Serebii). Con số 8 lượt chưa được đối chiếu.

### 3C. [Chính thức] Vô hiệu hóa thời tiết và đổi dạng theo thời tiết

Nhóm này **không tạo** thời tiết.

| Pokémon | Dạng | Loại | Ability | Tác dụng | Nguồn |
|---|---|---|---|---|---|
| Rayquaza | Thường | Vô hiệu hóa | Air Lock | Thời tiết vẫn còn nhưng mất mọi tác dụng | PokéAPI air-lock |
| Psyduck, Golduck | Thường | Vô hiệu hóa | Cloud Nine (thường) | Như Air Lock | PokéAPI cloud-nine |
| Lickitung, Lickilicky, Swablu, Altaria, Drampa | Thường | Vô hiệu hóa | Cloud Nine (**ẩn**) | Như Air Lock | PokéAPI |
| Castform | Sunny / Rainy / Snowy | Đổi dạng | Forecast | Đổi hệ và dạng theo thời tiết | PokéAPI forecast (có các dạng `castform-sunny/rainy/snowy`) |
| Cherrim | Sunshine Form | Đổi dạng + buff đồng đội | Flower Gift | Khi nắng: tăng Attack và Sp. Def ×1,5 cho đồng đội | PokéAPI flower-gift |

### 3D. [Lore] Pokédex và cốt truyện: **không phải cơ chế chiến đấu**

| Pokémon | Hiện tượng (theo lore) | Trích Pokédex (phiên bản) | Ghi chú |
|---|---|---|---|
| **Kyogre** | Mưa xối xả, mây phủ kín trời, nước biển dâng | "create massive rain clouds that cover the entire sky and bring about torrential downpours" (Ruby); "can summon storms that cause the sea levels to rise" (Omega Ruby) | Trùng với cơ chế Drizzle / Primordial Sea |
| **Groudon** | Xua mây mưa, bốc hơi nước, núi lửa phun | "scatter rain clouds and make water evaporate with light and heat" (Sapphire); "make volcanoes erupt on awakening" (Emerald) | Trùng với Drought / Desolate Land |
| **Rayquaza** | Sống trên các tầng mây, ở tầng ozone | "lives in the ozone layer far above the clouds" (Diamond) | Việc **dập tắt cuộc chiến thời tiết** Kyogre–Groudon thuộc cốt truyện Emerald / Omega Ruby–Alpha Sapphire, không có trong Pokédex (chưa đối chiếu trực tiếp trong phiên này) |
| **Lugia** | Dập bão; vỗ cánh gây bão 40 ngày | "an incredible ability to calm raging storms… appears when storms start" (Crystal); "If it flaps its wings, it is said to cause a 40-day storm" (Diamond) | Không có Ability thời tiết (Pressure / Multiscale ẩn) |
| **Zapdos** | Giông sét, sống trong mây giông | "causes savage thunderstorms by flapping its glittering wings" (Gold / HeartGold); "lightning caused by the flapping of its wings causes summer storms" (Crystal) | Không có Ability thời tiết |
| **Articuno** | Tuyết rơi, bão tuyết | "chills moisture in the atmosphere to create snow while flying" (Silver); "can create blizzards by freezing moisture in the air" (Diamond) | Có Snow Cloak ẩn (hưởng lợi, không tạo thời tiết) |
| **Moltres** | Mang mùa xuân sớm đến vùng đất lạnh | "said to bring early spring to the wintry lands it visits" (Silver) | Hiện tượng mùa, không phải thời tiết trận |
| **Tornadus** | Bão, gió cực mạnh | "causing severe storms. Its power is great enough to blow houses away" (White); "storm-stirring… cause the seasons to turn" (Legends: Arceus) | Trên bản đồ Black/White có mưa ở tuyến nó lang thang (Serebii) |
| **Thundurus** | Sét khắp nơi, cháy rừng | "flies around the Unova region firing off lightning bolts" (White); "shoots lightning all over the place and causes forest fires" (Black 2) | Như trên |
| **Landorus** | Đến dẹp bão sét, sau đó được mùa | "After the tempests and thunderbolts abate, the land is sure to be blessed with bountiful harvests" (Legends: Arceus) | Vai trò "kết thúc bão" |
| **Enamorus** | Kết thúc mùa đông khắc nghiệt | "When it flies to this land from across the sea, the bitter winter comes to an end" (Legends: Arceus) | Hiện tượng mùa |
| **Raikou** | Mang mây mưa trên lưng, phóng sét | "The rain clouds it carries let it fire thunderbolts at will" (Gold); "fire thunderbolts from the rain clouds on its back" (Diamond) | |
| **Suicune** | Gió bấc thổi khi nó xuất hiện | "north winds will somehow blow whenever it appears" (Silver / FireRed) | |
| **Entei** | Núi lửa phun khi nó gầm | "Volcanoes erupt when it barks" (Gold) | Gắn với núi lửa, không phải thời tiết |
| **Ho-Oh** | Cầu vồng sau lưng khi bay | "A rainbow is said to form behind it when it flies" (Silver) | Hiệu ứng ánh sáng |
| Abomasnow | Tạo bão tuyết, trắng xóa tầm nhìn | "known to bring blizzards. A shake of its massive body is enough to cause whiteout conditions" (Shield) | Trùng với Snow Warning |
| Vanilluxe | Tạo mây tuyết trong cơ thể, phun bão tuyết | "make snow clouds inside their bodies and… cause violent blizzards" (Black 2); "It can create snow anywhere" (Ultra Sun) | Trùng với Snow Warning |
| Hippowdon | Phun cát nuốt vào, gây bão cát khi giận | "spews out the quantities of sand it has swallowed and whips up a sandstorm" (Shield) | Trùng với Sand Stream |
| Froslass | Xuống làng vào đêm bão tuyết | "on nights of terrible blizzards, it comes down to human settlements" (Ultra Moon) | Xuất hiện **trong** bão tuyết, không tạo bão tuyết |
| Castform / Cherrim | Thay đổi theo thời tiết | "appearance changes with the weather" (Ruby); "blooms during times of strong sunlight" (Diamond) | Phản ứng với thời tiết, không tạo ra nó |

Những loài thường bị hiểu nhầm là "Pokémon thời tiết" nhưng không có lore tạo thời tiết:

- **Pelipper** và **Torkoal**: có Ability thời tiết, nhưng Pokédex không nói chúng tạo mưa hay nắng.
- **Altaria / Swablu**: chỉ *trông giống* mây.
- **Wattrel / Kilowattrel**: chỉ *cưỡi* gió để bay.

---

## 4. Chọn 15 Pokémon làm sự kiện môi trường

Toàn bộ mục 4 là **[Đề xuất]**.

- **Biome** dùng đúng các biome của game: `meadow`, `forest`, `lake`, `rocky`, `ruins`, `farm`, `snow`, `volcano`, `sanctuary`, `swamp`, `coast`.
- **Thời lượng** lấy mốc theo các sự kiện hiện có (Thời tiết dị thường: 180 s, hồi 900 s).

### Cấp 1: Pokémon thường (thời tiết cục bộ, ngắn)

**1. Pelipper: "Đàn mưa ven biển"**
- **Biome:** `coast`, `lake`.
- **Báo trước:** mây xám kéo vào từ phía biển, tiếng kêu từ xa.
- **Thời tiết và hình ảnh:** Mưa trong bán kính khoảng 12 ô quanh đàn, khoảng 60 hạt mưa trên màn hình.
- **Chiến đấu:** Mưa chính thức (Nước ×1,5, Lửa ×0,5). Pokémon có Swift Swim xuất hiện nhiều hơn.
- **Thời lượng:** 40–60 s. Kết thúc khi đàn bay đi, hoặc khi hạ Pelipper đầu đàn.
- **Ứng phó:** tránh đưa Pokémon hệ Lửa vào vùng mưa, hoặc dùng Pokémon có Cloud Nine.
- **Độ hiếm:** thường gặp.
- **Thưởng:** Damp Rock (hiếm), EXP.
- **Bắt:** chỉ cá thể có Drizzle mới gọi mưa, nên hiện huy hiệu "Drizzle" khi ném bóng.

**2. Torkoal: "Hơi nóng từ mỏ than"**
- **Biome:** `volcano`, `rocky`.
- **Báo trước:** khói đen bốc lên từ đá, không khí gợn sóng nhiệt.
- **Thời tiết:** Nắng gắt cục bộ, có lớp màu cam nhẹ (opacity tối đa khoảng 0,15).
- **Chiến đấu:** Lửa ×1,5, Nước ×0,5. Pokémon có Chlorophyll xuất hiện nhiều hơn.
- **Thời lượng:** 40 s. Kết thúc khi Torkoal bỏ chạy (theo Pokédex, nó phun khói rồi rút lui khi bị tấn công).
- **Độ hiếm:** thường gặp.
- **Thưởng:** Heat Rock, than (Charcoal).

**3. Hippowdon: "Bão cát nổi giận"**
- **Biome:** `rocky`, `farm` (vùng khô).
- **Báo trước:** cát cuốn thành vệt trên mặt đất; Hippopotas chạy tán loạn.
- **Thời tiết:** Bão cát cục bộ. Tầm nhìn giảm vừa phải (vignette viền, **không** phủ kín màn hình).
- **Chiến đấu:** mất máu dần trừ hệ Đá / Đất / Thép (đã có trong game); hệ Đá chịu đòn đặc biệt tốt hơn.
- **Thời lượng:** 45 s. Kết thúc khi Hippowdon bình tĩnh lại (máu dưới 50%) hoặc khi người chơi rời vùng.
- **Lore:** khớp với Pokédex Shield (giận thì phun cát gây bão).
- **Thưởng:** Smooth Rock.

**4. Abomasnow: "Trắng xóa trên núi"**
- **Biome:** `snow`.
- **Báo trước:** hoa tuyết rơi lác đác, Snover tụ lại (Pokédex Platinum: xuất hiện khi hoa tuyết nở).
- **Thời tiết:** Tuyết cục bộ, sương trắng ở rìa màn hình (whiteout nhẹ, theo Pokédex Shield).
- **Chiến đấu:** hệ Băng chịu đòn vật lý tốt hơn. Tầm nhìn: minimap mờ trong vùng.
- **Thời lượng:** 60 s.
- **Độ hiếm:** khá hiếm.
- **Thưởng:** Icy Rock, Never-Melt Ice.

**5. Castform: "Báo thời tiết sống"**
- **Biome:** mọi biome có thời tiết bản đồ.
- **Báo trước:** không có. Castform *xuất hiện theo* thời tiết, không tạo ra thời tiết.
- **Hiệu ứng:** đổi dạng Sunny / Rainy / Snowy theo thời tiết đang có (Forecast chính thức).
- **Vai trò:** dấu hiệu báo trước cho các sự kiện lớn. Ví dụ Castform dạng mưa hàng loạt cho biết Kyogre sắp xuất hiện.
- **Thời lượng:** bằng thời tiết.
- **Thưởng:** 3 dạng trong Pokédex.
- Cần làm thêm dạng Castform (xem lỗi #6).

### Cấp 2: Pokémon hiếm hoặc boss (ảnh hưởng một khu vực)

**6. Tyranitar (boss khu vực): "Bão cát nghiền núi"**
- **Biome:** `rocky`.
- **Báo trước:** rung chấn, đá lở. Pokédex Black 2: bước chân làm núi sụp và đổi địa hình.
- **Thời tiết:** Bão cát phủ cả khu vực, gió cát chéo màn hình. Tối đa khoảng 80 hạt, tắt bớt trên điện thoại.
- **Chiến đấu:** Bão cát; tại Phase 3 dùng Mega Tyranitar (gọi lại bão cát sau khi sửa lỗi #2).
- **Pokémon hoang dã:** hệ Đất / Đá xuất hiện nhiều hơn; Pokémon khác trốn đi.
- **Thời lượng:** suốt trận boss, cộng 30 s sau trận rồi tan.
- **Độ hiếm:** boss (đã có cơ chế boss).
- **Thưởng:** Smooth Rock, Tyranitarite.

**7. Raikou (lang thang): "Mây giông chạy"**
- **Biome:** `meadow`. Trong game đã là Pokémon lang thang, thích `thunderstorm` / `rain`.
- **Báo trước:** sấm từ xa, chớp sáng màn hình nhẹ.
- **Thời tiết:** Giông di chuyển cùng Raikou (lore: mang mây mưa trên lưng). Mưa và sét đánh ngẫu nhiên kèm vòng cảnh báo 1 s.
- **Chiến đấu:** Mưa chính thức (Nước ×1,5; Thunder trúng 100% khi mưa); hệ Điện hoang dã tăng.
- **Thời lượng:** 120 s, hoặc khi Raikou bỏ chạy sang khu khác.
- **Ứng phó:** đứng xa vòng sét; dùng Pokémon có Lightning Rod.

**8. Suicune (lang thang): "Gió bấc thanh lọc"**
- **Biome:** `lake`, `meadow`.
- **Báo trước:** gió lạnh thổi lá bay một hướng (Pokédex Silver: gió bấc thổi khi nó xuất hiện).
- **Thời tiết:** **xóa** mưa lớn / sương mù đang có và trả về trời quang. Vai trò "kết thúc thời tiết xấu".
- **Chiến đấu:** không buff hệ nào.
- **Pokémon hoang dã:** hệ Nước hiền hòa hơn, ít Pokémon hung hãn hơn.
- **Thời lượng:** 90 s.
- **Thưởng:** nước tinh khiết (vật phẩm hồi phục).
- **Gặp:** khi gặp lần thứ ba thì Suicune đứng lại cho bắt.

### Cấp 3: Legendary (sự kiện lớn, có báo trước và thời gian hồi)

**9. Zapdos: "Cơn giông mùa hạ"**
- **Biome:** `meadow` (đền huyền thoại của Zapdos đã có).
- **Báo trước:** 60 s trước, mây đen kéo đến, chớp xa liên tục và thông báo "Bầu trời tối sầm…".
- **Thời tiết:** Giông sét (sự kiện `thunderstorm` đã có) cộng mưa.
- **Chiến đấu:** Điện ×1,2 (như sự kiện hiện có). Sét đánh theo vị trí người chơi, mỗi 6–8 s, có vòng cảnh báo.
- **Tầm nhìn:** tối đi khoảng 20%.
- **Thời lượng:** 180 s. Kết thúc khi Zapdos bị hạ hoặc bị bắt, hoặc hết giờ.
- **Thời gian hồi:** 30 phút chơi.
- **Thưởng:** Zap Plate, Lông Zapdos; bắt sau khi hạ Phase 3.

**10. Articuno: "Bão tuyết trên núi"**
- **Biome:** `snow`.
- **Báo trước:** nhiệt độ giảm (hiện trên HUD), tuyết rơi dày dần trong 60 s.
- **Thời tiết:** Bão tuyết (`blizzard`) cộng Tuyết chính thức.
- **Chiến đấu:** hệ Băng chịu đòn vật lý tốt hơn; Blizzard trúng chắc chắn (Đề xuất: mượn theo luật Blizzard trong mưa đá).
- **Pokémon hoang dã:** Pokémon vùng tuyết kéo xuống thấp.
- **Thời lượng:** 180 s.
- **Thời gian hồi:** 30 phút.
- **Thưởng:** Icicle Plate.

**11. Tornadus: "Bão gió đổi mùa"**
- **Biome:** `meadow`, `farm`.
- **Báo trước:** cây nghiêng một chiều, lá và giấy bay ngang màn hình.
- **Thời tiết:** **Gió mạnh** (Đề xuất, khác Delta Stream). Đẩy nhẹ Pokémon và người chơi theo hướng gió; đạn bay chệch theo gió.
- **Chiến đấu:** hệ Bay +10% tốc độ. Mưa đi kèm như bản đồ Black/White.
- **Thời lượng:** 150 s.
- **Thời gian hồi:** 45 phút.
- **Cần sửa thêm:** hệ số xuất hiện trong giông (lỗi #9).
- **Gặp:** Tornadus và Thundurus luân phiên. Nếu cả hai xuất hiện liền nhau, **Landorus** đến "dẹp bão" và cho bắt (theo lore Legends: Arceus).

**12. Thundurus: "Sét đốt rừng"**
- **Biome:** `forest`, `meadow`.
- **Báo trước:** sét khô không mưa; khói từ xa.
- **Thời tiết:** Giông sét. Sét đánh trúng cỏ tạo đám cháy nhỏ tồn tại 10 s (lore Black 2: gây cháy rừng). Giới hạn tối đa 3 đám cháy cùng lúc.
- **Chiến đấu:** Điện ×1,2.
- **Thời lượng:** 150 s.
- **Thời gian hồi:** 45 phút.
- **Thưởng:** Lõi Sét. Cặp với Tornadus để gọi Landorus.

**13. Lugia: "Bão biển 40 ngày"**
- **Biome:** `coast`, `ruins` (game đang đặt Lugia ở `ruins`, thích sương mù).
- **Báo trước:** sóng lớn, sương mù dày; thông báo "Biển động bất thường…".
- **Thời tiết:** Mưa lớn cộng sóng (hiệu ứng ở mép nước). Sau khi hạ hoặc bắt được Lugia, **bão tan và trời quang** (Pokédex Crystal: dập bão).
- **Chiến đấu:** Mưa chính thức. Tầm nhìn: sương mù giới hạn bán kính nhìn khoảng 10 ô (Đề xuất; không dùng Misty Terrain).
- **Thời lượng:** 240 s.
- **Thời gian hồi:** 60 phút.
- **Thưởng:** Silver Wing.

**14. Kyogre / Primal Kyogre: "Biển nuốt đất"**
- **Biome:** `coast`, `lake`. Đền Kyogre đã có, thích `heavyRain`.
- **Báo trước:**
  - nhiều Castform dạng mưa xuất hiện;
  - mưa tăng dần qua 3 nấc trong 90 s;
  - mực nước dâng (ô nước lan ra 1–2 ô ở mép).
- **Thời tiết:** Mưa (Drizzle). Ở Phase 3, **Primal Kyogre**: Mưa lớn, chiêu Lửa gây sát thương thất bại (cơ chế chính thức Primordial Sea).
- **Pokémon hoang dã:** hệ Nước tràn vào đất liền.
- **Thời lượng:** suốt trận boss. Mưa lớn kết thúc khi Primal Kyogre rời trận.
- **Thời gian hồi:** 60 phút.
- **Không chồng lên Groudon**, xem quy tắc 6.2.
- **Thưởng:** Blue Orb (đã có trong game).

**15. Groudon / Primal Groudon: "Đất khô cằn"**
- **Biome:** `rocky`, `volcano`.
- **Báo trước:** nứt đất, núi lửa xa phun, nước ở các ô cạn đi (lore Emerald: núi lửa phun khi thức giấc).
- **Thời tiết:** Nắng gắt. Phase 3 dùng **Primal Groudon**: Nắng cực mạnh, chiêu Nước gây sát thương thất bại.
- **Tầm nhìn:** sóng nhiệt nhẹ, opacity tối đa 0,15.
- **Thời lượng:** suốt trận boss.
- **Thời gian hồi:** 60 phút.
- **Thưởng:** Red Orb.

**(Phụ) Rayquaza: "Bầu trời yên lặng"**
- Không tạo sự kiện riêng. Rayquaza là **phản ứng**: nếu Kyogre và Groudon cùng hoạt động trong một vùng, Rayquaza giáng xuống và xóa cả hai thời tiết (dựa theo cốt truyện Emerald/ORAS).
- Rayquaza thường dùng Air Lock (vô hiệu hóa thời tiết). Mega Rayquaza dùng Gió mạnh (Delta Stream).
- Đây là cách đưa cơ chế "vô hiệu hóa" vào thành sự kiện.

---

## 5. Phân cấp thiết kế

Toàn bộ mục 5 là **[Đề xuất]**. Đây là quy tắc thiết kế cho game này, không phải cơ chế mặc định của Pokémon chính thức.

| Cấp | Ai | Phạm vi | Thời lượng | Báo trước | Thời gian hồi | Giới hạn |
|---|---|---|---|---|---|---|
| **Cục bộ** | Pokémon thường có Ability thời tiết (Pelipper, Torkoal, Hippowdon, Snover…) | Bán kính 10–14 ô quanh Pokémon, mép mờ dần | 30–60 s | Không có, hoặc 5 s | 60 s mỗi cá thể (đã có `WEATHER_CALL_COOLDOWN`) | Tối đa 2 vùng cục bộ trên màn hình |
| **Khu vực** | Pokémon hiếm, boss khu vực, Pokémon lang thang (Tyranitar, Raikou, Suicune, Abomasnow alpha) | Cả khu (area) hiện tại | 90–180 s, hoặc suốt trận boss | 15–30 s (âm thanh, tin trên HUD) | 10–15 phút mỗi khu | 1 sự kiện khu vực mỗi vùng |
| **Legendary** | Zapdos, Articuno, Tornadus, Thundurus, Lugia, Kyogre, Groudon | Cả vùng (region) | 180–240 s, hoặc suốt trận | 60–90 s, nhiều dấu hiệu tăng dần | 30–60 phút chơi mỗi loài; hồi chung 15 phút giữa hai legendary bất kỳ | Chỉ 1 legendary cùng lúc trên toàn bản đồ; không xuất hiện trong dungeon |

**Ràng buộc cân bằng và hiệu năng:**

- Hạt hiệu ứng tối đa khoảng 120 trên máy tính và khoảng 60 trên điện thoại (dùng lại chế độ "Đồ họa" trong Cài đặt).
- Lớp phủ màu: opacity tối đa 0,2. Sương mù và bão cát chỉ là vignette ở viền, **không** che giữa màn hình, nơi có nhân vật và thanh chiêu.
- Chớp sét: thời gian chớp ≤ 120 ms, tối đa 1 lần mỗi 4 s, có tùy chọn tắt chớp (an toàn cho người nhạy cảm ánh sáng).
- Legendary không xuất hiện liên tục:
  - dùng thời gian hồi theo thời gian chơi (không tính thời gian tắt game);
  - xác suất chỉ được kiểm tra mỗi 15 phút (như `worldEvents` hiện có);
  - sau khi đã bắt được thì sự kiện giảm còn 1/3 tần suất.

---

## 6. Quy tắc khi nhiều nguồn thời tiết cùng xuất hiện

### 6.1 [Chính thức] Luật trong game Pokémon chính

1. **Thời tiết mới thay thế thời tiết cũ.** Mỗi lúc chỉ có một thời tiết. *(Kiến thức chung; game của bạn đang làm đúng như vậy.)*
2. **Thời tiết mạnh** (Mưa lớn, Nắng cực mạnh, Gió mạnh):
   - Rain Dance, Sunny Day, Hail và Sandstorm đều thất bại dưới thời tiết mạnh; Drizzle, Drought, Snow Warning và Sand Stream không kích hoạt (Serebii).
   - Kéo dài khi Pokémon nguồn còn trong trận (Serebii). Theo kiến thức chung, nó kết thúc khi Pokémon đó rời sân (chưa đối chiếu).
   - Thời tiết mạnh chỉ bị thay bởi thời tiết mạnh khác. Gió mạnh ghi đè Mưa lớn và Nắng cực mạnh (Serebii).
3. **Air Lock / Cloud Nine:** thời tiết vẫn còn nhưng mọi tác dụng bị vô hiệu hóa trong lúc Pokémon có Ability này còn trên sân (PokéAPI).
4. **Thời lượng:** Ability thời tiết thường 5 lượt từ X & Y (Serebii); chiêu 5 lượt, cầm đá thì lâu hơn.
5. **Hai Ability vào sân cùng lúc:** theo kiến thức chung, chúng kích hoạt theo Tốc độ, nên Pokémon chậm hơn kích hoạt sau và thời tiết của nó thắng. *Chưa đối chiếu trong phiên này.*

### 6.2 [Đề xuất] Quy tắc tự thiết kế cho game này

**Mô hình ba lớp, theo ưu tiên từ thấp đến cao:**

| Lớp | Nguồn | Ưu tiên |
|---|---|---|
| L0 | Thời tiết nền của bản đồ (bầu trời ngẫu nhiên theo biome và giờ) | 0 |
| L1 | Sự kiện "Thời tiết dị thường" | 1 |
| L2 | Pokémon gọi, cục bộ hoặc toàn trận (Ability, phím C) | 2 |
| L3 | Sự kiện khu vực / boss | 3 |
| L4 | Legendary, thời tiết mạnh (Primal, Delta Stream) | 4 |

Các luật:

1. **Hiển thị và tác dụng** lấy từ lớp cao nhất đang hoạt động. Các lớp thấp hơn **không bị xóa**, chỉ tạm ẩn. Khi lớp cao hết thì quay về lớp ngay bên dưới, và cuối cùng là L0. Không cần "khôi phục" bằng tay.
2. **Cùng lớp:** cái mới thay cái cũ (giữ đúng luật chính thức). Ngoại lệ: nếu cùng loại thời tiết thì chỉ làm mới thời lượng (game đã làm vậy).
3. **Lớp thấp không thay được lớp cao.**
   - Ví dụ: Pelipper gọi Mưa trong lúc Primal Groudon đang tạo Nắng cực mạnh thì thất bại và hiện thông báo "Nắng cực mạnh át đi cơn mưa".
   - Áp dụng cho cả người chơi lẫn đối thủ, giống luật chính thức của thời tiết mạnh.
4. **L4 chỉ bị thay bởi L4 khác.** Riêng Rayquaza (Gió mạnh, hoặc sự kiện "Bầu trời yên lặng") thì **xóa** L4 của Kyogre và Groudon.
5. **Hai legendary đối nghịch** (Kyogre và Groudon, hoặc Tornadus và Thundurus) không bao giờ được hệ thống sinh cùng lúc. Nếu người chơi tự kích hoạt cả hai (dùng Orb chẳng hạn), thì sinh sự kiện phản ứng (Rayquaza hoặc Landorus) thay vì chồng hai thời tiết.
6. **Thời gian hồi:**
   - **Mỗi nguồn:** cá thể Pokémon 60 s (đã có); sự kiện khu vực 10–15 phút; legendary 30–60 phút.
   - **Toàn cục:** 15 phút giữa hai sự kiện L4.
   - **Chống nhấp nháy:** một thời tiết phải tồn tại tối thiểu 8 s trước khi bị thay. Nếu bị chặn trong khoảng này thì yêu cầu gọi thời tiết **không** tốn thời gian hồi.
7. **Cục bộ và toàn trận:**
   - Thời tiết cục bộ (L2) chỉ áp dụng trong bán kính quanh nguồn.
   - Khi hai vùng cục bộ giao nhau, vùng có nguồn gần người chơi hơn được hiển thị; tác dụng tính theo vị trí của từng Pokémon.
   - *Đây là thay đổi so với hiện tại, vì hiện thời tiết gọi ra áp dụng cho cả bản đồ.*
8. **Kết thúc:** thời tiết kết thúc khi hết giờ, khi nguồn rời trận / bị hạ / bị bắt (L2–L4), khi người chơi gục (đã có), hoặc khi đổi bản đồ (đề xuất: L2 kết thúc, L3–L4 vẫn giữ nếu cùng vùng).
9. **Air Lock / Cloud Nine:** Pokémon có Ability này **trên sân của người chơi** tắt tác dụng (không tắt hình ảnh) của L0–L3 quanh nó. Không tắt L4: đây là quy tắc tự đặt để legendary luôn có sức nặng; bản chính thức thì Air Lock / Cloud Nine tắt cả thời tiết mạnh.
10. **Thông báo:** mỗi lần đổi lớp hiển thị một dòng: ai gọi, loại thời tiết, còn bao lâu. Lớp bị che có thể hiện mờ trên HUD (ví dụ "Mưa (bị Nắng cực mạnh át)").

---

## 7. Gợi ý thứ tự làm nếu triển khai sau này

Đây chỉ là gợi ý. Chưa làm khi bạn chưa yêu cầu.

1. Sửa các chỗ lệch với bản chính thức:
   - Sand Spit kích hoạt khi bị trúng đòn (lỗi #1);
   - đặt lại `weatherCalled` khi Primal hoặc Mega (lỗi #2);
   - chiêu Lửa / Nước thất bại dưới thời tiết mạnh (lỗi #3).
2. Thêm thứ tự ưu tiên theo lớp L0–L4 (mục 6.2) vào `battleWeather.ts` và `worldEvents.ts`.
3. Sửa hệ số `ecology.json` cho Tornadus, Thundurus, Landorus và Rayquaza (lỗi #9).
4. Air Lock / Cloud Nine thật sự vô hiệu hóa thời tiết; Castform đổi dạng.
5. Làm các sự kiện cấp Pokémon thường (Pelipper, Torkoal, Hippowdon), rồi boss khu vực, rồi legendary.
