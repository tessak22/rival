import type { ExtractJsonResponse } from "@tabstack/sdk/resources/extract";

import { logger, type LoggerCallMetadata, type TabstackEffort } from "@/lib/logger";
import { getTabstackClient, toGeoTarget, toSdkEffort } from "@/lib/tabstack/client";

/**
 * Tabstack `/extract/json` module.
 *
 * What it does:
 * - Fetches a URL and extracts structured JSON according to a provided schema.
 *
 * Cost tier:
 * - Medium by default, higher when `effort: high` (mapped to SDK `max`) for JS-heavy pages.
 *
 * When to use vs alternatives:
 * - Use this for pricing/careers/github/social/profile extraction where field-level structure matters.
 * - Use `/extract/markdown` for text-first page capture.
 * - Use `/automate` when interaction/clicking is required or JSON extraction fails on dynamic pages.
 *
 * Key parameters:
 * - `jsonSchema`: required extraction schema.
 * - Quality checks default to top-level `required` fields; if `required` is absent,
 *   top-level `properties` keys are used.
 * - `effort`: explicit per call (`low`/`high` mapped to SDK effort values).
 * - `nocache`: should be `true` on scheduled scans to avoid stale intel.
 * - `geoTarget`: optional country targeting for region-specific pages.
 *
 * Fallback behavior:
 * - No hidden fallback is executed in this module.
 * - Fallback policy is controlled centrally by `scanner.ts`.
 */

type JsonSchemaShape = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
};

export type ExtractJsonInput<Schema extends JsonSchemaShape> = {
  competitorId?: string | null;
  pageId?: string | null;
  url: string;
  jsonSchema: Schema;
  effort: TabstackEffort;
  nocache: boolean;
  geoTarget?: string | null;
  isDemo?: boolean;
  fallback?: LoggerCallMetadata["fallback"];
  expectedFields?: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaTopLevelFields(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const shaped = schema as JsonSchemaShape;
  if (Array.isArray(shaped.required) && shaped.required.length > 0) {
    return shaped.required;
  }

  if (!shaped.properties || !isPlainObject(shaped.properties)) {
    return [];
  }

  return Object.keys(shaped.properties);
}

function validateJsonSchema(schema: JsonSchemaShape): void {
  if (schema.properties !== undefined && !isPlainObject(schema.properties)) {
    throw new Error("jsonSchema.properties must be an object when provided");
  }

  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) || !schema.required.every((field) => typeof field === "string"))
  ) {
    throw new Error("jsonSchema.required must be an array of strings when provided");
  }
}

export async function extractJson<Schema extends JsonSchemaShape>(
  input: ExtractJsonInput<Schema>
): Promise<ExtractJsonResponse> {
  const client = getTabstackClient();
  validateJsonSchema(input.jsonSchema);
  const geoTarget = toGeoTarget(input.geoTarget);
  const expectedFields = input.expectedFields ?? schemaTopLevelFields(input.jsonSchema);

  return logger.call(
    () =>
      client.extract.json({
        url: input.url,
        json_schema: input.jsonSchema,
        effort: toSdkEffort(input.effort),
        nocache: input.nocache,
        geo_target: geoTarget
      }),
    {
      competitorId: input.competitorId,
      pageId: input.pageId,
      endpoint: "extract/json",
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
