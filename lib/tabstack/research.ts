/**
 * Tabstack `/research` module.
 *
 * What it does:
 * - Runs a multi-pass autonomous research loop to answer open-ended competitive
 *   intelligence questions. Powers Rival's Deep Dive feature.
 * - Decomposes the query, discovers sources in parallel, evaluates gaps,
 *   verifies claims, then synthesizes a structured report with citations.
 * - Always streams SSE events — this module collects the full stream before returning.
 *
 * Cost tier:
 * - Highest in Rival's endpoint set. Especially in `balanced` mode, which runs
 *   multiple recursive web passes. Use on-demand only, never on a schedule.
 *
 * When to use vs alternatives:
 * - Use for Deep Dive: "What are developers saying about this competitor?"
 * - Use when scheduled scans don't answer the question (open web, forums, GitHub issues).
 * - Do not use for structured data extraction — use /extract/json instead.
 * - Do not use on a cron schedule — too expensive and unnecessary for routine scans.
 *
 * Key parameters:
 * - `query`: the research question in natural language.
 * - `mode`: "fast" (10-30s, lightweight) or "balanced" (1-2min, full recursive loop).
 * - `nocache`: skip cache for fresh results.
 *
 * Important SDK difference from other endpoints:
 * - NO `url` param — research searches the open web based on the query.
 * - NO `effort` param — `mode` replaces effort semantics.
 * - NO `geo_target` — research is global by default.
 * - Rival logs effort as null and mode in the `mode` field of api_logs.
 *
 * Fallback behavior:
 * - No auto-fallback. If research fails, the error is returned in result.error.
 * - The caller (API route / scanner) decides whether to retry or surface the error.
 *
 * SSE event phases (balanced mode):
 *   phase     → entering a research phase (decompose / discover / evaluate / verify / synthesize)
 *   progress  → incremental update within a phase (useful for UI progress indicators)
 *   complete  → final result + citations
 *   error     → research failed
 */

import type { ResearchEvent } from "@tabstack/sdk/resources/agent";

import { logger, type LoggerCallMetadata, type TabstackMode } from "@/lib/logger";
import { getTabstackClient } from "@/lib/tabstack/client";

export type { TabstackMode };

export type ResearchCitation = {
  claim: string;
  source_url: string;
  source_text?: string;
};

export type ResearchResult = {
  events: ResearchEvent[];
  result: unknown;
  citations: ResearchCitation[];
  error?: string;
};

export type ResearchInput = {
  competitorId?: string | null;
  pageId?: string | null;
  query: string;
  mode: TabstackMode;
  nocache?: boolean;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
};

function extractCitations(data: unknown): ResearchCitation[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const payload = data as Record<string, unknown>;
  const raw = payload["citations"];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item: unknown): ResearchCitation[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const c = item as Record<string, unknown>;
    if (typeof c["source_url"] !== "string") {
      return [];
    }

    return [
      {
        claim: typeof c["claim"] === "string" ? c["claim"] : "",
        source_url: c["source_url"],
        source_text: typeof c["source_text"] === "string" ? c["source_text"] : undefined
      }
    ];
  });
}

function extractResult(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data ?? null;
  }

  const payload = data as Record<string, unknown>;

  // Prefer explicit `result` field; fall back to entire payload minus citations
  if ("result" in payload) {
    return payload["result"];
  }

  const { citations: _citations, ...rest } = payload;
  return Object.keys(rest).length > 0 ? rest : null;
}

async function collectStream(stream: AsyncIterable<ResearchEvent>): Promise<{
  events: ResearchEvent[];
  result: unknown;
  citations: ResearchCitation[];
  error: string | undefined;
}> {
  const events: ResearchEvent[] = [];
  let error: string | undefined;

  for await (const event of stream) {
    events.push(event);
    if (event.event === "error") {
      const raw = event.data;
      error = typeof raw === "string" ? raw : JSON.stringify(raw);
    }
  }

  const completeEvent = events.findLast((e) => e.event === "complete");

  return {
    events,
    result: extractResult(completeEvent?.data),
    citations: extractCitations(completeEvent?.data),
    error
  };
}

/**
 * Run an autonomous research loop and return a structured result with citations.
 *
 * The SSE stream is fully consumed before returning. Phase/progress events are
 * preserved in `result.events` so the API route layer can relay them to the UI
 * as a live stream for the Deep Dive page.
 */
export async function runResearch(input: ResearchInput): Promise<ResearchResult> {
  const client = getTabstackClient();

  return logger.call(
    async () => {
      const stream = await client.agent.research({
        query: input.query,
        mode: input.mode,
        nocache: input.nocache
      });

      const { events, result, citations, error } = await collectStream(stream);
      return { events, result, citations, error } satisfies ResearchResult;
    },
    {
      competitorId: input.competitorId,
      pageId: input.pageId,
      endpoint: "research",
      url: null,
      effort: null,
      nocache: input.nocache ?? null,
      mode: input.mode,
      isDemo: input.isDemo,
      fallback: input.fallback,
      expectedFields: ["result", "citations"]
    }
  );
}
