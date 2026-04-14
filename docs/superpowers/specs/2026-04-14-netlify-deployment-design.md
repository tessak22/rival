# Netlify Deployment Design

**Date:** 2026-04-14  
**Status:** Approved

## Goal

Deploy Rival to Netlify at `rival.netlify.app` with auto-deploy from GitHub and a daily scheduled competitor scan.

## Approach

Netlify handles hosting, deployment, and scheduling. The existing GitHub Actions CI (lint, typecheck, tests, build) is unchanged — Netlify only deploys on pushes to `main`.

## Components

### 1. Build Config (`netlify.toml`)

```toml
[build]
  command = "npx prisma generate && npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

- `@netlify/plugin-nextjs` (dev dependency) handles App Router, API routes, and server components on Netlify's serverless runtime
- `prisma generate` runs before build so the Prisma client is available (mirrors existing CI behavior)

### 2. Scheduled Function (`netlify/functions/scheduled-scan.ts`)

Replaces the `node-cron` dependency (currently unused in code). Runs daily at 6am UTC and POSTs to the app's own `/api/cron` endpoint.

```ts
import type { Config } from "@netlify/functions";

export default async () => {
  await fetch(`${process.env.URL}/api/cron`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET! }
  });
};

export const config: Config = {
  schedule: "0 6 * * *"
};
```

- `process.env.URL` is auto-injected by Netlify with the production deploy URL
- `@netlify/functions` added as a dev dependency for the `Config` type
- `node-cron` removed from `package.json` (was installed but never used)

**Why daily at 6am UTC:** ~77 Tabstack API calls per run (7 competitors × ~10 pages + 7 brief generations). Hourly would cost ~1,800 calls/day — unnecessary since competitor content changes slowly. Daily keeps costs sane and data ready at the start of the workday.

### 3. GitHub → Netlify Auto-Deploy

- New Netlify site named `rival` connected to the GitHub repo via Netlify CLI
- Every push to `main` triggers a build + deploy
- Deploy previews enabled automatically for PRs

### 4. Environment Variables

Set via `netlify env:set` from `.env.local` values:

| Variable | Notes |
|---|---|
| `TABSTACK_API_KEY` | From `.env.local` |
| `DATABASE_URL` | From `.env.local` (Neon — already cloud-hosted) |
| `INTERNAL_API_KEY` | From `.env.local` |
| `CRON_SECRET` | Generate a new secret for production |
| `DEMO_RATE_LIMIT` | From `.env.local` |
| `MANUAL_STALE_DAYS` | From `.env.local` |

Skipped for now (optional): `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`

## New Dependencies

| Package | Type | Purpose |
|---|---|---|
| `@netlify/plugin-nextjs` | devDependency | Next.js adapter for Netlify |
| `@netlify/functions` | devDependency | Type support for scheduled functions |

## Removed Dependencies

| Package | Reason |
|---|---|
| `node-cron` | Never used in code — replaced by Netlify Scheduled Function |

## Files Added / Modified

| File | Change |
|---|---|
| `netlify.toml` | New — build config and plugin |
| `netlify/functions/scheduled-scan.ts` | New — daily scan trigger |
| `package.json` | Add `@netlify/plugin-nextjs`, `@netlify/functions`; remove `node-cron` |

## Out of Scope

- Custom domain (can be added later in Netlify dashboard)
- `RESEND_API_KEY` / `SLACK_WEBHOOK_URL` configuration
- Any changes to the scan or brief generation logic
