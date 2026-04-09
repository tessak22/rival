import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

type ApiLogRecord = {
  id: string;
  status: string;
  endpoint: string;
  effort: string | null;
  geoTarget: string | null;
  missingFields: string[];
  fallbackTriggered: boolean;
  contentBlocked: boolean;
  rawError: string | null;
  url: string | null;
  calledAt: Date;
  pageId: string | null;
  page: { type: string; label: string; url: string } | null;
};

export type InsightsFilters = {
  endpoint?: string;
  competitorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type SuccessRateSummary = {
  totalCalls: number;
  successCalls: number;
  successRate: number;
};

export type MissingFieldSummary = {
  pageType: string;
  field: string;
  missingCount: number;
};

export type PageFallbackSummary = {
  pageId: string;
  pageLabel: string;
  pageType: string;
  pageUrl: string;
  fallbackCount: number;
  totalCalls: number;
  fallbackRate: number;
};

export type EffortDistributionSummary = {
  effort: "low" | "high" | "unknown";
  count: number;
};

export type GeoTargetSummary = {
  segment: "geo_targeted" | "default";
  totalCalls: number;
  successCalls: number;
  successRate: number;
};

export type BlockedDomainSummary = {
  domain: string;
  blockedCount: number;
};

export type ErrorSummary = {
  error: string;
  count: number;
  timeline: Array<{ day: string; count: number }>;
};

const INSIGHTS_LOG_LIMIT = 10_000;
const MISSING_FIELD_KEY_SEPARATOR = "\u0000";

function buildInsightsWhere(filters: InsightsFilters): Prisma.ApiLogWhereInput {
  return {
    competitorId: filters.competitorId,
    endpoint: filters.endpoint,
    calledAt:
      filters.dateFrom || filters.dateTo
        ? {
            gte: filters.dateFrom,
            lte: filters.dateTo
          }
        : undefined
  };
}

async function loadLogs(filters: InsightsFilters): Promise<ApiLogRecord[]> {
  return prisma.apiLog.findMany({
    where: buildInsightsWhere(filters),
    select: {
      id: true,
      status: true,
      endpoint: true,
      effort: true,
      geoTarget: true,
      missingFields: true,
      fallbackTriggered: true,
      contentBlocked: true,
      rawError: true,
      url: true,
      calledAt: true,
      pageId: true,
      page: {
        select: {
          type: true,
          label: true,
          url: true
        }
      }
    },
    orderBy: { calledAt: "desc" },
    take: INSIGHTS_LOG_LIMIT
  });
}

function toDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDomain(url: string | null): string {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

export async function getApiSuccessRate(filters: InsightsFilters = {}): Promise<SuccessRateSummary> {
  const logs = await loadLogs(filters);
  const totalCalls = logs.length;
  const successCalls = logs.filter((log) => log.status === "success").length;
  return {
    totalCalls,
    successCalls,
    successRate: totalCalls === 0 ? 0 : successCalls / totalCalls
  };
}

export async function getMissingFieldsByPageType(filters: InsightsFilters = {}): Promise<MissingFieldSummary[]> {
  const logs = await loadLogs(filters);
  const counts = new Map<string, number>();

  for (const log of logs) {
    const pageType = log.page?.type ?? "unknown";
    for (const field of log.missingFields) {
      const key = `${pageType}${MISSING_FIELD_KEY_SEPARATOR}${field}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([key, missingCount]) => {
      const separatorIndex = key.indexOf(MISSING_FIELD_KEY_SEPARATOR);
      const pageType = separatorIndex === -1 ? key : key.slice(0, separatorIndex);
      const field = separatorIndex === -1 ? "" : key.slice(separatorIndex + MISSING_FIELD_KEY_SEPARATOR.length);
      return { pageType, field, missingCount };
    })
    .sort((a, b) => b.missingCount - a.missingCount);
}

export async function getFallbackFrequencyByPage(filters: InsightsFilters = {}): Promise<PageFallbackSummary[]> {
  const logs = await loadLogs(filters);
  const grouped = new Map<
    string,
    {
      pageId: string;
      pageLabel: string;
      pageType: string;
      pageUrl: string;
      fallbackCount: number;
      totalCalls: number;
    }
  >();

  for (const log of logs) {
    if (!log.pageId || !log.page) continue;
    const key = log.pageId;
    const existing = grouped.get(key) ?? {
      pageId: log.pageId,
      pageLabel: log.page.label,
      pageType: log.page.type,
      pageUrl: log.page.url,
      fallbackCount: 0,
      totalCalls: 0
    };
    existing.totalCalls += 1;
    if (log.fallbackTriggered) {
      existing.fallbackCount += 1;
    }
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      fallbackRate: entry.totalCalls === 0 ? 0 : entry.fallbackCount / entry.totalCalls
    }))
    .sort((a, b) => b.fallbackCount - a.fallbackCount);
}

export async function getEffortDistribution(filters: InsightsFilters = {}): Promise<EffortDistributionSummary[]> {
  const logs = await loadLogs(filters);
  // Known Tabstack effort values are low/high. Unknown captures null and any future SDK values.
  const counts = { low: 0, high: 0, unknown: 0 };

  for (const log of logs) {
    if (log.effort === "low") counts.low += 1;
    else if (log.effort === "high") counts.high += 1;
    else counts.unknown += 1;
  }

  return [
    { effort: "low", count: counts.low },
    { effort: "high", count: counts.high },
    { effort: "unknown", count: counts.unknown }
  ];
}

export async function getGeoTargetComparisons(filters: InsightsFilters = {}): Promise<GeoTargetSummary[]> {
  const logs = await loadLogs(filters);
  const target = {
    geo_targeted: { totalCalls: 0, successCalls: 0 },
    default: { totalCalls: 0, successCalls: 0 }
  };

  for (const log of logs) {
    const segment = log.geoTarget ? "geo_targeted" : "default";
    target[segment].totalCalls += 1;
    if (log.status === "success") {
      target[segment].successCalls += 1;
    }
  }

  return (Object.keys(target) as Array<"geo_targeted" | "default">).map((segment) => ({
    segment,
    totalCalls: target[segment].totalCalls,
    successCalls: target[segment].successCalls,
    successRate: target[segment].totalCalls === 0 ? 0 : target[segment].successCalls / target[segment].totalCalls
  }));
}

export async function getBlockedContentByDomain(filters: InsightsFilters = {}): Promise<BlockedDomainSummary[]> {
  const logs = await loadLogs(filters);
  const counts = new Map<string, number>();

  for (const log of logs) {
    if (!log.contentBlocked) continue;
    const domain = toDomain(log.url ?? log.page?.url ?? null);
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([domain, blockedCount]) => ({ domain, blockedCount }))
    .sort((a, b) => b.blockedCount - a.blockedCount);
}

export async function getTopErrors(filters: InsightsFilters = {}, limit = 10): Promise<ErrorSummary[]> {
  const logs = await loadLogs(filters);
  const rows = logs.filter((log) => log.rawError && log.rawError.trim().length > 0);
  const grouped = new Map<string, { count: number; byDay: Map<string, number> }>();

  for (const row of rows) {
    const message = row.rawError as string;
    const day = toDayKey(row.calledAt);
    const item = grouped.get(message) ?? { count: 0, byDay: new Map<string, number>() };
    item.count += 1;
    item.byDay.set(day, (item.byDay.get(day) ?? 0) + 1);
    grouped.set(message, item);
  }

  return [...grouped.entries()]
    .map(([error, value]) => ({
      error,
      count: value.count,
      timeline: [...value.byDay.entries()]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day))
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getApiInsights(filters: InsightsFilters = {}) {
  const [
    successRate,
    missingFields,
    fallbackFrequency,
    effortDistribution,
    geoTargetComparisons,
    blockedByDomain,
    topErrors
  ] = await Promise.all([
    getApiSuccessRate(filters),
    getMissingFieldsByPageType(filters),
    getFallbackFrequencyByPage(filters),
    getEffortDistribution(filters),
    getGeoTargetComparisons(filters),
    getBlockedContentByDomain(filters),
    getTopErrors(filters)
  ]);

  return {
    successRate,
    missingFields,
    fallbackFrequency,
    effortDistribution,
    geoTargetComparisons,
    blockedByDomain,
    topErrors
  };
}
