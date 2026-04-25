/**
 * Rival scan orchestrator.
 *
 * What it does:
 * - Routes each competitor page to the correct Tabstack endpoint by page type.
 * - Enforces explicit effort + nocache policy for scheduled scans.
 * - Applies fallback policy (pricing/careers -> automate on error or empty result).
 * - Persists scan rows and computes diff/change flags against the previous scan.
 *
 * Cost tier:
 * - Variable by page type:
 *   - extract/json and extract/markdown for routine scheduled scans
 *   - automate only for custom pages and explicit fallback paths
 *   - generate only for diff summaries when a previous scan exists
 *
 * When to use vs alternatives:
 * - Use this module as the single orchestrator for scheduled and manual scans.
 * - Do not call tabstack endpoint wrappers directly from route handlers.
 *
 * Key parameters:
 * - page `type`: controls endpoint routing.
 * - `nocache`: defaults to true (required for scheduled freshness).
 * - `isDemo`: skips scans table persistence when true.
 *
 * Fallback behavior:
 * - pricing/careers/reviews: fallback to automate when extract/json errors or returns empty.
 * - homepage: fallback to automate when extract/json returns empty or fewer than 3 fields populated.
 * - reviews: content_blocked is expected and valid — log it and continue. Do not retry more than once.
 * - blog: fallback to extract/markdown then generate when extract/json returns empty.
 * - other page types: no implicit fallback in this module.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import {
  BLOG_EXPECTED_FIELDS,
  BLOG_SCHEMA,
  CAREERS_EXPECTED_FIELDS,
  CAREERS_SCHEMA,
  DOCS_EXPECTED_FIELDS,
  DOCS_SCHEMA,
  GITHUB_EXPECTED_FIELDS,
  GITHUB_SCHEMA,
  HOMEPAGE_EXPECTED_FIELDS,
  HOMEPAGE_SCHEMA,
  PRICING_EXPECTED_FIELDS,
  PRICING_SCHEMA,
  PROFILE_EXPECTED_FIELDS,
  PROFILE_SCHEMA,
  REVIEWS_EXPECTED_FIELDS,
  REVIEWS_SCHEMA,
  SOCIAL_EXPECTED_FIELDS,
  SOCIAL_SCHEMA,
  STACK_EXPECTED_FIELDS,
  STACK_SCHEMA
} from "@/lib/schemas";
import { generateDiff } from "@/lib/tabstack/generate";
import { automateExtract } from "@/lib/tabstack/automate";
import { extractJson } from "@/lib/tabstack/extract-json";
import { extractMarkdown } from "@/lib/tabstack/extract-markdown";
import type { TabstackEffort, TabstackEndpoint } from "@/lib/logger";
import { isPlainObject, stringifyUnknown } from "@/lib/utils/types";

const DEFAULT_AUTOMATE_GUARDRAILS = "Extract public page content only. Do not sign in or submit forms.";
const MAX_EMPTY_CHECK_DEPTH = 20;
const warnedUnknownTypes = new Set<string>();

type JsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: readonly string[];
};

type ExtractJsonSchema = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
};

type RoutingDefinition = {
  endpoint: "extract/json" | "extract/markdown" | "automate";
  effort?: TabstackEffort;
  jsonSchema?: JsonSchema;
  expectedFields?: readonly string[];
};

const ROUTING_BY_TYPE: Record<string, RoutingDefinition> = {
  homepage: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: HOMEPAGE_SCHEMA,
    expectedFields: HOMEPAGE_EXPECTED_FIELDS
  },
  pricing: {
    endpoint: "extract/json",
    effort: "high",
    jsonSchema: PRICING_SCHEMA,
    expectedFields: PRICING_EXPECTED_FIELDS
  },
  careers: {
    endpoint: "extract/json",
    effort: "high",
    jsonSchema: CAREERS_SCHEMA,
    expectedFields: CAREERS_EXPECTED_FIELDS
  },
  blog: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: BLOG_SCHEMA,
    expectedFields: BLOG_EXPECTED_FIELDS
  },
  changelog: {
    endpoint: "extract/markdown",
    effort: "low"
  },
  docs: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: DOCS_SCHEMA,
    expectedFields: DOCS_EXPECTED_FIELDS
  },
  github: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: GITHUB_SCHEMA,
    expectedFields: GITHUB_EXPECTED_FIELDS
  },
  social: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: SOCIAL_SCHEMA,
    expectedFields: SOCIAL_EXPECTED_FIELDS
  },
  profile: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: PROFILE_SCHEMA,
    expectedFields: PROFILE_EXPECTED_FIELDS
  },
  stack: {
    endpoint: "extract/json",
    effort: "low",
    jsonSchema: STACK_SCHEMA,
    expectedFields: STACK_EXPECTED_FIELDS
  },
  // reviews: JS-heavy SPAs with active bot-detection. High effort required.
  // content_blocked is expected and common — it is the most valuable experience-logging
  // candidate in the codebase. Do NOT use geo_target for review pages.
  // Fallback to automate once on empty or content_blocked; do not retry further.
  reviews: {
    endpoint: "extract/json",
    effort: "high",
    jsonSchema: REVIEWS_SCHEMA,
    expectedFields: REVIEWS_EXPECTED_FIELDS
  },
  custom: {
    endpoint: "automate"
  }
};

export type ScanPageType = keyof typeof ROUTING_BY_TYPE;

export type ScanPageInput = {
  competitorId?: string | null;
  pageId?: string | null;
  label?: string;
  url: string;
  type: string;
  geoTarget?: string | null;
  nocache?: boolean;
  isDemo?: boolean;
  customTask?: string;
  effortOverride?: TabstackEffort; // forces effort on all Tabstack calls — used by demo mode
};

export type ScanPageOutput = {
  endpointUsed: TabstackEndpoint;
  usedFallback: boolean;
  rawResult: unknown;
  markdownResult: string | null;
  diffSummary: string | null;
  hasChanges: boolean;
  scanId: string | null;
};

function resolveRouting(type: string): RoutingDefinition {
  const route = ROUTING_BY_TYPE[type];
  if (route) return route;

  if (!warnedUnknownTypes.has(type)) {
    warnedUnknownTypes.add(type);
    console.warn(`[scanner] Unknown page type "${type}", defaulting to custom automate routing.`);
  }

  return ROUTING_BY_TYPE["custom"];
}

function valueIsEmpty(value: unknown, depth = 0): boolean {
  if (depth > MAX_EMPTY_CHECK_DEPTH) return false;
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (!isPlainObject(value)) return false;

  const entries = Object.values(value);
  return entries.length === 0 || entries.every((entry) => valueIsEmpty(entry, depth + 1));
}

function extractDataEnvelope(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const hasData = "data" in value;
  const hasResult = "result" in value;
  if (hasData && hasResult) {
    throw new Error("Ambiguous response envelope: expected either data or result, not both.");
  }
  if ("data" in value) return value.data;
  if ("result" in value) return value.result;
  return value;
}

function extractMarkdownContent(value: unknown): string | null {
  const payload = extractDataEnvelope(value);
  if (!isPlainObject(payload)) return null;
  const content = payload["content"];
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

function extractDiffPayload(value: unknown): { summary: string | null; hasChanges: boolean } {
  const payload = extractDataEnvelope(value);
  if (!isPlainObject(payload)) {
    return { summary: null, hasChanges: false };
  }

  const summary =
    typeof payload["summary"] === "string" && payload["summary"].trim().length > 0 ? payload["summary"] : null;
  const addedCount = Array.isArray(payload["added"]) ? payload["added"].length : 0;
  const changedCount = Array.isArray(payload["changed"]) ? payload["changed"].length : 0;
  const removedCount = Array.isArray(payload["removed"]) ? payload["removed"].length : 0;

  return {
    summary,
    hasChanges: Boolean(summary) || addedCount + changedCount + removedCount > 0
  };
}

function toScanJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) || isPlainObject(value)) return value as Prisma.InputJsonValue;
  return stringifyUnknown(value);
}

function toPreviousContent(scan: { markdownResult: string | null; rawResult: unknown }): string {
  if (scan.markdownResult && scan.markdownResult.trim().length > 0) {
    return scan.markdownResult;
  }
  return stringifyUnknown(scan.rawResult ?? "");
}

/**
 * Normalize scan content so that cosmetic differences (line endings, trailing
 * whitespace, stray blank lines) don't register as changes. Used only for the
 * equality short-circuit in the diff flow — the original content is still sent
 * to the diff LLM when a real difference exists.
 */
