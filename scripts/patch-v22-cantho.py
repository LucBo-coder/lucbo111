# V22 map design — Cần Thơ as the sample region: Miệt vườn Phong Điền becomes a real Mekong orchard (fruit-tree beds
# between irrigation canals, data: area `orchard`), with fruit bushes to pick, fishing spots on the canals, a bamboo rod
# from Ông Sáu nhà vườn, and two hidden nooks (a thicket in the orchard, a cracked rock in the stork garden). Idempotent.
# Usage: python scripts/patch-v22-cantho.py
import json

CT = 'src/data/vietnam/can-tho.json'
GA = 'src/data/world/gathering.json'
QV = 'src/data/vietnam/quests.json'


def upsert(arr, item, key='id'):
    for i, x in enumerate(arr):
        if x.get(key) == item[key]:
            arr[i] = item
            return
    arr.append(item)


def fmt(o):
    """One object per line, in the map file's own style: { "id": "x", "y": 1 }"""
    return '  ' + json.dumps(o, ensure_ascii=False, separators=(', ', ': ')).replace('{', '{ ').replace('}', ' }')


# ── map (the file is hand-formatted: edit it as text) ────────────────────────
NL = '\n'
src = open(CT, encoding='utf8').read()
d = json.loads(src)
# the garden chest moves off the new canal bank
src = src.replace('{ "id": "chest-ct-garden", "x": 12, "y": 92,', '{ "id": "chest-ct-garden", "x": 11, "y": 91,')
area = next(a for a in d['areas'] if a['id'] == 'ct-orchard')
if 'orchard' not in area:
    src = src.replace(fmt(area), fmt(dict(area, orchard={'period': 7, 'gap': 14})))
last = fmt(d['chests'][-1])
for c in [
    {'id': 'chest-ct-orchard-nook', 'x': 60, 'y': 105, 'items': {'sitrus-berry': 3, 'miracle-seed': 1, 'exp-candy-s': 2}, 'requiresFlag': 'field:can-tho:ct-thicket'},
    {'id': 'chest-ct-stork-nook', 'x': 10, 'y': 10, 'items': {'ultraball': 2, 'sharp-beak': 1, 'superpotion': 2}, 'requiresFlag': 'field:can-tho:ct-cracked'},
]:
    if '"' + c['id'] + '"' not in src:
        src = src.replace(last + NL, last + ',' + NL + fmt(c) + NL, 1)
        last = fmt(c)
nodes = [
    {'id': 'ct-bush-1', 'table': 'orchard-forage', 'x': 12, 'y': 77},
    {'id': 'ct-bush-2', 'table': 'orchard-forage', 'x': 44, 'y': 77},
    {'id': 'ct-bush-3', 'table': 'orchard-forage', 'x': 18, 'y': 91},
    {'id': 'ct-bush-4', 'table': 'orchard-forage', 'x': 64, 'y': 98},
    {'id': 'ct-bush-5', 'table': 'orchard-forage', 'x': 30, 'y': 105},
    {'id': 'ct-fish-1', 'table': 'canal-fish', 'x': 70, 'y': 78},
    {'id': 'ct-fish-2', 'table': 'canal-fish', 'x': 56, 'y': 92},
    {'id': 'ct-fish-3', 'table': 'canal-fish', 'x': 44, 'y': 99},
]
field = [
    {'id': 'ct-thicket', 'ability': 'cut', 'x': 64, 'y': 105, 'nook': {'cx': 60.5, 'cy': 105.5, 'r': 3, 'wall': 'tree'}},
    {'id': 'ct-cracked', 'ability': 'smash', 'x': 14, 'y': 10, 'nook': {'cx': 10.5, 'cy': 10.5, 'r': 3, 'wall': 'boulder'}},
]
if '"nodes"' not in src:
    body = src.rstrip()
    assert body.endswith('}')
    body = body[:-1].rstrip()
    src = (body + ',' + NL + ' "nodes": [' + NL + (',' + NL).join(fmt(n) for n in nodes) + NL + ' ],' + NL
           + ' "field": [' + NL + (',' + NL).join(fmt(f) for f in field) + NL + ' ]' + NL + '}' + NL)
check = json.loads(src)
assert any(a.get('orchard') for a in check['areas']) and len(check['nodes']) == 8 and len(check['field']) == 2
open(CT, 'w', encoding='utf8', newline='\n').write(src)

