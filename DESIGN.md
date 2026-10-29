---
name: Job Tracker
description: A single-owner job search tracker set as a gate board, with an ink departures band over pass cards on panel grey.
colors:
  ink: "#0b0d10"
  ink-hover: "#2b3038"
  slate: "#1c2127"
  shell-line: "#2e343c"
  shell-text: "#f4f5f6"
  shell-muted: "#a6acb4"
  shell-danger: "#ff7b6e"
  panel-grey: "#e6e8eb"
  pass-white: "#ffffff"
  stub-grey: "#f1f2f4"
  hairline: "#cdd1d6"
  steel-line: "#868d96"
  text-secondary: "#3a4048"
  steel: "#565d66"
  alert-yellow: "#ffd400"
  alert-wash: "#fff6cc"
  overdue-red: "#c0271a"
  overdue-red-deep: "#9c1f14"
  overdue-wash: "#fdecea"
  overdue-border: "#ef9a92"
  caution-amber: "#8a5a00"
  go-green: "#1c6e36"
  go-wash: "#e4f2e8"
  night-ground: "#121519"
  night-pass: "#1b1f25"
  night-raised: "#252a31"
  night-stub: "#161a1f"
  night-hairline: "#2f353d"
  night-steel-line: "#59606a"
  night-rule: "#c9ced4"
  night-text: "#eef0f2"
  night-text-secondary: "#bcc1c8"
  night-steel: "#949ba4"
  night-alert-wash: "#3a3206"
  night-overdue-wash: "#3b1512"
  night-overdue-border: "#8a2a22"
  night-go-green: "#5fcf86"
  night-go-wash: "#12301d"
  night-shell: "#07080a"
  night-shell-raised: "#16191e"
  night-shell-line: "#262b32"
typography:
  display-clock:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "3.5rem"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  display-count:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "2.75rem"
    fontWeight: 500
    lineHeight: 0.95
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter Tight Variable, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter Tight Variable, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter Tight Variable, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\" 1, \"cv11\" 1"
  body-sm:
    fontFamily: "Inter Tight Variable, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.3
  data:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.04em"
  button:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  label:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.12em"
  label-pass:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.625rem"
    fontWeight: 500
    letterSpacing: "0.12em"
rounded:
  sm: "2px"
  md: "4px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0.45rem 1rem"
    height: "2.25rem"
  button-hover:
    backgroundColor: "{colors.stub-grey}"
  button-active:
    backgroundColor: "{colors.alert-yellow}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.pass-white}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0.45rem 1rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-danger:
    backgroundColor: "{colors.overdue-wash}"
    textColor: "{colors.overdue-red}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-danger-hover:
    backgroundColor: "{colors.overdue-red}"
    textColor: "{colors.pass-white}"
  button-sm:
    typography: "{typography.label}"
    padding: "0.25rem 0.6rem"
    height: "1.75rem"
  input:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.45rem 0.7rem"
    height: "2.25rem"
  badge:
    backgroundColor: "{colors.stub-grey}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.15rem 0.45rem"
  skill-tag:
    textColor: "{colors.steel}"
    rounded: "{rounded.sm}"
    padding: "0.05rem 0.4rem"
  match-badge-high:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.pass-white}"
    rounded: "{rounded.sm}"
    padding: "0.15rem 0.35rem"
  pass-card:
    backgroundColor: "{colors.pass-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.7rem 0.8rem 0.75rem"
  pass-stub:
    backgroundColor: "{colors.stub-grey}"
    padding: "0.65rem 0.8rem 0.75rem"
  pass-stub-lit:
    backgroundColor: "{colors.alert-yellow}"
    textColor: "{colors.ink}"
  departures-row-now:
    backgroundColor: "{colors.alert-yellow}"
    textColor: "{colors.ink}"
  now-chip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.alert-yellow}"
    typography: "{typography.data}"
    rounded: "{rounded.sm}"
    padding: "0.1rem 0.4rem"
  nav-link:
    textColor: "{colors.shell-muted}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.75rem"
  nav-link-hover:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.shell-text}"
  nav-link-active:
    backgroundColor: "{colors.shell-text}"
    textColor: "{colors.ink}"
  closed-rail:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.shell-text}"
    rounded: "{rounded.md}"
    width: "3.5rem"
