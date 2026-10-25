# Thế giới online

Từ menu chính chọn **Thế giới online**. Chế độ này dùng tài khoản và dữ liệu trên máy chủ riêng; các ô lưu offline và phòng PvP/Co-op vẫn độc lập (e2e kiểm tra localStorage không đổi).

## Máy chủ Cloudflare (mặc định)

Bản GitHub Pages dùng sẵn máy chủ `wss://pokemon-server.pokemon-server.workers.dev` (Cloudflare Workers + Durable Objects, gói **Free**). Không cần cấu hình gì: mở game, vào **Chơi online** hoặc **Thế giới online**.

```
Trình duyệt ── wss://…/room/<MÃ>?role=host|guest ──▶ Worker (kiểm tra Origin, giới hạn IP) ──▶ RoomDO (1 / mã phòng)
           └─ wss://…/ws ─────────────────────────▶ Worker ─────────────────────────────────▶ WorldDO (SQLite)
```

- **Phòng PvP / co-op / thế giới mở chung** (`RoomDO`, mã nguồn `pokemon-server/src/room.ts`): chuyển tiếp nguyên văn tin nhắn của giao thức game (`src/net/protocol.ts`) giữa chủ phòng và khách — không phải Socket.IO, chỉ WebSocket JSON. Chủ phòng vẫn là bên kiểm tra luật như khi dùng WebRTC. Mã đã có chủ → `TAKEN` (client tự tạo mã khác); không có phòng → `NOT_FOUND`; đủ 2 người → `FULL`.
- **Rớt mạng**: chỗ được giữ 60 s. Client tự nối lại (0,5 → 8 s, khoảng 40 s) bằng token, máy chủ gửi bù tối đa 400 tin bị lỡ; bên kia thấy `{r:'peer',on:false}` rồi `on:true`. Thoát hẳn (`{"bye":1}`) hoặc quá hạn → phòng bị xóa. Phòng không hoạt động 6 h tự đóng.
- **Thế giới online** (`WorldDO`): chạy đúng `server/world.ts` (cùng mã với máy chủ Node) trên SQLite của Durable Object; cùng migration `server/migrations/*.sql`. Đồng hồ thế giới (sự kiện, Alpha) chỉ chạy khi có người online; vị trí lưu mỗi 10 s.
- **Bảo vệ**: chỉ nhận Origin `https://lucbo-coder.github.io` và localhost (`ALLOWED_ORIGINS`); 60 lần mở kết nối / phút / IP; khung tin ≤ 1 MB (phòng) / 16 KB (thế giới); ≤ 160 khung / 4 s mỗi người; token kết nối lại ngẫu nhiên. Thế giới online do máy chủ quyết định mọi chỉ số (xem *Kiến trúc*).
- **Vị trí**: Durable Object được tạo gần người chơi (`locationHint` apac → Singapore / Hong Kong). Độ trễ phụ thuộc nhà mạng định tuyến `workers.dev` qua châu Á (~70–150 ms) hay châu Âu (~300–450 ms); muốn ổn định hơn cần tên miền riêng (không bắt buộc).
- **Chọn đường kết nối** (thêm vào URL game): `?net=peer` dùng WebRTC cũ, `?net=local` hai tab cùng trình duyệt (thử nghiệm), `?cloud=wss://máy-chủ-khác` dùng Worker khác. Build tay: `VITE_CLOUD_URL=wss://… npm run build`.

### Giới hạn gói Free (ước tính)

100 000 request/ngày (mỗi WebSocket = 1 request, tin nhắn đến tính 20 tin = 1 request), 13 000 GB-s thời gian Durable Object/ngày, 100 000 dòng SQLite ghi/ngày, 5 GB lưu trữ. Với nhịp gửi của game (~20 tin/s mỗi người, gộp 50 ms) đủ khoảng 14 giờ-phòng hoặc ~55 giờ-người Thế giới online mỗi ngày. Hết hạn mức thì kết nối bị từ chối tới 0h UTC; không phát sinh phí.

