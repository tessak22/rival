# Positioning Matrix — Design Spec
_Issue #70 · 2026-04-22_

## What we're building

A `/matrix` page that renders all tracked competitors as a 2×2 quadrant scatter plot. Axes are configured in `rivals.config.json`. Scores are extracted by the LLM during brief generation and persist in the existing `intelligence_brief` JSON column. Users can download the chart as an SVG.

---

## Data model

### New fields in `BRIEF_SCHEMA` (`lib/tabstack/generate.ts`)

Five numeric scores added to the existing brief schema. No database migration required — scores persist in the existing `intelligence_brief` JSONB column.

| Field | Range | Description |
|---|---|---|
| `openness_score` | 0–10 | 0 = fully open source / transparent / no lock-in; 10 = fully proprietary / closed / high lock-in |
| `brand_trust_score` | 0–10 | 0 = low brand recognition / trust; 10 = high brand recognition / trust |
| `pricing_score` | 0–10 | 0 = entirely free; 10 = premium / enterprise pricing only |
| `market_maturity_score` | 0–10 | 0 = emerging / early-stage; 10 = established / mature |
| `feature_breadth_score` | 0–10 | 0 = narrow specialist; 10 = broad generalist |

Scores are produced by the LLM as part of every brief generation cycle. Old briefs that predate this change will not have these fields — the matrix page handles missing scores gracefully (excludes the competitor from the plot, shows a "re-run brief" hint).

---

## Config

New `matrix` block in `rivals.config.json`:

```json
"matrix": {
  "x_axis": {
    "key": "openness_score",
    "label_low": "Open Source",
    "label_high": "Proprietary"
  },
  "y_axis": {
    "key": "brand_trust_score",
    "label_low": "Low Trust",
    "label_high": "High Trust"
  },
  "quadrant_labels": {
    "top_left": "Trusted OSS",
    "top_right": "Established Leaders",
    "bottom_left": "Emerging Players",
    "bottom_right": "Niche Specialists"
  }
}
```

`quadrant_labels` is optional — if omitted, defaults ship per axis key combination (the default axes use the labels above).

`key` must match one of the five scored dimensions. Defaults ship with the project so it works out of the box without any config change. Users swap axes by editing the config — no UI needed.

**Valid keys:** `openness_score`, `brand_trust_score`, `pricing_score`, `market_maturity_score`, `feature_breadth_score`

**Default config:**
- x_axis: `openness_score` (Open Source ↔ Proprietary)
- y_axis: `brand_trust_score` (Low Trust ↔ High Trust)

---

## Pages & components

### `app/matrix/page.tsx`
Server component. Reads all non-self competitors with `intelligenceBrief` populated. Reads matrix config from `rivals.config.json`. Passes axis config and competitor plot points to `PositioningMatrix`. Handles empty state (< 2 competitors with scores).

> Note: The existing `app/compare/` directory (currently a `.gitkeep`) is renamed to `app/matrix/`.

### `components/matrix/PositioningMatrix.tsx`
SVG chart component. Renders:
- 4 quadrant backgrounds with subtle separating lines
- Competitor dots positioned by their axis scores (0–10 mapped to SVG coordinate space)
- Competitor name labels next to each dot
- Axis labels at the four edges (low/high for each axis)
- Quadrant labels sourced from config `quadrant_labels`, with hardcoded defaults for the default axis key combination
- An `id` on the SVG element for the download button to reference

### `components/matrix/MatrixDownloadButton.tsx`
Client component. Gets a ref to the SVG element, serializes it as a Blob, and triggers a native browser download as `rival-matrix.svg`. No library needed.

---

## Nav

Add "Matrix" link to the nav in `app/layout.tsx`, consistent with existing nav items.

---

## Empty states

- Fewer than 2 competitors have brief data → show message with a "Run briefs" hint
- Competitors exist but none have the matrix score fields (old briefs) → show message with a "Re-generate briefs" hint
- The matrix plots only competitors with both axis scores present; others are silently excluded

---

## Out of scope

Per issue #70:
- Logo/icon rendering on dots (plain labeled dots only)
- Animated transitions when axes change
- Drag-to-reposition manual overrides
- Mobile layout (stretch goal, not required)

---

## File changes

| File | Change |
|---|---|
| `lib/tabstack/generate.ts` | Add 5 scores to `BRIEF_SCHEMA` and `BRIEF_EXPECTED_FIELDS` |
| `lib/config/rival-config.ts` | Add `matrix` block to config type with defaults |
| `app/compare/` → `app/matrix/` | Rename directory |
| `app/matrix/page.tsx` | New server component page |
| `components/matrix/PositioningMatrix.tsx` | New SVG chart component |
| `components/matrix/MatrixDownloadButton.tsx` | New download button client component |
| `app/layout.tsx` | Add Matrix to nav |
| `notes-local/tabstack-dx-notes.md` | DX notes (required per CLAUDE.md) |
