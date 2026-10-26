# V22 map design — An Giang and Cà Mau upgraded after the Cần Thơ sample. Idempotent.
# - An Giang: Đồng Nước Nổi becomes flooded paddies (area `paddy`: water plots ringed by dikes, some standing rice),
#   fishing on the plots, điên điển flowers on the dikes, melaleuca honey in Trà Sư, two hidden nooks (a thicket in
#   Trà Sư, a cracked rock in Thất Sơn) and Cô Sáu's flood-season harvest.
# - Cà Mau: mangrove snails on the mud flats, fishing on the tidal creeks, melaleuca honey in U Minh, two hidden nooks
#   (mangrove roots, a U Minh thicket), a bamboo rod from Ngư dân Tư Sáu; the second `chest-cm-mangrove` (a duplicate
#   id: opening one marked both opened) gets its own id.
# Usage: python scripts/patch-v22-angiang-camau.py
import json

AG = 'src/data/vietnam/an-giang.json'
CM = 'src/data/vietnam/ca-mau.json'
GA = 'src/data/world/gathering.json'
QV = 'src/data/vietnam/quests.json'


def upsert(arr, item, key='id'):
    for i, x in enumerate(arr):
        if x.get(key) == item[key]:
            arr[i] = item
            return
    arr.append(item)


def load(p):
    return json.load(open(p, encoding='utf8'))


def save_map(p, d):
    open(p, 'w', encoding='utf8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')


# ── An Giang ─────────────────────────────────────────────────────────────────
ag = load(AG)
next(a for a in ag['areas'] if a['id'] == 'ag-wetland')['paddy'] = {'cell': 6, 'rice': 0.3}
for c in [
    {'id': 'chest-ag-tra-su-nook', 'x': 54, 'y': 96, 'items': {'sitrus-berry': 2, 'miracle-seed': 1, 'netball': 3}, 'requiresFlag': 'field:an-giang:ag-thicket'},
    {'id': 'chest-ag-that-son-nook', 'x': 77, 'y': 30, 'items': {'ultraball': 2, 'soft-sand': 1, 'exp-candy-s': 2}, 'requiresFlag': 'field:an-giang:ag-cracked'},
]:
    upsert(ag['chests'], c)
ag['nodes'] = [
    {'id': 'ag-flower-1', 'table': 'flood-forage', 'x': 104, 'y': 74},
    {'id': 'ag-flower-2', 'table': 'flood-forage', 'x': 116, 'y': 86},
    {'id': 'ag-flower-3', 'table': 'flood-forage', 'x': 110, 'y': 98},
    {'id': 'ag-fish-1', 'table': 'paddy-fish', 'x': 110, 'y': 68},
    {'id': 'ag-fish-2', 'table': 'paddy-fish', 'x': 116, 'y': 92},
    {'id': 'ag-fish-3', 'table': 'paddy-fish', 'x': 118, 'y': 104},
    {'id': 'ag-honey-1', 'table': 'melaleuca-honey', 'x': 64, 'y': 90},
    {'id': 'ag-honey-2', 'table': 'melaleuca-honey', 'x': 80, 'y': 104},
]
ag['field'] = [
    {'id': 'ag-thicket', 'ability': 'cut', 'x': 58, 'y': 96, 'nook': {'cx': 54.5, 'cy': 96.5, 'r': 3, 'wall': 'tree'}},
    {'id': 'ag-cracked', 'ability': 'smash', 'x': 81, 'y': 30, 'nook': {'cx': 77.5, 'cy': 30.5, 'r': 3, 'wall': 'boulder'}},
]
save_map(AG, ag)

# ── Cà Mau ───────────────────────────────────────────────────────────────────
cm = load(CM)
dups = [c for c in cm['chests'] if c['id'] == 'chest-cm-mangrove']
if len(dups) > 1:
    dups[1]['id'] = 'chest-cm-mangrove-west'
