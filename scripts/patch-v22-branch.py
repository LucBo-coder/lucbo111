# V22 branching quests: one crossroads per province (Cà Mau, An Giang, Cần Thơ) and the follow-ups each choice
# unlocks (`requiresFlags: ["choice:<quest>:<option>"]`). Idempotent.
# Usage: python scripts/patch-v22-branch.py
import json

QV = 'src/data/vietnam/quests.json'
q = json.load(open(QV, encoding='utf8'))


def upsert(arr, item):
    for i, x in enumerate(arr):
        if x['id'] == item['id']:
            arr[i] = item
            return
    arr.append(item)


def at(x, y, p):
    return {'x': x, 'y': y, 'region': p}


def talk(npc, text, m, branch=None):
    o = {'type': 'talk', 'target': npc, 'count': 1, 'text': text, 'marker': m}
    if branch: o['branch'] = branch
    return o


CM, AG, CT = 'ca-mau', 'an-giang', 'can-tho'
ELDER, RANGER_UM, UT = at(56, 26, CM), at(24, 26, CM), at(50, 92, CM)
DRIED = at(89, 91, CM)

# ── Cà Mau: traps in U Minh ──────────────────────────────────────────────────
upsert(q, {
    'id': 'vn-cm-trap', 'kind': 'side', 'title': 'Bẫy trong rừng U Minh', 'giver': 'cm-ranger-uminh', 'requires': ['vn-cm-1'],
    'description': 'Ai đó giăng bẫy trong rừng tràm U Minh, mấy Pokémon nhỏ bị kẹt. Tìm ra người đặt bẫy — rồi tự quyết định nên làm gì.',
    'objectives': [
        {'type': 'explore', 'target': 'cm-uminh', 'count': 1, 'text': 'Vào rừng tràm U Minh xem bẫy', 'marker': at(30, 22, CM)},
        talk('cm-elder', 'Hỏi Ông Ba kể chuyện xem ai đặt bẫy', ELDER),
        {'type': 'choose', 'target': 'cm-elder', 'count': 1, 'text': 'Quyết định: báo kiểm lâm hay tự khuyên Út Mũi', 'marker': ELDER, 'options': [
            {'id': 'bao-kiem-lam', 'label': 'Báo cho Kiểm lâm U Minh',
             'reply': ['Ừ, luật rừng là luật rừng. Con ra báo kiểm lâm đi, họ biết cách lo.'],
             'rewards': {'reputation': 8, 'items': {'ultraball': 1}},
             'complete': ['Cảm ơn em. Tụi anh sẽ gỡ hết bẫy và tuần tra gắt hơn. Rừng U Minh nợ em một lần.']},
            {'id': 'khuyen-ut', 'label': 'Tự đi khuyên Út Mũi',
             'reply': ['Thằng Út nhà nghèo, đặt bẫy kiếm cá kiếm chim bán. Con nói chuyện với nó, biết đâu nó nghe.'],
             'rewards': {'reputation': 4, 'items': {'netball': 3}, 'worldExp': 200},
             'complete': ['Ừ... anh gỡ bẫy rồi. Anh cũng đâu muốn vậy, chỉ là nhà túng quá. Cảm ơn em đã nói thẳng.']},
        ]},
        talk('cm-ranger-uminh', 'Báo cho Kiểm lâm U Minh', RANGER_UM, 'bao-kiem-lam'),
        talk('cm-fisher-ut', 'Nói chuyện với Ngư dân Út Mũi', UT, 'khuyen-ut'),
    ],
    'rewards': {'worldExp': 400, 'reputation': 4},
    'dialogue': {
        'offer': ['Mấy bữa nay tôi gặp bẫy dây trong rừng tràm, có con Pokémon nhỏ bị kẹt chân.', 'Em vào rừng coi thử, rồi hỏi Ông Ba — ổng biết hết chuyện trong xóm.'],
        'progress': ['Bẫy là của thằng Út Mũi đó con. Mà nó cũng tội... Con tính sao?'],
        'complete': ['Xong chuyện bẫy rồi. Cảm ơn em.'],
    },
})
upsert(q, {
    'id': 'vn-cm-patrol', 'kind': 'side', 'title': 'Tuần tra rừng tràm', 'giver': 'cm-ranger-uminh',
    'requires': ['vn-cm-trap'], 'requiresFlags': ['choice:vn-cm-trap:bao-kiem-lam'],
    'description': 'Kiểm lâm U Minh nhờ bạn cùng tuần tra: đẩy lui Pokémon hung hăng quanh khu bẫy cũ.',
    'objectives': [
        {'type': 'defeat', 'target': '*', 'count': 6, 'text': 'Hạ 6 Pokémon hoang dã khi tuần tra (0/6)', 'marker': at(30, 22, CM)},
        talk('cm-ranger-uminh', 'Báo cáo với Kiểm lâm U Minh', RANGER_UM),
    ],
    'rewards': {'items': {'ultraball': 2, 'superpotion': 2}, 'worldExp': 500, 'reputation': 10},
    'dialogue': {
        'offer': ['Nhờ em báo mà tụi anh gỡ được 12 cái bẫy. Đi tuần với anh một vòng không?'],
        'progress': ['Cứ đi quanh rừng tràm, gặp con nào hung hăng thì đẩy lui.'],
        'complete': ['Rừng yên rồi. Từ nay em là bạn của trạm kiểm lâm U Minh.'],
    },
})
upsert(q, {
    'id': 'vn-cm-new-trade', 'kind': 'side', 'title': 'Nghề mới cho Út Mũi', 'giver': 'cm-fisher-ut',
    'requires': ['vn-cm-trap'], 'requiresFlags': ['choice:vn-cm-trap:khuyen-ut'],
    'description': 'Út Mũi muốn bỏ bẫy, theo Cô Năm học làm khô cá. Giúp anh ấy mở lời.',
    'objectives': [
        talk('cm-dried-fish', 'Xin Cô Năm bán khô nhận Út Mũi học nghề', DRIED),
        talk('cm-fisher-ut', 'Báo tin vui cho Út Mũi', UT),
    ],
    'rewards': {'items': {'netball': 2, 'greatball': 3}, 'worldExp': 500, 'reputation': 10, 'pokemon': {'species': 'wingull', 'level': 14}},
    'dialogue': {
        'offer': ['Anh bỏ bẫy rồi, mà giờ không biết làm gì sống. Nghe nói Cô Năm cần người phơi khô... em nói giùm anh được không?'],
        'progress': ['Cô Năm ở sạp khô gần chợ thị trấn đó em.'],
        'complete': ['Cô Năm nhận anh rồi! Con Wingull này hay theo ghe anh — em nhận nó đi, coi như anh cảm ơn.'],
    },
})

