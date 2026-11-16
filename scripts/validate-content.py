#!/usr/bin/env python3
"""Content-integrity gate for the seeded (database) curriculum copy.

CI runs this on every PR from the `Typecheck` job, where there is no
Postgres. It therefore defaults to REPLAYING the migrations deterministically
into an in-memory table map and validating the EFFECTIVE state — the same
state `supabase db reset` produces locally. A plain file scan would be wrong:
the original seeds (20260926000600..001200) carry corrupted Thai that later
repair migrations UPDATE (notably 20261019000200_repair_thai_copy.sql), so
only the effective state converges.

The Thai rules are NOT duplicated here — `scripts/validate-thai.py` owns
them, and this script imports `check_marks` / `check_ascii_in_word` from it.
The placeholder rule follows test/seam/knowledge-content.test.ts: the bare
word "placeholder" is legitimate PowerPoint vocabulary in authored copy, so
only the seed-marker SHAPES are rejected (`placeholder-NN:` /
`placeholder question` / `option-a (placeholder…`).

The CAI assessment blueprint (#72/#77) rides the same two modes so replay and
live scan agree on the same seed set. Enforcement is deliberately STAGED,
because content tickets #78-#84 land after this gate:

  * Chapter bank checks run for every chapter that HAS bank rows (currently
    `chapter-01`): pre and post banks both exist, equal item counts, the same
    `objective_key` set, exactly one correct option per item, no duplicate
    option keys, and valid phase/form values.
  * Knowledge Mission checks run when a chapter has mission rows: one mission,
    5-7 questions, three options each, exactly one correct. A chapter with no
    mission rows is reported as `pending content #78+`, not a failure.
  * Mini-check coverage runs for every chapter lesson that has steps: at least
    one check step with a bilingual explanation and an answer key naming one
    of 2-4 options. A lesson with no steps is pending, not a failure.
  * The global Research Pre-Test and Final Test checks run only when a CAI
    instrument version exists: exactly 50 items, every chapter represented,
    the Final Test interleaved rather than grouped by chapter, and the same
    objective coverage in both. Absent instruments are pending #83/#84. The
    legacy `2026.09.1` one-item sample is out of scope; a version is CAI when
    its version differs from that sample, its item count differs, or an item
    carries a `chapter_key`.
  * A static scan rejects learner-readable RPC projections that expose
    `is_correct`, `answer_key` or `check_answer_key` (the discipline
    `test/unit/chapterTestGuard.test.ts` pins for the chapter bank).

`--strict` turns every pending item into a failure. CI runs the normal mode
until the remaining content tickets land; enabling `--strict` then tightens
the same job without further code changes.

Usage:
  python3 scripts/validate-content.py                 # auto: live DB if up, else replay
  python3 scripts/validate-content.py --mode replay   # deterministic, no DB needed
  python3 scripts/validate-content.py --mode live     # scan the local Supabase DB
  python3 scripts/validate-content.py --migrations DIR # replay an alternate directory
  python3 scripts/validate-content.py --strict        # pending content fails the run

Findings name the exact chapter / phase / form / item / objective / column /
value (and table / primary key where the Thai-copy rules apply). Exit 1 when
there is at least one finding (or an unrecoverable replay error).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MIGRATIONS = ROOT / "supabase" / "migrations"
THAI_VALIDATOR = Path(__file__).resolve().parent / "validate-thai.py"

# table -> (primary-key columns, seeded Thai-bearing columns to scan).
# User-generated runtime columns (responses.*, submissions.review_notes_th,
# rubric_reviews.feedback_th) are deliberately excluded: they are not seeds.
CONTENT_TABLES = {
    "ppg_skill_domains": (["domain"], ["label_th"]),
    "ppg_courses": (["course_key"], ["title_th"]),
    "ppg_course_content": (["lesson_key"], ["title_th"]),
    "ppg_modules": (["module_key"], ["title_th", "summary_th"]),
    "ppg_lessons": (
        ["lesson_key"],
        ["title_th", "what_learn_th", "why_th", "body_th", "what_next_th"],
    ),
    "ppg_practical_missions": (
        ["module_key"],
        ["scenario_th", "requirements_th", "expected_out_th"],
    ),
    "ppg_rubric_criteria": (["criterion_key"], ["label_th"]),
    "ppg_rub_descriptors": (["criterion_key", "score_band"], ["descriptor_th"]),
    "ppg_badge_types": (["badge_key"], ["label_th", "award_rule_th"]),
    "ppg_knowledge_missions": (["module_key"], ["instructions_th"]),
    "ppg_knowledge_mission_questions": (
        ["module_key", "order_index", "option_key"],
        ["prompt_th", "option_th", "explanation_th", "review_th"],
    ),
    "ppg_self_check_questions": (
        ["lesson_key", "order_index", "option_key"],
        ["prompt_th", "option_th"],
    ),
    "ppg_chapter_test_questions": (
        ["chapter_key", "phase", "form", "order_index", "option_key"],
        ["prompt_th", "option_th"],
    ),
    "ppg_lesson_steps": (
        ["lesson_key", "order_index"],
        ["body_th", "check_prompt_th", "check_explanation_th"],
    ),
    "ppg_lesson_step_options": (
        ["lesson_key", "step_order_index", "option_key"],
        ["option_th"],
    ),
}

# Instrument tables: the Thai copy rides inside the `items` jsonb.
INSTRUMENT_TABLES = {
    "ppg_pretest_instruments": (["version"], "items"),
    "ppg_posttest_instruments": (["version"], "items"),
    "ppg_survey_instruments": (["version"], "items"),
}

# The seed-marker shapes (case-insensitive), matching the seam's POSIX
# classes: placeholder-02 / placeholder question / option-a (placeholder…
MARKER_RE = re.compile(
    r"placeholder\s*[-_]?\s*(?:question|\d+)|option-[abc]\s*\(\s*placeholder",
    re.IGNORECASE,
)

# CAI assessment blueprint (#72/#77).
CHAPTER_KEY_RE = re.compile(r"^chapter-\d{2}$")
# The #61 legacy sample instrument: one item, no chapter keys. It is not a CAI
# instrument; any other version (or this version once its shape changes) is.
LEGACY_INSTRUMENT_VERSION = "2026.09.1"
LEGACY_INSTRUMENT_SAMPLE_ITEMS = 1
FORBIDDEN_KEY_COLUMNS = ("is_correct", "answer_key", "check_answer_key")
INSTRUMENT_TICKETS = {"pretest": "#83", "posttest": "#84"}
INSTRUMENT_LABELS = {"pretest": "research-pretest", "posttest": "final-test"}


def load_thai_rules():
    # Importing the sibling validator must not leave a __pycache__ artifact
    # (the repo never commits one).
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("ppga_validate_thai", THAI_VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


THAI = load_thai_rules()


def thai_findings(value: str):
    """The structural Thai reasons for one string (same rules as locale JSON)."""
    return list(THAI.check_marks(value)) + list(THAI.check_ascii_in_word(value))


def marker_findings(value: str):
    return [
        f"seed-marker: '{m.group(0)}' is a placeholder seed shape"
        for m in MARKER_RE.finditer(value)
    ]


def walk_json_strings(node, path=()):
    """Yield (json.path, string) for every string leaf in an instrument item."""
    if isinstance(node, dict):
        for key, child in node.items():
            yield from walk_json_strings(child, path + (str(key),))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            yield from walk_json_strings(child, path + (str(index),))
    elif isinstance(node, str):
        yield ".".join(path), node


def check_row(source, table, pk, row):
    """Findings for every scanned Thai column of one effective row."""
    findings = []
    key = ", ".join(str(row.get(k)) for k in pk)
    _, columns = CONTENT_TABLES[table]
    for column in columns:
        value = row.get(column)
        if not isinstance(value, str) or not value:
            continue
        for reason in thai_findings(value) + marker_findings(value):
            findings.append(
                f"FAILED {source}: table={table} pk=({key}) column={column}: "
                f"{reason}: {value!r}"
            )
    return findings


def check_instrument_row(source, table, row):
    findings = []
    pk = INSTRUMENT_TABLES[table][0]
    _, column = INSTRUMENT_TABLES[table]
    key = ", ".join(str(row.get(k)) for k in pk)
    value = row.get(column)
    if not isinstance(value, str) or not value:
        return findings
    try:
        document = json.loads(value)
    except json.JSONDecodeError as exc:
        findings.append(
            f"FAILED {source}: table={table} pk=({key}) column={column}: "
            f"invalid-json: {exc}"
        )
        return findings
    for path, text in walk_json_strings(document):
        for reason in thai_findings(text) + marker_findings(text):
            findings.append(
                f"FAILED {source}: table={table} pk=({key}) column={column}.{path}: "
                f"{reason}: {text!r}"
            )
    return findings


# ---------------------------------------------------------------------------
# Deterministic migration replayer
# ---------------------------------------------------------------------------

DOLLAR = re.compile(r"\$[A-Za-z_0-9]*\$")


def strip_comments_and_split(sql: str):
    """Split SQL into statements, ignoring `--` comments and dollar-quoted bodies.

    Dollar-quoted contents stay attached to their statement (a function body
    is never mistaken for a top-level INSERT), but comments are dropped and
    semicolons inside strings/dollar quotes never split.
    """
    statements = []
    current = []
    i = 0
    length = len(sql)
    while i < length:
        ch = sql[i]
        if ch == "'":
            start = i
            i += 1
            while i < length:
                if sql[i] == "'":
                    if i + 1 < length and sql[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            current.append(sql[start:i])
        elif ch == '"':
            start = i
            i += 1
            while i < length:
                if sql[i] == '"':
                    i += 1
                    break
                i += 1
            current.append(sql[start:i])
        elif ch == "-" and i + 1 < length and sql[i + 1] == "-":
            while i < length and sql[i] != "\n":
                i += 1
            current.append(" ")
        elif ch == "$":
            match = DOLLAR.match(sql, i)
            if match:
                tag = match.group(0)
                end = sql.find(tag, match.end())
                if end == -1:
                    end = length - len(tag)
                i = end + len(tag)
                current.append(sql[match.start() : i])
            else:
                current.append(ch)
                i += 1
        elif ch == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            i += 1
        else:
            current.append(ch)
            i += 1
    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


def split_top_level(text: str, separator: str):
    """Split `text` on a literal separator outside strings and parentheses."""
    parts = []
    current = []
    depth = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "'":
            start = i
            i += 1
            while i < len(text):
                if text[i] == "'":
                    if i + 1 < len(text) and text[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            current.append(text[start:i])
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif depth == 0 and text.startswith(separator, i):
            parts.append("".join(current).strip())
            current = []
            i += len(separator)
            continue
        current.append(ch)
        i += 1
    parts.append("".join(current).strip())
    return parts


def split_top_level_commas(text: str):
    return split_top_level(text, ",")


def parse_scalar(token: str):
    """Parse one SQL literal used by the content seeds (no E'' in this repo)."""
    token = token.strip()
    # Drop a trailing ::type cast, iteratively (e.g. '…'::jsonb).
    while True:
        cast = re.search(r"::\s*[A-Za-z_][A-Za-z0-9_.]*(\[\])?\s*$", token)
        if not cast:
            break
        token = token[: cast.start()].rstrip()
    if token.startswith("'") and token.endswith("'") and len(token) >= 2:
        return token[1:-1].replace("''", "'")
    lowered = token.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None
    if re.fullmatch(r"-?\d+", token):
        return int(token)
    if re.fullmatch(r"-?\d+\.\d+", token):
        return float(token)
    return token  # identifier / expression — callers treat as opaque


def parse_tuples(text: str):
    """Parse `(a, b), (c, d)` into a list of lists of literal values."""
    tuples = []
    i = 0
    while i < len(text):
        if text[i] in " \t\r\n,":
            i += 1
            continue
        if text[i] != "(":
            raise ValueError(f"expected '(' at offset {i}: {text[i:i+40]!r}")
        depth = 1
        start = i + 1
        i += 1
        cells = []
        cell_start = start
        while i < len(text) and depth:
            ch = text[i]
            if ch == "'":
                i += 1
                while i < len(text):
                    if text[i] == "'":
                        if i + 1 < len(text) and text[i + 1] == "'":
                            i += 2
                            continue
                        i += 1
                        break
                    i += 1
                continue
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    cells.append(text[cell_start:i])
                    i += 1
                    break
            elif ch == "," and depth == 1:
                cells.append(text[cell_start:i])
                cell_start = i + 1
            i += 1
        if depth:
            raise ValueError("unbalanced tuple in values list")
        tuples.append([parse_scalar(cell) for cell in cells])
    return tuples


def condition_matches(row, condition: str):
    condition = condition.strip()
    if not condition:
        return True
    null = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_]*)\s+is\s+null", condition, re.I)
    if null:
        return row.get(null.group(1)) is None
    in_match = re.fullmatch(
        r"([A-Za-z_][A-Za-z0-9_]*)\s+in\s*\((.*)\)", condition, re.I | re.S
    )
    if in_match:
        return row.get(in_match.group(1)) in [
            parse_scalar(v) for v in split_top_level_commas(in_match.group(2))
        ]
    compare = re.fullmatch(
        r"([A-Za-z_][A-Za-z0-9_]*)\s*(=|<>|>=|<=|>|<)\s*(.+)", condition, re.S
    )
    if not compare:
        return True  # unsupported predicate: be permissive, never drop silently
    column, operator, value = compare.groups()
    left = row.get(column)
    right = parse_scalar(value)
    try:
        if operator == "=":
            return left == right
        if operator == "<>":
            return left != right
        if operator == ">":
            return left is not None and left > right
        if operator == "<":
            return left is not None and left < right
        if operator == ">=":
            return left is not None and left >= right
        if operator == "<=":
            return left is not None and left <= right
    except TypeError:
        return False
    return True


def where_matches(row, where_clause: str):
    return all(
        condition_matches(row, part)
        for part in re.split(r"\s+and\s+", where_clause.strip(), flags=re.I)
    )


def pk_tuple(table, row):
    pk = CONTENT_TABLES.get(table) or INSTRUMENT_TABLES.get(table)
    return tuple(row.get(column) for column in pk[0])


def apply_statement(state, statement, source):
    insert = re.match(
        r"insert\s+into\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*"
        r"values\s*(.*)$",
        statement,
        re.I | re.S,
    )
    if insert:
        table, column_text, remainder = insert.groups()
        if table not in CONTENT_TABLES and table not in INSTRUMENT_TABLES:
            return
        columns = [c.strip().strip('"') for c in split_top_level_commas(column_text)]
        conflict = re.split(r"\bon\s+conflict\b", remainder, maxsplit=1, flags=re.I)
        values_text = conflict[0]
        update_text = ""
        if len(conflict) == 2:
            update = re.match(
                r".*?\bdo\s+update\s+set\s+(.*)$", conflict[1], re.I | re.S
            )
            if update:
                update_text = update.group(1)
        try:
            tuples = parse_tuples(values_text)
        except ValueError as exc:
            print(f"REPLAY-ERROR {source}: {table}: {exc}", file=sys.stderr)
            raise
        table_rows = state.setdefault(table, {})
        for values in tuples:
            if len(values) != len(columns):
                print(
                    f"REPLAY-ERROR {source}: {table}: column/value count mismatch",
                    file=sys.stderr,
                )
                raise ValueError("column/value count mismatch")
            candidate = dict(zip(columns, values))
            key = pk_tuple(table, candidate)
            if len(columns) < len((CONTENT_TABLES.get(table) or INSTRUMENT_TABLES[table])[0]):
                return
            existing = table_rows.get(key)
            if existing is None:
                table_rows[key] = candidate
                continue
            if update_text:
                assignments = split_top_level_commas(update_text)
                for assignment in assignments:
                    left, right = assignment.split("=", 1)
                    left = left.strip()
                    right = right.strip()
                    excluded = re.fullmatch(r"excluded\.([A-Za-z_][A-Za-z0-9_]*)", right, re.I)
                    if excluded:
                        if excluded.group(1) in candidate:
                            existing[left] = candidate[excluded.group(1)]
                    else:
                        existing[left] = parse_scalar(right)
            # ON CONFLICT DO NOTHING (or no conflict clause): keep the row.
        return

    update = re.match(
        r"update\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\s+set\s+(.*?)\s+where\s+(.*)$",
        statement,
        re.I | re.S,
    )
    if update:
        table, assignments_text, where_text = update.groups()
        if table not in CONTENT_TABLES and table not in INSTRUMENT_TABLES:
            return
        assignments = []
        for assignment in split_top_level_commas(assignments_text):
            left, right = assignment.split("=", 1)
            assignments.append((left.strip(), parse_scalar(right)))
        for row in state.get(table, {}).values():
            if where_matches(row, where_text):
                for column, value in assignments:
                    row[column] = value
        return

    delete = re.match(
        r"delete\s+from\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\s+where\s+(.*)$",
        statement,
        re.I | re.S,
    )
    if delete:
        table, where_text = delete.groups()
        if table not in CONTENT_TABLES and table not in INSTRUMENT_TABLES:
            return
        table_rows = state.get(table, {})
        for key in [
            key for key, row in table_rows.items() if where_matches(row, where_text)
        ]:
            del table_rows[key]


def replay(migrations_dir: Path):
    state = {}
    files = sorted(migrations_dir.glob("*.sql"))
    if not files:
        raise FileNotFoundError(f"no *.sql migrations in {migrations_dir}")
    for path in files:
        sql = path.read_text(encoding="utf-8")
        for statement in strip_comments_and_split(sql):
            apply_statement(state, statement, path.name)
    return state, files


# ---------------------------------------------------------------------------
# Live database scan
# ---------------------------------------------------------------------------


def has_live_db():
    try:
        result = subprocess.run(
            [
                "docker",
                "exec",
                "supabase_db_ppga",
                "psql",
                "-U",
                "postgres",
                "-tA",
                "-c",
                "select 1",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0 and result.stdout.strip() == "1"
    except (OSError, subprocess.SubprocessError):
        return False


def psql_rows(sql: str):
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            "supabase_db_ppga",
            "psql",
            "-U",
            "postgres",
            "-tA",
            "-F",
            "\x1f",
            "-R",
            "\x1e",
        ],
        input=sql,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr.strip()}")
    rows = []
    for record in result.stdout.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        rows.append(record.split("\x1f"))
    return rows


def scan_live(migrations_dir: Path):
    source = "live-db"
    findings = []
    scanned = 0
    for table, (pk, columns) in CONTENT_TABLES.items():
        selected = ", ".join(f"coalesce({c}::text, '')" for c in pk + columns)
        rows = psql_rows(f"select {selected} from public.{table};")
        for raw in rows:
            if len(raw) != len(pk + columns):
                continue
            row = dict(zip(pk + columns, raw))
            scanned += sum(1 for c in columns if row.get(c))
            findings.extend(check_row(source, table, pk, row))
    for table, (pk, column) in INSTRUMENT_TABLES.items():
        rows = psql_rows(f"select {', '.join(pk)}, {column}::text from public.{table};")
        for raw in rows:
            if len(raw) != len(pk) + 1:
                continue
            row = dict(zip(pk, raw[:-1]))
            row[column] = raw[-1]
            scanned += 1
            findings.extend(check_instrument_row(source, table, row))
    blueprint, pendings, checked = blueprint_findings(model_from_live(), source)
    findings.extend(blueprint)
    findings.extend(static_leak_findings(migrations_dir))
    return findings, pendings, checked, scanned


def scan_replay(migrations_dir: Path):
    state, files = replay(migrations_dir)
    source = f"replay:{migrations_dir.name}"
    findings = []
    scanned = 0
    for table, (pk, columns) in CONTENT_TABLES.items():
        for row in state.get(table, {}).values():
            if all(row.get(k) is not None for k in pk):
                scanned += sum(1 for c in columns if row.get(c))
                findings.extend(check_row(source, table, pk, row))
    for table, (pk, column) in INSTRUMENT_TABLES.items():
        for row in state.get(table, {}).values():
            if all(row.get(k) is not None for k in pk):
                scanned += 1
                findings.extend(check_instrument_row(source, table, row))
    blueprint, pendings, checked = blueprint_findings(
        model_from_replay(state), source
    )
    findings.extend(blueprint)
    findings.extend(static_leak_findings(migrations_dir))
    return findings, pendings, checked, scanned, len(files)


# ---------------------------------------------------------------------------
# CAI assessment blueprint (#72/#77)
#
# Both modes build the same normalized model and run the same checks, so the
# replay gate and the live-database gate cannot drift.
# ---------------------------------------------------------------------------


def normalize_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return value


def normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("t", "true", "1")
    return bool(value)


def parse_instrument_items(raw):
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    return raw


def instrument_chapter_key(item):
    if isinstance(item, dict):
        for key in ("chapter_key", "chapter"):
            value = item.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def instrument_objective_key(item):
    if isinstance(item, dict):
        for key in ("objective_key", "objective"):
            value = item.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def is_cai_instrument(version, items):
    """True when this instrument row is the CAI research/final instrument.

    The #61 legacy sample (`2026.09.1`, one item, no chapter keys) is exempt so
    the Chapter 1 pilot keeps passing before #83/#84 land. A different version,
    a different item count, or an item carrying `chapter_key` marks the row as
    the CAI instrument under validation.
    """
    if version != LEGACY_INSTRUMENT_VERSION:
        return True
    if not isinstance(items, list):
        return True
    if len(items) != LEGACY_INSTRUMENT_SAMPLE_ITEMS:
        return True
    return any(instrument_chapter_key(item) for item in items)


def empty_model():
    return {
        "chapters": [],
        "lessons": [],
        "missions": set(),
        "mission_questions": [],
        "bank": [],
        "steps": [],
        "step_options": [],
        "instruments": {"pretest": [], "posttest": []},
    }


def model_from_replay(state):
    model = empty_model()
    model["chapters"] = sorted(
        str(row.get("module_key"))
        for row in state.get("ppg_modules", {}).values()
        if CHAPTER_KEY_RE.match(str(row.get("module_key") or ""))
    )
    model["lessons"] = [
        {"lesson_key": row.get("lesson_key"), "module_key": row.get("module_key")}
        for row in state.get("ppg_lessons", {}).values()
    ]
    model["missions"] = {
        str(row.get("module_key"))
        for row in state.get("ppg_knowledge_missions", {}).values()
        if row.get("module_key")
    }
    model["mission_questions"] = [
        {
            "module_key": row.get("module_key"),
            "order_index": normalize_int(row.get("order_index")),
            "option_key": row.get("option_key"),
            "is_correct": normalize_bool(row.get("is_correct")),
        }
        for row in state.get("ppg_knowledge_mission_questions", {}).values()
    ]
    model["bank"] = [
        {
            "chapter_key": row.get("chapter_key"),
            "phase": row.get("phase"),
            "form": row.get("form"),
            "order_index": normalize_int(row.get("order_index")),
            "objective_key": row.get("objective_key"),
            "option_key": row.get("option_key"),
            "is_correct": normalize_bool(row.get("is_correct")),
        }
        for row in state.get("ppg_chapter_test_questions", {}).values()
    ]
    model["steps"] = [
        {
            "lesson_key": row.get("lesson_key"),
            "order_index": normalize_int(row.get("order_index")),
            "kind": row.get("kind"),
            "check_answer_key": row.get("check_answer_key"),
            "check_explanation_th": row.get("check_explanation_th"),
            "check_explanation_en": row.get("check_explanation_en"),
        }
        for row in state.get("ppg_lesson_steps", {}).values()
    ]
    model["step_options"] = [
        {
            "lesson_key": row.get("lesson_key"),
            "step_order_index": normalize_int(row.get("step_order_index")),
            "option_key": row.get("option_key"),
        }
        for row in state.get("ppg_lesson_step_options", {}).values()
    ]
    for logical, table in (
        ("pretest", "ppg_pretest_instruments"),
        ("posttest", "ppg_posttest_instruments"),
    ):
        for row in state.get(table, {}).values():
            version = row.get("version")
            items = parse_instrument_items(row.get("items"))
            if is_cai_instrument(version, items):
                model["instruments"][logical].append(
                    {"version": version, "items": items}
                )
    return model


def model_from_live():
    model = empty_model()
    modules = psql_rows(
        "select module_key, course_key, publication_state from public.ppg_modules;"
    )
    model["chapters"] = sorted(
        raw[0] for raw in modules if raw and CHAPTER_KEY_RE.match(raw[0] or "")
    )
    lessons = psql_rows("select lesson_key, module_key from public.ppg_lessons;")
    model["lessons"] = [
        {"lesson_key": raw[0], "module_key": raw[1]} for raw in lessons if len(raw) == 2
    ]
    missions = psql_rows("select module_key from public.ppg_knowledge_missions;")
    model["missions"] = {raw[0] for raw in missions if raw and raw[0]}
    mission_questions = psql_rows(
        "select module_key, order_index, option_key, is_correct::int "
        "from public.ppg_knowledge_mission_questions;"
    )
    model["mission_questions"] = [
        {
            "module_key": raw[0],
            "order_index": normalize_int(raw[1]),
            "option_key": raw[2],
            "is_correct": normalize_bool(raw[3]),
        }
        for raw in mission_questions
        if len(raw) == 4
    ]
    bank = psql_rows(
        "select chapter_key, phase, form, order_index, objective_key, option_key, "
        "is_correct::int from public.ppg_chapter_test_questions;"
    )
    model["bank"] = [
        {
            "chapter_key": raw[0],
            "phase": raw[1],
            "form": raw[2],
            "order_index": normalize_int(raw[3]),
            "objective_key": raw[4],
            "option_key": raw[5],
            "is_correct": normalize_bool(raw[6]),
        }
        for raw in bank
        if len(raw) == 7
    ]
    steps = psql_rows(
        "select lesson_key, order_index, kind, coalesce(check_answer_key, ''), "
        "coalesce(check_explanation_th, ''), coalesce(check_explanation_en, '') "
        "from public.ppg_lesson_steps;"
    )
    model["steps"] = [
        {
            "lesson_key": raw[0],
            "order_index": normalize_int(raw[1]),
            "kind": raw[2],
            "check_answer_key": raw[3],
            "check_explanation_th": raw[4],
            "check_explanation_en": raw[5],
        }
        for raw in steps
        if len(raw) == 6
    ]
    step_options = psql_rows(
        "select lesson_key, step_order_index, option_key "
        "from public.ppg_lesson_step_options;"
    )
    model["step_options"] = [
        {
            "lesson_key": raw[0],
            "step_order_index": normalize_int(raw[1]),
            "option_key": raw[2],
        }
        for raw in step_options
        if len(raw) == 3
    ]
    for logical, table in (
        ("pretest", "ppg_pretest_instruments"),
        ("posttest", "ppg_posttest_instruments"),
    ):
        rows = psql_rows(f"select version, items::text from public.{table};")
        for raw in rows:
            if len(raw) != 2:
                continue
            version = raw[0]
            items = parse_instrument_items(raw[1])
            if is_cai_instrument(version, items):
                model["instruments"][logical].append(
                    {"version": version, "items": items}
                )
    return model


def check_one_chapter_bank(chapter, rows, source):
    findings = []
    expected_form = {"pre": "a", "post": "b"}

    for row in rows:
        phase = row["phase"]
        form = row["form"]
        common = (
            f"blueprint chapter={chapter} phase={phase} form={form} "
            f"item={row['order_index']} objective={row['objective_key']}"
        )
        if phase not in ("pre", "post"):
            findings.append(
                f"FAILED {source}: {common} column=phase value={phase!r}: "
                "phase must be pre|post"
            )
        elif form not in ("a", "b"):
            findings.append(
                f"FAILED {source}: {common} column=form value={form!r}: "
                "form must be a|b"
            )
        elif form != expected_form[phase]:
            findings.append(
                f"FAILED {source}: {common} column=form value={form!r}: "
                f"expected form {expected_form[phase]!r} for the {phase} bank"
            )
        if row["option_key"] not in ("a", "b", "c"):
            findings.append(
                f"FAILED {source}: {common} column=option_key "
                f"value={row['option_key']!r}: option_key must be a|b|c"
            )

    pre_count = len({row["order_index"] for row in rows if row["phase"] == "pre"})
    post_count = len({row["order_index"] for row in rows if row["phase"] == "post"})
    if pre_count != post_count:
        findings.append(
            f"FAILED {source}: blueprint chapter={chapter} phase=pre/post "
            f"form=a/b item=- objective=- column=item_count "
            f"value={pre_count}/{post_count}: the pre and post banks must carry "
            "the same number of items"
        )

    pre_objectives = {
        row["objective_key"] for row in rows if row["phase"] == "pre"
    }
    post_objectives = {
        row["objective_key"] for row in rows if row["phase"] == "post"
    }
    for objective in sorted(pre_objectives - post_objectives, key=str):
        findings.append(
            f"FAILED {source}: blueprint chapter={chapter} phase=post form=b "
            f"item=- objective={objective} column=objective_key value=missing: "
            "the pre bank covers this objective but the post bank does not"
        )
    for objective in sorted(post_objectives - pre_objectives, key=str):
        findings.append(
            f"FAILED {source}: blueprint chapter={chapter} phase=pre form=a "
            f"item=- objective={objective} column=objective_key value=missing: "
            "the post bank covers this objective but the pre bank does not"
        )

    items = {}
    for row in rows:
        key = (row["phase"], row["form"], row["order_index"])
        items.setdefault(key, []).append(row)
    for (phase, form, item), item_rows in sorted(
        items.items(), key=lambda entry: (str(entry[0][0]), str(entry[0][1]), str(entry[0][2]))
    ):
        option_keys = [row["option_key"] for row in item_rows]
        objectives = {row["objective_key"] for row in item_rows}
        accurate = [row for row in item_rows if row["is_correct"]]
        common = (
            f"blueprint chapter={chapter} phase={phase} form={form} item={item} "
            f"objective={','.join(sorted(objectives, key=str)) or '-'}"
        )
        if len(objectives) != 1:
            findings.append(
                f"FAILED {source}: {common} column=objective_key "
                f"value={','.join(sorted(objectives, key=str))}: every option of "
                "an item must map to one objective_key"
            )
        if len(item_rows) != 3 or len(set(option_keys)) != len(option_keys) or set(option_keys) != {"a", "b", "c"}:
            findings.append(
                f"FAILED {source}: {common} column=option_key "
                f"value={','.join(sorted(option_keys)) or '-'}: each item needs "
                "exactly three distinct options a|b|c"
            )
        if len(accurate) != 1:
            findings.append(
                f"FAILED {source}: {common} column=is_correct "
                f"value={len(accurate)}: each item needs exactly one correct option"
            )
    return findings


def check_chapter_banks(model, source):
    findings = []
    pendings = []
    checked = 0
    rows_by_chapter = {}
    for row in model["bank"]:
        rows_by_chapter.setdefault(row["chapter_key"], []).append(row)
    for chapter in sorted(set(model["chapters"]) | set(rows_by_chapter)):
        rows = rows_by_chapter.get(chapter, [])
        if not rows:
            pendings.append(
                f"PENDING {source}: blueprint chapter={chapter} kind=chapter-bank: "
                "pending content #78+ (no pre/post bank rows)"
            )
            continue
        checked += 1
        findings.extend(check_one_chapter_bank(chapter, rows, source))
    return findings, pendings, checked


def check_missions(model, source):
    findings = []
    pendings = []
    checked = 0
    questions_by_module = {}
    for question in model["mission_questions"]:
        questions_by_module.setdefault(question["module_key"], []).append(question)
    for chapter in model["chapters"]:
        has_mission = chapter in model["missions"]
        questions = questions_by_module.get(chapter, [])
        if not has_mission and not questions:
            pendings.append(
                f"PENDING {source}: blueprint chapter={chapter} kind=mission: "
                "pending content #78+ (no Knowledge Mission rows)"
            )
            continue
        checked += 1
        if not has_mission:
            findings.append(
                f"FAILED {source}: blueprint chapter={chapter} item=- "
                "column=mission value=missing: questions exist but no "
                "ppg_knowledge_missions row"
            )
        if not questions:
            findings.append(
                f"FAILED {source}: blueprint chapter={chapter} item=- "
                "column=questions value=0: a Knowledge Mission needs 5-7 questions"
            )
            continue
        orders = sorted(
            {question["order_index"] for question in questions},
            key=lambda value: (value is None, value),
        )
        if not 5 <= len(orders) <= 7:
            findings.append(
                f"FAILED {source}: blueprint chapter={chapter} item=- "
                f"column=question_count value={len(orders)}: a Knowledge Mission "
                "needs 5-7 questions"
            )
        for order in orders:
            item_rows = [
                question for question in questions if question["order_index"] == order
            ]
            option_keys = [question["option_key"] for question in item_rows]
            accurate = [question for question in item_rows if question["is_correct"]]
            if (
                len(item_rows) != 3
                or len(set(option_keys)) != len(option_keys)
                or set(option_keys) != {"a", "b", "c"}
            ):
                findings.append(
                    f"FAILED {source}: blueprint chapter={chapter} item={order} "
                    f"column=option_key value={','.join(sorted(option_keys)) or '-'}: "
                    "each mission question needs exactly three options a|b|c"
                )
            if len(accurate) != 1:
                findings.append(
                    f"FAILED {source}: blueprint chapter={chapter} item={order} "
                    f"column=is_correct value={len(accurate)}: each mission "
                    "question needs exactly one correct option"
                )
    return findings, pendings, checked


def check_mini_checks(model, source):
    findings = []
    pendings = []
    checked = 0
    chapter_lessons = [
        lesson
        for lesson in model["lessons"]
        if CHAPTER_KEY_RE.match(str(lesson.get("module_key") or ""))
    ]
    steps_by_lesson = {}
    for step in model["steps"]:
        steps_by_lesson.setdefault(step["lesson_key"], []).append(step)
    options_by_step = {}
    for option in model["step_options"]:
        key = (option["lesson_key"], option["step_order_index"])
        options_by_step.setdefault(key, []).append(option)
    for lesson in chapter_lessons:
        lesson_key = lesson["lesson_key"]
        steps = steps_by_lesson.get(lesson_key, [])
        if not steps:
            pendings.append(
                f"PENDING {source}: blueprint chapter={lesson['module_key']} "
                f"lesson={lesson_key} kind=mini-check: pending content #78+ "
                "(no lesson steps)"
            )
            continue
        checked += 1
        checks = [step for step in steps if step["kind"] == "check"]
        if not checks:
            findings.append(
                f"FAILED {source}: blueprint chapter={lesson['module_key']} "
                f"lesson={lesson_key} item=- column=mini_check value=0: every "
                "lesson needs at least one mini-check"
            )
            continue
        for step in checks:
            order = step["order_index"]
            options = options_by_step.get((lesson_key, order), [])
            option_keys = {option["option_key"] for option in options}
            common = (
                f"blueprint chapter={lesson['module_key']} lesson={lesson_key} "
                f"item={order}"
            )
            if not 2 <= len(options) <= 4:
                findings.append(
                    f"FAILED {source}: {common} column=options value={len(options)}: "
                    "a mini-check needs 2-4 options"
                )
            if step["check_answer_key"] not in option_keys:
                findings.append(
                    f"FAILED {source}: {common} column=check_answer_key "
                    f"value={step['check_answer_key']!r}: the answer key must name "
                    "one of the options"
                )
            if not step["check_explanation_th"] or not step["check_explanation_en"]:
                findings.append(
                    f"FAILED {source}: {common} column=check_explanation "
                    "value=missing: a mini-check needs a bilingual explanation"
                )
    return findings, pendings, checked


def check_interleaved(label, version, sequence, source):
    distinct = set(sequence)
    if len(distinct) < 2:
        return []
    runs = []
    for chapter in sequence:
        if runs and runs[-1][0] == chapter:
            runs[-1][1] += 1
        else:
            runs.append([chapter, 1])
    if len(runs) > len(distinct):
        return []
    first_chapter, count = runs[0]
    return [
        f"FAILED {source}: blueprint instrument={label} version={version} "
        f"item=- chapter={first_chapter} column=interleaved value=grouped: "
        f"chapter items form contiguous blocks (runs={len(runs)}, "
        f"chapters={len(distinct)}); the final test must interleave chapters"
    ]


def check_one_instrument(logical, label, entry, model, source):
    version = entry["version"]
    items = entry["items"]
    findings = []
    if items is None:
        return [
            f"FAILED {source}: blueprint instrument={label} version={version} "
            "item=- chapter=- column=items value=invalid-json: instrument items "
            "are not valid JSON"
        ]
    if not isinstance(items, list):
        return [
            f"FAILED {source}: blueprint instrument={label} version={version} "
            "item=- chapter=- column=items value=not-a-list: instrument items "
            "must be a JSON array"
        ]
    if len(items) != 50:
        findings.append(
            f"FAILED {source}: blueprint instrument={label} version={version} "
            f"item=- chapter=- column=item_count value={len(items)}: expected "
            "exactly 50 items"
        )
    chapter_sequence = []
    for index, item in enumerate(items, 1):
        chapter = instrument_chapter_key(item)
        if chapter is None:
            findings.append(
                f"FAILED {source}: blueprint instrument={label} version={version} "
                f"item={index} chapter=- column=chapter_key value=missing: every "
                "instrument item must name its chapter"
            )
        else:
            chapter_sequence.append(chapter)
    present = set(chapter_sequence)
    known_chapters = set(model["chapters"])
    for chapter in model["chapters"]:
        if chapter not in present:
            findings.append(
                f"FAILED {source}: blueprint instrument={label} version={version} "
                f"item=- chapter={chapter} column=chapter_key value=missing: "
                "every chapter must be represented"
            )
    if known_chapters:
        for chapter in sorted(present - known_chapters, key=str):
            findings.append(
                f"FAILED {source}: blueprint instrument={label} version={version} "
                f"item=- chapter={chapter} column=chapter_key value=unknown: the "
                "instrument names a chapter that is not in the course"
            )
    if logical == "posttest":
        findings.extend(
            check_interleaved(label, version, chapter_sequence, source)
        )
    return findings


def check_objective_parity(model, source):
    pretest = next(
        (
            entry
            for entry in model["instruments"]["pretest"]
            if isinstance(entry["items"], list)
        ),
        None,
    )
    posttest = next(
        (
            entry
            for entry in model["instruments"]["posttest"]
            if isinstance(entry["items"], list)
        ),
        None,
    )
    if pretest is None or posttest is None:
        return []

    def objectives(entry):
        found = {}
        for item in entry["items"]:
            objective = instrument_objective_key(item)
            if objective:
                found.setdefault(objective, instrument_chapter_key(item))
        return found

    pre = objectives(pretest)
    post = objectives(posttest)
    if not pre or not post:
        findings = []
        for entry, found, label in (
            (pretest, pre, "research-pretest"),
            (posttest, post, "final-test"),
        ):
            if found:
                continue
            findings.append(
                f"FAILED {source}: blueprint instrument={label} "
                f"version={entry['version']} item=- chapter=- "
                "column=objective_key value=missing: instrument items must carry "
                "objective_key so pre/post coverage can be compared"
            )
        return findings
    findings = []
    for objective in sorted(set(post) - set(pre), key=str):
        findings.append(
            f"FAILED {source}: blueprint instrument=research-pretest "
            f"version={pretest['version']} item=- chapter={post[objective] or '-'} "
            f"objective={objective} column=objective_key value=missing: the final "
            "test covers this objective but the research pre-test does not"
        )
    for objective in sorted(set(pre) - set(post), key=str):
        findings.append(
            f"FAILED {source}: blueprint instrument=final-test "
            f"version={posttest['version']} item=- chapter={pre[objective] or '-'} "
            f"objective={objective} column=objective_key value=missing: the "
            "research pre-test covers this objective but the final test does not"
        )
    return findings


def check_instruments(model, source):
    findings = []
    pendings = []
    checked = 0
    for logical in ("pretest", "posttest"):
        label = INSTRUMENT_LABELS[logical]
        entries = model["instruments"][logical]
        if not entries:
            pendings.append(
                f"PENDING {source}: blueprint instrument={label}: pending "
                f"{INSTRUMENT_TICKETS[logical]} (no CAI instrument version)"
            )
            continue
        for entry in entries:
            checked += 1
            findings.extend(
                check_one_instrument(logical, label, entry, model, source)
            )
    findings.extend(check_objective_parity(model, source))
    return findings, pendings, checked


def blueprint_findings(model, source):
    findings = []
    pendings = []
    checked = 0
    for checker in (
        check_chapter_banks,
        check_missions,
        check_mini_checks,
        check_instruments,
    ):
        found, pending, count = checker(model, source)
        findings.extend(found)
        pendings.extend(pending)
        checked += count
    return findings, pendings, checked


# ---------------------------------------------------------------------------
# Static answer-key leak scan (#77)
#
# A learner-readable RPC must never project `is_correct`, `answer_key` or
# `check_answer_key`. Server-side scoring reads (WHERE / INTO / a boolean
# comparison) stay legal; only a projection of the raw key does not.
# ---------------------------------------------------------------------------

FUNCTION_RE = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"
    r"([A-Za-z_][A-Za-z0-9_]*)\s*\(",
    re.IGNORECASE,
)
GRANT_EXECUTE_RE = re.compile(
    r"^(grant|revoke)\s+execute\s+on\s+function\s+(?:public\.)?"
    r"([A-Za-z_][A-Za-z0-9_]*)\b",
    re.IGNORECASE,
)
LEARNER_ROLES = {"authenticated", "public", "anon"}


def strip_sql_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    lines = []
    for line in text.splitlines():
        output = []
        in_string = False
        index = 0
        while index < len(line):
            char = line[index]
            if char == "'":
                in_string = not in_string
                output.append(char)
            elif (
                not in_string
                and char == "-"
                and index + 1 < len(line)
                and line[index + 1] == "-"
            ):
                break
            else:
                output.append(char)
            index += 1
        lines.append("".join(output))
    return "\n".join(lines)


def iter_function_calls(text, name):
    """Yield the argument text of every <name>(...) call, balanced and quoted."""
    pattern = re.compile(r"\b" + re.escape(name) + r"\s*\(", re.IGNORECASE)
    for match in pattern.finditer(text):
        start = match.end()
        depth = 1
        index = start
        while index < len(text) and depth:
            char = text[index]
            if char == "'":
                index += 1
                while index < len(text):
                    if text[index] == "'":
                        if index + 1 < len(text) and text[index + 1] == "'":
                            index += 2
                            continue
                        index += 1
                        break
                    index += 1
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    yield text[start:index]
                    break
            index += 1


def strip_casts(text):
    text = text.strip()
    while True:
        cast = re.search(
            r"::\s*[A-Za-z_][A-Za-z0-9_.]*(\[\])?\s*$", text
        )
        if not cast:
            return text
        text = text[: cast.start()].strip()


def raw_forbidden_column(expression):
    match = re.fullmatch(
        r"(?:[A-Za-z_][A-Za-z0-9_]*\.)?(is_correct|answer_key|check_answer_key)",
        strip_casts(expression),
        re.IGNORECASE,
    )
    return match.group(1) if match else None


def projects_forbidden_value(expression):
    column = raw_forbidden_column(expression)
    if column:
        return column
    wrapper = re.fullmatch(
        r"(?:coalesce|to_jsonb|to_json|to_char)\s*\((.*)\)",
        expression.strip(),
        re.IGNORECASE | re.DOTALL,
    )
    if wrapper:
        for part in split_top_level_commas(wrapper.group(1)):
            column = projects_forbidden_value(part)
            if column:
                return column
    return None


def returns_table_columns(statement):
    match = re.search(
        r"\breturns\s+table\s*\((.*?)\)\s*(?:language|as|\$)",
        statement,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return []
    columns = []
    for part in split_top_level_commas(match.group(1)):
        token = part.strip().split()
        if token:
            columns.append(token[0].strip('"'))
    return columns


def scan_key_projections(name, info, source):
    findings = []
    file = info["file"]
    body = strip_sql_comments(info["body"])
    for column in returns_table_columns(info["statement"]):
        if column in FORBIDDEN_KEY_COLUMNS:
            findings.append(
                f"FAILED {source}: rpc={name} file={file} column={column} "
                f"value=returns-table: a learner-readable RPC must not return "
                "the answer key"
            )
    for call_name in ("jsonb_build_object",):
        for arguments in iter_function_calls(body, call_name):
            for part in split_top_level_commas(arguments):
                column = projects_forbidden_value(part)
                if column:
                    findings.append(
                        f"FAILED {source}: rpc={name} file={file} column={column} "
                        f"value={part.strip()!r}: a learner-readable RPC must not "
                        "project the answer key"
                    )
                    continue
                key = parse_scalar(part)
                if isinstance(key, str) and key in FORBIDDEN_KEY_COLUMNS:
                    findings.append(
                        f"FAILED {source}: rpc={name} file={file} column={key} "
                        f"value={key!r}: a learner-readable RPC must not project "
                        "the answer key"
                    )
    for call_name in ("jsonb_build_array", "jsonb_agg"):
        for arguments in iter_function_calls(body, call_name):
            for part in split_top_level_commas(arguments):
                column = projects_forbidden_value(part)
                if column:
                    findings.append(
                        f"FAILED {source}: rpc={name} file={file} column={column} "
                        f"value={part.strip()!r}: a learner-readable RPC must not "
                        "project the answer key"
                    )
    for match in re.finditer(
        r"\bto_jsonb\s*\(\s*(?:[A-Za-z_][A-Za-z0-9_]*\.)?"
        r"(is_correct|answer_key|check_answer_key)\b",
        body,
        re.IGNORECASE,
    ):
        findings.append(
            f"FAILED {source}: rpc={name} file={file} column={match.group(1)} "
            f"value={match.group(0)!r}: a learner-readable RPC must not project "
            "the answer key"
        )
    return findings


def static_leak_findings(migrations_dir):
    source = f"static:{migrations_dir.name}"
    statements = []
    for path in sorted(migrations_dir.glob("*.sql")):
        for statement in strip_comments_and_split(path.read_text(encoding="utf-8")):
            statements.append((path.name, statement))

    functions = {}
    for filename, statement in statements:
        match = FUNCTION_RE.match(statement)
        if not match:
            continue
        body = re.search(
            r"\bas\s+(\$[A-Za-z_0-9]*\$)(.*?)\1",
            statement,
            re.IGNORECASE | re.DOTALL,
        )
        functions[match.group(1)] = {
            "file": filename,
            "statement": statement,
            "body": body.group(2) if body else "",
        }

    grant_roles = {}
    for filename, statement in statements:
        match = GRANT_EXECUTE_RE.match(statement)
        if not match or match.group(1).lower() != "grant":
            continue
        to_clause = re.search(r"\bto\s+(.+)$", statement, re.IGNORECASE | re.DOTALL)
        if not to_clause:
            continue
        roles = {
            part.strip().strip('"').lower()
            for part in to_clause.group(1).split(",")
        }
        grant_roles.setdefault(match.group(2), set()).update(roles)

    findings = []
    for name, info in sorted(functions.items()):
        if name in grant_roles and not (grant_roles[name] & LEARNER_ROLES):
            continue
        findings.extend(scan_key_projections(name, info, source))
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["auto", "replay", "live"], default="auto")
    parser.add_argument("--migrations", type=Path, default=DEFAULT_MIGRATIONS)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat every pending content item (#78+/#83/#84) as a failure",
    )
    arguments = parser.parse_args()

    if arguments.mode == "live":
        if not has_live_db():
            print(
                "FAILED live: the local Supabase DB (supabase_db_ppga) is not reachable; "
                "run `supabase start` or use --mode replay",
                file=sys.stderr,
            )
            return 2
        findings, pendings, checked, scanned = scan_live(arguments.migrations)
        source = "live local Supabase DB"
    elif arguments.mode == "replay":
        try:
            findings, pendings, checked, scanned, file_count = scan_replay(
                arguments.migrations
            )
        except (OSError, ValueError) as exc:
            print(f"REPLAY-ERROR: {exc}", file=sys.stderr)
            return 2
        source = f"{file_count} migration file(s) replayed from {arguments.migrations}"
    else:
        if has_live_db():
            findings, pendings, checked, scanned = scan_live(arguments.migrations)
            source = "live local Supabase DB"
        else:
            try:
                findings, pendings, checked, scanned, file_count = scan_replay(
                    arguments.migrations
                )
            except (OSError, ValueError) as exc:
                print(f"REPLAY-ERROR: {exc}", file=sys.stderr)
                return 2
            source = f"{file_count} migration file(s) replayed from {arguments.migrations}"

    pending_count = len(pendings)
    if arguments.strict:
        findings.extend(
            pending.replace("PENDING", "FAILED", 1) + " [strict]"
            for pending in pendings
        )
        pendings = []

    for finding in findings:
        print(finding)
    for pending in pendings:
        print(pending)
    print(
        f"{len(findings)} finding(s) over {scanned} seeded Thai value(s) "
        f"and {checked} blueprint check(s) [{source}]; "
        f"{pending_count} pending item(s) awaiting content (#78+/#83/#84)"
    )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
