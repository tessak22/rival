# Rival — Competitive Intelligence Dashboard
## Project Spec for Claude Code

---

## What is Rival?

Rival is an open source competitive intelligence tool powered by the Tabstack API. It monitors competitor websites—pricing pages, changelogs, careers pages, docs, GitHub, social profiles—extracts structured intel, and surfaces what changed. When a competitor ships something, changes their pricing, or goes on a hiring spree, you know.

Built explicitly to showcase every Tabstack feature in a real, useful application. Every self-hosted instance requires a Tabstack API key.

**GitHub:** Open source, MIT licensed
**Stack:** Next.js, Postgres, Tabstack API
**Deploy target:** Railway

---

## The Tabstack Showcase

Rival exercises every Tabstack endpoint and API feature. This is intentional — the codebase is a living reference for what Tabstack can do.

### Endpoints used

| Endpoint | Used For |
|---|---|
| `/extract/markdown` | Changelogs, docs, release notes |
| `/extract/json` | Pricing, careers, GitHub, social, profiles |
| `/generate` | Diff summaries between scans |
| `/automate` | JS-heavy pages, fallback, demo default |
| `/research` | Deep Dive — full agentic competitive research |

### API features used

| Feature | Where |
|---|---|
| `effort` parameter | All extract calls — low for static pages, high for SPAs |
| `nocache: true` | All scheduled scans — always get fresh data |
| `geo_target` | Per-page config — surface region-specific pricing |
| TypeScript SDK | All Tabstack calls — `@tabstack/sdk` throughout |
| SSE streaming | `/automate` and `/research` — streamed live to the UI |
| fast/balanced modes | `/research` Deep Dive — user selects depth |

Every endpoint in `lib/tabstack/` is individually importable, clearly commented, and documented with: what it does, when to use it, what parameters it accepts, and what the fallback is. This codebase teaches Tabstack as much as it uses it.

---

## Experience Logging

**This is a core feature of Rival, not an afterthought.**

Every Tabstack API call logs a structured experience record to the `api_logs` table. The goal is to build a complete picture of what the API does in the wild — what it finds, what it misses, where it falls back, and what the data quality looks like. This data is valuable for:

- Identifying which schemas need refinement
- Understanding which page types are hardest to extract
- Documenting real-world fallback patterns
- Giving the Tabstack team concrete feedback on API behavior
- Helping contributors improve Rival's schemas over time

### What gets logged

Every API call records:
- `competitor_id` and `page_id` — what was being scanned
- `endpoint` — which Tabstack endpoint was called (`extract/json`, `extract/markdown`, `generate`, `automate`, `research`)
- `params` — the full parameters sent (url, schema, effort level, nocache, geo_target, mode)
- `status` — `success`, `fallback`, `empty`, `error`
- `fallback_triggered` — boolean, was a fallback endpoint used?
- `fallback_reason` — why the fallback was triggered
- `result_quality` — `full`, `partial`, `empty` — did we get all expected fields?
- `missing_fields` — array of schema fields that came back null or missing
- `page_not_found` — boolean, did Tabstack indicate the page doesn't exist?
- `content_blocked` — boolean, was the page gated, paywalled, or bot-protected?
- `schema_mismatch` — boolean, did the returned structure differ from the schema?
- `raw_error` — the error message if status is `error`
- `duration_ms` — how long the call took
- `called_at` — timestamp
- `effort_used` — what effort level was passed
- `geo_target` — what country was targeted, if any
- `nocache` — whether cache was bypassed

### What this surfaces in the UI

A **Logs** tab on each competitor detail page shows:
- Full call history per page
- Fallback events highlighted in amber
- Missing fields shown per scan
- Pages that consistently return empty results flagged for review
- A "Schema Health" indicator per page type — what % of expected fields came back populated across recent scans

An **API Insights** page (`/insights`) shows aggregate patterns across all competitors:
- Most common missing fields by page type
- Pages that most frequently trigger fallbacks
- Effort level distribution (how often low vs. high was used)
- Geo-targeted scan results vs. default
- Overall API success rate over time

