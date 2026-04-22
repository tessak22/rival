import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

// Allow up to 120s — balanced research mode takes 1-2 minutes
export const maxDuration = 120;

import { prisma } from "@/lib/db/client";
import { getTabstackClient } from "@/lib/tabstack/client";
import { extractResult, extractCitations } from "@/lib/tabstack/research";
import { buildPromptForTemplate } from "@/lib/deep-dive-templates";

type DeepDiveRequest = {
  competitorId?: string;
  mode?: "fast" | "balanced";
  promptTemplate?: string | null;
};

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildResearchQuery(name: string): string {
  return `Research ${name} as a competitive threat. Cover:
- Developer sentiment across forums, GitHub issues, and social
- Strategic moves and product changes in the last 6 months
- Actual developer experience vs. marketing claims
- Hiring signals and org changes
- Funding, acquisition, or partnership signals
Provide inline citations for every claim.`;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return value as Prisma.InputJsonValue;
  }
  return String(value);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as DeepDiveRequest;
  if (!body.competitorId) {
    return new Response(JSON.stringify({ error: "competitorId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const mode = body.mode ?? "balanced";
  const promptTemplate = body.promptTemplate ?? null;

  const competitor = await prisma.competitor.findUnique({ where: { id: body.competitorId } });
  if (!competitor) {
    return new Response(JSON.stringify({ error: "Competitor not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  const client = getTabstackClient();

  const stream = new ReadableStream({
    start: async (controller) => {
      const startTime = Date.now();
      let status: "success" | "error" = "success";
      let rawError: string | undefined;

      try {
        controller.enqueue(sse("research:started", { competitorId: competitor.id, mode, promptTemplate }));

        // /research has a strict query length limit — skip selfContext injection here.
        // Self-context framing is most valuable for /generate (comparative briefs);
        // deep dive research is raw open-web intelligence gathering where it adds
        // length overhead without meaningfully improving results.
        const query =
          (promptTemplate ? buildPromptForTemplate(promptTemplate, competitor.name) : null) ??
          buildResearchQuery(competitor.name);

        // Stream directly from SDK — each event is forwarded immediately, avoiding timeout
        const researchStream = await client.agent.research({ query, mode: mode as "fast" | "balanced", nocache: true });

        let completeEventData: unknown = undefined;

        // Manual iteration so we can catch per-call SyntaxErrors from the SDK.
        // The Tabstack server sends keepalives as `data: :keepalive` — a data field
        // with a colon-prefixed value. The SDK calls JSON.parse(":keepalive"), throws
        // a SyntaxError, and terminates for-await. With manual next() we can break
        // gracefully and proceed with whatever data we already received.
        const iter = researchStream[Symbol.asyncIterator]();
        while (true) {
          let next: IteratorResult<Awaited<ReturnType<typeof iter.next>>["value"]>;
          try {
            next = await iter.next();
          } catch (err) {
            // Keepalive SyntaxError — break and deliver whatever we have
            if (err instanceof SyntaxError) break;
            throw err;
          }
          if (next.done) break;
          const event = next.value;
          controller.enqueue(sse("research:progress", { event: event.event ?? "unknown", data: event.data }));
          if (event.event === "complete") completeEventData = event.data;
          if (event.event === "error") {
            status = "error";
            rawError = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
            break;
          }
        }

        if (status === "error") {
          controller.enqueue(sse("research:error", { error: rawError }));
        } else {
          const result = extractResult(completeEventData);
          const citations = extractCitations(completeEventData);

          await prisma.deepDive.create({
            data: {
              competitorId: competitor.id,
              mode: mode as string,
              query,
              result: toJsonValue(result),
              citations: toJsonValue(citations),
              promptTemplate: promptTemplate ?? null
            }
          });

          controller.enqueue(sse("research:complete", { result, citations }));
        }
      } catch (error) {
        status = "error";
        rawError = error instanceof Error ? error.message : "Deep dive failed";
        controller.enqueue(sse("research:error", { error: rawError }));
      } finally {
        // Fail-open: log write must never prevent stream close
        try {
          await prisma.apiLog.create({
            data: {
              competitorId: competitor.id,
              endpoint: "research",
              mode,
              nocache: true,
              status,
              rawError: rawError ?? null,
              durationMs: Date.now() - startTime,
              resultQuality: status === "success" ? "full" : "empty",
              isDemo: false
            }
          });
        } catch {
          // api_log failure is non-fatal
        }
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
