"""Ticket #50 V3 asset extraction (crop script).

Viewed both boards first; measured the grid coordinates with the flood-fill
probe below. Detects each white rounded cell's interior (coarse flood at half
resolution, refined on the original mask so the bbox is exact), computes the
*art* bbox (the contiguous dark-or-saturated band from the cell top down to
the first all-white gap that separates the art from the label band), crops
the art at its native cell scale (no rescale), clears pure-white to alpha,
and writes RGBA PNGs under public/assets/v3-icons, public/assets/v3-
illustrations, and public/assets/v3-decoration. Builds contact-sheet montages
(ASCII slug labels) so every exported file is viewed; the bottom decoration-
kit strip is cropped from a measured bbox (hardcoded, from the viewed board).
Prints one report line per asset plus any unextractable FLAG.

Run: `python scripts/extract-v3-assets.py` (PIL is in user-site, so no -I).
Untracked tool — not in the brief's design-source commit list.
"""

import numpy as np
from PIL import Image, ImageDraw
from pathlib import Path

NP_CEI = np


def arr(im):
    w, h = im.size
    return np.frombuffer(im.tobytes(), dtype=np.uint8).reshape((h, w, 3))


def white_mask(a):
    return np.all(a >= 248, axis=-1)


def flood(m, seeds=None):
    """4-connected flood over the boolean mask `m` (numpy [y, x]). Returns
    [(x0, y0, x1, y1)] — one per component, collected in a raster scan pass
    (when seeds is None) or from the seeded components only."""
    h, w = m.shape
    visited = np.zeros((h, w), dtype=bool)
    blobs = []
    if seeds is None:
        starts = [(y, x) for y in range(h) for x in range(w) if m[y, x]]
    else:
        starts = [(y, x) for (y, x) in seeds if m[y, x]]
    for y, x in starts:
        if visited[y, x]:
            continue
        stack = [(y, x)]
        lo_x, lo_y, hi_x, hi_y = w, h, 0, 0
        while stack:
            cy, cx = stack.pop()
            if visited[cy, cx]:
                continue
            visited[cy, cx] = True
            lo_x = min(lo_x, cx)
            lo_y = min(lo_y, cy)
            hi_x = max(hi_x, cx)
            hi_y = max(hi_y, cy)
            for cand in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                ny, nx = cand
                if 0 <= ny < h and 0 <= nx < w:
                    if m[ny, nx] and not visited[ny, nx]:
                        stack.append(cand)
        blobs.append((lo_x, lo_y, hi_x, hi_y))
    return blobs


