# Job Tracker: Build Spec

Oct 18, 2026 · @Brian Norris

## Overview

Build a single-user, open-source job tracking board: a CRUD app for job postings with URL extraction, notes and interview tracking, a description highlighter, print views, and an "application kit" of copyable profile data.

**Goals**

- Track jobs through a configurable pipeline (board and list views).
- Paste a job URL (or raw text) and get title, company, salary, skills and description extracted for review.
- Log notes, interviews and status changes per job as a timeline.
- Highlight parts of a job description by category, with optional notes.
- Print clean job sheets and interview prep sheets.
- Store work history, education and common application answers with one-click copy buttons.
- Ship as a public repo that contains zero personal data. Anyone can deploy their own instance.

**Non-goals (v1)**

- Multi-user accounts, teams, or sharing.
- Browser extension, email integration, or calendar sync.
- Resume generation or auto-applying to jobs.
- Scraping sites that block server fetches (LinkedIn, Indeed). These use the paste-text fallback.

**Instructions for the coding agent**

- Build in the phase order in Build phases. Finish each phase's acceptance criteria before starting the next.
- Where this spec is silent, choose the simplest option that fits the stack and note the decision in `docs/decisions.md`.
- Never commit real personal data, secrets, or scraped postings. Test fixtures must be scrubbed or synthetic.
- Verify current package versions and APIs against official docs before installing; do not rely on memory for version-specific APIs.

## Tech stack

Astro 7 in server output mode on Netlify, with Neon Postgres accessed through Drizzle ORM.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Astro 7 | `output: 'server'`. Astro DB is deprecated; do not use it. |
| Hosting | Netlify | `@astrojs/netlify` adapter. Functions run API routes and SSR pages. |
| Database | Neon Postgres | Connect via plain `DATABASE_URL`. Works with a direct Neon account or Netlify DB. |
| DB driver | `@neondatabase/serverless` | HTTP driver for serverless functions. |
| ORM and migrations | Drizzle ORM + `drizzle-kit` | SQL migrations committed in `/drizzle`. |
| Islands | Preact (`@astrojs/preact`) | Only for interactive parts: board drag and drop, highlighter, copy buttons, forms with live validation. |
| Styling | Plain CSS with custom properties | Global tokens in `src/styles/tokens.css`. Separate `print.css`. No CSS framework required. |
| Validation | Zod | Shared schemas for API input, extractor output and config. |
| HTML parsing | `linkedom` or `cheerio` | Server-side only, for JSON-LD and heuristic extraction. |
| Readable content | `@mozilla/readability` | Isolates main content from page chrome. |
| Sanitizing | `sanitize-html` | All stored description HTML is sanitized with an allowlist. |
| AI (optional) | `@anthropic-ai/sdk` | Only loaded when `ANTHROPIC_API_KEY` is set. |
| Testing | Vitest; Playwright for a small e2e smoke suite |  |
| Language | TypeScript, strict mode |  |

Node version: match Netlify's current default LTS and pin it in `.nvmrc` and `netlify.toml`.

## Repo structure and configuration

All behavior is configured in one file, `tracker.config.ts`; all secrets live in `.env`; all personal data lives only in the database.

```text
/
├─ tracker.config.ts        # the only custom config file
├─ .env.example             # committed; .env is gitignored
├─ drizzle/                 # generated SQL migrations (schema only)
├─ drizzle.config.ts
├─ netlify.toml
├─ scripts/
│  ├─ seed.ts               # synthetic demo data only
│  └─ hash-password.ts      # prints a hash for APP_PASSWORD_HASH
├─ src/
│  ├─ config/               # loads + validates tracker.config.ts with Zod
│  ├─ db/                   # schema.ts, client.ts, queries/
│  ├─ lib/
│  │  ├─ auth/
│  │  ├─ extract/           # extractor pipeline (see Extraction)
│  │  ├─ highlights/
│  │  └─ export/            # JSON export/import
│  ├─ components/           # .astro + Preact islands
│  ├─ layouts/
│  ├─ pages/                # routes + /api endpoints
│  ├─ middleware.ts         # auth guard
│  └─ styles/               # tokens.css, base.css, print.css
├─ tests/
│  ├─ fixtures/             # scrubbed or synthetic HTML postings
│  └─ e2e/
└─ docs/decisions.md
```