### Triển khai / cập nhật máy chủ

Mã máy chủ ở `C:\Users\pc\Documents\Pokemon-Cloudflare\pokemon-server` và **import trực tiếp** `server/world.ts` của repo này qua alias `@game` (`../../../pokemon-survivor`) — giữ hai thư mục đúng vị trí đó.

```powershell
cd C:\Users\pc\Documents\Pokemon-Cloudflare\pokemon-server
npx wrangler login      # một lần
npx wrangler deploy
npx wrangler tail       # xem log trực tiếp
```

Kiểm tra: `https://pokemon-server.pokemon-server.workers.dev/healthz?where=1` (`edge` = trạm Cloudflare bạn đang đi qua, `world.colo` = nơi WorldDO chạy). Chạy thử cục bộ: `npx wrangler dev --port 8790`, rồi mở game với `?cloud=ws://127.0.0.1:8790`.

GitHub Pages: chỉ cần `git push` lên `main` — workflow tự build với địa chỉ mặc định trong `src/net/cloud.ts`. Đổi máy chủ: sửa `CLOUD_URL_DEFAULT` hoặc đặt biến repo `SERVER_URL` (chỉ cho Thế giới online).

Kiểm thử với máy chủ thật:

```powershell
node scripts/cloud-room-test.mjs wss://pokemon-server.pokemon-server.workers.dev
$env:E2E_NET="cloud=wss://pokemon-server.pokemon-server.workers.dev"; npx playwright test e2e/coop.spec.ts e2e/online_modes.spec.ts e2e/v15_online.spec.ts e2e/v15_shared_world.spec.ts e2e/relay_reconnect.spec.ts
$env:SERVER_WS="wss://pokemon-server.pokemon-server.workers.dev/ws"; npm.cmd run e2e:server
```

## Chạy trên máy tính

Cần Node.js 22.13+ (có `node:sqlite`); đã kiểm tra với Node 24.

Mở hai terminal trong thư mục dự án:

```powershell
npm.cmd run server
```

```powershell
npm.cmd run dev
```

Mở `http://localhost:5173`, chọn **Thế giới online**, dùng địa chỉ `ws://localhost:8787/ws`, tạo tài khoản (tên 3–20 chữ/số/underscore, mật khẩu 6–128 ký tự). Mỗi người dùng tài khoản riêng. Dữ liệu nằm trong `server/data/game.db`; khởi động lại server vẫn giữ tài khoản và tiến trình.

### Lỗi "Kết nối quá hạn" / "Không kết nối được máy chủ"

Game không tìm thấy máy chủ ở địa chỉ trong ô **Máy chủ**. Thông báo hiện địa chỉ đã thử.

- **Chưa chạy máy chủ**: mở terminal trong thư mục game, chạy `npm.cmd run server`, chờ dòng `[server] ready`, thử lại. Kiểm tra nhanh: mở `http://localhost:8787/healthz` phải thấy `"ok":true`.
- **Chơi bản GitHub Pages**: ô Máy chủ mặc định là máy chủ Cloudflare `wss://pokemon-server.pokemon-server.workers.dev/ws`; kiểm tra `…/healthz`. Nếu bạn tự đặt địa chỉ khác, có thể dùng `ws://localhost:8787/ws` (máy chủ chạy trên chính máy tính của bạn — Chrome/Edge/Firefox cho phép trang HTTPS kết nối `ws://localhost`). Bạn bè ở máy khác cần một máy chủ Internet có `wss://` (xem *Triển khai Internet*).
- Các bản cũ lưu địa chỉ `wss://<trang>.github.io:8787/ws` (không bao giờ trả lời); bản mới tự bỏ địa chỉ đó.

### Thử nhiều người trên cùng máy / cùng mạng

