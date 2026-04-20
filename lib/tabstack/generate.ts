/**
 * Tabstack `/generate` module.
 *
 * What it does:
 * - Fetches a URL and transforms its content using AI instructions.
 * - Used in Rival for two purposes:
 *   1. Diff summaries: compare a previous scan result to the current page state.
 *   2. Intelligence briefs: analyze competitor data and produce a structured brief.
 *
 * Cost tier:
 * - Medium. The endpoint fetches the URL and runs an LLM transform — more expensive
 *   than extract/markdown but cheaper than automate. Avoid scheduling frequent calls.
 *
 * When to use vs alternatives:
 * - Use generateDiff after each scan cycle to summarize what changed.
 * - Use generateBrief after a full scan cycle to produce competitive positioning.
 * - Use /extract/json when you need raw structured data without LLM transformation.
 * - Use /research when you need open-web research beyond a single URL.
 *
 * Key parameters:
 * - `url`: the competitor page to fetch and analyze.
 * - `instructions`: natural language prompt driving the transformation.
 * - `jsonSchema`: the output structure you want back.
 * - `effort`: explicit per call (`low`/`high` mapped to SDK effort values).
 * - `nocache`: should be `true` on scheduled scans.
 * - `geoTarget`: optional country targeting.
 *
 * Fallback behavior:
 * - No auto-fallback in this module. Fallback policy lives in scanner.ts.
 * - If /generate returns an empty result, the caller should log and skip diff generation.
 */

import type { GenerateJsonParams, GenerateJsonResponse } from "@tabstack/sdk/resources/generate";

import { logger, type LoggerCallMetadata, type TabstackEffort } from "@/lib/logger";
import { getTabstackClient, toGeoTarget, toSdkEffort } from "@/lib/tabstack/client";

const MAX_CONTEXT_LENGTH = 50_000;

// ---------------------------------------------------------------------------
// Diff summary
// ---------------------------------------------------------------------------

/**
 * Output schema for diff summaries.
 * Injected into /generate so the LLM returns a structured changelog.
 */
export const DIFF_SCHEMA = {
  type: "object",
  properties: {
    added: {
      type: "array",
      items: { type: "string" },
      description: "New items, features, or information added since the last scan"
    },
    changed: {
      type: "array",
      items: { type: "string" },
      description: "Items that existed before but have been modified"
    },
    removed: {
      type: "array",
      items: { type: "string" },
      description: "Items that existed before but are no longer present"
    },
    summary: {
      type: "string",
      description: "One to two sentence plain-English summary of the most significant changes"
    }
  },
  required: ["added", "changed", "removed", "summary"]
} as const;

export const DIFF_EXPECTED_FIELDS: string[] = [...DIFF_SCHEMA.required];

export type GenerateDiffInput = {
  competitorId?: string | null;
  pageId?: string | null;
  url: string;
  previousContent: string;
  /**
   * The just-captured version of the page from the current scan cycle. When
   * provided, the diff compares previousContent against this snapshot rather
   * than whatever generate.json re-fetches from the live URL. This avoids
   * false positives caused by dynamic content (rotating hero copy, timestamps,
   * A/B variants) differing between the primary scan fetch and the diff fetch
   * seconds later.
   */
  currentContent?: string;
  effort: TabstackEffort;
  nocache: boolean;
  geoTarget?: string | null;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
};

/**
 * Compare the current state of a URL against a previous scan result.
 * Returns a structured diff: added, changed, removed, and a plain-English summary.
 */
export async function generateDiff(input: GenerateDiffInput): Promise<GenerateJsonResponse> {
  const client = getTabstackClient();
  const geoTarget = toGeoTarget(input.geoTarget);
  const previousContent = input.previousContent.slice(0, MAX_CONTEXT_LENGTH);
  if (input.previousContent.length > MAX_CONTEXT_LENGTH) {
    process.emitWarning(
      `[generateDiff] previousContent truncated from ${input.previousContent.length} to ${MAX_CONTEXT_LENGTH} chars`,
      { code: "RIVAL_CONTEXT_TRUNCATED" }
    );
  }

  // Treat any string as an authoritative snapshot — including "". An empty
  // currentContent is a valid "everything was removed" signal; falling back
  // to the live-fetch prompt path here would both miss that diff and
  // reintroduce the double-fetch false positives this module exists to fix.
  const rawCurrentContent = input.currentContent;
  const hasCurrentContent = typeof rawCurrentContent === "string";
  const currentContent = hasCurrentContent ? rawCurrentContent.slice(0, MAX_CONTEXT_LENGTH) : null;
  if (hasCurrentContent && rawCurrentContent.length > MAX_CONTEXT_LENGTH) {
    process.emitWarning(
      `[generateDiff] currentContent truncated from ${rawCurrentContent.length} to ${MAX_CONTEXT_LENGTH} chars`,
      { code: "RIVAL_CONTEXT_TRUNCATED" }
    );
  }

  const instructions = hasCurrentContent
    ? `Compare the two versions of a competitor page provided below.
Base your diff ONLY on these two snapshots — do not rely on any live content
that may be fetched alongside this request. Both snapshots were captured by
this system; the "Current version" is the authoritative new state.

List what was added, changed, or removed in plain English.
Be concise. Focus on developer-facing changes. If the two versions are
effectively identical (only whitespace, ordering, or boilerplate differs),
return empty added/changed/removed lists and an empty summary.

Previous version:
${previousContent}

Current version:
${currentContent}`
    : `Compare these two versions of a competitor page.
List what was added, changed, or removed in plain English.
Be concise. Focus on developer-facing changes.

Previous version:
${previousContent}`;

  const requestPayload: GenerateJsonParams = {
    url: input.url,
    instructions,
    json_schema: DIFF_SCHEMA,
    effort: toSdkEffort(input.effort),
    nocache: input.nocache,
    geo_target: geoTarget
  };

  return logger.call(() => client.generate.json(requestPayload), {
    competitorId: input.competitorId,
    pageId: input.pageId,
    endpoint: "generate",
    url: input.url,
    effort: input.effort,
    nocache: input.nocache,
    geoTarget: geoTarget?.country,
    isDemo: input.isDemo,
    fallback: input.fallback,
    expectedFields: DIFF_EXPECTED_FIELDS
  });
}

