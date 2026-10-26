# One-off content patch (V22): exploration obstacles in Thung Lũng Khởi Nguyên (hidden nooks behind a thicket, a
# cracked rock and a boulder to push), boat docks + a river islet in Cần Thơ, and the boat quests.
# Idempotent: re-running replaces the same ids. Keeps the hand-formatted Vietnam map file line by line.
import json
import re

def upsert(arr, item, key='id'):
    for i, x in enumerate(arr):
        if x.get(key) == item[key]:
            arr[i] = item
            return
    arr.append(item)

# ── Thung Lũng: three hidden nooks ──
VALLEY = 'src/data/world/starter-valley.json'
v = json.load(open(VALLEY, encoding='utf8'))
v['field'] = [
    # Rìa Rừng Ngọc: a glade behind a thorny thicket (gap facing south)
    {'id': 'sv-thicket', 'ability': 'cut', 'x': 101, 'y': 32, 'nook': {'cx': 104.5, 'cy': 32.5, 'r': 3, 'wall': 'tree'}},
    # Đồi Đá Xám: a rock pocket sealed by a cracked rock (gap facing west)
    {'id': 'sv-cracked', 'ability': 'smash', 'x': 147, 'y': 28, 'nook': {'cx': 150.5, 'cy': 28.5, 'r': 3, 'wall': 'boulder'}},
    # Đồng Cỏ Gió: a boulder blocks a stone circle; push it east into the hole just inside
    {'id': 'sv-boulder', 'ability': 'strength', 'x': 21, 'y': 66, 'to': [22, 66], 'nook': {'cx': 24.5, 'cy': 66.5, 'r': 3, 'wall': 'boulder'}},
]
for c in [
    {'id': 'chest-sv-glade', 'x': 104, 'y': 32, 'items': {'miracle-seed': 1, 'greatball': 3, 'exp-candy-s': 2}, 'requiresFlag': 'field:starter-valley:sv-thicket'},
    {'id': 'chest-sv-rockpocket', 'x': 150, 'y': 28, 'items': {'hard-stone': 1, 'ultraball': 2, 'superpotion': 2}, 'requiresFlag': 'field:starter-valley:sv-cracked'},
    {'id': 'chest-sv-circle', 'x': 25, 'y': 66, 'items': {'moon-stone': 1, 'ultraball': 2, 'exp-candy-s': 2}, 'requiresFlag': 'field:starter-valley:sv-boulder'},
]:
    upsert(v['chests'], c)
v['signs'] = [s for s in v['signs'] if not (s['x'] in (76, 98) and s['y'] in (28, 34))]
v['signs'].append({'x': 98, 'y': 34, 'text': ['LỐI MÒN BỊ CHẶN', 'Có những lối đi chỉ Pokémon mới mở được:',
    'bụi cây rậm — Pokémon hệ Cỏ / Bọ / Thép cắt được;', 'đá nứt — hệ Giác Đấu / Đá / Đất đập được;', 'tảng đá lớn — hệ Giác Đấu / Đất / Thép đẩy được.',
    'Đứng cạnh rồi bấm E (điện thoại: nút Tương tác).']})
open(VALLEY, 'w', encoding='utf8', newline='\n').write(json.dumps(v, ensure_ascii=False, indent=1) + '\n')

# ── Cần Thơ: docks, a river islet, its chest ──
CT = 'src/data/vietnam/can-tho.json'
s = open(CT, encoding='utf8').read()
nl = '\r\n' if '\r\n' in s else '\n'
islet = '{ "cx": 78, "cy": 11, "rx": 4, "ry": 3 }'
if islet not in s:
    s = s.replace('"islands": [{ "cx": 106, "cy": 10, "rx": 10, "ry": 6 }]', '"islands": [{ "cx": 106, "cy": 10, "rx": 10, "ry": 6 }, ' + islet + ']')
chest = '  { "id": "chest-ct-baibo", "x": 78, "y": 10, "items": { "mystic-water": 1, "ultraball": 2, "netball": 3 } },'
s = re.sub(r'  \{ "id": "chest-ct-baibo"[^\n]*\n', '', s)
s = s.replace(' "chests": [' + nl, ' "chests": [' + nl + chest + nl, 1)
docks = [
    ('ct-dock-ninhkieu', 'Bến ghe Ninh Kiều', 98, 46, 100, 46),
    ('ct-dock-conson', 'Bến ghe Cồn Sơn', 98, 10, 95, 10),
    ('ct-dock-baibo', 'Bến Bãi Bồi giữa sông (giả tưởng)', 78, 13, 78, 16),
    ('ct-dock-cairang', 'Bến ghe Cái Răng', 111, 96, 108, 96),
    ('ct-dock-phongdien', 'Bến ghe Phong Điền', 44, 91, 46, 91),
]
block = ' "docks": [' + nl + (',' + nl).join(
    f'  {{ "id": "{i}", "name": "{n}", "x": {x}, "y": {y}, "wx": {wx}, "wy": {wy} }}' for i, n, x, y, wx, wy in docks) + nl + ' ],' + nl
