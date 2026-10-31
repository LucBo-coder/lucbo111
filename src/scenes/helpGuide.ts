// In-game guide (menu tab "Hướng dẫn", key K): the key list grouped by use, the touch controls, and short how-to-play
// pages. Pure data so the keys stay in one place next to AdventureScene.bindInput.

export interface HelpKey { keys: string; what: string }
export interface HelpPage { id: string; title: string; keys?: { group: string; rows: HelpKey[] }[]; lines?: string[] }

export const HELP_PAGES: HelpPage[] = [
  {
    id: 'keys', title: 'Phím điều khiển',
    keys: [
      { group: 'Di chuyển & tương tác', rows: [
        { keys: 'W A S D / ← ↑ → ↓', what: 'Di chuyển' },
        { keys: 'Shift (giữ)', what: 'Chạy' },
        { keys: 'E / Space', what: 'Nói chuyện, mở rương, kích hoạt trạm, câu cá, lên xuồng' },
      ] },
      { group: 'Chiến đấu', rows: [
        { keys: 'Q', what: 'Pokémon trên sân dùng chiêu tốt nhất (ngắm chuột chọn mục tiêu)' },
        { keys: 'Chuột trái vào ô chiêu', what: 'Dùng chiêu đó ngay' },
        { keys: 'Chuột phải vào ô chiêu', what: 'Giữ chiêu cho bạn tự dùng (AI không dùng)' },
        { keys: 'F', what: 'Ném bóng về phía con trỏ chuột' },
        { keys: 'R', what: 'Đổi loại bóng' },
        { keys: 'H', what: 'Dùng thuốc hồi máu nhanh' },
        { keys: 'G', what: 'Mega Tiến Hóa (đang chiến đấu, có Vòng Mega, Pokémon cầm đá Mega)' },
        { keys: 'Y', what: 'Terastal: Pokémon trên sân thành Hệ Tera của nó trong 60 s (cần Quả Cầu Tera)' },
        { keys: 'B', what: 'Dynamax / Gigantamax: Pokémon trên sân thành khổng lồ 30 s, HP ×2, Chiêu Max (cần Vòng Dynamax)' },
      ] },
      { group: 'Đội hình', rows: [
        { keys: 'T', what: 'Mở vòng đổi Pokémon — bấm 1–5 để chọn' },
        { keys: 'Shift + 1–6', what: 'Gọi ra / thu hồi Pokémon ở ô đội đó' },
        { keys: '` hoặc 0', what: 'Lệnh: Tự do' },
        { keys: '1 · 2 · 3', what: 'Lệnh: Tấn công mục tiêu · Bảo vệ HLV · Ngừng tấn công' },
        { keys: '4 · 5', what: 'Lệnh: Giữ vị trí · Quay về HLV' },
      ] },
      { group: 'Menu', rows: [
        { keys: 'Tab', what: 'Đội hình' },
        { keys: 'I · X · O', what: 'Túi đồ · Pokédex · PC (kho Pokémon)' },
        { keys: 'J · V', what: 'Nhiệm vụ / nhật ký · Sự kiện' },
        { keys: 'M · P', what: 'Bản đồ · Hộ chiếu (Việt Nam Odyssey)' },
        { keys: 'K / F1', what: 'Hướng dẫn (trang này)' },
        { keys: 'Esc', what: 'Cài đặt, lưu game — hoặc đóng cửa hàng' },
      ] },
      { group: 'Chế độ Survivor', rows: [
        { keys: 'W A S D / ← ↑ → ↓', what: 'Di chuyển (Pokémon tự tấn công)' },
        { keys: '1 · 2 · 3', what: 'Chọn thẻ nâng cấp khi lên cấp' },
        { keys: 'Esc / P', what: 'Tạm dừng' },
        { keys: 'F', what: 'Bật / tắt FPS' },
      ] },
    ],
  },
  {
    id: 'touch', title: 'Điện thoại / cảm ứng',
    lines: [
      'Chạm và kéo ở vùng trống: cần điều khiển ảo để di chuyển.',
      'E — tương tác · ◓ — ném bóng · Chạy — bật / tắt chạy.',
      'Lệnh — đổi lệnh cho đội · Đổi — mở vòng đổi Pokémon · MEGA — Mega Tiến Hóa.',
      'Chạm ô chiêu để dùng ngay; chạm giữ để giữ chiêu cho bạn tự dùng.',
      'Góc trên bên phải: ≡ cài đặt · Đội · Q nhiệm vụ · Túi · ? hướng dẫn. Chạm bản đồ nhỏ để mở bản đồ lớn.',
    ],
  },
  {
    id: 'start', title: 'Bắt đầu',
    lines: [
      'Gặp Giáo sư để nhận Pokémon đầu tiên, rồi làm theo nhiệm vụ chính (J). Dấu trên bản đồ nhỏ chỉ đường tới mục tiêu.',
      'Mỗi lần chỉ một Pokémon của bạn ở trên sân. Nó tự đánh theo lệnh hiện tại; bạn có thể ra chiêu bằng Q hoặc ô chiêu.',
      'Pokémon thắng trận sẽ lên cấp, học chiêu mới và tiến hóa khi đủ điều kiện (ngoài lúc chiến đấu).',
      'Game tự lưu khi xong nhiệm vụ và khi qua vùng. Muốn chắc thì vào Esc → Lưu game.',
    ],
  },
  {
    id: 'battle', title: 'Chiến đấu',
    lines: [
      'Hệ khắc chế quan trọng: chiêu "siêu hiệu quả" gây gấp đôi sát thương. Xem hệ trong Pokédex (X).',
      'Pokémon trên sân yếu thì bấm T đổi con khác, hoặc H dùng thuốc.',
      'Lệnh đội: "Bảo vệ HLV" khi bị vây, "Giữ vị trí" để đánh từ xa, "Quay về HLV" để rút lui.',
      'Huấn luyện viên đứng trên đường sẽ thách đấu khi bạn tới gần. Thắng nhận tiền và đồ.',
      'Boss khu vực có nhiều giai đoạn. Thắng boss nhận huy hiệu — huy hiệu mở đường tới vùng / tỉnh tiếp theo.',
      'Nếu cả đội gục, bạn hồi phục ở trạm (waypoint) kích hoạt gần nhất.',
    ],
  },
  {
    id: 'catch', title: 'Thu phục',
    lines: [
      'Đánh Pokémon hoang dã cho yếu rồi bấm F ném bóng về phía nó. Máu càng thấp càng dễ bắt.',
      'R đổi loại bóng: Great Ball, Ultra Ball… tỉ lệ bắt cao hơn Poké Ball.',
      'Có loài chỉ hiện theo giờ, thời tiết hay sinh cảnh (đêm mưa, rạng sáng…). Game sẽ báo gợi ý khi chúng xuất hiện.',
      'Đội có tối đa 6 con; con dư được gửi vào PC (phím O, hoặc máy PC ở Trung tâm Pokémon).',
      'Pokémon huyền thoại: hạ hết các giai đoạn, nó sẽ yếu đi và có thể bắt được.',
    ],
  },
  {
    id: 'quests', title: 'Nhiệm vụ & cốt truyện',
    lines: [
      'Mở nhật ký bằng J. Nhiệm vụ chính (cốt truyện) và nhiệm vụ phụ được tách riêng.',
      'Dấu "!" trên đầu: người đó có nhiệm vụ mới cho bạn. Dấu "?": bạn cần nói chuyện với họ để tiếp tục nhiệm vụ.',
      'Bảng nhiệm vụ ở thị trấn có thêm việc phụ. Danh tiếng ở mỗi vùng tăng lên sẽ mở thêm nhiệm vụ và quà.',
      'Đánh, bắt, khám phá, mở rương… làm trước khi tới bước đó vẫn được tính (nhật ký đánh dấu ☑). Chỉ nói chuyện / báo cáo, lựa chọn và trận cốt truyện phải làm đúng lượt.',
      'Một số nhiệm vụ cho bạn chọn cách giải quyết — mỗi lựa chọn dẫn tới kết quả khác.',
      'Đoạn hội thoại cốt truyện có thể bỏ qua; xem lại trong nhật ký.',
    ],
  },
  {
    id: 'explore', title: 'Khám phá',
    lines: [
      'Kích hoạt trạm (waypoint) để hồi phục đội và dịch chuyển nhanh qua bản đồ (M).',
      'Trung tâm Pokémon: hồi máu cả đội. Cửa hàng: mua bóng, thuốc. PC: sắp xếp Pokémon.',
      'Mở rương, câu cá ở chỗ nước gợn sóng, đi xuồng ở các bến (E).',
      'Ngày / đêm và thời tiết thay đổi loài xuất hiện. Sự kiện (V) như bầy di cư, Pokémon alpha xuất hiện ngẫu nhiên.',
      'Hầm ngục: qua các đợt quái, câu đố rồi đánh boss cuối để nhận thưởng.',
    ],
  },
];
