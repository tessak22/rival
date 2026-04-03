# Rival Audit Guide

This guide tells you when to run each audit command during Rival development.
Claude Code reads this file to know which `/audit-*` command to suggest based on what's being worked on.

---

## How the Audit Commands Work

All audit commands live in `.claude/commands/`. In a Claude Code session, invoke them with:

```
/audit-errors
/audit-boundaries
/audit-drift
/audit-abstractions
/audit-names
/audit-dead-code
/audit-todos
/audit-idiomatic
/finalize
/tests-new
/changelog
```

---

## Tier 1 — Run on Every Tabstack Integration PR

These three are mandatory any time code touches `lib/tabstack/`, `lib/logger.ts`, API routes, cron jobs, or SSE handlers.

### `/audit-errors` — MOST CRITICAL FOR RIVAL

Rival's experience logging breaks silently if errors are swallowed. An empty catch block around a Tabstack call means that failure **never reaches `api_logs`**. That's not just a bug — it's the core feedback loop breaking without any warning.

**Run when touching:**
- `lib/tabstack/*.ts` — any endpoint module
- `lib/logger.ts` — the logger itself must not swallow errors
- `app/api/scan/` — cron job and manual scan triggers
- Any SSE streaming handler (`/automate`, `/research`)
- `app/api/demo/` — demo scan route

**Key risks to catch:**
- Empty catch blocks around Tabstack SDK calls
- Floating promises in the scan scheduler (fire-and-forget that nobody awaits)
- SSE stream errors that get silently dropped
- `lib/logger.ts` errors not propagating to the caller

---

### `/audit-boundaries`

Rival has clear architectural layers. Violations here would undermine the codebase's credibility as a reference implementation.

**Expected dependency direction:**
```
app/ (pages, API routes)
  ↓ calls
lib/tabstack/ (endpoint modules)
  ↓ called through
lib/logger.ts (wraps all Tabstack calls)
  ↓ writes to
prisma/ (database layer)
```

**Run when touching:**
- Any new import added across architectural layers
- New API route handlers in `app/api/`
- New UI components in `app/` that need data
- Any new `lib/` module

**Key violations to catch:**
- Route handlers in `app/api/` calling Prisma directly (should go through a service)
- Components reading from `api_logs` directly
- `lib/tabstack/` modules accessing `process.env` (use `lib/config.ts`)
- `lib/logger.ts` importing anything from `app/`

**NOTE:** `lib/logger.ts` wrapping all Tabstack calls is **intentional and correct**. It adds timing, result quality evaluation, missing field detection, and `api_logs` writes. Do NOT flag as a boundary violation.

---

### `/audit-drift`

Rival has complex status enums. Magic strings here create subtle bugs and make it impossible to refactor safely.

**Run when touching:**
- Any file that reads or writes `result_quality` (`full` | `partial` | `empty`)
- Any file that reads or writes scan `status` (`pending` | `running` | `complete` | `failed`)
- The Deep Dive SSE streaming UI component
- `prisma/schema.prisma` — verify enum changes match TypeScript
- Any new state added to stores or reducers

**Key risks to catch:**
- `result_quality` passed as a raw string instead of a typed enum
- Scan status values as magic strings
- Deep Dive SSE UI using multiple booleans instead of a state machine
  - Correct pattern: `idle → connecting → streaming → complete | error`
- Database enum values in Prisma schema that don't match TypeScript enums exactly

---

## Tier 2 — After First Working Version of Each Module

### `/audit-abstractions`

**Run when:** A new module, service class, or interface is added to `lib/`.

**Rival-specific notes:**
- `lib/logger.ts` wrapping Tabstack calls = **intentional, not hollow**
- Watch for speculative interfaces in `lib/tabstack/` (e.g., `IExtractor` with only one impl)
- Watch for Middle Man if `scanner.ts` delegates without orchestrating

---

### `/audit-names`

**Run when:** Adding new public-facing functions, Tabstack module code, or any `lib/` additions.

**Rival-specific rules:**
- In `lib/tabstack/` modules, use domain names: `extractedPricing`, `changelogMarkdown`, `careersJson` — NOT `data`, `result`, `response`
- `effort` parameter must be typed as `'low' | 'high'`, never a raw string
- Boolean naming: `loading` → `isLoading`, `active` → `isActive`, `scanning` → `isScanning`
- Reminder: Rival is a teaching artifact. Bad names hurt twice.

---

## Tier 3 — Pre-Launch / Monthly

### `/audit-dead-code`

**Run when:** After completing a major feature, or before a public release.

**Rival-specific risks:**
- Commented-out experimental JSON schema attempts in `lib/tabstack/` (these accumulate during iteration)
- Orphaned files from the demo vs. self-hosted mode split
- Old API route versions left when routes are restructured

---

### `/audit-todos`

**Run:** Monthly, or before a public GitHub release.

**Rival-specific:** Deferred spec decisions will accumulate as TODOs. Keep them linked to open GitHub issues so they're trackable.

---

### `/audit-idiomatic`

**Run:** Before any public release or major README update.

**Why it matters for Rival:** Rival is a showcase and reference codebase. Non-idiomatic Next.js, Prisma, or TypeScript patterns undermine its credibility with the developers it's trying to reach.

**Check specifically:**
- Next.js App Router patterns (Server vs Client Components split)
- Prisma transaction idioms and N+1 query avoidance
- TypeScript strictness (`any` usage, missing return types)
- All Tabstack calls using `@tabstack/sdk`, not raw fetch

---

## Every Session / Every PR

### `/finalize`

Run at the **end of every Claude Code session**, before committing. Clears experimental scaffolding, dead-end approaches, and debug code that accumulated during the session.

---

### `/tests-new`

Run after every major Tabstack module or `lib/` addition.

**First priority tests for Rival:**
1. `lib/logger.ts` — test that a `partial` result correctly identifies and records `missing_fields`
2. `lib/tabstack/` modules — test that `fallback_triggered` is set when primary extraction fails
3. Scanner — test that `nocache: true` is passed on all scheduled scan calls
4. Error paths — test that failed Tabstack calls still write to `api_logs` with status `error`

---

### `/changelog`

Run before any public GitHub release or version tag.

---

## Quick Reference

| When | Command |
|------|---------|
| Any Tabstack integration PR | `/audit-errors`, `/audit-boundaries`, `/audit-drift` |
| New `lib/` module added | `/audit-abstractions`, `/audit-names`, `/tests-new` |
| End of every session | `/finalize` |
| After major feature | `/audit-dead-code` |
| Monthly | `/audit-todos` |
| Pre-launch | `/audit-idiomatic`, `/changelog` |
