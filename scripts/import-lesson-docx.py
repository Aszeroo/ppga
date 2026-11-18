#!/usr/bin/env python3
"""Generate the lesson-content migration from the owner's Word documents.

The owner's chapter documents are the source of truth for the lesson bodies.
This script reads them with python-docx, segments them into the existing
nine lesson keys, and emits one SQL migration that replaces the lesson steps
without dropping any source paragraph.

It also preserves the shipped interactive content: the `objective`, `check`
and `summary` step rows (plus the check options and answer key) are read from
a production snapshot and re-inserted unchanged. Only the prose between the
objective and the check is replaced.

Paragraph ranges are DOCX paragraph indices, not copy. They are the fixed
segmentation of the three owner documents (chapter 1, 2, 3) and carry no Thai
literal, so the source text is always extracted programmatically:

  chapter 1: lesson 1 = pre-exercise + meaning/importance/goals
             lesson 2 = presentation types .. presentation principles
             lesson 3 = design principles .. post-exercise
  chapter 2: lesson 1 = pre-exercise + meaning/writing principles/components
             lesson 2 = advantages .. preparation data
             lesson 3 = content-details example .. post-exercise
  chapter 3: lesson 1 = pre-exercise + features .. views
             lesson 2 = creating .. closing
             lesson 3 = slide master/template .. post-exercise

Every non-empty paragraph outside the mapped ranges must be the duplicate
chapter-title line (paragraph 0) or an explicitly skipped structural label;
the script fails loudly otherwise, so no paragraph can vanish silently.

Usage:
  python3 scripts/import-lesson-docx.py \\
    --docx-dir /tmp/ppga-content \\
    --steps-json /tmp/prod-steps.json \\
    --out supabase/migrations/20261118000100_lesson_content_ch01_03.sql
"""
from __future__ import annotations

import argparse
import json
import re
import site
import sys
from pathlib import Path

sys.path.insert(0, site.getusersitepackages())
import docx  # noqa: E402  (python-docx, resolved after the user-site path)

MAX_STEP_CHARS = 4000
MAX_STEPS_PER_LESSON = 20
# Spaces (not tabs): the 12-slide sample uses "1\t<text>" table rows, which are
# body rows, never headings.
NUMBERED_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)[.)]? +")
HEADING_MAX_CHARS = 60

# Non-bold top-level section headings the heuristic cannot infer from weight
# alone (the numbered practice list also uses "1." .. "8."). Indices, not copy.
MAJOR_HEADINGS = {
    1: {152, 166},
    2: set(),
    3: {72, 75, 86, 95, 103, 106, 121, 189, 195, 200},
}

# (start, end) inclusive DOCX paragraph indices per chapter/lesson.
CHAPTER_RANGES = {
    1: [
        [(1, 69), (71, 85)],
        [(86, 113)],
        [(114, 181), (184, 253)],
    ],
    2: [
        [(1, 72), (76, 96)],
        [(97, 133)],
        [(134, 144), (146, 218)],
    ],
    3: [
        [(1, 72), (75, 120)],
        [(121, 198)],
        [(200, 281), (284, 353)],
    ],
}

# The two exercise blocks per chapter. Inside them a line such as "1. ..." is a
# question, not a heading, so the numbered-heading heuristic must stay off.
EXERCISE_RANGES = {
    1: [(1, 69), (184, 253)],
    2: [(1, 72), (146, 218)],
    3: [(1, 71), (284, 353)],
}

# Structural lines that are intentionally not lesson content: the duplicate
# chapter title (paragraph 0) and the lesson-body label.
ALLOWED_OUTSIDE = {1: {0, 70}, 2: {0}, 3: {0, 74}}


def paragraph_bold(paragraph) -> bool:
    runs = [run for run in paragraph.runs if run.text.strip()]
    return bool(runs) and all(bool(run.bold) for run in runs)


