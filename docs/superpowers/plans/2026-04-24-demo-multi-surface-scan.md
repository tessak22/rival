# Demo Multi-Surface Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user pastes a root URL into the demo, automatically scan 4 surfaces in parallel (homepage, pricing, blog, careers), stream each result as it lands, and synthesize a 3-field intelligence brief — one URL in, competitive dossier out.

**Architecture:** Add `effortOverride` to `ScanPageInput` so demo scans can force `effort: low` across all page types. Add `generateDemoBrief` for the lightweight post-scan synthesis. Extend the demo route to branch on root-URL detection: root URLs trigger parallel multi-surface scanning with new SSE events; specific-page URLs keep existing single-page behavior unchanged.

**Tech Stack:** Next.js App Router, Vitest, TypeScript strict mode, `@tabstack/sdk`, Prisma, SSE streaming

---

## File Map

| File | Change |
|---|---|
| `lib/scanner.ts` | Add `effortOverride?: TabstackEffort` to `ScanPageInput`; thread through `runPrimaryScan` |
| `lib/__tests__/scanner.test.ts` | Add test for `effortOverride` |
| `lib/tabstack/generate.ts` | Add `DEMO_BRIEF_SCHEMA`, `GenerateDemoBriefInput`, `generateDemoBrief` |
| `lib/tabstack/__tests__/generate.test.ts` | Add tests for `generateDemoBrief` |
| `app/api/demo/route.ts` | Add multi-surface scan path; update existing single-page path to pass `effortOverride` |
| `app/api/__tests__/demo.route.test.ts` | Add multi-surface tests; update existing root-URL tests that break |
| `components/demo/DemoClient.tsx` | New state, event handlers, multi-surface progress log, stacked results, brief section |

---

## Task 1: Add `effortOverride` to `ScanPageInput`

**Files:**
- Modify: `lib/scanner.ts`
- Modify: `lib/__tests__/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe("scanPage", ...)` block in `lib/__tests__/scanner.test.ts`, after the existing pricing test:

