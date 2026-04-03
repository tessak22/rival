# Rival Contributor Guide (Claude)

This repository builds **Rival**, an open-source competitive intelligence dashboard powered by the Tabstack API.

Primary goals:
1. Build a genuinely useful competitive intelligence tool.
2. Showcase Tabstack API usage in production-quality code so developers can learn by example.

Authoritative product spec: `docs/SPEC.md`.

## Core Stack

- Next.js (App Router) + TypeScript strict mode
- PostgreSQL + Prisma
- Tabstack API via `@tabstack/sdk` (never raw fetch)
- Resend (email) + Slack webhook (notifications)

## Non-Negotiables

- Every Tabstack call must go through `lib/logger.ts`.
- Keep endpoint wrappers in `lib/tabstack/` as the primary learning artifact.
- Every `lib/tabstack/*.ts` file starts with a clear header comment:
  - endpoint purpose
  - cost tier
  - when to use vs alternatives
  - key parameters
  - fallback behavior
- Scheduled scans must use `nocache: true`.
- Effort must be explicit per call (do not rely on hidden defaults).
- Use Prisma for database access.

## Endpoint Module Build Order

Implement in this order:
1. `lib/logger.ts`
2. `lib/tabstack/client.ts`
3. `lib/tabstack/extract-markdown.ts`
4. `lib/tabstack/extract-json.ts`
5. `lib/tabstack/generate.ts`
6. `lib/tabstack/automate.ts`
7. `lib/tabstack/research.ts`

Then continue with:
- `lib/schemas/*`
- `lib/scanner.ts`
- `lib/db/*`
- `app/api/*`
- UI pages/components (`/`, `/[slug]`, `/[slug]/deep-dive`, `/insights`, `/compare`, `/demo`)

## Experience Logging Expectations

`api_logs` should capture, per call:
- endpoint + parameters (`url`, `effort`, `nocache`, `geo_target`, `mode`)
- status (`success`, `fallback`, `empty`, `error`)
- fallback metadata (triggered, reason, endpoint)
- result quality (`full`, `partial`, `empty`)
- missing fields
- page not found / content blocked / schema mismatch
- error message
- duration
- demo context flag (`is_demo`)

This is the feedback loop for schema quality and the `/insights` page.

## Schema and Data Modeling

- Keep database schema aligned with `docs/SPEC.md`.
- Prefer clear Prisma model naming with explicit `@map(...)` to DB columns.
- Preserve relationships and delete behavior documented in the spec.

## GitHub Workflow

- Issues are source of truth for scoped work.
- Keep one focused PR per issue.
- Reference issue number in commit messages and PR descriptions.
- Keep branch diffs tight (avoid mixing multiple issue scopes in one PR).

Current issue labels:
- `tabstack`
- `experience-logging`
- `infrastructure`
- `ui`
- `schema`
- `docs`

## Definition of Done for Each PR

- Scope matches the target issue.
- Typecheck passes: `npm run typecheck`.
- Build passes: `npm run build`.
- Comments/docs updated where behavior is non-obvious.
