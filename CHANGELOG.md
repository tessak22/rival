# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-05-30

Initial public release of Rival — an open-source competitive intelligence dashboard powered by the [Tabstack API](https://tabstack.ai).

### Core features

- **Competitor scanner** — multi-page orchestration across pricing, docs, changelog, careers, blog, reviews, profile, homepage, and GitHub page types; field-level merge preserves prior scan data when a page returns empty
- **Intelligence Briefs** — AI-generated competitive summaries with threat level, positioning analysis, and 7-axis scoring
- **Positioning Matrix** (`/matrix`) — interactive SVG plot with manual score overrides and per-competitor `matrix: false` exclusion
- **Intel Feed** — dashboard view of recent changes across all competitors, sorted by threat level
- **Deep Dive** (`/[slug]/deep-dive`) — streaming research mode (fast / balanced) with cited sources and pre-built prompt templates for messaging, developer sentiment, and strategic moves
- **Self-profile** (`/[slug]`) — track your own company alongside competitors with a dedicated brief view
- **Demo mode** (`/demo`) — public multi-surface scanner with rate limiting (3/day per IP) and concurrency lock; no account required
- **MCP server** — 8 read-only tools (`list_competitors`, `get_competitor`, `get_competitor_data`, `get_intelligence_brief`, `get_deep_dives`, `list_recent_intel`, `get_competitor_diff`, `search_intel`) accessible via stdio or HTTP transport at `/api/mcp`
- **Experience logging** (`/insights`) — per-call telemetry with fallback rates, missing field analytics, and extraction quality scores
- **Scheduled scans** — daily scans via Netlify background functions with configurable cron schedule
- **Quiver integration** — optional nightly push of competitor reports to Quiver research layer

### Tabstack API modules

Full endpoint wrappers in `lib/tabstack/` covering `extract-json`, `extract-markdown`, `generate`, `automate`, and `research` — each with mandatory experience logging, explicit effort settings, and fallback contracts. See the README for the full API reference.

### Fixed

- Deep Dive citations now correctly extracted from `metadata.citedPages` (the actual Tabstack API response shape — the top-level `citations` field the SDK documentation implies is never populated)
- Dashboard lede no longer duplicates the lead story content
- Self-profile Intelligence Brief section was blank on `/[slug]` — now renders correctly
- Scanner preserves previous scan field values when a subsequent scan returns empty for that field

### Security

- `.claude/settings.local.json` gitignored to prevent credentials in Claude Code Bash allow-lists from being committed
- Placeholder config uses RFC-reserved `*.example.com` domains so a fresh clone can never accidentally trigger real Tabstack API calls against unintended targets

[0.1.0]: https://github.com/tessak22/rival/releases/tag/v0.1.0
