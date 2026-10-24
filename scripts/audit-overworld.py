"""Audit local PNG padding without network access. Regenerate after importing PMD assets.

PMD animations share a canvas-centre coordinate system, NOT a bottom edge.
Calibrate the ground plane from each direction's first Idle frame; carry that
same centre-relative offset through every action (do not re-trim moving frames).
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
pack = root / 'public/assets/pmd'
index = json.loads((pack / 'index.json').read_text(encoding='utf8'))['species']
metadata, audit, errors = {}, {}, []
for species, entry in index.items():
    idle = entry['anims']['Idle']
    with Image.open(pack / species / 'Idle.png') as image:
        alpha = image.convert('RGBA').getchannel('A')
        feet = []
        for row in range(idle['rows']):
            box = alpha.crop((0, row * idle['h'], idle['w'], (row + 1) * idle['h'])).getbbox()
            feet.append((box[3] if box else idle['h'] / 2) - idle['h'] / 2)
        metadata[species] = feet
    sheets = {}
    for variant in ('', 'shiny/') if entry['shiny'] else ('',):
        for name, m in entry['anims'].items():
            path = pack / species / variant / (name + '.png')
            if not path.exists():
                errors.append(str(path.relative_to(root)))
                continue
            with Image.open(path) as image:
                if image.size != (m['w'] * m['n'], m['h'] * m['rows']):
                    errors.append(f'{path.relative_to(root)}: geometry mismatch')
                alpha = image.convert('RGBA').getchannel('A')
                boxes = [alpha.crop((x*m['w'], y*m['h'], (x+1)*m['w'], (y+1)*m['h'])).getbbox()
                         for y in range(m['rows']) for x in range(m['n'])]
                sheets[variant + name] = {'frame': [m['w'], m['h']], 'bounds': boxes}
    audit[species] = sheets
(root / 'src/render/pmdGround.json').write_text(json.dumps(metadata, separators=(',', ':')), encoding='utf8')
out = root / 'reports'
out.mkdir(exist_ok=True)
(out / 'sprite-padding.json').write_text(json.dumps({'errors': errors, 'species': audit}, separators=(',', ':')), encoding='utf8')
official = json.loads((root / 'public/assets/official/index.json').read_text(encoding='utf8'))
ids = set()
for path in (root / 'src/data').rglob('pokemon.json'):
    data = json.loads(path.read_text(encoding='utf8'))
    if isinstance(data, list):
        ids.update(s['id'] for s in data)
missing = sorted(ids - index.keys())
battle = sorted(set(official['front']) - set(official['icons']) - index.keys())
(out / 'overworld-assets.json').write_text(json.dumps({'pmdSpecies': len(index), 'missingDirectionalOverworld': missing,
    'battleFrontFallback': battle, 'assetErrors': errors}, indent=2), encoding='utf8')
print(f'Audited {len(index)} species; {len(errors)} asset errors; {len(missing)} lack PMD; {len(battle)} battle fallbacks')