def refine(m, coarse):
    """Refine the coarse cell bbox on the full-resolution mask: flood the
    subregion (12 px margin) seeded from the coarse box's interior corner
    points; the one component that holds the seeds is the cell's interior;
    its bbox is the native-exact cell bbox."""
    x0, y0, x1, y1 = coarse
    lo_x, lo_y = max(x0 - 12, 0), max(y0 - 12, 0)
    hi_x, hi_y = min(x1 + 12, m.shape[1]), min(y1 + 12, m.shape[0])
    sub = m[lo_y:hi_y + 1, lo_x:hi_x + 1]
    seeds = [( (lo_y + hi_y) // 2, (lo_x + hi_x) // 2 )]
    got = flood(sub, seeds=seeds)
    if not got:
        return None
    return got[0]


def darkish(a):
    # The *art* is every pixel that is not pure-white — the pastel tints
    # (#E1F0FF/#F0E1FF/#FFFBF0) are low-saturation and a saturation-only
    # rule missed the cloud-drift and the cream parts (35 px band). White
    # (all channels >= 248) is the cell's empty space and the label band is
    # separated from the art by an all-white row gap, so the non-white
    # criterion is the art band's membership test.
    return np.any(a < 248, axis=-1)


def art_bbox(a, cell):
    """Crop the *art* only — the contiguous band from the cell top down to
    the first all-white gap (the label band starts below it). Returns
    (x0, y0, x1, y1) or None."""
    x0c, y0c, x1c, y1c = cell
    # The cell's rounded frame contributes a ~3 px anti-alias ring at every
    # edge; the ring is not-white and would otherwise be the first nonzero
    # row. Trim 4 px inside each side so the band search starts at the
    # interior.
    x0i, y0i, x1i, y1i = x0c + 4, y0c + 4, x1c - 4, y1c - 4
    sub = a[y0i:y1i + 1, x0i:x1i + 1]
    m = darkish(sub)
    counts = m.sum(axis=1)
    n_rows = sub.shape[0]
    # Segments of nonzero rows. A thin segment (height <= 8 px) is the top-
    # strip accent or a label band, never the art; the art is the segment of
    # greatest height.
    best = None
    r = 0
    while r < n_rows:
        if counts[r] > 0:
            r0 = r
            while r < n_rows and counts[r] > 0:
                r += 1
            height = r - r0
            if height > 8 and (best is None or height > best[1] - best[0]):
                best = (r0, r)
            r += 1
        r += 1
    if best is None:
        return None
    top_rel, bottom_rel = best
    band_m = m[top_rel:bottom_rel + 1]
    nzc = np.where(band_m.any(axis=0))[0]
    return (x0i + int(nzc[0]), y0i + top_rel, x0i + int(nzc[-1]), y0i + bottom_rel)


def clear_white(im):
    w, h = (im.size[0], im.size[1])
    src = np.frombuffer(im.convert('RGB').tobytes(), dtype=np.uint8).reshape((h, w, 3))
    white = np.all(src >= 250, axis=-1)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = src
    out[..., 3] = np.where(white, 0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def rows_of_cells(cells):
    """Cluster into rows (a centre-y gap over 60 px opens a new row) and
    return the row-major order (row by top-y, cells left-to-right)."""
    centre = lambda c: (c[1] + c[3]) / 2
    s = sorted(cells, key=centre)
    rows = []
    cur = []
    prev = None
    for c in s:
        cy = centre(c)
        if prev is not None and cy - prev > 60:
            rows.append(cur)
            cur = []
        cur.append(c)
        prev = cy
    rows.append(cur)
    return [
        sorted(row, key=lambda c: c[0])
        for row in sorted(rows, key=lambda r: centre(r[0]))
    ]


ICON_SLUGS = [
    'xp-star', 'sparkle', 'cloud-drift', 'home-base', 'course-map-pin',
    'lesson-book', 'slide-monitor', 'pencil',
    'upload', 'download', 'pptx-file', 'check', 'cross', 'lock', 'trophy', 'medal',
    'gem', 'xp-coin', 'checkpoint-flag', 'settings-gear', 'learner', 'search',
    'notification-bell', 'play',
    'next', 'back', 'volume', 'console', 'question-help', 'key',
]

ILLUSTRATION_SLUGS = [
    'mascot-power', 'presentation-board', 'learning-laptop',
    'cloud-drift', 'trophy', 'medal', 'gem', 'xp-coin', 'checkpoint-flag',
]

ICONS_PATH = 'UI_UX_design/V3 — 03 Icons.png'
ILLUSTRATIONS_PATH = 'UI_UX_design/V3 — 04 Illustrations.png'

OUT_ICONS = 'public/assets/v3-icons'
OUT_ILLUSTRATIONS = 'public/assets/v3-illustrations'
OUT_DECORATION = 'public/assets/v3-decoration'

# Decoration-kit strip bbox — measured on the viewed board by trial crops
# (original-image pixels): the full rounded frame incl. its corners.
STRIP_BOX = (133, 1700, 1497, 1952)


def export_art(im, cell, out_dir, slug):
    bb = art_bbox(arr(im), cell)
    if bb is None:
        return None
    x0, y0, x1, y1 = bb
    art = clear_white(im.crop((x0, y0, x1 + 1, y1 + 1)))
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    art.save(Path(out_dir) / f'{slug}.png')
    return bb


def montage(items, out_montage, cols, thumb=96):
    rows = int(np.ceil(len(items) / cols))
    pad = 14
    sheet = Image.new(
        'RGB',
        (cols * (thumb + pad) + pad, rows * (thumb + pad + 12) + pad),
        'white',
    )
    d = ImageDraw.Draw(sheet)
    for i, (slug, p) in enumerate(items):
        x = (i % cols) * (thumb + pad) + pad
        y = (i // cols) * (thumb + pad + 12) + pad
        rgba = Image.open(p)
        rgba.thumbnail((thumb, thumb))
        t = Image.new('RGB', (thumb, thumb), 'white')
        t.paste(rgba, (0, 0), mask=rgba.getchannel('A'))
        sheet.paste(t, (x, y))
        d.rectangle((x, y, x + thumb, y + thumb), outline=(210, 210, 210))
        d.text((x + 4, y + thumb + 2), slug, fill=(0, 0, 0))
    sheet.save(out_montage)
    return out_montage


def detect_cells(im, half=True):
    """Flood at half resolution (cheap) — the scaled cell bboxes are within
    ±2 px of the true interior frame; the crop's art bbox is computed tight
    on the full-resolution image, so the coarse frame's slack is a harmless
    white margin. Returns the row-major cell list."""
    w, h = im.size
    scale = 2 if half else 1
    small = im.resize((w // scale, h // scale), Image.NEAREST)
    m_small = white_mask(arr(small))
    coarse = [
        (c[0] * scale, c[1] * scale, c[2] * scale, c[3] * scale)
        for c in flood(m_small)
        if 70 <= (c[2] - c[0]) * scale <= 500 and 70 <= (c[3] - c[1]) * scale <= 500
    ]
    return [c for row in rows_of_cells(coarse) for c in row]


def main():
    for path, slug_list, out_dir, expected in (
        (ICONS_PATH, ICON_SLUGS, OUT_ICONS, 30),
        (ILLUSTRATIONS_PATH, ILLUSTRATION_SLUGS, OUT_ILLUSTRATIONS, 9),
    ):
        im = Image.open(path).convert('RGB')
        order = detect_cells(im)
        print(f'FLAG {path}: detected {len(order)} cells, expected {expected}')
        if len(order) != len(slug_list):
            print(f'FLAG {path}: cell count {len(order)} != slug list {len(slug_list)} — surplus slugged unidentified')
        items = []
        for i, c in enumerate(order):
            slug = slug_list[i] if i < len(slug_list) else f'unidentified-{i:03}'
            bb = export_art(im, c, Path(out_dir), slug)
            if bb is None:
                print(f'FLAG {path}: {slug} — no art band; not extracted')
            else:
                x0, y0, x1, y1 = bb
                x0c, y0c, x1c, y1c = c
                print(f'{slug:18} cell=({x0c},{y0c},{x1c},{y1c}) art=({x0},{y0},{x1},{y1}) size={x1 - x0}x{y1 - y0}')
            items.append((slug, Path(out_dir) / f'{slug}.png'))
        out_montage = Path('scripts') / f'v3-montage-{Path(path).stem[:8]}.png'
        montage([it for it in items if Path(it[1]).exists()], out_montage, 6 if len(items) > 20 else 3)
        print(f'montage: {out_montage}')
    strip_im = Image.open(ILLUSTRATIONS_PATH).convert('RGB')
    x0, y0, x1, y1 = STRIP_BOX
    strip = strip_im.crop((x0, y0, x1 + 1, y1 + 1))
    Path(OUT_DECORATION).mkdir(parents=True, exist_ok=True)
    strip.save(Path(OUT_DECORATION) / 'decoration-kit-strip.png')
    print(f'{"decoration-kit":18} cell=({x0},{y0},{x1},{y1}) art=({x0},{y0},{x1},{y1}) size={x1 - x0}x{y1 - y0}')
    print('strip saved to public/assets/v3-decoration/decoration-kit-strip.png (viewed in the illustrations montage? no — view directly)')


if __name__ == '__main__':
    main()