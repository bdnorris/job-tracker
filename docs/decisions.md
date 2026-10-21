# Architecture and Implementation Decisions

## Authentication Rate Limiting
- **Decision**: In-memory rate limiting counter for login attempts (5 failures from one IP in 15 minutes triggers HTTP 429).
- **Rationale**: Single-user deployment on serverless. An in-memory map keyed by client IP tracks failure timestamps. Note: as standard on serverless functions, state is maintained per function instance and resets when the function instance is recycled.

## AI Model Selection
- **Decision**: Default model is `claude-haiku-5-5` (the current small Claude model), configurable in `scraper.ai.model`.
- **Rationale**: Extraction is a single structured-output call on short text, so the small, fast model fits both cost and the request time budget. The call uses `output_config.effort: "low"` to keep latency down.

## HTML Sanitization
- **Decision**: Use `sanitize-html` with an allowlist permitting standard formatting tags (`p`, `div`, `br`, `b`, `i`, `strong`, `em`, `ul`, `ol`, `li`, `h1`-`h6`, `blockquote`, `code`, `pre`, `a[href]`) and stripping script, style, inline event handlers, and dangerous protocols.

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

## Extraction Time Budget and AI Follow-up
- **Decision**: One extraction request has a wall-clock budget, `scraper.requestBudgetMs` (default 9000). The page fetch gets at most `fetchTimeoutMs` and always leaves time for the ATS APIs. AI runs only if at least 4s of the budget remain. Otherwise the response sets `aiPending: true`, and the review form calls `POST /api/extract/ai` with the text and fields it already has, so the page isn't fetched twice.
- **Rationale**: Netlify's docs pages I could reach (Oct 2026) don't state the synchronous function limit. Netlify staff on the support forum describe a 10s default, raisable to 26s on request. With a higher limit, raise `requestBudgetMs` and AI will usually run in the first request.
- **Decision**: "Re-run with AI" calls `POST /api/extract?force=ai` (spec). When the text is already in the form, it goes straight to `/api/extract/ai` with `force: true`, again to avoid a refetch. Fields the user edited are never overwritten.

## ATS Extractors (verified against live public APIs, 2026-10-21)
- **Greenhouse**: `GET boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?pay_transparency=true`. Handles `boards.greenhouse.io` and `job-boards.greenhouse.io` URLs, `embed/job_app?for=&token=`, and company pages with `?gh_jid=` plus a Greenhouse embed script naming the board. `content` arrives HTML-entity-encoded and is decoded with the `entities` package. `pay_input_ranges` have no period, so it's inferred from the range's title/blurb and then from the amount's size. EU-hosted boards (`job-boards.eu.greenhouse.io`) aren't mapped to an API host and fall through to JSON-LD/heuristic.
- **Lever**: `GET api.lever.co/v0/postings/{site}/{id}` (`api.eu.lever.co` for EU postings). The description is assembled from `description`, each `lists[]` entry as a heading plus list, and `additional`. `salaryRange.interval` is like `per-year-salary`; one-time and weekly amounts are ignored.
- **Ashby**: there's no single-posting endpoint, so the board (`posting-api/job-board/{board}?includeCompensation=true`) is fetched and the job matched by `id`. Salary is the `Salary` summary component (`interval` like `1 YEAR`).
- **Company names**: neither the Lever nor the Ashby API returns one. The hosted pages' JSON-LD usually does. If nothing does, the URL slug is title-cased as a fallback, labeled "(check this)" in the review form, with a warning.

## Extraction Merge Rules
- **Decision**: Fields are taken from the first extractor in `scraper.order` that returns a valid value, and each field is validated on its own (an invalid value is dropped with a warning). Skills are the union of every extractor's skills plus config skills found in the final description, normalized to canonical names via config aliases. Skill aliases of one or two characters (`ts`, `Go`) match only as written in config or in all caps.
- **Decision**: In `fillGapsOnly` mode, AI runs when title, company or description, salary, or skills are still missing.

## Salary Parser
- **Decision**: `src/lib/extract/salary.ts` reads ranges and single values with a currency symbol or code before or after, `k` suffixes (a trailing `k` applies to both ends: "$120-150k"), and period words. A number counts only with a currency marker or a salary keyword nearby. It skips 401k, numbers followed by million/billion or headcount words, implausible amounts for the period, and ranges whose top is more than 5× the bottom. When several candidates exist, the one with a currency, a keyword and a range wins. With no period words, amounts under 300 are hourly and larger ones yearly.