### tracker.config.ts

Export a typed object via a `defineConfig()` helper. Validate it at startup with Zod and fail fast with a readable error. Every key has a default so the file works unedited.

```ts
export default defineConfig({
  app: { name: 'Job Tracker', timezone: 'America/Chicago', currency: 'USD' },
  pipeline: {
    stages: [
      { id: 'saved', label: 'Saved' },
      { id: 'applied', label: 'Applied' },
      { id: 'screening', label: 'Screening' },
      { id: 'interviewing', label: 'Interviewing' },
      { id: 'offer', label: 'Offer' },
      { id: 'rejected', label: 'Rejected', closed: true },
      { id: 'withdrawn', label: 'Withdrawn', closed: true },
    ],
    defaultStage: 'saved',
  },
  highlights: {
    categories: [
      { id: 'requirement', label: 'Requirement', color: '#fde68a' },
      { id: 'nice', label: 'Nice to have', color: '#bbf7d0' },
      { id: 'redflag', label: 'Red flag', color: '#fecaca' },
      { id: 'perk', label: 'Perk', color: '#bfdbfe' },
      { id: 'keyword', label: 'Resume keyword', color: '#e9d5ff' },
    ],
  },
  skills: {
    // canonical name -> aliases; used for heuristic extraction and match scoring
    list: { JavaScript: ['js', 'javascript'], TypeScript: ['ts'], Astro: [], React: ['react.js', 'reactjs'] },
  },
  scraper: {
    order: ['greenhouse', 'lever', 'ashby', 'jsonld', 'heuristic', 'ai'],
    fetchTimeoutMs: 8000,
    userAgent: 'JobTracker/1.0 (+https://github.com/<owner>/<repo>)',
    ai: { model: 'claude-haiku-latest-placeholder', fillGapsOnly: true, maxInputChars: 30000 },
  },
  profile: {
    sections: ['links', 'work', 'education', 'answers', 'snippets'],
  },
  print: { showUrls: true, includeNotes: true },
});
```

The AI model string is a placeholder; the agent should set it to a current small Anthropic model ID from the docs.

### .env.example

```bash
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
SESSION_SECRET=           # 32+ random bytes, base64
APP_PASSWORD_HASH=        # from: npm run hash-password
ANTHROPIC_API_KEY=        # optional; enables AI extraction
```

### Open-source hygiene rules

- `.env`, `.env.*` (except `.env.example`), local exports and any `*.local.*` files are gitignored.
- Migrations contain schema only. Never insert personal data in a migration.
- `scripts/seed.ts` inserts only synthetic data (fake companies like "Example Corp", fake profile).
- Test fixtures are synthetic or fully scrubbed of names, emails and IDs.
- Include a "Deploy to Netlify" button and setup instructions in the README.

## Authentication

Single user, single password: every route except `/login` and static assets requires a valid session cookie.

