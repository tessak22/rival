import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";
import { runResearch } from "@/lib/tabstack/research";

type DeepDiveRequest = {
  competitorId?: string;
  mode?: "fast" | "balanced";
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

export async function POST(request: NextRequest) {
  const body = (await request.json()) as DeepDiveRequest;
  if (!body.competitorId) {
    return new Response(JSON.stringify({ error: "competitorId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const mode = body.mode ?? "balanced";
  const competitor = await prisma.competitor.findUnique({ where: { id: body.competitorId } });
  if (!competitor) {
    return new Response(JSON.stringify({ error: "Competitor not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      try {
        controller.enqueue(sse("research:started", { competitorId: competitor.id, mode }));
        const query = buildResearchQuery(competitor.name);

        const result = await runResearch({
          competitorId: competitor.id,
          query,
          mode,
          nocache: true
        });

        for (const event of result.events) {
          controller.enqueue(
            sse("research:progress", {
              event: event.event ?? "unknown",
              data: event.data
            })
          );
        }

        await prisma.deepDive.create({
          data: {
            competitorId: competitor.id,
            mode,
            query,
            result: result.result as never,
            citations: result.citations as never
          }
        });

        controller.enqueue(
          sse("research:complete", {
            result: result.result,
            citations: result.citations
          })
        );
      } catch (error) {
        controller.enqueue(
          sse("research:error", {
            error: error instanceof Error ? error.message : "Deep dive failed"
          })
        );
      } finally {
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
