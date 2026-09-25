---
status: accepted
---

# 0002 — Research-integrity gating of the learner journey

This platform doubles as the data-collection instrument for a one-group pretest–posttest study with 27 ปวช.2 participants. Several gating rules exist **only because of the study** and would look arbitrary to a future reader — they are deliberate and must not be "fixed":

- **The Pre-Test gates all course content.** A learner who has not submitted the Pre-Test sees only the Pre-Test screen. Admin can unlock individual learners for exceptions, and every override is written to the audit log.
- **The Post-Test unlocks only after the Final Project is accepted** (i.e., the full learning intervention is complete). The Satisfaction Survey unlocks after the Post-Test is submitted.
- **All three instruments are single-attempt and immutable once submitted**, with autosave for interrupted sessions. Responses are never silently translated, transformed, or overwritten.
- **Instruments award no rewards** (see ADR-0001).
- **Submissions, rubric scores, attempt history, and audit events are append-only.** Research data is never overwritten; "needs improvement" loops create new records, never updates to old ones.
- Each instrument response records its **instrument version and language** so pre/post comparison remains interpretable later, whether the advisor uses identical or parallel forms.

Consequences: content cannot ship to learners before the Pre-Test flow is live (this ordering drove the M2-before-M3 milestone plan).
