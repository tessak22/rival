import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  RDSButton,
  RDSChip,
  RDSCrumbs,
  RDSDiffPills,
  RDSEmpty,
  RDSFooter,
  RDSHeader,
  RDSKicker,
  RDSLiveDot,
  RDSPageShell,
  RDSSectionHead,
  RDSStat
} from "@/components/rds";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const MAX_SCANS = 200;
const HISTORY_WINDOW_DAYS = 14;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
};

export default async function HistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { type: rawType } = await searchParams;

  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    include: { pages: { select: { id: true, type: true, label: true } } }
  });
  if (!competitor) notFound();

  const activeType = rawType && rawType.trim().length > 0 ? rawType.trim().toLowerCase() : null;
  const windowStart = new Date(Date.now() - HISTORY_WINDOW_DAYS * 86_400_000);

  const [allScans, logs] = await Promise.all([
    prisma.scan.findMany({
      where: { page: { competitorId: competitor.id } },
      include: { page: true },
      orderBy: { scannedAt: "desc" },
      take: MAX_SCANS
    }),
    prisma.apiLog.findMany({
      where: { competitorId: competitor.id, calledAt: { gte: windowStart } },
      select: {
        pageId: true,
        resultQuality: true,
        fallbackTriggered: true,
        fallbackEndpoint: true,
        missingFields: true
      }
    })
  ]);

  const logByPageId = new Map<string, (typeof logs)[number]>();
  for (const l of logs) {
    if (!l.pageId) continue;
    if (!logByPageId.has(l.pageId)) logByPageId.set(l.pageId, l);
  }

  const windowScans = allScans.filter((s) => s.scannedAt >= windowStart);
  const filteredScans = activeType ? windowScans.filter((s) => s.page.type === activeType) : windowScans;

  const countsByType = new Map<string, number>();
  for (const s of windowScans) {
    const k = s.page.type ?? "unknown";
    countsByType.set(k, (countsByType.get(k) ?? 0) + 1);
  }
  const tabs = [...countsByType.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const totalScans = windowScans.length;

  const changedCount = windowScans.filter((s) => s.hasChanges).length;
  const lastChange = windowScans.find((s) => s.hasChanges) ?? null;

  const byDay = groupByDay(filteredScans);
  const category = pickCategoryFromBrief(competitor.intelligenceBrief) ?? competitor.threatLevel?.toUpperCase() ?? null;

  const generatedAt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  })
    .format(new Date())
    .replace(",", "");

  return (
    <RDSPageShell>
      <RDSHeader
        wordmarkSize={32}
        left={
          <div style={{ paddingLeft: 12 }}>
            <RDSCrumbs
              items={[
                { label: "Dashboard", href: "/" },
                { label: competitor.name, href: `/${competitor.slug}` },
                { label: "History" }
              ]}
            />
          </div>
        }
        right={
          <>
            <span>{generatedAt} UTC</span>
            <RDSLiveDot />
          </>
        }
      />

      {/* Hero */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 32,
          padding: "22px 0",
          borderBottom: "1px solid var(--paper-rule-2)"
        }}
      >
        <div>
          <RDSKicker hot>{category ? `SCAN HISTORY · ${category.toUpperCase()}` : "SCAN HISTORY"}</RDSKicker>
          <h1
            style={{
              margin: "8px 0 10px",
              fontSize: "var(--fs-34)",
              fontWeight: 700,
              letterSpacing: "-0.015em",
              lineHeight: "var(--lh-tight)",
              color: "var(--ink)",
              fontFamily: "var(--font-serif)"
            }}
          >
            {competitor.name} — Scan History
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "var(--fs-15)",
              color: "var(--ink-2)",
              lineHeight: "var(--lh-body)",
              maxWidth: 560,
              textWrap: "pretty"
            }}
          >
            Every fetch, parse, and diff recorded for <b>{competitor.name}</b>. Filter by surface to focus the timeline;
            each row captures what was found, what changed, and the fields returned.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 18,
            alignContent: "end",
            borderLeft: "1px solid var(--paper-rule-2)",
            paddingLeft: 24
          }}
        >
          <RDSStat label={`Scans · ${HISTORY_WINDOW_DAYS}d`} value={totalScans} />
          <RDSStat label="Changed" value={changedCount} color="var(--accent-hot)" />
          <RDSStat label="Surfaces" value={countsByType.size} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ marginTop: 28 }}>
        <RDSSectionHead
          title="Filter"
          eyebrow="BY SURFACE"
          count={
            activeType ? `showing ${filteredScans.length} of ${totalScans}` : `${totalScans} scans`
          }
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 0" }}>
          <TabLink href={`/${competitor.slug}/history`} active={!activeType}>
            <span>All</span>
            <TabCount>{totalScans}</TabCount>
          </TabLink>
          {tabs.map(([type, count]) => (
            <TabLink
              key={type}
              href={`/${competitor.slug}/history?type=${encodeURIComponent(type)}`}
              active={activeType === type}
            >
              <span style={{ textTransform: "capitalize" }}>{type}</span>
              <TabCount>{count}</TabCount>
            </TabLink>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ marginTop: 28 }}>
        <RDSSectionHead
          title="Timeline"
          eyebrow="MOST RECENT FIRST"
          count={lastChange ? `last change ${formatLastChange(lastChange.scannedAt)}` : null}
        />
        {byDay.length === 0 ? (
          <RDSEmpty
            title="No scans match this filter"
            body={
              activeType
                ? `No ${activeType} scans in the last ${HISTORY_WINDOW_DAYS} days.`
                : `No scans in the last ${HISTORY_WINDOW_DAYS} days.`
            }
            action={
              activeType ? (
                <RDSButton variant="ghost" href={`/${competitor.slug}/history`} size="sm">
                  Show all
                </RDSButton>
              ) : null
            }
          />
        ) : (
          byDay.map(([day, events]) => {
            const changedInDay = events.filter((e) => e.hasChanges).length;
            return (
              <div key={day} style={{ marginBottom: 28 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "8px 0",
                    marginBottom: 4
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-11)",
                      color: "var(--ink)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600
                    }}
                  >
                    {day}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--paper-rule)" }} />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-10)",
                      color: "var(--ink-faint)",
                      letterSpacing: "0.08em"
                    }}
                  >
                    {changedInDay} changed · {events.length} scans
                  </span>
                </div>
                <div>
                  {events.map((scan) => (
                    <ScanRow key={scan.id} scan={scan} log={logByPageId.get(scan.pageId) ?? null} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <RDSFooter />
    </RDSPageShell>
  );
}

// ── subviews ─────────────────────────────────────────────────────

function TabLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-13)",
        fontWeight: active ? 600 : 500,
        color: active ? "var(--ink-bg-text)" : "var(--ink-2)",
        background: active ? "var(--ink)" : "transparent",
        border: `1px solid ${active ? "var(--ink)" : "var(--paper-rule-2)"}`,
        borderRadius: 0,
        padding: "6px 12px",
        textDecoration: "none"
      }}
    >
      {children}
    </Link>
  );
}

