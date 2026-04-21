# Self-Profile Design

**Date:** 2026-04-21
**Status:** Approved

## Goal

Give Rival context about the user's own company so every AI surface (briefs, threat scoring, deep dives, future compare) produces recommendations *relative to you* instead of generic competitor commentary.

Today, briefs read like analyst observations. With self-context injected, they read like threat assessments addressed to a specific product with a specific ICP and pricing model.

## Principle

Self is treated exactly like a competitor. Same scanner, same page types, same cron, same brief infrastructure. The only differences are:

1. A boolean flag distinguishing self from competitors.
2. A different prompt and schema for self's own brief (self-analysis, not competitive analysis).
3. Self's latest brief + manual data is injected as context into every AI call that targets a competitor.
4. Self is filtered out of the competitor grid and shown in its own dashboard section.

## Config

`rivals.config.json` gets a top-level `self` block with the same shape as a competitor entry:

```json
{
  "self": {
    "name": "Rival",
    "slug": "rival",
    "url": "https://rival.so",
    "pages": [
      { "label": "Homepage", "url": "https://rival.so", "type": "homepage" },
      { "label": "Pricing", "url": "https://rival.so/pricing", "type": "pricing", "geo_target": "US" },
      { "label": "Changelog", "url": "https://rival.so/changelog", "type": "changelog" },
      { "label": "Careers", "url": "https://rival.so/careers", "type": "careers" },
      { "label": "GitHub", "url": "https://github.com/tessak22/rival", "type": "github" },
      { "label": "Docs", "url": "https://rival.so/docs", "type": "docs" },
      { "label": "Blog", "url": "https://rival.so/blog", "type": "blog" },
      { "label": "About", "url": "https://rival.so/about", "type": "profile" },
      { "label": "Twitter/X", "url": "https://x.com/rivalapp", "type": "social" }
    ]
  },
  "competitors": [ ... ]
}
```

All existing page types are supported. `manual` override works the same as for competitors.

## Database

Reuse the `Competitor` model. Add one column:

```prisma
model Competitor {
  // ...existing fields...
  isSelf Boolean @default(false) @map("is_self")
}
```

Partial unique index in a migration enforces at most one self row:

```sql
CREATE UNIQUE INDEX competitors_is_self_unique
  ON competitors (is_self) WHERE is_self = true;
```

No new table. No new model for pages, scans, briefs, or logs — self uses the existing ones via its `Competitor.id`.

## Seed

`scripts/seed.ts` is extended to read `config.self` and upsert it as a Competitor row with `isSelf: true`. Same upsert logic as competitors, keyed by `slug`. If `config.self` is absent, nothing happens (backward compatible — existing deployments without a self entry keep working until the user adds one).

## Bootstrap and Cron

No changes to `scripts/bootstrap-new-competitors.ts` or `lib/run-scans.ts`. Both iterate `prisma.competitor.findMany({ include: { pages: true } })`, which naturally includes self. Self scans on the same schedule and through the same pipeline as competitors.

## Self Brief

A new brief generator is added for self, with a schema designed for downstream context injection (not competitive analysis).

**New function:** `generateSelfBrief(competitorId)` in `lib/brief.ts`, calling a new `generateSelfProfile` in `lib/tabstack/generate.ts`.

**New schema:** `SELF_PROFILE_SCHEMA` with fields:
- `positioning_summary` — 1–2 sentences: who you are, what you sell
- `icp_summary` — 1–2 sentences: who you serve
- `pricing_summary` — brief description of monetization model (free / paid / freemium / OSS + paid / etc.)
- `differentiators` — 3–5 bullets of what makes you distinct
- `recent_signals` — 3–5 bullets of recent changes visible from changelog, blog, careers

This output is stored in the same `intelligenceBrief` JSON column as competitor briefs. `threatLevel` stays null for self.

Rationale for a different schema: the competitor brief schema (`positioning_opportunity`, `threat_level`, `watch_list`) describes how to evaluate *someone else*. Forcing it onto self produces awkward output. A purpose-built self schema doubles as the context-injection string.

## Branching in `run-scans.ts` and Bootstrap

`lib/run-scans.ts` and `scripts/bootstrap-new-competitors.ts` branch on `competitor.isSelf`:

```ts
if (competitor.isSelf) {
  await generateSelfBrief(competitor.id, briefNocache);
} else {
  await generateCompetitorBrief(competitor.id, briefNocache);
}
```

## Context Injection

**New module:** `lib/context/self-context.ts`

```ts
export async function buildSelfContext(): Promise<string | null>
```

Loads the self row. If no self row exists or no brief has been generated yet, returns `null` (callers pass through without injection — backward compatible for fresh installs).

Returns a compact string built from:
- `positioning_summary`
- `icp_summary`
- `pricing_summary`
- `differentiators` (joined)
- `manual_data` (if present, merged in — user overrides take precedence)

Merge strategy: any top-level key in `manual_data` matching a brief field name overrides the brief value for that key. Extra keys in `manual_data` (not in the brief schema) are appended as an additional "User notes" section. This lets the user both correct extraction mistakes and add facts the scanner can't see (e.g., "we just signed an enterprise deal with X").

Capped at ~800 chars so it doesn't dominate the downstream prompt.

Format:
```
CONTEXT — about the user's own company (who this brief is for):
Name: Rival
Positioning: ...
ICP: ...
Pricing: ...
What makes us distinct: ...
Use this to frame recommendations, threat levels, and opportunities relative to THIS company specifically. Do not echo this context in the output.
```

