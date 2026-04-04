/**
 * Product / engineering stack extraction schema.
 *
 * Endpoint: /extract/json, effort: low — multiple source pages
 * Source pages: docs, readme, about, homepage — combine with careers aggregate_tech_stack.
 * Supplement with careers data for the most accurate stack picture.
 *
 * Fallback: /extract/markdown — if JSON extraction fails, capture raw page text
 * for manual review.
 *
 * Field notes:
 * - languages: the programming languages their product officially supports or is
 *   built in. Gaps = SDK opportunity.
 * - frameworks: major frameworks in use. Tells you their architectural opinions.
 * - deployment: cloud provider and infra signals. AWS-only = different buyer than
 *   multi-cloud or self-hosted.
 * - integrations: key ecosystem connections. Missing integration with a popular
 *   tool in your category = product opportunity.
 * - cli_available: a CLI signals developer-first culture and workflow integration.
 *   Absence is a notable gap if your category has CLI conventions.
 * - sdk_languages: which languages have official SDKs. Gaps = contribution or
 *   product opportunity. Compare against careers tech_stack_mentioned.
 * - ide_plugins: VS Code, JetBrains, Neovim, etc. Signals depth of DX investment.
 */

export const STACK_SCHEMA = {
  type: "object",
  properties: {
    languages: {
      type: "array",
      items: { type: "string" },
      description: "Programming languages the product officially supports (for SDKs, integrations, or is built in)."
    },
    frameworks: {
      type: "array",
      items: { type: "string" },
      description: "Major frameworks supported or used, e.g. Next.js, Django, Rails, Spring."
    },
    deployment: {
      type: "string",
      description: "Primary deployment infrastructure: AWS, GCP, Azure, self-hosted, Railway, Vercel, etc."
    },
    integrations: {
      type: "array",
      items: { type: "string" },
      description:
        "Key third-party integrations, e.g. Slack, GitHub, Datadog, Stripe. Missing popular integrations = product opportunity."
    },
    cli_available: {
      type: "boolean",
      description: "True if an official CLI tool exists. Absence in a developer-focused product is notable."
    },
    sdk_languages: {
      type: "array",
      items: { type: "string" },
      description: "Languages with official SDKs. Gaps vs. their target developer persona = opportunity."
    },
    ide_plugins: {
      type: "array",
      items: { type: "string" },
      description: "Official IDE integrations: VS Code, JetBrains, Neovim, etc."
    }
  },
  required: ["languages", "frameworks", "integrations"]
} as const;

export const STACK_EXPECTED_FIELDS: string[] = [...STACK_SCHEMA.required];

export type StackData = {
  languages?: string[];
  frameworks?: string[];
  deployment?: string;
  integrations?: string[];
  cli_available?: boolean;
  sdk_languages?: string[];
  ide_plugins?: string[];
};
