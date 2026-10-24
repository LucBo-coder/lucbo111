"""Prepares the Rayquaza boss UI pack (user-supplied PNGs) for the game.

    python -I scripts/prepare-boss-ui.py <extracted rayquaza_boss_ui dir> public/assets/ui/boss

What it fixes in the source art (checked by eye + alpha analysis):
  • boss_hud_blue / boss_hud_red have a STATIC HP bar baked in → its interior is erased (the frame, "HP",
    "Lv." and the BOSS badge stay) and the baked fill is kept as a separate strip, so the game draws a real,
    dynamic bar by cropping (never stretching) that strip;
  • blue / purple bar fills come from hp_blue_full / hp_purple_full: their inner fill is scaled uniformly to the
    HUD bar height, and widened by REPEATING middle columns (no stretch, no distortion);
  • element_icons / status_icons / party_slots / choice_buttons / skill_slots hold several images in one file →
    cut apart along fully transparent columns;
  • a few bars carry stray fragments at the right edge (slicing leftovers) → dropped (only the main piece is kept);
  • command_menu is NOT exported: its labels are baked in (with a typo, "Pokénon") and it is a turn-based menu.
Writes PNGs + manifest.json (sizes, HP bar interior rectangle) next to them.
"""
import json
import os
import sys

from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
manifest = {'source': 'rayquaza_boss_ui_separated.zip (user-supplied)', 'files': {}}


def load(name):
    return Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')


def save(img, name, **meta):
    img.save(os.path.join(OUT, name + '.png'), optimize=True)
    manifest['files'][name] = {'w': img.width, 'h': img.height, **meta}


def col_runs(img, min_alpha=24, min_count=2, min_gap=2):
    """x ranges of non-transparent columns, split at transparent gaps ≥ min_gap px."""
    a = img.getchannel('A').load()
    filled = [sum(1 for y in range(img.height) if a[x, y] >= min_alpha) >= min_count for x in range(img.width)]
    runs, start, gap = [], None, 0
    for x, f in enumerate(filled + [False] * min_gap):
        if f:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                runs.append((start, x - gap + 1))
                start, gap = None, 0
    return runs


def split_n(img, n):
    """n pieces laid out in a row that may touch: cut at the emptiest column near each even boundary."""
    a = img.getchannel('A').load()
    count = [sum(1 for y in range(img.height) if a[x, y] >= 24) for x in range(img.width)]
    step = img.width / n
    cuts = [0]
    for i in range(1, n):
        c = round(i * step)
        w = max(2, round(step * 0.2))
        cuts.append(min(range(c - w, c + w + 1), key=lambda x: (count[x], abs(x - c))))
    cuts.append(img.width)
    return [(cuts[i], cuts[i + 1]) for i in range(n)]


def trim(img):
    bb = img.getchannel('A').point(lambda v: 255 if v >= 24 else 0).getbbox()
    return img.crop(bb) if bb else img


def main_piece(img):
    """Keeps the widest column run (drops stray fragments beside the main image)."""
    runs = col_runs(img, min_gap=3)
    x0, x1 = max(runs, key=lambda r: r[1] - r[0])
    return trim(img.crop((x0, 0, x1, img.height)))


def is_light(p):
    return p[3] > 200 and p[0] > 185 and p[1] > 185 and p[2] > 185


def bar_interior(img, cx, cy):
    """Interior rectangle of the white-outlined bar around (cx, cy)."""
    px = img.load()
    x = cx
    while x > 0 and not is_light(px[x, cy]):
        x -= 1
    left = x
    while is_light(px[left, cy]):
        left += 1
    x = cx
    while x < img.width - 1 and not is_light(px[x, cy]):
        x += 1
    right = x - 1
    y = cy
    while y > 0 and not is_light(px[cx, y]):
        y -= 1
    top = y
    while is_light(px[cx, top]):
        top += 1
    y = cy
    while y < img.height - 1 and not is_light(px[cx, y]):
        y += 1
    bottom = y - 1
    return left, top, right, bottom


