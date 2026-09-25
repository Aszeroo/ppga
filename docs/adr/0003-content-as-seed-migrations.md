---
status: accepted
---

# 0003 — Learning content as versioned seed migrations; no content-authoring CRUD in v1

Course, module, lesson, self-check, mission, badge, and instrument content is authored as **versioned seed migrations** (bilingual Thai/English fields reviewed via git), not through an admin authoring UI. The admin UI in v1 covers only: user/role management, bulk roster provisioning, consent flags, publication toggles, unlock overrides, and audit views.

Why: a full bilingual CRUD UI for every content entity is a large build with no learner-facing value; content-as-migrations gives git-based review of both languages side by side; instruments must be versioned and immutable once published (ADR-0002), which migrations express naturally. Rejected alternative: admin CRUD first — deferred until content maintenance becomes a real operational burden.

Consequences: changing live content means a new migration; a future content-CRUD feature must respect publication states (draft/published/archived) and instrument immutability.
