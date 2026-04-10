import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { notificationFindManyMock, hasValidInternalApiKeyMock, isSameOriginRequestMock } = vi.hoisted(
  () => ({
    notificationFindManyMock: vi.fn(),
    hasValidInternalApiKeyMock: vi.fn(),
    isSameOriginRequestMock: vi.fn()
  })
);

vi.mock("@/lib/db/client", () => ({
  prisma: { notification: { findMany: notificationFindManyMock } }
}));
vi.mock("@/app/api/_lib/auth", () => ({
  hasValidInternalApiKey: hasValidInternalApiKeyMock,
  isSameOriginRequest: isSameOriginRequestMock
}));

const NOTIFICATION = {
  id: "notif_1",
  competitorId: "cmp_1",
  sentAt: new Date("2026-04-01T00:00:00Z"),
  competitor: { id: "cmp_1", name: "Acme" },
  scan: { id: "scan_1", page: { id: "page_1" } }
};

describe("GET /api/notifications", () => {
  beforeEach(() => {
    notificationFindManyMock.mockReset();
    hasValidInternalApiKeyMock.mockReset();
    isSameOriginRequestMock.mockReset();
    notificationFindManyMock.mockResolvedValue([NOTIFICATION]);
  });

  it("returns 403 when not authorized", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new NextRequest("http://localhost/api/notifications");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns notifications when authorized", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new NextRequest("http://localhost/api/notifications");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
  });

  it("filters by competitorId query param", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new NextRequest("http://localhost/api/notifications?competitorId=cmp_1");
    await GET(req);
    expect(notificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { competitorId: "cmp_1" } })
    );
  });

  it("defaults limit to 50", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new NextRequest("http://localhost/api/notifications");
    await GET(req);
    expect(notificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it("clamps limit to 200 max", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new NextRequest("http://localhost/api/notifications?limit=999");
    await GET(req);
    expect(notificationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it("returns 500 on DB error", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(false);
    notificationFindManyMock.mockRejectedValueOnce(new Error("DB error"));
    const { GET } = await import("@/app/api/notifications/route");
    const req = new NextRequest("http://localhost/api/notifications");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
