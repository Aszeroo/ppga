# PPGA — Gamified CAI Course for 21910-2006 Presentation Program

A bilingual (Thai/English) gamified computer-assisted instruction (CAI) platform for vocational learners in the subject 21910-2006 Presentation Program (B.E. 2567 curriculum), structured as a nine-chapter learning game and supporting a one-group pretest–posttest research study.

## Language

### People

**Learner**:
A student enrolled in the study who uses the platform to learn presentation-program skills. Provisioned by an Admin; never self-registers.
_Avoid_: student account, user (in code/UI copy, use the role name)

**Teacher**:
A staff role that monitors Learners and research data. Reviewing Practical Submissions and assigning Rubric Scores belongs to the legacy practical model (ADR-0005).
_Avoid_: instructor, grader

**Admin**:
The operator role that manages accounts, roles, publication state, and research configuration.
_Avoid_: superuser, root

### Curriculum

**Course**:
The single vocational subject taught on the platform, 21910-2006 Presentation Program, composed of 9 ordered Chapters. Delivery is program-neutral: Microsoft PowerPoint is the primary example, and Google Slides, LibreOffice Impress, Keynote, and Canva are equivalent presentation programs.
_Avoid_: learning path, training program (v1 has exactly one Course)

**Chapter**:
One of the 9 ordered sections of the Course, each mapped to a topic in the textbook's table of contents and built as 3 CAI Lessons plus 1 Knowledge Mission. A Chapter Post-Test score of 70% or higher unlocks the next Chapter.
_Avoid_: unit; module (legacy schema name, see **Module (legacy)**)

**Module (legacy)**:
The historical name for a Chapter. The schema and code still use `ppg_modules` and `module_key`, which denote the same structure; new content and learner-facing copy use Chapter.
_Avoid_: using Module for new content

**Lesson**:
The CAI study material inside a Chapter, containing at least one inline Mini-Check.
_Avoid_: topic, chapter

**Skill Domain**:
A named category of presentation-program competence used to tag Chapters and Knowledge Missions.
_Avoid_: skill, competency

**Final Project (legacy)**:
The former integrative Practical Mission at the end of the Course. It is not part of the active journey; the Final Test replaces it.
_Avoid_: capstone, final exam

### Chapter loop

**Chapter Pre-Test**:
The 10-item auto-scored assessment at the start of each Chapter, covering that Chapter's objectives and establishing a baseline. It does not gate progression.
_Avoid_: baseline quiz

**Mini-Check**:
A short inline auto-checked question inside a CAI Lesson, giving immediate feedback. It is not scored and does not gate progression.
_Avoid_: self-check (legacy name, see **Self-Check (legacy)**), quiz

**Mission**:
A Learner task in the curriculum. The only active kind is the **Knowledge Mission**; the **Practical Mission** is legacy vocabulary (ADR-0005).
_Avoid_: quest, assignment, challenge

**Knowledge Mission**:
The single auto-scored, server-side question set (5–7 items, 3 options each) at the end of a Chapter. It is a learning activity, not a research instrument and not a gate.
_Avoid_: worksheet, project

**Chapter Post-Test**:
The 10-item auto-scored assessment at the end of each Chapter, drawn from a bank parallel to the Chapter Pre-Test with the same objective coverage. A score of 70% or higher unlocks the next Chapter.
_Avoid_: final quiz

**Attempt**:
A single Learner run of a Knowledge Mission or an assessment, with persisted state. Multiple attempts are allowed unless the instrument's design says otherwise; research instruments are single-attempt (ADR-0002).
_Avoid_: try, session

### Legacy practice vocabulary

**Self-Check (legacy)**:
The former end-of-Lesson check, superseded by Mini-Check. Existing self-check routes and tables remain in code for soft-archived content.
_Avoid_: using Self-Check for new content

**Practical Mission (legacy)**:
The former worksheet-style task requiring a Learner to produce and submit a file. It is not part of the active journey (ADR-0005).
_Avoid_: worksheet, project

**Submission (legacy)**:
A Learner-uploaded file (+ reflection) for a Practical Mission, stored in version-preserving history. It is retained only for soft-archived content; no new submissions belong to the journey.
_Avoid_: upload, homework, evidence (use only for attached artifacts)

### Assessment

**Research Pre-Test**:
The global 50-item auto-scored instrument administered before the Course, recording the baseline for the one-group pretest–posttest study. Code and tables may still call it the Pre-Test. Single attempt; awards no rewards (ADR-0001).
_Avoid_: course pre-test, baseline exam

**Final Test**:
The 50-item auto-scored post-test covering all Chapters, interleaved rather than grouped by Chapter, and administered after the Course. It completes the study's pretest–posttest pair and is single-attempt. Code and tables may still call it the Post-Test.
_Avoid_: final exam; post-test (use Final Test in new copy)

**Knowledge Score**:
The server-calculated percent-correct result of a Knowledge Mission, Chapter Pre-Test, Chapter Post-Test, Research Pre-Test, or Final Test.
_Avoid_: quiz score

**Rubric Score (legacy)**:
A Teacher's per-criterion 1–5 evaluation of a Submission. It belongs to the legacy practical model and is never part of the active journey or of Learner rewards.
_Avoid_: grade (unqualified), XP-as-score

**Satisfaction Survey**:
The approved learner-satisfaction questionnaire administered after the Final Test. Versioned, seeded, immutable once published.
_Avoid_: feedback form

### Operations

**Provisioning**:
Bulk creation of Learner accounts by an Admin/Teacher from a pasted roster (student-ID logins, one-time temp passwords). Learners never self-register.
_Avoid_: signup, enrollment

**Export**:
A researcher-facing data extract (CSV, XLSX, SQL, PDF) of research tables, carrying real participant identity, restricted to Admin/Teacher and audit-logged on every run.
_Avoid_: report (unqualified), download

### Gamification

**XP**:
The single gamification currency, granted by trusted server-side logic for valid learning events; drives Level, unlocks, and Badges. It is never derived from an assessment score, and no Chapter test or research instrument grants it. v1 has no other currency (no Points).
_Avoid_: points, coins, credits

**Leaderboard**:
A rank ordering of Learners by total XP, visible to all Learners; used for friendly competition and end-of-semester prizes. It reflects learning progression, never assessment scores.
_Avoid_: ranking, scoreboard, points table

**Level**:
A deterministic function of total XP. Never edited, decorated, or granted directly.
_Avoid_: rank, tier

**Badge**:
A persisted achievement awarded when explicit criteria are met by real learning events. It is never granted in exchange for an assessment score, and the research instruments award none.
_Avoid_: achievement (in UI copy), trophy

**Unlock**:
Deterministic, server-enforced access state of content based on prerequisites. The Research Pre-Test gates the Course; a Chapter Post-Test score of 70% or higher unlocks the next Chapter. The client cannot bypass it.
_Avoid_: gating (as a noun), lock flag (ad-hoc)
