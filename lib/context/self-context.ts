/**
 * Builds a compact context string describing the user's own company,
 * for injection into every competitor-facing AI call (brief, research, compare).
 *
 * When:
 * - Returns null if no self row exists, or if the self brief has not yet been
 *   generated. Callers pass through without injection.
 * - Returns null when isDemo is true. Demo scans target arbitrary URLs the user
 *   pastes, which are not the operator's product — injecting self-context
 *   would poison the output.
 *
 * Output shape: a short prose block capped at ~800 chars of payload, with
 * framing that tells the downstream prompt NOT to echo it back.
 */

import { prisma } from "@/lib/db/client";
import { isPlainObject } from "@/lib/utils/types";

const MAX_PAYLOAD_CHARS = 800;

type SelfBriefShape = {
  positioning_summary?: string;
  icp_summary?: string;
  pricing_summary?: string;
  differentiators?: string[];
  recent_signals?: string[];
};

const KNOWN_BRIEF_KEYS = new Set<string>([
  "positioning_summary",
  "icp_summary",
  "pricing_summary",
  "differentiators",
  "recent_signals"
]);

function mergeBriefAndManual(
  brief: SelfBriefShape,
  manual: Record<string, unknown> | null
): { fields: SelfBriefShape; extras: Record<string, unknown> } {
  if (!manual) return { fields: brief, extras: {} };
  const merged: SelfBriefShape = { ...brief };
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manual)) {
    if (KNOWN_BRIEF_KEYS.has(key)) {
      (merged as Record<string, unknown>)[key] = value;
    } else {
      extras[key] = value;
    }
  }
  return { fields: merged, extras };
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "…";
}

export type BuildSelfContextOptions = {
  isDemo?: boolean;
};

export async function buildSelfContext(options: BuildSelfContextOptions = {}): Promise<string | null> {
  if (options.isDemo) return null;

  const self = await prisma.competitor.findFirst({
    where: { isSelf: true }
  });

  if (!self) return null;
  if (!self.intelligenceBrief || !isPlainObject(self.intelligenceBrief)) return null;

  const brief = self.intelligenceBrief as SelfBriefShape;
  const manual = isPlainObject(self.manualData) ? (self.manualData as Record<string, unknown>) : null;
  const { fields, extras } = mergeBriefAndManual(brief, manual);

  const parts: string[] = [];
  parts.push(`Name: ${self.name}`);
  if (typeof fields.positioning_summary === "string" && fields.positioning_summary) {
    parts.push(`Positioning: ${fields.positioning_summary}`);
  }
  if (typeof fields.icp_summary === "string" && fields.icp_summary) {
    parts.push(`ICP: ${fields.icp_summary}`);
  }
  if (typeof fields.pricing_summary === "string" && fields.pricing_summary) {
    parts.push(`Pricing: ${fields.pricing_summary}`);
  }
  // JSON columns have no runtime guarantees for array element types, so
  // filter for strings before joining. Prevents "[object Object]" leaking
  // into every downstream prompt if the brief schema ever drifts.
  const diffs = Array.isArray(fields.differentiators)
    ? fields.differentiators.filter((d): d is string => typeof d === "string" && d.length > 0)
    : [];
  if (diffs.length) parts.push(`What makes us distinct: ${diffs.join("; ")}`);
  const signals = Array.isArray(fields.recent_signals)
    ? fields.recent_signals.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  if (signals.length) parts.push(`Recent signals: ${signals.join("; ")}`);
  if (Object.keys(extras).length > 0) {
    parts.push(`User notes: ${JSON.stringify(extras)}`);
  }

  const payload = truncate(parts.join("\n"), MAX_PAYLOAD_CHARS);

  return `CONTEXT — about the user's own company (who this brief is for):
${payload}
Use this to frame recommendations, threat levels, and opportunities relative to THIS company specifically. Do not echo this context in the output.`;
}
