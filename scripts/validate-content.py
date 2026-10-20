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

Usage:
  python3 scripts/validate-content.py                 # auto: live DB if up, else replay
  python3 scripts/validate-content.py --mode replay   # deterministic, no DB needed
  python3 scripts/validate-content.py --mode live     # scan the local Supabase DB
  python3 scripts/validate-content.py --migrations DIR # replay an alternate directory

Findings name the exact table / primary key / column / value. Exit 1 when
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


def scan_live():
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
            findings.extend(check_row("live-db", table, pk, row))
    for table, (pk, column) in INSTRUMENT_TABLES.items():
        rows = psql_rows(f"select {', '.join(pk)}, {column}::text from public.{table};")
        for raw in rows:
            if len(raw) != len(pk) + 1:
                continue
            row = dict(zip(pk, raw[:-1]))
            row[column] = raw[-1]
            scanned += 1
            findings.extend(check_instrument_row("live-db", table, row))
    return findings, scanned


def scan_replay(migrations_dir: Path):
    state, files = replay(migrations_dir)
    findings = []
    scanned = 0
    for table, (pk, columns) in CONTENT_TABLES.items():
        for row in state.get(table, {}).values():
            if all(row.get(k) is not None for k in pk):
                scanned += sum(1 for c in columns if row.get(c))
                findings.extend(check_row(f"replay:{migrations_dir.name}", table, pk, row))
    for table, (pk, column) in INSTRUMENT_TABLES.items():
        for row in state.get(table, {}).values():
            if all(row.get(k) is not None for k in pk):
                scanned += 1
                findings.extend(
                    check_instrument_row(f"replay:{migrations_dir.name}", table, row)
                )
    return findings, scanned, len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["auto", "replay", "live"], default="auto")
    parser.add_argument("--migrations", type=Path, default=DEFAULT_MIGRATIONS)
    arguments = parser.parse_args()

    if arguments.mode == "live":
        if not has_live_db():
            print(
                "FAILED live: the local Supabase DB (supabase_db_ppga) is not reachable; "
                "run `supabase start` or use --mode replay",
                file=sys.stderr,
            )
            return 2
        findings, scanned = scan_live()
        source = "live local Supabase DB"
    elif arguments.mode == "replay":
        try:
            findings, scanned, file_count = scan_replay(arguments.migrations)
        except (OSError, ValueError) as exc:
            print(f"REPLAY-ERROR: {exc}", file=sys.stderr)
            return 2
        source = f"{file_count} migration file(s) replayed from {arguments.migrations}"
    else:
        if has_live_db():
            findings, scanned = scan_live()
            source = "live local Supabase DB"
        else:
            try:
                findings, scanned, file_count = scan_replay(arguments.migrations)
            except (OSError, ValueError) as exc:
                print(f"REPLAY-ERROR: {exc}", file=sys.stderr)
                return 2
            source = f"{file_count} migration file(s) replayed from {arguments.migrations}"

    for finding in findings:
        print(finding)
    print(f"{len(findings)} finding(s) over {scanned} seeded Thai value(s) [{source}]")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