- Cùng máy: mở hai cửa sổ trình duyệt (hoặc một cửa sổ ẩn danh), đăng ký hai tài khoản khác nhau.
- Cùng Wi-Fi/LAN: mở `http://<IP-máy-chủ>:5173` trên máy còn lại và nhập `ws://<IP-máy-chủ>:8787/ws`. Máy chủ cần mở cổng 5173 và 8787.
- Để thấy sự kiện thế giới nhanh khi thử: `EVENT_INTERVAL_MS=90000 EVENT_ANNOUNCE_MS=20000 npm run server` (chỉ dùng khi thử; bản thật giữ chu kỳ 10 phút).

### Triển khai Internet (mẫu)

Trang HTTPS cần endpoint `wss://`. Mẫu Caddy làm reverse proxy có TLS:

```
game.example.com {
  reverse_proxy /ws 127.0.0.1:8787
  reverse_proxy /healthz 127.0.0.1:8787
}
```

Biến môi trường: xem `server/.env.example` (không chứa bí mật). Sao lưu file SQLite thường xuyên. Máy chủ Internet mặc định là bản Cloudflare ở trên; mẫu này dành cho ai muốn tự chạy máy chủ Node.

Để bản GitHub Pages tự điền địa chỉ máy chủ: trong repo GitHub → *Settings → Secrets and variables → Actions → Variables*, tạo biến `SERVER_URL` = `wss://game.example.com/ws`. Workflow deploy truyền nó vào build qua `VITE_SERVER_URL`. Build tay: `VITE_SERVER_URL=wss://game.example.com/ws npm run build`.

## Phần có thể chơi