- `APP_PASSWORD_HASH` holds a hash produced by `npm run hash-password` (use `node:crypto` scrypt or argon2; no plaintext passwords anywhere).
- `POST /api/auth/login` verifies the password with a constant-time comparison, then sets an HMAC-signed session cookie using `SESSION_SECRET`: `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day expiry.
- `POST /api/auth/logout` clears the cookie.
- `src/middleware.ts` checks the cookie on every request. Unauthenticated page requests redirect to `/login?next=<path>`; unauthenticated API requests return 401 JSON.
- Rate limit login attempts: after 5 failures from one IP in 15 minutes, return 429. An in-memory counter is acceptable; note in `docs/decisions.md` that it resets per function instance.
- All mutating API routes check `Origin` against the site URL to block CSRF.
- No user table. If `APP_PASSWORD_HASH` is missing, the app shows a setup page explaining how to set it instead of booting open.

## Data model

Six tables, defined in `src/db/schema.ts` with Drizzle; all ids are UUIDs, all timestamps `timestamptz`.

**jobs**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk |  |
| url | text, nullable | Original posting URL. Unique when not null. |
| title | text, required |  |
| company | text, required |  |
| location | text | Free text. |
| remote\_type | enum: remote, hybrid, onsite, unknown | Default unknown. |
| salary\_min, salary\_max | integer, nullable | Whole currency units. |
| salary\_currency | text | Default from config. |
| salary\_period | enum: year, month, hour |  |
| description\_html | text | Sanitized snapshot. Never re-fetched automatically. |
| description\_text | text | Plain text derived from the HTML. Highlight offsets index into this. |
| source | text | Extractor that supplied most fields, or `manual`. |
| field\_sources | jsonb | Map of field name to extractor name. |
| status | text | Must be a stage id from config. Validated in app code, not a DB enum, so stages stay configurable. |
| priority | smallint 0 to 3 | Default 1. |
| board\_order | double precision | Sort position within a status column. |
| next\_action | text, nullable | e.g. "Follow up with recruiter". |
| next\_action\_date | date, nullable |  |
| applied\_at | timestamptz, nullable | Set automatically the first time status moves to `applied`. |
| archived\_at | timestamptz, nullable | Soft archive. |
| scraped\_at, created\_at, updated\_at | timestamptz |  |

**skills**: `id`, `name` (unique, canonical).

**job\_skills**: `job_id`, `skill_id`, composite pk, both cascade on delete.

**highlights**

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk |  |
| job\_id | uuid fk, cascade |  |
| start\_offset, end\_offset | integer | Character offsets into `jobs.description_text`. |
| quote | text | The exact highlighted text, for verification and re-anchoring. |
| prefix, suffix | text | Up to 32 chars of context on each side. |
| category | text | Category id from config. |
| note | text, nullable |  |
| created\_at | timestamptz |  |

**events** (timeline for notes, interviews and status changes)

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk |  |
| job\_id | uuid fk, cascade |  |
| type | enum: note, applied, status\_change, screen, interview, offer, rejection, follow\_up, other |  |
| occurred\_at | timestamptz | When it happened or is scheduled. |
| title | text |  |
| body | text | Markdown, rendered sanitized. |
| contact\_name, contact\_email, contact\_role | text, nullable |  |
| meta | jsonb | e.g. `{ "from": "applied", "to": "screening" }` for status changes. |
| created\_at, updated\_at | timestamptz |  |

**profile\_items** (application kit)

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk |  |
| section | text | One of config `profile.sections`. |
| sort\_order | double precision |  |
| data | jsonb | Shape depends on section; validated by Zod schemas listed in Feature specs. |
| created\_at, updated\_at | timestamptz |  |

**Indexes**: `jobs(status, board_order)`, `jobs(next_action_date)`, `events(job_id, occurred_at)`, `highlights(job_id)`, `profile_items(section, sort_order)`.

**Migrations and seed**

- `npm run db:generate` runs `drizzle-kit generate`; `npm run db:migrate` applies migrations. Generated SQL is committed.
- Migrations run automatically in the Netlify build command before `astro build`.
- `npm run db:seed` inserts about 8 synthetic jobs across stages, with events, highlights and a fake profile. Refuse to run if the `jobs` table already has rows, unless `--force` is passed.

## Feature specs

Five user-facing areas: board and list, add job, job detail with timeline, application kit, and print views.

### Board and list views

- **Board** (`/`): one column per non-closed config stage, plus a collapsible "Closed" group for closed stages. Cards show title, company, salary range, remote type, top 3 matched skills, and next action date (red when overdue).
- Drag and drop between and within columns (Preact island; SortableJS or native drag events). Dropping persists `status` and `board_order` via `PATCH /api/jobs/:id`. Status changes create a `status_change` event automatically. Must also be operable by keyboard: a status select on each card is acceptable.
- **List** (`/jobs`): sortable table with filters for status, remote type, salary min, skill, text search (title, company, description), and "has overdue next action". Filters live in the query string so views are bookmarkable.
- **Match score**: percent of the job's skills that appear in config `skills.list`. Show on cards and in the list.
- Archived jobs are hidden by default with a toggle to show them.

### Add job flow (`/jobs/new`)

1. User pastes a URL or switches to a "Paste text" tab.
2. `POST /api/extract` runs the extraction pipeline and returns merged fields, `fieldSources`, and warnings.
3. A review form shows every field pre-filled, each with a small label naming its source (e.g. "from JSON-LD"). Empty required fields are highlighted.
4. If AI is enabled, a "Re-run with AI" button calls `POST /api/extract?force=ai`.
5. Saving creates the job, its skills, and an initial event. If the URL already exists, warn and link to the existing job instead of creating a duplicate.
6. Manual entry (skip extraction) is always available.

### Job detail (`/jobs/:id`)

- Header: title, company, location, remote type, salary, status select, priority, next action and date, link to original posting, applied date.
- Tabs or sections: Description (with highlighter), Highlights sidebar, Timeline, Skills.
- **Edit** mode for every field, including the description. If the description text changes, run highlight re-anchoring (see Highlighter).
- **Timeline**: reverse-chronological events. "Add event" form with type, date/time, title, body (markdown), and optional contact fields. Edit and delete events. Upcoming interviews (future `occurred_at`) are pinned at the top.
- Actions: archive, delete (with confirmation), print job sheet, print prep sheet.

### Dashboard strip

Above the board, show counts per stage, number of applications in the last 7 and 30 days, and a list of overdue or due-today next actions and upcoming interviews.

### Application kit (`/profile`)

Sections from config `profile.sections`, each a sortable list of items with add, edit, delete, and reorder. Zod schemas per section:

| Section | Fields |
| --- | --- |
| links | label, value (URL, email, phone, address, anything) |
| work | company, title, location, start (YYYY-MM), end (YYYY-MM or "Present"), summary, bullets\[\] |
| education | school, credential, field, location, start, end, notes |
| answers | question, answer (e.g. work authorization, relocation, salary expectations, years of experience) |
| snippets | label, body (reusable cover letter or "why us" text) |

- Every field value has a copy button. Each work and education item also has "Copy entry" (formatted plain text) and "Copy bullets" (one per line, no bullet characters).
- Copy uses `navigator.clipboard.writeText` with a fallback, then shows a brief "Copied" state on the button and announces it via an `aria-live` region.
- Optimized for side-by-side use with an application form: compact layout, works at 400px wide.

### Print views

- `print.css` loaded with `media="print"`. Hide nav, buttons, forms, popovers and drag handles. Use `print-color-adjust: exact` so highlight colors print.
- When `print.showUrls` is true, print `href` after external links.
- **Job sheet** (`/jobs/:id/print`): header block plus full description with highlights rendered as `<mark>`.
- **Prep sheet** (`/jobs/:id/prep`): header block, highlights grouped by category with their notes, matched and missing skills, timeline, and contacts. Avoid page breaks inside each group.
- Both routes auto-open the print dialog only when `?print=1` is present.

### Export and import

- `GET /api/export` downloads all data as one versioned JSON file.
- `POST /api/import` accepts that file, validates it with Zod, and upserts in a transaction. Show a dry-run summary before committing.

## Extraction pipeline

Extraction is a configurable chain of independent extractors whose results are merged field by field; AI is one optional extractor and the app works fully without it.

### Interface (`src/lib/extract/types.ts`)

```ts
export interface ExtractedJob {
  title?: string;
  company?: string;
  location?: string;
  remoteType?: 'remote' | 'hybrid' | 'onsite';
  salary?: { min?: number; max?: number; currency?: string; period?: 'year' | 'month' | 'hour' };
  skills?: string[];
  descriptionHtml?: string;
  descriptionText?: string;
}

