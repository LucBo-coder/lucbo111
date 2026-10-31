"""PERSONAL USE ONLY — fills the gaps of the PMD animation pack in public/assets/pmd/.

    python -I scripts/fetch-pmd-missing.py [tracker.json]

The pack imported by scripts/import-pmd-sprites.py misses some species (they were drawn as static placeholders) and a
few of its sheets do not match their frame geometry (newer SpriteCollab art in an older AnimData layout); the game
rejects such a sheet, so the species — or its shiny — lost its animations. This downloads, from PMDCollab
SpriteCollab (https://github.com/PMDCollab/SpriteCollab, CC BY-NC 4.0 — same source and licence as the rest of the
pack; artists in its credit files):
  - every species of the game that has no sheets yet, and
  - every species with a sheet whose size does not match index.json (normal and shiny re-downloaded together),
taking the frame geometry from the downloaded images themselves. A shiny sheet that still does not match its normal
sheet is dropped and listed in `shinySkip` (the game plays the shiny Idle instead); a species whose shiny Walk / Idle
is unusable gets `shiny: false` (the game draws the shiny with the normal sheets).
Mega forms (scripts/fetch-pmd-megas.py) are not re-downloaded: a broken shiny of theirs is only switched off.
Like the rest of public/assets/pmd the result is personal use only (CC BY-NC 4.0, artists in CREDITS.md).
"""
import io
import json
import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

from PIL import Image

OUT = 'public/assets/pmd'
RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/'
ANIMS = ['Walk', 'Idle', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']


def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1 + attempt)
        except Exception:  # noqa: BLE001
            time.sleep(1 + attempt)
    return None


def anim_meta(xml):
    t = ET.fromstring(xml)
    raw = {a.findtext('Name'): a for a in t.find('Anims')}

    def resolve(name, depth=0):
        a = raw.get(name)
        if a is None or depth > 4:
            return None
        if a.find('CopyOf') is not None:
            return resolve(a.findtext('CopyOf'), depth + 1)
        return {'w': int(a.findtext('FrameWidth')), 'h': int(a.findtext('FrameHeight')),
                'd': [int(x.text) for x in a.find('Durations')],
                **({'hit': int(a.findtext('HitFrame'))} if a.find('HitFrame') is not None else {})}, name

    return {n: r for n in ANIMS if (r := resolve(n))}


def size(path):
    with Image.open(path) as im:
        return im.size


def broken(sp, rec):
    """Sheets on disk whose size does not match index.json (normal or shiny)."""
    for anim, m in rec['anims'].items():
        want = (m['w'] * m['n'], m['h'] * m['rows'])
        for sub in ([''] + (['shiny/'] if rec.get('shiny') and anim not in rec.get('shinySkip', []) else [])):
            p = f'{OUT}/{sp}/{sub}{anim}.png'
            if not os.path.exists(p) or size(p) != want:
                return True
    return False


def fetch(sp, dex):
    folder = f'{dex:04d}/'
    xml = get(RAW + folder + 'AnimData.xml')
    if not xml:
        return None
    meta = anim_meta(xml)
    rec = {'dex': dex, 'anims': {}, 'shiny': False}
    sheets = {}
    for anim, (m, src) in meta.items():
        png = get(RAW + folder + f'{src}-Anim.png')
        if not png:
            continue
        W, H = Image.open(io.BytesIO(png)).size
        if W % m['w'] or H % m['h']:
            continue
        sheets[anim] = png
        rec['anims'][anim] = {'w': m['w'], 'h': m['h'], 'n': W // m['w'], 'rows': max(1, H // m['h']), 'd': m['d'],
                              **({'hit': m['hit']} if 'hit' in m else {})}
    if not ('Walk' in rec['anims'] and 'Idle' in rec['anims']):
        return None
    shiny = {}
    for anim, (m, src) in meta.items():
        if anim not in rec['anims']:
            continue
        png = get(RAW + folder + f'0000/0001/{src}-Anim.png')
        if png and Image.open(io.BytesIO(png)).size == Image.open(io.BytesIO(sheets[anim])).size:
            shiny[anim] = png
    rec['shiny'] = 'Walk' in shiny and 'Idle' in shiny
    if rec['shiny'] and len(shiny) < len(rec['anims']):
        rec['shinySkip'] = [a for a in rec['anims'] if a not in shiny]
    # replace the folder's sheets as a whole: no stale sheet of the old layout is left behind
    for sub in ('', 'shiny/'):
        d = f'{OUT}/{sp}/{sub}'
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.endswith('.png'):
                    os.remove(d + f)
    os.makedirs(f'{OUT}/{sp}/shiny', exist_ok=True)
    for anim, png in sheets.items():
        open(f'{OUT}/{sp}/{anim}.png', 'wb').write(png)
    if rec['shiny']:
        for anim, png in shiny.items():
            open(f'{OUT}/{sp}/shiny/{anim}.png', 'wb').write(png)
    return rec


def main():
    tr = json.load(open(sys.argv[1], encoding='utf8')) if len(sys.argv) > 1 else json.loads(
        get('https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json'))
    cache = json.load(open('src/data/pokeapi/pokeapi-cache.json', encoding='utf8'))
    game = [p for f in ('src/data/pokemon.json', 'src/data/dex/pokemon.json') for p in json.load(open(f, encoding='utf8'))
            if not p.get('mega')]
    index_path = f'{OUT}/index.json'
    pack = json.load(open(index_path, encoding='utf8'))
    species = pack['species']
    for sp, rec in species.items():
        if '-mega' in sp and rec.get('shiny') and broken(sp, rec):
            rec['shiny'] = False
            print(' ', sp, 'shiny sheets do not match: shiny off', flush=True)
    todo = [p['id'] for p in game if p['id'] not in species]
    todo += [sp for sp, rec in species.items() if '-mega' not in sp and broken(sp, rec)]
    print(len(todo), 'species to fetch:', ' '.join(todo), flush=True)
    added, missing = [], []
    for sp in todo:
        dex = cache['species'].get(sp, {}).get('id')
        if not dex or f'{dex:04d}' not in tr:
            missing.append(sp)
            continue
        rec = fetch(sp, dex)
        if rec:
            species[sp] = rec
            added.append(sp)
        else:
            missing.append(sp)
        print(' ', sp, 'ok' + ('' if not rec or rec['shiny'] else ' (no shiny)') if rec else 'missing', flush=True)
        json.dump(pack, open(index_path, 'w', encoding='utf8'), separators=(',', ':'))
    print('fetched', len(added), 'species; still without PMD sheets:', missing)


main()
