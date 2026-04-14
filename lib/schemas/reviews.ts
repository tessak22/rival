/**
 * Review platform extraction schema (G2, Capterra, Trustpilot, etc.).
 *
 * Endpoint: /extract/json, effort: high
 * Why high effort: review sites are JS-heavy SPAs that render content client-side
 * and actively deploy bot-detection mechanisms. Standard effort almost always fails.
 *
 * Fallback: /automate — when extract/json returns empty or content_blocked is detected.
 * Note: content_blocked is expected and common here. Log it; do not retry more than once.
 *
 * When to use vs alternatives:
 * - Use this for G2, Capterra, Trustpilot, and ProductHunt pages.
 * - Do NOT use geo_target on review pages — content is global and targeting adds no signal.
 * - Expect content_blocked frequently; this is the most valuable experience-logging
 *   candidate in the codebase. The blocked-scan pattern itself is important telemetry.
 *
 * Key parameters:
 * - effort: high — required for JS-heavy SPAs with bot detection.
 * - nocache: true — always required for scheduled freshness.
 *
 * Field notes:
 * IMPORTANT: top_complaint_themes is the highest-signal field in this schema.
 * It reveals what customers wish were different — mapping directly to product
 * opportunities and competitive weaknesses. Track changes between scans carefully.
 *
 * - platform: always extract so a single schema works across G2, Capterra,
 *   Trustpilot, and ProductHunt without separate schemas.
 * - overall_rating: track delta between scans. Small changes (0.1+) are meaningful
 *   signals — a product improving or declining in customer perception.
 * - top_praise_themes: recurring positive themes, not verbatim quotes. Reveals
 *   what customers value most — useful for positioning comparison.
 * - top_complaint_themes: recurring negative themes, not verbatim quotes. The
 *   highest-signal field — reveals competitor weaknesses and product gaps.
 * - recent_reviews: 3-5 summarized recent reviews with rating and date. Provides
 *   qualitative color behind the quantitative scores.
 * - recommended_percentage: "X% recommend" if present. Strong trust signal.
 */

export const REVIEWS_SCHEMA = {
  type: "object",
  properties: {
    platform: {
      type: "string",
      description: "Review platform name: G2, Capterra, Trustpilot, ProductHunt, etc."
    },
    overall_rating: {
      type: "number",
      description:
        "Overall star rating as decimal (e.g. 4.7). Track delta between scans — changes of 0.1+ are meaningful."
    },
    review_count: {
      type: "number",
      description: "Total number of reviews on this platform."
    },
    ease_of_use_score: {
      type: "number",
      description: "Ease of Use sub-score if surfaced on the platform (e.g. G2 category score)."
    },
    customer_support_score: {
      type: "number",
      description: "Customer Support sub-score if surfaced on the platform."
    },
    top_praise_themes: {
      type: "array",
      items: { type: "string" },
      description:
        "3-6 recurring positive themes across reviews. Not verbatim quotes — synthesize themes. Reveals what customers value most."
    },
    top_complaint_themes: {
      type: "array",
      items: { type: "string" },
      description:
        "3-6 recurring negative themes across reviews. Not verbatim quotes — synthesize themes. HIGHEST-SIGNAL FIELD: reveals competitor weaknesses and product gaps that map to customer opportunities."
    },
    recent_reviews: {
      type: "array",
      description: "3-5 most recent reviews, summarized. Provides qualitative color behind quantitative scores.",
      items: {
        type: "object",
        properties: {
          rating: { type: "number", description: "Star rating for this review (e.g. 4.0)." },
          summary: { type: "string", description: "1-2 sentence summary of the review content." },
          date: { type: "string", description: "Date of review, ISO 8601 or as displayed." }
        }
      }
    },
    recommended_percentage: {
      type: "number",
      description:
        "Percentage of reviewers who recommend the product (e.g. 92 for 92%). Strong trust signal if present."
    }
  },
  required: ["platform", "overall_rating", "review_count", "top_praise_themes", "top_complaint_themes"]
} as const;

export const REVIEWS_EXPECTED_FIELDS = [...REVIEWS_SCHEMA.required] as const;

export type ReviewsData = {
  platform?: string;
  overall_rating?: number;
  review_count?: number;
  ease_of_use_score?: number;
  customer_support_score?: number;
  top_praise_themes?: string[];
  top_complaint_themes?: string[];
  recent_reviews?: Array<{
    rating?: number;
    summary?: string;
    date?: string;
  }>;
  recommended_percentage?: number;
};