This is Rival's contribution back to the Tabstack ecosystem — real usage data presented clearly.

---

## Two Modes

### 1. Self-hosted (personal instance)
- Competitors defined in `rivals.config.json`
- Scans run on a configurable cron schedule
- Full history stored in Postgres with diffs between scans
- Email + Slack notifications when changes are detected
- Manual fields (funding, traffic, G2) stored per competitor, flagged when stale
- Deep Dive — on-demand `/research` powered intelligence report per competitor
- Full API experience logs with schema health tracking

### 2. Hosted demo
- Single public URL, no auth required
- Visitor enters any competitor URL
- Rival runs a live Tabstack scan and streams results in real time
- Rate limited: 3 scans per IP per day, max 1 concurrent scan
- Powered by the host's Tabstack API key
- Demo scans also logged to `api_logs` (anonymized, no competitor_id)

---

## What Rival Tracks

### Auto-scanned via Tabstack

**Pricing** — `/extract/json`, effort: high, nocache: true
- Tier names, prices, features, CTAs
- Free tier details and limitations
- Per-unit pricing (per seat / per API call / per deployment)
- Enterprise: self-serve or sales-required
- Pricing transparency (public vs. "contact us")
- Supports `geo_target` — pricing often differs by region

**Changelog / Recent Updates** — `/extract/markdown`, effort: low, nocache: true
- Last significant product launch
- New features, API updates, new integrations (last 90 days)
- Strategic direction shifts
- Changelog cadence

**Careers** — `/extract/json`, effort: high, nocache: true
- Open role count, titles, departments, locations, remote flags
- Hiring trend direction (growing / shrinking / flat)
- Executive/leadership roles posted (signals org change)
- DevRel roles open (signals community investment)
- **Tech stack extracted from job descriptions** — engineers list the exact tools, infra, and frameworks they actually use. More honest than any marketing page.

**Product Stack** — `/extract/json` + `/extract/markdown`, effort: low
- Languages and frameworks supported
- Deployment infrastructure and cloud provider
- Key integrations, CLI/SDK/IDE support
- Sourced from docs, readme, about pages, and job descriptions
- Schema: `lib/schemas/stack.ts`

**Community** — `/extract/json`, effort: low
- GitHub stars, forks, active contributors (last 90 days)
- Open issues + PRs, recent releases
- Discord/Slack member count (public servers)
- Stack Overflow tag activity

**Social Presence** — `/extract/json`, effort: low
- Twitter/X, LinkedIn, YouTube follower counts
- Recent post topics and posting frequency

**Documentation** — `/extract/json`, effort: low
- Top-level navigation sections (API reference, guides, tutorials, quickstart)
- Has API reference, SDK docs, and tutorial presence
- Last updated date (if shown)
- Schema: `lib/schemas/docs.ts`

**Company Profile** — `/extract/json`, effort: low
- Mission and positioning statement
- Key leadership names and titles
- Recent partnerships and recognition

### Manual fields (config, flagged when stale)

Fields behind paywalls or third-party APIs. Rival stores them with a "last updated X days ago" staleness indicator.

- Total funding + last round & date (Crunchbase)
- Monthly website traffic + QoQ growth (SimilarWeb)
- Top traffic sources, domain authority score
- G2 rating + review count, Capterra rating + review count
- Common praise themes, complaint themes, developer pain points
- Employee count + trend, founded date

### AI-generated — `/generate`

After each full scan cycle, all extracted data is piped into `/generate`:

- **Positioning opportunity** — what gap does their weakness create?
- **Content opportunity** — what topics should you own based on their blind spots?
- **Product opportunity** — what are developers complaining about that you could solve?
- **Threat level** — High / Medium / Low with one-sentence reasoning
- **Watch list** — 2-3 signals to monitor next cycle

### Deep Dive — `/research` ⭐

The most powerful feature in Rival. On demand, per competitor.

Instead of just scanning pages you already know about, `/research` deploys an autonomous multi-pass agentic loop:

