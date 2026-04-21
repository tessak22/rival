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
import { generateBrief, generateSelfProfile } from "@/lib/tabstack/generate";
import { isPlainObject, stringifyUnknown } from "@/lib/utils/types";
import { Prisma } from "@prisma/client";

// Page types included in brief context. Changelog, docs, and social are excluded:
// changelog is long markdown with low positioning signal; docs is verbose reference
// content; social is low-signal for structured brief output.
const BRIEF_PAGE_TYPES = new Set(["homepage", "pricing", "profile", "reviews", "blog", "careers", "github"]);

// Max characters per scan result to prevent exceeding /generate instruction limits.
const MAX_RESULT_CHARS = 2000;

function truncateResult(result: unknown): unknown {
  const serialized = JSON.stringify(result);
  if (serialized.length <= MAX_RESULT_CHARS) return result;
  return serialized.slice(0, MAX_RESULT_CHARS) + "…[truncated]";
}

function latestScanContext(scans: Array<{ pageType: string; pageLabel: string; result: unknown }>): string {
  const filtered = scans.filter((scan) => BRIEF_PAGE_TYPES.has(scan.pageType));
  return JSON.stringify(
    filtered.map((scan) => ({
      page_type: scan.pageType,
      page_label: scan.pageLabel,
      result: truncateResult(scan.result)
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

export async function generateSelfBrief(competitorId: string, nocache = true) {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { pages: true }
  });

  if (!competitor) {
    throw new Error("Competitor not found");
  }

  if (!competitor.isSelf) {
    throw new Error(`Competitor ${competitorId} is not the self row`);
  }

  const staleThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const scans = await prisma.scan.findMany({
    where: { page: { competitorId } },
    include: { page: true },
    orderBy: { scannedAt: "desc" }
  });

  const latestByPage = new Map<string, { pageType: string; pageLabel: string; result: unknown }>();
  for (const scan of scans) {
    if (latestByPage.has(scan.pageId)) continue;
    if (scan.scannedAt < staleThreshold) continue;
    latestByPage.set(scan.pageId, {
      pageType: scan.page.type,
      pageLabel: scan.page.label,
      result: scan.markdownResult ?? scan.rawResult
    });
  }

  if (latestByPage.size === 0) {
    throw new Error("No recent scans available for self-profile generation");
  }

  // Self brief includes ALL page types. Unlike competitor briefs, we want every
  // signal from the user's own surfaces so the injected context is maximally useful.
  const contextData = JSON.stringify(
    [...latestByPage.values()].map((scan) => ({
      page_type: scan.pageType,
      page_label: scan.pageLabel,
      result: truncateResult(scan.result)
    }))
  );

  const response = await generateSelfProfile({
    competitorId,
    url: competitor.baseUrl,
    contextData,
    effort: "low",
    nocache
  });

  const payload = extractBriefPayload(response);

  await prisma.competitor.update({
    where: { id: competitorId },
    data: {
      intelligenceBrief: toJsonValue(payload),
      threatLevel: null,
      briefGeneratedAt: new Date()
    }
  });

  return payload;
}

export async function generateCompetitorBrief(competitorId: string, nocache = true) {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { pages: true }
  });

  if (!competitor) {
    throw new Error("Competitor not found");
  }

  const staleThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // 7 days
  const scans = await prisma.scan.findMany({
    where: { page: { competitorId } },
    include: { page: true },
    orderBy: { scannedAt: "desc" }
  });

  const latestByPage = new Map<string, { pageType: string; pageLabel: string; result: unknown }>();
  for (const scan of scans) {
    if (latestByPage.has(scan.pageId)) continue;
    if (scan.scannedAt < staleThreshold) continue;
    latestByPage.set(scan.pageId, {
      pageType: scan.page.type,
      pageLabel: scan.page.label,
      result: scan.markdownResult ?? scan.rawResult
    });
  }

  if (latestByPage.size === 0) {
    throw new Error("No recent scans available for brief generation");
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