export type ExtractInput =
  | { kind: 'url'; url: string; html?: string }
  | { kind: 'text'; text: string };

export interface Extractor {
  name: string;
  enabled(): boolean;
  canHandle(input: ExtractInput): boolean;
  extract(input: ExtractInput, ctx: ExtractContext): Promise<ExtractedJob | null>;
}

export interface ExtractResult {
  job: ExtractedJob;
  fieldSources: Partial<Record<keyof ExtractedJob, string>>;
  warnings: string[];
  attempted: { name: string; ok: boolean; ms: number; error?: string }[];
}
```

### Runner (`src/lib/extract/run.ts`)

1. For URL input, fetch the page once (timeout from config, custom User-Agent, follow redirects, max 2 MB) and pass the HTML to every extractor via `input.html`. A failed fetch is a warning, not an error; ATS API extractors can still run.
2. Walk `config.scraper.order`. Skip extractors where `enabled()` or `canHandle()` is false.
3. Merge: a field is set by the first extractor that returns a non-empty value for it. Record that extractor in `fieldSources`. `skills` is the exception: union from all extractors, then normalize to canonical names via config aliases.
4. The `ai` extractor runs only if required fields (title, company, descriptionText) or salary or skills are still missing, when `fillGapsOnly` is true. With `?force=ai` it runs regardless and its values override earlier ones.
5. Always post-process: sanitize `descriptionHtml`, derive `descriptionText` from it with consistent whitespace normalization (the same function is used by the highlighter), and validate the result with Zod.
6. Never throw to the client. Return whatever was found plus `warnings` and `attempted`.

### Extractors

| Name | Handles | Method |
| --- | --- | --- |
| greenhouse | Greenhouse board URLs | Parse board token and job id from the URL, call the public Greenhouse job board API. |
| lever | Lever posting URLs | Parse company and posting id, call the public Lever postings API. |
| ashby | Ashby posting URLs | Use Ashby's public job posting API for the org. |
| jsonld | Any HTML | Find `script[type="application/ld+json"]` blocks, locate `@type: JobPosting` (including inside `@graph`), map `title`, `hiringOrganization.name`, `jobLocation`, `jobLocationType`, `baseSalary`, `description`. |
| heuristic | Any HTML or text | Readability for main content; `<title>` and `og:` tags for title; regex salary parser; skills matched from config list with word boundaries and aliases; remote type from keywords. |
| ai | Any, only if `ANTHROPIC_API_KEY` set | Send readable text (truncated to `maxInputChars`) with a strict JSON-only instruction; parse and validate with Zod; discard invalid fields rather than failing. |

The agent must verify each ATS endpoint shape against current public docs before implementing, and keep each extractor in its own file with its own fixture tests.

### Salary parser requirements

Handle at minimum: `$120,000 - $150,000`, `$120k–$150k`, `$120K to $150K per year`, `$60/hr`, `$60 - $75 an hour`, `USD 120000-150000`, `£50,000`, a single value like `$130,000`. Normalize `k` suffixes. Infer period from words (year, annually, hour, hr, month). Ignore numbers that are clearly not salary (e.g. 401k, employee counts) by requiring a currency marker or salary keyword nearby.

### Limits and safety

- Only `http` and `https` URLs. Reject private, loopback and link-local IPs after DNS resolution to prevent SSRF.
- Keep total extraction under Netlify's synchronous function limit; verify the current limit in Netlify docs. If AI pushes past it, document moving AI to a second request from the review form.
- Paste-text input is capped at 100k characters.

## Highlighter

Highlights are stored as character offsets into `description_text` with quote and context for verification, and rendered server-side as `<mark>` elements so they work without JS and in print.

### Offset model

- `description_text` is produced by one shared function, `htmlToText()`, that walks the sanitized description HTML's text nodes in document order with deterministic whitespace normalization.
- The client island must compute offsets with the same walk over the rendered description container, so DOM positions map exactly to `description_text` offsets. Unit test that both sides agree on fixtures.

### Creating a highlight

1. User selects text inside the description container. Selections that cross outside the container are clamped to it; empty or whitespace-only selections are ignored.
2. A small popover appears near the selection with one button per config category (color swatch plus label) and an optional note field. Keyboard: the popover is focusable, categories reachable by Tab, number keys 1 to 9 pick categories, Esc closes.
3. On pick, `POST /api/jobs/:id/highlights` with `start_offset`, `end_offset`, `quote`, `prefix`, `suffix`, `category`, `note`. The server verifies `description_text.slice(start, end) === quote` and rejects mismatches.
4. The island re-renders the marks without a full page reload.

### Rendering

- Server builds the description HTML with `<mark class="hl hl-<category>" data-id="…">` wrapped around each range, splitting marks across element boundaries as needed.
- Overlapping highlights are allowed. Overlapping regions nest marks; the innermost (shortest) range's color shows. Each mark is still individually clickable.
- Category colors come from config as CSS custom properties, with sufficient contrast for dark text in both light and dark themes.
- Clicking a mark opens a popover to change category, edit the note, or delete.

### Sidebar

- Lists highlights grouped by category in config order, each showing the quote (truncated) and note. Clicking scrolls to and briefly flashes the mark.
- "Copy all" per category copies quotes as plain lines; useful for pasting requirements into resume tailoring.
- Filter toggles per category hide or show marks in the description.

### Re-anchoring after description edits

When `description_text` changes, for each highlight: if the quote still matches at its offsets, keep it; otherwise search for the quote using prefix and suffix context and update offsets to the best match; if not found, mark it orphaned (keep the row, show it in the sidebar under "Needs review" with options to delete or re-select).

## Routes and API

Pages are server-rendered Astro routes; the API is JSON under `/api`, validated with Zod, returning `{ error: { code, message, fields? } }` on failure.

**Pages**

| Route | Purpose |
| --- | --- |
| `/login` | Password form |
| `/` | Dashboard strip + board |
| `/jobs` | List view with filters |
| `/jobs/new` | Add job (URL, paste text, or manual) |
| `/jobs/:id` | Job detail, highlighter, timeline |
| `/jobs/:id/edit` | Edit job fields and description |
| `/jobs/:id/print` | Printable job sheet |
| `/jobs/:id/prep` | Printable interview prep sheet |
| `/profile` | Application kit |
| `/settings` | Read-only view of active config, enabled extractors, export/import |

**API**

| Method and path | Purpose |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout` | Session |
| `POST /api/extract` | Body `{ url }` or `{ text }`; query `force=ai` optional. Returns `ExtractResult`. |
| `GET /api/jobs` | Query params match list filters |
| `POST /api/jobs` | Create job with skills |
| `GET /api/jobs/:id` | Job with skills, highlights, events |
| `PATCH /api/jobs/:id` | Partial update; status change logs an event and sets `applied_at` if applicable |
| `DELETE /api/jobs/:id` | Hard delete with cascade |
| `POST /api/jobs/:id/reorder` | `{ status, boardOrder }` for drag and drop |
| `POST /api/jobs/:id/highlights` | Create highlight |
| `PATCH /api/highlights/:id`, `DELETE /api/highlights/:id` | Update or delete |
| `POST /api/jobs/:id/events` | Create event |
| `PATCH /api/events/:id`, `DELETE /api/events/:id` | Update or delete |
| `GET /api/profile` | All items grouped by section |
| `POST /api/profile`, `PATCH /api/profile/:id`, `DELETE /api/profile/:id` | Item CRUD, validated per section |
| `POST /api/profile/reorder` | `{ section, ids[] }` |
| `GET /api/export`, `POST /api/import` | Backup and restore |

