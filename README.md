# Rival

Open-source competitive intelligence dashboard powered by the Tabstack API.

Rival tracks competitor pricing, changelogs, careers, docs, social, GitHub, and profile signals, stores historical scans, highlights changes, and surfaces extraction quality telemetry so schemas can improve over time.

## Features

- Scheduled and manual competitor scans
- Deep Dive research mode (`fast` / `balanced`) with citations
- API telemetry and schema quality analytics at `/insights`
- Demo mode (`/demo`) with anonymous rate-limited scans
- Diff summaries and competitor intelligence briefs

## Tech Stack

- Next.js (App Router) + TypeScript
- PostgreSQL + Prisma
- Tabstack SDK (`@tabstack/sdk`)
- Optional notifications via email + Slack webhook

## Quick Start (Self-Hosted)

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```

Required env vars:
- `DATABASE_URL`
- `TABSTACK_API_KEY`

Recommended env vars:
- `CRON_SECRET`
- `SLACK_WEBHOOK_URL` (if notifications enabled)

3. Generate Prisma client and apply migrations:
```bash
npx prisma generate
npx prisma migrate deploy
```

4. Seed competitor/page config:
```bash
npm run db:seed
```

5. Start app:
```bash
npm run dev
```

## Config (`rivals.config.json`)

Rival reads competitor definitions from `rivals.config.json`.

Minimal example:

```json
{
  "competitors": [
    {
      "name": "Acme",
      "slug": "acme",
      "url": "https://acme.com",
      "manual": {
        "manual_last_updated": "2026-04-01"
      },
      "pages": [
        { "label": "Pricing", "url": "https://acme.com/pricing", "type": "pricing", "geo_target": "US" },
        { "label": "Changelog", "url": "https://acme.com/changelog", "type": "changelog" }
      ]
    }
  ]
}
```

## Tabstack API Reference in Rival

Rival uses all major Tabstack endpoint families.

### `/extract/json`

Why: structured field extraction for schema-bound page types.

Used for:
- `pricing`
- `careers`
- `docs`
- `github`
- `social`
- `profile`
- `stack`

Key params:
- `url`
- `json_schema`
- `effort` (`low` / `high`)
- `nocache`
- `geo_target`

### `/extract/markdown`

Why: lower-cost text extraction for unstructured pages.

Used for:
- `changelog` pages

Key params:
- `url`
- `effort`
- `nocache`
- `geo_target`

### `/automate`

Why: browser-agent fallback for JS-heavy or low-quality extraction cases.

Used for:
- fallback when `pricing`/`careers` extraction is empty or fails
- `custom` pages
- demo scans with unknown page types

Key params:
- `url`
- `task`
- `guardrails`
- `geo_target`

### `/generate`

Why: transformation + synthesis of gathered intelligence.

Used for:
- page diff summaries
- competitor intelligence briefs

Key params:
- `url`
- `instructions`
- `json_schema`
- `effort`
- `nocache`

### `/research`

Why: multi-pass web research for Deep Dive reports.

Used for:
- `/[slug]/deep-dive`

Key params:
- `query`
- `mode` (`fast` / `balanced`)
- `nocache`

## Experience Logging and Schema Improvement Loop

Every Tabstack call is logged to `api_logs` with endpoint, params, status, fallback metadata, quality, missing fields, blocked/not-found flags, and duration.

Use `/insights` to close the loop:

1. Identify most-missing fields by page type
2. Identify fallback-heavy pages/endpoints
3. Inspect top errors and blocked domains
4. Refine schemas + routing policy
5. Re-scan and measure improvement

Unexpected behavior discovered during e2e validation should be tracked in:
- `docs/experience-logging-followups.md`
- Follow-up GitHub issues labeled `experience-logging`

## Scan Validation Workflow

Run after seeding and scans:

```bash
npm run validate:scan-cycle
```

This checks:
- pages have scan history
- diffs are being produced when prior scans exist
- `api_logs` are populated
- intelligence brief artifacts are present

## Demo Mode

Public demo endpoint:
- `POST /api/demo`
- rate limit: 3 scans/day/IP
- single concurrent scan/IP
- anonymous logs (`is_demo=true`, no competitor ID)

UI:
- `/demo`

## Deployment Notes

For production deploys, ensure startup sequence includes:

```bash
npx prisma migrate deploy
npm run db:seed
```

Use a persistent PostgreSQL database and set `CRON_SECRET` for `/api/cron`.

## Contributing

1. Pick a GitHub issue and use one focused branch/PR per issue.
2. Keep Tabstack calls behind endpoint wrappers and logger.
3. Run checks before opening PR:
```bash
npm run lint
npm run test
npm run typecheck
```
4. Document DX findings for Tabstack integration in your issue/PR notes.

See `CONTRIBUTING.md` for additional workflow expectations.

## License

MIT

