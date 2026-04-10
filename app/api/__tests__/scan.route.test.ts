import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  scanPageMock,
  generateBriefMock,
  hasValidInternalApiKeyMock,
  competitorPageFindUniqueMock,
  competitorFindUniqueMock
} = vi.hoisted(() => ({
  scanPageMock: vi.fn(),
  generateBriefMock: vi.fn(),
  hasValidInternalApiKeyMock: vi.fn(),
  competitorPageFindUniqueMock: vi.fn(),
  competitorFindUniqueMock: vi.fn()
}));

vi.mock("@/lib/scanner", () => ({ scanPage: scanPageMock }));
vi.mock("@/lib/brief", () => ({ generateCompetitorBrief: generateBriefMock }));
vi.mock("@/app/api/_lib/auth", () => ({
  hasValidInternalApiKey: hasValidInternalApiKeyMock,
  isSameOriginRequest: vi.fn().mockReturnValue(false)
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitorPage: { findUnique: competitorPageFindUniqueMock },
    competitor: { findUnique: competitorFindUniqueMock }
  }
}));

const PAGE = { id: "page_1", competitorId: "cmp_1", label: "Pricing", url: "https://example.com/pricing", type: "pricing", geoTarget: null };
const COMPETITOR = { id: "cmp_1", name: "Acme", pages: [PAGE] };
const SCAN_RESULT = { pageId: "page_1", status: "success" };

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/scan", () => {
  beforeEach(() => {
    scanPageMock.mockReset();
    generateBriefMock.mockReset();
    hasValidInternalApiKeyMock.mockReset();
    competitorPageFindUniqueMock.mockReset();
    competitorFindUniqueMock.mockReset();
    scanPageMock.mockResolvedValue(SCAN_RESULT);
    generateBriefMock.mockResolvedValue({});
  });

  it("returns 401 when API key is missing", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when neither competitorId nor pageId provided", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("competitorId or pageId is required");
  });

  it("scans a single page when pageId is provided", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    competitorPageFindUniqueMock.mockResolvedValue(PAGE);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ pageId: "page_1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([SCAN_RESULT]);
  });

  it("returns 404 when pageId is not found", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    competitorPageFindUniqueMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ pageId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("scans all pages for a competitor when competitorId is provided", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1" }));
    expect(res.status).toBe(200);
    expect(scanPageMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when competitor is not found", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    competitorFindUniqueMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ competitorId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("runs brief generation when runBrief is true", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1", runBrief: true }));
    expect(res.status).toBe(200);
    expect(generateBriefMock).toHaveBeenCalledWith("cmp_1", false);
  });

  it("returns 409 when brief generation fails", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    generateBriefMock.mockRejectedValueOnce(new Error("Brief failed"));
    const { POST } = await import("@/app/api/scan/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1", runBrief: true }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.briefError).toBe("Brief failed");
  });
});