Forms should work as progressive enhancement where practical: plain HTML form posts for create and edit, with islands adding inline behavior.

## Build phases

Five phases, each deployable; a phase is done only when every acceptance criterion is checked.

### Phase 1: Foundation

Scaffold Astro 7 + Netlify adapter + Preact, config loader, Drizzle schema and migrations, auth, seed, manual job CRUD, base layout and tokens.

- [ ] Fresh clone + `.env` + `npm run db:migrate` + `npm run dev` works with no other edits.
- [ ] Invalid `tracker.config.ts` fails at startup with a readable message.
- [ ] All routes except `/login` require a session; API returns 401 JSON when signed out.
- [ ] Jobs can be created, edited, archived and deleted manually.
- [ ] Netlify deploy succeeds with migrations running in the build.
- [ ] Repo contains no personal data; `git grep` for the owner's name and email returns nothing.

### Phase 2: Board, list and timeline

- [ ] Board renders config stages; drag and drop persists across reloads; keyboard status change works.
- [ ] Status changes create `status_change` events and set `applied_at` once.
- [ ] List view filters and sorting reflect in the URL.
- [ ] Events can be added, edited and deleted; upcoming interviews pin to the top.
- [ ] Dashboard strip shows stage counts, recent application counts, overdue actions and upcoming interviews.