# ── An Giang: flood-season fishing ───────────────────────────────────────────
BOAT, SUGAR, RES = at(104, 90, AG), at(76, 72, AG), at(64, 45, AG)
upsert(q, {
    'id': 'vn-ag-fishing', 'kind': 'side', 'title': 'Mùa nước nổi: lưới dày hay câu vừa đủ', 'giver': 'ag-boatman', 'requires': ['vn-ag-1'],
    'description': 'Cá linh về đầy đồng. Bác Năm hỏi ý bạn: giăng lưới dày vét một mùa, hay câu vừa đủ để năm sau cá còn về?',
    'objectives': [
        {'type': 'explore', 'target': 'ag-wetland', 'count': 1, 'text': 'Ra Đồng Nước Nổi xem cá về', 'marker': at(112, 84, AG)},
        talk('ag-sugar-palm', 'Hỏi Cô Sáu đường thốt nốt giá cá ngoài chợ', SUGAR),
        {'type': 'choose', 'target': 'ag-boatman', 'count': 1, 'text': 'Quyết định cách đánh bắt với Bác Năm', 'marker': BOAT, 'options': [
            {'id': 'luoi-day', 'label': 'Giăng lưới dày, vét một mùa',
             'reply': ['Được, mùa này trúng lớn! Mà... thôi, kéo lưới đi con.'],
             'rewards': {'items': {'exp-candy-s': 3}, 'worldExp': 300},
             'complete': ['Ghe đầy cá! Bán được giá... mà bác nhìn đồng trống trơn, thấy hơi lo.']},
            {'id': 'cau-vua-du', 'label': 'Câu vừa đủ, chừa cá non',
             'reply': ['Phải vậy chớ. Cá non còn thì năm sau đồng mới đầy.'],
             'rewards': {'reputation': 10, 'items': {'netball': 2}},
             'complete': ['Ít cá mà lòng nhẹ. Năm sau cá linh lại về, con nhớ ghé.']},
        ]},
        {'type': 'defeat', 'target': '*', 'count': 8, 'text': 'Kéo lưới: hạ 8 Pokémon hoang dã (0/8)', 'marker': at(112, 84, AG), 'branch': 'luoi-day'},
        {'type': 'defeat', 'target': '*', 'count': 3, 'text': 'Câu vừa đủ: hạ 3 Pokémon hoang dã (0/3)', 'marker': at(112, 84, AG), 'branch': 'cau-vua-du'},
        talk('ag-boatman', 'Về báo Bác Năm', BOAT),
    ],
    'rewards': {'items': {'netball': 2}, 'worldExp': 300},
    'dialogue': {
        'offer': ['Nước nổi rồi con! Cá linh về đầy đồng.', 'Con ra coi thử, hỏi giá ngoài chợ, rồi về bàn với bác coi nên đánh bắt kiểu nào.'],
        'progress': ['Lưới dày thì mùa này trúng, mà năm sau đồng vắng. Câu vừa đủ thì ít tiền, mà cá còn về. Con tính sao?'],
        'complete': ['Xong một mùa nước nổi.'],
    },
})
upsert(q, {
    'id': 'vn-ag-empty-field', 'kind': 'side', 'title': 'Đồng vắng cá', 'giver': 'ag-researcher',
    'requires': ['vn-ag-fishing'], 'requiresFlags': ['choice:vn-ag-fishing:luoi-day'],
    'description': 'Nhóm khảo sát thấy cá non gần như mất sạch ở Đồng Nước Nổi. Giúp họ đo lại đàn cá.',
    'objectives': [
        {'type': 'explore', 'target': 'ag-tra-su', 'count': 1, 'text': 'Khảo sát rừng tràm Trà Sư', 'marker': at(70, 90, AG)},
        {'type': 'explore', 'target': 'ag-wetland', 'count': 1, 'text': 'Khảo sát Đồng Nước Nổi', 'marker': at(112, 84, AG)},
        talk('ag-researcher', 'Báo số liệu cho Trưởng nhóm Vy', RES),
    ],
    'rewards': {'items': {'greatball': 3}, 'worldExp': 400, 'reputation': 6},
    'dialogue': {
        'offer': ['Mùa này ai đó vét lưới dày quá, cá non gần như không còn. Em đi đo lại đàn cá giúp chị nhé.'],
        'progress': ['Đi Trà Sư rồi Đồng Nước Nổi, ghi lại xem còn bao nhiêu cá.'],
        'complete': ['Số liệu tệ hơn chị nghĩ... Năm sau phải cấm lưới dày. Cảm ơn em đã giúp — ai cũng có lúc sai, quan trọng là sửa.'],
    },
})
upsert(q, {
    'id': 'vn-ag-fish-return', 'kind': 'side', 'title': 'Cá linh về năm sau', 'giver': 'ag-boatman',
    'requires': ['vn-ag-fishing'], 'requiresFlags': ['choice:vn-ag-fishing:cau-vua-du'],
    'description': 'Nhờ chừa cá non, đàn cá linh lớn nhanh. Bác Năm rủ bạn đi xem lại đồng.',
    'objectives': [
        {'type': 'explore', 'target': 'ag-wetland', 'count': 1, 'text': 'Ra Đồng Nước Nổi xem đàn cá', 'marker': at(112, 84, AG)},
        {'type': 'capture', 'target': '*', 'count': 1, 'text': 'Thu phục 1 Pokémon ở đồng nước', 'marker': at(112, 84, AG)},
        talk('ag-boatman', 'Về kể cho Bác Năm', BOAT),
    ],
    'rewards': {'items': {'netball': 3, 'mystic-water': 1}, 'worldExp': 500, 'reputation': 10},
    'dialogue': {
        'offer': ['Con coi nè, cá non mình chừa giờ lớn bằng ngón tay rồi! Ra đồng coi với bác.'],
        'progress': ['Đồng giờ đông Pokémon nước lắm, bắt thử một con coi.'],
        'complete': ['Đồng đầy lại rồi! Viên Nước Huyền Bí này bác giữ lâu rồi, con cầm lấy.'],
    },
})

