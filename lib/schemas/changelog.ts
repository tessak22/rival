/**
 * Changelog / release notes extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: static pages don't need full browser rendering.
 *
 * Note: for raw content capture, /extract/markdown is preferred (cheaper, preserves
 * heading/list structure). Use this JSON schema when you need structured fields
 * (cadence, last_update_date) rather than the full text.
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

export const CHANGELOG_EXPECTED_FIELDS = [...CHANGELOG_SCHEMA.required] as const;

export type ChangelogData = {
  last_update_date?: string;
  recent_features?: string[];
  cadence?: string;
};