function normalizeForDiff(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildAutomateTask(input: ScanPageInput): string {
  if (input.customTask && input.customTask.trim().length > 0) {
    return input.customTask.trim();
  }

  const typeHint = input.type ? `for a ${input.type} page` : "";
  const labelHint = input.label ? ` labelled "${input.label}"` : "";
  return `Extract structured competitive intelligence ${typeHint}${labelHint}. Return concise JSON with key findings.`;
}

function shouldUseAutomateFallback(type: string): boolean {
  // reviews: fallback to automate once on empty or content_blocked.
  // content_blocked results in an empty extracted payload, so the same
  // empty-result check naturally triggers the automate fallback. The fallback
  // runs at most once — there is no second retry loop.
  return type === "pricing" || type === "careers" || type === "homepage" || type === "reviews";
}

function shouldUseBlogFallback(type: string): boolean {
  return type === "blog";
}

/**
 * Count the number of non-empty top-level fields in an extracted JSON object.
 * Used to decide whether a homepage result is sparse enough to warrant a fallback.
 */
function countPopulatedFields(value: unknown): number {
  if (!isPlainObject(value)) return 0;
  return Object.values(value).filter((v) => !valueIsEmpty(v)).length;
}

function extractedIndicatesContentBlocked(value: unknown): boolean {
  const payload = extractDataEnvelope(value);
  if (!isPlainObject(payload)) return false;

  if (payload["content_blocked"] === true) return true;
  const status = payload["status"];
  if (typeof status === "string" && status.toLowerCase() === "content_blocked") return true;
  const error = payload["error"];
  if (typeof error === "string" && error.toLowerCase().includes("content_blocked")) return true;

  return false;
}

/**
 * Infer page type from URL when not explicitly provided.
 * A bare root domain (https://competitor.com or https://competitor.com/) implies homepage.
 */
export function inferPageTypeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    if (path === "") return "homepage";
    return null;
  } catch {
    return null;
  }
}

