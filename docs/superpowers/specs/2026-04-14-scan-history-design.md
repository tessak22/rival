# Scan History Design

**Date:** 2026-04-14  
**Status:** Approved

## Goal

Give users a browsable history of all scans for any competitor page type (homepage, blog, careers, pricing, etc.) at `/[slug]/history`, so they can see what changed over time and read previous versions of extracted data.

## Route

`/[slug]/history?type=<page-type>`

- Default `type` is `homepage` when no param is set
- URL is shareable and bookmarkable
- Lives at `app/[slug]/history/page.tsx`

## Data Fetching

Server Component — fetches directly via Prisma, same pattern as `app/[slug]/page.tsx`.

```ts
// Fetch all scans for pages of the selected type for this competitor
const scans = await prisma.scan.findMany({
  where: {
    page: {
      competitorId: competitor.id,
      type: selectedType
    }
  },
  include: { page: true },
  orderBy: { scannedAt: "desc" },
  take: 90  // ~3 months of daily scans
})
```

No new API route needed.

## Page Layout

```
← Back to [Competitor]                          [Competitor name] — Scan History

[Homepage] [Pricing] [Blog] [Careers] [Changelog] [Docs] [Social] [Reviews]  ← type filter tabs

──────────────────────────────────────────────────────────────
Apr 14, 2026  •  CHANGED                        [diff summary text here]
  ▼ (expanded — shows rawResult fields as key/value or markdownResult)

Apr 13, 2026  •  NO CHANGE
  ▼ (collapsed by default)

Apr 12, 2026  •  CHANGED                        Added 3 new pricing tiers
  ▼

...
──────────────────────────────────────────────────────────────
```

## Components & Files

| File | Action | Purpose |
|---|---|---|
| `app/[slug]/history/page.tsx` | Create | Server Component — data fetching, layout, type tab filter |
| `app/[slug]/history/ScanEntry.tsx` | Create | Client Component — expand/collapse per scan entry |
| `app/globals.css` | Modify | Add `.history-*` styles for timeline, entries, badges |

### `page.tsx` responsibilities
- Resolve competitor from `slug` param (same as existing `[slug]/page.tsx`)
- Read `type` search param, default to `"homepage"`
- Fetch up to 90 scans for that competitor + type
- Render the page type filter tabs as links (`/[slug]/history?type=X`)
- Render back-link to `/{slug}`
- Render list of `<ScanEntry>` components

### `ScanEntry.tsx` responsibilities
- Receives a single scan record
- Shows date, changed/no-change badge, diff summary (if changed)
- Expand/collapse to reveal full scan data
- For `markdownResult` scans (changelog type): renders markdown as-is
- For `rawResult` scans: renders key/value pairs from the JSON object
- No fetch, no side effects — pure display

## Page Type Filter Tabs

Tabs are generated from the distinct page types that exist for the competitor's pages (not hardcoded). Clicking a tab navigates to `?type=<type>`. The active tab is highlighted.

## Scan Entry Display

Each entry in the timeline:

```
┌─────────────────────────────────────────────────────┐
│ Apr 14, 2026 at 6:04am    ● CHANGED                 │
│ "Added new 'Teams' pricing tier at $299/mo"          │
│                                               [▼ View] │
└─────────────────────────────────────────────────────┘
```

When expanded (via `<details>` HTML element — no JS needed for toggle):
- If `rawResult` exists: renders each top-level key as a labeled row
- If only `markdownResult` exists: renders the markdown in a `<pre>` block
- If neither: shows "No data captured for this scan"

## Change Badge Logic

| Condition | Badge |
|---|---|
| `hasChanges === true` | green `CHANGED` chip |
| `hasChanges === false` | muted `NO CHANGE` chip |
| `hasChanges` is null/unknown | muted `UNKNOWN` chip |

`diffSummary` is shown inline next to the badge when present and `hasChanges === true`.

## Back Link

```tsx
<Link href={`/${slug}`} className="back-link">← {competitor.name}</Link>
```

Reuses the existing `.back-link` CSS class.

## Empty State

If no scans exist for the selected type:
```
No scans yet for this page type. Scans run daily at 6am UTC.
```

## CSS Classes Added to globals.css

```
.history-page          — page wrapper, max-width, padding
.history-type-tabs     — tab row container
.history-type-tab      — individual tab link
.history-type-tab--active — active tab style
.history-timeline      — list of scan entries
.history-entry         — single scan entry (details element)
.history-entry-summary — the always-visible header row (summary element)
.history-entry-date    — timestamp column
.history-entry-badges  — badge + diff summary column
.history-entry-body    — expanded content area
.history-kv            — key/value table for rawResult
.history-kv-key        — key cell
.history-kv-value      — value cell
```

## Out of Scope

- Side-by-side diff view between two snapshots (future)
- Filtering by date range (future)
- Pagination beyond 90 entries (future)
- Highlighting specific changed fields within rawResult (future)
