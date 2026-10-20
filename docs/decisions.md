# Architecture and Implementation Decisions

## Authentication Rate Limiting
- **Decision**: In-memory rate limiting counter for login attempts (5 failures from one IP in 15 minutes triggers HTTP 429).
- **Rationale**: Single-user deployment on serverless. An in-memory map keyed by client IP tracks failure timestamps. Note: as standard on serverless functions, state is maintained per function instance and resets when the function instance is recycled.

## AI Model Selection
- **Decision**: Default model configured as `claude-3-5-haiku-20241022`.
- **Rationale**: Fast, economical, and highly accurate at structured JSON extraction.

## HTML Sanitization
- **Decision**: Use `sanitize-html` with an allowlist permitting standard formatting tags (`p`, `br`, `b`, `i`, `strong`, `em`, `ul`, `ol`, `li`, `h1`-`h6`, `blockquote`, `code`, `pre`, `a[href]`) and stripping script, style, inline event handlers, and dangerous protocols.

## Deno 2 and Netlify Dev Compatibility
- **Decision**: Disable `edgeFunctions` dev emulation in `@astrojs/netlify` adapter configuration and automatically remove the `--allow-scripts` flag in `scripts/patch-deno.js` via `npm postinstall`.
- **Rationale**: Local machines running Deno 2.x fail when Netlify's dev emulator passes the invalid `--allow-scripts` flag to `deno eval` (which in Deno 2 is restricted to `deno install`). Since this application uses standard Netlify Serverless Functions (Node.js) rather than Edge Functions, disabling edge function emulation in dev eliminates the issue while keeping production SSR behavior intact.

## Board Drag and Drop
- **Decision**: Native HTML5 drag events in a Preact island (`src/components/Board.tsx`) instead of SortableJS. Each card also has a status `<select>` for keyboard and touch users; select moves append the card to the end of the target column.
- **Rationale**: No extra dependency, and the select covers keyboard operability (native HTML5 drag does not fire on touch devices). Moves are optimistic and roll back with an `aria-live` announcement if the API call fails.

## Board Ordering
- **Decision**: `board_order` is fractional. A drop computes the midpoint between the neighboring cards' orders (`src/lib/board/order.ts`) and sends `{ status, boardOrder }` to `POST /api/jobs/:id/reorder`, so only the moved row is written.
- **Rationale**: Double precision allows dozens of repeated inserts into the same gap before precision becomes an issue, far beyond typical single-user use. No rebalancing is implemented.

## Timezone Handling
- **Decision**: "Today" (overdue checks, due-today, dashboard) is computed in `config.app.timezone`. Event `datetime-local` inputs are interpreted as wall-clock time in that timezone and stored as UTC (`src/lib/dates.ts`). The API also accepts ISO datetimes with an offset.
- **Rationale**: Serverless functions run in UTC; using the server clock would mark actions overdue several hours early for US users.

## Upcoming Interviews
- **Decision**: Events of type `screen` or `interview` with a future `occurred_at` are pinned at the top of the timeline (soonest first) and shown on the dashboard. Other future-dated events stay in the normal reverse-chronological list.

## List Sorting
- **Decision**: Filters and sort are query-string parameters (`sort`, `dir`). Sorting runs in app code after the filtered query because match score is computed from config, not stored. Empty values (no salary, no next action) sort last in both directions.
- **Rationale**: A single user's job count is small enough that in-memory sorting is negligible.

## Event Forms Without JavaScript
- **Decision**: Add, edit and delete event forms are plain HTML form posts. Because forms can only `POST`, `POST /api/events/:id` accepts a `_method` field of `PATCH` or `DELETE`; `PATCH` and `DELETE` are also available as JSON endpoints.

## Event Markdown
- **Decision**: Event bodies are rendered with `marked` and sanitized with `sanitize-html` (`src/lib/markdown.ts`). Links get `rel="noopener noreferrer"`, and `h1`/`h2` are demoted to `h4`.

## Status Validation
- **Decision**: Job `status` is validated against config stage ids in the Zod schemas. Jobs whose status was later removed from config are not shown on the board but still appear in the list view and can be moved to a valid stage from the detail page.