/** URL path segments that indicate a blog index page for the demo scanner. */
export const BLOG_URL_PATTERNS = ["/blog", "/articles", "/news", "/resources", "/posts", "/insights"];

/**
 * Infer whether a URL is a blog index page for the demo scanner.
 * Returns "blog" when the path matches common blog index path segments.
 * Used for URL-based type inference — not for production routing.
 */
export function inferBlogPageType(url: string): "blog" | null {
  try {
    const { pathname } = new URL(url);
    const lowerPath = pathname.toLowerCase();
    for (const pattern of BLOG_URL_PATTERNS) {
      if (lowerPath === pattern || lowerPath.startsWith(pattern + "/") || lowerPath.startsWith(pattern + "?")) {
        return "blog";
      }
    }
  } catch {
    // invalid URL — not our concern here
  }
  return null;
}

function toMutableJsonSchema(schema: JsonSchema | undefined): ExtractJsonSchema {
  if (!schema) {
    return {};
  }

  return {
    type: schema.type,
    properties: schema.properties,
    required: schema.required ? [...schema.required] : undefined
  };
}

async function runPrimaryScan(input: ScanPageInput): Promise<{
  endpointUsed: TabstackEndpoint;
  rawResult: unknown;
  markdownResult: string | null;
  usedFallback: boolean;
}> {
  const route = resolveRouting(input.type);
  const nocache = input.nocache ?? true;

  if (route.endpoint === "extract/markdown") {
    const result = await extractMarkdown({
      competitorId: input.competitorId,
      pageId: input.pageId,
      url: input.url,
      effort: input.effortOverride ?? route.effort ?? "low",
      nocache,
      geoTarget: input.geoTarget,
      isDemo: input.isDemo
    });

    return {
      endpointUsed: "extract/markdown",
      rawResult: result,
      markdownResult: extractMarkdownContent(result),
      usedFallback: false
    };
  }

  if (route.endpoint === "automate") {
    const result = await automateExtract({
      competitorId: input.competitorId,
      pageId: input.pageId,
      url: input.url,
      task: buildAutomateTask(input),
      guardrails: DEFAULT_AUTOMATE_GUARDRAILS,
      geoTarget: input.geoTarget,
      isDemo: input.isDemo
    });

    return {
      endpointUsed: "automate",
      rawResult: result.result,
      markdownResult: null,
      usedFallback: false
    };
  }

  const runJsonExtract = async (fallbackReason?: string) =>
    extractJson({
      competitorId: input.competitorId,
      pageId: input.pageId,
      url: input.url,
      jsonSchema: toMutableJsonSchema(route.jsonSchema),
      expectedFields: route.expectedFields ? [...route.expectedFields] : undefined,
      effort: input.effortOverride ?? route.effort ?? "low",
      nocache,
      geoTarget: input.geoTarget,
      isDemo: input.isDemo,
      fallback: fallbackReason
        ? {
            triggered: true,
            reason: fallbackReason,
            endpoint: "automate"
          }
        : undefined
    });

  // Blog fallback: extract/markdown then generate when extract/json returns empty.
  // Log schema_mismatch when recent_post_titles is empty on a confirmed blog index.
  if (shouldUseBlogFallback(input.type)) {
    let primaryExtracted: unknown = null;
    try {
      const primary = await runJsonExtract();
      primaryExtracted = extractDataEnvelope(primary);
    } catch {
      // primary extract/json failed — fall through to markdown→generate fallback
    }

    if (!valueIsEmpty(primaryExtracted)) {
      const postTitles = isPlainObject(primaryExtracted)
        ? ((primaryExtracted as Record<string, unknown>)["recent_post_titles"] as unknown[] | undefined)
        : undefined;
      if (!Array.isArray(postTitles) || postTitles.length === 0) {
        console.warn("[scanner] blog: schema_mismatch — recent_post_titles is empty on confirmed blog index page", {
          url: input.url
        });
      }
      return {
        endpointUsed: "extract/json",
        rawResult: primaryExtracted,
        markdownResult: null,
        usedFallback: false
      };
    }

    // Fallback: extract/markdown then automate with explicit blog-schema task.
    const markdownResponse = await extractMarkdown({
      competitorId: input.competitorId,
      pageId: input.pageId,
      url: input.url,
      effort: input.effortOverride ?? route.effort ?? "low",
      nocache,
      geoTarget: input.geoTarget,
      isDemo: input.isDemo,
      fallback: {
        triggered: true,
        reason: "extract/json returned empty result",
        endpoint: "automate"
      }
    });

    const markdownContent = extractMarkdownContent(markdownResponse);
    const automateTask = markdownContent
      ? [
          "Extract structured blog index data from this markdown content.",
          "Return JSON with these fields:",
          "  recent_post_titles (array of recent post titles, most recent first),",
          "  recent_post_urls (array of URLs in same order, null if not found),",
          "  recent_post_dates (array of dates in same order, ISO date or displayed string, null if not visible),",
          "  post_frequency (inferred cadence: daily/2-3x per week/weekly/2-3x per month/monthly/sporadic/unknown),",
          "  primary_topics (3-6 synthesized content themes, not verbatim titles),",
          "  developer_focused (true if written for technical/developer audience),",
          "  has_categories_or_tags (true if category/tag filters are shown),",
          "  visible_categories (array of category labels if present, empty array if none).",
          "",
          "Markdown content:",
          markdownContent
        ].join("\n")
      : "No markdown content could be extracted from this blog index page.";

    const automateResponse = await automateExtract({
      competitorId: input.competitorId,
      pageId: input.pageId,
      url: input.url,
      task: automateTask,
      guardrails: DEFAULT_AUTOMATE_GUARDRAILS,
      geoTarget: input.geoTarget,
      isDemo: input.isDemo,
      expectedFields: route.expectedFields ? [...route.expectedFields] : undefined,
      fallback: {
        triggered: true,
        reason: "extract/json returned empty; extract/markdown fallback to automate",
        endpoint: "automate"
      }
    });

    return {
      endpointUsed: "automate",
      rawResult: automateResponse.result,
      markdownResult: markdownContent,
      usedFallback: true
    };
  }

  if (!shouldUseAutomateFallback(input.type)) {
    const result = await runJsonExtract();
    return {
      endpointUsed: "extract/json",
      rawResult: extractDataEnvelope(result),
      markdownResult: null,
      usedFallback: false
    };
  }

  const runAutomateFallback = async (reason: string) => {
    const fallback = await automateExtract({
      competitorId: input.competitorId,
      pageId: input.pageId,
      url: input.url,
      task: buildAutomateTask(input),
      guardrails: DEFAULT_AUTOMATE_GUARDRAILS,
      geoTarget: input.geoTarget,
      isDemo: input.isDemo,
      fallback: {
        triggered: true,
        reason,
        endpoint: "automate"
      },
      expectedFields: route.expectedFields ? [...route.expectedFields] : undefined
    });

    return {
      endpointUsed: "automate" as const,
      rawResult: fallback.result,
      markdownResult: null,
      usedFallback: true
    };
  };

  const HOMEPAGE_MIN_POPULATED_FIELDS = 3;

  try {
    const primary = await runJsonExtract();
    if (input.type === "reviews" && extractedIndicatesContentBlocked(primary)) {
      return runAutomateFallback("extract/json reported content_blocked");
    }

    const extracted = extractDataEnvelope(primary);

    if (!valueIsEmpty(extracted)) {
      // Homepage requires at least 3 populated fields to be considered a valid result.
      if (input.type === "homepage" && countPopulatedFields(extracted) < HOMEPAGE_MIN_POPULATED_FIELDS) {
        return runAutomateFallback("extract/json returned fewer than 3 populated fields");
      }

      return {
        endpointUsed: "extract/json",
        rawResult: extracted,
        markdownResult: null,
        usedFallback: false
      };
    }

    return runAutomateFallback("extract/json returned empty result");
  } catch {
    return runAutomateFallback("extract/json failed");
  }
}

