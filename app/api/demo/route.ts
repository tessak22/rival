import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { scanPage } from "@/lib/scanner";

const MAX_SCANS_PER_DAY = 3;
const activeScans = new Set<string>();
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
  if (lower.includes("linkedin.com") || lower.includes("twitter.com") || lower.includes("x.com") || lower.includes("youtube.com")) {
    return "social";
  }
  if (lower.includes("about")) return "profile";
  return "custom";
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const hashedIp = ipHash(ip);

  if (activeScans.has(hashedIp)) {
    return new Response(JSON.stringify({ error: "A demo scan is already in progress for this IP." }), {
      status: 429,
      headers: { "content-type": "application/json" }
    });
  }

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

  const type = inferPageType(parsedUrl.toString());

  const stream = new ReadableStream({
    start: async (controller) => {
      activeScans.add(hashedIp);
      try {
        controller.enqueue(sse("scan:started", { url: parsedUrl.toString() }));
        controller.enqueue(sse("scan:endpoint", { type }));

        const result = await scanPage({
          url: parsedUrl.toString(),
          type,
          isDemo: true,
          customTask: type === "custom" ? "Extract high-signal competitive intelligence from this page." : undefined
        });

        await prisma.demoScan.create({
          data: {
            ipHash: hashedIp
          }
        });

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
        activeScans.delete(hashedIp);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}
