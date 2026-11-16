---
status: accepted
---

# 0005 — Adopt the CAI chapter and assessment model for 21910-2006 Presentation Program

The owner pivoted PPGA from a PowerPoint-skills platform with worksheet-style practical work to a computer-assisted instruction (CAI) course for the vocational subject 21910-2006 Presentation Program (B.E. 2567 curriculum). The course follows the textbook's 9 chapters and is program-neutral: Microsoft PowerPoint is the primary example, and Google Slides, LibreOffice Impress, Keynote, and Canva are equivalents. This ADR records the model every later ticket uses. It supersedes the Final Project gate in ADR-0002; the reward-separation rules of ADR-0001 and the content-as-seed-migrations rule of ADR-0003 still stand.

## Decisions

### No worksheets

Practical Mission, Submission, and Rubric Score leave the learner journey. Their tables, routes, and RLS policies stay in the database and code as legacy; no new learner flow or content uses them. The Teacher role no longer reviews submissions or assigns rubric scores.

### The chapter loop

Each of the 9 Chapters runs the same loop:

1. Chapter Pre-Test (10 items)
2. CAI Lessons, each with at least one inline Mini-Check
3. One Knowledge Mission (5–7 items, 3 options each)
4. Chapter Post-Test (10 items)

A Chapter Post-Test score of 70% or higher unlocks the next Chapter. This loop is the only active learning path; the old self-check gate and the Final Project gate do not apply.

### Parallel chapter forms

Each Chapter has two 10-item banks, one for the Pre-Test and one for the Post-Test. The items differ but cover the same objectives at the same cognitive level, so a Chapter's pre/post comparison stays interpretable. Both banks are auto-scored server-side.

### The Final Test

The Final Test is a single 50-item auto-scored post-test covering all Chapters, with items interleaved rather than grouped by Chapter. It replaces the Post-Test endpoint of the old journey and is single-attempt and immutable once submitted (ADR-0002). Roughly 5–6 items come from each Chapter; the exact allocation is fixed in the content migration.

### The research design

A global 50-item Research Pre-Test is administered before the Course and paired with the 50-item Final Test for the one-group pretest–posttest study. Neither instrument awards XP or Badges (ADR-0001). Chapter Pre-Tests and Chapter Post-Tests are formative and are not research instruments.

### XP and badge rules

Gamification stays, and it rewards learning events rather than assessment results:

- XP is granted once per valid event, through idempotent server-side ledger writes. Mini-Check passes and Knowledge Mission passes are the active XP events; the exact amounts live in the server migrations.
- Chapter Pre-Tests, Chapter Post-Tests, the Research Pre-Test, and the Final Test grant no XP and no Badges.
- Badges stay event-driven, for example the first Lesson pass or a Knowledge Mission pass. No Badge is granted in exchange for an assessment score.
- Level and Leaderboard remain deterministic functions of total XP and never show assessment scores (ADR-0001).

### Item blueprint

The content set is fixed by this blueprint:

- 9 Chapters × (10 Pre-Test items + 10 Post-Test items) = 180 chapter test items.
- 9 Knowledge Missions × 5–7 items = 45–63 items.
- 1 Final Test × 50 items, interleaved across all Chapters.
- 1 Research Pre-Test × 50 items.

Every item is bilingual (Thai/English), stored in versioned seed migrations (ADR-0003), and validated in CI.

### Soft-archive policy

Old curriculum content (Modules, Self-Checks, Practical Missions, Submissions, Rubric Scores) is soft-archived, never destructively deleted. Archived rows keep their history and RLS, are excluded from learner-facing reads, and remain available to research export with their original meaning. Publication state `archived` is the mechanism (ADR-0003). Old schema names such as `ppg_modules` and `module_key` stay; domain documentation calls the structure a Chapter.

## Consequences

- New content and learner-facing copy use Chapter, not Module.
- A Chapter must ship with all four loop stages before learners see it; a Chapter without a Post-Test bank cannot unlock the next one.
- Research exports keep working because legacy tables are archived, not dropped.
- The Practical Mission UI is not extended. Any future worksheet feature must reopen this ADR.
- ADR-0002's Final Project gate is superseded. Its single-attempt and immutability rules still govern the Research Pre-Test and the Final Test.
