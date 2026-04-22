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
 * - `maxStreamEvents`: max intermediate events to buffer in memory (default 500).
 *   Terminal events (`complete` / `error`) are always captured regardless of this limit,
 *   so the result is never lost even if a long balanced run exceeds the cap.
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
import { buildSelfContext } from "@/lib/context/self-context";
import { getTabstackClient } from "@/lib/tabstack/client";
import { isPlainObject, stringifyUnknown } from "@/lib/utils/types";

export type ResearchCitation = {
  claim: string;
  source_url: string;
  source_text?: string;
};

export type ResearchResult = {
  events: ResearchEvent[];
  // result is unknown intentionally: the SDK synthesis output is an unpredictable
  // shape (string, object, or structured report) depending on the query. Every
  // caller must narrow before use. Do not cast without narrowing.
  result: unknown;
  citations: ResearchCitation[];
  error?: string;
};

export type ResearchInput = {
  competitorId?: string | null;
  pageId?: string | null;
  query: string;
  mode: TabstackMode;
  // nocache is optional (not required like in extract/generate) because research is
  // always on-demand — there is no scheduled scan path that must force-bust the cache.
  nocache?: boolean;
  maxStreamEvents?: number;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
};

export function extractCitations(data: unknown): ResearchCitation[] {
  if (!isPlainObject(data)) {
    return [];
  }

  const raw = data["citations"];

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item: unknown): ResearchCitation[] => {
    if (!isPlainObject(item)) {
      return [];
    }

    if (typeof item["source_url"] !== "string") {
      return [];
    }

    // Validate source_url is a safe http/https URL to prevent XSS/SSRF at ingestion
    try {
      const parsed = new URL(item["source_url"]);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return [];
      }
    } catch {
      return [];
    }

    return [
      {
        claim: typeof item["claim"] === "string" ? item["claim"] : "",
        source_url: item["source_url"],
        source_text: typeof item["source_text"] === "string" ? item["source_text"] : undefined
      }
    ];
  });
}

export function extractResult(data: unknown): unknown {
  if (!isPlainObject(data)) {
    return data ?? null;
  }

  // Prefer explicit `result` field; fall back to entire payload minus citations
  if ("result" in data) {
    return data["result"];
  }

  const { citations: _citations, ...rest } = data;
  return Object.keys(rest).length > 0 ? rest : null;
}

const DEFAULT_MAX_STREAM_EVENTS = 500;

async function collectStream(
  stream: AsyncIterable<ResearchEvent>,
  maxStreamEvents: number
): Promise<{
  events: ResearchEvent[];
  result: unknown;
  citations: ResearchCitation[];
  error: string | undefined;
}> {
  const events: ResearchEvent[] = [];
  let error: string | undefined;

  for await (const event of stream) {
    const isTerminal = event.event === "complete" || event.event === "error";
    // Always capture terminal events — they carry the result and must not be dropped.
    // Cap intermediate progress events to bound memory on long balanced-mode runs.
    if (isTerminal || events.length < maxStreamEvents) {
      events.push(event);
    }
    if (event.event === "error") {
      const raw = event.data;
      error = stringifyUnknown(raw);
      break; // Stop draining — a failed stream won't produce a valid complete event
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
      // NOTE: buildSelfContext runs inside logger.call's timed body, so
      // durationMs in api_logs includes a ~10–50ms Prisma round-trip on top
      // of the Tabstack SDK call. Negligible in balanced mode; small but
      // measurable fraction in fast mode. Matches the pattern in generate.ts.
      const selfContext = await buildSelfContext({ isDemo: input.isDemo });
      // "RESEARCH QUESTION:" separates the injected self-context from the
      // natural-language query. The context block itself ends with a "Do
      // not echo" directive (see buildSelfContext), which governs output
      // behavior for both brief and research paths.
      const query = selfContext ? `${selfContext}\n\nRESEARCH QUESTION:\n${input.query}` : input.query;

      const stream = await client.agent.research({
        query,
        mode: input.mode,
        nocache: input.nocache
      });

      const { events, result, citations, error } = await collectStream(
        stream,
        input.maxStreamEvents ?? DEFAULT_MAX_STREAM_EVENTS
      );
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
      // Quality scoring is skipped for research (expectedFields: []) because the
      // logger.call wrapper unwraps the ResearchResult envelope via firstObjectPayload()
      // and would evaluate the inner result (a string/unknown) against these field names,
      // producing schemaMismatch: true on every successful call.
      expectedFields: []
    }
  );
}
