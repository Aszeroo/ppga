"""Ticket #50 gallery token-sheet copy.

Thai strings are copied VERBATIM from the owner's gallery HTML (the DESIGN
TOKENS screen) — read as bytes, located by ASCII anchors, written back as
bytes. The English values are drafted copy (owner reviews later). No Thai is
typed in this file: every non-ASCII source value comes from index.html.

Keys land under `gallery.tokens.*` in `messages/en.json` + `messages/th.json`.
Run `python scripts/validate-thai.py` after this patch (the gate).
"""

import json
import re
from pathlib import Path

HTML = Path('UI_UX_design/index.html')

raw = HTML.read_bytes().decode('utf-8')
start = raw.index('id="s-tokens"')
end = raw.index('</section>', start)
sec = raw[start:end]

sub = re.search(r'class="sub mb">(.*?)</p>', sec).group(1)
h2s = re.findall(r'class="h2">(.*?)</h2>', sec)
assert len(h2s) == 3, f'expected 3 h2 headings, got {len(h2s)}'
colors, buttons, chips = h2s
display_note = re.search(r'style="margin-bottom:14px">(.*?)</p>', sec).group(1)
body_sample = re.search(r'style="font-size:16px">(.*?)</p>', sec).group(1)
strip_note = re.search(r'style="margin-top:8px">(.*?)</p>', sec).group(1)

th = {
    'h1': 'DESIGN TOKENS',
    'sub': sub,
    'colors': colors,
    'type': '🔤 Typography',
    'displayNote': display_note,
    'bodySample': body_sample,
    'buttons': buttons,
    'chips': chips,
    'scale': 'Scale - spacing / radius / borders / shadows',
    'stripNote': strip_note,
}

en = {
    'h1': 'DESIGN TOKENS',
    'sub': 'Bright gamified: colours / fonts / buttons / chips / progress bar - matched to the Figma V3 sheet',
    'colors': '🎨 Colours',
    'type': '🔤 Typography',
    'displayNote': 'Press Start 2P - Display (ASCII only - logo / MISSION CLEAR!)',
    'bodySample': 'Body - 16 Regular - Hello! Welcome to PPGA',
    'buttons': '🔘 Buttons (all types x states)',
    'chips': '🏷️ Chips | Progress | Pixel Strip',
    'scale': 'Scale - spacing / radius / borders / shadows',
    'stripNote': 'Pixel Strip - pink/blue/purple/mint dashed line, reused on every header / card / footer',
}

for path, tokens in (('messages/th.json', th), ('messages/en.json', en)):
    p = Path(path)
    data = json.loads(p.read_bytes().decode('utf-8'))
    data['gallery']['tokens'] = tokens
    p.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print('patched', path)

print('extracted thai bytes ok')