import Link from "next/link";

import {
  RDSChip,
  RDSFooter,
  RDSHeader,
  RDSKicker,
  RDSLiveDot,
  RDSPageShell,
  RDSSectionHead,
  rdsHealthColor,
  rdsTierLabel
} from "@/components/rds";
import { prisma } from "@/lib/db/client";
import { getSelfCompetitor } from "@/lib/db/competitors";
import { latestQualityPerPage } from "@/lib/db/health";
import { loadRivalConfig } from "@/lib/config/rival-config";

export const dynamic = "force-dynamic";

const INTEL_FEED_WINDOW_DAYS = 7;
const TOP_MOVERS_WINDOW_DAYS = 1;
const SCHEMA_FIELD_ORDER = [
  "homepage",
  "profile",
  "pricing",
  "blog",
  "docs",
  "github",
  "social",
  "changelog",
  "careers",
  "reviews",
  "stack"
];

type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

async function loadDashboardData() {
  const competitors = await prisma.competitor.findMany({
    where: { isSelf: false },
    orderBy: { name: "asc" }
  });
  const competitorIds = competitors.map((c) => c.id);

  const [recentScans, qualityRows, self] = await Promise.all([
    prisma.scan.findMany({
      where: { page: { competitorId: { in: competitorIds } } },
      select: {
        hasChanges: true,
        scannedAt: true,
        page: { select: { competitorId: true, type: true } }
      },
      orderBy: { scannedAt: "desc" },
      take: 5000
    }),
    latestQualityPerPage(competitorIds),
    getSelfCompetitor()
  ]);

  const latestScan = new Map<string, Date>();
  const changeCountByCompetitor = new Map<string, number>();
  const moversCutoff = Date.now() - TOP_MOVERS_WINDOW_DAYS * 86_400_000;
  for (const scan of recentScans) {
    const cid = scan.page.competitorId;
    if (!latestScan.has(cid)) latestScan.set(cid, scan.scannedAt);
    if (scan.hasChanges && scan.scannedAt.getTime() >= moversCutoff) {
      changeCountByCompetitor.set(cid, (changeCountByCompetitor.get(cid) ?? 0) + 1);
    }
  }

  // Health per competitor and schema coverage per page type both derived from
  // the most-recent quality result per page — not a rolling historical average.
  const scoresByCompetitor = new Map<string, number[]>();
  const schemaScoresByType = new Map<string, number[]>();
  for (const row of qualityRows) {
    const score = row.result_quality === "full" ? 1 : row.result_quality === "partial" ? 0.5 : 0;
    const cScores = scoresByCompetitor.get(row.competitor_id) ?? [];
    cScores.push(score);
    scoresByCompetitor.set(row.competitor_id, cScores);
    if (row.page_type) {
      const tScores = schemaScoresByType.get(row.page_type) ?? [];
      tScores.push(score);
      schemaScoresByType.set(row.page_type, tScores);
    }
  }

  const competitorRows = competitors.map((competitor) => {
    const scores = scoresByCompetitor.get(competitor.id) ?? [];
    const health = scores.length === 0 ? 0 : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
    const category = pickStringField(competitor.manualData, ["category"]);
    const hq = pickStringField(competitor.manualData, ["hq", "headquarters"]);
    const employees = pickStringField(competitor.manualData, ["employees", "team_size"]);
    const fundingM = pickNumberField(competitor.manualData, ["fundingM", "funding_m", "funding_millions"]);
    return {
      id: competitor.id,
      slug: competitor.slug,
      name: competitor.name,
      category,
      hq,
      employees,
      fundingM,
      health,
      threatLevel: (competitor.threatLevel ?? "low").toLowerCase(),
      changeCount: changeCountByCompetitor.get(competitor.id) ?? 0,
      lastScanAt: latestScan.get(competitor.id) ?? null,
      briefSummary: pickStringField(competitor.intelligenceBrief, ["threat_reasoning"])
    };
  });

  const feedCutoff = new Date(Date.now() - INTEL_FEED_WINDOW_DAYS * 86_400_000);
  const feedItems = await prisma.scan.findMany({
    where: {
      hasChanges: true,
      scannedAt: { gte: feedCutoff },
      page: { competitorId: { in: competitorIds } }
    },
    include: { page: true },
    orderBy: { scannedAt: "desc" },
    take: 60
  });

  const nameById = new Map(competitors.map((c) => [c.id, c.name] as const));
  const slugById = new Map(competitors.map((c) => [c.id, c.slug] as const));

  const feed = feedItems.map((item) => ({
    id: item.id,
    competitorId: item.page.competitorId,
    competitorName: nameById.get(item.page.competitorId) ?? "Unknown",
    competitorSlug: slugById.get(item.page.competitorId) ?? null,
    pageLabel: item.page.label,
    pageType: item.page.type ?? null,
    scannedAt: item.scannedAt,
    summary: item.diffSummary
  }));

  const schemaFields = [...schemaScoresByType.entries()]
    .map(([type, scores]) => ({
      name: type,
      coverage: scores.length === 0 ? 0 : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
    }))
    .sort((a, b) => {
      const ai = SCHEMA_FIELD_ORDER.indexOf(a.name);
      const bi = SCHEMA_FIELD_ORDER.indexOf(b.name);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.name.localeCompare(b.name);
    });

  const schemaOverall =
    schemaFields.length === 0
      ? 0
      : Math.round(schemaFields.reduce((acc, f) => acc + f.coverage, 0) / schemaFields.length);

  const config = loadRivalConfig();
  const priorityBySlug = new Map(
    config.competitors
      .filter((c) => typeof (c.manual as Record<string, unknown> | undefined)?.priority === "number")
      .map((c) => [c.slug, (c.manual as Record<string, unknown>).priority as number])
  );

  return {
    self,
    competitors: competitorRows,
    feed,
    schema: { overall: schemaOverall, fields: schemaFields },
    priorityBySlug
  };
}

