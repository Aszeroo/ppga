---
status: accepted
---

# 0004 — Adopt the owner-authored V3 design as the UI source of truth

The application's UI is a faithful reskin of the owner's hand-authored V3 design (a Thai design brief, a 31-screen HTML gallery, and Figma exports under `UI_UX_design/`), with conflict priority: HTML gallery > Figma exports > brief. The brief's behavioral rules stay binding: no XP deduction or punishment mechanics, no lives/energy/hearts/timers, the word "Points" banned, exactly one primary CTA per context, top navigation with no sidebar, utilitarian admin surfaces. One sanctioned exception: image assets (pixel icons, mascot, illustrations) are extracted from the Figma exports because the gallery uses emoji placeholders. Existing design-token names are kept while their values are replaced by the V3 palette, preserving the CI token-purity contract; literal colors live only in the global stylesheet. Fonts move to a Thai humanist body face plus an ASCII-only pixel display face.

Why: the owner designed the UI themselves after engineer-driven adaptations repeatedly missed their intent; faithful replication is the acceptance bar, and a documented priority order prevents future relitigating of source-of-truth conflicts. Rejected alternative: free adaptation of the previous in-repo token system — that drift produced this redesign in the first place.

Consequences: visual changes must trace to the design sources (technically forced deviations are flagged to the owner before landing); new screens extend the gallery vocabulary rather than inventing styles; the reskin touches presentation only — behavior, routing, and server logic stay untouched.
