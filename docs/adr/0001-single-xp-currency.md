---
status: accepted
---

# 0001 — Single XP currency; no Points, no reward on research instruments

The original spec left "Points" as a possible second gamification currency, and a leaderboard was later requested to drive friendly competition (top-3 semester prizes). We decided that XP is the **only** gamification currency: it drives levels, unlocks, and badges, and the leaderboard ranks learners by total XP. A separate Points currency was rejected — it would add a second ledger and a second anti-abuse surface with no motivational gain over XP, and reward semantics are nearly impossible to split retroactively once learners hold balances.

Separation rules that must hold in server logic (not by convention):

- XP ≠ Knowledge Score ≠ Rubric Score. Gamification rewards never become assessment results.
- Research instruments (Pre-Test, Post-Test, Satisfaction Survey) award **no XP, badges, or any reward** — gamifying them would pressure responses and contaminate the study.
- The learner-facing leaderboard shows rank, name, level, XP, and XP-to-next-rank only. Rubric scores, knowledge scores, and pre/post results never appear on it.
- Prize awarding stays offline; the app has no prize/winner state.

Consequences: adding any future second currency requires revisiting this ADR first.