---

# Design System: Job Tracker

## Overview

**Creative North Star: "The Gate Board"**

The tracker reads like an airport gate: an ink departures band answers "what leaves next" in one ranked, time-ordered panel, and each job below it is a printed pass that moves from gate to gate. It is dense, factual and quiet until something is due. Then one yellow light comes on. The owner uses it every day, so the system optimises for scanning speed over friendliness: monospace tabular data, uppercase tracked labels, 1px ink rules and almost no ornament.

Structure comes from rules and material, not from shadows or colour blocks. The shell (header and departures band) stays ink in both themes. Everything below it sits on panel grey, with white pass surfaces in light mode and dark slate passes in dark mode. Colour carries meaning only: yellow means "now" (due today, active, just moved, selected text), red means overdue, and nothing else gets a hue. The world deliberately rejects the category default of soft white kanban cards under a row of stat tiles.

Scope: this pass restyled the board home (`/`), its departures band and the app shell that every route inherits. The other pages (job detail, list, add job, application kit/profile, settings, and the print job and prep sheets) inherit these tokens, the shell, and the base button/input/badge styles, but they have not been individually restyled into the Gate Board vernacular yet. When restyling them, extend from this document rather than from their current page-local CSS.

**Key Characteristics:**
- Ink shell and departures band in both themes, with panel-grey ground and white passes below
- One alert yellow for "now"; red only for overdue
- Inter Tight for reading text; JetBrains Mono for every label, date, time, count and amount
- 2–4px corners, 1px ink rules, dashed perforations with punched notches
- A moved pass glides to its new slot and stays lit until the next interaction

## Colors

A near-monochrome ink-and-grey palette with exactly one signal colour for "now" and one for "late".

### Primary
- **Gate Ink** (ink): the system's primary. Shell and departures background, body text, 1px rules around passes and buttons, primary button fill, high-match badge, focus ring in light mode. "Primary" in this world is ink, not a brand hue.
- **Ink Lift** (ink-hover): hover fill for primary buttons.

### Secondary
- **Departures Yellow** (alert-yellow): the "now" signal. It lights the due-today row in the departures table, the due-today date chip on a pass, the stub of a just-moved pass, the pressed state of a default button, the drop indicator, text selection, the skip link, the brand mark's middle bar, and the focus ring on ink surfaces and in dark mode. Text on yellow is always Gate Ink.
- **Yellow Wash** (alert-wash, night-alert-wash): tint used for a column under a drag and for warning backgrounds.

### Tertiary
- **Overdue Red** (overdue-red light; shell-danger on ink and in dark mode): overdue dates, the overdue status in the departures table, and the "Overdue" NEXT line on a pass. Also the destructive-action colour (danger button text and hover fill, with overdue-red-deep as its hover in light mode).
- **Overdue Wash / Border** (overdue-wash, overdue-border; night variants): resting fill and stroke of the danger button and error surfaces.
- **Caution Amber** and **Go Green** (caution-amber, go-green, go-wash; night variants): status feedback on inherited pages (warnings, success messages). Not used on the board.

### Neutral
- **Slate** (slate): raised surfaces inside the shell: departures panel heads, nav hover, closed-rail hover.
- **Shell Line** (shell-line): 1px dividers and panel borders inside the ink band.
- **Shell Text / Shell Muted** (shell-text, shell-muted): primary and secondary text on ink. Shell Text is also the active nav pill fill.
- **Panel Grey** (panel-grey): the page ground under the board, and the colour punched through the pass notches.
- **Pass White** (pass-white): pass and input surfaces.
- **Stub Grey** (stub-grey): the pass stub below the perforation, badge fill, default button hover.
- **Hairline** (hairline): segment dividers inside a pass, badge borders.
- **Steel Line** (steel-line): input borders, perforation dashes, unmatched skill-tag dashes, empty-column outline.
- **Text Secondary / Steel** (text-secondary, steel): secondary text and the muted label voice. The contract proposed #6b7178 for steel; the build darkened it to steel (#565d66) for AA on panel grey, and the build wins.
- **Night set** (night-ground, night-pass, night-raised, night-stub, night-hairline, night-steel-line, night-rule, night-text, night-text-secondary, night-steel, night-shell, night-shell-raised, night-shell-line): the `prefers-color-scheme: dark` remap. In dark mode the "ink" roles invert: rules, primary button fill and primary text become night-rule/night-text, the shell drops to night-shell, and focus becomes Departures Yellow.

