// Edge runtime — no function timeout, supports long-running SSE streams.
// Prisma is not available here; DB persistence is handled by /api/deep-dive/save.
export const runtime = "edge";

import { buildPromptForTemplate } from "@/lib/deep-dive-templates";
import { parseSseChunk } from "@/lib/utils/sse";

type ResearchCitation = { claim: string; source_url: string; source_text?: string };

function extractResult(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data ?? null;
  const d = data as Record<string, unknown>;
  if ("result" in d) return d.result;
  const { citations: _c, ...rest } = d;
  return Object.keys(rest).length > 0 ? rest : null;
}

function extractCitations(data: unknown): ResearchCitation[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const raw = (data as Record<string, unknown>).citations;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown): ResearchCitation[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const r = item as Record<string, unknown>;
    if (typeof r.source_url !== "string") return [];
    try {
      const u = new URL(r.source_url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return [];
    } catch {
      return [];
    }
    return [
      {
        claim: typeof r.claim === "string" ? r.claim : "",
        source_url: r.source_url,
        source_text: typeof r.source_text === "string" ? r.source_text : undefined
      }
    ];
  });
}

type DeepDiveRequest = {
  competitorId?: string;
  competitorName?: string;
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

export async function POST(request: Request) {
  const body = (await request.json()) as DeepDiveRequest;
  if (!body.competitorId || !body.competitorName) {
    return new Response(JSON.stringify({ error: "competitorId and competitorName are required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const mode = body.mode ?? "balanced";
  const promptTemplate = body.promptTemplate ?? null;
  const query =
    (promptTemplate ? buildPromptForTemplate(promptTemplate, body.competitorName) : null) ??
    buildResearchQuery(body.competitorName);

  const stream = new ReadableStream({
    start: async (controller) => {
      let completeEventData: unknown = undefined;
      let errorOccurred = false;

      try {
        controller.enqueue(sse("research:started", { competitorId: body.competitorId, mode, promptTemplate }));

        const apiKey = process.env.TABSTACK_API_KEY ?? "";
        if (!apiKey) throw new Error("TABSTACK_API_KEY is not configured");
        const baseURL = process.env.TABSTACK_BASE_URL ?? "https://api.tabstack.ai/v1";

        const rawResponse = await fetch(`${baseURL}/research`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query, mode })
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
              errorOccurred = true;
              controller.enqueue(
                sse("research:error", {
                  error:
                    typeof (parsed.data as Record<string, unknown>)?.error === "string"
                      ? String((parsed.data as Record<string, unknown>).error)
                      : "Research failed"
                })
              );
              break;
            }
          }
          if (errorOccurred) break;
        }
        if (buf.trim()) {
          for (const parsed of parseSseChunk(buf)) {
            if (parsed.event === "complete") completeEventData = parsed.data;
          }
        }

        if (!errorOccurred) {
          const result = extractResult(completeEventData);
          const citations = extractCitations(completeEventData);
          // Include query so the client can persist it via /api/deep-dive/save
          controller.enqueue(sse("research:complete", { result, citations, query }));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Deep dive failed";
        // On any error, still try to deliver what we collected
        if (completeEventData !== undefined) {
          const result = extractResult(completeEventData);
          const citations = extractCitations(completeEventData);
          controller.enqueue(sse("research:complete", { result, citations, query }));
        } else {
          controller.enqueue(sse("research:error", { error: msg }));
        }
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