1. **Decomposes** the goal into targeted sub-questions
2. **Discovers in parallel** across the open web, prioritizing authoritative sources
3. **Evaluates gaps** — detects missing or conflicting data, triggers recursive search
4. **Verifies claims** — every finding backed by an inline citation + source URL
5. **Synthesizes** — returns a structured report ready to display

**Two modes:**
- `fast` (10-30 seconds) — lightweight, instant answers
- `balanced` (1-2 minutes) — full agentic loop, multi-pass verification, comprehensive

**What it answers that scheduled scans can't:**
- "What are developers actually saying about this competitor across forums, GitHub issues, and social?"
- "What strategic moves have they made in the last 6 months?"
- "What's their actual developer experience vs. their marketing claims?"
- "Are there acquisition rumors, funding signals, or leadership changes we haven't explicitly configured?"

Deep Dive results are fully logged in `api_logs` and stored in `deep_dives` with all citations.

---

## Config File Format

`rivals.config.json` at project root:

```json
{
  "competitors": [
    {
      "name": "Acme Corp",
      "slug": "acme-corp",
      "url": "https://acme.com",
      "manual": {
        "founded": "2019",
        "total_funding": "$24M",
        "last_round": "Series A, March 2024",
        "employee_count": 87,
        "employee_trend": "up",
        "monthly_traffic": "180000",
        "traffic_growth_qoq": "+12%",
        "top_traffic_sources": ["organic", "direct", "linkedin"],
        "domain_authority": 48,
        "g2_rating": 4.3,
        "g2_review_count": 142,
        "capterra_rating": 4.1,
        "capterra_review_count": 89,
        "praise_themes": ["easy onboarding", "good docs", "responsive support"],
        "complaint_themes": ["pricing too high", "limited integrations", "slow API"],
        "dev_pain_points": ["no TypeScript SDK", "rate limits hit quickly"],
        "manual_last_updated": "2026-03-15"
      },
      "pages": [
        {
          "label": "Pricing",
          "url": "https://acme.com/pricing",
          "type": "pricing",
          "geo_target": "US"
        },
        {
          "label": "Pricing (UK)",
          "url": "https://acme.com/pricing",
          "type": "pricing",
          "geo_target": "GB"
        },
        { "label": "Changelog", "url": "https://acme.com/changelog", "type": "changelog" },
        { "label": "Careers", "url": "https://acme.com/careers", "type": "careers" },
        { "label": "Docs", "url": "https://docs.acme.com", "type": "docs" },
        { "label": "GitHub", "url": "https://github.com/acme-corp/main-repo", "type": "github" },
        { "label": "Twitter", "url": "https://twitter.com/acmecorp", "type": "social" },
        { "label": "About", "url": "https://acme.com/about", "type": "profile" }
      ]
    }
  ],
  "schedule": "0 9 * * 1-5",
  "manual_stale_days": 30,
  "notifications": {
    "email": ["you@example.com"],
    "slack_webhook": "https://hooks.slack.com/services/..."
  }
}
```

Note: `geo_target` is optional per page. When set, Tabstack fetches the page as it appears from that country. Useful for surfacing region-specific pricing.

---

## Tabstack API — Full Feature Reference

### `/extract/json`
Converts any URL to structured JSON against a schema you define. Tabstack's AI maps the page to your schema.

**Key parameters used in Rival:**
- `json_schema` — the data structure you want back
- `effort: "low" | "high"` — low for static pages (fast, cheap), high for JS-heavy SPAs (full browser render)
- `nocache: true` — always used on scheduled scans to ensure fresh data
- `geo_target: { country: "US" }` — fetch as seen from a specific country

**Pricing schema:**
```json
{
  "type": "object",
  "properties": {
    "tiers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Tier name e.g. Starter, Pro, Enterprise" },
          "price": { "type": "string", "description": "Price as displayed, e.g. $49/mo or Contact us" },
          "billing_period": { "type": "string" },
          "features": { "type": "array", "items": { "type": "string" } },
          "per_unit": { "type": "string", "description": "Per-unit pricing if present, e.g. $0.01 per API call" },
          "cta": { "type": "string" },
          "is_self_serve": { "type": "boolean", "description": "Can user sign up without sales?" }
        }
      }
    },
    "has_free_tier": { "type": "boolean" },
    "free_tier_limits": { "type": "string" },
    "pricing_transparent": { "type": "boolean" }
  }
}
```

