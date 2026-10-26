"""PERSONAL USE ONLY — adds the Mega forms to the PMD animation pack in public/assets/pmd/.

    python -I scripts/fetch-pmd-megas.py [tracker.json]

The pack imported by scripts/import-pmd-sprites.py only has base species, so Mega forms were drawn with their base
species' sheets (pmdPack alias) and looked unchanged after Mega Evolution. This downloads the Mega form sheets from
PMDCollab SpriteCollab (https://github.com/PMDCollab/SpriteCollab, CC BY-NC 4.0 — same source and licence as the rest
of the pack; artists in its credit files) into public/assets/pmd/<mega id>/ and adds them to index.json. Forms that
SpriteCollab does not have (no Walk + Idle sheet) keep the base-species fallback.
Like the rest of public/assets/pmd the result is git-ignored: do not commit, publish or share it.
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
FORM_NAME = {'mega': 'Mega', 'mega-x': 'Mega_X', 'mega-y': 'Mega_Y'}


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


def tracker():
    if len(sys.argv) > 1:
        return json.load(open(sys.argv[1], encoding='utf8'))
    return json.loads(get('https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json'))


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

    out = {}
    for n in ANIMS:
        r = resolve(n)
        if r and r[0]:
            out[n] = r
    return out


def main():
    # every Mega form of the game: data/pokemon.json, data/dex/pokemon.json and data/dex/megas.json
    megas = [p for f in ('src/data/pokemon.json', 'src/data/dex/pokemon.json', 'src/data/dex/megas.json') for p in json.load(open(f, encoding='utf8'))
             if '-mega' in p['id'] and p['id'].split('-mega')[1] in ('', '-x', '-y')]
    only = set(os.environ.get('MEGAS', '').split(',')) - {''}
    if only:
        megas = [m for m in megas if m['id'] in only]
    cache = json.load(open('src/data/pokeapi/pokeapi-cache.json', encoding='utf8'))
    index_path = f'{OUT}/index.json'
    pack = json.load(open(index_path, encoding='utf8'))
    species = pack['species']
    tr = tracker()
    added, missing = [], []
    for m in megas:
        mid = m['id']
        base, _, suffix = mid.partition('-mega')
        form_name = FORM_NAME['mega' + suffix]
        dex = cache['species'].get(base, {}).get('id')
        entry = tr.get(f'{dex:04d}') if dex else None
        form = next((k for k, v in (entry or {}).get('subgroups', {}).items() if v.get('name') == form_name), None)
        if not form:
            missing.append(mid)
            continue
        folder = f'{dex:04d}/{form}/'
        xml = get(RAW + folder + 'AnimData.xml')
        if not xml:
            missing.append(mid)
            continue
        meta = anim_meta(xml)
        rec = {'dex': dex, 'anims': {}, 'shiny': False}
        for shiny in (False, True):
            for anim, (m_, src_name) in meta.items():
                png = get(RAW + folder + ('0001/' if shiny else '') + f'{src_name}-Anim.png')
                if not png:
                    continue
                dst = f'{OUT}/{mid}/{"shiny/" if shiny else ""}{anim}.png'
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                open(dst, 'wb').write(png)
                if shiny:
                    rec['shiny'] = True
                    continue
                W, H = Image.open(io.BytesIO(png)).size
                rec['anims'][anim] = {'w': m_['w'], 'h': m_['h'], 'n': W // m_['w'], 'rows': max(1, H // m_['h']), 'd': m_['d'],
                                      **({'hit': m_['hit']} if 'hit' in m_ else {})}
            if shiny is False and not ('Walk' in rec['anims'] and 'Idle' in rec['anims']):
                break
        if 'Walk' in rec['anims'] and 'Idle' in rec['anims']:
            species[mid] = rec
            added.append(mid)
        else:
            missing.append(mid)
        print(' ', mid, 'ok' if mid in added else 'missing', flush=True)
    json.dump(pack, open(index_path, 'w', encoding='utf8'), separators=(',', ':'))
    print('added', len(added), 'mega forms; still on the base sprite:', missing)


main()