function pickStringField(blob: unknown, keys: string[]): string | null {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;
  const rec = blob as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNumberField(blob: unknown, keys: string[]): number | null {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;
  const rec = blob as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function formatTimeAgo(from: Date): string {
  const diffMs = Date.now() - from.getTime();
  const min = Math.max(1, Math.floor(diffMs / 60_000));
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export default async function HomePage() {
  const data = await loadDashboardData();
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
    .replace(",", " ·");

  return (
    <RDSPageShell>
      <HeaderRow self={data.self} generatedAt={`${generatedAt} UTC`} />
      <HeadlineStrip generatedAt={generatedAt} rows={data.competitors} />
      <LeadStory feed={data.feed} />
      <ThreatsSection rows={data.competitors} priorityBySlug={data.priorityBySlug} />
      <ActiveSignals feed={data.feed} />
      <WatchAndSchema rows={data.competitors} schema={data.schema} />
      <RDSFooter />
    </RDSPageShell>
  );
}

// ── subviews ─────────────────────────────────────────────────────

function HeaderRow({ self, generatedAt }: { self: DashboardData["self"]; generatedAt: string }) {
  return (
    <RDSHeader
      right={
        <>
          <span style={{ letterSpacing: "0.04em" }}>{generatedAt}</span>
          <RDSLiveDot />
          {self && <SelfChip name={self.name} slug={self.slug} />}
        </>
      }
    />
  );
}

function SelfChip({ name, slug }: { name: string; slug: string }) {
  return (
    <Link
      href={`/${slug}`}
      title="Your profile"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginLeft: 12,
        padding: "4px 12px 4px 4px",
        border: "1px solid var(--ink)",
        background: "var(--paper)",
        color: "var(--ink)",
        borderRadius: 999,
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        fontWeight: 600,
        textDecoration: "none"
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--ink)",
          color: "var(--ink-bg-text)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700
        }}
      >
        {name.charAt(0)}
      </span>
      <span>{name}</span>
    </Link>
  );
}