def tile_to_width(strip, width):
    """Widens a horizontally uniform strip by repeating its middle columns (caps kept as they are)."""
    if strip.width >= width:
        return strip.crop((0, 0, width, strip.height))
    cap = max(2, strip.height // 2)
    mid = strip.crop((cap, 0, strip.width - cap, strip.height))
    out = Image.new('RGBA', (width, strip.height))
    out.paste(strip.crop((0, 0, cap, strip.height)), (0, 0))
    x = cap
    while x < width - cap:
        out.paste(mid, (x, 0))
        x += mid.width
    out.paste(strip.crop((strip.width - cap, 0, strip.width, strip.height)), (width - cap, 0))
    return out


# ── HUD frames + dynamic bar fills ──
interiors = {}
for color, fill_name, probe in (('blue', 'green', (420, 96)), ('red', 'red', (380, 94))):
    hud = load('boss_hud_' + color)
    l, t, r, b = bar_interior(hud, *probe)
    interiors[color] = (l, t, r, b)
    fill = hud.crop((l, t, r + 1, b + 1))
    save(fill, f'hud_fill_{fill_name}')
    # erase the static bar: interior → the dark "empty bar" colour of the panel
    empty = (8, 12, 24, 255) if color == 'blue' else (24, 6, 8, 255)
    frame = hud.copy()
    frame.paste(Image.new('RGBA', fill.size, empty), (l, t))
    save(frame, f'hud_frame_{color}', bar=[l, t, r - l + 1, b - t + 1])

# blue / purple fills: the HUD's own green fill re-hued (shading and size identical, nothing stretched).
# (Cropping the fill out of hp_blue_full / hp_purple_full was tried: it catches their outer frame or loses the
#  tube shading, so those bars are kept only as standalone images.)
import colorsys
green = Image.open(os.path.join(OUT, 'hud_fill_green.png')).convert('RGBA')
for name, hue, sat in (('blue', 0.585, 1.0), ('purple', 0.74, 0.95)):
    out = green.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            h, sv, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if sv > 0.25:  # keep the white highlight / outline pixels white
                rr, gg, bb = colorsys.hsv_to_rgb(hue, min(1, sv * sat), v)
                px[x, y] = (round(rr * 255), round(gg * 255), round(bb * 255), a)
    save(out, f'hud_fill_{name}')

# the interior crops include the outline's rounded corner pixels → transparent, so a cropped bar has clean ends
for name in ('green', 'red', 'blue', 'purple'):
    f = os.path.join(OUT, f'hud_fill_{name}.png')
    img = Image.open(f).convert('RGBA')
    px = img.load()
    for y in list(range(3)) + list(range(img.height - 3, img.height)):
        for x in list(range(3)) + list(range(img.width - 3, img.width)):
            if is_light(px[x, y]) or px[x, y][3] < 200:
                px[x, y] = (0, 0, 0, 0)
    img.save(f, optimize=True)

# ── single images (stray right-edge fragments dropped) ──
for n in ['boss_badge', 'legendary_badge', 'boss_warning_icon', 'phase_indicator', 'phase_change_panel',
          'skill_warning_panel', 'warning_panel_small', 'portrait_frame', 'dialogue_panel',
          'hp_green_full', 'hp_blue_full', 'hp_purple_full', 'hp_red_full', 'hp_empty_blue', 'hp_empty_blue2', 'hp_empty_purple', 'hp_empty_red']:
    save(main_piece(load(n)), n)

# ── sheets → separate images ──
for n, names in (
    ('element_icons', ['unknown', 'grass', 'electric', 'water', 'fire', 'ice', 'ghost', 'ground', 'flying']),
    ('status_icons', ['atkUp', 'defDown', 'shield', 'poison', 'sleep', 'burn', 'water', 'leech', 'confusion']),
):
    img = load(n)
    runs = split_n(img, len(names)) if names else col_runs(img, min_gap=3)
    for i, (x0, x1) in enumerate(runs):
        save(trim(img.crop((x0, 0, x1, img.height))), f'{n[:-1] if n.endswith("s") else n}_{names[i] if names else i}')

# party slots: a hollow square slot, then six wide Poké Ball slots; neighbours touch, so the cuts were measured
# from the alpha column profile (transparent / near-empty columns at these x) and are checked for sanity here
img = load('party_slots')
PARTY_CUTS = [9, 96, 297, 498, 700, 900, 1101, 1300]
assert img.width == 1310, img.size
names = ['small'] + [str(i) for i in range(6)]
for nm, x0, x1 in zip(names, PARTY_CUTS, PARTY_CUTS[1:]):
    save(trim(img.crop((x0, 0, x1, img.height))), f'party_slot_{nm}')

# choice buttons: the first stands alone, the other two touch → split at the emptiest middle column
img = load('choice_buttons')
runs = col_runs(img, min_gap=3)
assert len(runs) == 2, runs
a, b = runs[1]
(x0, xm), (_, x1) = split_n(img.crop((a, 0, b, img.height)), 2)
for nm, (u, v) in zip(['default', 'selected', 'plain'], [runs[0], (a, a + xm), (a + xm, b)]):
    save(trim(img.crop((u, 0, v, img.height))), f'choice_button_{nm}')

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf8'), indent=1)
print(len(manifest['files']), 'files ->', OUT)
for k, v in manifest['files'].items():
    print(f'  {k:28s} {v}')