### Phase 3: Application kit and print

- [ ] All five profile sections support add, edit, delete and reorder with per-section validation.
- [ ] Every field copies correctly; "Copy entry" and "Copy bullets" produce clean plain text.
- [ ] Copy confirmation is announced to screen readers.
- [ ] Job sheet and prep sheet print cleanly in Chrome and Firefox with no UI chrome and with highlight colors.
- [ ] Export downloads all data; import round-trips it into an empty database.

### Phase 4: Extraction

- [ ] Greenhouse, Lever, Ashby, JSON-LD and heuristic extractors each pass fixture tests.
- [ ] Salary parser passes every format listed in the spec plus negative cases.
- [ ] With no `ANTHROPIC_API_KEY`, the AI extractor is skipped silently and the flow still completes.
- [ ] With a key, AI fills only missing fields by default; "Re-run with AI" overrides.
- [ ] Review form shows per-field source labels and flags missing required fields.
- [ ] Duplicate URLs are detected; SSRF protections reject private addresses.

### Phase 5: Highlighter

- [ ] Selections create highlights with correct offsets, verified server-side.
- [ ] Marks render without JS and print with colors.
- [ ] Overlapping highlights render and are individually editable.
- [ ] Sidebar groups, filters, scrolls to marks and copies per category.
- [ ] Editing the description re-anchors highlights or marks them as needing review.
- [ ] Popover is fully keyboard operable.

