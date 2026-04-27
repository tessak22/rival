import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const {
  scanPageMock,
  inferBlogPageTypeMock,
  inferPageTypeFromUrlMock,
  demoIpLockCreateMock,
  demoIpLockDeleteMock,
  demoScanCountMock,
  demoScanCreateMock,
  generateDemoBriefMock
} = vi.hoisted(() => ({
  scanPageMock: vi.fn(),
  inferBlogPageTypeMock: vi.fn(),
  inferPageTypeFromUrlMock: vi.fn(),
  demoIpLockCreateMock: vi.fn(),
  demoIpLockDeleteMock: vi.fn(),
  demoScanCountMock: vi.fn(),
  demoScanCreateMock: vi.fn(),
  generateDemoBriefMock: vi.fn()
}));

vi.mock("@/lib/scanner", () => ({
  scanPage: scanPageMock,
  inferBlogPageType: inferBlogPageTypeMock,
  inferPageTypeFromUrl: inferPageTypeFromUrlMock
}));
vi.mock("@/lib/tabstack/generate", () => ({ generateDemoBrief: generateDemoBriefMock }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    demoIpLock: {
      create: demoIpLockCreateMock,
      delete: demoIpLockDeleteMock
    },
    demoScan: {
      count: demoScanCountMock,
      create: demoScanCreateMock
    }
  }
}));

const SCAN_RESULT = {
  endpointUsed: "extract/json",
  usedFallback: false,
  diffSummary: null,
  hasChanges: false,
  rawResult: { tiers: [{ name: "Pro" }] }
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/demo", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

/** Extract the body stream from a Response, asserting it is non-null. */
function getBody(res: Response): ReadableStream<Uint8Array> {
  if (!res.body) throw new Error("Response body is null");
  return res.body;
}

/** Drain a ReadableStream into an array of ParsedSseEvent-like objects. */
async function drainStream(stream: ReadableStream<Uint8Array>): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  // Parse SSE blocks
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split("\n\n").filter(Boolean)) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!eventLine || !dataLine) continue;
    const event = eventLine.slice("event:".length).trim();
    const raw = dataLine.slice("data:".length).trim();
    try {
      events.push({ event, data: JSON.parse(raw) });
    } catch {
      events.push({ event, data: raw });
    }
  }
  return events;
}