export async function scanPage(input: ScanPageInput): Promise<ScanPageOutput> {
  const pageId = input.pageId ?? null;
  const nocache = input.nocache ?? true;
  const persistScan = !input.isDemo && Boolean(pageId);

  const previousScan =
    pageId && !input.isDemo
      ? await prisma.scan.findFirst({
          where: { pageId },
          orderBy: { scannedAt: "desc" },
          select: { id: true, markdownResult: true, rawResult: true }
        })
      : null;

  const scanResult = await runPrimaryScan({ ...input, nocache });

  let diffSummary: string | null = null;
  let hasChanges = false;

  if (previousScan) {
    const previousContent = toPreviousContent(previousScan);
    const currentContent = toPreviousContent({
      markdownResult: scanResult.markdownResult,
      rawResult: scanResult.rawResult
    });

    if (normalizeForDiff(previousContent) === normalizeForDiff(currentContent)) {
      // Normalized content is identical — skip the diff LLM call entirely.
      // Prevents false positives from dynamic re-fetches and saves a
      // generate.json round-trip on no-op scans.
      hasChanges = false;
      diffSummary = null;
    } else {
      const diffResponse = await generateDiff({
        competitorId: input.competitorId,
        pageId,
        url: input.url,
        previousContent,
        currentContent,
        effort: "low",
        nocache,
        geoTarget: input.geoTarget,
        isDemo: input.isDemo
      });
      const parsed = extractDiffPayload(diffResponse);
      diffSummary = parsed.summary;
      hasChanges = parsed.hasChanges;
    }
  }

  const createdScan = persistScan
    ? await prisma.scan.create({
        data: {
          pageId: pageId as string,
          endpointUsed: scanResult.endpointUsed,
          rawResult: toScanJson(scanResult.rawResult),
          markdownResult: scanResult.markdownResult,
          hasChanges,
          diffSummary
        },
        select: { id: true }
      })
    : null;

  return {
    endpointUsed: scanResult.endpointUsed,
    usedFallback: scanResult.usedFallback,
    rawResult: scanResult.rawResult,
    markdownResult: scanResult.markdownResult,
    diffSummary,
    hasChanges,
    scanId: createdScan?.id ?? null
  };
}
