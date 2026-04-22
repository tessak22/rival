import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

// Allow up to 120s — balanced research mode takes 1-2 minutes
export const maxDuration = 120;

import { prisma } from "@/lib/db/client";
import { extractResult, extractCitations } from "@/lib/tabstack/research";
import { buildPromptForTemplate } from "@/lib/deep-dive-templates";
import { parseSseChunk } from "@/lib/utils/sse";

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

  const stream = new ReadableStream({
    start: async (controller) => {
      const startTime = Date.now();
      let status: "success" | "error" = "success";
      let rawError: string | undefined;
      let completeEventData: unknown = undefined;
      const query =
        (promptTemplate ? buildPromptForTemplate(promptTemplate, competitor.name) : null) ??
        buildResearchQuery(competitor.name);

      try {
        controller.enqueue(sse("research:started", { competitorId: competitor.id, mode, promptTemplate }));

        // Bypass the SDK's SSE parser for research — the Tabstack server sends keepalives
        // as `data: :keepalive` which causes the SDK to call JSON.parse(":keepalive") and
        // throw a SyntaxError. We make a direct HTTP request and handle SSE parsing
        // ourselves using parseSseChunk, which already skips colon-prefixed data values.
        const apiKey = process.env.TABSTACK_API_KEY!;
        const baseURL = process.env.TABSTACK_BASE_URL ?? "https://api.tabstack.ai/v1";
        const rawResponse = await fetch(`${baseURL}/agent/research`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream"
          },
          body: JSON.stringify({ query, mode, nocache: true }),
          signal: AbortSignal.timeout(115_000)
        });

        if (!rawResponse.ok || !rawResponse.body) {
          throw new Error(`Tabstack research request failed: ${rawResponse.status}`);
        }

        const reader = rawResponse.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const parsed of parseSseChunk(chunks.join("\n\n"))) {
            controller.enqueue(sse("research:progress", { event: parsed.event, data: parsed.data }));
            if (parsed.event === "complete") completeEventData = parsed.data;
            if (parsed.event === "error") {
              status = "error";
              rawError =
                typeof (parsed.data as Record<string, unknown>)?.error === "string"
                  ? String((parsed.data as Record<string, unknown>).error)
                  : "Research failed";
              break;
            }
          }
          if (status === "error") break;
        }
        if (buf.trim()) {
          for (const parsed of parseSseChunk(buf)) {
            if (parsed.event === "complete") completeEventData = parsed.data;
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
        // Keepalive SyntaxError as belt-and-suspenders — deliver whatever we have
        if (error instanceof SyntaxError) {
          const result = extractResult(completeEventData);
          const citations = extractCitations(completeEventData);
          try {
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
          } catch {
            // non-fatal
          }
          controller.enqueue(sse("research:complete", { result, citations }));
        } else {
          status = "error";
          rawError = error instanceof Error ? error.message : "Deep dive failed";
          controller.enqueue(sse("research:error", { error: rawError }));
        }
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