- **Tài khoản**: đăng ký, đăng nhập, đăng xuất; mật khẩu băm scrypt + salt, token phiên 32 byte (chỉ lưu SHA-256), hết hạn sau 7 ngày, giới hạn đăng nhập theo IP.
- **Khôi phục tài khoản (không cần e-mail)**: khi đăng ký, server tạo **mã khôi phục** 16 ký tự (80 bit), hiện một lần, chỉ lưu bản băm scrypt. *Quên mật khẩu?* → tên đăng nhập + mã + mật khẩu mới: đặt lại mật khẩu, đăng xuất mọi phiên cũ, cấp mã mới (mã cũ hết hiệu lực). Trong mục *Tài khoản*: đổi mật khẩu (cần mật khẩu hiện tại, đăng xuất thiết bị khác), tạo mã khôi phục mới, đăng xuất mọi thiết bị.
- **Tự kết nối lại**: rớt mạng thì client tự `resume` bằng token (1 s → 15 s, 5 lần) và giữ nguyên thế giới đang mở; vị trí, đội, đồ do server giữ. Đăng nhập ở thiết bị khác sẽ đóng phiên cũ (`SESSION_REPLACED`), tab cũ không tranh lại.
- **Thấy nhau**: di chuyển WASD/phím mũi tên hoặc chạm bản đồ; server kiểm tra tốc độ (≤ 420 px/s), biên bản đồ, ô chắn và gửi vị trí sửa khi bị từ chối. Người chơi khác được nội suy mượt, có bảng tên (xanh = cùng nhóm).
- **Một Pokémon ngoài sân**: gọi ra / thu hồi / đổi (thu hồi con cũ → gọi con mới). Server giữ trạng thái `none → summoning → active → recalling`, hồi chiêu đổi 1,5 s, không cho tấn công khi đang gọi ra. Người xung quanh thấy hoạt ảnh ném bóng / tia thu hồi.
- **Máy PC tại Trung tâm Pokémon / phòng thí nghiệm**: đến gần cửa (khung *Máy PC* hiện ra) → **E** hoặc *Mở PC*. Server chỉ cho gửi/rút/sắp xếp/đổi tên trong 130 px quanh máy PC. Hộp thoại: 16 box × 30 ô, ◀ ▶ / lăn chuột / `[` `]` đổi box, lưới 6×5 có icon, cột đội hình, tìm theo tên/loài, lọc (đã khóa, Shiny, 18 hệ — kết quả ở box khác có nút nhảy tới), sắp xếp box (cấp/tên/mới bắt/đã khóa), chi tiết (hệ, EXP, HP, tính cách, đặc tính, IV, EV, chiêu, vật phẩm, thân thiết), rút về đội / gửi vào PC, khóa ★, biệt danh, di chuyển sang ô khác hoặc box khác, đổi tên box; phím mũi tên + Enter + Esc; xếp chồng một cột trên điện thoại. Pokémon không bao giờ ở hai nơi cùng lúc.
- **Ba vùng & cổng**: Cà Mau, An Giang, Cần Thơ chạy cùng lúc (`REGIONS`), mỗi vùng có Alpha (Lv12 / 18 / 22) và lịch sự kiện riêng. Đổi vùng chỉ bằng cách **đứng ở cổng** và bấm E (server kiểm tra khoảng cách); cổng cần huy hiệu cốt truyện mở cho người chơi online khi đội đạt Lv12 (Cà Mau → An Giang) / Lv16 (An Giang → Cần Thơ). Đò/thuyền trong cùng vùng cũng dùng được. `enter` sang vùng khác bị từ chối (chống dịch chuyển).
- **Kẹo**: hộp thoại chọn loại kẹo (Exp. Candy XS/S/M/L/XL, Rare Candy) → số lượng ×1/×5/×10/Max/tự nhập → xem EXP hiện tại, EXP sẽ nhận, cấp trước → cấp dự kiến, số kẹo dùng → xác nhận. Server tính kết quả; lên nhiều cấp gộp thành một dòng; nếu đủ điều kiện tiến hóa sẽ hỏi *Tiến hóa / Để sau* (server kiểm tra lại).
- **Alpha chung**: đến trong 320 px (nút *Chỉ đường* hiện mũi tên), bấm *Tấn công Alpha*; hồi chiêu 900 ms; HP chung do server xử lý. Hạ Alpha: mỗi người đã gây sát thương nhận kẹo + xu theo đóng góp, người cao nhất thêm Rare Candy, và **Pokémon đã đánh nhận EXP** (×1,5 EXP hoang dã). Thưởng nhóm +10 % cho mỗi đồng đội *cũng đã đánh*, tối đa +30 % — đứng AFK không được gì.
- **Sự kiện thế giới mỗi 10 phút**: một bộ lập lịch trên server cho mỗi vùng (không theo client, không nhân theo số người). Trước 60 s hiện **SỰ KIỆN SẮP DIỄN RA**: tên, vùng, đếm ngược, độ khó, cấp gợi ý, mục tiêu, phần thưởng; không dịch chuyển ai. Mỗi vùng có bảng sự kiện riêng có trọng số, không lặp lại ngay sự kiện trước; sự kiện huyền thoại chỉ xuất hiện khi có người đủ cấp và không cho bắt huyền thoại. Theo dõi: tiến độ, thời gian còn lại, số người tham gia, đóng góp của bạn. Kết thúc → thưởng theo đóng góp đúng một lần.
- **Bạn bè**: kết bạn / chấp nhận / xóa / chặn / bỏ chặn / báo cáo, trạng thái online. Chạm vào người chơi khác để mở menu: kết bạn, mời nhóm, nhắn riêng, chặn, báo cáo.
- **Nhóm 2–4 người**: tạo, mời (chống mời liên tục 10 s), thẻ lời mời *Đồng ý / Từ chối*, rời (trưởng nhóm rời thì chuyển quyền), mời ra, trao trưởng nhóm, giải tán. Bảng nhóm hiện Pokémon đang ra sân, HP, vùng, khoảng cách.
- **Chat**: kênh khu vực (theo kênh của vùng), kênh nhóm, nhắn riêng `/w tên nội dung` (chỉ giữa bạn bè, không qua người đã chặn). Giới hạn 1 tin / 2 s, lọc thẻ HTML và ký tự điều khiển, che từ cấm, hiển thị bằng `textContent`.
- **Biểu cảm**: vẫy, cổ vũ, ngồi, chỉ — hiện bong bóng trên đầu ở các client gần đó.
- **Kênh**: mỗi vùng tối đa 30 người / kênh (`MAX_PER_CHANNEL`), người thứ 31 vào kênh 2. Khác kênh không thấy nhau và không nghe chat khu vực; Alpha và sự kiện của vùng là trạng thái thế giới chung cho mọi kênh.