**Careers schema:**
```json
{
  "type": "object",
  "properties": {
    "open_roles": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "department": { "type": "string" },
          "location": { "type": "string" },
          "remote": { "type": "boolean" },
          "seniority": { "type": "string" },
          "tech_stack_mentioned": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Every technology, framework, tool, cloud provider, or infrastructure component mentioned anywhere in the full job description body — not just the title"
          }
        }
      }
    },
    "total_count": { "type": "number" },
    "hiring_trend": { "type": "string", "description": "growing, shrinking, or flat" },
    "leadership_roles_open": { "type": "boolean" },
    "devrel_roles_open": { "type": "boolean" },
    "aggregate_tech_stack": {
      "type": "array",
      "items": { "type": "string" },
      "description": "All unique technologies mentioned across all job descriptions"
    }
  }
}
```

**GitHub schema:**
```json
{
  "type": "object",
  "properties": {
    "stars": { "type": "number" },
    "forks": { "type": "number" },
    "contributors": { "type": "number" },
    "last_commit_date": { "type": "string" },
    "open_issues": { "type": "number" },
    "open_prs": { "type": "number" },
    "language": { "type": "string" },
    "topics": { "type": "array", "items": { "type": "string" } },
    "recent_releases": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "version": { "type": "string" },
          "date": { "type": "string" },
          "title": { "type": "string" }
        }
      }
    }
  }
}
```

**Social schema:**
```json
{
  "type": "object",
  "properties": {
    "followers": { "type": "number" },
    "platform": { "type": "string" },
    "recent_post_topics": { "type": "array", "items": { "type": "string" } },
    "posting_frequency": { "type": "string" }
  }
}
```

**Profile schema:**
```json
{
  "type": "object",
  "properties": {
    "mission_statement": { "type": "string" },
    "positioning": { "type": "string", "description": "How they describe themselves in one sentence" },
    "key_leadership": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "title": { "type": "string" }
        }
      }
    },
    "recent_partnerships": { "type": "array", "items": { "type": "string" } },
    "recent_awards_or_recognition": { "type": "array", "items": { "type": "string" } }
  }
}
```

### `/extract/markdown`
Converts any URL to clean markdown. Fastest and cheapest. Used for changelog, docs, and release notes.

**Key parameters:**
- `effort: "low"` — always low for markdown, no need for full browser render
- `nocache: true` — always on scheduled scans

### `/generate`
LLM-powered content transformation. Pass a URL + instructions, get back a processed result.

**Diff summaries:**
```
"Compare these two versions of a competitor changelog.
List what was added, changed, or removed in plain English.
Be concise. Focus on developer-facing changes."
```

**Intelligence brief:**
```
"You are a competitive intelligence analyst. Based on this competitor data,
produce a structured brief covering:
1. Positioning opportunity
2. Content opportunity
3. Product opportunity
4. Threat level: High / Medium / Low with one sentence of reasoning
5. Watch list: 2-3 signals to monitor next cycle
Be direct and specific. No generic advice."
```

### `/automate`
Full browser agent — clicks, scrolls, navigates, fills forms. Natural language task, results via SSE.

Used for: JS-heavy SPAs, click-to-reveal pricing, paywalled community counts, demo default.

**Key parameters:**
- `nocache: true` — always on scheduled scans
- `effort: "high"` — automate always uses full browser

SSE event types: `start`, `task:started`, `agent:processing`, `agent:status`, `agent:step`, `agent:action`, `agent:extracted`, `complete`, `done`, `error`

Fallback: If `/extract/json` fails or returns empty, retry once with `/automate`.

### `/research`
Multi-pass autonomous research. Give it a goal, it runs a full agentic loop.

**Modes:**
- `fast` — 10-30 seconds
- `balanced` — 1-2 minutes, full recursive loop with citations

Used in Rival for the Deep Dive feature. All research results include inline citations with source URLs.