## Injection Sites

Every AI call that evaluates a competitor prepends the self-context to its instructions/query.

| Call | File | Injection |
|---|---|---|
| `generateBrief` (competitor brief) | `lib/tabstack/generate.ts:238` | Prepend self-context block to `instructions` before `Additional competitor context:` |
| `runResearch` (deep dive) | `lib/tabstack/research.ts:180` | Prepend self-context block to `query` |
| Future compare | TBD | Same injection pattern |

`generateSelfProfile` (the self-brief call itself) does NOT inject self-context — it's analyzing self from scratch, not comparing.

The injection is additive: if `buildSelfContext()` returns null (no self configured, or self brief not yet generated), the prompts fall through to current behavior. No regressions for deployments that haven't configured self.

**Demo path:** self-context is NOT injected into demo scans. The demo lets a user paste any URL for a one-shot scan — that URL is not *their* product, and injecting the operator's self-profile would poison the output. The demo code path calls `generateBrief` / `runResearch` with `isDemo: true`; the injection helper skips when that flag is set.

## Dashboard UI

**Competitor grid (`app/page.tsx`):** filter out `isSelf = true` so self doesn't appear alongside competitors.

**New section at top of dashboard:** "Your Profile" — renders the self competitor using the same card component, minus the threat-level badge (threat doesn't apply to self).

**Detail page (`app/[slug]/page.tsx`):** works unchanged for self (slug resolves normally). Threat-level UI is hidden when `isSelf` is true. Brief rendering branches on schema shape — self briefs render the self-profile fields; competitor briefs render the competitive fields. Both use the same wrapper layout.

**Scan history (`app/[slug]/history/page.tsx`):** works unchanged. Self's scan history is browsable the same way.

## API Routes

`app/api/competitors/route.ts` (and any other list endpoint) — filter out `isSelf` from the competitors list response. Add an optional `self` field in the response for UI consumption.

`app/api/self/route.ts` (new, optional) — returns the self row for the dashboard's "Your Profile" section. Read-only.

No mutation endpoints. All changes flow through `rivals.config.json`, consistent with the competitor pattern.

## Experience Logging

`api_logs` already captures `competitor_id` — self's AI calls are logged the same way, distinguishable by `competitor_id` pointing at the self row. No schema changes.

## Files Touched

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `isSelf` to `Competitor` |
| `prisma/migrations/…_add_is_self/migration.sql` | Create | Column + partial unique index |
| `rivals.config.json` | Modify | Add `self` block (project-specific content) |
| `scripts/seed.ts` | Modify | Upsert self from config |
| `lib/tabstack/generate.ts` | Modify | Add `SELF_PROFILE_SCHEMA` + `generateSelfProfile`; inject self-context in `generateBrief` |
| `lib/tabstack/research.ts` | Modify | Inject self-context in `runResearch` query |
| `lib/brief.ts` | Modify | Add `generateSelfBrief` |
| `lib/context/self-context.ts` | Create | `buildSelfContext()` helper |
| `lib/run-scans.ts` | Modify | Branch on `isSelf` for brief gen |
| `scripts/bootstrap-new-competitors.ts` | Modify | Branch on `isSelf` for brief gen |
| `app/page.tsx` | Modify | Filter self from grid; add "Your Profile" section |
| `app/[slug]/page.tsx` | Modify | Branch brief rendering + hide threat UI for self |
| `app/api/competitors/route.ts` | Modify | Filter self from list response |
| `app/api/self/route.ts` | Create (optional) | Dedicated self read endpoint |
| DX notes: `notes-local/tabstack-dx-notes.md` | Modify | Record any DX findings from context injection work |

## Testing

- Unit: `buildSelfContext` with (a) no self row, (b) self row with no brief, (c) full self row with brief + manual_data. Expect graceful null / partial / full output.
- Unit: `generateSelfBrief` with mocked Tabstack response — verifies schema parsing.
- Unit: `generateBrief` and `runResearch` — verify self-context is prepended when available, omitted when null.
- Integration: end-to-end bootstrap run on a fresh DB with a `self` block in config — self is seeded, scanned, self-brief generated, and subsequent competitor briefs include self-context in their prompts (verifiable via `api_logs` url/prompt snapshot if we capture it, or by asserting the `generateBrief` call site receives a non-null context arg).
- UI: self does not appear in the competitor grid; "Your Profile" section renders; detail page hides threat badge for self.

## Out of Scope

- Settings UI for editing self-profile in-browser (future, requires rethinking config-as-source-of-truth).
- Multi-tenant support (Rival is single-tenant by design).
- Historical diffing of self-brief output (nice-to-have).
- Compare page (separate feature, but designed to consume self-context the same way).
- Notifications triggered by self scan changes (future — probably undesirable since users don't need to be alerted about their own site changing).

## Open Questions

None at design time. The config-driven pattern and Competitor-row reuse avoid new primitives.

## Rollout

1. Ship schema + seed + config shape — deploy to production with no `self` block configured yet (all existing behavior unchanged).
2. Add `self` block to production `rivals.config.json`. Bootstrap runs on next deploy, scans self, generates self-brief.
3. Ship context injection changes. Next cron cycle produces competitor briefs with self-context included.
4. Ship UI changes. Self appears in its own dashboard section.

Each step is independently deployable and reversible.