## SSRF Protection
- **Decision**: User-supplied URLs are fetched with `node:http(s)` and a custom DNS `lookup` that rejects hostnames resolving to any loopback, private, link-local, CGNAT, multicast, unique-local, NAT64 or IPv4-mapped-private address. The check happens inside the socket's lookup, so the connection uses exactly the address that was checked, with no DNS-rebinding window. Connection pooling is disabled (`agent: false`) so every connection goes through the check. Literal IPs, `localhost`/`.local`/`.internal`, non-http(s) schemes and URLs with credentials are rejected up front. Redirects are followed manually (max 5) and every hop is re-validated. Responses are capped at 2 MB for pages and 8 MB for ATS JSON.

## Duplicate URLs
- **Decision**: Posting URLs are normalized on save and on lookup: fragment removed, tracking parameters (`utm_*`, `gh_src`, `lever-source`, …) removed, host lowercased, trailing slash removed. Existing rows aren't rewritten; the lookup also matches the raw and trailing-slash spellings. `/api/extract` reports a duplicate up front, and saving one still redirects to the existing job.

## AI Extractor
- **Decision**: `@anthropic-ai/sdk` `messages.parse` with a Zod structured-output schema in which every field is required but nullable, so the model must answer null rather than guess. `output_config.effort: "low"`, `maxRetries: 0`, and a timeout equal to the remaining budget. The system prompt tells the model to treat the posting as untrusted data and ignore instructions in it. Each returned field is re-validated and invalid ones are dropped with a warning. Refusals, truncation, auth errors, rate limits and timeouts become warnings; Claude Haiku has no server-side refusal fallback.
- **Decision**: The AI step only ever sees readable text (the extracted description, the pasted text, or the page's text), truncated to `scraper.ai.maxInputChars`. It never receives HTML.

## Review Form Provenance
- **Decision**: The add-job form saves `fieldSources` for every field with a value. A field the user edits is recorded as `manual`. `source` is the extractor that supplied the most fields. `scraped_at` is set when anything came from extraction. Editing the description text drops the extracted HTML so the saved text and HTML can't disagree.

## Highlighter: Orphans Without a Schema Change
- **Decision**: A highlight is "orphaned" exactly when its stored quote no longer matches `description_text` at its offsets. That's computed at render time, so the `highlights` table needs no extra column. When a description changes, `updateJob` re-anchors every highlight (`src/lib/highlights/anchor.ts`): an exact match at the old offsets is kept; otherwise each occurrence of the quote is scored by how much of the stored 32-character prefix/suffix matches, with distance from the old position as a tie-breaker; then a whitespace-tolerant match is tried (edits often turn a line break into a space). Highlights that can't be placed keep their row and appear under "Needs review" with Re-select and Delete.

## Highlighter: One Renderer, Client and Server
- **Decision**: `applyHighlights()` and `pointToOffset()` (`src/lib/highlights/marks.ts`) use only standard DOM APIs and run on both linkedom (server rendering, print, tests) and the browser island. The island re-applies marks to the unmarked normalized HTML after every change. On mount, it checks that the browser's DOM walks to the same text the server stored; if it doesn't, creating highlights is disabled with a message. The server also re-verifies every quote against `description_text` (409 on mismatch).
- **Decision**: Document order and containment are computed by walking the tree (`childNodes`, parent chain) instead of `compareDocumentPosition`/`contains`, which linkedom implements incorrectly (and its doctype node has no `nextSibling`).
- **Decision**: Rows saved before descriptions were normalized (raw pasted text, unsanitized HTML) are normalized when the first highlight is created or re-selected, re-anchoring any existing highlights, so offsets always index into what the page renders.

## Highlighter: Interaction
- **Decision**: Selecting text in the description (mouse, or keyboard with caret browsing) opens the popover, as does a "Highlight selection" button that keeps the current selection. Number keys 1–9 pick a category (not while typing in the note), Tab moves through the categories, and Esc closes. Focus moves into the popover when it opens (in a layout effect, so an immediate key press reaches it) and returns to whatever opened it. If that opener was re-rendered (a category change moves a sidebar item to another group), focus goes to that highlight's new Edit button.
- **Decision**: Controls in the popover use `aria-disabled` rather than `disabled`, because disabling the focused button drops focus to `<body>`. The same fix was applied to the board's status select (focus also follows the card to its new column) and the application kit's Move buttons (at the top or bottom, focus moves to the opposite Move button).
- **Decision**: Clicking a mark edits the innermost highlight at that spot; an enclosing highlight is editable by clicking where it isn't covered, or from the sidebar. Marks are not tab stops (a long description would have dozens). The sidebar's Edit buttons are the keyboard path to every highlight.
- **Decision**: The category filter toggles a `hl-hide-<id>` class on the description; generated CSS sets that category's `--hl-bg` to transparent, so a hidden inner mark lets an enclosing highlight's color show through. The sidebar's quotes are `#hl-<id>` links, so they work without JavaScript too.