function HeadlineStrip({ generatedAt, rows }: { generatedAt: string; rows: DashboardData["competitors"] }) {
  const topMovers = rows
    .filter((r) => r.changeCount > 0)
    .sort((a, b) => b.changeCount - a.changeCount || b.health - a.health)
    .slice(0, 5);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr",
        gap: 32,
        padding: "20px 0 24px",
        borderBottom: "1px solid var(--paper-rule-2)"
      }}
    >
      <div>
        <RDSKicker>Daily briefing · {generatedAt}</RDSKicker>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "var(--fs-16)",
            lineHeight: "var(--lh-body)",
            color: "var(--ink-2)",
            textWrap: "pretty",
            fontStyle: "italic"
          }}
        >
          {buildLede(rows, topMovers)}
        </p>
      </div>
      <div style={{ borderLeft: "1px solid var(--paper-rule-2)", paddingLeft: 24 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--ink-faint)",
            marginBottom: 8,
            textTransform: "uppercase"
          }}
        >
          Top movers · 24h
        </div>
        {topMovers.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-faint)",
              fontStyle: "italic",
              margin: 0
            }}
          >
            No competitor changes in the last 24 hours.
          </p>
        ) : (
          topMovers.map((m) => (
            <Link
              key={m.slug}
              href={`/${m.slug}`}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                padding: "5px 0",
                borderBottom: "1px dotted var(--paper-rule-2)",
                color: "var(--ink)",
                textDecoration: "none"
              }}
            >
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.name}</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--accent-hot)",
                  fontWeight: 700
                }}
              >
                +{m.changeCount}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink)",
                  width: 28,
                  textAlign: "right"
                }}
              >
                {m.health}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function buildLede(rows: DashboardData["competitors"], topMovers: DashboardData["competitors"]): string {
  if (topMovers.length === 0) {
    return `All ${rows.length} tracked competitors are quiet in the last 24 hours — schema coverage and positioning stable across the board.`;
  }
  const names = topMovers
    .slice(0, 3)
    .map((m) => m.name)
    .join(", ");
  return `${topMovers.length} competitor${topMovers.length === 1 ? "" : "s"} moved overnight — ${names} saw the largest shift${topMovers.length > 1 ? "s" : ""}. Review the Threats list and Active Signals below.`;
}

function LeadStory({ feed }: { feed: DashboardData["feed"] }) {
  const lead = feed[0];
  if (!lead) return null;
  const headline = buildLeadHeadline(lead);
  const body = lead.summary ?? "Change detected — review the full page for impact.";
  return (
    <div
      style={{
        padding: "22px 0 22px",
        borderTop: "1px solid var(--ink)",
        borderBottom: "1px solid var(--paper-rule-2)",
        marginBottom: 32
      }}
    >
      <RDSKicker hot>LEAD · {formatTimeAgo(lead.scannedAt).toUpperCase()} AGO</RDSKicker>
      <h2
        style={{
          fontSize: 34,
          lineHeight: 1.08,
          margin: "8px 0 0",
          fontWeight: 700,
          letterSpacing: "-0.015em",
          textWrap: "balance",
          color: "var(--ink)",
          fontFamily: "var(--font-serif)"
        }}
      >
        {headline}
      </h2>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: "var(--ink-faint)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em"
        }}
      >
        {formatScannedAt(lead.scannedAt)} · {lead.pageLabel} diff · confidence high
      </div>
      <p
        style={{
          marginTop: 14,
          marginBottom: 0,
          fontSize: 15.5,
          lineHeight: 1.65,
          color: "var(--ink)",
          textWrap: "pretty",
          maxWidth: body.length >= 240 ? "none" : 620,
          columnCount: body.length >= 240 ? 2 : 1,
          columnGap: 32
        }}
      >
        {body}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 16,
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        {lead.competitorSlug && (
          <Link
            href={`/${lead.competitorSlug}`}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--accent)",
              fontFamily: "var(--font-sans)",
              textDecoration: "none",
              borderBottom: "1px dotted var(--accent)"
            }}
          >
            Read full {lead.competitorName} page →
          </Link>
        )}
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lead.pageType && <RDSChip tone="default">{lead.pageType}</RDSChip>}
        </span>
      </div>
    </div>
  );
}