# ── gathering tables ─────────────────────────────────────────────────────────
g = json.load(open(GA, encoding='utf8'))
g['orchard-forage'] = {
    'kind': 'forage', 'name': 'Bụi trái cây miệt vườn', 'cooldown': 240, 'pokemonChance': 0.15,
    'pokemon': [
        {'species': 'cherubi', 'level': [16, 19], 'weight': 5}, {'species': 'combee', 'level': [16, 19], 'weight': 4},
        {'species': 'bounsweet', 'level': [16, 19], 'weight': 4}, {'species': 'applin', 'level': [17, 20], 'weight': 2},
        {'species': 'tropius', 'level': [19, 21], 'weight': 1},
    ],
    'items': [
        {'id': 'sitrus-berry', 'qty': [1, 2], 'weight': 30}, {'id': 'oranberry', 'qty': [2, 3], 'weight': 22},
        {'id': 'exp-candy-s', 'qty': [1, 2], 'weight': 12}, {'id': 'superpotion', 'qty': [1, 1], 'weight': 10},
        {'id': 'pomeg-berry', 'qty': [1, 1], 'weight': 4}, {'id': 'qualot-berry', 'qty': [1, 1], 'weight': 4},
        {'id': 'leaf-stone', 'qty': [1, 1], 'weight': 3}, {'id': 'miracle-seed', 'qty': [1, 1], 'weight': 2},
    ],
}
g['canal-fish'] = {
    'kind': 'fish', 'name': 'Mương vườn', 'cooldown': 75, 'requiresFlag': 'tool:rod',
    'lockedText': ['Bạn chưa có cần câu.', 'Ông Sáu nhà vườn ở miệt vườn Phong Điền có cây cần câu tre — ghé hỏi ông thử.'],
    'pokemonChance': 0.5,
    'pokemon': [
        {'species': 'barboach', 'level': [15, 18], 'weight': 30}, {'species': 'goldeen', 'level': [15, 18], 'weight': 20},
        {'species': 'wooper', 'level': [15, 18], 'weight': 18}, {'species': 'corphish', 'level': [15, 18], 'weight': 12},
        {'species': 'tympole', 'level': [15, 18], 'weight': 10}, {'species': 'basculin', 'level': [17, 19], 'weight': 3},
        {'species': 'feebas', 'level': [16, 18], 'weight': 2},
    ],
    'items': [
        {'id': 'netball', 'qty': [1, 2], 'weight': 25}, {'id': 'sitrus-berry', 'qty': [1, 1], 'weight': 20},
        {'id': 'superpotion', 'qty': [1, 1], 'weight': 15}, {'id': 'water-stone', 'qty': [1, 1], 'weight': 4},
        {'id': 'mystic-water', 'qty': [1, 1], 'weight': 3},
    ],
}
open(GA, 'w', encoding='utf8', newline='\n').write(json.dumps(g, ensure_ascii=False, indent=1) + '\n')

# ── the bamboo rod ───────────────────────────────────────────────────────────
q = json.load(open(QV, encoding='utf8'))
upsert(q, {
    'id': 'vn-ct-rod', 'kind': 'side', 'title': 'Cần câu tre của Ông Sáu', 'giver': 'ct-gardener', 'requires': ['vn-ct-1'],
    'description': 'Ông Sáu nhà vườn có cây cần câu tre dư. Phụ ông hái trái ngoài vườn rồi ông cho mượn.',
    'objectives': [
        {'type': 'collect', 'target': 'forage', 'count': 2, 'text': 'Hái 2 bụi trái cây trong miệt vườn (0/2)', 'marker': {'x': 44, 'y': 77, 'region': 'can-tho'}},
        {'type': 'talk', 'target': 'ct-gardener', 'count': 1, 'text': 'Mang trái về cho Ông Sáu', 'marker': {'x': 37, 'y': 96, 'region': 'can-tho'}},
    ],
    'rewards': {'items': {'netball': 2}, 'worldExp': 200, 'reputation': 5, 'flags': ['tool:rod']},
    'dialogue': {
        'offer': ['Vườn ông trái chín rục mà ông già rồi, hái không xuể.', 'Con hái phụ ông mấy bụi, ông cho mượn cây cần câu tre — mương vườn nhiều cá lắm.'],
        'progress': ['Mấy bụi trái nằm giữa mấy liếp cây đó con. Pokémon nhà con tự chạy đi hái phụ cũng được.'],
        'complete': ['Trái ngọt quá! Nè, cây cần câu tre của ông. Ra bờ mương thả câu, coi chừng con Barboach nó giựt mạnh lắm nghen.'],
    },
})
open(QV, 'w', encoding='utf8', newline='\r\n').write(json.dumps(q, ensure_ascii=False, indent=1) + '\n')
print('ok')
