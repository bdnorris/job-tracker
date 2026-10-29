# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, running their own job search. The repo is open-source so others can deploy their own instance, but that is hygiene, not an audience. Design for the owner's habits and judgment, not for a general or first-time user. The README is the only surface written for strangers.

The main situation is **daily desk triage**: on a laptop, opening the board and dashboard strip to see what is overdue or due today and which interviews are coming up, then moving cards through the pipeline and logging what happened. The secondary jobs are reading and highlighting a posting, filling out application forms from the application kit in a narrow side window, and printing job and prep sheets. These are all real workflows, but none of them should outrank triage.

## Product Purpose

A single-user CRUD tracker for job postings. It takes a posting from a pasted URL or raw text, moves it through a configurable pipeline, keeps a timeline of notes, interviews and status changes, highlights a snapshot of the description by category, prints job and interview prep sheets, and stores profile data that can be copied in one click when filling out applications.

Success: the owner can see the whole state of the search at a glance, nothing due slips past, and logging a step costs less effort than skipping it.

## Positioning

**You own your data.** Each instance is self-hosted on the owner's own Netlify and Neon accounts. There is no SaaS account and no vendor lock-in. A full JSON export/import round-trips everything, and the public repo contains zero personal data. Huntr, Teal and similar hosted trackers can't honestly make this claim.

## Operating Context

- Laptop browser on a desk, used daily. Board (`/`) with the dashboard strip is the home view; list (`/jobs`) has bookmarkable query-string filters.
- Postings come from ATS pages (Greenhouse, Lever, Ashby), JSON-LD pages, generic pages, or pasted text for sites that block server fetches (LinkedIn, Indeed).
- Application kit (`/profile`) is used beside ATS forms in a narrow side window.
- Job and prep sheets print on paper from Chrome and Firefox.
- Pipeline stages, highlight categories and colors, skills, timezone and currency all come from `tracker.config.ts`, so UI must not hard-code them.

## Capabilities and Constraints

- Stack: Astro 7 SSR on Netlify, Neon Postgres via Drizzle, Preact islands only where interaction requires them, plain CSS with custom properties (`src/styles/tokens.css`, `base.css`, `print.css`, `sheet.css`). No CSS framework.
- Single password auth, no user table.
- Extraction is a deterministic chain of extractors. AI (Anthropic) is optional gap-filling that only loads when `ANTHROPIC_API_KEY` is set, and the app must work fully without it.
- Each extracted field shows a label naming its source. Missing required fields are flagged.
- Highlights are character offsets into `description_text`, rendered server-side as `<mark>` so they work without JS and in print. Overlaps are allowed.
- Many forms work as plain HTML posts without JavaScript (see `docs/decisions.md`).
- Status changes have to stay keyboard and touch operable. Each card has a status select, since native drag does not fire on touch.
- Non-goals for v1: multi-user, sharing, browser extension, email/calendar sync, resume generation, auto-apply.

## Evidence on Hand

- `Job Tracker Build Spec.md`: the authoritative feature spec.
- `docs/decisions.md`: implementation decisions log.
- `scripts/seed.ts`: synthetic demo data (fake companies, fake profile). Use it for screenshots.
- No testimonials, users, metrics, or press exist, and none should be invented.

## Product Principles

1. **Triage first.** The default view answers "what needs me today?" before anything else.
2. **The owner's data, the owner's control.** Never add anything that leaks data off the instance or makes export lossy.
3. **Works without the extras.** Core flows work without AI, and where possible without JavaScript. Enhancements layer on top.
4. **Config is truth.** Stages, categories, colors and skills come from `tracker.config.ts`. The UI adapts to them.
5. **Built for one expert user.** Optimize for speed and density for someone who uses it daily, not for onboarding a stranger.

## Accessibility & Inclusion

- WCAG 2.1 AA contrast in light and dark themes (`prefers-color-scheme`). Highlight colors need enough contrast for dark text in both.
- Every interactive feature is keyboard operable with visible focus, including the highlighter popover (Tab, number keys 1–9, Esc).
- Semantic landmarks, labeled fields, `aria-live` for async feedback such as copy confirmations and failed moves.
- Responsive down to 360px. The application kit must stay usable in a narrow side window.
- Respect `prefers-reduced-motion`.
