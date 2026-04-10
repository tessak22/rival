import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { scanPageMock, generateBriefMock, competitorFindManyMock } = vi.hoisted(() => ({
  scanPageMock: vi.fn(),
  generateBriefMock: vi.fn(),
  competitorFindManyMock: vi.fn()
}));

vi.mock("@/lib/scanner", () => ({ scanPage: scanPageMock }));
vi.mock("@/lib/brief", () => ({ generateCompetitorBrief: generateBriefMock }));
vi.mock("@/lib/db/client", () => ({
  prisma: { competitor: { findMany: competitorFindManyMock } }
}));

const PAGE = { id: "page_1", label: "Pricing", url: "https://example.com/pricing", type: "pricing", geoTarget: null };
const COMPETITOR = { id: "cmp_1", pages: [PAGE] };

function cronRequest(secret: string): NextRequest {
  return new NextRequest("http://localhost/api/cron", {
    method: "POST",
    headers: { "x-cron-secret": secret }
  });
}

describe("POST /api/cron", () => {
  beforeEach(() => {
    scanPageMock.mockReset();
    generateBriefMock.mockReset();
    competitorFindManyMock.mockReset();
    vi.unstubAllEnvs();
    scanPageMock.mockResolvedValue({ status: "success" });
    generateBriefMock.mockResolvedValue({});
    competitorFindManyMock.mockResolvedValue([COMPETITOR]);
  });

  it("returns 401 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { POST } = await import("@/app/api/cron/route");
    const res = await POST(cronRequest("secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret does not match", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const { POST } = await import("@/app/api/cron/route");
    const res = await POST(cronRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("scans all competitors and returns summary when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { POST } = await import("@/app/api/cron/route");
    const res = await POST(cronRequest("secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.competitors).toBe(1);
    expect(body.summary).toHaveLength(1);
    expect(body.summary[0].pagesScanned).toBe(1);
    expect(body.summary[0].briefGenerated).toBe(true);
  });

  it("records errors per page without throwing", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    scanPageMock.mockRejectedValueOnce(new Error("Scan failed"));
    const { POST } = await import("@/app/api/cron/route");
    const res = await POST(cronRequest("secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary[0].pagesScanned).toBe(0);
    expect(body.summary[0].errors[0]).toMatch(/page page_1/);
  });

  it("records brief error without throwing", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    generateBriefMock.mockRejectedValueOnce(new Error("Brief failed"));
    const { POST } = await import("@/app/api/cron/route");
    const res = await POST(cronRequest("secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary[0].briefGenerated).toBe(false);
    expect(body.summary[0].errors[0]).toMatch(/brief/);
  });
});