---

## Database Schema (Postgres)

```sql
-- Competitors
CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  manual_data JSONB,
  manual_last_updated TIMESTAMPTZ,
  threat_level TEXT,
  intelligence_brief JSONB,
  brief_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pages to monitor per competitor
CREATE TABLE competitor_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  geo_target TEXT,                     -- ISO country code, e.g. 'US', 'GB'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scan results
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES competitor_pages(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  endpoint_used TEXT NOT NULL,
  raw_result JSONB,
  markdown_result TEXT,
  summary TEXT,
  has_changes BOOLEAN DEFAULT FALSE,
  diff_summary TEXT
);

-- Deep Dive results (/research)
CREATE TABLE deep_dives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,                  -- 'fast' | 'balanced'
  query TEXT NOT NULL,
  result JSONB,
  citations JSONB,                     -- array of { claim, source_url, source_text }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API experience log — every Tabstack call
CREATE TABLE api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitors(id) ON DELETE SET NULL,
  page_id UUID REFERENCES competitor_pages(id) ON DELETE SET NULL,
  called_at TIMESTAMPTZ DEFAULT NOW(),

  -- What was called
  endpoint TEXT NOT NULL,              -- 'extract/json' | 'extract/markdown' | 'generate' | 'automate' | 'research'
  url TEXT,
  effort TEXT,                         -- 'low' | 'high' | null
  nocache BOOLEAN,
  geo_target TEXT,
  mode TEXT,                           -- for /research: 'fast' | 'balanced'

  -- What happened
  status TEXT NOT NULL,                -- 'success' | 'fallback' | 'empty' | 'error'
  fallback_triggered BOOLEAN DEFAULT FALSE,
  fallback_reason TEXT,                -- why the fallback was triggered
  fallback_endpoint TEXT,              -- which endpoint was used as fallback

  -- Data quality
  result_quality TEXT,                 -- 'full' | 'partial' | 'empty'
  missing_fields TEXT[],               -- schema fields that came back null or missing
  page_not_found BOOLEAN DEFAULT FALSE,
  content_blocked BOOLEAN DEFAULT FALSE,
  schema_mismatch BOOLEAN DEFAULT FALSE,

  -- Error
  raw_error TEXT,

  -- Performance
  duration_ms INTEGER,

  -- Context
  is_demo BOOLEAN DEFAULT FALSE        -- true if triggered from the public demo
);

-- Notification log
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitors(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scans(id),
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  payload JSONB
);

-- Demo rate limiting
CREATE TABLE demo_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## File Structure

```
rival/
├── rivals.config.json
├── .env.local
├── package.json
├── next.config.js
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── app/
│   ├── page.tsx                        # Dashboard
│   ├── [slug]/
│   │   ├── page.tsx                    # Competitor detail
│   │   └── deep-dive/page.tsx          # Deep Dive results + history
│   ├── compare/page.tsx                # Side-by-side comparison
│   ├── insights/page.tsx               # API experience insights
│   ├── settings/page.tsx               # Notifications, schedule
│   ├── demo/page.tsx                   # Public demo
│   └── api/
│       ├── scan/route.ts               # POST — trigger manual scan
│       ├── brief/route.ts              # POST — generate intelligence brief
│       ├── deep-dive/route.ts          # POST — /research deep dive (SSE)
│       ├── competitors/
│       │   ├── route.ts
│       │   └── [slug]/route.ts
│       ├── notifications/route.ts
│       ├── demo/route.ts               # POST — rate-limited live demo scan (SSE)
│       └── cron/route.ts               # POST — protected cron trigger
│
├── lib/
│   ├── tabstack/
│   │   ├── client.ts                   # SDK wrapper — @tabstack/sdk, shared config
│   │   ├── extract-json.ts             # /extract/json — effort, nocache, geo_target
│   │   ├── extract-markdown.ts         # /extract/markdown — effort, nocache
│   │   ├── generate.ts                 # /generate — diffs and briefs
│   │   ├── automate.ts                 # /automate — SSE streaming, fallback handler
│   │   └── research.ts                 # /research — deep dive, fast/balanced modes
│   ├── schemas/
│   │   ├── pricing.ts
│   │   ├── careers.ts
│   │   ├── changelog.ts
│   │   ├── github.ts
│   │   ├── social.ts
│   │   └── profile.ts
│   ├── logger.ts                       # API experience logger — wraps every Tabstack call
│   ├── notifications/
│   │   ├── email.ts
│   │   └── slack.ts
│   ├── db/
│   │   ├── client.ts                   # Prisma client
│   │   ├── competitors.ts
│   │   ├── scans.ts
│   │   ├── deep-dives.ts
│   │   └── api-logs.ts                 # Queries for log data + insights aggregation
│   ├── scanner.ts                      # Orchestrator — routes by page type, calls logger
│   ├── brief.ts                        # Intelligence brief generator
│   └── diff.ts
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── dashboard/
│   │   ├── CompetitorCard.tsx
│   │   ├── IntelFeed.tsx
│   │   └── ThreatMatrix.tsx
│   ├── competitor/
│   │   ├── IntelBrief.tsx
│   │   ├── ManualDataPanel.tsx
│   │   ├── ScanResult.tsx
│   │   ├── DiffBadge.tsx
│   │   ├── ScanHistory.tsx
│   │   └── SchemaHealthBadge.tsx       # % of expected fields populated in recent scans
│   ├── deep-dive/
│   │   ├── DeepDivePanel.tsx
│   │   ├── DeepDiveTrigger.tsx
│   │   ├── ResearchProgress.tsx        # Live SSE stream — shows agent thinking
│   │   └── CitationCard.tsx
│   ├── logs/
│   │   ├── ApiLogTable.tsx             # Per-page call history
│   │   ├── FallbackAlert.tsx           # Highlighted fallback events
│   │   └── MissingFieldsPanel.tsx      # Fields that came back empty
│   ├── insights/
│   │   ├── SuccessRateChart.tsx
│   │   ├── FallbackFrequency.tsx
│   │   ├── MissingFieldsAggregate.tsx
│   │   └── EffortDistribution.tsx
│   ├── compare/
│   │   └── CompareTable.tsx
│   ├── demo/
│   │   ├── DemoScanner.tsx
│   │   └── ScanProgress.tsx
│   ├── settings/
│   │   ├── NotificationSettings.tsx
│   │   └── ScheduleSettings.tsx
│   └── ui/
│
├── scripts/
│   ├── seed.ts
│   └── scan-all.ts
│
└── README.md
```

---

## API Experience Logger (`lib/logger.ts`)

Every Tabstack call goes through `logger.ts`. It wraps the call, captures timing, evaluates result quality, and writes to `api_logs`.

```
logger.ts wraps every Tabstack call:

