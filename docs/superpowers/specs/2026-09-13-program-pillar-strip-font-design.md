# Program Pillar Strip Font & Grouped Card Design

**Status:** Approved design direction; implementation pending.

## Evidence and target

Production browser inspection establishes the current rendered families:

- Kinerja heading and KPI values: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif`.
- Five-card nominal values: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`.

The target is the production KPI system sans, not Manrope. The reference screenshots are visual evidence only:

- `C:\Users\xrunc\AppData\Local\Temp\codex-clipboard-1ffe7328-6b5f-400b-9830-93708a603cab.png`
- `C:\Users\xrunc\AppData\Local\Temp\codex-clipboard-2dcc2974-5dfd-41d7-91de-0513d9bd8688.png`

## Typography rules

- Use Tailwind `font-sans` as the single global UI sans stack, matching the production computed family.
- Remove the `next/font/local` Manrope setup and the competing `body` font-family declaration. Use Tailwind's default system `font-sans` as the sole global UI sans, with `font-sans tabular-nums antialiased` on the body.
- Use `font-black` (900) and `tracking-tight` for user-facing KPI and financial values.
- Keep tabular numerals for readable alignment; do not introduce a second display font.
- Reserve `font-mono` for technical identifiers only: transaction numbers, file numbers, NIK/provider references, sub-program codes, and similar IDs. Do not use it for nominal, percentage, beneficiary, date, or impact metrics.

## Grouped five-pillar strip

- Keep all five programs in DOM order: Tangerang Cerdas, Tangerang Makmur, Tangerang Sehat, Tangerang Takwa, Tangerang Peduli.
- Keep the existing tab semantics, keyboard navigation, API-backed data overlay, icons, colors, and sparklines.
- Present the cards as one grouped strip on desktop. Tangerang Sehat remains the selected/default item and receives a slightly wider visual treatment plus the existing selected border/top accent/check indicator.
- At narrow widths, allow intentional horizontal overflow/scroll of the grouped strip when a two-column stack would weaken comparison. Preserve all five items and keyboard reachability.
- Do not change the detail panel content or the selected program's data behavior as part of this visual pass.

## Acceptance criteria

1. Heading and KPI values on the Program page compute to the same sans family as the production reference.
2. Card nominal values use the same system sans family as KPI values, with weight 900 and tight tracking; no user-facing metric in the Program page uses `font-mono`.
3. Only technical identifiers retain monospace styling.
4. Five cards remain accessible tabs in the same order; Sehat is selected on first render.
5. Desktop shows a coherent grouped strip; narrow view remains usable without clipping or losing a card.
6. Existing tests, typecheck, production build, and visual QA pass.