def classify(paragraph, index: int, in_exercise: bool, major: set[int]) -> dict:
    text = paragraph.text.strip()
    style = paragraph.style.name if paragraph.style is not None else ""
    if not text:
        return {"kind": "empty", "text": ""}
    if style == "List Paragraph" or text.startswith("*"):
        bullet = text.lstrip()
        if bullet.startswith("*"):
            bullet = bullet[1:].lstrip()
        return {"kind": "bullet", "text": bullet}
    match = NUMBERED_RE.match(text)
    numbered = bool(match)
    if index in major:
        return {"kind": "heading2", "text": text}
    if paragraph_bold(paragraph):
        # A bold x.y sub-heading keeps the lower level; everything else bold
        # is a major heading.
        level = 3 if (numbered and "." in match.group(1)) else 2
        return {"kind": f"heading{level}", "text": text}
    if not in_exercise and numbered and len(text) <= HEADING_MAX_CHARS:
        return {"kind": "heading3", "text": text}
    return {"kind": "paragraph", "text": text}


def render_blocks(blocks: list[dict]) -> str:
    parts: list[str] = []
    i = 0
    while i < len(blocks):
        block = blocks[i]
        if block["kind"] == "bullet":
            j = i
            while j < len(blocks) and blocks[j]["kind"] == "bullet":
                j += 1
            parts.append("\n".join(f"- {entry['text']}" for entry in blocks[i:j]))
            i = j
            continue
        prefix = "## " if block["kind"] == "heading2" else "### " if block["kind"] == "heading3" else ""
        parts.append(prefix + block["text"])
        i += 1
    return "\n\n".join(parts)


def pack_blocks(blocks: list[dict], limit: int) -> list[list[dict]]:
    chunks: list[list[dict]] = []
    current: list[dict] = []
    for block in blocks:
        if len(render_blocks([block])) > limit:
            raise SystemExit(
                f"a single source paragraph is longer than {limit} chars: "
                f"{block['text'][:60]!r}"
            )
        if current and len(render_blocks(current + [block])) > limit:
            chunks.append(current)
            current = [block]
        else:
            current.append(block)
    if current:
        chunks.append(current)
    return chunks


def chunk_group(blocks: list[dict], limit: int) -> list[list[dict]]:
    if len(render_blocks(blocks)) <= limit:
        return [blocks]

    # Prefer a split on sub-headings (###) so a long section keeps its shape.
    subgroups: list[list[dict]] = []
    for block in blocks:
        if block["kind"] == "heading3" or not subgroups:
            subgroups.append([block])
        else:
            subgroups[-1].append(block)

    chunks: list[list[dict]] = []
    for subgroup in subgroups:
        if len(render_blocks(subgroup)) > limit:
            chunks.extend(pack_blocks(subgroup, limit))
        elif chunks and len(render_blocks(chunks[-1] + subgroup)) <= limit:
            chunks[-1] = chunks[-1] + subgroup
        else:
            chunks.append(list(subgroup))
    return chunks


def group_blocks(blocks: list[dict]) -> list[list[dict]]:
    groups: list[list[dict]] = []
    for block in blocks:
        if block["kind"] == "heading2" or not groups:
            groups.append([block])
        else:
            groups[-1].append(block)
    return groups


def collect_blocks(
    document,
    ranges: list[tuple[int, int]],
    exercise_ranges: list[tuple[int, int]],
    major: set[int],
) -> tuple[list[dict], list[int], int]:
    wanted: set[int] = set()
    for start, end in ranges:
        wanted.update(range(start, end + 1))
    exercise: set[int] = set()
    for start, end in exercise_ranges:
        exercise.update(range(start, end + 1))
    blocks: list[dict] = []
    covered: list[int] = []
    chars = 0
    for index, paragraph in enumerate(document.paragraphs):
        if index not in wanted:
            continue
        block = classify(paragraph, index, in_exercise=index in exercise, major=major)
        if block["kind"] == "empty":
            continue
        blocks.append(block)
        covered.append(index)
        chars += len(block["text"])
    return blocks, covered, chars


