/**
 * Company profile / about page extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: about pages are typically static marketing pages.
 *
 * Fallback: /extract/markdown — if structured extraction fails, markdown still
 * captures the positioning narrative for manual review.
 *
 * Field notes:
 * - mission_statement null = no clear mission visible. Can signal a brand that
 *   positions on features rather than narrative. Content opportunity.
 * - positioning: the one-sentence self-description is the most direct signal of
 *   how they see themselves in the market. Track changes over time.
 * - key_leadership: watch for turnover in technical roles (CTO, Head of Eng).
 *   New names in leadership = potential strategy shifts.
 * - recent_partnerships: integrations and partner announcements signal go-to-market
 *   direction and ecosystem expansion.
 * - recent_awards: G2, analyst recognition, and press features. Useful for
 *   understanding their credibility narrative with enterprise buyers.
 */

export const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    mission_statement: {
      type: "string",
      description: "Their stated mission or why they exist. Null if not present — itself a positioning signal."
    },
    positioning: {
      type: "string",
      description: "How they describe themselves in one sentence on the about or home page."
    },
    key_leadership: {
      type: "array",
      description: "Visible leadership team members",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string", description: "Full title as listed on the page" }
        }
      }
    },
    recent_partnerships: {
      type: "array",
      items: { type: "string" },
      description: "Recent partner or integration announcements. Signals ecosystem direction."
    },
    recent_awards_or_recognition: {
      type: "array",
      items: { type: "string" },
      description: "Awards, analyst placements, or press mentions. Signals buyer credibility narrative."
    },
    // ICP and audience intelligence fields — added in issue #60
    target_company_size: {
      type: ["string", "null"],
      description:
        "Explicit sizing language such as 'built for teams of X' or 'for enterprise'. Null if not stated on the page."
    },
    target_industries: {
      type: "array",
      items: { type: "string" },
      description: "Industries or verticals explicitly called out on the About page. Empty array if none mentioned."
    },
    customer_logos: {
      type: "array",
      items: { type: "string" },
      description:
        "Names of customers whose logos or names appear on the About page as social proof. Empty array if none."
    },
    use_cases_stated: {
      type: "array",
      items: { type: "string" },
      description:
        "Explicit use case claims on the About page (e.g. 'for scheduling appointments'). 3-6 items. Empty array if none."
    },
    founded_year: {
      type: ["number", "null"],
      description: "Year the company was founded if stated on the About page. Null if not present."
    },
    team_size_stated: {
      type: ["string", "null"],
      description: "Stated headcount or team size string (e.g. 'a team of 12'). Null if not stated."
    },
    offices_or_locations: {
      type: "array",
      items: { type: "string" },
      description: "Physical office locations mentioned on the About page. Empty array if not mentioned."
    }
  },
  required: ["mission_statement", "positioning", "key_leadership"]
} as const;

export const PROFILE_EXPECTED_FIELDS = [...PROFILE_SCHEMA.required] as const;

export type ProfileData = {
  mission_statement?: string;
  positioning?: string;
  key_leadership?: Array<{ name?: string; title?: string }>;
  recent_partnerships?: string[];
  recent_awards_or_recognition?: string[];
  // ICP and audience intelligence fields — added in issue #60
  target_company_size?: string | null;
  target_industries?: string[];
  customer_logos?: string[];
  use_cases_stated?: string[];
  founded_year?: number | null;
  team_size_stated?: string | null;
  offices_or_locations?: string[];
};
