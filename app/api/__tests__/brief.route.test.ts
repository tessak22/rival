import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { generateBriefMock, hasValidInternalApiKeyMock } = vi.hoisted(() => ({
  generateBriefMock: vi.fn(),
  hasValidInternalApiKeyMock: vi.fn()
}));

vi.mock("@/lib/brief", () => ({ generateCompetitorBrief: generateBriefMock }));
vi.mock("@/app/api/_lib/auth", () => ({
  hasValidInternalApiKey: hasValidInternalApiKeyMock,
  isSameOriginRequest: vi.fn().mockReturnValue(false)
}));

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/brief", () => {
  beforeEach(() => {
    generateBriefMock.mockReset();
    hasValidInternalApiKeyMock.mockReset();
    generateBriefMock.mockResolvedValue({ summary: "Acme is a competitor" });
  });

  it("returns 401 when API key is missing", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    const { POST } = await import("@/app/api/brief/route");
    const req = jsonRequest("http://localhost/api/brief", { competitorId: "cmp_1" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when competitorId is missing", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    const { POST } = await import("@/app/api/brief/route");
    const req = jsonRequest("http://localhost/api/brief", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("competitorId is required");
  });

  it("returns 200 with brief when authorized and competitorId provided", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    const { POST } = await import("@/app/api/brief/route");
    const req = jsonRequest("http://localhost/api/brief", { competitorId: "cmp_1" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ brief: { summary: "Acme is a competitor" } });
    expect(generateBriefMock).toHaveBeenCalledWith("cmp_1", true);
  });

  it("returns 404 when competitor is not found", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    generateBriefMock.mockRejectedValueOnce(new Error("Competitor not found"));
    const { POST } = await import("@/app/api/brief/route");
    const req = jsonRequest("http://localhost/api/brief", { competitorId: "missing" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 500 on unexpected error", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    generateBriefMock.mockRejectedValueOnce(new Error("Network timeout"));
    const { POST } = await import("@/app/api/brief/route");
    const req = jsonRequest("http://localhost/api/brief", { competitorId: "cmp_1" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Network timeout");
  });
});
