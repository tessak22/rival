import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runResearchMock, competitorFindUniqueMock, deepDiveCreateMock } = vi.hoisted(() => ({
  runResearchMock: vi.fn(),
  competitorFindUniqueMock: vi.fn(),
  deepDiveCreateMock: vi.fn()
}));

vi.mock("@/lib/tabstack/research", () => ({ runResearch: runResearchMock }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: { findUnique: competitorFindUniqueMock },
    deepDive: { create: deepDiveCreateMock }
  }
}));

const COMPETITOR = { id: "cmp_1", name: "Acme" };
const RESEARCH_RESULT = {
  result: { summary: "Acme is a strong competitor" },
  citations: ["https://example.com"],
  events: [{ event: "progress", data: "Researching..." }]
};

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/deep-dive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/deep-dive", () => {
  beforeEach(() => {
    runResearchMock.mockReset();
    competitorFindUniqueMock.mockReset();
    deepDiveCreateMock.mockReset();
    runResearchMock.mockResolvedValue(RESEARCH_RESULT);
    competitorFindUniqueMock.mockResolvedValue(COMPETITOR);
    deepDiveCreateMock.mockResolvedValue({});
  });

  it("returns 400 when competitorId is missing", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("competitorId is required");
  });

  it("returns 404 when competitor is not found", async () => {
    competitorFindUniqueMock.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({ competitorId: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns a streaming SSE response for valid request", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    const res = await POST(jsonRequest({ competitorId: "cmp_1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("defaults mode to balanced", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    await POST(jsonRequest({ competitorId: "cmp_1" }));
    expect(runResearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "balanced", nocache: true })
    );
  });

  it("respects provided mode", async () => {
    const { POST } = await import("@/app/api/deep-dive/route");
    await POST(jsonRequest({ competitorId: "cmp_1", mode: "fast" }));
    expect(runResearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "fast" })
    );
  });
});
