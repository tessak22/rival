/**
 * Intelligence brief generation.
 *
 * What it does:
 * - Collects latest scan outputs for a competitor.
 * - Sends consolidated context to Tabstack /generate for structured brief output.
 * - Persists intelligence_brief and threat_level on competitor records.
 *
 * Cost tier:
 * - Medium. Uses /generate once per competitor scan cycle.
 *
 * When to use vs alternatives:
 * - Use after scan cycles complete.
 * - Do not call /generate per-page for this use case.
 *
 * Key parameters:
 * - competitorId: target competitor
 * - nocache: defaults to true
 *
 * Fallback behavior:
 * - No internal fallback. Caller handles errors.
 */

import { prisma } from "@/lib/db/client";
import { generateBrief } from "@/lib/tabstack/generate";
import { isPlainObject, stringifyUnknown } from "@/lib/utils/types";
import { Prisma } from "@prisma/client";

function latestScanContext(scans: Array<{ pageType: string; pageLabel: string; result: unknown }>): string {
  return JSON.stringify(
    scans.map((scan) => ({
      page_type: scan.pageType,
      page_label: scan.pageLabel,
      result: scan.result
    }))
  );
}

function parseThreatLevel(value: unknown): string | null {
  if (!isPlainObject(value)) return null;
  const level = value["threat_level"];
  if (typeof level !== "string") return null;
  if (level !== "High" && level !== "Medium" && level !== "Low") return null;
  return level;
}

function extractBriefPayload(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if ("data" in value) return value["data"];
  return value;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) || isPlainObject(value)) return value as Prisma.InputJsonValue;
  return stringifyUnknown(value);
}

export async function generateCompetitorBrief(competitorId: string, nocache = true) {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { pages: true }
  });

  if (!competitor) {
    throw new Error("Competitor not found");
  }

  const scans = await prisma.scan.findMany({
    where: { page: { competitorId } },
    include: { page: true },
    orderBy: { scannedAt: "desc" }
  });

  const latestByPage = new Map<string, { pageType: string; pageLabel: string; result: unknown }>();
  for (const scan of scans) {
    if (latestByPage.has(scan.pageId)) continue;
    latestByPage.set(scan.pageId, {
      pageType: scan.page.type,
      pageLabel: scan.page.label,
      result: scan.markdownResult ?? scan.rawResult
    });
  }

  const response = await generateBrief({
    competitorId,
    url: competitor.baseUrl,
    contextData: latestScanContext([...latestByPage.values()]),
    effort: "low",
    nocache
  });

  const payload = extractBriefPayload(response);
  const threatLevel = parseThreatLevel(payload);

  await prisma.competitor.update({
    where: { id: competitorId },
    data: {
      intelligenceBrief: toJsonValue(payload),
      threatLevel,
      briefGeneratedAt: new Date()
    }
  });

  return payload;
}