# ── Cần Thơ: two boats, one landing ──────────────────────────────────────────
FERRY, HIEN, TAM = at(74, 70, CT), at(118, 88, CT), at(40, 86, CT)
upsert(q, {
    'id': 'vn-ct-feud', 'kind': 'side', 'title': 'Hai ghe một bến', 'giver': 'ct-ferry-girl', 'requires': ['vn-ct-1'],
    'description': 'Chủ ghe Tư Hiền và Chú Tám chủ vườn giành nhau một chỗ cập bến ở Ninh Kiều. Nghe cả hai bên rồi phân xử.',
    'objectives': [
        talk('ct-merchant', 'Nghe Chủ ghe Tư Hiền nói', HIEN),
        talk('ct-orchard-owner', 'Nghe Chú Tám chủ vườn nói', TAM),
        {'type': 'choose', 'target': 'ct-ferry-girl', 'count': 1, 'text': 'Phân xử chuyện bến ghe', 'marker': FERRY, 'options': [
            {'id': 'theo-tu-hien', 'label': 'Bến cho ghe Tư Hiền',
             'reply': ['Ghe Tư Hiền chở hàng cả xóm, cũng phải. Em ra báo cho chú Tư nhé.'],
             'rewards': {'items': {'sitrus-berry': 2}},
             'complete': ['Hay quá! Ghe tui cập bến được rồi, hàng lên kịp chợ sáng. Cảm ơn nghen!']},
            {'id': 'theo-chu-tam', 'label': 'Bến cho ghe trái cây Chú Tám',
             'reply': ['Trái cây miệt vườn để lâu là hư, cũng có lý. Em ra báo chú Tám nhé.'],
             'rewards': {'items': {'miracle-seed': 1}},
             'complete': ['Trái cây lên bến tươi rói! Chú cảm ơn con nhiều.']},
            {'id': 'chia-gio', 'label': 'Chia giờ: sáng Tư Hiền, chiều Chú Tám',
             'reply': ['Chia giờ! Sao không ai nghĩ ra sớm hơn ta. Em báo cả hai bên nhé.'],
             'rewards': {'reputation': 10, 'worldExp': 300},
             'complete': ['Sáng tui, chiều ổng... ờ, vậy cũng được. Hai nhà khỏi giận nhau nữa.']},
        ]},
        talk('ct-merchant', 'Báo tin cho Chủ ghe Tư Hiền', HIEN, 'theo-tu-hien'),
        talk('ct-orchard-owner', 'Báo tin cho Chú Tám', TAM, 'theo-chu-tam'),
        talk('ct-orchard-owner', 'Báo Chú Tám: bến dành cho chú buổi chiều', TAM, 'chia-gio'),
        talk('ct-merchant', 'Báo Tư Hiền: bến dành cho ghe buổi sáng', HIEN, 'chia-gio'),
    ],
    'rewards': {'worldExp': 400, 'reputation': 5},
    'dialogue': {
        'offer': ['Bến Ninh Kiều có một chỗ cập ghe mà hai nhà giành nhau mấy bữa nay, cãi um sùm.', 'Bạn nghe cả hai bên rồi quay lại nói mình nên xử sao nhé.'],
        'progress': ['Bạn nghe hai bên rồi đó. Vậy chỗ bến nên cho ai?'],
        'complete': ['Bến êm rồi. Cảm ơn bạn!'],
    },
})
upsert(q, {
    'id': 'vn-ct-hien-cargo', 'kind': 'side', 'title': 'Chuyến hàng sớm của Tư Hiền', 'giver': 'ct-merchant',
    'requires': ['vn-ct-feud'], 'requiresFlags': ['choice:vn-ct-feud:theo-tu-hien'],
    'description': 'Có bến rồi, ghe Tư Hiền chạy chuyến hàng sớm xuống Cái Răng. Đi cùng để đuổi Pokémon phá hàng.',
    'objectives': [
        {'type': 'explore', 'target': 'ct-cai-rang', 'count': 1, 'text': 'Theo ghe xuống chợ nổi Cái Răng', 'marker': at(110, 96, CT)},
        {'type': 'defeat', 'target': '*', 'count': 4, 'text': 'Đuổi 4 Pokémon phá hàng (0/4)', 'marker': at(110, 96, CT)},
        talk('ct-merchant', 'Về gặp Tư Hiền', HIEN),
    ],
    'rewards': {'items': {'ultraball': 2, 'exp-candy-s': 2}, 'worldExp': 500, 'reputation': 8},
    'dialogue': {
        'offer': ['Nhờ bạn mà ghe tui có bến! Sáng mai chạy chuyến đầu, đi chung cho vui hông?'],
        'progress': ['Xuống Cái Răng, coi chừng mấy con Pokémon hay nhảy lên ghe ăn vụng.'],
        'complete': ['Hàng tới chợ nguyên vẹn! Từ nay mua gì ở ghe tui cứ nói.'],
    },
})
upsert(q, {
    'id': 'vn-ct-tam-orchard', 'kind': 'side', 'title': 'Mùa trái chín của Chú Tám', 'giver': 'ct-orchard-owner',
    'requires': ['vn-ct-feud'], 'requiresFlags': ['choice:vn-ct-feud:theo-chu-tam'],
    'description': 'Trái chín rộ, Pokémon trong vườn kéo tới ăn. Giúp Chú Tám giữ vườn để kịp chuyến ghe.',
    'objectives': [
        {'type': 'explore', 'target': 'ct-orchard', 'count': 1, 'text': 'Vào miệt vườn Phong Điền', 'marker': at(40, 90, CT)},
        {'type': 'defeat', 'target': '*', 'count': 4, 'text': 'Đuổi 4 Pokémon ăn trái (0/4)', 'marker': at(40, 90, CT)},
        talk('ct-orchard-owner', 'Về gặp Chú Tám', TAM),
    ],
    'rewards': {'items': {'sitrus-berry': 3, 'leaf-stone': 1}, 'worldExp': 500, 'reputation': 8},
    'dialogue': {
        'offer': ['Có bến rồi mà trái chín rộ, Pokémon kéo vô ăn quá trời. Phụ chú giữ vườn nghen con.'],
        'progress': ['Vườn ở phía tây nam, con cứ đi một vòng.'],
        'complete': ['Trái lên ghe kịp hết! Viên Đá Lá này chú lượm được trong vườn, cho con.'],
    },
})

open(QV, 'w', encoding='utf8', newline='\r\n').write(json.dumps(q, ensure_ascii=False, indent=1) + '\n')
print('ok', len(q))
