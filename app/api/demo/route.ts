import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

const MAX_SCANS_PER_DAY = 3;
const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function inferPageType(rawUrl: string): string {
  const lower = rawUrl.toLowerCase();
  if (lower.includes("pricing")) return "pricing";
  if (lower.includes("changelog") || lower.includes("release")) return "changelog";
  if (lower.includes("career") || lower.includes("jobs")) return "careers";
  if (lower.includes("docs")) return "docs";
  if (lower.includes("github.com")) return "github";
  // Review platforms — content_blocked is expected and the most valuable
  // experience-logging signal in the codebase. Infer before generic checks.
  if (
    lower.includes("g2.com") ||
    lower.includes("capterra.com") ||
    lower.includes("trustpilot.com") ||
    lower.includes("producthunt.com")
  ) {
    return "reviews";
  }
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
    lockOwnedByStream = true;

    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          controller.enqueue(sse("scan:started", { url: parsedUrl.toString() }));
          controller.enqueue(sse("scan:endpoint", { type }));

          const result = await scanPage({
            url: parsedUrl.toString(),
            type,
            isDemo: true,
            customTask: type === "custom" ? "Extract high-signal competitive intelligence from this page." : undefined
          });

          await prisma.demoScan.create({ data: { ipHash: hashedIp } });

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
          controller.enqueue(
            sse("scan:error", {
              error: error instanceof Error ? error.message : "Demo scan failed"
            })
          );
        } finally {
          await releaseLock(hashedIp);
          controller.close();
        }
      },
      cancel() {
        void releaseLock(hashedIp);
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive"
      }
    });
  } finally {
    if (!lockOwnedByStream) {
      await releaseLock(hashedIp);
    }
  }
}
