# PPGA — Gamified PowerPoint Learning Platform

A bilingual (Thai/English) gamified web platform for ปวช.2 vocational students to develop practical Microsoft PowerPoint presentation-creation skills, structured as a learning game, supporting a one-group pretest–posttest research study.

## Language

### People

**Learner**:
A student enrolled in the study who uses the platform to learn PowerPoint skills. Provisioned by an Admin; never self-registers.
_Avoid_: student account, user (in code/UI copy, use the role name)

**Teacher**:
A reviewer role that monitors Learners, evaluates Practical Submissions, and assigns Rubric Scores.
_Avoid_: instructor, grader

**Admin**:
The operator role that manages accounts, roles, publication state, and research configuration.
_Avoid_: superuser, root

### Curriculum

**Course**:
The single linear learning unit of the platform ("PowerPoint Presentation Creation"), composed of ordered Modules.
_Avoid_: learning path, program (v1 has exactly one Course)

**Module**:
An ordered section of the Course mapped to one PowerPoint skill domain; unlocks when the previous Module's Mission is complete.
_Avoid_: chapter, unit

**Lesson**:
The study material inside a Module, ending in a Self-Check.
_Avoid_: topic, chapter

**Final Project**:
The integrative Practical Mission at the end of the Course that combines skills from all Modules; its acceptance completes the learning intervention and unlocks the Post-Test.
_Avoid_: capstone, final exam

**Skill Domain**:
A named category of PowerPoint competence (e.g., "Text Formatting", "Slide Design") that Modules and Missions are tagged with.
_Avoid_: skill, competency

### Practice & Missions

**Self-Check**:
A short auto-checked question set at the end of a Lesson; passing it is the gate to attempt the Module's Mission. Not a scored assessment.
_Avoid_: practice, quiz (unqualified)

**Mission**:
A real task a Learner must complete. Two kinds: **Knowledge Mission** (auto-scored, server-side) and **Practical Mission** (requires a Submission reviewed by a Teacher).
_Avoid_: quest, assignment, challenge

**Attempt**:
A single Learner run of a Mission, with persisted state; multiple attempts are allowed but rewards are granted once.
_Avoid_: try, session

**Submission**:
A Learner-uploaded PowerPoint file (+ reflection) for a Practical Mission, stored in version-preserving history; reviewed by a Teacher.
_Avoid_: upload, homework, evidence (use only for attached artifacts)

### Assessment

**Rubric Score**:
A Teacher's per-criterion 1–5 evaluation of a Submission across the 7 practical criteria; total 7–35. Strictly separate from XP and Level.
_Avoid_: grade (unqualified), XP-as-score

**Knowledge Score**:
The server-calculated percent-correct result of a Knowledge Mission.
_Avoid_: quiz score

**Pre-Test / Post-Test**:
The research instruments administered before and after the learning intervention. Versioned, seeded, immutable once published; single attempt per Learner.
_Avoid_: exam, test (unqualified)

**Satisfaction Survey**:
The approved learner-satisfaction questionnaire administered after the Post-Test. Versioned, seeded, immutable once published.
_Avoid_: feedback form

**Provisioning**:
Bulk creation of Learner accounts by an Admin/Teacher from a pasted roster (student-ID logins, one-time temp passwords). Learners never self-register.
_Avoid_: signup, enrollment

**Export**:
A researcher-facing data extract (CSV, XLSX, SQL, PDF) of research tables, carrying real participant identity, restricted to Admin/Teacher and audit-logged on every run.
_Avoid_: report (unqualified), download

### Gamification

**XP**:
The single gamification currency, granted by trusted server-side logic for valid learning events; drives Level, unlocks, and Badges. It is never an assessment score. v1 has no other currency (no Points).
_Avoid_: points, coins, credits

**Leaderboard**:
A rank ordering of Learners by total XP, visible to all Learners; used for friendly competition and end-of-semester prizes. It reflects learning progression, never assessment scores.
_Avoid_: ranking, scoreboard, points table

**Level**:
A deterministic function of total XP. Never edited, decorated, or granted directly.
_Avoid_: rank, tier

**Badge**:
A persisted achievement awarded when explicit criteria are met by real events.
_Avoid_: achievement (in UI copy), trophy

**Unlock**:
Deterministic, server-enforced access state of content based on prerequisites; the client cannot bypass it.
_Avoid_: gating (as a noun), lock flag (ad-hoc)
