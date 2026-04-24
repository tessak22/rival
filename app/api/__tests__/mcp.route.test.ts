import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  competitorFindManyMock,
  competitorFindUniqueMock,
  competitorPageFindManyMock,
  competitorPageFindFirstMock,
  scanFindManyMock,
  scanFindFirstMock,
  deepDiveFindManyMock
} = vi.hoisted(() => ({
  competitorFindManyMock: vi.fn(),
  competitorFindUniqueMock: vi.fn(),
  competitorPageFindManyMock: vi.fn(),
  competitorPageFindFirstMock: vi.fn(),
  scanFindManyMock: vi.fn(),
  scanFindFirstMock: vi.fn(),
  deepDiveFindManyMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: { findMany: competitorFindManyMock, findUnique: competitorFindUniqueMock },
    competitorPage: { findMany: competitorPageFindManyMock, findFirst: competitorPageFindFirstMock },
    scan: { findMany: scanFindManyMock, findFirst: scanFindFirstMock },
    deepDive: { findMany: deepDiveFindManyMock }
  }
}));

const TOKEN = "test-secret";

function makeRequest(body: unknown, token?: string): NextRequest {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token !== undefined ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function rpc(method: string, params?: unknown, id = 1) {
  return { jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) };
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RIVAL_MCP_TOKEN = TOKEN;
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when no Authorization header is provided", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/list")));
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong token is provided", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/list"), "wrong-token"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when RIVAL_MCP_TOKEN is not set", async () => {
    delete process.env.RIVAL_MCP_TOKEN;
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/list"), TOKEN));
    expect(res.status).toBe(401);
  });

  // ── MCP protocol ──────────────────────────────────────────────────────────

  it("handles initialize and returns server capabilities", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "claude" } }), TOKEN));
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.serverInfo.name).toBe("rival");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("handles notifications/initialized with 202 and no body", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("notifications/initialized"), TOKEN));
    expect(res.status).toBe(202);
  });

  it("returns all 8 tools from tools/list", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/list"), TOKEN));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("list_competitors");
    expect(names).toContain("get_competitor");
    expect(names).toContain("get_competitor_data");
    expect(names).toContain("get_intelligence_brief");
    expect(names).toContain("get_deep_dives");
    expect(names).toContain("list_recent_intel");
    expect(names).toContain("get_competitor_diff");
    expect(names).toContain("search_intel");
    expect(names).toHaveLength(8);
  });

  it("returns 400 for unknown method", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("unknown/method"), TOKEN));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const req = new NextRequest("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: "{ bad json"
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  // ── list_competitors ──────────────────────────────────────────────────────

  it("tools/call list_competitors returns sorted competitor list", async () => {
    competitorFindManyMock.mockResolvedValue([
      { id: "1", name: "Low Corp", slug: "low-corp", baseUrl: "https://low.co", threatLevel: "Low", isSelf: false, pages: [], apiLogs: [] },
      { id: "2", name: "High Corp", slug: "high-corp", baseUrl: "https://high.co", threatLevel: "High", isSelf: false, pages: [], apiLogs: [] }
    ]);

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "list_competitors", arguments: {} }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.competitors[0].slug).toBe("high-corp");
    expect(result.competitors[1].slug).toBe("low-corp");
  });

  // ── get_competitor ────────────────────────────────────────────────────────

  it("tools/call get_competitor returns competitor_not_found for unknown slug", async () => {
    competitorFindUniqueMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_competitor", arguments: { slug: "nobody" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.error).toBe("competitor_not_found");
  });

  it("tools/call get_competitor returns full snapshot", async () => {
    competitorFindUniqueMock.mockResolvedValue({
      id: "1", name: "Acme", slug: "acme", baseUrl: "https://acme.com",
      threatLevel: "High", isSelf: false,
      manualData: { g2_rating: 4.5, total_funding: "$10M" },
      pages: [],
      apiLogs: [{ resultQuality: "full" }, { resultQuality: "partial" }]
    });
    // No changed scans since pages is empty
    scanFindManyMock.mockResolvedValue([]);

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_competitor", arguments: { slug: "acme" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.name).toBe("Acme");
    expect(result.threat_tier).toBe("high");
    expect(result.manual_data.g2_rating).toBe(4.5);
    expect(result.health_score).toBe(75); // (1 + 0.5) / 2 = 0.75
  });

  it("tools/call get_competitor surfaces last_changed_at from non-latest scan", async () => {
    const pageId = "page-1";
    competitorFindUniqueMock.mockResolvedValue({
      id: "1", name: "Acme", slug: "acme", baseUrl: "https://acme.com",
      threatLevel: "High", isSelf: false, manualData: null,
      pages: [{ id: pageId, type: "pricing", label: "Pricing", url: "https://acme.com/pricing", geoTarget: null, scans: [{ scannedAt: new Date("2026-04-20") }] }],
      apiLogs: []
    });
    // The latest scan (2026-04-20) had no changes; the change was earlier (2026-04-01)
    scanFindManyMock.mockResolvedValue([
      { pageId, scannedAt: new Date("2026-04-01"), diffSummary: "Price went up" }
    ]);

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_competitor", arguments: { slug: "acme" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    const pricingPage = result.tracked_pages.find((p: { page_type: string }) => p.page_type === "pricing");
    expect(pricingPage.last_checked_at).toBe("2026-04-20T00:00:00.000Z");
    expect(pricingPage.last_changed_at).toBe("2026-04-01T00:00:00.000Z");
    expect(pricingPage.latest_summary).toBe("Price went up");
  });

  // ── get_intelligence_brief ────────────────────────────────────────────────

  it("tools/call get_intelligence_brief returns no_brief_available when brief is null", async () => {
    competitorFindUniqueMock.mockResolvedValue({
      name: "Acme", slug: "acme", isSelf: false, intelligenceBrief: null, briefGeneratedAt: null, threatLevel: "High"
    });

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_intelligence_brief", arguments: { slug: "acme" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.error).toBe("no_brief_available");
  });

  it("tools/call get_intelligence_brief returns all brief fields and axis scores", async () => {
    competitorFindUniqueMock.mockResolvedValue({
      name: "Acme", slug: "acme", isSelf: false,
      threatLevel: "High",
      briefGeneratedAt: new Date("2026-04-01T00:00:00Z"),
      intelligenceBrief: {
        threat_level: "High",
        threat_reasoning: "Active competitor",
        positioning_opportunity: "Fill the gap",
        content_opportunity: "Own the docs space",
        product_opportunity: "Better SDK",
        watch_list: ["pricing change", "new hire"],
        openness_score: 3,
        brand_trust_score: 7,
        pricing_score: 6,
        market_maturity_score: 8,
        feature_breadth_score: 5,
        managed_service_score: 9,
        llm_included_score: 4
      }
    });

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_intelligence_brief", arguments: { slug: "acme" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.positioning_opportunity).toBe("Fill the gap");
    expect(result.watch_list).toEqual(["pricing change", "new hire"]);
    expect(result.axis_scores.openness).toBe(3);
    expect(result.axis_scores.llm_included).toBe(4);
  });

  // ── get_competitor_diff ───────────────────────────────────────────────────

  it("tools/call get_competitor_diff truncates content over 8000 chars", async () => {
    competitorFindUniqueMock.mockResolvedValue({ id: "1", name: "Acme", isSelf: false });
    competitorPageFindFirstMock.mockResolvedValue({ id: "p1", url: "https://acme.com/pricing", type: "pricing" });
    scanFindFirstMock
      .mockResolvedValueOnce({
        id: "s1",
        scannedAt: new Date("2026-04-01"),
        hasChanges: true,
        rawResult: { tiers: [] },
        markdownResult: null,
        diffSummary: "Prices changed"
      })
      .mockResolvedValueOnce({
        id: "s0",
        scannedAt: new Date("2026-03-01"),
        rawResult: "x".repeat(9000),
        markdownResult: null
      });

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_competitor_diff", arguments: { competitor: "acme", page_type: "pricing" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.truncated).toBe(true);
    expect(result.before).toContain("[truncated]");
  });

  // ── search_intel ──────────────────────────────────────────────────────────

  it("tools/call search_intel returns matching entries", async () => {
    scanFindManyMock.mockResolvedValue([
      {
        id: "s1",
        scannedAt: new Date("2026-04-10"),
        diffSummary: "Added MCP support",
        page: { type: "changelog", url: "https://a.co/changelog", competitor: { name: "Alpha", slug: "alpha" } }
      }
    ]);

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "search_intel", arguments: { query: "MCP" } }), TOKEN));
    const body = await res.json();
    const result = JSON.parse(body.result.content[0].text);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].summary).toBe("Added MCP support");
  });

  // ── date validation ───────────────────────────────────────────────────────

  it("tools/call list_recent_intel returns error for invalid since date", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "list_recent_intel", arguments: { since: "not-a-date" } }), TOKEN));
    const body = await res.json();
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toContain("Invalid date");
    expect(body.error.message).toContain("since");
  });

  it("tools/call get_competitor_diff returns error for invalid at date", async () => {
    competitorFindUniqueMock.mockResolvedValue({ id: "1", name: "Acme", isSelf: false });
    competitorPageFindFirstMock.mockResolvedValue({ id: "p1", url: "https://acme.com/pricing", type: "pricing" });

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "get_competitor_diff", arguments: { competitor: "acme", page_type: "pricing", at: "banana" } }), TOKEN));
    const body = await res.json();
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toContain("Invalid date");
  });

  // ── unknown tool ──────────────────────────────────────────────────────────

  it("tools/call returns error for unknown tool name", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeRequest(rpc("tools/call", { name: "nonexistent_tool", arguments: {} }), TOKEN));
    const body = await res.json();
    expect(body.error.code).toBe(-32000);
    expect(body.error.message).toContain("Unknown tool");
  });
});
