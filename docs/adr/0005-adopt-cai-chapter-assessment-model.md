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

The Final Test is a 50-item auto-scored post-test covering all Chapters, with items interleaved rather than grouped by Chapter. It replaces the Post-Test endpoint of the old journey. Retries are allowed, but the first submitted attempt is preserved as the research measure and later retries never overwrite it; every submitted attempt is immutable (ADR-0002). Roughly 5–6 items come from each Chapter; the exact allocation is fixed in the content migration.

### The research design

A global 50-item Research Pre-Test is administered before the Course and paired with the 50-item Final Test for the one-group pretest–posttest study. The Research Pre-Test is single-attempt and awards no XP and no Badges (ADR-0001). The Final Test awards XP once for completion, and a Badge may mark its completion, but its score never affects the reward. Chapter Pre-Tests and Chapter Post-Tests are formative and are not research instruments.

### XP and badge rules

Gamification stays, and it rewards learning events rather than assessment results:

- XP is granted once per valid event, through idempotent server-side ledger writes: once per Chapter Post-Test pass (a score of 70% or higher), once per Knowledge Mission completion, and once for Final Test completion; the exact amounts live in the server migrations.
- Mini-Checks never award XP. Chapter Pre-Tests, the Research Pre-Test, and the Satisfaction Survey award no XP and no Badges.
- XP and Level are never proportional to an assessment score: the score decides pass or fail, never the reward amount, and XP is never shown as an assessment score (ADR-0001).
- Badges stay event-driven and may mark assessment milestones: the first Chapter cleared, a perfect Chapter Post-Test, all nine Chapters cleared, and Final Test completion, alongside ordinary events such as the first Lesson pass or a Knowledge Mission completion. A Badge is never granted in exchange for a score value.
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
- ADR-0002's Final Project gate is superseded. Its single-attempt rule still governs the Research Pre-Test; its immutability rule governs every submitted Final Test attempt, while retries are allowed and the first submitted attempt stays the research measure.
