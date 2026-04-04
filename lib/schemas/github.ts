/**
 * GitHub repository extraction schema.
 *
 * Endpoint: /extract/json, effort: low
 * Why low effort: GitHub is server-rendered. Standard effort is sufficient.
 *
 * Fallback: none — GitHub data is publicly accessible and rarely blocked.
 *
 * Field notes:
 * - stars/forks: track over time for growth velocity, not just absolute value.
 * - contributors: active in last 90 days is more meaningful than total contributors.
 *   Declining active contributors can signal community health issues.
 * - open_issues + open_prs: high ratio relative to recent releases signals
 *   shipping velocity. Many open issues and slow releases = developer pain point.
 * - recent_releases: 3-5 most recent. Frequency and naming convention reveal
 *   how the team ships (semantic versioning? feature naming? quiet patches?).
 * - topics: self-declared positioning. Watch for changes in topic tags over time.
 */

export const GITHUB_SCHEMA = {
  type: "object",
  properties: {
    stars: {
      type: "number",
      description: "Total GitHub stars. Track delta between scans for growth velocity."
    },
    forks: {
      type: "number",
      description: "Total forks. High fork count relative to stars can signal active customization."
    },
    contributors: {
      type: "number",
      description: "Active contributors in the last 90 days. Declining trend is a health signal."
    },
    last_commit_date: {
      type: "string",
      description: "Date of the most recent commit to the default branch."
    },
    open_issues: {
      type: "number",
      description: "Current open issue count. Combine with release frequency for velocity signal."
    },
    open_prs: {
      type: "number",
      description: "Current open PR count. Many unmerged PRs can signal contributor friction."
    },
    language: {
      type: "string",
      description: "Primary programming language as reported by GitHub."
    },
    topics: {
      type: "array",
      items: { type: "string" },
      description: "Repository topic tags. Changes over time reveal strategic positioning shifts."
    },
    recent_releases: {
      type: "array",
      description: "Most recent 3-5 releases",
      items: {
        type: "object",
        properties: {
          version: { type: "string" },
          date: { type: "string" },
          title: { type: "string", description: "Release title or tag name" }
        }
      }
    }
  },
  required: ["stars", "forks", "open_issues", "recent_releases"]
} as const;

export const GITHUB_EXPECTED_FIELDS = [...GITHUB_SCHEMA.required] as const;

export type GithubData = {
  stars?: number;
  forks?: number;
  open_issues?: number;
  open_prs?: number;
  recent_releases?: Array<{ version?: string; date?: string; title?: string }>;
  contributors_last_90_days?: number;
  last_commit_date?: string;
};
