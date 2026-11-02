"""PERSONAL USE ONLY — adds alternate forms (Castform's weather forms, Alolan forms) to the PMD animation pack.

    python -I scripts/fetch-pmd-forms.py

Same source, licence and layout as scripts/fetch-pmd-megas.py (PMDCollab SpriteCollab, CC BY-NC 4.0): downloads each
form's sheets into public/assets/pmd/<form id>/ and adds it to index.json. Forms SpriteCollab has no Walk + Idle sheet
for are skipped (the game then draws the form's official art, or the base species).
"""
import io
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET

from PIL import Image

OUT = 'public/assets/pmd'
RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/'
ANIMS = ['Walk', 'Idle', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']
# game id → (national dex number, SpriteCollab form folder)
FORMS = {
    'castform-sunny': (351, '0001'),
    'castform-rainy': (351, '0002'),
    'castform-snowy': (351, '0003'),
    'cherrim-sunshine': (421, '0001'),
    'vulpix-alola': (37, '0001'),
    'ninetales-alola': (38, '0001'),
}


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

    out = {}
    for n in ANIMS:
        r = resolve(n)
        if r and r[0]:
            out[n] = r
    return out


def main():
    index_path = f'{OUT}/index.json'
    pack = json.load(open(index_path, encoding='utf8'))
    species = pack['species']
    for fid, (dex, form) in FORMS.items():
        folder = f'{dex:04d}/{form}/'
        xml = get(RAW + folder + 'AnimData.xml')
        if not xml:
            print(' ', fid, 'missing', flush=True)
            continue
        meta = anim_meta(xml)
        rec = {'dex': dex, 'anims': {}, 'shiny': False}
        for shiny in (False, True):
            for anim, (m_, src_name) in meta.items():
                png = get(RAW + folder + ('0001/' if shiny else '') + f'{src_name}-Anim.png')
                if not png:
                    continue
                dst = f'{OUT}/{fid}/{"shiny/" if shiny else ""}{anim}.png'
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                open(dst, 'wb').write(png)
                if shiny:
                    rec['shiny'] = True
                    continue
                W, H = Image.open(io.BytesIO(png)).size
                rec['anims'][anim] = {'w': m_['w'], 'h': m_['h'], 'n': W // m_['w'], 'rows': max(1, H // m_['h']), 'd': m_['d'],
                                      **({'hit': m_['hit']} if 'hit' in m_ else {})}
        ok = 'Walk' in rec['anims'] and 'Idle' in rec['anims']
        if ok:
            species[fid] = rec
        print(' ', fid, 'ok' if ok else 'missing', flush=True)
    json.dump(pack, open(index_path, 'w', encoding='utf8'), separators=(',', ':'))


main()
