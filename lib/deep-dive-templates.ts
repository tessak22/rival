/**
 * Pre-built Deep Dive prompt templates.
 *
 * Each template has:
 *   - key: stable identifier sent to the API and stored in DB
 *   - label: display name shown in the UI and in history badges
 *   - description: short subtitle shown under the label in the selector
 *   - buildPrompt: function that interpolates the competitor name at runtime
 *
 * "general" is the implicit default — it is NOT stored as a template key and
 * uses the general research query already in the route. All other keys map to
 * one of the three pre-built templates defined here.
 */

export type DeepDiveTemplateKey = "messaging" | "developer-sentiment" | "strategic-moves";

export type DeepDiveTemplate = {
  key: DeepDiveTemplateKey;
  label: string;
  description: string;
  buildPrompt: (competitorName: string) => string;
};

export const DEEP_DIVE_TEMPLATES: DeepDiveTemplate[] = [
  {
    key: "messaging",
    label: "Messaging & Positioning",
    description: "Find all tagline variations, positioning angles, and messaging themes",
    buildPrompt: (name) => `You are a competitive intelligence analyst researching ${name}.

Your goal: Build a complete picture of how this company messages and positions their product.

Research the following and report your findings with citations for every claim:

1. PRIMARY POSITIONING
   - What is their main headline/tagline on their homepage right now?
   - How do they describe what the product does in one sentence?
   - What problem do they claim to solve?
   - Who do they say the product is for?

2. TAGLINE & HEADLINE VARIATIONS
   - Find every distinct tagline or headline variation this company uses across their website, including subpages, landing pages, and product pages.
   - Note which page each variation appears on.
   - Identify any patterns — are they testing different angles (pain-focused vs. outcome-focused vs. feature-focused)?

3. KEY DIFFERENTIATOR CLAIMS
   - What specific claims do they make about why they're better or different?
   - Are any claims quantified (e.g. "2x faster", "saves 5 hours/week")?

4. AUDIENCE SIGNALS
   - What language do they use to describe their target customer?
   - Do they name specific industries, roles, or company types?
   - Do they use different messaging for different audiences on different pages?

5. TONE & VOICE
   - How would you characterize their tone? (e.g. technical, approachable, enterprise, startup-casual)
   - Does the tone shift across different pages or sections?

Cite every specific claim with the URL where you found it. Flag anything that seems inconsistent or in conflict across pages.`
  },
  {
    key: "developer-sentiment",
    label: "Developer Sentiment",
    description: "What developers are saying across GitHub, Reddit, and community spaces",
    buildPrompt: (name) => `You are a competitive intelligence analyst researching developer sentiment around ${name}.

Your goal: Find what developers are actually saying about this product in public spaces — not on the company's own website.

Search and report on:

1. GITHUB
   - Any issues, discussions, or comments mentioning pain points, limitations, or feature requests
   - How developers describe the product in README files or integration docs when using it in their own projects

2. REDDIT & FORUMS
   - Reddit threads mentioning ${name}
   - Hacker News threads or comments
   - Any developer forum discussions

3. COMMUNITY SPACES
   - Mentions in Discord communities (if publicly indexed)
   - Stack Overflow questions or answers
   - Dev.to or Hashnode posts

4. COMMON THEMES
   - What do developers praise most?
   - What are the most common complaints or frustrations?
   - What alternatives do developers mention switching to or from?
   - Are there any dealbreakers mentioned repeatedly?

5. SENTIMENT TREND
   - Does sentiment appear to be improving or worsening over time based on post dates?

Cite every finding with a URL. Focus on recency — prioritize sources from the last 12 months.`
  },
  {
    key: "strategic-moves",
    label: "Recent Strategic Moves",
    description: "Funding, hires, partnerships, and product direction in the last 6 months",
    buildPrompt: (name) => `You are a competitive intelligence analyst. Research ${name} and produce a summary of their notable strategic activity in the last 6 months.

Cover:

1. FUNDING & FINANCIALS
   - Any funding rounds announced, amounts, investors
   - Revenue signals or milestones mentioned publicly

2. LEADERSHIP & HIRING
   - Notable executive hires or departures
   - Significant hiring pushes in specific areas (engineering, sales, DevRel, etc.)
   - Any organizational signals (restructuring, new office, layoffs)

3. PARTNERSHIPS & INTEGRATIONS
   - New partnerships or integrations announced
   - Any technology alliances or ecosystem moves

4. PRODUCT DIRECTION
   - Major feature launches or product announcements
   - Any shifts in product strategy or target market
   - Beta programs or early access launches

5. MARKET POSITIONING CHANGES
   - Any changes in how they're describing their product or positioning
   - New verticals or ICPs they appear to be targeting
   - Competitive attacks or direct comparisons to other products

6. PRESS & COVERAGE
   - Notable press mentions or media coverage
   - Any awards, rankings, or recognition

Cite every claim. Flag anything that appears to signal a significant strategic pivot.`
  }
];

/**
 * Returns the interpolated prompt string for the given template key and competitor name.
 * Returns null if the key is not found (caller should fall back to general research).
 */
export function buildPromptForTemplate(key: string, competitorName: string): string | null {
  const template = DEEP_DIVE_TEMPLATES.find((t) => t.key === key);
  return template ? template.buildPrompt(competitorName) : null;
}
