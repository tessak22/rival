import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  competitorFindUniqueMock,
  competitorPageFindManyMock,
  scanFindManyMock,
  fetchMock
} = vi.hoisted(() => ({
  competitorFindUniqueMock: vi.fn(),
  competitorPageFindManyMock: vi.fn(),
  scanFindManyMock: vi.fn(),
  fetchMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: { findUnique: competitorFindUniqueMock },
    competitorPage: { findMany: competitorPageFindManyMock },
    scan: { findMany: scanFindManyMock }
  }
}));

vi.stubGlobal("fetch", fetchMock);

const COMPETITOR_ID = "comp-1";
const NAME = "Acme";
const BASE_URL = "https://acme.com";

function makeOkResponse(body: unknown) {
  const sse = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
  return { ok: true, text: async () => sse } as unknown as Response;
}

describe("pushCompetitorToQuiver", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.QUIVER_MCP_URL = "https://quiver.example.com/api/mcp";
    process.env.QUIVER_MCP_SECRET = "test-secret";

    competitorFindUniqueMock.mockResolvedValue({
      threatLevel: "High",
      intelligenceBrief: {
        threat_reasoning: "Direct competitor",
        positioning_opportunity: "Fill the gap",
        content_opportunity: "Own the docs space",
        product_opportunity: "Better SDK",
        watch_list: ["pricing change signal"]
      },
      manualData: { total_funding: "$20M", employee_count: 120 }
    });
    competitorPageFindManyMock.mockResolvedValue([]);
    scanFindManyMock.mockResolvedValue([]);
    fetchMock.mockResolvedValue(makeOkResponse({ result: { entry_id: "e1", processing: true } }));
  });

  it("does nothing when QUIVER_MCP_URL is not set", async () => {
    delete process.env.QUIVER_MCP_URL;
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when QUIVER_MCP_SECRET is not set", async () => {
    delete process.env.QUIVER_MCP_SECRET;
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to QUIVER_MCP_URL with bearer auth", async () => {
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://quiver.example.com/api/mcp");
    expect((opts.headers as Record<string, string>).authorization).toBe("Bearer test-secret");
  });

  it("calls save_research_entry via MCP tools/call", async () => {
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("save_research_entry");
    expect(body.params.arguments.source_type).toBe("other");
    expect(body.params.arguments.contact_company).toBe(NAME);
    expect(body.params.arguments.title).toMatch(/^Rival: Acme — \d{4}-\d{2}-\d{2}$/);
  });

  it("includes intelligence brief content in raw_notes", async () => {
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const rawNotes: string = body.params.arguments.raw_notes;
    expect(rawNotes).toContain("Direct competitor");
    expect(rawNotes).toContain("Fill the gap");
    expect(rawNotes).toContain("pricing change signal");
  });

  it("includes recent changes in raw_notes", async () => {
    scanFindManyMock.mockResolvedValue([
      {
        diffSummary: "Added enterprise tier",
        page: { label: "Pricing", type: "pricing" }
      }
    ]);

    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.params.arguments.raw_notes).toContain("Added enterprise tier");
  });

  it("includes pricing data when a pricing scan exists", async () => {
    competitorPageFindManyMock.mockResolvedValue([
      {
        type: "pricing",
        scans: [{
          rawResult: {
            pricing_transparent: false,
            has_free_tier: false,
            tiers: [{ name: "Pro", price: "$99/mo", is_self_serve: true }]
          }
        }]
      }
    ]);

    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.params.arguments.raw_notes).toContain("Pro");
    expect(body.params.arguments.raw_notes).toContain("$99/mo");
  });

  it("does not throw when fetch fails — errors are swallowed", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await expect(pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL)).resolves.toBeUndefined();
  });

  it("does not throw when Quiver returns a non-OK response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "" } as unknown as Response);
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await expect(pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL)).resolves.toBeUndefined();
  });

  it("does not throw when Quiver returns a JSON-RPC error", async () => {
    fetchMock.mockResolvedValueOnce(
      makeOkResponse({ error: { code: -32000, message: "Something went wrong" } })
    );
    const { pushCompetitorToQuiver } = await import("@/lib/quiver");
    await expect(pushCompetitorToQuiver(COMPETITOR_ID, NAME, BASE_URL)).resolves.toBeUndefined();
  });
});
