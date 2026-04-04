/**
 * Pricing page extraction schema.
 *
 * Endpoint: /extract/json, effort: high
 * Why high effort: pricing pages are frequently JS-heavy SPAs that render tiers
 * client-side. Standard effort misses the actual numbers.
 *
 * Fallback: /automate — for click-to-reveal pricing or pages that require
 * interaction to expose tier details.
 *
 * Field notes:
 * - tiers null or empty = pricing is not publicly visible; treat as "contact us".
 *   This is itself competitive intelligence — opaque pricing signals enterprise-only.
 * - pricing_transparent false = "contact us" pricing. Important signal regardless
 *   of whether tiers could be extracted.
 * - has_free_tier is a key competitive differentiator. Track changes over time.
 * - per_unit pricing (per seat, per call, per deployment) signals usage-based models.
 *   Missing per_unit does not mean it doesn't exist — it may require deeper review.
 */

export const PRICING_SCHEMA = {
  type: "object",
  properties: {
    tiers: {
      type: "array",
      description: "All pricing tiers as displayed on the page",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Tier name e.g. Starter, Pro, Enterprise" },
          price: {
            type: "string",
            description: "Price as displayed, e.g. $49/mo or Contact us. Preserve exact format."
          },
          billing_period: { type: "string", description: "monthly, annual, one-time, etc." },
          features: {
            type: "array",
            items: { type: "string" },
            description: "Key features included in this tier"
          },
          per_unit: {
            type: "string",
            description: "Per-unit pricing if present, e.g. $0.01 per API call or $5 per seat/mo"
          },
          cta: { type: "string", description: "Call-to-action button text, e.g. Start free, Contact sales" },
          is_self_serve: {
            type: "boolean",
            description: "True if the user can sign up without talking to sales"
          }
        }
      }
    },
    has_free_tier: {
      type: "boolean",
      description: "True if any free or freemium tier exists. Key competitive differentiator."
    },
    free_tier_limits: {
      type: "string",
      description: "Key limits of the free tier if one exists, e.g. 1,000 API calls/mo"
    },
    pricing_transparent: {
      type: "boolean",
      description: "False if pricing is hidden behind contact us. Opaque pricing is itself a competitive signal."
    }
  },
  required: ["tiers", "has_free_tier", "pricing_transparent"]
} as const;

export const PRICING_EXPECTED_FIELDS = [...PRICING_SCHEMA.required] as const;

export type PricingData = {
  tiers?: Array<{
    name?: string;
    price?: string;
    billing_period?: string;
    features?: string[];
    per_unit?: string;
    cta?: string;
    is_self_serve?: boolean;
  }>;
  has_free_tier?: boolean;
  free_tier_limits?: string;
  pricing_transparent?: boolean;
};
