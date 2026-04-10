import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listCompetitorsMock, hasValidInternalApiKeyMock, isSameOriginRequestMock } = vi.hoisted(() => ({
  listCompetitorsMock: vi.fn(),
  hasValidInternalApiKeyMock: vi.fn(),
  isSameOriginRequestMock: vi.fn()
}));

vi.mock("@/lib/db/competitors", () => ({ listCompetitors: listCompetitorsMock }));
vi.mock("@/app/api/_lib/auth", () => ({
  hasValidInternalApiKey: hasValidInternalApiKeyMock,
  isSameOriginRequest: isSameOriginRequestMock
}));

const COMPETITOR = { id: "cmp_1", name: "Acme", slug: "acme", pages: [] };

describe("GET /api/competitors", () => {
  beforeEach(() => {
    listCompetitorsMock.mockReset();
    hasValidInternalApiKeyMock.mockReset();
    isSameOriginRequestMock.mockReset();
    listCompetitorsMock.mockResolvedValue([COMPETITOR]);
  });

  it("returns 403 when request is not authorized", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/competitors/route");
    const req = new NextRequest("http://localhost/api/competitors");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns competitors when authorized via API key", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/competitors/route");
    const req = new NextRequest("http://localhost/api/competitors");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ competitors: [COMPETITOR] });
    expect(listCompetitorsMock).toHaveBeenCalledWith({ includePages: true });
  });

  it("returns competitors when authorized via same-origin", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    isSameOriginRequestMock.mockReturnValue(true);
    const { GET } = await import("@/app/api/competitors/route");
    const req = new NextRequest("http://localhost/api/competitors");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 when listCompetitors throws", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    listCompetitorsMock.mockRejectedValueOnce(new Error("DB connection failed"));
    const { GET } = await import("@/app/api/competitors/route");
    const req = new NextRequest("http://localhost/api/competitors");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "DB connection failed" });
  });
});
