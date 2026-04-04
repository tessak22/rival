/**
 * Documentation site extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: docs are typically server-rendered or statically generated.
 *
 * Fallback: /extract/markdown — if structured extraction returns empty, fall
 * back to markdown to at least capture the page structure.
 *
 * Field notes:
 * - sections null or empty = docs may not be publicly indexed, or the page structure
 *   couldn't be parsed. Track over time — disappearing sections can signal deprecations.
 * - has_api_reference false = no formal API reference. Can signal immature API or
 *   incomplete docs. Strong content opportunity.
 * - has_sdk_docs false = no official SDK. Indicates reliance on REST only.
 *   Combined with careers tech_stack, you can infer language priorities.
 * - has_tutorials false = docs are reference-only. Tutorial gap = content opportunity.
 */

export const DOCS_SCHEMA = {
  type: "object",
  properties: {
    last_update_date: {
      type: "string",
      description: "Date the docs were last updated if shown. Null if not visible."
    },
    sections: {
      type: "array",
      items: { type: "string" },
      description: "Top-level navigation sections in the docs, e.g. Quickstart, API Reference, Guides"
    },
    has_api_reference: {
      type: "boolean",
      description: "True if a formal API reference section exists. Absence is a content opportunity."
    },
    has_sdk_docs: {
      type: "boolean",
      description: "True if official SDK documentation exists for at least one language."
    },
    has_tutorials: {
      type: "boolean",
      description: "True if tutorial or getting-started guides exist beyond basic quickstart."
    }
  },
  required: ["sections", "has_api_reference"]
} as const;

export const DOCS_EXPECTED_FIELDS: string[] = [...DOCS_SCHEMA.required];

export type DocsData = {
  last_update_date?: string;
  sections?: string[];
  has_api_reference?: boolean;
  has_sdk_docs?: boolean;
  has_tutorials?: boolean;
};