**Chưa có** (không giả lập bằng dữ liệu offline): bắt Pokémon hoang dã qua server, nhiệm vụ cốt truyện, chiến đấu PvE/real-time đầy đủ của Adventure, Boss Raid nhiều phase có sảnh chờ / ready check, trao đổi Pokémon, tìm đường khi chạm bản đồ, khôi phục tài khoản qua e-mail.

## Kiến trúc

```
Trình duyệt (Phaser + DOM)                Node.js (server/)                      SQLite (WAL)
ServerScene ── WebSocket JSON ──▶ GameServer ── performAction ──▶ AdventureState ──▶ players.save_json
  gửi: input di chuyển, yêu cầu      xác thực token, rate limit,     (logic dùng chung với      accounts, sessions,
  thao tác (actionId), chat         kiểm tra tốc độ/ô chắn,          bản offline)               friends, parties,
  nhận: presence delta, save        quyền sở hữu, hồi chiêu,                                    world_events, alpha_*,
  chuẩn, alpha, event, fx           giao dịch + idempotency + audit                             idempotency, audit_log
```

- Server là nguồn sự thật: client không bao giờ gửi EXP, cấp, sát thương, giá, số lượng đồ. Mọi thay đổi save đi qua `server/actions.ts` trong một giao dịch SQLite (`BEGIN IMMEDIATE`), có `actionId` chống gửi lặp (trả lại kết quả cũ, không chạy lại) và ghi `audit_log`.
- Save chuẩn là JSON cùng schema với save trình duyệt (migration chung `migrate()`), nên client dùng lại được UI/logic hiện có. Quan hệ nhiều người (bạn bè, nhóm, sự kiện, Alpha, đóng góp) là bảng quan hệ có khóa ngoại và chỉ mục (`server/migrations/*.sql`).
- Lý do chọn: `ws` + Node + `node:sqlite` — một tiến trình, không thêm framework mạng thứ hai (PeerJS chỉ dùng cho PvP/co-op P2P cũ). PostgreSQL/Redis chưa cần ở quy mô đã đo; schema SQL chuyển được khi cần nhiều tiến trình.

## Giao thức (v2, `src/net/serverProtocol.ts`)

Client → server: `register` · `login` · `resume` · `recover {username,code,newPassword}` · `logout` · `account {op: changePassword | recoveryCode | logoutAll}` · `enter` (chỉ vùng hiện tại) · `travel {portal}` · `move {x,y,facing,moving}` (10 Hz) · `action {actionId,type,data}` · `alpha.attack` · `chat` · `whisper` · `friend {op}` · `party {op}` · `emote` · `ping` · `resync`.

`action.type`: `party.setActive` · `party.switch` · `party.recall` · `party.deposit` · `party.withdraw` · `pc.move` · `pc.favorite` · `pc.rename` · `pc.boxName` · `pc.sort` · `candy.use` · `pokemon.evolve` · `pokemon.declineEvolution`.

Server → client: `welcome` (token, tài khoản, save chuẩn, `recoveryCode` khi vừa tạo) · `recoveryCode` · `region` (đã qua cổng: tải bản đồ mới) · `presence` (`full` lần đầu, sau đó chỉ người thay đổi + `gone`) · `position` (sửa vị trí) · `actionResult` / `actionError` · `saveSync` · `alpha` / `alphaHit` / `alphaDefeated` (8 người đóng góp cao nhất + `participantCount`) · `event` (kèm đóng góp của chính bạn) · `eventIncoming` · `petFx` · `emote` · `chat` / `chatHistory` / `whisper` · `friends` · `party` (+ `invite`) · `notice` · `error` · `pong`.

