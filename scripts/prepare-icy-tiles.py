"""Cuts flat cave-floor tiles out of IcyEthics' padded_caveTiles.png for the new dungeons.

    python -I scripts/prepare-icy-tiles.py <padded_caveTiles.png> public/assets/icyethics/tiles

Source: https://github.com/IcyEthics/PokemonAssets (Tilesets/padded_caveTiles.png) — free for non-commercial
projects, credit IcyEthics; changed/derived versions must stay free to use and adapt (see README-IcyEthics.md).
The tileset is 32 px per tile, drawn as 16 px pixel art doubled: every tile is checked to really be 2×2 pixel
blocks, then sampled 2:1 → the original 16 px tile, the game's tile size (no resampling, no distortion).
Only flat floor tiles are used (no autotile edges are needed for the dungeon floor).
"""
import os
import sys

from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
img = Image.open(SRC).convert('RGBA')

# (x, y) of 32 px cells, picked by eye from the sheet: plain grey stone floor, lavender ice floor
PICK = {
    'cave_gray': [(32, 768), (96, 768), (128, 768), (160, 768)],
    'cave_blue': [(0, 864), (32, 864), (160, 864), (64, 896)],
}

for name, cells in PICK.items():
    for i, (x, y) in enumerate(cells):
        cell = img.crop((x, y, x + 32, y + 32))
        px = cell.load()
        # verify 2×2 blocks (a few stray pixels are tolerated)
        bad = sum(1 for yy in range(0, 32, 2) for xx in range(0, 32, 2)
                  if len({px[xx, yy], px[xx + 1, yy], px[xx, yy + 1], px[xx + 1, yy + 1]}) > 1)
        if bad > 8:
            raise SystemExit(f'{name}_{i}: not 2x pixel art ({bad} mixed blocks)')
        small = Image.new('RGBA', (16, 16))
        sp = small.load()
        for yy in range(16):
            for xx in range(16):
                sp[xx, yy] = px[xx * 2, yy * 2]
        small.save(os.path.join(OUT, f'{name}_{i}.png'), optimize=True)
        print(f'{name}_{i}  from {x},{y}  mixed blocks: {bad}')