describe("POST /api/demo", () => {
  beforeEach(() => {
    vi.resetModules();
    scanPageMock.mockReset();
    inferBlogPageTypeMock.mockReset();
    inferPageTypeFromUrlMock.mockReset();
    demoIpLockCreateMock.mockReset();
    demoIpLockDeleteMock.mockReset();
    demoScanCountMock.mockReset();
    demoScanCreateMock.mockReset();
    generateDemoBriefMock.mockReset();

    // Default: lock acquired, within daily limit, scan succeeds
    demoIpLockCreateMock.mockResolvedValue({ ipHash: "abc" });
    demoIpLockDeleteMock.mockResolvedValue({});
    demoScanCountMock.mockResolvedValue(0);
    demoScanCreateMock.mockResolvedValue({});
    scanPageMock.mockResolvedValue(SCAN_RESULT);
    inferBlogPageTypeMock.mockReturnValue(null);
    inferPageTypeFromUrlMock.mockReturnValue(null);
    generateDemoBriefMock.mockResolvedValue({
      data: { positioning_signal: "pos", opportunity: "opp", watch_signal: "watch" }
    });
  });

  it("returns 429 when a concurrent lock is held", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "5.0.0"
    });
    demoIpLockCreateMock.mockRejectedValueOnce(p2002);

    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/already in progress/i);
  });

  it("rethrows unexpected DB errors from tryAcquireLock", async () => {
    demoIpLockCreateMock.mockRejectedValueOnce(new Error("DB connection lost"));

    const { POST } = await import("@/app/api/demo/route");
    await expect(POST(makeRequest({ url: "https://example.com" }))).rejects.toThrow("DB connection lost");
  });

  it("returns 429 when daily rate limit is exceeded", async () => {
    demoScanCountMock.mockResolvedValueOnce(3);

    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/rate limit/i);
    // Lock should be released even though we returned early
    expect(demoIpLockDeleteMock).toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ bad json "
    });

    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
    expect(demoIpLockDeleteMock).toHaveBeenCalled();
  });

  it("returns 400 when url is missing from body", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/url is required/i);
    expect(demoIpLockDeleteMock).toHaveBeenCalled();
  });

  it("returns 400 for an invalid URL", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "not-a-url" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid url/i);
  });

  it("returns 400 for non-http protocols", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "ftp://example.com" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("returns 400 for localhost URLs", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "http://localhost/anything" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("returns 400 for private RFC-1918 IPs", async () => {
    const { POST } = await import("@/app/api/demo/route");

    for (const url of ["http://192.168.1.1/page", "http://10.0.0.1/page", "http://172.20.0.5/page"]) {
      const res = await POST(makeRequest({ url }));
      expect(res.status).toBe(400);
    }
  });

  it("returns an SSE streaming response for a valid request", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-cache");
  });

  it("emits scan:started and scan:endpoint events before scan:complete", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    const events = await drainStream(getBody(res));

    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain("scan:started");
    expect(eventNames).toContain("scan:endpoint");
    expect(eventNames).toContain("scan:complete");
    expect(eventNames.indexOf("scan:started")).toBeLessThan(eventNames.indexOf("scan:complete"));
  });

  it("scan:endpoint event carries the inferred page type", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    const events = await drainStream(getBody(res));

    const endpointEvent = events.find((e) => e.event === "scan:endpoint");
    expect((endpointEvent?.data as { type: string }).type).toBe("pricing");
  });

  it("scan:complete event contains scan result fields", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    const events = await drainStream(getBody(res));

    const complete = events.find((e) => e.event === "scan:complete");
    expect(complete).toBeDefined();
    const data = complete?.data as { endpointUsed: string; result: unknown };
    expect(data.endpointUsed).toBe("extract/json");
    expect(data.result).toEqual(SCAN_RESULT.rawResult);
  });

  it("creates a demoScan record after a successful scan", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    await drainStream(getBody(res));

    expect(demoScanCreateMock).toHaveBeenCalledOnce();
  });

  it("releases the lock after stream completes successfully", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    await drainStream(getBody(res));

    expect(demoIpLockDeleteMock).toHaveBeenCalled();
  });

  it("emits scan:error and releases lock when scanPage throws", async () => {
    scanPageMock.mockRejectedValueOnce(new Error("Scan failed hard"));

    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    const events = await drainStream(getBody(res));

    const errorEvent = events.find((e) => e.event === "scan:error");
    expect(errorEvent).toBeDefined();
    expect((errorEvent?.data as { error: string }).error).toBe("Scan failed hard");
    expect(demoIpLockDeleteMock).toHaveBeenCalled();
  });

  it("emits generic error message for non-Error throws", async () => {
    scanPageMock.mockRejectedValueOnce("string rejection");

    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    const events = await drainStream(getBody(res));

    const errorEvent = events.find((e) => e.event === "scan:error");
    expect((errorEvent?.data as { error: string }).error).toBe("Demo scan failed");
  });

  it("uses x-real-ip header for rate-limiting when present", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }, { "x-real-ip": "1.2.3.4" }));

    // The route should proceed normally — just checking no crash from the header
    expect(res.status).toBe(200);
    expect(demoIpLockCreateMock).toHaveBeenCalledOnce();
  });

  it("falls back to x-forwarded-for when x-real-ip is absent", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }, { "x-forwarded-for": "5.6.7.8, 9.9.9.9" }));

    expect(res.status).toBe(200);
    expect(demoIpLockCreateMock).toHaveBeenCalledOnce();
  });

  // Page type inference tests (exercising inferPageType via scan:endpoint events)
  const inferCases: Array<[string, string]> = [
    ["https://example.com/pricing", "pricing"],
    ["https://example.com/changelog", "changelog"],
    ["https://example.com/release-notes", "changelog"],
    ["https://example.com/careers", "careers"],
    ["https://example.com/jobs", "careers"],
    ["https://example.com/docs/api", "docs"],
    ["https://github.com/owner/repo", "github"],
    ["https://www.linkedin.com/company/acme", "social"],
    ["https://twitter.com/acme", "social"],
    ["https://x.com/acme", "social"],
    ["https://www.youtube.com/c/acme", "social"],
    ["https://example.com/about", "profile"],
    ["https://example.com/app/dashboard", "custom"]
  ];

  describe.each(inferCases)("inferPageType('%s') => '%s'", (url, expectedType) => {
    it(`infers ${expectedType}`, async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url }));
      const events = await drainStream(getBody(res));

      const endpointEvent = events.find((e) => e.event === "scan:endpoint");
      expect((endpointEvent?.data as { type: string }).type).toBe(expectedType);
    });
  });

  it("passes isDemo=true to scanPage", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));
    await drainStream(getBody(res));

    expect(scanPageMock).toHaveBeenCalledWith(expect.objectContaining({ isDemo: true }));
  });

  it("passes customTask for custom page type", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/dashboard" }));
    await drainStream(getBody(res));

    expect(scanPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "custom",
        customTask: expect.stringContaining("competitive intelligence")
      })
    );
  });

  it("does not pass customTask for non-custom page types", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
    await drainStream(getBody(res));

    expect(scanPageMock).toHaveBeenCalledWith(expect.objectContaining({ type: "pricing", customTask: undefined }));
  });

  describe("multi-surface scan (root URL)", () => {
    it("emits scan:surfaces with 6 pages for a root URL", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      const surfacesEvent = events.find((e) => e.event === "scan:surfaces");
      expect(surfacesEvent).toBeDefined();
      const pages = (surfacesEvent?.data as { pages: Array<{ type: string; url: string }> }).pages;
      expect(pages.map((p) => p.type)).toEqual(["homepage", "pricing", "docs", "blog", "changelog", "careers"]);
      expect(pages.find((p) => p.type === "homepage")?.url).toBe("https://example.com/");
      expect(pages.find((p) => p.type === "pricing")?.url).toBe("https://example.com/pricing");
      expect(pages.find((p) => p.type === "docs")?.url).toBe("https://example.com/docs");
      expect(pages.find((p) => p.type === "blog")?.url).toBe("https://example.com/blog");
      expect(pages.find((p) => p.type === "changelog")?.url).toBe("https://example.com/changelog");
      expect(pages.find((p) => p.type === "careers")?.url).toBe("https://example.com/careers");
    });

    it("calls scanPage 4 times with effortOverride: low and isDemo: true", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      await drainStream(getBody(res));

      expect(scanPageMock).toHaveBeenCalledTimes(6);
      for (const call of scanPageMock.mock.calls) {
        expect(call[0]).toMatchObject({ effortOverride: "low", isDemo: true });
      }
    });

    it("emits scan:page_complete for each non-empty surface result", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      const pageCompletes = events.filter((e) => e.event === "scan:page_complete");
      expect(pageCompletes.length).toBe(6);
      const types = pageCompletes.map((e) => (e.data as { type: string }).type);
      expect(types).toContain("homepage");
      expect(types).toContain("pricing");
    });

    it("scan:page_complete carries type, url, result, endpointUsed, usedFallback", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      const homepageComplete = events.find(
        (e) => e.event === "scan:page_complete" && (e.data as { type: string }).type === "homepage"
      );
      expect(homepageComplete?.data).toMatchObject({
        type: "homepage",
        url: "https://example.com/",
        result: SCAN_RESULT.rawResult,
        endpointUsed: "extract/json",
        usedFallback: false
      });
    });

    it("emits scan:brief_started then scan:brief_complete after page results", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      const names = events.map((e) => e.event);
      expect(names).toContain("scan:brief_started");
      expect(names).toContain("scan:brief_complete");
      const briefIdx = names.indexOf("scan:brief_started");
      const lastPageIdx = names.lastIndexOf("scan:page_complete");
      expect(briefIdx).toBeGreaterThan(lastPageIdx);
    });

    it("scan:brief_complete contains positioning_signal, opportunity, watch_signal", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      const briefEvent = events.find((e) => e.event === "scan:brief_complete");
      expect(briefEvent?.data).toMatchObject({
        positioning_signal: "pos",
        opportunity: "opp",
        watch_signal: "watch"
      });
    });

    it("creates exactly 1 demoScan record regardless of surface count", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      await drainStream(getBody(res));

      expect(demoScanCreateMock).toHaveBeenCalledOnce();
    });

    it("silently drops surfaces with empty rawResult — no scan:page_complete for them", async () => {
      scanPageMock
        .mockResolvedValueOnce(SCAN_RESULT)
        .mockResolvedValueOnce({ ...SCAN_RESULT, rawResult: null })
        .mockResolvedValueOnce(SCAN_RESULT)
        .mockResolvedValueOnce(SCAN_RESULT);

      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      const pageCompletes = events.filter((e) => e.event === "scan:page_complete");
      expect(pageCompletes.length).toBe(5);
      const types = pageCompletes.map((e) => (e.data as { type: string }).type);
      expect(types).not.toContain("pricing");
    });

    it("omits brief when all surfaces return empty", async () => {
      scanPageMock.mockResolvedValue({ ...SCAN_RESULT, rawResult: null });

      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      expect(events.find((e) => e.event === "scan:brief_started")).toBeUndefined();
      expect(events.find((e) => e.event === "scan:brief_complete")).toBeUndefined();
    });

    it("omits brief silently when generateDemoBrief throws", async () => {
      generateDemoBriefMock.mockRejectedValueOnce(new Error("Generate failed"));

      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      expect(events.filter((e) => e.event === "scan:page_complete").length).toBe(6);
      expect(events.find((e) => e.event === "scan:error")).toBeUndefined();
    });

    it("does not trigger multi-surface for a non-root URL", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com/pricing" }));
      const events = await drainStream(getBody(res));

      expect(events.find((e) => e.event === "scan:surfaces")).toBeUndefined();
      expect(scanPageMock).toHaveBeenCalledOnce();
      expect(events.find((e) => e.event === "scan:complete")).toBeDefined();
    });

    it("does not emit scan:endpoint or scan:complete for a root URL (multi-surface path)", async () => {
      const { POST } = await import("@/app/api/demo/route");
      const res = await POST(makeRequest({ url: "https://example.com" }));
      const events = await drainStream(getBody(res));

      expect(events.find((e) => e.event === "scan:endpoint")).toBeUndefined();
      expect(events.find((e) => e.event === "scan:complete")).toBeUndefined();
    });
  });
});
