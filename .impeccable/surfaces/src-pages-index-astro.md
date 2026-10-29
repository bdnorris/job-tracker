---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: ["src/layouts/Layout.astro"]
---

# Board (home) — surface brief

Scope: `/` board + dashboard strip, and the app shell every route inherits. Mode: Operate.
Audience/job: the owner's daily desk triage — what is overdue, due today, which interviews are coming — then move cards and log. Constraints: board structure (stage columns, dashboard strip above) is fixed by the user; light and dark both follow the OS at AA; config-driven stages and highlight colors; keyboard status select stays.
Must not feel: SaaS-generic, playful, or sparse.

## Direction contract

THESIS: Triage as a departures board — the strip answers "what departs next" in one ranked, time-ordered panel, and the board below carries each job as a segmented pass. Refuses the category default of stat tiles plus soft white kanban cards.

OWN-WORLD: Ink #0b0d10 / slate #1c2127 shell and departures panel, panel grey #e6e8eb ground, white pass surfaces, steel #6b7178 secondary text; one alert yellow reserved for "now" (due today, active/selected); red only for overdue. Inter Tight for UI, JetBrains Mono uppercase tracked labels and all tabular data (dates, times, pay, counts). 2–4px radii, 1px ink rules, dashed perforation with notches.

STORY: The owner opens the board, reads the departures panel top-down (overdue red, today lit yellow, then upcoming), sees interviews with their clock time, then works the stage columns and moves passes.

FIRST VIEWPORT: Ink header with nav; ink departures band: stage-count tile grid + 7/30-day counts left, ranked "Next actions" departures table centre (DATE / ACTION / JOB / STATUS), upcoming interview with monumental mono clock right. Below on the light ground: five stage columns of pass cards (ROLE / FROM / PAY segments, perforation, NEXT stub, skills, match, status select), collapsed Closed rail.

FORM: Gate Board (catalog challenger vernacular-ephemera-boarding-pass-and-gate-board), chosen over the assigned Ledger (list position 3). Signature move: a moved pass reflows to its new column in place and holds the yellow lit state until the next interaction; due-today rows stay lit. seed:952f01c0ed19c053

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
