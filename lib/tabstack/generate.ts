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
 * - Use generateSelfProfile to analyze the user's own company surfaces and produce a self-profile used as context when evaluating competitors. Do not call on the demo path.
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
import { buildSelfContext } from "@/lib/context/self-context";

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

// Empty: empty arrays (added/changed/removed:[]) and empty summary are valid
// no-change results, not missing data. The logger treats zero expected fields
// as "full" for any non-null response, which is the correct signal here.
export const DIFF_EXPECTED_FIELDS: string[] = [];

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
    },
    openness_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = fully open source, transparent, no lock-in; 10 = fully proprietary, closed, high lock-in"
    },
    brand_trust_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = low brand recognition and trust; 10 = high brand recognition and trust"
    },
    pricing_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = entirely free or open source; 10 = premium or enterprise pricing only"
    },
    market_maturity_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = early-stage or emerging; 10 = established and mature market presence"
    },
    feature_breadth_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = narrow specialist with a single focused use case; 10 = broad generalist covering many use cases"
    },
    managed_service_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description:
        "0 = fully self-hosted library or framework the user runs themselves; 10 = fully managed cloud API with no infrastructure to operate"
    },
    llm_included_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description:
        "0 = no LLM or AI capabilities included, user must bring their own; 10 = LLM and AI capabilities fully built in and ready to use"
    }
  },
  required: [
    "positioning_opportunity",
    "content_opportunity",
    "product_opportunity",
    "threat_level",
    "threat_reasoning",
    "watch_list",
    "openness_score",
    "brand_trust_score",
    "pricing_score",
    "market_maturity_score",
    "feature_breadth_score",
    "managed_service_score",
    "llm_included_score"
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

  const selfContext = await buildSelfContext({ isDemo: input.isDemo });

  // Framing block is only appended when self-context is present. Without a
  // self company, there is no "self" to contrast against and the LLM should
  // fall back to generic competitor analysis rather than hallucinate a delta.
  const comparativeFraming = selfContext
    ? `Framing rules — apply to EVERY field you produce:
- Refer to the self company by the Name given in the CONTEXT block above. Never use "you", "we", "our product", or "the user".
- Refer to the competitor by name too. Never "this competitor" or "they" in isolation.
- Every opportunity and the threat_reasoning must make the delta explicit: "<Competitor> does X; <Self company> does Y; therefore <implication for the self company>." Cite specific differentiators from the CONTEXT block when they sharpen the contrast.
- Do not emit generic SaaS advice ("improve UX", "add integrations", "create better content") unless you tie it directly to one of the self company's stated differentiators or ICP details.

`
    : "";

  // selfContext is bounded by buildSelfContext's internal payload cap
  // (~800 chars). Combined with the contextData slice above, total
  // instructions length stays well under Tabstack's /generate limits.
  const instructions = `${selfContext ? `${selfContext}\n\n` : ""}${comparativeFraming}You are a competitive intelligence analyst. Based on this competitor data,
produce a structured brief covering:
1. Positioning opportunity — what gap does their weakness create?
2. Content opportunity — what topics should you own based on their blind spots?
3. Product opportunity — what are developers complaining about that you could solve?
4. Threat level — rate as High, Medium, or Low using this rubric, with one sentence of reasoning:
   - High: A direct commercial competitor — a paid, managed, or hosted offering — with
     clear feature AND audience overlap AND active momentum in the last ~30 days
     (launches, relevant hiring, pricing moves, or notable paying-customer / growth signals).
   - Medium: (a) a pure open-source project (library, SDK, or framework) with NO paid
     or managed counterpart; (b) a commercial competitor with stalled execution (no
     recent shipping, hiring, or pricing activity); OR (c) partial overlap — audience
     OR use case, but not both.
   - Low: Adjacent space, different ICP, or clear wind-down signals.
   Important distinctions — apply in order:
   - FIRST ask the revenue question: can a customer buy this specific product
     today — with a credit card, a sales contract, or a managed/hosted SKU? If
     NO, the threat is Medium at most, full stop. Corporate backing alone does
     NOT count: a large company maintaining an open-source project as a
     community investment, without selling a paid or managed version of it,
     still fails the revenue question. Momentum, stars, downloads, corporate
     sponsorship, and "widely used in industry" are not substitutes for a paid
     offering.
   - If the revenue answer is YES, then rate on what they actually sell. Many
     companies ship an open-source project alongside a paid product (open-core).
     Judge them on the paid offering, not the repo — an open-core company
     running a managed cloud or paid service is rated like any other commercial
     competitor, and if overlap + momentum are present, they are High. Do NOT
     anchor on "Medium at most" just because the codebase is open-source.
   - A pure library / framework / SDK with no paid counterpart is Medium at
     most, regardless of stars, downloads, or corporate backing.
   - Reserve High for offerings that directly compete for our REVENUE, not for
     mindshare or developer adoption alone.
   - When evidence is mixed, sparse, or ambiguous, default to Medium rather than High.
5. Watch list: 2-3 signals to monitor next cycle
6. Positioning axis scores — using only the competitor data provided, rate each
   of the seven dimensions on a 0–10 scale as defined in the output schema:
   openness_score, brand_trust_score, pricing_score, market_maturity_score,
   feature_breadth_score, managed_service_score, llm_included_score. Base each
   score on explicit signals in the data; do not use general market knowledge
   as a substitute for absent data.
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

// ---------------------------------------------------------------------------
// Self-profile
// ---------------------------------------------------------------------------

/**
 * Output schema for self-profile generation.
 * Covers positioning, ICP, pricing, differentiators, and recent signals.
 */
export const SELF_PROFILE_SCHEMA = {
  type: "object",
  properties: {
    positioning_summary: {
      type: "string",
      description: "1–2 sentences describing who this company is and what it sells."
    },
    icp_summary: {
      type: "string",
      description: "1–2 sentences describing the company's ideal customer profile."
    },
    pricing_summary: {
      type: "string",
      description: "Brief description of the monetization model (free, paid, freemium, OSS+paid, etc.)."
    },
    differentiators: {
      type: "array",
      items: { type: "string" },
      description: "3–5 bullets naming what makes this company distinct."
    },
    recent_signals: {
      type: "array",
      items: { type: "string" },
      description: "3–5 bullets of recent changes visible from changelog, blog, or careers."
    },
    openness_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = fully open source, transparent, no lock-in; 10 = fully proprietary, closed, high lock-in"
    },
    brand_trust_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = low brand recognition and trust; 10 = high brand recognition and trust"
    },
    pricing_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = entirely free or open source; 10 = premium or enterprise pricing only"
    },
    market_maturity_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = early-stage or emerging; 10 = established and mature market presence"
    },
    feature_breadth_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = narrow specialist with a single focused use case; 10 = broad generalist covering many use cases"
    },
    managed_service_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description:
        "0 = fully self-hosted library or framework the user runs themselves; 10 = fully managed cloud API with no infrastructure to operate"
    },
    llm_included_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description:
        "0 = no LLM or AI capabilities included, user must bring their own; 10 = LLM and AI capabilities fully built in and ready to use"
    }
  },
  required: [
    "positioning_summary",
    "icp_summary",
    "pricing_summary",
    "differentiators",
    "recent_signals",
    "openness_score",
    "brand_trust_score",
    "pricing_score",
    "market_maturity_score",
    "feature_breadth_score",
    "managed_service_score",
    "llm_included_score"
  ]
} as const;

export const SELF_PROFILE_EXPECTED_FIELDS: string[] = [...SELF_PROFILE_SCHEMA.required];

export type GenerateSelfProfileInput = Omit<GenerateBriefInput, "fallback" | "isDemo">;

/**
 * Analyze the user's own company data and produce a structured self-profile.
 * This output is stored on the self Competitor row and later injected as context
 * into every competitor-facing AI call (brief, research, compare).
 */
export async function generateSelfProfile(input: GenerateSelfProfileInput): Promise<GenerateJsonResponse> {
  const client = getTabstackClient();
  const geoTarget = toGeoTarget(input.geoTarget);
  const contextData = input.contextData.slice(0, MAX_CONTEXT_LENGTH);
  if (input.contextData.length > MAX_CONTEXT_LENGTH) {
    process.emitWarning(
      `[generateSelfProfile] contextData truncated from ${input.contextData.length} to ${MAX_CONTEXT_LENGTH} chars`,
      { code: "RIVAL_CONTEXT_TRUNCATED" }
    );
  }

  const instructions = `You are analyzing a company's own public surfaces (website, pricing,
docs, changelog, careers, blog, social) to produce a concise self-profile. This
profile will later be used as context when evaluating competitors, so it must be
factual and compact.

