/**
 * Homepage / root URL extraction schema.
 */

export const HOMEPAGE_SCHEMA = {
  type: "object",
  properties: {
    primary_tagline: {
      type: "string",
      description: "Main H1 or hero headline on the homepage."
    },
    sub_tagline: {
      type: "string",
      description: "Supporting line beneath the primary tagline."
    },
    primary_cta_text: {
      type: "string",
      description: "Text of the primary call-to-action button."
    },
    primary_cta_url: {
      type: "string",
      description: "URL the primary CTA links to."
    },
    secondary_cta_text: {
      type: "string",
      description: "Secondary CTA text if present."
    },
    positioning_statement: {
      type: "string",
      description: "How the product describes itself in one sentence."
    },
    key_differentiators: {
      type: "array",
      items: { type: "string" },
      description: "Explicit claims about uniqueness or superiority."
    },
    target_audience_stated: {
      type: "string",
      description: "Explicit audience statement if present."
    },
    social_proof_summary: {
      type: "string",
      description: "Summary of social proof (logos, counts, ratings, recognition)."
    },
    nav_primary_items: {
      type: "array",
      items: { type: "string" },
      description: "Top-level navigation labels."
    }
  },
  required: ["primary_tagline", "sub_tagline", "key_differentiators"]
} as const;

export const HOMEPAGE_EXPECTED_FIELDS = [...HOMEPAGE_SCHEMA.required] as const;

export type HomepageData = {
  primary_tagline?: string;
  sub_tagline?: string;
  primary_cta_text?: string;
  primary_cta_url?: string;
  secondary_cta_text?: string;
  positioning_statement?: string;
  key_differentiators?: string[];
  target_audience_stated?: string | null;
  social_proof_summary?: string;
  nav_primary_items?: string[];
};
