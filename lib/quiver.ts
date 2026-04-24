/**
 * Quiver integration — nightly competitor push.
 *
 * After each scan cycle completes, pushes a structured competitive intelligence
 * report to Quiver via its MCP HTTP endpoint (POST /api/mcp, bearer auth).
 * Quiver AI processes it automatically: extracts quotes, themes, and sentiment.
 *
 * Config:
 *   QUIVER_MCP_URL    — e.g. https://quiver.yourhost.com/api/mcp
 *   QUIVER_MCP_SECRET — bearer token (Quiver's MCP_AUTH_SECRET)
 *
 * Failure policy: errors are logged but never thrown. A failed push must not
 * block or fail the scan cycle that triggered it.
 */

import { prisma } from "@/lib/db/client";

function isConfigured(): boolean {
  return Boolean(process.env.QUIVER_MCP_URL && process.env.QUIVER_MCP_SECRET);
}

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

async function buildReport(competitorId: string, name: string, baseUrl: string): Promise<string> {
  const [competitor, pages, recentChanges] = await Promise.all([
    prisma.competitor.findUnique({
      where: { id: competitorId },
      select: { threatLevel: true, intelligenceBrief: true, manualData: true }
    }),
    prisma.competitorPage.findMany({
      where: { competitorId },
      include: {
        scans: { orderBy: { scannedAt: "desc" }, take: 1 }
      }
    }),
    prisma.scan.findMany({
      where: {
        hasChanges: true,
        scannedAt: { gte: new Date(Date.now() - 25 * 60 * 60 * 1000) }, // last 25h covers nightly runs
        page: { competitorId }
      },
      include: { page: { select: { label: true, type: true } } },
      orderBy: { scannedAt: "desc" }
    })
  ]);

  const brief = asObj(competitor?.intelligenceBrief);
  const manual = asObj(competitor?.manualData);
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(`# Competitive Intelligence: ${name}`);
  lines.push(`URL: ${baseUrl}`);
  lines.push(`Threat: ${competitor?.threatLevel ?? "unknown"}`);
  if (manual?.total_funding) lines.push(`Funding: ${manual.total_funding}`);
  if (manual?.employee_count ?? manual?.employees) lines.push(`Team: ${manual?.employee_count ?? manual?.employees}`);
  if (manual?.monthly_traffic) lines.push(`Traffic: ${String(manual.monthly_traffic)}/mo`);
  lines.push("");

  // ── Intelligence brief ───────────────────────────────────────────────────
  if (brief) {
    lines.push("## Intelligence Brief");
    if (brief.threat_reasoning) lines.push(`**Threat:** ${brief.threat_reasoning}`);
    if (brief.positioning_opportunity) lines.push(`**Positioning opportunity:** ${brief.positioning_opportunity}`);
    if (brief.content_opportunity) lines.push(`**Content opportunity:** ${brief.content_opportunity}`);
    if (brief.product_opportunity) lines.push(`**Product opportunity:** ${brief.product_opportunity}`);
    const watchList = Array.isArray(brief.watch_list)
      ? (brief.watch_list as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (watchList.length > 0) {
      lines.push("**Watch list:**");
      watchList.forEach((item) => lines.push(`- ${item}`));
    }
    lines.push("");
  }

  // ── Scan data by page type ───────────────────────────────────────────────
  const scansByType = new Map<string, unknown>();
  for (const page of pages) {
    if (page.scans[0]?.rawResult && !scansByType.has(page.type)) {
      scansByType.set(page.type, page.scans[0].rawResult);
    }
  }

  // Homepage / positioning
  const homepage = asObj(scansByType.get("homepage"));
  if (homepage) {
    lines.push("## Positioning");
    if (homepage.primary_tagline) lines.push(`> "${homepage.primary_tagline}"`);
    if (homepage.sub_tagline) lines.push(`> ${homepage.sub_tagline}`);
    if (homepage.positioning_statement) lines.push(`**Positioning:** ${homepage.positioning_statement}`);
    if (homepage.primary_cta_text) lines.push(`**CTA:** "${homepage.primary_cta_text}"`);
    const diffs = Array.isArray(homepage.key_differentiators)
      ? (homepage.key_differentiators as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (diffs.length > 0) lines.push(`**Differentiators:** ${diffs.join(" · ")}`);
    lines.push("");
  }

  // Pricing
  const pricing = asObj(scansByType.get("pricing"));
  if (pricing) {
    lines.push("## Pricing");
    lines.push(
      `Transparent: ${pricing.pricing_transparent ? "Yes" : "No"} | Free tier: ${pricing.has_free_tier ? "Yes" : "No"}${pricing.free_tier_limits ? ` (${pricing.free_tier_limits})` : ""}`
    );
    const tiers = Array.isArray(pricing.tiers) ? pricing.tiers : [];
    if (tiers.length > 0) {
      tiers.forEach((tier: unknown) => {
        const t = asObj(tier);
        if (t?.name) lines.push(`- ${t.name}: ${t.price ?? "—"}${t.per_unit ? ` + ${t.per_unit}` : ""}${t.is_self_serve === false ? " (sales required)" : ""}`);
      });
    }
    lines.push("");
  }

  // Careers / tech stack
  const careers = asObj(scansByType.get("careers"));
  if (careers) {
    lines.push("## Hiring Signals");
    if (careers.total_count != null) lines.push(`Open roles: ${careers.total_count} | Trend: ${careers.hiring_trend ?? "unknown"}`);
    if (careers.devrel_roles_open) lines.push("DevRel roles open — community investment signal");
    if (careers.leadership_roles_open) lines.push("Leadership roles open — org change signal");
    const stack = Array.isArray(careers.aggregate_tech_stack)
      ? (careers.aggregate_tech_stack as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (stack.length > 0) lines.push(`Tech stack (from JDs): ${stack.join(", ")}`);
    lines.push("");
  }

  // Reviews
  const reviews = asObj(scansByType.get("reviews"));
  if (reviews) {
    lines.push("## Customer Sentiment");
    if (reviews.platform && reviews.overall_rating != null) {
      lines.push(`${reviews.platform}: ${reviews.overall_rating}/5${reviews.review_count ? ` (${reviews.review_count} reviews)` : ""}`);
    }
    const praise = Array.isArray(reviews.top_praise_themes)
      ? (reviews.top_praise_themes as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const complaints = Array.isArray(reviews.top_complaint_themes)
      ? (reviews.top_complaint_themes as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (praise.length > 0) lines.push(`Praise: ${praise.join(", ")}`);
    if (complaints.length > 0) lines.push(`Complaints: ${complaints.join(", ")}`);
    lines.push("");
  }

  // GitHub
  const github = asObj(scansByType.get("github"));
  if (github) {
    lines.push("## GitHub");
    const parts: string[] = [];
    if (github.stars != null) parts.push(`${Number(github.stars).toLocaleString()} stars`);
    if (github.forks != null) parts.push(`${github.forks} forks`);
    if (github.last_commit_date) parts.push(`last commit ${github.last_commit_date}`);
    if (parts.length > 0) lines.push(parts.join(" | "));
    const topics = Array.isArray(github.topics) ? (github.topics as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (topics.length > 0) lines.push(`Topics: ${topics.join(", ")}`);
    lines.push("");
  }

  // Recent changes
  if (recentChanges.length > 0) {
    lines.push("## Changes Detected This Cycle");
    recentChanges.forEach((s) => {
      lines.push(`- **${s.page.label}:** ${s.diffSummary ?? "Changed"}`);
    });
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function pushCompetitorToQuiver(
  competitorId: string,
  name: string,
  baseUrl: string
): Promise<void> {
  if (!isConfigured()) return;

  const url = process.env.QUIVER_MCP_URL!;
  const secret = process.env.QUIVER_MCP_SECRET!;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const rawNotes = await buildReport(competitorId, name, baseUrl);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "save_research_entry",
          arguments: {
            title: `Rival: ${name} — ${today}`,
            source_type: "other",
            raw_notes: rawNotes,
            contact_company: name,
            contact_segment: "Competitor",
            research_date: today
          }
        }
      })
    });

    if (!response.ok) {
      console.error(`[quiver] push failed for ${name}: HTTP ${response.status}`);
      return;
    }

    // Quiver's MCP endpoint returns SSE format: "event: message\ndata: {...}\n\n"
    const text = await response.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    const body = dataLine ? (JSON.parse(dataLine.slice(5).trim()) as { result?: unknown; error?: { message?: string } }) : {};
    if (body.error) {
      console.error(`[quiver] push error for ${name}:`, body.error.message);
    } else {
      console.log(`[quiver] pushed "${name}" to Quiver research`);
    }
  } catch (err) {
    console.error(`[quiver] push threw for ${name}:`, err instanceof Error ? err.message : err);
  }
}
