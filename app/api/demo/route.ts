// Netlify caps at 26s. Scan timeout fires at 22s, leaving 4s buffer.
export const maxDuration = 26;

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { generateDemoBrief } from "@/lib/tabstack/generate";
import { inferBlogPageType, scanPage } from "@/lib/scanner";
import { isPlainObject } from "@/lib/utils/types";

const MAX_SCANS_PER_DAY = 3;
const SCAN_TIMEOUT_MS = 22_000;
const PER_PAGE_TIMEOUT_MS = 15_000;
const BRIEF_TIMEOUT_MS = 5_000;
const encoder = new TextEncoder();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("scan_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function buildSurfaces(parsedUrl: URL): Array<{ type: string; url: string }> {
  const base = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  return [
    { type: "homepage", url: parsedUrl.toString() },
    { type: "pricing", url: `${base}/pricing` },
    { type: "docs", url: `${base}/docs` },
    { type: "blog", url: `${base}/blog` },
    { type: "changelog", url: `${base}/changelog` },
    { type: "careers", url: `${base}/careers` }
  ];
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function inferPageType(rawUrl: string): string {
  const lower = rawUrl.toLowerCase();
  // Root URL — no meaningful path segment → treat as homepage for multi-surface scan.
  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname === "/" || parsed.pathname === "") return "homepage";
  } catch {
    // Malformed URLs are caught upstream; continue to keyword matching as fallback.
  }
  // Review platforms first so keyword collisions (e.g. "pricing") do not misclassify.
  if (
    lower.includes("g2.com") ||
    lower.includes("capterra.com") ||
    lower.includes("trustpilot.com") ||
    lower.includes("producthunt.com")
  ) {
    return "reviews";
  }
  if (lower.includes("pricing")) return "pricing";
  if (lower.includes("changelog") || lower.includes("release")) return "changelog";
  if (lower.includes("career") || lower.includes("jobs")) return "careers";
  if (lower.includes("docs")) return "docs";
  if (lower.includes("github.com")) return "github";
  if (inferBlogPageType(rawUrl)) return "blog";
  if (
    lower.includes("linkedin.com") ||
    lower.includes("twitter.com") ||
    lower.includes("x.com") ||
    lower.includes("youtube.com")
  ) {
    return "social";
  }
  if (lower.includes("about")) return "profile";
  return "custom";
}

// x-real-ip is set by the outermost trusted proxy (e.g. nginx) and is preferred
// because it cannot be injected by the client. x-forwarded-for is used as a
// fallback but its first value CAN be spoofed in direct-to-app deployments.
// Ensure a trusted reverse proxy is in front before relying on either header.
function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (host === "0.0.0.0") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const match172 = /^172\.(\d{1,3})\./.exec(host);
  if (match172) {
    const segment = Number(match172[1]);
    if (segment >= 16 && segment <= 31) return true;
  }
  return false;
}

function demoResultIsEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (isPlainObject(v) && Object.keys(v as Record<string, unknown>).length === 0) return true;
  return false;
}

function extractDemoBriefData(
  raw: unknown
): { positioning_signal: string; opportunity: string; watch_signal: string } | null {
  const payload =
    isPlainObject(raw) && "data" in (raw as Record<string, unknown>) ? (raw as Record<string, unknown>).data : raw;
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

// Attempt to acquire a per-IP lock using a unique-key INSERT.
// Safe with Prisma connection pooling — no session affinity required.
// Returns true if the lock was acquired, false if another scan is in progress.
// Any DB error other than a unique-constraint violation (P2002) is rethrown so
// the caller can surface a proper 5xx rather than a misleading 429.
// Note: orphaned locks from server crashes can be cleared manually:
//   DELETE FROM demo_ip_locks WHERE acquired_at < NOW() - INTERVAL '1 hour';
async function tryAcquireLock(hashedIp: string): Promise<boolean> {
  try {
    await prisma.demoIpLock.create({ data: { ipHash: hashedIp } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Unique constraint violation — another scan is active for this IP.
      return false;
    }
    throw e; // Unexpected DB error — let the route surface a 5xx.
  }
}

async function releaseLock(hashedIp: string): Promise<void> {
  await prisma.demoIpLock.delete({ where: { ipHash: hashedIp } }).catch(() => {
    // Already released (e.g. cancel() and stream finally both fire) — safe to ignore.
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const hashedIp = ipHash(ip);

  const locked = await tryAcquireLock(hashedIp);
  if (!locked) {
    return new Response(JSON.stringify({ error: "A demo scan is already in progress for this IP." }), {
      status: 429,
      headers: { "content-type": "application/json" }
    });
  }

  let lockOwnedByStream = false;

  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const scansToday = await prisma.demoScan.count({
      where: { ipHash: hashedIp, scannedAt: { gte: dayStart } }
    });

    if (scansToday >= MAX_SCANS_PER_DAY) {
      return new Response(JSON.stringify({ error: "Demo rate limit exceeded (3 scans/day)." }), {
        status: 429,
        headers: { "content-type": "application/json" }
      });
    }

    let rawUrl: string;
    try {
      const body = (await request.json()) as { url?: string };
      rawUrl = body.url?.trim() ?? "";
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    if (!rawUrl) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    if ((parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") || isPrivateHost(parsedUrl.hostname)) {
      return new Response(JSON.stringify({ error: "URL is not allowed for demo scanning." }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const type = inferPageType(parsedUrl.toString());
    const isLocal = process.env.DEMO_SKIP_PERSISTENCE === "true";
    lockOwnedByStream = true;

    const stream = new ReadableStream({
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
                customTask:
                  type === "custom" ? "Extract high-signal competitive intelligence from this page." : undefined
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
                message:
                  "Scan exceeded the 22s limit — try a simpler page type (homepage, blog, docs) for faster results."
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
      },
      cancel() {
        if (!isLocal) void releaseLock(hashedIp);
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      }
    });
  } finally {
    if (!lockOwnedByStream) {
      await releaseLock(hashedIp);
    }
  }
}