## sanitize-html Version Pin
- **Decision**: `sanitize-html` is pinned to exactly `2.17.5`.
- **Rationale**: Releases from 2.17.6 on depend on `htmlparser2@12`, which is ESM-only, while `sanitize-html` itself is CommonJS and loads it with `require()`. That fails with `ERR_REQUIRE_ESM` in the Netlify function runtime. 2.17.5 uses `htmlparser2@10`, which ships a CommonJS build. Before unpinning, confirm a newer release works with `node --no-experimental-require-module -e "require('sanitize-html')"`.

## Description Text Model (built in Phase 3, shared with Phase 5)
- **Decision**: `description_text` is always the output of `walkText()` (`src/lib/highlights/walk.ts`) over the sanitized description HTML. Rules: ASCII whitespace collapses to one space; leading spaces are dropped at the start, after a line break, or after a space; block elements and `<br>` produce a single `\n`; script/style content is ignored. The walker uses only standard DOM properties, so the Phase 5 island can run the same code over the rendered description.
- **Decision**: Descriptions are sanitized on save (`prepareDescription()`), and the text is derived from the result. Plain-text input becomes `<p>`/`<br>` HTML first. A text-only edit regenerates the HTML only when the text actually changed, so formatted HTML survives saving other fields. Stored HTML is also re-sanitized on output, which covers rows written before this existed.
- **Rationale**: The print job sheet needs highlights rendered as `<mark>`, so the server-side renderer (`renderHighlightedHtml()`) was built now. Highlights whose quote no longer matches their offsets are returned as orphaned and not rendered; Phase 5 adds re-anchoring.

## Highlight Category Colors
- **Decision**: Category colors come from `tracker.config.ts`. `Layout.astro` emits `.hl-<id> { --hl-bg: <color> }`, and marks use `background-color: var(--hl-bg)`. Category ids are validated as CSS-safe (`[a-z0-9_-]`) in the config schema. Marks have no horizontal padding so a highlight split across elements doesn't add gaps inside words.

## Print Views
- **Decision**: `print.css` is loaded with `<link media="print">`. It hides `.app-header`, nav, `.no-print`, buttons, forms and selects (not every `<header>`, since the sheets use header blocks). It forces `print-color-adjust: exact` on marks and category swatches, which prints colors even when "Background graphics" is off.
- **Decision**: `print.includeNotes` controls whether highlight notes and timeline event bodies appear on the prep sheet. The prep sheet timeline lists upcoming interviews first, then history oldest to newest.
- **Verification**: Checked with Playwright print-media emulation in Chrome and Firefox (computed mark colors, no visible UI chrome) and a Chrome PDF render.

## Application Kit
- **Decision**: Reordering uses Move up/Move down buttons rather than drag and drop: fully keyboard operable and usable in a 400px side window. Focus stays on the moved item's button. `POST /api/profile/reorder` rejects (409) a list that doesn't exactly match the section's current items.
- **Decision**: `profile.sections` in config must be a subset of the five sections that have schemas (`links`, `work`, `education`, `answers`, `snippets`).
- **Decision**: Work `end` accepts `YYYY-MM` or "Present". Education dates are optional. "Copy bullets" appears only on work items, since education has no bullets field. "Copy entry" uses `- ` bullets; "Copy bullets" strips bullet characters and numbering.
- **Decision**: Copy uses `navigator.clipboard.writeText` and falls back to a hidden textarea with `execCommand('copy')`. Results are announced through one `aria-live` region for the page.
- **Decision**: Form fields show errors after they've been edited and left, or after a submit attempt. Blurring an untouched empty field stays quiet, so an error appearing doesn't shift the Save button out from under the pointer.

## Export and Import
- **Decision**: The export is one JSON file (`format: "job-tracker-export"`, `version: 1`) with every table's rows. Import is a merge: rows are upserted by id, skills are matched to existing skills by name, and jobs are matched to existing jobs by URL, so a file from another instance doesn't collide on unique constraints. Nothing is deleted.
- **Decision**: Import always runs a server-side plan first (validation, id remapping, create/update counts). The Settings page shows that dry-run summary before committing. The commit re-plans and applies everything atomically: one Neon HTTP `batch` (a single transaction), or `db.transaction` on other drivers.
- **Decision**: Export/import functions take the database as a parameter. Integration tests run them against PGlite (in-memory Postgres) with the committed migrations: round trip into an empty database, idempotent re-import, merging, and rollback on failure.
- **Note**: The import body is sent to a serverless function. Very large exports may exceed Netlify's function request size limit; check the current limit in the Netlify docs if that happens.