for c in [
    {'id': 'chest-cm-roots-nook', 'x': 34, 'y': 66, 'items': {'oranberry': 4, 'netball': 2, 'exp-candy-xs': 3}, 'requiresFlag': 'field:ca-mau:cm-roots'},
    {'id': 'chest-cm-uminh-nook', 'x': 12, 'y': 9, 'items': {'greatball': 3, 'miracle-seed': 1, 'potion': 3}, 'requiresFlag': 'field:ca-mau:cm-uminh-thicket'},
]:
    upsert(cm['chests'], c)
cm['nodes'] = [
    {'id': 'cm-snail-1', 'table': 'mangrove-forage', 'x': 8, 'y': 46},
    {'id': 'cm-snail-2', 'table': 'mangrove-forage', 'x': 24, 'y': 60},
    {'id': 'cm-snail-3', 'table': 'mangrove-forage', 'x': 96, 'y': 63},
    {'id': 'cm-fish-1', 'table': 'mangrove-fish', 'x': 10, 'y': 48},
    {'id': 'cm-fish-2', 'table': 'mangrove-fish', 'x': 40, 'y': 47},
    {'id': 'cm-fish-3', 'table': 'mangrove-fish', 'x': 81, 'y': 56},
    {'id': 'cm-honey-1', 'table': 'melaleuca-honey', 'x': 41, 'y': 10},
    {'id': 'cm-honey-2', 'table': 'melaleuca-honey', 'x': 108, 'y': 32},
]
cm['field'] = [
    {'id': 'cm-roots', 'ability': 'cut', 'x': 38, 'y': 66, 'nook': {'cx': 34.5, 'cy': 66.5, 'r': 3, 'wall': 'tree'}},
    {'id': 'cm-uminh-thicket', 'ability': 'cut', 'x': 16, 'y': 9, 'nook': {'cx': 12.5, 'cy': 9.5, 'r': 3, 'wall': 'tree'}},
]
save_map(CM, cm)