Phiên bản giao thức khác nhau thì client từ chối kết nối và báo cập nhật game.

## Hiệu năng đã đo

`node scripts/load-server.mjs 10,20,30,50 20` — server thật (SQLite trên đĩa) + N bot trên **cùng một máy** (i5-13420H, 12 luồng, 16 GB, Node 24). Mỗi bot đi liên tục 10 Hz, đánh Alpha mỗi giây, chat mỗi ~6 s, gọi ra/thu hồi mỗi 3 s (giao dịch DB). Đây là tải xấu nhất (mọi người cùng chạy, cùng đứng một chỗ), không phải con số năng lực cho máy chủ khác.

| Người chơi | CPU server | RSS | Tick lag max | Tải xuống / client | RTT p50 / p95 | Thao tác DB p50 / p95 |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 4.1% | 101 MB | 16 ms | 32.8 KB/s | 0.7 / 5.6 ms | 3.7 / 8.2 ms |
| 20 | 7.7% | 111 MB | 14 ms | 67.9 KB/s | 0.8 / 1.9 ms | 7.8 / 14.4 ms |
| 30 | 10.1% | 121 MB | 13 ms | 103.2 KB/s | 1.6 / 18.7 ms | 11.6 / 19.2 ms |
| 50 (30 + 20 ở kênh 2) | 15.5% | 139 MB | 15 ms | 88.5 KB/s | 6.5 / 22.8 ms | 17.4 / 34.7 ms |

Trước khi đổi sang presence delta và giới hạn danh sách đóng góp, 30 người tốn 204 KB/s mỗi client. Chưa đo: máy chủ ở xa (độ trễ Internet thật), FPS client trên điện thoại thật, > 50 người, nhiều vùng cùng lúc.

## Kiểm tra

```powershell
npm.cmd run build
npm.cmd run server:typecheck
npm.cmd test
npm.cmd run e2e:server
node scripts/load-server.mjs
```

- `tests/server.test.ts`, `tests/server_v7.test.ts`: server thật trên cổng ngẫu nhiên + SQLite trong bộ nhớ + nhiều client `ws` độc lập — sửa vị trí, gửi lại thao tác, Alpha chung, hồi chiêu đổi Pokémon và hiệu ứng gọi ra/thu hồi cho người xem, EXP + thưởng nhóm, thông báo sự kiện trước rồi chạy đúng một sự kiện, hai người cùng tham gia sự kiện và nhận thưởng một lần, bảng sự kiện theo vùng, nhắn riêng chỉ giữa bạn bè, biểu cảm/presence theo khoảng cách và kênh, quản lý nhóm, kẹo → tiến hóa, PC chỉ dùng được tại máy PC, mã khôi phục (sai mã, đổi mã, thu hồi phiên), đổi mật khẩu, đi qua cổng (xa, khóa cấp, mở, Alpha vùng mới, người vùng cũ không còn thấy).
- `e2e/server_world.spec.ts` (Edge, 2 trình duyệt độc lập, server riêng cổng 8789): đăng ký hai tài khoản (thấy mã khôi phục), thấy nhau, chat, đi tới Alpha, HP chung, đi tới máy PC → E → tìm → rút Pokémon trong hộp thoại PC, hộp thoại kẹo, thu hồi/gọi ra + hồi chiêu do server chặn, biểu cảm, mời/nhận nhóm, rớt mạng rồi tự kết nối lại, đăng xuất/đăng nhập lại giữ dữ liệu, giao diện điện thoại, save offline không đổi.

E2E chạy bản build (`npm run preview`) — luôn `npm run build` trước. Trong môi trường quản lý tiến trình server bên ngoài, đặt `SERVER_TEST_EXTERNAL=1` để dùng server kiểm thử đang chạy ở cổng 8789; không trỏ biến này vào dữ liệu thật. `SERVER_TEST_COMMAND` cho phép chỉ định lệnh chạy bản server đã biên dịch thay cho `tsx`.
