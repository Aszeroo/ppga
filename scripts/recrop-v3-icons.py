"""Ticket #50 close-out: re-crop the 30 v3-icons to UNIFORM native cells.

The first export (extract-v3-assets.py) wrote tight art bboxes; the brief asks
for "native grid scale" uniform cells — measured on the board with the shared
detector: every cell's art band starts at interior row 13 and every ink extent
is an exact multiple of 8 px, i.e. the art sits on the 12x12 grid at 8px
subcells = the 96px standard cell. So this pass keeps the 1:1 pixel scale (NO
resampling, quality preserved), and pastes each icon's ink CENTRED into a 96x96
RGBA canvas — one uniform native cell per icon. The label band (which sits
8-24px under the art and would be swallowed by any fixed 96-tall crop of a
short icon) is excluded by taking band 1 only (art band, rows 13..first white
gap — the same band rule the first export verified per icon).

The uniform cell also fixes the flagged lock.png crop: the shackle now rides
inside a 96x96 cell with margin instead of flush to a tight crop edge.

The previous tight exports are copied to scripts/v3-icons-tight-backup/ first
(scratch, untracked — provenance for the verifier).

Run: `python3 scripts/recrop-v3-icons.py` from the worktree root (PIL is in
user-site, so do NOT use -I). Untracked tool, like extract-v3-assets.py.
"""

import importlib.util
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location('extractv3', ROOT / 'scripts' / 'extract-v3-assets.py')
ext = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ext)

CELL = 96  # 12x12 grid @ 8px subcell — the brief's standard native scale
TRIM = 3  # frame AA ring inside the detected cell bbox
ART_ROW0 = 13  # measured: every cell's art band starts at interior row 13
OUT_DIR = ROOT / 'public' / 'assets' / 'v3-icons'
BACKUP_DIR = ROOT / 'scripts' / 'v3-icons-tight-backup'


def band_ink_bbox(a, cell):
    """Tight ink bbox of band 1 (the art band) in board pixels, or None."""
    x0c, y0c, x1c, y1c = cell
    xi0, yi0, xi1, yi1 = x0c + TRIM, y0c + TRIM, x1c - TRIM, y1c - TRIM
    m = (a[yi0 : yi1 + 1, xi0 : xi1 + 1] < 248).any(axis=2)
    counts = m.sum(axis=1)
    if counts[ART_ROW0] == 0:
        return None
    r = ART_ROW0
    while r < len(counts) and counts[r] > 0:
        r += 1
    band = m[ART_ROW0:r]
    rows = np.where(band.any(axis=1))[0]
    cols = np.where(band.any(axis=0))[0]
    return (
        xi0 + int(cols[0]),
        yi0 + ART_ROW0 + int(rows[0]),
        xi0 + int(cols[-1]),
        yi0 + ART_ROW0 + int(rows[-1]),
    )


def main():
    im = Image.open(ROOT / ext.ICONS_PATH).convert('RGB')
    cells = ext.detect_cells(im)
    if len(cells) != len(ext.ICON_SLUGS):
        print(f'FLAG cells={len(cells)} != slugs={len(ext.ICON_SLUGS)} — aborting, no overwrite')
        return
    a = ext.arr(im)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    sizes = set()
    for slug, cell in zip(ext.ICON_SLUGS, cells):
        bb = band_ink_bbox(a, cell)
        if bb is None:
            print(f'FLAG {slug}: band not found at row {ART_ROW0} — kept previous file')
            continue
        x0, y0, x1, y1 = bb
        w, h = x1 - x0 + 1, y1 - y0 + 1
        dest = OUT_DIR / f'{slug}.png'
        if dest.exists():
            shutil.copy2(dest, BACKUP_DIR / dest.name)
        ink = ext.clear_white(im.crop((x0, y0, x1 + 1, y1 + 1)))
        cell_im = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        cell_im.paste(ink, ((CELL - w) // 2, (CELL - h) // 2), mask=ink.getchannel('A'))
        cell_im.save(dest)
        sizes.add(cell_im.size)
        off_grid = int(w % 8 or h % 8)
        print(f'{slug:18} ink={w}x{h}@({x0},{y0}) pasted=({(CELL - w) // 2},{(CELL - h) // 2})' + (f' FLAG off-grid ({w}x{h})' if off_grid else '') + (f' FLAG over-cell ({w}x{h})' if max(w, h) > CELL else ''))
    print(f'uniform sizes: {sorted(sizes)}  files: {len(list(OUT_DIR.glob("*.png")))}')
    modes = {Image.open(p).mode for p in OUT_DIR.glob('*.png')}
    print(f'modes: {sorted(modes)} (expect RGBA)')
    # contact sheet for the view-back (same builder as the first export)
    sheet = ext.montage([(s, OUT_DIR / f'{s}.png') for s in ext.ICON_SLUGS], ROOT / 'scripts' / 'v3-recrop-icons-montage.png', 6, thumb=CELL)
    print(f'montage: {sheet}')
    if sizes != {(CELL, CELL)}:
        print('FLAG non-uniform output — inspect above')


if __name__ == '__main__':
    main()