### Named Rules
**The One Light Rule.** Departures Yellow means "now" and nothing else: due today, just moved, pressed, selected, focused on ink. Never use it for decoration, branding or emphasis. If two unrelated things on screen are yellow, one of them is wrong.

**The Red Is Late Rule.** Red appears only for overdue items and destructive actions. It never marks a stage, a category or an ordinary error-free state.

**The Ink Shell Rule.** The header and departures band are ink in both themes. They do not invert with the OS theme; only the ground below them does.

**The Config Colour Rule.** Highlight category colours come from `tracker.config.ts` and are injected at runtime as `--hl-bg` per category, always with dark text (#1e293b) on top. Never hard-code a category hue.

## Typography

**Display Font:** JetBrains Mono Variable (with ui-monospace, SFMono-Regular, Menlo fallback), self-hosted via @fontsource-variable
**Body Font:** Inter Tight Variable (with -apple-system, Segoe UI, Roboto fallback), self-hosted via @fontsource-variable
**Label/Mono Font:** JetBrains Mono Variable

**Character:** A gate board pairing. Inter Tight carries anything a person reads as language (role titles, action text, company names), condensed enough to stay dense. JetBrains Mono carries anything that is a code, a time, a count or a label, so columns of data line up and the board reads like printed signage.

### Hierarchy
- **Display Clock** (500, 3.5rem, 0.95, -0.04em, mono): the next interview's clock time in the departures band. One per screen.
- **Display Count** (500, 2.75rem, 0.95, -0.03em, mono): pipeline stage counts in the departures tiles; the 7/30-day window counts step down to 1.75rem in Shell Muted.
- **Headline** (700, 1.375rem, -0.02em, sans): page title ("Board"), followed by a mono uppercase count.
- **Title** (650, 0.9375rem, 1.25, -0.01em, sans): pass titles; also the next-interview title at 1rem/600.
- **Body** (400, 1rem, 1.45, sans, tabular figures and cv11 on): base text. Tables and secondary lines use 0.875rem; pass segment values and action text use **Body Small** (0.8125rem).
- **Data** (500, 0.8125rem, 0.04em, mono, uppercase): departures dates and status, pass due dates (0.6875rem), pay values (0.75rem, no wrap).
- **Button** (600, 0.75rem, 0.08em, mono, uppercase): all `.btn` labels; Sign Out uses the same voice at 0.6875rem.
- **Label** (500, 0.6875rem, 0.12em, mono, uppercase): column heads, panel heads (600), table headers, the `.label` utility. **Label Pass** (0.625rem) is the FROM / PAY / MODE / NEXT segment voice inside a pass.

### Named Rules
**The Mono Data Rule.** Every date, time, count, percentage, amount and column label is set in JetBrains Mono. Names, titles and sentences are never set in mono.

**The Tracked Caps Rule.** Mono labels are uppercase and tracked (0.12em for labels, 0.08em for buttons and tile captions, 0.04em for data). Sans text is never uppercase.

## Layout

The page is a full-bleed ink band followed by a contained board. Content is capped at 1520px (`--max-width`) with 1.5rem side padding (1rem under 860px). The sticky header is 52px tall.

The departures band is a three-area grid: pipeline tiles (up to 23rem), the next-actions table (flexible), and the interview panel (260px–22rem), with 1rem/1.25rem gaps. Under 960px the areas stack; under 720px the departures table drops its header row and each row becomes a two-column grid (date and status on top, action and job below).

The board is a horizontal grid of open-stage columns (`minmax(250px, 1fr)`, 1rem gap) plus a trailing Closed rail, scrolling horizontally when it overflows. Columns scroll their cards vertically in place so every stage stays in view. Under 640px columns become 240px–85% wide so the next column peeks in. The Closed rail is a 3.5rem vertical button; opening it appends the closed stages as extra columns.

Spacing runs on a 4px base, used mostly at 4/8/12/16/20/24px. Density is high: pass internals use 0.6–0.8rem padding and 0.6rem gaps; cards stack 0.75rem apart.

The header nav wraps to a full-width, horizontally scrolling second row under 860px.

## Elevation & Depth

The system is flat. Depth comes from 1px rules, the ink/grey/white material split, and the perforation, not from shadows. Hover on a pass thickens its ink rule (a 1px ring added to the 1px border) instead of lifting it. Shadows exist only for floating layers on inherited pages (for example the highlighter popover).

### Shadow Vocabulary
- **Float Small** (`box-shadow: 0 1px 2px 0 rgb(11 13 16 / 0.06)`): reserved for small floating chrome.
- **Float Medium** (`box-shadow: 0 4px 10px -2px rgb(11 13 16 / 0.14)`): popovers and menus.
- **Float Large** (`box-shadow: 0 12px 28px -6px rgb(11 13 16 / 0.28)`): dialogs and large overlays.
Dark mode deepens all three to pure black at 0.4/0.5/0.6 alpha.

### Named Rules
**The Rules Not Shadows Rule.** Structure is drawn with 1px lines: ink around passes and buttons, hairline between segments, shell line inside the band, a 2px ink rule under column heads. Do not add shadows to cards, panels or tiles.

## Shapes

Corners are nearly square: 2px for chips, badges, skill tags and the drop indicator, 4px for passes, buttons, inputs, panels, nav pills and the Closed rail. Nothing is pill-shaped on the board.

The signature silhouette is the pass. A thin 2px dashed perforation in Steel Line separates the pass body from its stub, and two half-circle notches (7px radius, filled with the page ground and ringed in ink) are punched into the left and right edges at the perforation. Dashed strokes elsewhere mean "not yet" or "empty": unmatched skill tags, empty columns, and the divider above the interview meta line. Solid strokes mean "confirmed": matched skill tags are solid ink.

## Components

### Buttons
Printed, uppercase and square-shouldered, like counter signage.
- **Shape:** gently squared corners ({rounded.md}), 1px ink border, 2.25rem minimum height (1.75rem for small).
- **Default:** Pass White fill, ink text and border, mono uppercase 0.75rem/600 tracked 0.08em.
- **Primary:** Gate Ink fill and border with white text (inverts to light ink with dark text in dark mode).
- **Danger:** Overdue Wash fill, red text, Overdue Border stroke; hover fills solid red with white text.
- **Hover / Focus / Active:** default hover fills Stub Grey; primary hover lifts to Ink Lift. Pressing a default button lights it Departures Yellow. Focus is a 2px outline at 2px offset in the focus colour (ink in light, yellow in dark and on ink surfaces). Transitions are 150ms on colour only.

### Chips
- **Badge:** Stub Grey fill, hairline border, mono 0.6875rem, 2px corners. Column counts reuse the badge class stripped to bare mono text.
- **Skill tag:** mono 0.6875rem, 2px corners; unmatched skills are dashed Steel Line with Steel text, matched skills are solid ink with primary text.
- **Match badge:** mono 0.6875rem/700 percentage; a 50%+ match fills solid ink with white text, lower matches are outlined.
- **Now chip:** in the departures table, "TODAY" is set as yellow text on an ink chip inside the lit yellow row.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** Pass White (Night Pass in dark) for passes; ink for departures panels with a Slate head strip.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** 1px ink for passes, 1px Shell Line for departures panels and tiles.
- **Internal Padding:** 0.7–0.8rem for passes, 1rem for departures panels.
- **Departures tiles:** a gap-1px grid on a Shell Line background so the tiles share hairlines like a split-flap board; count above, mono caption below.

### Inputs / Fields
- **Style:** Pass White fill, 1px Steel Line border, 4px corners, 2.25rem min height (2rem for the pass status select).
- **Select:** native appearance removed; a 12px chevron SVG (ink in light, light ink in dark) sits 0.6rem from the right.
- **Focus:** border goes ink plus a 1px ink ring; keyboard focus adds the 2px focus outline.
- **Disabled:** the pass status select uses `aria-disabled` during a pending move (never `disabled`, which would drop focus); the pass fades to 75%.

### Navigation
- **Style:** ink header, 52px tall and sticky. Brand is a three-bar gate mark (white, yellow, short white) and the app name in mono uppercase 0.8125rem/700 tracked 0.14em.
- **Links:** Inter Tight 0.875rem/500 in Shell Muted, 4px pill padding 0.4rem 0.75rem. Hover fills Slate with Shell Text. The active page is a solid Shell Text pill with ink text.
- **Add Job:** outlined in Shell Line with a drawn 11px plus icon.
- **Sign Out:** mono uppercase ghost button at the far right.
- **Mobile:** under 860px the nav wraps to its own scrolling row below the brand.

### Departures Table (signature)
The ranked "Next actions due" panel: DATE / ACTION / JOB / STATUS columns, one line per departure with ellipsis truncation (full text in the link and title). Overdue rows keep the ink background and turn their date and status Shell Danger with a days-late count. Due-today rows are lit: the whole row fills Departures Yellow with ink text, and the status shows the ink "TODAY" chip. The panel head carries the current date and time in mono.

### Interview Clock (signature)
The next interview's time is the largest type on screen (Display Clock), with the day in mono caps beside it, the event title, company and role below, and a dashed-ruled meta line (type, "Tomorrow" / "In N days"). Later interviews list beneath as date / title / company rows.

### Pass Card (signature)
A boarding pass per job. Top: a six-dot drag handle, the role title and the match badge. Then labelled segments: FROM (company) spans the full width, PAY (mono) and MODE sit side by side divided by a hairline. Up to three skill tags follow. Below the notched perforation, the Stub Grey stub holds the NEXT line (action text plus a mono date: red when overdue, a yellow chip when due today) and the status select.

**Lit state:** when a pass is moved (by drag or by the status select) it glides from its old slot to the new one with a 460ms FLIP translate on `cubic-bezier(0.16, 1, 0.3, 1)`, gains a 2px ink outline at 1px offset, and its stub fills Departures Yellow. It stays lit until the next pointer or key interaction outside that card. Reduced motion skips the glide but keeps the light. A failed move un-lights and reverts.

**Drag feedback:** the dragged pass fades to 40%; the target column fills Yellow Wash with a 1px ink ring; a 3px yellow drop indicator with an ink ring marks the insertion point.

### Closed Rail
An ink vertical button at the end of the board: chevron, mono closed count, and a vertical "CLOSED" label. Opening it appends the closed stages as columns, whose passes print in greyscale with Steel Line borders.

## Do's and Don'ts

### Do:
- **Do** keep the header and departures band ink (#0b0d10 / #07080a) in both themes, and put everything else on panel grey with white passes.
- **Do** reserve Departures Yellow (#ffd400) for "now": due today, just moved, pressed, selected, or focus on ink. Text on it is always Gate Ink.
- **Do** set every date, time, count, amount and label in JetBrains Mono; uppercase and track labels at 0.12em.
- **Do** draw structure with 1px rules and keep corners at 2px or 4px.
- **Do** use the dashed perforation with punched notches for any pass-like object that has a body and a stub.
- **Do** keep moved items lit until the next interaction, and keep the glide behind `prefers-reduced-motion`.
- **Do** read stage names, highlight colours and skills from `tracker.config.ts`; never hard-code them.

### Don't:
- **Don't** use yellow for decoration, branding accents or headings, and don't use red for anything other than overdue or destructive.
- **Don't** add drop shadows to passes, panels, tiles or columns; shadows are for floating layers only.
- **Don't** round corners beyond 4px or use pill-shaped chips and buttons on the board.
- **Don't** fall back to soft white kanban cards under a row of generic stat tiles; that is the category default this world replaces.
- **Don't** set names, titles or sentences in mono, or uppercase sans text.