# ── gathering tables ─────────────────────────────────────────────────────────
ROD_CM = 'Ngư dân Tư Sáu ở bờ biển Mũi Cà Mau có cây cần câu dư — ghé hỏi chú thử.'
g = load(GA)
g['mangrove-forage'] = {
    'kind': 'forage', 'name': 'Bãi ốc len rừng đước', 'cooldown': 200, 'pokemonChance': 0.18,
    'pokemon': [
        {'species': 'krabby', 'level': [3, 6], 'weight': 6}, {'species': 'corphish', 'level': [3, 6], 'weight': 4},
        {'species': 'wooper', 'level': [3, 6], 'weight': 4}, {'species': 'shellos', 'level': [4, 7], 'weight': 3},
        {'species': 'clauncher', 'level': [5, 7], 'weight': 1},
    ],
    'items': [
        {'id': 'oranberry', 'qty': [1, 3], 'weight': 30}, {'id': 'potion', 'qty': [1, 1], 'weight': 18},
        {'id': 'exp-candy-xs', 'qty': [1, 2], 'weight': 16}, {'id': 'pokeball', 'qty': [1, 2], 'weight': 14},
        {'id': 'netball', 'qty': [1, 1], 'weight': 5}, {'id': 'mystic-water', 'qty': [1, 1], 'weight': 1},
    ],
}
g['mangrove-fish'] = {
    'kind': 'fish', 'name': 'Lạch rừng đước', 'cooldown': 75, 'requiresFlag': 'tool:rod',
    'lockedText': ['Bạn chưa có cần câu.', ROD_CM],
    'pokemonChance': 0.5,
    'pokemon': [
        {'species': 'magikarp', 'level': [4, 7], 'weight': 30}, {'species': 'tentacool', 'level': [4, 7], 'weight': 18},
        {'species': 'krabby', 'level': [4, 7], 'weight': 18}, {'species': 'remoraid', 'level': [5, 7], 'weight': 12},
        {'species': 'finneon', 'level': [5, 7], 'weight': 10}, {'species': 'skrelp', 'level': [6, 8], 'weight': 3},
    ],
    'items': [
        {'id': 'oranberry', 'qty': [1, 2], 'weight': 25}, {'id': 'netball', 'qty': [1, 1], 'weight': 18},
        {'id': 'potion', 'qty': [1, 1], 'weight': 15}, {'id': 'exp-candy-xs', 'qty': [1, 2], 'weight': 10},
        {'id': 'water-stone', 'qty': [1, 1], 'weight': 2},
    ],
}
g['melaleuca-honey'] = {
    'kind': 'forage', 'name': 'Bọng ong rừng tràm', 'cooldown': 300, 'pokemonChance': 0.25,
    'pokemon': [
        {'species': 'combee', 'level': [6, 11], 'weight': 8}, {'species': 'burmy', 'level': [6, 10], 'weight': 4},
        {'species': 'cutiefly', 'level': [7, 11], 'weight': 3}, {'species': 'heracross', 'level': [10, 12], 'weight': 1},
    ],
    'items': [
        {'id': 'sitrus-berry', 'qty': [1, 1], 'weight': 24}, {'id': 'oranberry', 'qty': [2, 3], 'weight': 22},
        {'id': 'exp-candy-s', 'qty': [1, 1], 'weight': 12}, {'id': 'superpotion', 'qty': [1, 1], 'weight': 8},
        {'id': 'miracle-seed', 'qty': [1, 1], 'weight': 2},
    ],
}
g['flood-forage'] = {
    'kind': 'forage', 'name': 'Bông điên điển', 'cooldown': 220, 'pokemonChance': 0.15,
    'pokemon': [
        {'species': 'sunkern', 'level': [9, 12], 'weight': 5}, {'species': 'hoppip', 'level': [9, 12], 'weight': 4},
        {'species': 'lotad', 'level': [9, 12], 'weight': 4}, {'species': 'petilil', 'level': [10, 13], 'weight': 2},
    ],
    'items': [
        {'id': 'oranberry', 'qty': [2, 3], 'weight': 28}, {'id': 'sitrus-berry', 'qty': [1, 1], 'weight': 18},
        {'id': 'exp-candy-s', 'qty': [1, 1], 'weight': 12}, {'id': 'superpotion', 'qty': [1, 1], 'weight': 8},
        {'id': 'kelpsy-berry', 'qty': [1, 1], 'weight': 4}, {'id': 'leaf-stone', 'qty': [1, 1], 'weight': 2},
    ],
}
g['paddy-fish'] = {
    'kind': 'fish', 'name': 'Ruộng nước nổi', 'cooldown': 75, 'requiresFlag': 'tool:rod',
    'lockedText': ['Bạn chưa có cần câu.', ROD_CM],
    'pokemonChance': 0.5,
    'pokemon': [
        {'species': 'barboach', 'level': [9, 13], 'weight': 28}, {'species': 'goldeen', 'level': [9, 13], 'weight': 20},
        {'species': 'poliwag', 'level': [9, 13], 'weight': 18}, {'species': 'buizel', 'level': [10, 13], 'weight': 12},
        {'species': 'surskit', 'level': [9, 12], 'weight': 10}, {'species': 'basculin', 'level': [12, 14], 'weight': 3},
    ],
    'items': [
        {'id': 'netball', 'qty': [1, 2], 'weight': 25}, {'id': 'oranberry', 'qty': [1, 2], 'weight': 20},
        {'id': 'superpotion', 'qty': [1, 1], 'weight': 12}, {'id': 'exp-candy-s', 'qty': [1, 1], 'weight': 8},
        {'id': 'water-stone', 'qty': [1, 1], 'weight': 3},
    ],
}
open(GA, 'w', encoding='utf8', newline='\n').write(json.dumps(g, ensure_ascii=False, indent=1) + '\n')

