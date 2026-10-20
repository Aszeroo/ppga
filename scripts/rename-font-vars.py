"""Ticket #50 swap-point rename.

The previous sheet's font variables (`--font-ta16bit` / `--font-mitr`) were
replaced by the V3 pair (`--font-ppg-display` / `--font-ppg-body`,
`app/layout.tsx`). Every inline `fontFamily: 'var(--font-…)'` consumes the
variable by name, so the swap only takes effect site-wide once the consumers
resolve the new names. Renames (pure string swap, zero behaviour):

  --font-ta16bit  ->  --font-ppg-display
  --font-mitr     ->  --font-ppg-body

and the stale font NAMEs in comments (Mitr / TA16BIT) become the new pair.
PDF export is excluded on purpose: `app/api/export/pdf/route.ts` embeds the
vendored `app/fonts/Mitr-*.ttf` directly (`test/unit/pdfSummaryGuard.test.ts`
asserts the files stay) — that is a server-side font, not the CSS variable.
"""

from pathlib import Path

import re

ROOT = Path('.')

FILES = [
    'components/Shell.tsx',
    'components/Nav.tsx',
    'components/MenuWrap.tsx',
    'components/XPHud.tsx',
    'components/Badge.tsx',
    'components/Button.tsx',
    'components/Card.tsx',
    'components/ProgressBar.tsx',
    'components/XPBar.tsx',
    'components/StatusPill.tsx',
    'components/State.tsx',
    'components/StageNode.tsx',
    'components/StageMap.tsx',
    'components/ChallengeTrack.tsx',
    'components/MissionPanel.tsx',
    'components/XpRewardChip.tsx',
    'app/[locale]/page.tsx',
    'app/[locale]/course/page.tsx',
    'app/[locale]/course/[moduleKey]/page.tsx',
    'app/[locale]/course/[moduleKey]/[lessonKey]/page.tsx',
    'app/[locale]/course/[moduleKey]/mission/page.tsx',
    'app/[locale]/course/[moduleKey]/practical/page.tsx',
    'app/[locale]/login/page.tsx',
    'app/[locale]/logout/page.tsx',
    'app/[locale]/profile/page.tsx',
    'app/[locale]/badges/page.tsx',
    'app/[locale]/leaderboard/page.tsx',
    'app/[locale]/review/page.tsx',
    'app/[locale]/content/page.tsx',
    'app/[locale]/health/page.tsx',
    'app/[locale]/pre-test/page.tsx',
    'app/[locale]/change-password/page.tsx',
    'app/[locale]/gallery/page.tsx',
]

changed = []
for rel in FILES:
    p = ROOT / rel
    if not p.exists():
        continue
    src = p.read_text(encoding='utf-8')
    out = src
    out = out.replace('--font-ta16bit', '--font-ppg-display')
    out = out.replace('--font-mitr', '--font-ppg-body')
    out = re.sub(r'\bMitr\b', 'Noto Sans Thai', out)
    out = re.sub(r'\bTA16BIT\b', 'Press Start 2P', out)
    out = re.sub(r'\bMiter\b', 'Noto Sans Thai', out)
    if out != src:
        p.write_text(out, encoding='utf-8')
        changed.append(rel)

print('renamed:', len(changed))
for c in changed:
    print(' ', c)