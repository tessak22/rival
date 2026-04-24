import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetCompetitorSchema,
  GetCompetitorDataSchema,
  GetIntelligenceBriefSchema,
  GetDeepDivesSchema,
  ListRecentIntelSchema,
  GetCompetitorDiffSchema,
  SearchIntelSchema
} from "./schemas.js";
import { listCompetitors } from "./tools/list-competitors.js";
import { getCompetitor } from "./tools/get-competitor.js";
import { getCompetitorData } from "./tools/get-competitor-data.js";
import { getIntelligenceBrief } from "./tools/get-intelligence-brief.js";
import { getDeepDives } from "./tools/get-deep-dives.js";
import { listRecentIntel } from "./tools/list-recent-intel.js";
import { getCompetitorDiff } from "./tools/get-competitor-diff.js";
import { searchIntel } from "./tools/search-intel.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "rival",
    version: "0.1.0"
  });

  server.tool(
    "list_competitors",
    "List all tracked competitors with threat tier, health score, and last change timestamp. Sorted high → low threat.",
    {},
    async () => {
      const result = await listCompetitors();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_competitor",
    "Full snapshot for a single competitor — threat tier, health, tracked pages, manual data (funding, traffic, G2).",
    GetCompetitorSchema.shape,
    async ({ slug }) => {
      const result = await getCompetitor(slug);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_competitor_data",
    "Current structured extracted data for a competitor — pricing tiers, open roles, tech stack from JDs, GitHub stats, blog topics, review themes. Optionally filter by page_type.",
    GetCompetitorDataSchema.shape,
    async ({ slug, page_type }) => {
      const result = await getCompetitorData(slug, page_type);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_intelligence_brief",
    "AI-generated intelligence brief — positioning opportunities, content gaps, product opportunities, threat reasoning, watch list, and all 7 competitive axis scores.",
    GetIntelligenceBriefSchema.shape,
    async ({ slug }) => {
      const result = await getIntelligenceBrief(slug);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_deep_dives",
    "Research reports from Rival's deep dive feature — multi-pass agentic competitive research with citations.",
    GetDeepDivesSchema.shape,
    async ({ slug, limit }) => {
      const result = await getDeepDives(slug, limit);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "list_recent_intel",
    "The intel feed — recent competitor changes, filterable by time window, competitor slug, and page type.",
    ListRecentIntelSchema.shape,
    async (params) => {
      const result = await listRecentIntel(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_competitor_diff",
    "Before/after content for a specific competitor change. Use to extract exact positioning language, pricing changes, or feature additions.",
    GetCompetitorDiffSchema.shape,
    async ({ competitor, page_type, at }) => {
      const result = await getCompetitorDiff(competitor, page_type, at);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "search_intel",
    "Full-text search across the intel feed. Find specific signals: 'who changed pricing', 'which competitors mention MCP', 'DevRel hiring'.",
    SearchIntelSchema.shape,
    async ({ query, since, limit }) => {
      const result = await searchIntel(query, since, limit);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}