# ── quests ───────────────────────────────────────────────────────────────────
q = load(QV)
upsert(q, {
    'id': 'vn-cm-rod', 'kind': 'side', 'title': 'Cần câu của Ngư dân Tư Sáu', 'giver': 'cm-fisher', 'requires': ['vn-cm-1'],
    'description': 'Ngư dân Tư Sáu có cây cần câu dư. Lượm giùm chú ít ốc len ngoài rừng đước rồi chú cho mượn.',
    'objectives': [
        {'type': 'collect', 'target': 'forage', 'count': 2, 'text': 'Lượm 2 bãi ốc len trong rừng đước (0/2)', 'marker': {'x': 24, 'y': 60, 'region': 'ca-mau'}},
        {'type': 'talk', 'target': 'cm-fisher', 'count': 1, 'text': 'Mang ốc về cho Ngư dân Tư Sáu', 'marker': {'x': 46, 'y': 97, 'region': 'ca-mau'}},
    ],
    'rewards': {'items': {'netball': 2, 'oranberry': 3}, 'worldExp': 120, 'reputation': 5, 'flags': ['tool:rod']},
    'dialogue': {
        'offer': ['Nước ròng rồi, ốc len bám đầy gốc đước mà chú còn phải vá lưới.', 'Con lượm phụ chú vài bãi ốc, chú cho con cây cần câu dư — lạch rừng đước cá nhiều lắm.'],
        'progress': ['Ốc len bám mấy bãi bùn dưới gốc đước đó con. Coi chừng con Krabby nó kẹp.'],
        'complete': ['Ốc ngon quá! Cây cần câu nè con. Lạch nào trong rừng đước cũng thả câu được, ruộng nước nổi An Giang cũng vậy.'],
    },
})
upsert(q, {
    'id': 'vn-ag-flood-harvest', 'kind': 'side', 'title': 'Mùa nước nổi của Cô Sáu', 'giver': 'ag-sugar-palm', 'requires': ['vn-ag-1'],
    'description': 'Mùa nước nổi, Cô Sáu đường thốt nốt cần bông điên điển và mật ong tràm để làm bánh — và một mẻ cá đồng.',
    'objectives': [
        {'type': 'collect', 'target': 'forage', 'count': 3, 'text': 'Hái bông điên điển / lấy mật ong tràm (0/3)', 'marker': {'x': 104, 'y': 74, 'region': 'an-giang'}},
        {'type': 'collect', 'target': 'fish', 'count': 1, 'text': 'Câu một mẻ trên ruộng nước nổi (0/1)', 'marker': {'x': 110, 'y': 68, 'region': 'an-giang'}},
        {'type': 'talk', 'target': 'ag-sugar-palm', 'count': 1, 'text': 'Mang về cho Cô Sáu đường thốt nốt', 'marker': {'x': 76, 'y': 71, 'region': 'an-giang'}},
    ],
    'rewards': {'items': {'sitrus-berry': 3, 'superpotion': 2, 'greatball': 3}, 'worldExp': 260, 'reputation': 6},
    'dialogue': {
        'offer': ['Nước nổi rồi con! Bông điên điển vàng rực trên bờ ruộng, ong tràm trong Trà Sư cũng đầy bọng.', 'Con hái giùm cô ít bông, lấy ít mật, rồi câu một mẻ cá đồng — cô làm bánh đãi cả xóm.'],
        'progress': ['Bông điên điển mọc trên bờ ruộng phía đông, bọng ong thì trong rừng tràm. Cá thì thả câu trên mấy ô ruộng ngập — chưa có cần thì hỏi Ngư dân Tư Sáu dưới Cà Mau.'],
        'complete': ['Trời, đủ hết rồi! Bánh điên điển chấm mật ong tràm, thêm nồi cá kho — mùa nước nổi vậy mới vui. Cầm lấy nè con.'],
    },
})
open(QV, 'w', encoding='utf8', newline='\r\n').write(json.dumps(q, ensure_ascii=False, indent=1) + '\n')
print('ok')
