/**
 * Rival MCP server — Next.js HTTP endpoint.
 *
 * Implements the MCP JSON-RPC protocol directly (no SDK transport adapter needed).
 * Works as a Netlify serverless function — each request is stateless and short-lived.
 * All 8 tools are read-only Prisma queries that complete in milliseconds.
 *
 * Auth: Bearer token via RIVAL_MCP_TOKEN env var (required).
 * Endpoint: POST /api/mcp
 *
 * MCP client config (Claude Desktop / Claude Code):
 *   { "url": "https://your-rival.netlify.app/api/mcp", "headers": { "Authorization": "Bearer <token>" } }
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/client";
import { competitorHealthScores } from "@/lib/db/health";

export const dynamic = "force-dynamic";

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const token = process.env.RIVAL_MCP_TOKEN;
  if (!token) return false; // No token = deny all — this is production competitive data
  return request.headers.get("authorization") === `Bearer ${token}`;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function threatOrder(level: string | null): number {
  const l = level?.toLowerCase();
  if (l === "high") return 0;
  if (l === "medium") return 1;
  if (l === "low") return 2;
  return 3;
}

const TRUNCATE_AT = 8000;

function parseDateArg(s: string, paramName: string): Date {
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`Invalid date for '${paramName}': "${s}"`);
  return d;
}

function truncateContent(s: string | null): { content: string | null; wasTruncated: boolean } {
  if (!s) return { content: null, wasTruncated: false };
  if (s.length <= TRUNCATE_AT) return { content: s, wasTruncated: false };
  return { content: s.slice(0, TRUNCATE_AT) + "...[truncated]", wasTruncated: true };
}

function rawToText(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 2);
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolListCompetitors() {
  const competitors = await prisma.competitor.findMany({
    where: { isSelf: false },
    include: {
      pages: {
        include: {
          scans: {
            where: { hasChanges: true },
            orderBy: { scannedAt: "desc" },
            take: 1,
            select: { scannedAt: true }
          }
        }
      }
    }
  });

  const ids = competitors.map((c) => c.id);
  const healthMap = await competitorHealthScores(ids);

  const sorted = [...competitors].sort(
    (a, b) => threatOrder(a.threatLevel) - threatOrder(b.threatLevel) || a.name.localeCompare(b.name)
  );

  return {
    competitors: sorted.map((c) => {
      const lastChange =
        c.pages.flatMap((p) => p.scans).sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime())[0]?.scannedAt ??
        null;
      return {
        name: c.name,
        slug: c.slug,
        threat_tier: c.threatLevel?.toLowerCase() ?? "unknown",
        health_score: healthMap.get(c.id) ?? 0,
        last_change_detected_at: lastChange?.toISOString() ?? null,
        url: c.baseUrl
      };
    })
  };
}

async function toolGetCompetitor(slug: string) {
  const c = await prisma.competitor.findUnique({
    where: { slug },
    include: {
      pages: {
        include: {
          // Only latest scan needed for last_checked_at — change data fetched separately below.
          scans: {
            orderBy: { scannedAt: "desc" },
            take: 1,
            select: { scannedAt: true }
          }
        }
      }
    }
  });

  if (!c || c.isSelf) return { error: "competitor_not_found", slug };

  const healthMap = await competitorHealthScores([c.id]);

  // Separate query for last changed scan per page — avoids the take:1 truncation problem
  // where a page with no recent change would miss older change records.
  const latestChangedScans =
    c.pages.length > 0
      ? await prisma.scan.findMany({
          where: { pageId: { in: c.pages.map((p) => p.id) }, hasChanges: true },
          orderBy: { scannedAt: "desc" },
          distinct: ["pageId"],
          select: { pageId: true, scannedAt: true, diffSummary: true }
        })
      : [];
  const changedByPageId = new Map(latestChangedScans.map((s) => [s.pageId, s]));

  const m = (c.manualData ?? {}) as Record<string, unknown>;

  return {
    name: c.name,
    slug: c.slug,
    base_url: c.baseUrl,
    threat_tier: c.threatLevel?.toLowerCase() ?? "unknown",
    health_score: healthMap.get(c.id) ?? 0,
    manual_data: {
      founded: m.founded ?? null,
      employee_count: m.employee_count ?? m.employees ?? null,
      total_funding: m.total_funding ?? null,
      last_round: m.last_round ?? null,
      monthly_traffic: m.monthly_traffic ?? null,
      traffic_growth_qoq: m.traffic_growth_qoq ?? null,
      g2_rating: m.g2_rating ?? null,
      g2_review_count: m.g2_review_count ?? null,
      capterra_rating: m.capterra_rating ?? null,
      capterra_review_count: m.capterra_review_count ?? null,
      praise_themes: m.praise_themes ?? [],
      complaint_themes: m.complaint_themes ?? [],
      dev_pain_points: m.dev_pain_points ?? []
    },
    tracked_pages: c.pages.map((p) => {
      const latestScan = p.scans[0] ?? null;
      const changedScan = changedByPageId.get(p.id) ?? null;
      return {
        page_type: p.type,
        label: p.label,
        url: p.url,
        geo_target: p.geoTarget ?? null,
        last_checked_at: latestScan?.scannedAt.toISOString() ?? null,
        last_changed_at: changedScan?.scannedAt.toISOString() ?? null,
        latest_summary: changedScan?.diffSummary ?? null
      };
    })
  };
}

async function toolGetCompetitorData(slug: string, pageType?: string) {
  const c = await prisma.competitor.findUnique({
    where: { slug },
    select: { id: true, name: true, isSelf: true }
  });

  if (!c || c.isSelf) return { error: "competitor_not_found", slug };

  const pages = await prisma.competitorPage.findMany({
    where: { competitorId: c.id, ...(pageType ? { type: pageType } : {}) },
    include: {
      scans: {
        orderBy: { scannedAt: "desc" },
        take: 1,
        select: { scannedAt: true, endpointUsed: true, rawResult: true, markdownResult: true }
      }
    }
  });

  return {
    competitor: c.name,
    slug,
    pages: pages
      .filter((p) => p.scans.length > 0 && (p.scans[0].rawResult !== null || p.scans[0].markdownResult !== null))
      .map((p) => {
        const scan = p.scans[0];
        const data: unknown =
          p.type === "changelog" && scan.markdownResult ? { content: scan.markdownResult } : scan.rawResult;
        return {
          page_type: p.type,
          label: p.label,
          url: p.url,
          scanned_at: scan.scannedAt.toISOString(),
          endpoint_used: scan.endpointUsed,
          data
        };
      })
  };
}

async function toolGetIntelligenceBrief(slug: string) {
  const c = await prisma.competitor.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      isSelf: true,
      intelligenceBrief: true,
      briefGeneratedAt: true,
      threatLevel: true
    }
  });

  if (!c || c.isSelf) return { error: "competitor_not_found", slug };

  const brief = asObj(c.intelligenceBrief);
  if (!brief) return { error: "no_brief_available", competitor: c.name, slug };

  return {
    competitor: c.name,
    slug: c.slug,
    generated_at: c.briefGeneratedAt?.toISOString() ?? null,
    threat_level: typeof brief.threat_level === "string" ? brief.threat_level : (c.threatLevel ?? null),
    threat_reasoning: typeof brief.threat_reasoning === "string" ? brief.threat_reasoning : null,
    positioning_opportunity: typeof brief.positioning_opportunity === "string" ? brief.positioning_opportunity : null,
    content_opportunity: typeof brief.content_opportunity === "string" ? brief.content_opportunity : null,
    product_opportunity: typeof brief.product_opportunity === "string" ? brief.product_opportunity : null,
    watch_list: Array.isArray(brief.watch_list)
      ? (brief.watch_list as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    axis_scores: {
      openness: typeof brief.openness_score === "number" ? brief.openness_score : null,
      brand_trust: typeof brief.brand_trust_score === "number" ? brief.brand_trust_score : null,
      pricing: typeof brief.pricing_score === "number" ? brief.pricing_score : null,
      market_maturity: typeof brief.market_maturity_score === "number" ? brief.market_maturity_score : null,
      feature_breadth: typeof brief.feature_breadth_score === "number" ? brief.feature_breadth_score : null,
      managed_service: typeof brief.managed_service_score === "number" ? brief.managed_service_score : null,
      llm_included: typeof brief.llm_included_score === "number" ? brief.llm_included_score : null
    }
  };
}

async function toolGetDeepDives(slug: string, limit = 3) {
  const c = await prisma.competitor.findUnique({
    where: { slug },
    select: { id: true, name: true, isSelf: true }
  });

  if (!c || c.isSelf) return { error: "competitor_not_found", slug };

  const dives = await prisma.deepDive.findMany({
    where: { competitorId: c.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 10)
  });

  return {
    competitor: c.name,
    slug,
    deep_dives: dives.map((dd) => {
      const result = asObj(dd.result);
      const report =
        typeof result?.report === "string"
          ? result.report
          : typeof dd.result === "string"
            ? dd.result
            : result
              ? JSON.stringify(result)
              : null;
      return {
        id: dd.id,
        created_at: dd.createdAt.toISOString(),
        mode: dd.mode,
        query: dd.query,
        report,
        citations: (Array.isArray(dd.citations) ? dd.citations : []).map((c_: unknown) => {
          const co = asObj(c_);
          return {
            claim: typeof co?.claim === "string" ? co.claim : null,
            source_url: typeof co?.source_url === "string" ? co.source_url : null,
            source_text: typeof co?.source_text === "string" ? co.source_text : null
          };
        })
      };
    })
  };
}

async function toolListRecentIntel(params: {
  since?: string;
  until?: string;
  competitor?: string;
  page_type?: string;
  limit?: number;
}) {
  const since = params.since ? parseDateArg(params.since, "since") : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = params.until ? parseDateArg(params.until, "until") : new Date();
  const limit = Math.min(params.limit ?? 50, 200);

  const baseWhere = params.competitor
    ? { page: { competitor: { slug: params.competitor } } }
    : { page: { competitor: { isSelf: false } } };

  const scans = await prisma.scan.findMany({
    where: {
      hasChanges: true,
      scannedAt: { gte: since, lte: until },
      ...(params.page_type ? { page: { ...baseWhere.page, type: params.page_type } } : baseWhere)
    },
    include: {
      page: { include: { competitor: { select: { name: true, slug: true } } } }
    },
    orderBy: { scannedAt: "desc" },
    take: limit + 1
  });

  const hasMore = scans.length > limit;
  const entries = scans.slice(0, limit);

  return {
    entries: entries.map((s) => ({
      id: s.id,
      competitor: s.page.competitor.name,
      competitor_slug: s.page.competitor.slug,
      page_type: s.page.type,
      detected_at: s.scannedAt.toISOString(),
      summary: s.diffSummary ?? null,
      source_url: s.page.url
    })),
    total: entries.length,
    has_more: hasMore
  };
}

async function toolGetCompetitorDiff(competitor: string, pageType: string, at?: string) {
  const comp = await prisma.competitor.findUnique({
    where: { slug: competitor },
    select: { id: true, name: true, isSelf: true }
  });

  if (!comp || comp.isSelf) return { error: "competitor_not_found", competitor };

  // orderBy: createdAt asc → deterministic when multiple pages share the same type (e.g. geo variants)
  const page = await prisma.competitorPage.findFirst({
    where: { competitorId: comp.id, type: pageType },
    orderBy: { createdAt: "asc" }
  });

  if (!page) return { error: "page_type_not_tracked", competitor, page_type: pageType };

  const atFilter = at ? { scannedAt: { lte: parseDateArg(at, "at") } } : {};

  const scan = await prisma.scan.findFirst({
    where: { pageId: page.id, hasChanges: true, ...atFilter },
    orderBy: { scannedAt: "desc" }
  });

  if (!scan) return { error: "no_diff_available", competitor, page_type: pageType };

  const prevScan = await prisma.scan.findFirst({
    where: { pageId: page.id, scannedAt: { lt: scan.scannedAt } },
    orderBy: { scannedAt: "desc" }
  });

  const after = truncateContent(rawToText(scan.rawResult) ?? scan.markdownResult);
  const before = truncateContent(rawToText(prevScan?.rawResult) ?? prevScan?.markdownResult ?? null);

  return {
    competitor: comp.name,
    page_type: pageType,
    detected_at: scan.scannedAt.toISOString(),
    source_url: page.url,
    before: before.content,
    after: after.content,
    summary: scan.diffSummary ?? null,
    truncated: after.wasTruncated || before.wasTruncated
  };
}

async function toolSearchIntel(query: string, since?: string, limit = 25) {
  const sinceDate = since ? parseDateArg(since, "since") : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const safeLimit = Math.min(limit, 100);

  const scans = await prisma.scan.findMany({
    where: {
      hasChanges: true,
      scannedAt: { gte: sinceDate },
      page: { competitor: { isSelf: false } },
      OR: [
        { diffSummary: { contains: query, mode: "insensitive" } },
        { summary: { contains: query, mode: "insensitive" } }
      ]
    },
    include: {
      page: { include: { competitor: { select: { name: true, slug: true } } } }
    },
    orderBy: { scannedAt: "desc" },
    take: safeLimit + 1
  });

  const hasMore = scans.length > safeLimit;
  const entries = scans.slice(0, safeLimit);

  return {
    entries: entries.map((s) => ({
      id: s.id,
      competitor: s.page.competitor.name,
      competitor_slug: s.page.competitor.slug,
      page_type: s.page.type,
      detected_at: s.scannedAt.toISOString(),
      summary: s.diffSummary ?? null,
      source_url: s.page.url
    })),
    total: entries.length,
    has_more: hasMore
  };
}

// ── Tool registry ─────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;

const TOOL_DEFS = [
  {
    name: "list_competitors",
    description:
      "List all tracked competitors with threat tier, health score, and last change timestamp. Sorted high → low threat.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_competitor",
    description:
      "Full snapshot for a single competitor — threat tier, health, all tracked pages with last change, and manual data (funding, traffic, G2).",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Competitor slug e.g. 'firecrawl'" } },
      required: ["slug"]
    }
  },
  {
    name: "get_competitor_data",
    description:
      "Current structured extracted data for a competitor — pricing tiers, open roles, tech stack from JDs, GitHub stats, blog topics, review themes. Optionally filter by page_type.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        page_type: {
          type: "string",
          description:
            "Filter to one page type: pricing | careers | github | blog | homepage | profile | reviews | social | docs | stack | changelog"
        }
      },
      required: ["slug"]
    }
  },
  {
    name: "get_intelligence_brief",
    description:
      "AI-generated intelligence brief — positioning/content/product opportunities, threat reasoning, watch list, and all 7 competitive axis scores.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"]
    }
  },
  {
    name: "get_deep_dives",
    description:
      "Research reports from Rival's deep dive feature — multi-pass agentic competitive research with inline citations.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        limit: { type: "number", description: "Number of reports to return (1–10, default 3)" }
      },
      required: ["slug"]
    }
  },
  {
    name: "list_recent_intel",
    description:
      "The intel feed — recent competitor changes, filterable by time window, competitor slug, and page type.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "ISO 8601 timestamp (default: 7 days ago)" },
        until: { type: "string", description: "ISO 8601 timestamp (default: now)" },
        competitor: { type: "string", description: "Filter by competitor slug" },
        page_type: { type: "string", description: "Filter by page type" },
        limit: { type: "number", description: "Max results (default 50, max 200)" }
      },
      required: []
    }
  },
  {
    name: "get_competitor_diff",
    description:
      "Before/after content for a specific competitor change. Use to extract exact positioning language, pricing changes, or feature additions.",
    inputSchema: {
      type: "object",
      properties: {
        competitor: { type: "string", description: "Competitor slug" },
        page_type: { type: "string", description: "Page type to inspect" },
        at: {
          type: "string",
          description: "ISO 8601 timestamp — returns most recent change at or before this time (default: most recent)"
        }
      },
      required: ["competitor", "page_type"]
    }
  },
  {
    name: "search_intel",
    description:
      "Full-text search across the intel feed. Find signals: 'who changed pricing', 'competitors mention MCP', 'DevRel hiring'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        since: { type: "string", description: "ISO 8601 timestamp (default: 30 days ago)" },
        limit: { type: "number", description: "Max results (default 25, max 100)" }
      },
      required: ["query"]
    }
  }
] as const;

async function callTool(name: string, args: ToolArgs): Promise<unknown> {
  switch (name) {
    case "list_competitors":
      return toolListCompetitors();
    case "get_competitor":
      return toolGetCompetitor(args.slug as string);
    case "get_competitor_data":
      return toolGetCompetitorData(args.slug as string, args.page_type as string | undefined);
    case "get_intelligence_brief":
      return toolGetIntelligenceBrief(args.slug as string);
    case "get_deep_dives":
      return toolGetDeepDives(args.slug as string, args.limit as number | undefined);
    case "list_recent_intel":
      return toolListRecentIntel(
        args as { since?: string; until?: string; competitor?: string; page_type?: string; limit?: number }
      );
    case "get_competitor_diff":
      return toolGetCompetitorDiff(args.competitor as string, args.page_type as string, args.at as string | undefined);
    case "search_intel":
      return toolSearchIntel(args.query as string, args.since as string | undefined, args.limit as number | undefined);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP JSON-RPC handler ──────────────────────────────────────────────────────

const SERVER_INFO = { name: "rival", version: "0.1.0" };
const PROTOCOL_VERSION = "2024-11-05";

type JsonRpcBody = {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: JsonRpcBody;
  try {
    body = (await request.json()) as JsonRpcBody;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  const { id, method, params } = body;

  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO
        }
      });

    case "notifications/initialized":
      return new NextResponse(null, { status: 202 });

    case "tools/list":
      return NextResponse.json({ jsonrpc: "2.0", id, result: { tools: TOOL_DEFS } });

    case "tools/call": {
      const p = params as { name?: string; arguments?: ToolArgs } | undefined;
      const toolName = p?.name ?? "";
      const toolArgs = p?.arguments ?? {};

      if (!toolName) {
        return NextResponse.json(
          { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } },
          { status: 400 }
        );
      }

      try {
        const result = await callTool(toolName, toolArgs);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
        });
      } catch (err) {
        return NextResponse.json(
          { jsonrpc: "2.0", id, error: { code: -32000, message: err instanceof Error ? err.message : "Tool error" } },
          { status: 400 }
        );
      }
    }

    default:
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } },
        { status: 400 }
      );
  }
}
