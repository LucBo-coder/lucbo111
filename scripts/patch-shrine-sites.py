# One-off (V22 shrines step 1): moves the legendary sites onto their designed shrines (LEGENDARY_SHRINES.md),
# pointing each at its layout in data/world/shrines.json, and keeps legends.json `site` in sync.
import json, sys

W = 'src/data/world/'
FMT = {'starter-valley': '\n', 'emerald-woods': '\n'}  # others: CRLF, no final newline
REGIONS = ['starter-valley', 'frozen-mountains', 'volcanic-lands', 'misty-swamp', 'coral-coast', 'legendary-sanctuary', 'emerald-woods']
TILE = 48


def load(name):
    return json.load(open(W + name + '.json', encoding='utf8'))


def save(name, d):
    out = json.dumps(d, indent=1, ensure_ascii=False)
    if name in FMT or name == 'legend-clues':
        out += '\n'
    else:
        out = out.replace('\n', '\r\n')
    open(W + name + '.json', 'w', encoding='utf8', newline='').write(out)


shrines = {s['id']: s for s in json.load(open(W + 'shrines.json', encoding='utf8'))}
# legend → (region, x, y, shrine) — shrine None: keeps the stone ring until its own plane exists (step 5)
# no argument: every surface shrine on its designed spot; else only the given moves (JSON, see place-shrines.ts)
MOVES = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {
    s['legend']: (s['region'], s['x'], s['y'], s['id']) for s in shrines.values()
    if s['region'] != 'instanced' and s['id'] not in ('kyogre-gate', 'arceus-gate', 'lati', 'mesprit', 'cresselia', 'manaphy')}

maps = {r: load(r) for r in REGIONS}
sites = {}
for r, d in maps.items():
    for l in d.get('legendaries', []):
        sites[l['id']] = (r, l)
for legend, (region, x, y, sid) in MOVES.items():
    old_r, l = sites[legend]
    maps[old_r]['legendaries'].remove(l)
    l = {**l, 'x': x, 'y': y}
    l.pop('ring', None)
    if sid:
        l['shrine'] = sid
        if shrines[sid]['arena']:
            l['arena'] = (shrines[sid]['arena'] - 1) * TILE
    maps[region].setdefault('legendaries', []).append(l)
for r, d in maps.items():
    save(r, d)

legends = load('legends')
for e in legends:
    if e['id'] in MOVES:
        region, x, y, _ = MOVES[e['id']]
        e['site'] = {'x': x, 'y': y, 'region': region}
save('legends', legends)
print('moved', len(MOVES))
