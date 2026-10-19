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