s = re.sub(r' "docks": \[.*?\n \],\r?\n', '', s, flags=re.S)
s = s.replace(' "rivers": [', block + ' "rivers": [', 1)
old_sign = '"Chợ họp trên sông từ tờ mờ sáng. Mỗi ghe treo hàng mẫu lên cây bẹo để người mua biết ghe bán gì."]'
s = s.replace(old_sign, '"Chợ họp trên sông từ tờ mờ sáng. Mỗi ghe treo hàng mẫu lên cây bẹo để người mua biết ghe bán gì.", "Trong game: ghe hàng đậu dọc bờ từ 5 giờ đến 9 giờ sáng, hàng mỗi phiên có hạn."]')
open(CT, 'w', encoding='utf8', newline='').write(s)

# ── Cà Mau and An Giang: boat docks on their rivers (pretty-printed map files: plain JSON round trip) ──
for path, docks in [
    ('src/data/vietnam/ca-mau.json', [
        ('cm-dock-town', 'Bến xuồng Đất Mũi', 97, 89, 100, 89),
        ('cm-dock-uminh', 'Bến xuồng U Minh Hạ', 97, 10, 100, 10),
    ]),
    ('src/data/vietnam/an-giang.json', [
        ('ag-dock-town', 'Bến đò thị trấn Bảy Núi', 94, 90, 97, 90),
        ('ag-dock-wetland', 'Bến xuồng Đồng Nước Nổi', 117, 65, 117, 63),
    ]),
]:
    raw = open(path, encoding='utf8').read()
    d = json.loads(raw)
    d['docks'] = [{'id': i, 'name': n, 'x': x, 'y': y, 'wx': wx, 'wy': wy} for i, n, x, y, wx, wy in docks]
    open(path, 'w', encoding='utf8', newline='\r\n' if '\r\n' in raw else '\n').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')