def sql_text(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def load_snapshot(path: Path) -> dict[str, dict[int, dict]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    by_lesson: dict[str, dict[int, dict]] = {}
    for row in rows:
        by_lesson.setdefault(row["lesson_key"], {})[int(row["order_index"])] = row
    return by_lesson


def preserved_steps(rows: dict[int, dict], lesson_key: str) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for row in rows.values():
        if row["kind"] in ("objective", "check", "summary"):
            if row["kind"] in found:
                raise SystemExit(f"duplicate {row['kind']} step in {lesson_key}")
            found[row["kind"]] = row
    missing = {"objective", "check", "summary"} - set(found)
    if missing:
        raise SystemExit(f"{lesson_key} snapshot is missing steps: {sorted(missing)}")
    if not found["check"].get("options"):
        raise SystemExit(f"{lesson_key} check step has no options in the snapshot")
    return found


def build_lesson(lesson_key: str, blocks: list[dict], rows: dict[int, dict]) -> tuple[list[str], dict]:
    kept = preserved_steps(rows, lesson_key)
    content_blocks = list(blocks)
    groups = group_blocks(content_blocks)
    chunks: list[list[dict]] = []
    for group in groups:
        chunks.extend(chunk_group(group, MAX_STEP_CHARS))
    if not chunks:
        raise SystemExit(f"{lesson_key} produced no content steps")

    lines: list[str] = []
    steps: list[tuple] = []
    order = 2
    for chunk in chunks:
        body = render_blocks(chunk)
        if len(body) > MAX_STEP_CHARS:
            raise SystemExit(f"{lesson_key} step {order} is {len(body)} chars (> {MAX_STEP_CHARS})")
        steps.append((lesson_key, order, "explanation", body, "", None, None, None, None, None))
        order += 1
    check_order = order
    steps.append((
        lesson_key,
        check_order,
        "check",
        "",
        "",
        kept["check"]["check_prompt_th"],
        kept["check"]["check_prompt_en"],
        kept["check"]["check_answer_key"],
        kept["check"]["check_explanation_th"],
        kept["check"]["check_explanation_en"],
    ))
    summary_order = check_order + 1
    steps.append((
        lesson_key,
        summary_order,
        "summary",
        kept["summary"]["body_th"],
        kept["summary"]["body_en"],
        None,
        None,
        None,
        None,
        None,
    ))
    # Objective keeps order 1.
    steps.insert(0, (
        lesson_key,
        1,
        "objective",
        kept["objective"]["body_th"],
        kept["objective"]["body_en"],
        None,
        None,
        None,
        None,
        None,
    ))
    total_steps = len(steps)
    if total_steps > MAX_STEPS_PER_LESSON:
        raise SystemExit(f"{lesson_key} has {total_steps} steps (> {MAX_STEPS_PER_LESSON})")

    values = ",\n  ".join(
        "(" + ", ".join(
            sql_text(value) if isinstance(value, str) else str(value) if value is not None else "null"
            for value in step
        ) + ")"
        for step in steps
    )
    lines.append(
        "insert into public.ppg_lesson_steps\n"
        "  (lesson_key, order_index, kind, body_th, body_en, check_prompt_th, check_prompt_en, "
        "check_answer_key, check_explanation_th, check_explanation_en)\n"
        "values\n  " + values + ";"
    )
    option_values = ",\n  ".join(
        "(" + ", ".join(
            sql_text(value) if isinstance(value, str) else str(value)
            for value in (lesson_key, check_order, option["option_key"], option["option_th"], option["option_en"])
        ) + ")"
        for option in sorted(kept["check"]["options"], key=lambda item: item["option_key"])
    )
    lines.append(
        "insert into public.ppg_lesson_step_options\n"
        "  (lesson_key, step_order_index, option_key, option_th, option_en)\n"
        "values\n  " + option_values + ";"
    )
    metadata = {
        "content_steps": len(chunks),
        "check_order": check_order,
        "summary_order": summary_order,
        "total_steps": total_steps,
    }
    return lines, metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docx-dir", type=Path, required=True)
    parser.add_argument("--steps-json", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    documents = sorted(args.docx_dir.glob("*.docx"))
    if len(documents) != 3:
        raise SystemExit(f"expected 3 chapter documents in {args.docx_dir}, found {len(documents)}")
    snapshot = load_snapshot(args.steps_json)

    body: list[str] = [
        "-- ============================================================================",
        "-- Lesson content chapters 1-3, imported verbatim from the owner's Word docs.",
        "--",
        "-- Generated by scripts/import-lesson-docx.py. Every non-empty paragraph of",
        "-- each chapter body, including both exercise blocks, is assigned to one of",
        "-- the existing three lessons; no source text is truncated. The shipped",
        "-- objective / mini-check / summary rows (and check options + answer keys)",
        "-- are preserved exactly from production. Body markup is ## major heading,",
        "-- ### sub-heading, - bullet, blank line between blocks.",
        "--",
        "-- Non-check steps may carry an empty body_en: the player falls back to the",
        "-- Thai body until translations land (lib/lessonSteps.ts).",
        "-- ============================================================================",
        "",
        "begin;",
        "",
        "alter table public.ppg_lesson_steps",
        "  drop constraint if exists ppg_lesson_step_check_shape_check;",
        "",
        "alter table public.ppg_lesson_steps",
        "  add constraint ppg_lesson_step_check_shape_check check (",
        "    (",
        "      kind = 'check'",
        "      and check_prompt_th is not null",
        "      and check_prompt_en is not null",
        "      and check_answer_key is not null",
        "      and check_explanation_th is not null",
        "      and check_explanation_en is not null",
        "      and btrim(body_th) = ''",
        "      and btrim(body_en) = ''",
        "    )",
        "    or (",
        "      kind <> 'check'",
        "      and check_prompt_th is null",
        "      and check_prompt_en is null",
        "      and check_answer_key is null",
        "      and check_explanation_th is null",
        "      and check_explanation_en is null",
        "      and btrim(body_th) <> ''",
        "    )",
        "  );",
        "",
        "commit;",
        "",
    ]

    report: list[str] = []
    for chapter_number, document_path in enumerate(documents, start=1):
        document = docx.Document(document_path)
        ranges = CHAPTER_RANGES[chapter_number]
        mapped = set()
        for lesson_ranges in ranges:
            for start, end in lesson_ranges:
                mapped.update(range(start, end + 1))
        outside = [
            (index, paragraph.text.strip())
            for index, paragraph in enumerate(document.paragraphs)
            if paragraph.text.strip() and index not in mapped
        ]
        outside_indices = {index for index, _ in outside}
        if outside_indices != ALLOWED_OUTSIDE[chapter_number]:
            raise SystemExit(
                f"chapter {chapter_number}: unmapped non-empty paragraphs: "
                f"{[(index, text[:40]) for index, text in outside]}"
            )

        body.append(f"-- ----------------------------------------------------------------------------")
        body.append(f"-- Chapter {chapter_number}: replace the nine lesson steps in one transaction.")
        body.append(f"-- ----------------------------------------------------------------------------")
        body.append("begin;")
        lesson_keys = [f"chapter-{chapter_number:02d}-lesson-{lesson:02d}" for lesson in (1, 2, 3)]
        body.append(
            "delete from public.ppg_lesson_steps where lesson_key in ("
            + ", ".join(sql_text(key) for key in lesson_keys) + ");"
        )
        body.append("")

        chapter_source_chars = 0
        chapter_render_chars = 0
        for lesson_key, lesson_ranges in zip(lesson_keys, ranges):
            blocks, covered, source_chars = collect_blocks(
                document,
                lesson_ranges,
                EXERCISE_RANGES[chapter_number],
                MAJOR_HEADINGS[chapter_number],
            )
            rows = snapshot.get(lesson_key)
            if not rows:
                raise SystemExit(f"no production snapshot rows for {lesson_key}")
            lines, metadata = build_lesson(lesson_key, blocks, rows)
            rendered_chars = sum(len(block["text"]) for block in blocks)
            body.extend(lines)
            body.append("")
            chapter_source_chars += source_chars
            chapter_render_chars += rendered_chars
            report.append(
                f"{lesson_key}: source={source_chars} chars rendered={rendered_chars} "
                f"content_steps={metadata['content_steps']} check_order={metadata['check_order']} "
                f"summary_order={metadata['summary_order']} total_steps={metadata['total_steps']} "
                f"covered_paragraphs={len(covered)}"
            )
        body.append("commit;")
        body.append("")
        report.append(f"chapter {chapter_number}: source total={chapter_source_chars} chars")
        if chapter_source_chars != chapter_render_chars:
            raise SystemExit(
                f"chapter {chapter_number}: rendered text {chapter_render_chars} != source {chapter_source_chars}"
            )

    args.out.write_text("\n".join(body), encoding="utf-8")
    print(f"wrote {args.out}")
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
