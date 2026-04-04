/**
 * Careers page extraction schema.
 *
 * Endpoint: /extract/json, effort: high
 * Why high effort: careers pages are almost always JS-heavy (Greenhouse, Lever, Ashby).
 * Standard effort frequently misses the full job listing content.
 *
 * Fallback: /automate — for boards that paginate or require interaction.
 *
 * Field notes:
 * - tech_stack_mentioned in each role is critical: engineers list the actual tools,
 *   infra, and frameworks they use. More honest than any marketing page.
 *   Extract every technology mentioned anywhere in the full job description body.
 * - aggregate_tech_stack = all unique technologies across all JDs. This is the
 *   fingerprint of their actual engineering stack.
 * - devrel_roles_open signals community investment and potential SDK/docs improvement.
 * - leadership_roles_open (CTO, VP Eng, Head of Product) signals org change or
 *   a significant scaling phase.
 * - hiring_trend: compare total_count over time. Rapid growth = well-funded and
 *   scaling. Rapid decline = cost-cutting or post-layoff.
 */

export const CAREERS_SCHEMA = {
  type: "object",
  properties: {
    open_roles: {
      type: "array",
      description: "All currently open roles",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          department: { type: "string", description: "Engineering, Product, Marketing, etc." },
          location: { type: "string", description: "City/country or Remote" },
          remote: { type: "boolean", description: "True if explicitly marked as remote" },
          seniority: {
            type: "string",
            description: "junior, mid, senior, staff, principal, lead, manager, director, vp, etc."
          },
          tech_stack_mentioned: {
            type: "array",
            items: { type: "string" },
            description:
              "Every technology, framework, tool, cloud provider, or infrastructure component mentioned anywhere in the full job description body — not just the title. Include languages, databases, CI/CD tools, cloud platforms, monitoring tools, etc."
          }
        }
      }
    },
    total_count: {
      type: "number",
      description: "Total number of open roles. Track over time for hiring trend."
    },
    hiring_trend: {
      type: "string",
      description: "growing, shrinking, or flat — based on visible indicators on the page"
    },
    leadership_roles_open: {
      type: "boolean",
      description: "True if any C-level, VP, Head of, or Director roles are open. Signals org change."
    },
    devrel_roles_open: {
      type: "boolean",
      description:
        "True if any Developer Relations, Developer Advocate, or community-facing roles are open. Signals community investment."
    },
    aggregate_tech_stack: {
      type: "array",
      items: { type: "string" },
      description:
        "All unique technologies mentioned across all job descriptions. This is the fingerprint of their actual engineering stack."
    }
  },
  required: ["open_roles", "total_count", "hiring_trend", "aggregate_tech_stack"]
} as const;

export const CAREERS_EXPECTED_FIELDS: string[] = [...CAREERS_SCHEMA.required];

export type CareersData = {
  open_roles?: Array<{
    title?: string;
    department?: string;
    location?: string;
    remote?: boolean;
    seniority?: string;
    tech_stack_mentioned?: string[];
  }>;
  total_count?: number;
  hiring_trend?: string;
  is_actively_hiring?: boolean;
  has_devrel_roles?: boolean;
  aggregate_tech_stack?: string[];
};