function TabCount({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-10)",
        opacity: 0.7,
        letterSpacing: "0.04em"
      }}
    >
      {children}
    </span>
  );
}

type ScanRecord = {
  id: string;
  scannedAt: Date;
  hasChanges: boolean;
  diffSummary: string | null;
  rawResult: unknown;
  markdownResult: string | null;
  endpointUsed: string;
  pageId: string;
  page: { label: string; type: string | null };
};

type LogRecord = {
  pageId: string | null;
  resultQuality: string | null;
  fallbackTriggered: boolean;
  fallbackEndpoint: string | null;
  missingFields: string[];
};

function ScanRow({ scan, log }: { scan: ScanRecord; log: LogRecord | null }) {
  const hasChange = scan.hasChanges;
  const isPartial = log?.resultQuality === "partial";
  const viaMarkdown =
    log?.fallbackEndpoint === "extract/markdown" ||
    scan.endpointUsed === "extract/markdown" ||
    scan.endpointUsed.includes("markdown");
  const dotColor = hasChange ? "var(--ok)" : "var(--paper-rule-2)";
  const kvEntries = extractKvEntries(scan.rawResult);
  const typeLabel = (scan.page.type ?? "unknown").toUpperCase();
  const timeBig = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(scan.scannedAt);
  const dateSmall = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(scan.scannedAt);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "84px 26px 1fr",
        padding: "12px 0",
        borderBottom: "1px dotted var(--paper-dot)"
      }}
    >
      <div style={{ paddingTop: 2 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-13)",
            color: "var(--ink)",
            fontWeight: 600,
            letterSpacing: "0.02em"
          }}
        >
          {timeBig}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-10)",
            color: "var(--ink-faint)",
            letterSpacing: "0.04em",
            marginTop: 2
          }}
        >
          {dateSmall}
        </div>
      </div>

      <div style={{ position: "relative", display: "flex", justifyContent: "center", paddingTop: 8 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: "2px solid var(--paper)",
            boxShadow: "0 0 0 1px var(--paper-rule-2)",
            background: dotColor,
            zIndex: 1
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: -12,
            left: "50%",
            width: 1,
            background: "var(--paper-rule)",
            transform: "translateX(-0.5px)"
          }}
        />
      </div>

      <div style={{ paddingLeft: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-10)",
              letterSpacing: "0.1em",
              padding: "3px 8px",
              border: "1px solid var(--ink)",
              background: hasChange ? "var(--ink)" : "transparent",
              color: hasChange ? "var(--ink-bg-text)" : "var(--ink)"
            }}
          >
            {typeLabel}
          </span>
          <RDSDiffPills
            inline
            added={hasChange ? countDiff(scan.diffSummary, "add") : 0}
            removed={hasChange ? countDiff(scan.diffSummary, "remove") : 0}
          />
          {isPartial && <RDSChip tone="hot">Partial</RDSChip>}
          {viaMarkdown && <RDSChip>via markdown</RDSChip>}
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "var(--fs-14)",
            lineHeight: "var(--lh-body)",
            color: "var(--ink-2)",
            textWrap: "pretty"
          }}
        >
          {scan.diffSummary ?? (hasChange ? "Change detected; diff summary pending." : "No change since last scan.")}
        </p>
        {kvEntries.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px dotted var(--paper-dot)"
            }}
          >
            {kvEntries.slice(0, 6).map(([k, v]) => (
              <div key={k}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-10)",
                    color: "var(--ink-faint)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 2
                  }}
                >
                  {k.replace(/_/g, " ")}
                </div>
                <div style={{ fontSize: "var(--fs-13)", color: "var(--ink)", fontFamily: "var(--font-sans)" }}>
                  {truncate(renderFieldValue(v), 120)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────

function groupByDay<T extends { scannedAt: Date }>(scans: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const s of scans) {
    const day = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(s.scannedAt);
    groups.set(day, [...(groups.get(day) ?? []), s]);
  }
  return [...groups.entries()];
}

function formatLastChange(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(d);
}

function extractKvEntries(raw: unknown): Array<[string, unknown]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => v != null && (typeof v !== "string" || v.length > 0))
    .slice(0, 8);
}

function renderFieldValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(renderFieldValue).join(", ");
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function countDiff(summary: string | null | undefined, mode: "add" | "remove"): number {
  if (!summary) return mode === "add" ? 1 : 0;
  const m = summary.match(mode === "add" ? /(\d+)\s*(added|new)/i : /(\d+)\s*(removed|deleted)/i);
  if (m) return parseInt(m[1], 10);
  // Default at least one added when summary exists.
  return mode === "add" ? 1 : 0;
}

function pickCategoryFromBrief(blob: unknown): string | null {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;
  const rec = blob as Record<string, unknown>;
  for (const key of ["category", "positioning_category"]) {
    if (typeof rec[key] === "string" && (rec[key] as string).trim().length > 0) {
      return (rec[key] as string).trim();
    }
  }
  return null;
}
