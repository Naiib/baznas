# Laporan Penyaluran — Balanced Desktop Layout

## Goal

Remove the tall, disconnected right sidebar on the report page so the desktop view remains visually dense, balanced, and easy to scan when a selected category contains only one report.

## Approved Direction

Use a full-width report library as the primary workspace. Place the three secondary insights below it in a responsive grid: program allocation, asnaf composition, and report readiness. On desktop the cards use three equal columns; on smaller widths they progressively become two columns and then one column.

## Interaction and Content

- Keep the existing category selector, search, report rows, PDF, and Excel actions unchanged.
- Keep the existing KPI strip and report data unchanged.
- Keep the period selector and create-report button unchanged.
- Replace the fixed, wide status bar with a compact bottom-right toast that closes automatically after a short delay and can be dismissed.
- Keep the readiness card visually distinct with an amber surface, but within the same grid system as the other two insight cards.

## Layout Rules

- Do not use a persistent desktop right rail for insight cards.
- The report library must span the available page width above the insight grid.
- Insight panels must have similar visual weight and no intentional empty canvas below the report rows.
- Use the existing white, zinc, emerald, violet, and amber design tokens; no new image assets or dependencies.
- Respect `motion-reduce` for toast transitions and preserve semantic landmarks and accessible labels.

## Verification

- Existing category selection, search, and export feedback tests remain green.
- Add a regression test that verifies the library and all three insight headings are rendered as sibling workspace sections.
- Build the Next.js app and confirm `/penyaluran/laporan` remains statically generated.