## Quality, accessibility and README

Unit tests cover the pure logic, a small e2e suite covers the main flows, and the README must let a stranger deploy their own instance in under 15 minutes.

### Testing

- **Vitest unit tests**: each extractor against fixtures, salary parser, skill normalization, merge logic, `htmlToText()`, highlight offset rendering and re-anchoring, config validation, Zod schemas.
- **Integration**: API routes against a Neon branch or local Postgres, using a test database URL from `.env.test` (gitignored).
- **Playwright smoke suite**: log in, add a job manually, drag it to Applied, add an event, create a highlight, copy a profile field, open the print view.
- CI via GitHub Actions: typecheck, lint, unit tests on every push.

### Accessibility and UX baseline

- WCAG 2.1 AA contrast in light and dark themes (`prefers-color-scheme`).
- All interactive features usable by keyboard, with visible focus styles.
- Semantic landmarks, labeled form fields, `aria-live` for async feedback.
- Responsive down to 360px; application kit usable in a narrow side window.
- Respect `prefers-reduced-motion`.

### README contents

1. What it is, with screenshots taken from seed data.
2. Deploy to Netlify button.
3. Setup: create a Neon project (or use Netlify DB), set env vars, generate the password hash, run migrations, optional seed.
4. Customizing `tracker.config.ts`, with each key explained.
5. Optional AI extraction: what it does, cost expectations, how to enable.
6. Which job sites extract well and which need the paste-text fallback.
7. Backup and restore via export/import.
8. Contributing: adding a new extractor (interface, fixture, test).
9. License (MIT unless the owner chooses otherwise).
