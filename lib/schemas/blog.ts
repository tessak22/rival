/**
 * Blog index page extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: blog index pages are almost always server-rendered HTML lists.
 *
 * Fallback: /extract/markdown then /generate — if extract/json returns empty,
 * retry with extract/markdown to capture the raw page structure, then pass to
 * generate to extract structured fields from the markdown.
 *
 * When to use vs alternatives:
 * - Use this schema on /blog, /articles, /news, /resources, /posts, /insights index pages.
 * - Do NOT scrape individual blog post pages — only the index page.
 * - Do NOT confuse with changelog: changelog = product update notes; blog = content marketing.
 *
 * Key parameters:
 * - effort: low (blog indexes are server-rendered)
 * - nocache: true (scheduled freshness required)
 * - No geo_target needed
 *
 * Fallback behavior:
 * - If extract/json returns empty: retry with extract/markdown, then pass to generate.
 * - Log fallback_triggered: true, fallback_endpoint: 'generate'.
 * - Log schema_mismatch: true when recent_post_titles is empty on a confirmed blog index.
 *
 * HIGHEST-SIGNAL FIELDS for GTM:
 * - primary_topics: reveals which audience segments the competitor is investing content for.
 *   New topic clusters = potential pivot or launch signal.
 * - developer_focused: true = writing for developers; false = writing for buyers/business.
 *   A flip in this field is a strategic audience signal worth flagging immediately.
 */

export const BLOG_SCHEMA = {
  type: "object",
  properties: {
    recent_post_titles: {
      type: "array",
      items: { type: "string" },
      description:
        "Titles of the most recent 5-10 blog posts, most recent first. Primary field for detecting new content and topic shifts."
    },
    recent_post_urls: {
      type: "array",
      items: { type: "string" },
      description: "URLs of the same posts in the same order as recent_post_titles. Null entries if URL is not extractable."
    },
    recent_post_dates: {
      type: "array",
      items: { type: "string" },
      description:
        "Publication dates for the same posts in the same order. ISO date (YYYY-MM-DD) or displayed string. Null entries if dates are not visible."
    },
    post_frequency: {
      type: "string",
      description:
        "Inferred publishing cadence based on visible dates. One of: daily, 2-3x per week, weekly, 2-3x per month, monthly, sporadic, unknown."
    },
    primary_topics: {
      type: "array",
      items: { type: "string" },
      description:
        "3-6 inferred content themes synthesized across recent post titles. Not verbatim titles — synthesized themes (e.g. 'developer onboarding', 'enterprise security'). HIGHEST-SIGNAL: reveals which audiences the competitor is investing in."
    },
    developer_focused: {
      type: "boolean",
      description:
        "True if the blog appears written primarily for a technical/developer audience. HIGHEST-SIGNAL: a flip from false to true (or vice versa) is a major strategic audience signal."
    },
    has_categories_or_tags: {
      type: "boolean",
      description: "True if the blog index shows visible category or tag filters the reader can interact with."
    },
    visible_categories: {
      type: "array",
      items: { type: "string" },
      description: "Category or tag labels visible on the index page. Empty array if none are shown."
    }
  },
  required: ["recent_post_titles", "primary_topics", "developer_focused"]
} as const;

export const BLOG_EXPECTED_FIELDS = [...BLOG_SCHEMA.required] as const;

export type BlogData = {
  recent_post_titles?: string[];
  recent_post_urls?: (string | null)[];
  recent_post_dates?: (string | null)[];
  post_frequency?: string;
  primary_topics?: string[];
  developer_focused?: boolean;
  has_categories_or_tags?: boolean;
  visible_categories?: string[];
};