```ts
it("uses effortOverride when provided, ignoring the per-type routing effort", async () => {
  const { scanPage } = await import("@/lib/scanner");

  await scanPage({
    competitorId: "cmp_1",
    pageId: "page_1",
    url: "https://example.com/pricing",
    type: "pricing",
    effortOverride: "low" // pricing normally routes to effort: "high"
  });

  expect(extractJsonMock).toHaveBeenCalledWith(
    expect.objectContaining({ effort: "low" })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/scanner.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `Expected: "low" / Received: "high"`

- [ ] **Step 3: Add `effortOverride` to `ScanPageInput`**

In `lib/scanner.ts`, add `effortOverride?: TabstackEffort` to the `ScanPageInput` type:

```ts
export type ScanPageInput = {
  competitorId?: string | null;
  pageId?: string | null;
  label?: string;
  url: string;
  type: string;
  geoTarget?: string | null;
  nocache?: boolean;
  isDemo?: boolean;
  customTask?: string;
  effortOverride?: TabstackEffort; // forces effort on all Tabstack calls — used by demo mode
};
```

- [ ] **Step 4: Thread `effortOverride` through `runPrimaryScan`**

In `lib/scanner.ts`, make three changes inside `runPrimaryScan`:

**Change 1** — the `extract/markdown` branch (around line 381):
```ts
// Before:
effort: route.effort ?? "low",
// After:
effort: input.effortOverride ?? route.effort ?? "low",
```

**Change 2** — the `runJsonExtract` closure (around line 428):
```ts
// Before:
effort: route.effort ?? "low",
// After:
effort: input.effortOverride ?? route.effort ?? "low",
```

**Change 3** — the blog-fallback `extractMarkdown` call (around line 467):
```ts
// Before:
effort: "low",
// After:
effort: input.effortOverride ?? "low",
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/scanner.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: PASS

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
npx vitest run lib/__tests__/scanner.test.ts
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add lib/scanner.ts lib/__tests__/scanner.test.ts
git commit -m "feat(scanner): add effortOverride to ScanPageInput for demo mode"
```

---

## Task 2: Add `generateDemoBrief` to `lib/tabstack/generate.ts`

**Files:**
- Modify: `lib/tabstack/generate.ts`
- Modify: `lib/tabstack/__tests__/generate.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe("generateDemoBrief", ...)` block at the end of `lib/tabstack/__tests__/generate.test.ts`. The file already has mock setup for `generateJsonMock`, `loggerCallMock`, `getTabstackClientMock`, `toSdkEffortMock`, and `toGeoTargetMock` in the outer `vi.hoisted` block — reuse them.

```ts
describe("generateDemoBrief", () => {
  beforeEach(() => {
    generateJsonMock.mockResolvedValue({
      data: { positioning_signal: "p", opportunity: "o", watch_signal: "w" }
    });
  });

  it("calls generate.json with DEMO_BRIEF_SCHEMA and effort: low", async () => {
    const { generateDemoBrief } = await import("@/lib/tabstack/generate");

    await generateDemoBrief({
      url: "https://example.com",
      contextData: '{"homepage": {"primary_tagline": "Hello"}}',
      isDemo: true
    });

    expect(generateJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com",
        effort: "standard", // toSdkEffort("low") => "standard"
        json_schema: expect.objectContaining({
          required: expect.arrayContaining(["positioning_signal", "opportunity", "watch_signal"])
        })
      })
    );
  });

  it("passes isDemo: true to the logger", async () => {
    const { generateDemoBrief } = await import("@/lib/tabstack/generate");

    await generateDemoBrief({
      url: "https://example.com",
      contextData: "{}",
      isDemo: true
    });

    expect(loggerCallMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ endpoint: "generate", isDemo: true, nocache: true })
    );
  });

  it("returns the SDK response", async () => {
    const { generateDemoBrief } = await import("@/lib/tabstack/generate");

    const result = await generateDemoBrief({ url: "https://example.com", contextData: "{}" });

    expect(result).toEqual({ data: { positioning_signal: "p", opportunity: "o", watch_signal: "w" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/tabstack/__tests__/generate.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `generateDemoBrief is not a function`

- [ ] **Step 3: Add `DEMO_BRIEF_SCHEMA`, type, and function to `lib/tabstack/generate.ts`**

Add the following at the end of `lib/tabstack/generate.ts`, after the `generateSelfProfile` function:

```ts
// ---------------------------------------------------------------------------
// Demo intelligence brief
// ---------------------------------------------------------------------------

export const DEMO_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    positioning_signal: {
      type: "string",
      description: "How this company is positioning itself right now, in one sentence."
    },
    opportunity: {
      type: "string",
      description: "One specific gap or weakness a competitor could exploit."
    },
    watch_signal: {
      type: "string",
      description: "One signal worth monitoring in the next competitive cycle."
    }
  },
  required: ["positioning_signal", "opportunity", "watch_signal"]
} as const;

export const DEMO_BRIEF_EXPECTED_FIELDS: string[] = [...DEMO_BRIEF_SCHEMA.required];

export type GenerateDemoBriefInput = {
  url: string;
  contextData: string;
  isDemo?: boolean;
};

/**
 * Synthesize a 3-field intelligence brief from multi-surface demo scan results.
 * Always uses effort: low and nocache: true. No competitor/page IDs — demo only.
 */
export async function generateDemoBrief(input: GenerateDemoBriefInput): Promise<GenerateJsonResponse> {
  const client = getTabstackClient();
  const contextData = input.contextData.slice(0, MAX_CONTEXT_LENGTH);

  const instructions = `You are a competitive intelligence analyst. Based on this scan data from ${input.url}, write exactly three things:
1. How this company is positioning itself right now — one sentence.
2. One specific gap or weakness a competitor could exploit.
3. One signal worth monitoring in the next competitive cycle.
Be direct and specific. No generic advice.

Scan data:
${contextData}`;

  const requestPayload: GenerateJsonParams = {
    url: input.url,
    instructions,
    json_schema: DEMO_BRIEF_SCHEMA,
    effort: toSdkEffort("low"),
    nocache: true
  };

  return logger.call(() => client.generate.json(requestPayload), {
    endpoint: "generate",
    url: input.url,
    effort: "low",
    nocache: true,
    isDemo: input.isDemo,
    expectedFields: DEMO_BRIEF_EXPECTED_FIELDS
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/tabstack/__tests__/generate.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tabstack/generate.ts lib/tabstack/__tests__/generate.test.ts
git commit -m "feat(generate): add generateDemoBrief for multi-surface demo synthesis"
```

---

## Task 3: Multi-surface scan logic in `app/api/demo/route.ts`

**Files:**
- Modify: `app/api/demo/route.ts`
- Modify: `app/api/__tests__/demo.route.test.ts`

- [ ] **Step 1: Update the mock setup in the test file**

At the top of `app/api/__tests__/demo.route.test.ts`, add `generateDemoBriefMock` to the `vi.hoisted` block and add a `vi.mock` for `@/lib/tabstack/generate`:

```ts
const {
  scanPageMock,
  inferBlogPageTypeMock,
  demoIpLockCreateMock,
  demoIpLockDeleteMock,
  demoScanCountMock,
  demoScanCreateMock,
  generateDemoBriefMock   // ← add this
} = vi.hoisted(() => ({
  scanPageMock: vi.fn(),
  inferBlogPageTypeMock: vi.fn(),
  demoIpLockCreateMock: vi.fn(),
  demoIpLockDeleteMock: vi.fn(),
  demoScanCountMock: vi.fn(),
  demoScanCreateMock: vi.fn(),
  generateDemoBriefMock: vi.fn()   // ← add this
}));

vi.mock("@/lib/scanner", () => ({ scanPage: scanPageMock, inferBlogPageType: inferBlogPageTypeMock }));
vi.mock("@/lib/tabstack/generate", () => ({ generateDemoBrief: generateDemoBriefMock }));  // ← add this
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
```

Add `generateDemoBriefMock.mockReset()` to `beforeEach`, and set a default resolution:

```ts
beforeEach(() => {
  vi.resetModules();
  scanPageMock.mockReset();
  inferBlogPageTypeMock.mockReset();
  demoIpLockCreateMock.mockReset();
  demoIpLockDeleteMock.mockReset();
  demoScanCountMock.mockReset();
  demoScanCreateMock.mockReset();
  generateDemoBriefMock.mockReset();   // ← add

  demoIpLockCreateMock.mockResolvedValue({ ipHash: "abc" });
  demoIpLockDeleteMock.mockResolvedValue({});
  demoScanCountMock.mockResolvedValue(0);
  demoScanCreateMock.mockResolvedValue({});
  scanPageMock.mockResolvedValue(SCAN_RESULT);
  inferBlogPageTypeMock.mockReturnValue(null);
  generateDemoBriefMock.mockResolvedValue({   // ← add
    data: { positioning_signal: "pos", opportunity: "opp", watch_signal: "watch" }
  });
});
```

- [ ] **Step 2: Update existing tests that use a root URL**

The following existing tests use `https://example.com` (a root URL). Once multi-surface is implemented, they will no longer receive `scan:complete`. Update each to use `https://example.com/pricing` instead so they exercise the single-page path:

```ts
// Change URL in these tests from "https://example.com" to "https://example.com/pricing":
// - "scan:complete event contains scan result fields"
// - "creates a demoScan record after a successful scan"
// - "releases the lock after stream completes successfully"
// - "emits scan:error and releases lock when scanPage throws"
// - "emits generic error message for non-Error throws"
```

For example, the scan:complete test becomes:
```ts
it("scan:complete event contains scan result fields", async () => {
  const { POST } = await import("@/app/api/demo/route");
  const res = await POST(makeRequest({ url: "https://example.com/pricing" })); // ← changed
  const events = await drainStream(getBody(res));

  const complete = events.find((e) => e.event === "scan:complete");
  expect(complete).toBeDefined();
  const data = complete?.data as { endpointUsed: string; result: unknown };
  expect(data.endpointUsed).toBe("extract/json");
  expect(data.result).toEqual(SCAN_RESULT.rawResult);
});
```

Apply the same URL change to the other four affected tests.

- [ ] **Step 3: Write the failing multi-surface tests**

Add a new `describe("multi-surface scan (root URL)", ...)` block at the end of `app/api/__tests__/demo.route.test.ts`:

```ts
describe("multi-surface scan (root URL)", () => {
  it("emits scan:surfaces with 4 pages for a root URL", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));
    const events = await drainStream(getBody(res));

    const surfacesEvent = events.find((e) => e.event === "scan:surfaces");
    expect(surfacesEvent).toBeDefined();
    const pages = (surfacesEvent?.data as { pages: Array<{ type: string; url: string }> }).pages;
    expect(pages.map((p) => p.type)).toEqual(["homepage", "pricing", "blog", "careers"]);
    expect(pages.find((p) => p.type === "homepage")?.url).toBe("https://example.com/");
    expect(pages.find((p) => p.type === "pricing")?.url).toBe("https://example.com/pricing");
    expect(pages.find((p) => p.type === "blog")?.url).toBe("https://example.com/blog");
    expect(pages.find((p) => p.type === "careers")?.url).toBe("https://example.com/careers");
  });

  it("calls scanPage 4 times with effortOverride: low and isDemo: true", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));
    await drainStream(getBody(res));

    expect(scanPageMock).toHaveBeenCalledTimes(4);
    for (const call of scanPageMock.mock.calls) {
      expect(call[0]).toMatchObject({ effortOverride: "low", isDemo: true });
    }
  });

  it("emits scan:page_complete for each non-empty surface result", async () => {
    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));
    const events = await drainStream(getBody(res));

    const pageCompletes = events.filter((e) => e.event === "scan:page_complete");
    expect(pageCompletes.length).toBe(4);
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
      .mockResolvedValueOnce(SCAN_RESULT)                              // homepage — ok
      .mockResolvedValueOnce({ ...SCAN_RESULT, rawResult: null })       // pricing — empty
      .mockResolvedValueOnce(SCAN_RESULT)                              // blog — ok
      .mockResolvedValueOnce(SCAN_RESULT);                             // careers — ok

    const { POST } = await import("@/app/api/demo/route");
    const res = await POST(makeRequest({ url: "https://example.com" }));
    const events = await drainStream(getBody(res));

    const pageCompletes = events.filter((e) => e.event === "scan:page_complete");
    expect(pageCompletes.length).toBe(3);
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

    // page results still present, no error event from brief failure
    expect(events.filter((e) => e.event === "scan:page_complete").length).toBe(4);
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
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run app/api/__tests__/demo.route.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: new multi-surface tests FAIL; updated single-page tests PASS (they're already corrected).

- [ ] **Step 5: Implement multi-surface logic in `app/api/demo/route.ts`**

**5a.** Add the import for `generateDemoBrief` and `isPlainObject` at the top of `app/api/demo/route.ts`:

```ts
import { isPlainObject } from "@/lib/utils/types";
import { generateDemoBrief } from "@/lib/tabstack/generate";
```

**5b.** Add two helpers after the existing `isPrivateHost` function:

```ts
function demoResultIsEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (isPlainObject(v) && Object.keys(v as Record<string, unknown>).length === 0) return true;
  return false;
}

function extractDemoBriefData(
  raw: unknown
): { positioning_signal: string; opportunity: string; watch_signal: string } | null {
  const payload = isPlainObject(raw) && "data" in (raw as Record<string, unknown>)
    ? (raw as Record<string, unknown>).data
    : raw;
  if (!isPlainObject(payload)) return null;
  const d = payload as Record<string, unknown>;
  if (
    typeof d.positioning_signal === "string" &&
    typeof d.opportunity === "string" &&
    typeof d.watch_signal === "string"
  ) {
    return {
      positioning_signal: d.positioning_signal,
      opportunity: d.opportunity,
      watch_signal: d.watch_signal
    };
  }
  return null;
}
```

**5c.** Add the `MULTI_SURFACE_TIMEOUT_MS` constant and `buildSurfaces` helper after the existing `SCAN_TIMEOUT_MS` constant:

```ts
const SCAN_TIMEOUT_MS = 22_000;
const PER_PAGE_TIMEOUT_MS = 15_000;
const BRIEF_TIMEOUT_MS = 5_000;

function buildSurfaces(parsedUrl: URL): Array<{ type: string; url: string }> {
  const base = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  return [
    { type: "homepage", url: parsedUrl.toString() },
    { type: "pricing", url: `${base}/pricing` },
    { type: "blog", url: `${base}/blog` },
    { type: "careers", url: `${base}/careers` }
  ];
}
```

**5d.** Replace the stream body inside the `ReadableStream` constructor. Currently the `start` callback has:

```ts
start: async (controller) => {
  try {
    controller.enqueue(sse("scan:started", { url: parsedUrl.toString() }));
    controller.enqueue(sse("scan:endpoint", { type }));

    const result = await withTimeout(
      scanPage({
        url: parsedUrl.toString(),
        type,
        isDemo: true,
        customTask: type === "custom" ? "Extract high-signal competitive intelligence from this page." : undefined
      }),
      SCAN_TIMEOUT_MS
    );

    if (!isLocal) await prisma.demoScan.create({ data: { ipHash: hashedIp } });

    controller.enqueue(
      sse("scan:complete", {
        endpointUsed: result.endpointUsed,
        usedFallback: result.usedFallback,
        diffSummary: result.diffSummary,
        hasChanges: result.hasChanges,
        result: result.rawResult
      })
    );
  } catch (error) {
    ...
  } finally {
    ...
  }
}
```

Replace it with:

```ts
start: async (controller) => {
  try {
    controller.enqueue(sse("scan:started", { url: parsedUrl.toString() }));

    if (type === "homepage") {
      // ── Multi-surface path ────────────────────────────────────────────
      const surfaces = buildSurfaces(parsedUrl);
      controller.enqueue(sse("scan:surfaces", { pages: surfaces }));

      const outcomes = await withTimeout(
        Promise.allSettled(
          surfaces.map(({ type: surfaceType, url: surfaceUrl }) =>
            withTimeout(
              scanPage({ url: surfaceUrl, type: surfaceType, isDemo: true, effortOverride: "low" }),
              PER_PAGE_TIMEOUT_MS
            ).then((result) => ({ type: surfaceType, url: surfaceUrl, result }))
          )
        ),
        SCAN_TIMEOUT_MS
      );

      const successfulResults: Array<{ type: string; result: unknown }> = [];

      for (const outcome of outcomes) {
        if (outcome.status === "rejected") continue;
        const { type: surfaceType, url: surfaceUrl, result } = outcome.value;
        if (demoResultIsEmpty(result.rawResult)) continue;
        controller.enqueue(
          sse("scan:page_complete", {
            type: surfaceType,
            url: surfaceUrl,
            result: result.rawResult,
            endpointUsed: result.endpointUsed,
            usedFallback: result.usedFallback
          })
        );
        successfulResults.push({ type: surfaceType, result: result.rawResult });
      }

      if (successfulResults.length > 0) {
        controller.enqueue(sse("scan:brief_started", {}));
        try {
          const contextData = JSON.stringify(
            successfulResults.reduce<Record<string, unknown>>((acc, { type: t, result: r }) => {
              acc[t] = r;
              return acc;
            }, {})
          );
          const briefRaw = await withTimeout(
            generateDemoBrief({ url: parsedUrl.toString(), contextData, isDemo: true }),
            BRIEF_TIMEOUT_MS
          );
          const brief = extractDemoBriefData(briefRaw);
          if (brief) controller.enqueue(sse("scan:brief_complete", brief));
        } catch {
          // Brief is a bonus — silently omit on failure or timeout
        }
      }

      if (!isLocal) await prisma.demoScan.create({ data: { ipHash: hashedIp } });
    } else {
      // ── Single-page path (unchanged) ─────────────────────────────────
      controller.enqueue(sse("scan:endpoint", { type }));

      const result = await withTimeout(
        scanPage({
          url: parsedUrl.toString(),
          type,
          isDemo: true,
          customTask: type === "custom" ? "Extract high-signal competitive intelligence from this page." : undefined
        }),
        SCAN_TIMEOUT_MS
      );

      if (!isLocal) await prisma.demoScan.create({ data: { ipHash: hashedIp } });

      controller.enqueue(
        sse("scan:complete", {
          endpointUsed: result.endpointUsed,
          usedFallback: result.usedFallback,
          diffSummary: result.diffSummary,
          hasChanges: result.hasChanges,
          result: result.rawResult
        })
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "scan_timeout") {
      controller.enqueue(
        sse("scan:timeout", {
          message: "Scan exceeded the 22s limit — try a simpler page type (homepage, blog, docs) for faster results."
        })
      );
    } else {
      controller.enqueue(
        sse("scan:error", {
          error: error instanceof Error ? error.message : "Demo scan failed"
        })
      );
    }
  } finally {
    if (!isLocal) await releaseLock(hashedIp);
    controller.close();
  }
}
```

- [ ] **Step 6: Run all demo route tests**

```bash
npx vitest run app/api/__tests__/demo.route.test.ts --reporter=verbose 2>&1 | tail -40
```

Expected: all tests PASS

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add app/api/demo/route.ts app/api/__tests__/demo.route.test.ts
git commit -m "feat(demo): multi-surface scan for root URLs — 4 parallel pages + intelligence brief"
```

---

## Task 4: Update `DemoClient.tsx` for multi-surface UI

**Files:**
- Modify: `components/demo/DemoClient.tsx`

No unit tests for this task — verify with typecheck and manual browser testing.

- [ ] **Step 1: Add new types at the top of `DemoClient.tsx`**

After the existing `ScanCompleteData` type, add:

```ts
type ScanSurfaces = {
  pages: Array<{ type: string; url: string }>;
};

type PageCompleteData = {
  type: string;
  url: string;
  result: unknown;
  endpointUsed: string;
  usedFallback: boolean;
};

type BriefData = {
  positioning_signal: string;
  opportunity: string;
  watch_signal: string;
};
```

- [ ] **Step 2: Add new state and reset in `DemoClient`**

In the `DemoClient` function body, add after the existing state declarations:

```ts
const [surfaces, setSurfaces] = useState<Array<{ type: string; url: string }>>([]);
const [pageResults, setPageResults] = useState<PageCompleteData[]>([]);
const [brief, setBrief] = useState<BriefData | null>(null);
const [briefPending, setBriefPending] = useState(false);
```

In `runDemo`, add resets at the top alongside the existing `setEvents([])`:

```ts
async function runDemo() {
  setEvents([]);
  setError(null);
  setIsRunning(true);
  setSurfaces([]);
  setPageResults([]);
  setBrief(null);
  setBriefPending(false);
  // ... rest unchanged
```

- [ ] **Step 3: Add event handlers for new SSE events in `runDemo`**

Inside the event processing loop (both the main `while` loop chunk and the trailing `buffer` chunk), add handlers alongside the existing `scan:error` and `scan:timeout` checks:

```ts
if (event.event === "scan:surfaces") {
  setSurfaces((event.data as ScanSurfaces).pages);
}
if (event.event === "scan:page_complete") {
  setPageResults((prev) => [...prev, event.data as PageCompleteData]);
}
if (event.event === "scan:brief_started") {
  setBriefPending(true);
}
if (event.event === "scan:brief_complete") {
  setBrief(event.data as BriefData);
  setBriefPending(false);
}
```

Add these four blocks in both the main chunk loop and the trailing buffer chunk loop (they are identical — copy them to both locations).

- [ ] **Step 4: Update `hasResult` derivation**

Replace:

```ts
const completeEvent = events.find((e) => e.event === "scan:complete");
const hasResult = Boolean(completeEvent);
```

With:

```ts
const completeEvent = events.find((e) => e.event === "scan:complete");
const isMultiSurface = surfaces.length > 0;
const hasResult = isMultiSurface ? pageResults.length > 0 || briefPending : Boolean(completeEvent);
```

- [ ] **Step 5: Add `MultiSurfaceProgressLog` component**

Add this component after the existing `ProgressLog` component:

```tsx
function MultiSurfaceProgressLog({
  surfaces,
  pageResults,
  briefPending,
  brief,
  isRunning,
  startedUrl
}: {
  surfaces: Array<{ type: string; url: string }>;
  pageResults: PageCompleteData[];
  briefPending: boolean;
  brief: BriefData | null;
  isRunning: boolean;
  startedUrl: string;
}) {
  const completedTypes = new Set(pageResults.map((r) => r.type));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <ProgressRow
        symbol="✓"
        tone="ok"
        label="Scan started"
        detail={startedUrl}
        done
      />
      <ProgressRow
        symbol="✓"
        tone="ok"
        label={`Scanning ${surfaces.length} surfaces`}
        detail={surfaces.map((s) => s.type).join(" · ")}
        done
      />
      {surfaces.map(({ type }) => {
        const done = completedTypes.has(type);
        const running = isRunning && !done;
        return (
          <ProgressRow
            key={type}
            symbol={done ? "✓" : running ? "→" : "·"}
            tone={done ? "ok" : running ? "accent" : "faint"}
            label={done ? `${type} — extracted` : running ? `${type} — extracting…` : type}
            detail=""
            done={done}
          />
        );
      })}
      {(briefPending || brief) && (
        <ProgressRow
          symbol={brief ? "✓" : "→"}
          tone={brief ? "ok" : "accent"}
          label={brief ? "Intelligence brief — complete" : "Synthesizing brief…"}
          detail=""
          done={Boolean(brief)}
        />
      )}
    </div>
  );
}

function ProgressRow({
  symbol,
  tone,
  label,
  detail,
  done
}: {
  symbol: string;
  tone: "ok" | "accent" | "faint";
  label: string;
  detail: string;
  done: boolean;
}) {
  const color =
    tone === "ok" ? "var(--ok)" : tone === "accent" ? "var(--accent)" : "var(--ink-faint)";
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px dotted var(--paper-rule-2)",
        opacity: done || tone === "accent" ? 1 : 0.35
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color,
          width: 16,
          flexShrink: 0
        }}
      >
        {symbol}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {detail && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-faint)",
              marginTop: 2,
              wordBreak: "break-all"
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add `MultiSurfaceResults` and `BriefSection` components**

Add these after `MultiSurfaceProgressLog`:

```tsx
function MultiSurfaceResults({ pageResults }: { pageResults: PageCompleteData[] }) {
  if (pageResults.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {pageResults.map((page) => (
        <div key={page.type}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <RDSChip tone="solid">{page.type}</RDSChip>
            <RDSChip tone="solid">{page.endpointUsed}</RDSChip>
            {page.usedFallback && <RDSChip tone="hot">Fallback triggered</RDSChip>}
          </div>
          {isObject(page.result) && Object.keys(page.result).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {Object.entries(page.result as Record<string, unknown>).map(([key, value]) => {
                const isEmpty =
                  value === null ||
                  value === undefined ||
                  (Array.isArray(value) && value.length === 0) ||
                  (typeof value === "string" && value.trim().length === 0) ||
                  (typeof value === "number" && value === 0);
                return (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "200px 1fr",
                      gap: 16,
                      padding: "10px 0",
                      borderBottom: "1px dotted var(--paper-rule-2)",
                      alignItems: "start",
                      opacity: isEmpty ? 0.45 : 1
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.1em",
                        color: "var(--ink-faint)",
                        textTransform: "uppercase",
                        paddingTop: 3
                      }}
                    >
                      {key.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink)" }}>
                      <ResultValue value={value} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--ink-faint)", fontStyle: "italic", fontSize: 14, margin: 0 }}>
              No data extracted — page may have blocked the scan.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function BriefSection({ brief }: { brief: BriefData }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "POSITIONING SIGNAL", value: brief.positioning_signal },
    { label: "OPPORTUNITY", value: brief.opportunity },
    { label: "WATCH", value: brief.watch_signal }
  ];
  return (
    <div
      style={{
        marginTop: 32,
        padding: "20px 24px",
        background: "var(--ink)",
        color: "var(--ink-bg-text)"
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "var(--ink-ghost)",
          marginBottom: 16
        }}
      >
        INTELLIGENCE BRIEF
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.map(({ label, value }) => (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "200px 1fr",
              gap: 16,
              padding: "12px 0",
              borderTop: "1px solid var(--ink-2)"
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--ink-ghost)",
                paddingTop: 2
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update the main render in `DemoClient` to branch on multi-surface**

Replace the section that renders progress + results:

```tsx
{/* Replace the existing events.length > 0 block with: */}
{events.length > 0 && (
  <div style={{ display: "grid", gridTemplateColumns: isMultiSurface && hasResult ? "1fr 2fr" : isMultiSurface ? "1fr" : hasResult ? "1fr 2fr" : "1fr", gap: 32 }}>
    <div>
      <RDSSectionHead title="Progress" level={3} />
      {isMultiSurface ? (
        <MultiSurfaceProgressLog
          surfaces={surfaces}
          pageResults={pageResults}
          briefPending={briefPending}
          brief={brief}
          isRunning={isRunning}
          startedUrl={(events.find((e) => e.event === "scan:started")?.data as { url?: string })?.url ?? ""}
        />
      ) : (
        <ProgressLog events={events} isRunning={isRunning} />
      )}
    </div>

    {isMultiSurface && (pageResults.length > 0 || brief) && (
      <div>
        <RDSSectionHead title="Extracted Data" level={3} />
        <MultiSurfaceResults pageResults={pageResults} />
        {brief && <BriefSection brief={brief} />}
      </div>
    )}

    {!isMultiSurface && hasResult && completeEvent && (
      <div>
        <RDSSectionHead title="Extracted Data" level={3} />
        <ScanResult data={completeEvent.data as ScanCompleteData} />
      </div>
    )}
  </div>
)}
```

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add components/demo/DemoClient.tsx
git commit -m "feat(demo): multi-surface UI — stacked page results and intelligence brief section"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 2: Run build**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean build, no errors

- [ ] **Step 3: Push branch and open PR**

```bash
git checkout -b feat/demo-multi-surface
git push -u origin feat/demo-multi-surface
gh pr create \
  --title "feat(demo): multi-surface scan — 4 parallel pages + intelligence brief" \
  --body "$(cat <<'EOF'
## Summary
- Adds parallel multi-surface scanning for root URLs in the demo (homepage, pricing, blog, careers)
- All demo scans use `effort: low` via new `effortOverride` field on `ScanPageInput`
- Synthesizes a 3-field intelligence brief via `/generate` after page scans complete
- Streams results live: `scan:surfaces` → `scan:page_complete` (×4) → `scan:brief_started` → `scan:brief_complete`
- Single-page scans (non-root URLs) unchanged

## Test plan
- [ ] Paste a root URL (e.g. `https://stripe.com`) — should see 4 surfaces scanned and brief appear
- [ ] Paste a specific-page URL (e.g. `https://stripe.com/pricing`) — existing single-page behavior unchanged
- [ ] Verify 3/day rate limit still works (1 count per demo action, not per surface)
- [ ] `npm run test` passes
- [ ] `npm run build` passes
EOF
)"
```
