/**
 * Changelog / release notes extraction schema.
 *
 * Endpoint: /extract/markdown, effort: low
 * Why markdown: changelogs are typically server-rendered text pages. Markdown
 * output preserves structure (headings, lists) and is cheaper than JSON extraction.
 * Why low effort: static pages don't need full browser rendering.
 *
 * This schema is used for optional structured extraction when /extract/json is
 * called on changelog pages (e.g. to extract cadence or last update date).
 * For raw content capture, use /extract/markdown without a schema.
 *
 * Fallback: /automate — for SPAs that load changelog content dynamically.
 *
 * Field notes:
 * - last_update_date null = the page may not show dates, or the page was unreachable.
 *   Track absence over time — a changelog that stops updating is a signal.
 * - recent_features is the primary diff target. Changes here trigger notifications.
 * - cadence: irregular cadence can signal a team under pressure or shifting focus.
 *   weekly = high-velocity team. monthly = steady. quarterly/irregular = slower.
 */

export const CHANGELOG_SCHEMA = {
  type: "object",
  properties: {
    last_update_date: {
      type: "string",
      description: "Date of the most recent changelog entry. Null if not visible or page unreachable."
    },
    recent_features: {
      type: "array",
      items: { type: "string" },
      description: "Features, fixes, or changes added in the last 90 days. One item per distinct change."
    },
    cadence: {
      type: "string",
      description: "Observed update frequency: weekly, biweekly, monthly, quarterly, or irregular"
    }
  },
  required: ["last_update_date", "recent_features"]
} as const;

export const CHANGELOG_EXPECTED_FIELDS = ["last_update_date", "recent_features"];
