import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSelfCompetitorMock, hasValidInternalApiKeyMock, isSameOriginRequestMock } = vi.hoisted(() => ({
  getSelfCompetitorMock: vi.fn(),
  hasValidInternalApiKeyMock: vi.fn(),
  isSameOriginRequestMock: vi.fn()
}));

vi.mock("@/lib/db/competitors", () => ({
  getSelfCompetitor: getSelfCompetitorMock
}));

vi.mock("@/app/api/_lib/auth", () => ({
  hasValidInternalApiKey: hasValidInternalApiKeyMock,
  isSameOriginRequest: isSameOriginRequestMock
}));

describe("GET /api/self", () => {
  beforeEach(() => {
    getSelfCompetitorMock.mockReset();
    hasValidInternalApiKeyMock.mockReset();
    isSameOriginRequestMock.mockReset();
  });

  it("returns 403 when neither internal key nor same origin", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/self/route");
    const req = new NextRequest("http://localhost/api/self");
    const response = await GET(req);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with self payload when same-origin request and self row exists", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    isSameOriginRequestMock.mockReturnValue(true);
    getSelfCompetitorMock.mockResolvedValue({ id: "self_1", name: "Rival", slug: "rival", isSelf: true, pages: [] });
    const { GET } = await import("@/app/api/self/route");
    const req = new NextRequest("http://localhost/api/self");
    const response = await GET(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.self?.name).toBe("Rival");
    expect(body.self?.isSelf).toBe(true);
  });

  it("returns 200 with self: null when no self row exists", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    getSelfCompetitorMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/self/route");
    const req = new NextRequest("http://localhost/api/self");
    const response = await GET(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.self).toBeNull();
  });

  it("returns 500 when the DB query throws", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    getSelfCompetitorMock.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/self/route");
    const req = new NextRequest("http://localhost/api/self");
    const response = await GET(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/db down/);
  });
});
