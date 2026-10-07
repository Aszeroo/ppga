#!/usr/bin/env python3
"""Structural validator for the Thai locale (messages/th.json).

CI gate for Batch D of the UI/UX Thai-repair work. The old th.json was
partially machine-transliterated and carries a small set of recurring
corruption signatures (tone marks stored before the combining vowel they
belong on, doubled marks, marks detached from their base consonant, and
~38% of values left as byte-identical English). Those signatures are
mechanically detectable, so this script checks for them instead of
trusting anyone's eyes on rendered Thai.

Rules (each failing value prints `key: reason: value` and the script
exits 1):

  parity            leaf key sets of en.json and th.json must match 1:1
  identical-en      th value byte-identical to en value, contains no Thai
                    script, and is not an allowlisted item (proper nouns /
                    format-only strings such as "PDF" or "PowerPoint")
  mark-after-space  a Thai combining mark (U+0E31, U+0E34-U+0E3A,
                    U+0E47-U+0E4E) directly after a space or at string
                    start -- the mark has no base consonant
  double-mark       two identical combining marks adjacent (e.g. U+0E31
                    U+0E31)
  tone-then-vowel   a tone mark (U+0E48-U+0E4B) immediately followed by a
                    combining above-vowel (U+0E34-U+0E3A); correct Thai
                    stacks the vowel first (ที้, not ที่)
  ascii-in-word     ASCII letters adjacent to Thai letters with no space
                    between them, unless the run is an allowlisted token
                    (PowerPoint, Microsoft, XP, Level, Roster, PDF, CSV,
                    XLSX, SQL, ID, URL) or an ICU arg ({n}, {count}...)

Stdlib only; run `python3 scripts/validate-thai.py` from the repo root.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EN_PATH = ROOT / "messages" / "en.json"
TH_PATH = ROOT / "messages" / "th.json"

# Combining marks that must sit on a base consonant, per the corruption
# inventory: mai han akat, sara i..phinthu, mai taikhu..yamakkan.
COMBINING = (
    {0x0E31}
    | set(range(0x0E34, 0x0E3B))
    | set(range(0x0E47, 0x0E4F))
)
TONE_MARKS = set(range(0x0E48, 0x0E4C))
ABOVE_VOWELS = set(range(0x0E34, 0x0E3B))

# Case-insensitive tokens allowed to touch Thai letters or stand alone as
# untranslated English (proper nouns, format names, ICU-style args).
# PPGA #51: "PPGA" (the product wordmark, Press Start 2P is ASCII-only) and
# "LV" (the HUD's Level-chip abbreviation from the design gallery) join the
# allowlist — they are format-only marks, never untranslated copy.
ALLOWED_TOKENS = {
    "powerpoint", "microsoft", "xp", "level", "roster",
    "pdf", "csv", "xlsx", "sql", "id", "url",
    "ppga", "lv",
}
ICU_ARG = re.compile(r"\{[^{}]*\}")


def is_thai(ch):
    return 0x0E00 <= ord(ch) < 0x0E7F


def has_thai(value):
    return any(is_thai(c) for c in value)


def leaf_map(obj, prefix=""):
    """Flatten one message file to `dotted.key -> string value`."""
    leaves = {}
    for key, value in obj.items():
        dotted = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            leaves.update(leaf_map(value, dotted))
        else:
            leaves[dotted] = value
    return leaves


def check_identical_en(value, en_value):
    if value != en_value or has_thai(value):
        return None
    stripped = ICU_ARG.sub(" ", value)
    words = re.findall(r"[A-Za-z]+", stripped)
    if all(w.lower() in ALLOWED_TOKENS for w in words):
        return None  # allowlisted proper noun / format-only / arg-only item
    return "identical-en: value is byte-identical English with no Thai script"


def check_marks(value):
    problems = []
    run = 0  # consecutive combining marks; >2 stacked marks is never valid Thai
    for i, ch in enumerate(value):
        o = ord(ch)
        if o in COMBINING:
            run += 1
            if run >= 3:
                problems.append(
                    f"stack-three-plus: U+{o:04X} at index {i} completes a "
                    "stack of 3+ combining marks on one base"
                )
            if i == 0 or value[i - 1] == " ":
                problems.append(
                    f"mark-after-space: U+{o:04X} at index {i} has no base consonant"
                )
            elif ord(value[i - 1]) == o:
                problems.append(f"double-mark: U+{o:04X} doubled at index {i}")
        else:
            run = 0
        if o in TONE_MARKS and i + 1 < len(value) and ord(value[i + 1]) in ABOVE_VOWELS:
            problems.append(
                f"tone-then-vowel: U+{o:04X} at index {i} precedes "
                f"U+{ord(value[i + 1]):04X} (must stack in the other order)"
            )
    return problems


def check_ascii_in_word(value):
    problems = []
    for match in re.finditer(r"[A-Za-z]+", value):
        run = match.group(0)
        if run.lower() in ALLOWED_TOKENS or ICU_ARG.fullmatch(run):
            continue
        start, end = match.span()
        touches_left = start > 0 and is_thai(value[start - 1])
        touches_right = end < len(value) and is_thai(value[end])
        if touches_left or touches_right:
            problems.append(
                f"ascii-in-word: '{run}' at index {start} touches Thai letters "
                "without a space"
            )
    return problems


def main():
    en = json.loads(EN_PATH.read_text(encoding="utf-8"))
    th = json.loads(TH_PATH.read_text(encoding="utf-8"))
    en_leaves = leaf_map(en)
    th_leaves = leaf_map(th)

    failures = []
    for key in sorted(en_leaves.keys() - th_leaves.keys()):
        failures.append((key, "parity-missing-th", "<key absent from th.json>"))
    for key in sorted(th_leaves.keys() - en_leaves.keys()):
        failures.append((key, "parity-extra-th", "<key absent from en.json>"))

    for key in sorted(en_leaves.keys() & th_leaves.keys()):
        value = th_leaves[key]
        if not isinstance(value, str):
            continue
        checks = [check_identical_en(value, en_leaves[key])]
        checks.extend(check_marks(value))
        checks.extend(check_ascii_in_word(value))
        for reason in checks:
            if reason:
                failures.append((key, reason, value))

    for key, reason, value in failures:
        print(f"FAILED {key}: {reason}: {value}")
    print(f"{len(failures)} failure(s) over {len(th_leaves)} leaf values")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
