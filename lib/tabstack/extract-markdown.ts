import type { ExtractMarkdownResponse } from "@tabstack/sdk/resources/extract";

import { logger, type LoggerCallMetadata, type TabstackEffort } from "@/lib/logger";
import { getTabstackClient, toGeoTarget, toSdkEffort } from "@/lib/tabstack/client";

/**
 * Tabstack `/extract/markdown` module.
 *
 * What it does:
 * - Fetches a URL and returns clean markdown content for docs/changelog/release-note style pages.
 *
 * Cost tier:
 * - Lowest practical extraction cost in Rival's endpoint set.
 *
 * When to use vs alternatives:
 * - Use this for unstructured text sources where markdown output is the goal.
 * - Use `/extract/json` when field-level structured extraction is needed.
 * - Use `/automate` only when interactive browser behavior is required.
 *
 * Key parameters:
 * - `effort`: explicit per call (`low`/`high` mapped to SDK effort values)
 * - `nocache`: should be `true` on scheduled scans to avoid stale diffs
 * - `geoTarget`: optional country targeting for region-sensitive pages
 *
 * Fallback behavior:
 * - This module does not auto-fallback by itself.
 * - Fallbacks are orchestrated in `scanner.ts` so fallback policy stays centralized.
 */

export type ExtractMarkdownInput = {
  competitorId?: string | null;
  pageId?: string | null;
  url: string;
  effort: TabstackEffort;
  nocache: boolean;
  geoTarget?: string | null;
  includeMetadata?: boolean;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
};

export async function extractMarkdown(input: ExtractMarkdownInput): Promise<ExtractMarkdownResponse> {
  const client = getTabstackClient();
  const geoTarget = toGeoTarget(input.geoTarget);
  const expectedFields = input.includeMetadata ? ["content", "url", "metadata"] : ["content", "url"];

  return logger.call(
    () =>
      client.extract.markdown({
        url: input.url,
        effort: toSdkEffort(input.effort),
        nocache: input.nocache,
        geo_target: geoTarget,
        metadata: input.includeMetadata ?? false
      }),
    {
      competitorId: input.competitorId,
      pageId: input.pageId,
      endpoint: "extract/markdown",
      url: input.url,
      effort: input.effort,
      nocache: input.nocache,
      geoTarget: geoTarget?.country,
      isDemo: input.isDemo,
      fallback: input.fallback,
      expectedFields
    }
  );
}
