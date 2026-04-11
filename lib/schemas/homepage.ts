/**
 * Homepage / root URL extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: homepages are typically static marketing pages or server-rendered
 * with hero content visible on first paint. Full JS rendering rarely needed.
 *
 * Fallback: /automate — triggered when extract/json returns empty or fewer than 3
 * fields populated. Use for SPAs that inject hero copy client-side (common with
 * Webflow, Framer, and custom React homepages).
 *
 * When to use vs alternatives:
 * - Use for root URL (https://competitor.com or https://competitor.com/).
 * - Use `profile` for the About page (leadership, mission, partnerships).
 * - Do not merge homepage with profile — they capture distinct positioning layers.
 *
 * Key parameters:
 * - url: bare root domain (e.g. https://competitor.com)
 * - effort: low (sufficient for most homepages)
 * - nocache: true (required for scheduled scans to detect repositioning)
 *
 * Fallback behavior:
 * - If result is empty or fewer than 3 fields are populated, retry with /automate.
 * - Log fallback_triggered: true with reason in api_logs.
 *
 * Highest-signal fields for repositioning detection:
 * - primary_tagline: main H1/hero headline — changes when competitor repositions.
 * - sub_tagline: supporting line beneath primary — often the first thing rewritten.
 * - key_differentiators: explicit superiority claims — track adds/removes closely.
 */

export const HOMEPAGE_SCHEMA = {
  type: "object",
  properties: {
    primary_tagline: {
      type: "string",
      description: "Main H1 or hero headline on the homepage. The most direct signal of current positioning."
    },
    sub_tagline: {
      type: "string",
      description:
        "Supporting line displayed beneath the primary tagline. Often the first copy rewritten during a rebrand."
    },
    primary_cta_text: {
      type: "string",
      description: "Text of the primary call-to-action button in the hero section (e.g. 'Get started free')."
    },
    primary_cta_url: {
      type: "string",
      description: "URL the primary CTA links to. Null if CTA is not present or URL is not resolvable."
    },
    secondary_cta_text: {
      type: "string",
      description: "Secondary CTA text if present in the hero (e.g. 'See a demo', 'Talk to sales')."
    },
    positioning_statement: {
      type: "string",
      description:
        "How the product describes itself in one sentence. Look for 'X for Y' or 'the only Z that...' patterns."
    },
    key_differentiators: {
      type: "array",
      items: { type: "string" },
      description:
        "Explicit claims about uniqueness or superiority (e.g. 'Fastest in class', 'SOC 2 certified'). Track adds and removes."
    },
    target_audience_stated: {
      type: "string",
      description:
        "Explicit 'built for X' or 'designed for Y' statement if present on the page. Null if no stated audience found."
    },
    social_proof_summary: {
      type: "string",
      description:
        "Summary of visible social proof: customer count, review ratings, notable logos, or analyst recognition."
    },
    nav_primary_items: {
      type: "array",
      items: { type: "string" },
      description: "Top-level navigation items as displayed. Reflects product surface area and go-to-market emphasis."
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