// ---------------------------------------------------------------------------
// Intelligence brief
// ---------------------------------------------------------------------------

/**
 * Output schema for intelligence briefs.
 * Covers positioning, content, and product opportunities plus threat level.
 */
export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    positioning_opportunity: {
      type: "string",
      description: "What gap does their weakness create for you?"
    },
    content_opportunity: {
      type: "string",
      description: "What topics should you own based on their blind spots?"
    },
    product_opportunity: {
      type: "string",
      description: "What are developers complaining about that you could solve?"
    },
    threat_level: {
      type: "string",
      enum: ["High", "Medium", "Low"],
      description: "Overall competitive threat level"
    },
    threat_reasoning: {
      type: "string",
      description: "One sentence explaining the threat level rating"
    },
    watch_list: {
      type: "array",
      items: { type: "string" },
      description: "Two to three signals to monitor next cycle"
    }
  },
  required: [
    "positioning_opportunity",
    "content_opportunity",
    "product_opportunity",
    "threat_level",
    "threat_reasoning",
    "watch_list"
  ]
} as const;

export const BRIEF_EXPECTED_FIELDS: string[] = [...BRIEF_SCHEMA.required];

export type GenerateBriefInput = {
  competitorId?: string | null;
  pageId?: string | null;
  url: string;
  contextData: string;
  effort: TabstackEffort;
  nocache: boolean;
  geoTarget?: string | null;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
};

/**
 * Analyze all collected competitor data and produce a structured intelligence brief.
 * Pass the competitor's base URL plus a JSON-serialized snapshot of their data as contextData.
 */
export async function generateBrief(input: GenerateBriefInput): Promise<GenerateJsonResponse> {
  const client = getTabstackClient();
  const geoTarget = toGeoTarget(input.geoTarget);
  const contextData = input.contextData.slice(0, MAX_CONTEXT_LENGTH);
  if (input.contextData.length > MAX_CONTEXT_LENGTH) {
    process.emitWarning(
      `[generateBrief] contextData truncated from ${input.contextData.length} to ${MAX_CONTEXT_LENGTH} chars`,
      { code: "RIVAL_CONTEXT_TRUNCATED" }
    );
  }

  const instructions = `You are a competitive intelligence analyst. Based on this competitor data,
produce a structured brief covering:
1. Positioning opportunity — what gap does their weakness create?
2. Content opportunity — what topics should you own based on their blind spots?
3. Product opportunity — what are developers complaining about that you could solve?
4. Threat level — rate as High, Medium, or Low using this rubric, with one sentence of reasoning:
   - High: Direct feature AND audience overlap, AND active momentum in the last ~30 days
     (recent launches, relevant hiring, pricing moves, or notable GitHub/community growth).
   - Medium: Partial overlap (audience OR use case, not both), OR full overlap with stalled
     execution (no recent shipping, hiring, or pricing activity).
   - Low: Adjacent space, different ICP, or clear wind-down signals.
   Reserve High for competitors with BOTH overlap AND momentum. When evidence is mixed,
   sparse, or ambiguous, default to Medium rather than High.
5. Watch list: 2-3 signals to monitor next cycle
Be direct and specific. No generic advice.

Additional competitor context:
${contextData}`;

  const requestPayload: GenerateJsonParams = {
    url: input.url,
    instructions,
    json_schema: BRIEF_SCHEMA,
    effort: toSdkEffort(input.effort),
    nocache: input.nocache,
    geo_target: geoTarget
  };

  return logger.call(() => client.generate.json(requestPayload), {
    competitorId: input.competitorId,
    pageId: input.pageId,
    endpoint: "generate",
    url: input.url,
    effort: input.effort,
    nocache: input.nocache,
    geoTarget: geoTarget?.country,
    isDemo: input.isDemo,
    fallback: input.fallback,
    expectedFields: BRIEF_EXPECTED_FIELDS
  });
}