Produce:
1. positioning_summary — 1–2 sentences: who they are, what they sell.
2. icp_summary — 1–2 sentences: who they serve (technical ICP + use case).
3. pricing_summary — monetization model in one short paragraph.
4. differentiators — 3–5 bullets of what makes them distinct (not marketing fluff).
5. recent_signals — 3–5 bullets of recent changes visible in changelog, blog, or careers.
6. Positioning axis scores — using only the data provided, rate each of the seven
   dimensions on a 0–10 scale as defined in the output schema: openness_score,
   brand_trust_score, pricing_score, market_maturity_score, feature_breadth_score,
   managed_service_score, llm_included_score. Base each score on explicit signals
   in the data; do not use general market knowledge as a substitute for absent data.

Be direct and specific. No generic commentary. Do not speculate — only describe
what the data shows.

Company data:
${contextData}`;

  const requestPayload: GenerateJsonParams = {
    url: input.url,
    instructions,
    json_schema: SELF_PROFILE_SCHEMA,
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
    expectedFields: SELF_PROFILE_EXPECTED_FIELDS
  });
}

// ---------------------------------------------------------------------------
// Demo intelligence brief
// ---------------------------------------------------------------------------

export const DEMO_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    positioning_signal: {
      type: "string",
      description: "How this company is positioning itself right now, in one sentence."
    },
    opportunity: {
      type: "string",
      description: "One specific gap or weakness a competitor could exploit."
    },
    watch_signal: {
      type: "string",
      description: "One signal worth monitoring in the next competitive cycle."
    }
  },
  required: ["positioning_signal", "opportunity", "watch_signal"]
} as const;

export const DEMO_BRIEF_EXPECTED_FIELDS: string[] = [...DEMO_BRIEF_SCHEMA.required];

export type GenerateDemoBriefInput = {
  url: string;
  contextData: string;
  isDemo?: boolean;
};

/**
 * Synthesize a 3-field intelligence brief from multi-surface demo scan results.
 * Always uses effort: low and nocache: true. No competitor/page IDs — demo only.
 */
export async function generateDemoBrief(input: GenerateDemoBriefInput): Promise<GenerateJsonResponse> {
  const client = getTabstackClient();
  const contextData = input.contextData.slice(0, MAX_CONTEXT_LENGTH);

  const instructions = `You are a competitive intelligence analyst. Based on this scan data from ${input.url}, write exactly three things:
1. How this company is positioning itself right now — one sentence.
2. One specific gap or weakness a competitor could exploit.
3. One signal worth monitoring in the next competitive cycle.
Be direct and specific. No generic advice.

Scan data:
${contextData}`;

  const requestPayload: GenerateJsonParams = {
    url: input.url,
    instructions,
    json_schema: DEMO_BRIEF_SCHEMA,
    effort: toSdkEffort("low"),
    nocache: true
  };

  return logger.call(() => client.generate.json(requestPayload), {
    endpoint: "generate",
    url: input.url,
    effort: "low",
    nocache: true,
    isDemo: input.isDemo,
    expectedFields: DEMO_BRIEF_EXPECTED_FIELDS
  });
}
