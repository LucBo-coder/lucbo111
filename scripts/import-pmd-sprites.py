"""PERSONAL USE ONLY — imports the Pokémon Mystery Dungeon style animation sheets into public/assets/pmd/.

    python -I scripts/import-pmd-sprites.py <pokesurvivor-main.zip>

Source of the images: https://github.com/JPTER78/pokesurvivor (assets/pokemon/), which redistributes sprites of
PMDCollab SpriteCollab (https://github.com/PMDCollab/SpriteCollab) under CC BY-NC 4.0 — non-commercial use with
attribution to the artists (CREDITS.md is copied next to the sheets and shown in-game). Pokémon is a trademark of
Nintendo / Creatures / GAME FREAK / The Pokémon Company: like public/assets/official, the folder is git-ignored —
do not commit, publish or share it (or a dist/ build that contains it).

Only the images are taken from that repository (its code is PolyForm Noncommercial and is not used). Frame geometry
comes from SpriteCollab's own AnimData.xml (same licence as the images), cached in <out>/animdata/.
"""
import json
import os
import shutil
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ZIP = sys.argv[1]
OUT = 'public/assets/pmd'
ANIMS = ['Walk', 'Idle', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']
SC = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/{:04d}/AnimData.xml'

cache = json.load(open('src/data/pokeapi/pokeapi-cache.json', encoding='utf8'))
by_dex = {s['id']: name for name, s in cache['species'].items()}

os.makedirs(f'{OUT}/animdata', exist_ok=True)
z = zipfile.ZipFile(ZIP)
root = z.namelist()[0].split('/')[0]
files = [n for n in z.namelist() if n.startswith(f'{root}/assets/pokemon/') and n.endswith('.png')]
ids = sorted({int(n.split('/')[3]) for n in files if n.split('/')[3].isdigit()})
print(len(files), 'images,', len(ids), 'species folders')


def anim_data(dex):
    path = f'{OUT}/animdata/{dex:04d}.xml'
    if not os.path.exists(path):
        for attempt in range(4):
            try:
                with urllib.request.urlopen(SC.format(dex), timeout=30) as r:
                    open(path, 'wb').write(r.read())
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 3:
                    print('  no AnimData for', dex, e)
                    return None
                time.sleep(1 + attempt)
        time.sleep(0.03)
    t = ET.parse(path).getroot()
    raw = {}
    for a in t.find('Anims'):
        name = a.findtext('Name')
        raw[name] = a

    def resolve(name, depth=0):
        a = raw.get(name)
        if a is None or depth > 4:
            return None
        if a.find('CopyOf') is not None:
            return resolve(a.findtext('CopyOf'), depth + 1)
        return {'w': int(a.findtext('FrameWidth')), 'h': int(a.findtext('FrameHeight')),
                'd': [int(x.text) for x in a.find('Durations')],
                **({'hit': int(a.findtext('HitFrame'))} if a.find('HitFrame') is not None else {})}
    return {n: resolve(n) for n in ANIMS}


index = {}
skipped = []
for dex in ids:
    name = by_dex.get(dex)
    if not name:
        skipped.append(dex)
        continue
    meta = anim_data(dex)
    if not meta:
        skipped.append(dex)
        continue
    entry = {'dex': dex, 'anims': {}, 'shiny': False}
    for shiny in (False, True):
        for anim in ANIMS:
            src = f'{root}/assets/pokemon/{dex}/{"s/" if shiny else ""}{anim}.png'
            m = meta.get(anim)
            if src not in z.NameToInfo or not m:
                continue
            dst = f'{OUT}/{name}/{"shiny/" if shiny else ""}{anim}.png'
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(src) as fsrc, open(dst, 'wb') as fdst:
                shutil.copyfileobj(fsrc, fdst)
            if shiny:
                entry['shiny'] = True
                continue
            # rows: 8 directions (or 1 for non-directional sheets) — from the sheet height
            from PIL import Image
            W, H = Image.open(dst).size
            entry['anims'][anim] = {'w': m['w'], 'h': m['h'], 'n': W // m['w'], 'rows': max(1, H // m['h']), 'd': m['d'], **({'hit': m['hit']} if 'hit' in m else {})}
    if 'Walk' in entry['anims'] and 'Idle' in entry['anims']:
        index[name] = entry
    else:
        skipped.append(dex)
    if len(index) % 100 == 0:
        print(' ', len(index), 'species…', flush=True)

credits = f'{root}/CREDITS.md'
if credits in z.NameToInfo:
    with z.open(credits) as f, open(f'{OUT}/CREDITS.md', 'wb') as g:
        shutil.copyfileobj(f, g)
json.dump({'source': 'PMDCollab SpriteCollab (CC BY-NC 4.0) via github.com/JPTER78/pokesurvivor assets/pokemon',
           'note': 'Personal use only. Artists: CREDITS.md. Pokémon © Nintendo / Creatures / GAME FREAK / The Pokémon Company.',
           'species': index}, open(f'{OUT}/index.json', 'w', encoding='utf8'), separators=(',', ':'))
print('done:', len(index), 'species, skipped', len(skipped), skipped[:30])