1. Record start time
2. Execute the Tabstack call
3. On success:
   - Evaluate result_quality: compare returned fields against expected schema
   - Identify missing_fields: schema properties that are null or absent
   - Detect page_not_found: 404 signals or empty result on known-good page
   - Detect content_blocked: bot protection, login wall, or paywalled content signals
   - Write SUCCESS log entry
4. On fallback triggered:
   - Log FALLBACK entry with fallback_reason and fallback_endpoint
   - Execute fallback call
   - Log result quality of fallback separately
5. On error:
   - Write ERROR log entry with raw_error
6. Always:
   - Record duration_ms
   - Flag is_demo if called from demo route
```

Result quality evaluation logic:
- `full` — all top-level schema fields present and non-null
- `partial` — some fields present, some null or missing
- `empty` — result returned but all fields null, or result itself is empty

---

## Scan Orchestration Logic

```
scanner.ts receives: { page_id, url, type, geo_target? }

All scans use nocache: true

switch type:
  'pricing'   → extract/json, effort: high, geo_target if set
                fallback on failure or empty: automate
  'careers'   → extract/json, effort: high (full JD body for tech stack)
                fallback on failure or empty: automate
  'changelog' → extract/markdown, effort: low
                then: generate diff vs previous scan
  'docs'      → extract/markdown, effort: low
  'github'    → extract/json, effort: low
  'social'    → extract/json, effort: low
  'profile'   → extract/json, effort: low
  'custom'    → automate (natural language task in config)