function buildLeadHeadline(lead: DashboardData["feed"][number]): string {
  const surface = (lead.pageType ?? lead.pageLabel).toLowerCase();
  const verb = pickHeadlineVerb(lead.summary);
  return `${lead.competitorName}: ${verb} ${surface}`;
}

function pickHeadlineVerb(summary: string | null | undefined): string {
  if (!summary) return "Updated";
  const s = summary.toLowerCase();
  if (/\bpric(e|ing)|\bremov|\bconsolidat|\breplac/i.test(s)) return "Changed";
  if (/\bnew\b|\bship|\blaunch|\brelease|\badd/i.test(s)) return "Shipped";
  if (/\brenam|\breposition|\bpivot|\brewrit/i.test(s)) return "Repositioned";
  return "Updated";
}

function formatScannedAt(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(d);
}

const THREAT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function ThreatsSection({
  rows,
  priorityBySlug
}: {
  rows: DashboardData["competitors"];
  priorityBySlug: Map<string, number>;
}) {
  const sorted = [...rows].sort((a, b) => {
    const ta = THREAT_ORDER[a.threatLevel] ?? 2;
    const tb = THREAT_ORDER[b.threatLevel] ?? 2;
    if (ta !== tb) return ta - tb;
    const pa = priorityBySlug.get(a.slug) ?? Infinity;
    const pb = priorityBySlug.get(b.slug) ?? Infinity;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  return (
    <div style={{ marginTop: 28 }}>
      <RDSSectionHead title="Threats" count={`${sorted.length} tracked`} />
      <div>
        {sorted.map((row, i) => (
          <ThreatRow key={row.slug} row={row} index={i} />
        ))}
      </div>
    </div>
  );
}

function ThreatRow({ row, index }: { row: DashboardData["competitors"][number]; index: number }) {
  const color = rdsHealthColor(row.health);
  const meta = [row.category, row.hq, row.employees, row.fundingM ? `$${row.fundingM}M raised` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/${row.slug}`}
      style={{
        display: "flex",
        gap: 20,
        padding: "16px 0",
        borderBottom: "1px solid var(--paper-rule)",
        alignItems: "flex-start",
        textDecoration: "none",
        color: "var(--ink)"
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--accent)",
          width: 30,
          paddingTop: 6
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em" }}>{row.name}</div>
        {meta && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-faint)",
              marginTop: 2,
              letterSpacing: "0.02em"
            }}
          >
            {meta}
          </div>
        )}
        {row.briefSummary && (
          <div
            style={{
              fontSize: 15,
              marginTop: 6,
              color: "var(--ink-2)",
              fontStyle: "italic",
              textWrap: "pretty"
            }}
          >
            {row.briefSummary}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", minWidth: 120 }}>
        <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color }}>
          {row.health}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ink-faint)",
            letterSpacing: "0.12em",
            marginTop: 2
          }}
        >
          HEALTH
        </div>
        <div
          style={{
            marginTop: 6,
            color: row.changeCount ? "var(--accent-hot)" : "var(--ink-faint)",
            fontSize: 10,
            letterSpacing: "0.1em",
            fontFamily: "var(--font-mono)"
          }}
        >
          {row.changeCount ? `${row.changeCount} CHANGES · 24H` : "NO CHANGE · 24H"}
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            color: "var(--ink-faint)"
          }}
        >
          {rdsTierLabel(row.threatLevel)} TIER
        </div>
      </div>
      <div
        style={{
          color: "var(--accent)",
          fontSize: 18,
          paddingTop: 6,
          width: 20,
          fontFamily: "var(--font-sans)"
        }}
      >
        →
      </div>
    </Link>
  );
}

function ActiveSignals({ feed }: { feed: DashboardData["feed"] }) {
  if (feed.length === 0) return null;
  // Group by competitor ID, not name, so two competitors that happen to share
  // a display name cannot collapse into one column (the surviving slug would
  // then link to the wrong competitor).
  const grouped = new Map<string, DashboardData["feed"]>();
  for (const item of feed) {
    grouped.set(item.competitorId, [...(grouped.get(item.competitorId) ?? []), item]);
  }
  const top = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3);

  return (
    <div style={{ marginTop: 28 }}>
      <RDSSectionHead title="Active signals" count={`${feed.length} · past 7d`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {top.map(([competitorId, items]) => {
          const name = items[0]?.competitorName ?? "Unknown";
          const slug = items[0]?.competitorSlug ?? null;
          return (
            <div key={competitorId} style={{ paddingTop: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8
                }}
              >
                {slug ? (
                  <Link
                    href={`/${slug}`}
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--ink)",
                      textDecoration: "none",
                      borderBottom: "1px dotted var(--accent)"
                    }}
                  >
                    {name}
                  </Link>
                ) : (
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{name}</span>
                )}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                  {items.length}
                </span>
              </div>
              {items.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px dotted var(--paper-rule-2)"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--ink-faint)",
                      letterSpacing: "0.06em",
                      marginBottom: 4
                    }}
                  >
                    <span style={{ color: "var(--ink)", fontWeight: 600 }}>{item.pageLabel}</span>
                    <span>{formatTimeAgo(item.scannedAt)} ago</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: "var(--ink)",
                      textWrap: "pretty"
                    }}
                  >
                    {item.summary ?? "Change detected · diff summary pending."}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WatchAndSchema({ rows, schema }: { rows: DashboardData["competitors"]; schema: DashboardData["schema"] }) {
  const quiet = rows.filter((r) => r.changeCount === 0);
  return (
    <div style={{ marginTop: 28 }}>
      <RDSSectionHead title="Watch list & data quality" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--ink-faint)",
              marginBottom: 8,
              borderBottom: "1px solid var(--ink)",
              paddingBottom: 6,
              textTransform: "uppercase"
            }}
          >
            Quiet but watched
          </div>
          {quiet.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-faint)",
                fontStyle: "italic",
                margin: 0
              }}
            >
              Every tracked competitor moved in the last 24h.
            </p>
          ) : (
            quiet.map((r) => (
              <Link
                key={r.slug}
                href={`/${r.slug}`}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  padding: "5px 0",
                  fontSize: 14,
                  color: "var(--ink)",
                  textDecoration: "none"
                }}
              >
                <span style={{ fontWeight: 700 }}>{r.name}</span>
                <span style={{ color: "var(--accent)" }}>—</span>
                <span style={{ color: "var(--ink-2)", fontStyle: "italic" }}>
                  {r.briefSummary ?? "Stable · no material changes."}
                </span>
              </Link>
            ))
          )}
        </div>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--ink-faint)",
              marginBottom: 8,
              borderBottom: "1px solid var(--ink)",
              paddingBottom: 6,
              textTransform: "uppercase"
            }}
          >
            Schema coverage · {schema.overall}%
          </div>
          {schema.fields.map((f) => (
            <div
              key={f.name}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 30px",
                gap: 10,
                alignItems: "center",
                padding: "4px 0"
              }}
            >
              <span style={{ fontSize: 13, textTransform: "capitalize" }}>{f.name}</span>
              <div style={{ height: 6, background: "var(--paper-rule)" }}>
                <div style={{ height: "100%", background: "var(--ink)", width: `${f.coverage}%` }} />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  textAlign: "right"
                }}
              >
                {f.coverage}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
