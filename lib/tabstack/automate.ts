/**
 * Tabstack `/automate` module.
 *
 * What it does:
 * - Runs a full browser agent on a URL using a natural language task description.
 * - Used for JS-heavy SPAs, click-to-reveal pricing, and as the fallback when
 *   /extract/json returns empty. Also the default execution path for the demo route.
 * - Always streams SSE events — this module collects the full stream before returning.
 *
 * Cost tier:
 * - Highest among Rival's endpoint set. Automate spins up a full browser agent.
 * - Reserve for pages that break extract/json, and for the demo route.
 *
 * When to use vs alternatives:
 * - Use /extract/json first. Fall back to automate if result is empty or quality is poor.
 * - Use automate as the default for the demo route (unknown pages, JS-heavy likely).
 * - Do not use automate on a schedule for all pages — cost is significant.
 *
 * Key parameters:
 * - `task`: natural language description of what to extract.
 * - `url`: starting URL for the browser agent.
 * - `guardrails`: safety constraints. Defaults to "browse and extract only, do not interact".
 * - `geoTarget`: optional country code — normalized to ISO-2 uppercase.
 *
 * Important SDK difference:
 * - `/automate` does NOT support `effort` or `nocache` params (unlike extract/generate).
 *   This is a key API surface difference — effort is implicit (always full browser).
 *   Rival logs effort and nocache as null for automate calls.
 *
 * Fallback behavior:
 * - This module IS the fallback for extract/json. It does not itself auto-fallback further.
 * - When used as a fallback, set `fallback.triggered = true` and provide a reason.
 */

import type { AutomateEvent } from "@tabstack/sdk/resources/agent";

import { logger, type LoggerCallMetadata } from "@/lib/logger";
import { stringifyUnknown } from "@/lib/utils/types";
import { getTabstackClient, toGeoTarget } from "@/lib/tabstack/client";

const MAX_EVENTS = 1000;
const DEFAULT_GUARDRAILS = "browse and extract only, do not interact";

// Explicit as const so SDK event renames surface as type errors here first.
const RESULT_EVENT_NAMES = ["complete", "agent:extracted"] as const;
const RESULT_EVENTS = new Set<string>(RESULT_EVENT_NAMES);
const ERROR_EVENT = "error";

export type AutomateInput = {
  competitorId?: string | null;
  pageId?: string | null;
  url: string;
  task: string;
  guardrails?: string;
  geoTarget?: string | null;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
  expectedFields?: string[];
};

export type AutomateResult<T = unknown> = {
  events: AutomateEvent[];
  result: T | null;
};

// TODO: Add AbortSignal / deadline support before wiring to API routes.
// If the Tabstack browser agent hangs on a complex SPA, this blocks the caller
// indefinitely. The SDK's HTTP timeout may not cover the full SSE stream duration.
async function collectStream(stream: AsyncIterable<AutomateEvent>): Promise<AutomateResult> {
  const events: AutomateEvent[] = [];

  for await (const event of stream) {
    events.push(event);

    if (event.event === ERROR_EVENT) {
      throw new Error(stringifyUnknown(event.data));
    }

    if (events.length > MAX_EVENTS) {
      throw new Error(`[automateExtract] stream exceeded ${MAX_EVENTS} event limit`);
    }
  }

  // AutomateEvent.event is string | undefined in the SDK — guard is required for type narrowing.
  const resultEvent = events.findLast((e) => e.event !== undefined && RESULT_EVENTS.has(e.event));
  const result = resultEvent?.data ?? null;

  return { events, result };
}

/**
 * Run a browser automation task and return the extracted result.
 *
 * The SSE stream is fully consumed before returning. Progress events are
 * preserved in `result.events` for debugging and for the UI stream relay in
 * the API route layer (app/api/).
 *
 * Note: logger.call uses firstObjectPayload() to extract the quality-scoring target.
 * For AutomateResult { events, result }, it finds the `result` key and evaluates
 * quality against it. If the return shape changes (e.g., renaming `result` to `data`),
 * quality logging silently breaks. Keep this shape stable or update logger.ts accordingly.
 */
export async function automateExtract(input: AutomateInput): Promise<AutomateResult> {
  const client = getTabstackClient();
  const geoTarget = toGeoTarget(input.geoTarget);

  return logger.call(
    async () => {
      const stream = await client.agent.automate({
        task: input.task,
        url: input.url,
        guardrails: input.guardrails ?? DEFAULT_GUARDRAILS,
        geo_target: geoTarget
      });

      return collectStream(stream);
    },
    {
      competitorId: input.competitorId,
      pageId: input.pageId,
      endpoint: "automate",
      url: input.url,
      effort: null,
      nocache: null,
      geoTarget: geoTarget?.country,
      isDemo: input.isDemo,
      fallback: input.fallback,
      expectedFields: input.expectedFields ?? []
    }
  );
}
