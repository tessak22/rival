# Rival MCP Server

Exposes all Rival competitive intelligence as read-only MCP tools. Two modes:

- **Hosted (Netlify)** — `POST /api/mcp` on your live Rival deployment. No extra infrastructure. Set `RIVAL_MCP_TOKEN` in Netlify env vars, point any MCP client at the URL.
- **Local stdio** — run the compiled server directly for Claude Desktop.

## Quickstart: Hosted (Netlify)

Set `RIVAL_MCP_TOKEN` in your Netlify environment variables, then configure your MCP client to use the HTTP endpoint:

```json
{
  "mcpServers": {
    "rival": {
      "url": "https://your-rival.netlify.app/api/mcp",
      "headers": {
        "Authorization": "Bearer your-token-here"
      }
    }
  }
}
```

Test with curl:

```bash
curl -X POST https://your-rival.netlify.app/api/mcp \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Quickstart: Claude Desktop (local stdio)

Build the server first:

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

## Quickstart: Claude Code

```bash
claude mcp add rival -- node /absolute/path/to/rival/mcp/dist/index.js
```

Set `DATABASE_URL` in your shell environment or pass it via `--env`:

```bash
claude mcp add rival --env DATABASE_URL=postgresql://... -- node /absolute/path/to/rival/mcp/dist/index.js
```

## HTTP Mode

For remote access (e.g. a shared team server), set `RIVAL_MCP_TRANSPORT=http`:

```bash
RIVAL_MCP_TRANSPORT=http \
RIVAL_MCP_TOKEN=your-secret-token \
DATABASE_URL=postgresql://... \
PORT=3100 \
node mcp/dist/index.js
```

Test with curl:

```bash
curl -X POST http://localhost:3100/mcp \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Tools

| Tool                     | Description                                                          | Key Parameters                                            |
| ------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `list_competitors`       | All tracked competitors sorted high→low threat                       | —                                                         |
| `get_competitor`         | Full snapshot: threat tier, health, pages, funding, traffic, G2      | `slug`                                                    |
| `get_competitor_data`    | Structured extracted data: pricing, roles, tech stack, blog topics   | `slug`, `page_type?`                                      |
| `get_intelligence_brief` | AI brief: positioning/content/product opportunities, 7 axis scores   | `slug`                                                    |
| `get_deep_dives`         | Agentic research reports with citations                              | `slug`, `limit?` (1-10)                                   |
| `list_recent_intel`      | Intel feed: recent changes filterable by time, competitor, page type | `since?`, `until?`, `competitor?`, `page_type?`, `limit?` |
| `get_competitor_diff`    | Before/after content for a specific change                           | `competitor`, `page_type`, `at?`                          |
| `search_intel`           | Full-text search across the intel feed                               | `query`, `since?`, `limit?`                               |

## Running Alongside Quiver MCP

Rival MCP is read-only and has no tool name collisions with Quiver. Both servers can be registered simultaneously in Claude Desktop or Claude Code. Use Rival tools for competitive intelligence and Quiver tools for content/campaign management.

Example `claude_desktop_config.json` with both:

```json
{
  "mcpServers": {
    "rival": {
      "command": "node",
      "args": ["/path/to/rival/mcp/dist/index.js"],
      "env": { "DATABASE_URL": "postgresql://..." }
    },
    "quiver": {
      "command": "node",
      "args": ["/path/to/quiver/mcp/dist/index.js"],
      "env": { "DATABASE_URL": "postgresql://..." }
    }
  }
}
```

## Development

```bash
cd mcp
npm install
npm run dev          # run with tsx (no build needed)
npm run build        # compile to dist/
npm test             # run vitest
npm run typecheck    # tsc --noEmit
```
