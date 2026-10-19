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
