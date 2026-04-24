# Demo Multi-Surface Scan — Design Spec

**Date:** 2026-04-24
**Status:** Approved

---

## Problem

The demo currently scans one URL and returns one schema's worth of data. The full site scans 8–10 pages per competitor and synthesizes an intelligence brief. A visitor pasting a root URL gets a single homepage schema dump — nowhere near the competitive dossier the product actually produces.

---

## Goal

When a user pastes a root URL into the demo, automatically discover and scan up to 4 surfaces in parallel, stream each result as it lands, then synthesize a 3-field intelligence brief via `/generate`. One URL in → competitive dossier out.

Non-root URL scans (e.g. `/pricing`, `/blog`) retain the current single-page behavior.

---

## Trigger Condition

Multi-surface scanning activates only when `inferPageTypeFromUrl()` returns `"homepage"` — i.e., the URL is a bare root domain with no path. Specific-page URLs skip multi-surface entirely.

---

## Auto-Discovered Surfaces

From the root URL, 4 paths are scanned in parallel:

| Surface | Path attempted | Schema used |
|---|---|---|
| Homepage | `{base}/` | `HOMEPAGE_SCHEMA` |
| Pricing | `{base}/pricing` | `PRICING_SCHEMA` |
| Blog | `{base}/blog` | `BLOG_SCHEMA` |
| Careers | `{base}/careers` | `CAREERS_SCHEMA` |

Pages that 404, time out individually, or return empty results are silently dropped — no errors surfaced to the user for missing paths.

All demo scans use `effort: low` regardless of the per-type routing defaults. Pricing and careers normally use `effort: high`; this is the accepted cost trade-off for open demo access.

**Implementation note:** `scanPage()` derives effort from `resolveRouting()` internally — there is no effort override parameter. The multi-surface path should add an `effortOverride?: TabstackEffort` field to `ScanPageInput` and thread it through `runPrimaryScan` → the individual endpoint calls, bypassing the routing table's effort value when set.

---

## SSE Event Stream

### Root URL (multi-surface)

```
scan:started         { url: string }
scan:surfaces        { pages: Array<{ type: string; url: string }> }
scan:page_complete   { type: string; url: string; result: unknown; endpointUsed: string; usedFallback: boolean }
                     // fires once per page as it completes, in arrival order
scan:brief_started   {}
scan:brief_complete  { positioning_signal: string; opportunity: string; watch_signal: string }
```

### Non-root URL (single-page — unchanged)

```
scan:started    { url: string }
scan:endpoint   { type: string }
scan:complete   { endpointUsed, usedFallback, diffSummary, hasChanges, result }
```

Error and timeout events (`scan:error`, `scan:timeout`) apply to both paths unchanged.

---

## Timeout Strategy

- **Overall stream:** 22s hard cap (Netlify function limit)
- **Per-page timeout:** 15s — a slow page is dropped, not waited on
- **Brief synthesis:** runs after pages complete; if the overall timeout would be exceeded, the brief is omitted silently. Brief is a bonus, not load-bearing.

---

## Intelligence Brief

A single `generateDemoBrief` call (new helper in `lib/tabstack/generate.ts`) after all page scans settle via `Promise.allSettled()`.

JSON schema passed to `/generate`:
```json
{
  "type": "object",
  "properties": {
    "positioning_signal": { "type": "string" },
    "opportunity":        { "type": "string" },
    "watch_signal":       { "type": "string" }
  },
  "required": ["positioning_signal", "opportunity", "watch_signal"]
}
```

Prompt: `"You are a competitive intelligence analyst. Based on this scan data from [url], write exactly three things: (1) how this company is positioning itself right now in one sentence, (2) one specific gap or weakness a competitor could exploit, (3) one signal worth monitoring next. Be direct and specific."`

The scan data passed is the concatenated JSON of all successfully extracted page results.

Short prompt, short expected output (~3–5s at `effort: low`). If it fails or times out, the demo still succeeds — the brief section is simply not shown.

---

## Rate Limiting

The `demoScan` DB row is written once per user action regardless of how many parallel API calls fired internally. The user's 3/day quota is consumed by 1, not by the number of surfaces scanned.

---

## UI Changes (`DemoClient.tsx`)

### New TypeScript types

```ts
type ScanSurfaces = { pages: Array<{ type: string; url: string }> };
type PageCompleteData = {
  type: string;
  url: string;
  result: unknown;
  endpointUsed: string;
  usedFallback: boolean;
};
type BriefData = {
  positioning_signal: string;
  opportunity: string;
  watch_signal: string;
};
```

### Progress log

Expands to show one row per discovered surface, updating status as each completes:

```
✓  Scan started — stripe.com
→  Scanning 4 surfaces: homepage · pricing · blog · careers
✓  Homepage — extracted
✓  Pricing — extracted
✓  Blog — extracted
→  Careers — extracting…
```

### Results panel

Replaces the single `ScanResult` block with a stacked layout — one section per page type, rendered in completion order. Each section has a type label chip and uses the existing generic key-value renderer (`ResultValue` / `ResultObject`). No new type-specific rendering required for this PR.

### Brief section

Appears below page results once `scan:brief_complete` fires:

```
INTELLIGENCE BRIEF
POSITIONING SIGNAL   "..."
OPPORTUNITY          "..."
WATCH                "..."
```

### Backward compatibility

`scan:endpoint` and `scan:complete` handling is preserved for non-root URL scans. No existing behavior changes for specific-page scans.

---

## Files Changed

| File | Change |
|---|---|
| `app/api/demo/route.ts` | Multi-surface scan logic, parallel page scanning, brief synthesis, new SSE events |
| `components/demo/DemoClient.tsx` | New event handlers, multi-page result display, brief section |
| `lib/scanner.ts` | Add `effortOverride?: TabstackEffort` to `ScanPageInput`; thread through `runPrimaryScan` to endpoint calls |
| `lib/tabstack/generate.ts` | Add `generateDemoBrief` helper |

No changes to schemas or the rate-limiting DB models.

---

## Out of Scope

- Type-specific result rendering (pricing as tier table, etc.) — deferred
- Scanning additional surfaces beyond the 4 listed (docs, github, profile)
- Configurable surface list
- Persisting multi-surface demo results to the DB