# ── quests: the boat, then the river ──
QV = 'src/data/vietnam/quests.json'
q = json.load(open(QV, encoding='utf8'))
m = lambda x, y: {'x': x, 'y': y, 'region': 'can-tho'}
mc = lambda x, y: {'x': x, 'y': y, 'region': 'ca-mau'}
upsert(q, {
    'id': 'vn-cm-boat', 'kind': 'side', 'title': 'Chiếc xuồng ba lá', 'giver': 'cm-fisher-ut', 'requires': ['vn-cm-1'],
    'description': 'Ngư dân Út Mũi có chiếc xuồng ba lá để không. Lấy giùm ông cây dầm (mái chèo) rồi ông cho mượn xuồng.',
    'objectives': [
        {'type': 'talk', 'target': 'cm-dried-fish', 'count': 1, 'text': 'Lấy cây dầm gửi ở sạp khô của Cô Năm', 'marker': mc(89, 91)},
        {'type': 'talk', 'target': 'cm-fisher-ut', 'count': 1, 'text': 'Mang cây dầm về cho Ngư dân Út Mũi', 'marker': mc(50, 92)},
    ],
    'rewards': {'items': {'oranberry': 2}, 'worldExp': 120, 'reputation': 5, 'flags': ['vehicle:ghe']},
    'dialogue': {
        'offer': ['Xuồng ba lá của tui nằm không cả mùa. Cây dầm tui gửi ở sạp khô — con lấy giùm, rồi xuồng con cứ chèo.'],
        'progress': ['Cây dầm đây, con cầm về cho ông Út nghen.', 'Sạp khô ở trong thị trấn, ai cũng biết.'],
        'complete': ['Có dầm rồi! Xuống bến xuồng phía đông thị trấn mà đi. Ngược kênh lên là tới rừng U Minh.'],
    },
})
upsert(q, {
    'id': 'vn-cm-canal', 'kind': 'exploration', 'title': 'Ngược kênh vào U Minh', 'giver': 'cm-fisher-ut', 'requires': ['vn-cm-boat'],
    'description': 'Chèo xuồng ngược con kênh từ Đất Mũi lên tới bến U Minh Hạ.',
    'objectives': [
        {'type': 'explore', 'target': 'dock:cm-dock-uminh', 'count': 1, 'text': 'Cập bến xuồng U Minh Hạ (ngược dòng)', 'marker': mc(97, 10)},
        {'type': 'talk', 'target': 'cm-ranger-uminh', 'count': 1, 'text': 'Chào Kiểm lâm U Minh', 'marker': mc(24, 26)},
    ],
    'rewards': {'items': {'greatball': 3}, 'worldExp': 250, 'reputation': 10},
    'dialogue': {
        'offer': ['Thử chèo ngược kênh lên U Minh coi. Nước ròng thì chèo mệt lắm, chờ nước lớn mà đi.'],
        'progress': ['Kênh chạy phía đông, cứ ngược lên hướng bắc.'],
        'complete': ['Đi xuồng vô tới đây hả? Giỏi! Rừng tràm này đi đường thủy là đẹp nhất.'],
    },
})
upsert(q, {
    'id': 'vn-ct-boat', 'kind': 'side', 'title': 'Chiếc ghe của cô lái đò', 'giver': 'ct-ferry-girl', 'requires': ['vn-ct-1'],
    'description': 'Cô lái đò Ninh Kiều có chiếc ghe cũ cần trám lại. Kiếm dầu chai ở chợ nổi rồi cô cho mượn ghe đi sông.',
    'objectives': [
        {'type': 'talk', 'target': 'ct-merchant', 'count': 1, 'text': 'Xin dầu chai ở ghe Chủ ghe Tư Hiền (Cái Răng)', 'marker': m(118, 88)},
        {'type': 'talk', 'target': 'ct-ferry-girl', 'count': 1, 'text': 'Mang dầu chai về cho cô lái đò Ninh Kiều', 'marker': m(74, 70)},
    ],
    'rewards': {'items': {'oranberry': 3}, 'worldExp': 300, 'reputation': 5, 'flags': ['vehicle:ghe']},
    'dialogue': {
        'offer': ['Ghe của cô bị rò, phải trám dầu chai mới đi được. Con xuống chợ nổi xin giùm cô một ít, rồi ghe này con cứ lấy mà đi.'],
        'progress': ['Dầu chai đây — trám ghe cho kỹ nghen. Cô lái đò đang chờ ở bến Ninh Kiều.', 'Dầu chai có ở ghe Tư Hiền dưới chợ nổi Cái Răng.'],
        'complete': ['Ghe kín rồi! Ra bến ghe cạnh Ninh Kiều mà xuống ghe. Nhớ: nước ròng thì sông chảy mạnh, nước lớn thì êm.'],
    },
})
upsert(q, {
    'id': 'vn-ct-river', 'kind': 'exploration', 'title': 'Xuôi dòng Hậu giang', 'giver': 'ct-ferry-girl', 'requires': ['vn-ct-boat'],
    'description': 'Chèo ghe ghé bãi bồi giữa sông, rồi xuôi xuống chợ nổi Cái Răng.',
    'objectives': [
        {'type': 'explore', 'target': 'dock:ct-dock-baibo', 'count': 1, 'text': 'Cập bến Bãi Bồi giữa sông (phía tây bắc Cồn Sơn)', 'marker': m(78, 13)},
        {'type': 'explore', 'target': 'dock:ct-dock-cairang', 'count': 1, 'text': 'Xuôi dòng, cập bến ghe Cái Răng', 'marker': m(111, 96)},
        {'type': 'talk', 'target': 'ct-ferry-girl', 'count': 1, 'text': 'Kể lại chuyến đi cho cô lái đò', 'marker': m(74, 70)},
    ],
    'rewards': {'items': {'sitrus-berry': 2, 'greatball': 3}, 'worldExp': 700, 'reputation': 15, 'flags': ['vn:river-guide']},
    'dialogue': {
        'offer': ['Giữa sông có bãi bồi mới nổi, chưa ai lên tới. Con chèo ra coi thử, rồi xuôi xuống chợ nổi luôn.'],
        'progress': ['Bãi bồi ở phía tây bắc Cồn Sơn. Muốn xuống Cái Răng thì cứ thả theo con nước.'],
        'complete': ['Giỏi! Giờ con rành sông Hậu hơn cả dân chèo đò rồi.'],
    },
})
upsert(q, {
    'id': 'vn-ct-market', 'kind': 'side', 'title': 'Phiên chợ sớm', 'giver': 'ct-merchant', 'requires': ['vn-ct-2'],
    'description': 'Chợ nổi Cái Răng họp từ 5 giờ đến 9 giờ sáng. Ghé các ghe hàng mua đồ đi đường.',
    'objectives': [
        {'type': 'collect', 'target': 'market', 'count': 3, 'text': 'Mua hàng 3 lượt trên chợ nổi (5:00–9:00)', 'marker': m(109, 92)},
        {'type': 'talk', 'target': 'ct-merchant', 'count': 1, 'text': 'Kể Chủ ghe Tư Hiền nghe phiên chợ', 'marker': m(118, 88)},
    ],
    'rewards': {'items': {'sitrus-berry': 1, 'netball': 2}, 'worldExp': 400, 'reputation': 10},
    'dialogue': {
        'offer': ['Muốn biết chợ nổi thì phải dậy sớm! Từ 5 giờ tới 9 giờ sáng, ghe nào bán gì thì treo lên cây bẹo. Con thử mua vài món coi.'],
        'progress': ['Ghe đậu dọc bờ sông phía nam bến. Hàng mỗi phiên có hạn, hết là phải chờ phiên sau.'],
        'complete': ['Biết nhìn cây bẹo, biết mua sớm — vậy là thành dân chợ nổi rồi đó!'],
    },
})
open(QV, 'w', encoding='utf8', newline='\r\n').write(json.dumps(q, ensure_ascii=False, indent=1) + '\n')
print('ok', len(v['field']), 'field', len(q), 'vn quests')
