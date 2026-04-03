import { prisma } from "@/lib/db/client";
import { isPlainObject } from "@/lib/utils/types";

export type TabstackEndpoint =
  | "extract/json"
  | "extract/markdown"
  | "generate"
  | "automate"
  | "research";

export type TabstackStatus = "success" | "fallback" | "empty" | "error";
export type ResultQuality = "full" | "partial" | "empty";
export type TabstackEffort = "low" | "high";
export type TabstackMode = "fast" | "balanced";

type LoggerFallback = {
  triggered: boolean;
  reason?: string;
  endpoint?: TabstackEndpoint;
};

export type LoggerCallMetadata = {
  competitorId?: string | null;
  pageId?: string | null;
  endpoint: TabstackEndpoint;
  url?: string | null;
  effort?: TabstackEffort | null;
  nocache?: boolean | null;
  geoTarget?: string | null;
  mode?: TabstackMode | null;
  isDemo?: boolean;
  fallback?: LoggerFallback;
  expectedFields?: string[];
};

type LoggedResult = {
  quality: ResultQuality;
  missingFields: string[];
  pageNotFound: boolean;
  contentBlocked: boolean;
  schemaMismatch: boolean;
};

const NOT_FOUND_PATTERNS = [/\b404\b/i, /not found/i, /page does not exist/i];
const BLOCKED_PATTERNS = [
  /forbidden/i,
  /blocked/i,
  /captcha/i,
  /bot/i,
  /access denied/i,
  /paywall/i,
  /login required/i,
  /sign in to continue/i
];
const SIGNAL_TEXT_FIELDS = ["error", "message", "status", "statusText", "title", "detail", "reason"];

function isTrulyEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isPlainObject(value)) {
    return Object.keys(value).length === 0;
  }

  return false;
}

function firstObjectPayload(result: unknown): unknown {
  if (!isPlainObject(result)) {
    return result;
  }

  if ("data" in result) {
    return result.data;
  }

  if ("result" in result) {
    return result.result;
  }

  return result;
}

function qualityFromPayload(payload: unknown, expectedFields: string[]): LoggedResult {
  if (isTrulyEmpty(payload)) {
    return {
      quality: "empty",
      missingFields: expectedFields,
      pageNotFound: false,
      contentBlocked: false,
      schemaMismatch: false
    };
  }

  if (expectedFields.length === 0) {
    return {
      quality: "full",
      missingFields: [],
      pageNotFound: false,
      contentBlocked: false,
      schemaMismatch: false
    };
  }

  if (!isPlainObject(payload)) {
    return {
      quality: "partial",
      missingFields: expectedFields,
      pageNotFound: false,
      contentBlocked: false,
      schemaMismatch: true
    };
  }

  const missingFields = expectedFields.filter((field) => {
    const value = payload[field];
    return isTrulyEmpty(value);
  });

  const quality: ResultQuality =
    missingFields.length === expectedFields.length
      ? "empty"
      : missingFields.length > 0
        ? "partial"
        : "full";

  // schemaMismatch: the response had data but none of the expected fields exist as keys,
  // indicating the extraction schema doesn't match the actual page structure.
  // Skipped when quality is "empty" because an empty result is already captured above.
  const schemaMismatch =
    quality !== "empty" && Object.keys(payload).length > 0 && expectedFields.every((field) => !(field in payload));

  return {
    quality,
    missingFields,
    pageNotFound: false,
    contentBlocked: false,
    schemaMismatch
  };
}

function detectSignal(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function signalTextFromResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (result instanceof Error) {
    return `${result.name}: ${result.message}`;
  }

  if (!isPlainObject(result)) {
    return "";
  }

  const texts: string[] = [];

  for (const field of SIGNAL_TEXT_FIELDS) {
    const value = result[field];
    if (typeof value === "string") {
      texts.push(value);
    }
  }

  const payload = firstObjectPayload(result);
  if (isPlainObject(payload) && payload !== result) {
    for (const field of SIGNAL_TEXT_FIELDS) {
      const value = payload[field];
      if (typeof value === "string") {
        texts.push(value);
      }
    }
  }

  return texts.join(" ");
}

async function writeLog(params: {
  metadata: LoggerCallMetadata;
  status: TabstackStatus;
  durationMs: number;
  quality?: ResultQuality;
  missingFields?: string[];
  pageNotFound?: boolean;
  contentBlocked?: boolean;
  schemaMismatch?: boolean;
  rawError?: string;
}) {
  const { metadata } = params;

  await prisma.apiLog.create({
    data: {
      competitorId: metadata.competitorId ?? null,
      pageId: metadata.pageId ?? null,
      endpoint: metadata.endpoint,
      url: metadata.url ?? null,
      effort: metadata.effort ?? null,
      nocache: metadata.nocache ?? null,
      geoTarget: metadata.geoTarget ?? null,
      mode: metadata.mode ?? null,
      status: params.status,
      fallbackTriggered: metadata.fallback?.triggered ?? false,
      fallbackReason: metadata.fallback?.reason ?? null,
      fallbackEndpoint: metadata.fallback?.endpoint ?? null,
      resultQuality: params.quality ?? null,
      missingFields: params.missingFields ?? [],
      pageNotFound: params.pageNotFound ?? false,
      contentBlocked: params.contentBlocked ?? false,
      schemaMismatch: params.schemaMismatch ?? false,
      rawError: params.rawError ?? null,
      durationMs: params.durationMs,
      isDemo: metadata.isDemo ?? false
    }
  });
}

async function safeWriteLog(params: Parameters<typeof writeLog>[0]): Promise<void> {
  try {
    await writeLog(params);
  } catch (logError) {
    process.emitWarning("Failed to persist api_logs record", {
      code: "RIVAL_API_LOG_WRITE_FAILED",
      detail: stringifyUnknown(logError)
    });
  }
}

/**
 * Wrap every Tabstack call in this logger.
 *
 * Why this exists:
 * - The api_logs table powers /insights and the per-competitor Logs tab.
 * - missing_fields over time is the schema quality feedback loop: when a field is repeatedly
 *   missing for a page type, it signals the schema should be refined.
 */
export const logger = {
  async call<T>(fn: () => Promise<T>, metadata: LoggerCallMetadata): Promise<T> {
    const startedAt = Date.now();

    try {
      const result = await fn();
      const payload = firstObjectPayload(result);
      const evaluated = qualityFromPayload(payload, metadata.expectedFields ?? []);
      const status: TabstackStatus = metadata.fallback?.triggered
        ? "fallback"
        : evaluated.quality === "empty"
          ? "empty"
          : "success";

      const text = signalTextFromResult(result);
      const pageNotFound = evaluated.pageNotFound || detectSignal(NOT_FOUND_PATTERNS, text);
      const contentBlocked = evaluated.contentBlocked || detectSignal(BLOCKED_PATTERNS, text);

      await safeWriteLog({
        metadata,
        status,
        durationMs: Date.now() - startedAt,
        quality: evaluated.quality,
        missingFields: evaluated.missingFields,
        pageNotFound,
        contentBlocked,
        schemaMismatch: evaluated.schemaMismatch
      });

      return result;
    } catch (error) {
      const rawError = stringifyUnknown(error);

      await safeWriteLog({
        metadata,
        status: "error",
        durationMs: Date.now() - startedAt,
        quality: "empty",
        missingFields: metadata.expectedFields ?? [],
        pageNotFound: detectSignal(NOT_FOUND_PATTERNS, rawError),
        contentBlocked: detectSignal(BLOCKED_PATTERNS, rawError),
        schemaMismatch: false,
        rawError
      });

      throw error;
    }
  }
};
