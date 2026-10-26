# V22 conservation: the three province epilogue quests (after Seviper / Claydol / Whiscash). Idempotent.
# Usage: python scripts/patch-v22-eco.py
import json

QV = 'src/data/vietnam/quests.json'
CONS = json.load(open('src/data/vietnam/conservation.json', encoding='utf8'))['provinces']
q = json.load(open(QV, encoding='utf8'))


def upsert(arr, item):
    for i, x in enumerate(arr):
        if x['id'] == item['id']:
            arr[i] = item
            return
    arr.append(item)


def mk(p):
    s = CONS[p]['sites'][0]
    return {'x': s['x'], 'y': s['y'], 'region': p}


upsert(q, {
    'id': 'vn-cm-eco', 'kind': 'side', 'title': 'Trồng lại rừng đước', 'giver': 'cm-ranger', 'requires': ['vn-cm-3'],
    'description': 'Seviper đã rời đi nhưng bãi bồi ven rừng ngập mặn bị sạt lở. Trồng cây đước con dọc mép nước để giữ đất.',
    'objectives': [
        {'type': 'activate', 'target': 'eco:ca-mau', 'count': 6, 'text': 'Trồng cây đước con ở 6 chỗ ven nước (rừng ngập mặn)', 'marker': mk('ca-mau')},
        {'type': 'talk', 'target': 'cm-ranger', 'count': 1, 'text': 'Báo lại cho Kiểm lâm Nam', 'marker': {'x': 64, 'y': 40, 'region': 'ca-mau'}},
    ],
    'rewards': {'items': {'ultraball': 2, 'oranberry': 4}, 'worldExp': 500, 'reputation': 15},
    'dialogue': {
        'offer': ['Seviper đi rồi, nhưng mấy trận triều cường vừa rồi làm bãi bồi lở mất một khúc.', 'Cây đước con để sẵn ở mép nước. Con trồng giùm chú — rễ đước giữ đất, rồi cá, cua, chim sẽ về.'],
        'progress': ['Mấy bó cây con nằm dọc mép nước trong rừng ngập mặn. Bản đồ có đánh dấu chỗ đầu tiên.'],
        'complete': ['Rừng đước mọc lại rồi! Vài năm nữa ở đây sẽ thành rừng — tụi Pokémon hiếm sẽ quay về.'],
    },
})
upsert(q, {
    'id': 'vn-ag-eco', 'kind': 'side', 'title': 'Gỡ lưới bỏ hoang', 'giver': 'ag-boatman', 'requires': ['vn-ag-temple'],
    'description': 'Mùa nước nổi để lại những tấm lưới mục mắc trong lau sậy Đồng Nước Nổi, cá và Pokémon nước bị vướng.',
    'objectives': [
        {'type': 'activate', 'target': 'eco:an-giang', 'count': 6, 'text': 'Gỡ 6 tấm lưới bỏ hoang ven Đồng Nước Nổi', 'marker': mk('an-giang')},
        {'type': 'talk', 'target': 'ag-boatman', 'count': 1, 'text': 'Kể lại cho Bác lái đò Năm', 'marker': {'x': 104, 'y': 90, 'region': 'an-giang'}},
    ],
    'rewards': {'items': {'netball': 3, 'superpotion': 2}, 'worldExp': 550, 'reputation': 15},
    'dialogue': {
        'offer': ['Đền cổ yên rồi, giờ tới chuyện dưới nước. Lưới người ta bỏ lại sau mùa nước nổi, mục ra mà vẫn bẫy cá.', 'Con đi dọc mép đồng gỡ giùm bác mấy tấm lưới đó nghen.'],
        'progress': ['Lưới mắc ở mép nước phía đông, chỗ lau sậy mọc dày.'],
        'complete': ['Đồng thông thoáng rồi! Mùa tới cá linh về nhiều, Barboach với Buizel cũng về theo.'],
    },
})
upsert(q, {
    'id': 'vn-ct-eco', 'kind': 'side', 'title': 'Dòng Hậu trong xanh', 'giver': 'ct-boatwoman', 'requires': ['vn-ct-3'],
    'description': 'Whiscash đã yên giấc, nhưng rác nhựa vẫn dạt vào bờ sông Hậu. Gom rác ở 6 khúc bờ.',
    'objectives': [
        {'type': 'activate', 'target': 'eco:can-tho', 'count': 6, 'text': 'Vớt rác ở 6 khúc bờ sông Hậu', 'marker': mk('can-tho')},
        {'type': 'talk', 'target': 'ct-boatwoman', 'count': 1, 'text': 'Báo cho Cô Út chèo đò', 'marker': {'x': 94, 'y': 46, 'region': 'can-tho'}},
    ],
    'rewards': {'items': {'ultraball': 2, 'sitrus-berry': 2}, 'worldExp': 600, 'reputation': 15},
    'dialogue': {
        'offer': ['Whiscash ngủ lại dưới đáy sông rồi, mà nhìn bờ sông coi — toàn chai nhựa với bịch ni lông.', 'Sông sạch thì Pokémon dưới nước mới khỏe. Con phụ cô gom rác dọc bờ nghen.'],
        'progress': ['Rác dạt nhiều nhất ở mấy khúc bờ phía bắc thành phố, dọc sông Hậu.'],
        'complete': ['Bờ sông sạch bong! Dòng Hậu trong xanh thì cả miền Tây được nhờ.'],
    },
})
open(QV, 'w', encoding='utf8', newline='\r\n').write(json.dumps(q, ensure_ascii=False, indent=1) + '\n')
print('ok', len(q))