All calls pass through logger.ts

After every page scan:
  1. Store raw result in scans table
  2. If previous scan exists: generate diff_summary, set has_changes
  3. If has_changes: send email + Slack notification

After ALL pages for a competitor complete:
  1. Run brief.ts — pipe all scan results into /generate
  2. Store intelligence_brief + threat_level
```

---

## Deep Dive Logic (`/api/deep-dive`)

```
POST /api/deep-dive { competitor_id, mode: 'fast' | 'balanced' }

1. Build research query:
   "Research [competitor] as a competitive threat. Cover:
   - Developer sentiment across forums, GitHub issues, and social
   - Strategic moves and product changes in the last 6 months
   - Actual developer experience vs. their marketing claims
   - Hiring signals and org changes
   - Funding, acquisition, or partnership signals
   Provide inline citations for every claim."

2. Call tabs.agent.research({ query, mode }) via logger.ts

3. Stream SSE to client:
   - research:started
   - research:planning { sub_questions }
   - research:discovering { urls_visited }
   - research:evaluating { gaps_found }
   - research:verifying
   - research:complete { report, citations }
   - research:error

4. Store in deep_dives table
5. Log full call in api_logs
```

---

## Demo Route Logic (`/api/demo`)

```
POST /api/demo { url: string }

1. Check rate limit — 3 scans/day per IP
2. Check concurrency — reject if scan in progress
3. Infer page type from URL:
   /pricing → pricing (effort: high)
   /careers, /jobs → careers (effort: high)
   /changelog, /releases → changelog (effort: low)
   github.com → github (effort: low)
   twitter.com, x.com, linkedin.com → social (effort: low)
   default → automate
4. Run scan via scanner.ts (is_demo: true)
5. Stream SSE: scan:started, scan:endpoint, scan:progress, scan:complete, scan:error
6. Do NOT persist to scans table — log to api_logs with is_demo: true
```

---

## Notifications

**Email** — Resend
- Triggered on has_changes
- Subject: `[Rival] {Competitor} updated their {page label}`
- Body: diff summary + link

**Slack** — webhook
- Same trigger, Slack blocks format
- Configured in config file or env var

---

## Competitor Comparison View (`/compare`)

- Select 2-4 competitors side by side
- Rows: Pricing | Stack | Hiring | Community | Social | Manual Data
- Diff highlighting — cells that differ from best-in-class flagged
- Schema health indicators per competitor per category

---

## API Insights Page (`/insights`)

Aggregate view of all `api_logs` data:

- Overall API success rate (success / total calls)
- Most common missing fields by page type — which schemas need refinement
- Pages that most frequently trigger fallbacks
- Effort level distribution (low vs. high usage)
- Geo-targeted scan results vs. default
- Content blocked frequency by domain
- Top errors over time

This page is the feedback loop. It shows what the API does in practice and guides schema improvements.

---

## Dashboard UI Notes

**Main dashboard (`/`)**
- Threat matrix — visual grid by threat level
- Competitor cards — name, threat badge, last scan, change indicator, staleness warning, schema health
- Intel Feed — recent changes, reverse chronological

**Competitor detail (`/[slug]`)**
- Intelligence brief at top
- Tabs: Pricing | Changelog | Careers | Stack | Community | Social | Profile | Manual Data | Logs
- Logs tab: full call history per page, fallback events highlighted, missing fields shown
- Schema Health badge per tab — % of expected fields populated in recent scans
- Scan now button with live progress stream
- Deep Dive button

**Deep Dive (`/[slug]/deep-dive`)**
- Mode selector: Fast / Balanced
- Live agent progress stream
- Structured report with expandable citations
- "Click to verify" on every claim
- Previous deep dives in sidebar

**API Insights (`/insights`)**
- Aggregate charts from api_logs
- Filter by endpoint, competitor, date range
- Schema health rankings — which page types are working well vs. struggling

**Compare (`/compare`)**
- 2-4 competitors, side-by-side, diff highlights

**Demo (`/demo`)**
- URL input, scan button, live progress, results inline
- CTA: "Want this for your competitors? Self-host Rival →"

---

## Design Direction

Rival should feel like a **professional intelligence tool** — dark theme, high data density, sharp typography. Monospace accents for data values. Color-coded change indicators. Threat badges that feel serious. Log data that feels like evidence, not noise. Citations that demand trust. The aesthetic should make someone feel like they have an unfair advantage.

Not playful. Not purple gradients. Sharp, focused, slightly aggressive. The name is "Rival" — lean into it.

---

## Environment Variables

```env
# Required
TABSTACK_API_KEY=
DATABASE_URL=

