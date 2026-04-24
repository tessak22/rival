# Rival

Open-source competitive intelligence dashboard powered by the Tabstack API.

Rival tracks competitor pricing, changelogs, careers, docs, social, GitHub, and profile signals, stores historical scans, highlights changes, and surfaces extraction quality telemetry so schemas can improve over time.

## Features

- Scheduled and manual competitor scans
- Deep Dive research mode (`fast` / `balanced`) with citations
- API telemetry and schema quality analytics at `/insights`
- Demo mode (`/demo`) with anonymous rate-limited scans
- Diff summaries and competitor intelligence briefs
- **MCP server** — query all competitor data from Claude Desktop, Claude Code, or any MCP-compatible AI client

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
- `INTERNAL_API_KEY` (required for protected internal API routes like `/api/scan` and `/api/brief`)
- `RESEND_API_KEY` (if email notifications enabled)
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

`db:seed` is idempotent for competitors (upserts by `slug`) and resets/recreates configured pages for each competitor.

5. Start app:

```bash
npm run dev
```

## Config (`rivals.config.json`)

Rival reads competitor definitions from `rivals.config.json`.
Supported `type` values for pages:

- `pricing`
- `careers`
- `changelog`
- `docs`
- `github`
- `social`
- `profile`
- `stack`
- `custom`

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

## MCP Server

Rival ships a built-in MCP server that exposes all competitor intelligence as read-only tools. Once registered, any MCP-compatible AI client (Claude Desktop, Claude Code, or custom agents) can query your competitor data directly — no manual exports, no copy-pasting.

### Tools

| Tool | Description |
|---|---|
| `list_competitors` | All tracked competitors with threat tier, health score, and last change timestamp |
| `get_competitor` | Full snapshot — tracked pages, manual data (funding, G2, traffic) |
| `get_competitor_data` | Current extracted data by page type — pricing tiers, job listings, tech stack from JDs, GitHub stats, blog topics, review themes |
| `get_intelligence_brief` | AI-generated brief — positioning/content/product opportunities, threat reasoning, watch list, 7 axis scores |
| `get_deep_dives` | Agentic research reports with citations |
| `list_recent_intel` | Intel feed — recent changes, filterable by time, competitor, and page type |
| `get_competitor_diff` | Before/after content for a specific change |
| `search_intel` | Full-text search across the intel feed |

### Local setup (Claude Desktop / Claude Code)

Build the server:

```bash
cd mcp && npm install && npm run build
```

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rival": {
      "command": "node",
      "args": ["/absolute/path/to/rival/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

### HTTP transport (self-hosted server)

For shared or remote access, run the server in HTTP mode with bearer auth:

```bash
RIVAL_MCP_TRANSPORT=http \
RIVAL_MCP_TOKEN=your-secret-token \
DATABASE_URL=postgresql://... \
PORT=3100 \
node mcp/dist/index.js
```

Or use the built-in HTTP endpoint that ships with the Next.js app at `POST /api/mcp`. Set `RIVAL_MCP_TOKEN` in your environment and point any MCP client at `https://your-rival-instance.com/api/mcp` with `Authorization: Bearer <token>`.

See `mcp/README.md` for full setup details and tool reference.

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