# Notifications
RESEND_API_KEY=
SLACK_WEBHOOK_URL=

# Config
DEMO_RATE_LIMIT=3
CRON_SECRET=
MANUAL_STALE_DAYS=30
```

---

## README Requirements

1. What Rival is (2-3 sentences)
2. Screenshot / demo GIF — ideally showing Deep Dive live stream
3. One-click Railway deploy button
4. Self-hosting steps: clone, set env vars, `npx prisma migrate deploy`, `npx prisma db seed`, `npm run dev`
5. `rivals.config.json` docs — pages, geo_target, manual fields, notifications
6. **Tabstack API reference section** — every endpoint, every parameter Rival uses, why. This is the core marketing message of the README.
7. **Experience logging section** — explain what gets logged and why, link to `/insights`
8. Tabstack MCP Server mention — developers can connect the Tabstack MCP server to explore the API interactively while building
9. Contributing guide — note that schema improvements are the highest-value contribution
10. Link to hosted demo

---

## Notes for Claude Code

- Use `@tabstack/sdk` — not raw fetch calls
- Use Prisma for database
- Use `node-cron` in dev, Railway cron in production
- Use Resend for email

**On the Tabstack modules (`lib/tabstack/`):**
Every file should open with a header comment block covering: what the endpoint does, cost tier, when to use it vs. alternatives, key parameters, and fallback behavior. These files are the learning artifact. Make them exemplary.

**On `lib/logger.ts`:**
This is the most important non-Tabstack file in the project. Every single Tabstack call must go through it — no exceptions. It should be dead simple to use: `await logger.call(fn, { endpoint, url, page_id, ... })`. It handles timing, result quality evaluation, missing field detection, and writing to `api_logs`. Build it first.

**On `effort` and `nocache`:**
- All scheduled scans: `nocache: true` — always. Without this, you risk getting a cached result and missing a real change.
- Effort: default to `low`, use `high` for pricing and careers pages where JS rendering matters.
- Both parameters should be configurable per page type in `scanner.ts`.

**On `geo_target`:**
- Optional per page in config
- When set, pass `geo_target: { country: "XX" }` to extract/json
- Log the geo_target value in api_logs
- The UI should show the country flag or code next to scan results from geo-targeted pages

**On the SSE streams:**
- `/automate` event types: `start`, `task:started`, `agent:processing`, `agent:status`, `agent:step`, `agent:action`, `agent:extracted`, `complete`, `done`, `error`
- `/research` streams progress through planning → discovering → evaluating → verifying → complete
- Both should be streamed live in the UI — this is the most visually impressive part of the app

**On the Deep Dive:**
`research.ts` and the Deep Dive UI are the showpiece features. The live progress stream — watching the agent decompose the question, discover pages, find gaps, and verify claims — is what will make people share this project. Make it feel alive.

**On `intelligence brief` timing:**
Only fires after ALL pages for a competitor complete in a single scan cycle — not per individual page scan.

**On the demo:**
Always public — no auth checks on `/demo` or `/api/demo`. Demo scans log to `api_logs` with `is_demo: true` and anonymous `ip_hash` — no `competitor_id`.

**On schema improvements:**
The `missing_fields` data in `api_logs` is the feedback loop for schema quality. The README should call this out explicitly — contributors can look at the `/insights` page, find which fields are consistently missing, and improve the schemas. That's the open source flywheel.
