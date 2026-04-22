import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import {
  RDSFooter,
  RDSHeader,
  RDSKicker,
  RDSLiveDot,
  RDSMiniLine,
  RDSPageShell,
  RDSSectionHead,
  rdsHealthColor,
  rdsTierLabel
} from "@/components/rds";
import { prisma } from "@/lib/db/client";
import type { BlogData } from "@/lib/schemas/blog";
import type { HomepageData } from "@/lib/schemas/homepage";
import type { ProfileData } from "@/lib/schemas/profile";
import type { ReviewsData } from "@/lib/schemas/reviews";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function CompetitorDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    include: { pages: true }
  });
  if (!competitor) notFound();

  const [scans, logs] = await Promise.all([
    prisma.scan.findMany({
      where: { page: { competitorId: competitor.id } },
      include: { page: true },
      orderBy: { scannedAt: "desc" },
      take: 200
    }),
    prisma.apiLog.findMany({
      where: { competitorId: competitor.id },
      include: { page: true },
      orderBy: { calledAt: "desc" },
      take: 200
    })
  ]);

  const latestScans = dedupeByPage(scans);
  const homepageScan = latestScans.find((s) => s.page.type === "homepage") ?? null;
  const profileScan = latestScans.find((s) => s.page.type === "profile") ?? null;
  const blogScan = latestScans.find((s) => s.page.type === "blog") ?? null;
  const reviewsScans = latestScans.filter((s) => s.page.type === "reviews");

  const homepageData = asObject<HomepageData>(homepageScan?.rawResult);
  const profileData = asObject<ProfileData>(profileScan?.rawResult);
  const blogData = asObject<BlogData>(blogScan?.rawResult);

  const qualityScores: Array<[string, number]> = [];
  const qualityByType = new Map<string, number[]>();
  for (const log of logs) {
    if (!log.resultQuality) continue;
    const score = log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0;
    qualityScores.push([log.page?.type ?? "unknown", score]);
    const type = log.page?.type ?? null;
    if (type) {
      qualityByType.set(type, [...(qualityByType.get(type) ?? []), score]);
    }
  }
  const overallHealth =
    qualityScores.length === 0
      ? 0
      : Math.round((qualityScores.reduce((a, b) => a + b[1], 0) / qualityScores.length) * 100);

  const sectionHealth = [...qualityByType.entries()]
    .map(([type, scores]) => ({
      name: type,
      pct: scores.length === 0 ? 0 : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
    }))
    .sort((a, b) => b.pct - a.pct);

  const trend = buildHealthTrend(scans, logs);

  const recentChanges = scans.filter((s) => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return s.hasChanges && s.scannedAt.getTime() >= cutoff;
  }).length;

  const intelligenceBrief = asObject<Record<string, unknown>>(competitor.intelligenceBrief);
  const category = pickString(competitor.manualData, ["category"]) ?? inferCategoryFromTier(competitor.threatLevel);
  const hq =
    pickString(competitor.manualData, ["hq", "headquarters"]) ?? profileData?.offices_or_locations?.[0] ?? null;
  const founded = pickNumber(competitor.manualData, ["founded"]) ?? profileData?.founded_year ?? null;
  const employees =
    pickString(competitor.manualData, ["employees", "team_size"]) ?? profileData?.team_size_stated ?? null;
  const fundingM = pickNumber(competitor.manualData, ["fundingM", "funding_m", "funding_millions"]);
  const tagline = homepageData?.primary_tagline ?? profileData?.positioning ?? null;

  return (
    <RDSPageShell>
      <RDSHeader
        wordmarkSize={32}
        left={
          <div style={{ paddingLeft: 12 }}>
            <Link
              href="/"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--accent)",
                textDecoration: "underline"
              }}
            >
              ← Dashboard
            </Link>
          </div>
        }
        right={
          <>
            <Link
              href={`/${competitor.slug}/deep-dive`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--fs-11)",
                color: "var(--ink-faint)",
                letterSpacing: "0.08em",
                textDecoration: "none",
                textTransform: "uppercase"
              }}
            >
              Deep Dive →
            </Link>
            <RDSLiveDot />
          </>
        }
      />

      <Hero
        name={competitor.name}
        baseUrl={competitor.baseUrl}
        category={category}
        tagline={tagline}
        hq={hq}
        founded={founded}
        employees={employees}
        fundingM={fundingM}
        health={overallHealth}
        trend={trend}
        changeCount={recentChanges}
        surfaces={competitor.pages.length}
        threatLevel={competitor.threatLevel}
        historyHref={`/${competitor.slug}/history`}
      />

      {intelligenceBrief && <IntelligenceBriefSection brief={intelligenceBrief} />}

      <HomepageSection data={homepageData} scan={homepageScan} health={healthFor(qualityByType, "homepage")} />

      <ProfileSection data={profileData} />

      <ReviewsSection scans={reviewsScans} qualityByType={qualityByType} />

      <BlogSection
        data={blogData}
        scan={blogScan}
        health={healthFor(qualityByType, "blog")}
        baseUrl={competitor.baseUrl}
      />

      <SectionHealth list={sectionHealth} />

      <LatestScansSection scans={latestScans} />

      <LogsSection logs={logs.slice(0, 14)} />

      <DetailFooter />

      <RDSFooter />
    </RDSPageShell>
  );
}

// ── helpers ──────────────────────────────────────────────────────

function dedupeByPage<T extends { pageId: string }>(scans: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of scans) {
    if (seen.has(s.pageId)) continue;
    seen.add(s.pageId);
    out.push(s);
  }
  return out;
}

function asObject<T>(value: unknown): T | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  return null;
}

function pickString(blob: unknown, keys: string[]): string | null {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;
  const rec = blob as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickNumber(blob: unknown, keys: string[]): number | null {
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;
  const rec = blob as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function inferCategoryFromTier(tier: string | null | undefined): string | null {
  return tier ? `${tier.toUpperCase()} PRIORITY` : null;
}

function healthFor(qualityByType: Map<string, number[]>, type: string): number | null {
  const scores = qualityByType.get(type);
  if (!scores || scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}

// Only allow http(s) URLs. Blocks javascript:, data:, vbscript:, file:, about:
// etc. — any URL scheme that would otherwise execute when clicked.
// Use this on anything read from competitor.baseUrl, scan rawResult, apiLog, or
// other untrusted upstream data before rendering into an href.
function toSafeHttpUrl(rawUrl: string | null | undefined, base?: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = base ? new URL(rawUrl, base) : new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch {
    // Not a valid absolute or relative URL — do not render as clickable.
  }
  return null;
}

function buildHealthTrend(
  scans: Array<{ scannedAt: Date; hasChanges: boolean }>,
  logs: Array<{ calledAt: Date; resultQuality: string | null }>
): number[] {
  if (logs.length === 0) return [50, 55, 60, 65, 70, 72, 75, 78, 80, 82, 85, 85];
  const sorted = [...logs].sort((a, b) => a.calledAt.getTime() - b.calledAt.getTime());
  const buckets = 12;
  const chunks: number[][] = Array.from({ length: buckets }, () => []);
  const first = sorted[0].calledAt.getTime();
  const last = sorted[sorted.length - 1].calledAt.getTime();
  const span = Math.max(1, last - first);
  for (const log of sorted) {
    if (!log.resultQuality) continue;
    const idx = Math.min(buckets - 1, Math.floor(((log.calledAt.getTime() - first) / span) * buckets));
    chunks[idx].push(log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0);
  }
  // Carry-forward empty buckets so the sparkline looks smooth.
  let lastVal = 0.6;
  return chunks.map((scores) => {
    if (scores.length === 0) return Math.round(lastVal * 100);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    lastVal = avg;
    return Math.round(avg * 100);
  });
}

function formatScanDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  })
    .format(date)
    .replace(",", "")} UTC`;
}

// ── hero ─────────────────────────────────────────────────────────

type HeroProps = {
  name: string;
  baseUrl: string;
  category: string | null;
  tagline: string | null;
  hq: string | null;
  founded: number | null;
  employees: string | null;
  fundingM: number | null;
  health: number;
  trend: number[];
  changeCount: number;
  surfaces: number;
  threatLevel: string | null;
  historyHref: string;
};

function Hero({
  name,
  baseUrl,
  category,
  tagline,
  hq,
  founded,
  employees,
  fundingM,
  health,
  trend,
  changeCount,
  surfaces,
  threatLevel,
  historyHref
}: HeroProps) {
  const color = rdsHealthColor(health);
  const facts = [hq, founded ? `Founded ${founded}` : null, employees, fundingM ? `$${fundingM}M raised` : null].filter(
    (x): x is string => Boolean(x)
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.3fr 1fr",
        gap: 40,
        paddingBottom: 24,
        borderBottom: "1px solid var(--paper-rule-2)",
        marginBottom: 28
      }}
    >
      <div>
        <RDSKicker hot>{category ? `DOSSIER · ${category.toUpperCase()}` : "DOSSIER"}</RDSKicker>
        <h1
          style={{
            fontSize: 64,
            lineHeight: 0.95,
            margin: "8px 0 0",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            fontFamily: "var(--font-serif)"
          }}
        >
          {name}
        </h1>
        <HeroUrl rawUrl={baseUrl} />
        {tagline && (
          <div
            style={{
              fontSize: 17,
              color: "var(--ink-2)",
              marginTop: 10,
              fontStyle: "italic",
              textWrap: "pretty",
              maxWidth: 520
            }}
          >
            {tagline}
          </div>
        )}
        {facts.length > 0 && (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-mute)",
              letterSpacing: "0.02em",
              lineHeight: 1.6
            }}
          >
            {facts.map((f) => (
              <span
                key={f}
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  background: "var(--paper-tint)",
                  whiteSpace: "nowrap"
                }}
              >
                {f}
              </span>
            ))}
          </div>
        )}
        <Link
          href={historyHref}
          style={{
            marginTop: 14,
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "var(--accent)",
            textDecoration: "underline",
            display: "inline-block"
          }}
        >
          View history →
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            background: "var(--ink-bg)",
            color: "var(--ink-bg-text)",
            padding: "18px 22px"
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color
            }}
          >
            {health}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--ink-ghost)",
              marginTop: 2,
              marginBottom: 10
            }}
          >
            HEALTH SCORE
          </div>
          <RDSMiniLine data={trend} color={color} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <HeroStat label="changes · 24h" value={changeCount} />
          <HeroStat label="surfaces tracked" value={surfaces} />
          <HeroStat label="threat tier" value={rdsTierLabel(threatLevel)} />
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--ink)", paddingTop: 8 }}>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--ink-faint)",
          marginTop: 2
        }}
      >
        {label}
      </div>
    </div>
  );
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function HeroUrl({ rawUrl }: { rawUrl: string }) {
  const safe = toSafeHttpUrl(rawUrl);
  const label = prettyUrl(rawUrl);
  const baseStyle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    marginTop: 6,
    display: "inline-block"
  };
  if (!safe) {
    // Baseurl failed the http(s) sanity check — render as inert text, never
    // as a clickable link. A compromised or malformed baseUrl must not become
    // a click-to-execute vector.
    return <span style={{ ...baseStyle, color: "var(--ink-faint)" }}>{label}</span>;
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...baseStyle,
        color: "var(--accent)",
        textDecoration: "none",
        borderBottom: "1px dotted var(--accent)"
      }}
    >
      {label}
    </a>
  );
}

// ── Intelligence Brief ───────────────────────────────────────────

function IntelligenceBriefSection({ brief }: { brief: Record<string, unknown> }) {
  const threatLevel = typeof brief.threat_level === "string" ? brief.threat_level : null;
  const summary = typeof brief.threat_reasoning === "string" ? brief.threat_reasoning : null;
  const watchList = Array.isArray(brief.watch_list)
    ? (brief.watch_list as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const opportunities: Array<{ key: string; label: string; body: string | null }> = [
    {
      key: "positioning_opportunity",
      label: "POSITIONING OPPORTUNITY",
      body: typeof brief.positioning_opportunity === "string" ? brief.positioning_opportunity : null
    },
    {
      key: "content_opportunity",
      label: "CONTENT OPPORTUNITY",
      body: typeof brief.content_opportunity === "string" ? brief.content_opportunity : null
    },
    {
      key: "product_opportunity",
      label: "PRODUCT OPPORTUNITY",
      body: typeof brief.product_opportunity === "string" ? brief.product_opportunity : null
    }
  ];

  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Intelligence Brief" count={threatLevel ? `${threatLevel.toUpperCase()} THREAT` : null} />
      {summary && (
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--ink)",
            textWrap: "pretty",
            margin: "0 0 18px",
            paddingLeft: 16,
            borderLeft: "3px solid var(--accent-hot)"
          }}
        >
          {summary}
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {opportunities.map((op) => (
          <div
            key={op.key}
            style={{
              background: "var(--paper-tint)",
              padding: "16px 18px",
              border: "1px solid var(--paper-rule)"
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--accent)",
                fontWeight: 700,
                marginBottom: 8
              }}
            >
              {op.label}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)", textWrap: "pretty" }}>
              {op.body ?? "Not yet synthesized."}
            </p>
          </div>
        ))}
      </div>
      {watchList.length > 0 && (
        <div
          style={{
            marginTop: 20,
            background: "var(--ink-bg)",
            color: "var(--ink-bg-text)",
            padding: "20px 24px"
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              color: "var(--ink-ghost)",
              marginBottom: 12
            }}
          >
            WATCH LIST
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {watchList.map((item, i) => (
              <li key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: "1px solid var(--ink-2)" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--ink-ghost)",
                    width: 24,
                    flexShrink: 0,
                    paddingTop: 2
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 14.5, lineHeight: 1.5, textWrap: "pretty" }}>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Homepage section ─────────────────────────────────────────────

function HomepageSection({
  data,
  scan,
  health
}: {
  data: HomepageData | null;
  scan: { scannedAt: Date } | null;
  health: number | null;
}) {
  if (!data) {
    return (
      <div style={{ marginTop: 36 }}>
        <RDSSectionHead title="Homepage" count={health != null ? `${health}% SCHEMA` : null} />
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}>No homepage scan data yet.</p>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Homepage" count={health != null ? `${health}% SCHEMA` : null} />
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32 }}>
        <div>
          {data.primary_cta_text && (
            <>
              <KVLabel>PRIMARY CTA</KVLabel>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "var(--ink)",
                  fontFamily: "var(--font-serif)"
                }}
              >
                “{data.primary_cta_text}”
              </div>
            </>
          )}
          {data.primary_tagline && (
            <>
              <KVLabel style={{ marginTop: 18 }}>HEADLINE</KVLabel>
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: "4px 0 0",
                  letterSpacing: "-0.01em"
                }}
              >
                {data.primary_tagline}
              </h3>
            </>
          )}
          {data.positioning_statement && (
            <>
              <KVLabel style={{ marginTop: 18 }}>POSITIONING STATEMENT</KVLabel>
              <p style={{ margin: "4px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}>
                {data.positioning_statement}
              </p>
            </>
          )}
          {data.social_proof_summary && (
            <>
              <KVLabel style={{ marginTop: 18 }}>SOCIAL PROOF</KVLabel>
              <p style={{ margin: "4px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}>
                {data.social_proof_summary}
              </p>
            </>
          )}
        </div>
        <div style={{ borderLeft: "1px solid var(--paper-rule-2)", paddingLeft: 24 }}>
          {data.key_differentiators && data.key_differentiators.length > 0 && (
            <>
              <KVLabel>KEY DIFFERENTIATORS</KVLabel>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.key_differentiators.map((d, i) => (
                  <li key={i} style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 3 }}>
                    {d}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.target_audience_stated && (
            <>
              <KVLabel style={{ marginTop: 18 }}>TARGET AUDIENCE</KVLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span
                  style={{
                    padding: "3px 9px",
                    background: "var(--paper-tint)",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  {data.target_audience_stated}
                </span>
              </div>
            </>
          )}
          {data.nav_primary_items && data.nav_primary_items.length > 0 && (
            <>
              <KVLabel style={{ marginTop: 18 }}>PRIMARY NAV</KVLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.nav_primary_items.map((item) => (
                  <span
                    key={item}
                    style={{
                      padding: "3px 9px",
                      border: "1px solid var(--paper-rule-2)",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </>
          )}
          <div
            style={{
              marginTop: 18,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-faint)",
              letterSpacing: "0.08em"
            }}
          >
            Last scanned: {formatScanDate(scan?.scannedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function KVLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.14em",
        color: "var(--ink-faint)",
        fontWeight: 600,
        marginBottom: 6,
        ...style
      }}
    >
      {children}
    </div>
  );
}

// ── Profile section ──────────────────────────────────────────────

function ProfileSection({ data }: { data: ProfileData | null }) {
  if (!data) {
    return (
      <div style={{ marginTop: 36 }}>
        <RDSSectionHead title="Profile" />
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}>No profile scan data available.</p>
      </div>
    );
  }
  const leadership = (data.key_leadership ?? []).filter((l) => l && (l.name || l.title));
  const partnerships = data.recent_partnerships ?? [];
  const awards = data.recent_awards_or_recognition ?? [];
  const useCases = data.use_cases_stated ?? [];
  const customers = data.customer_logos ?? [];
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Profile" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 32,
          paddingBottom: 20,
          borderBottom: "1px dotted var(--paper-rule-2)"
        }}
      >
        <div>
          {data.mission_statement && (
            <>
              <KVLabel>MISSION</KVLabel>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)", textWrap: "pretty" }}>
                {data.mission_statement}
              </p>
            </>
          )}
          {data.positioning && (
            <>
              <KVLabel style={{ marginTop: 18 }}>POSITIONING</KVLabel>
              <p
                style={{
                  margin: 0,
                  fontSize: 15.5,
                  lineHeight: 1.55,
                  fontStyle: "italic",
                  color: "var(--ink)",
                  textWrap: "pretty"
                }}
              >
                “{data.positioning}”
              </p>
            </>
          )}
          <KVLabel style={{ marginTop: 18 }}>RECENT PARTNERSHIPS</KVLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {partnerships.length > 0 ? (
              partnerships.map((p) => (
                <span
                  key={p}
                  style={{
                    padding: "3px 9px",
                    border: "1px solid var(--paper-rule-2)",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12
                  }}
                >
                  {p}
                </span>
              ))
            ) : (
              <EmptyInline>Not indexed</EmptyInline>
            )}
          </div>
          <KVLabel style={{ marginTop: 18 }}>AWARDS / RECOGNITION</KVLabel>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {awards.length > 0 ? (
              awards.map((a, i) => (
                <li key={i} style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 3 }}>
                  {a}
                </li>
              ))
            ) : (
              <li style={{ listStyle: "none", marginLeft: -18 }}>
                <EmptyInline>Not indexed</EmptyInline>
              </li>
            )}
          </ul>
        </div>
        <div>
          <KVLabel>KEY LEADERSHIP</KVLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {leadership.length > 0 ? (
              leadership.map((leader, i) => {
                const name = typeof leader.name === "string" ? leader.name : "—";
                const initials =
                  name === "—"
                    ? "—"
                    : name
                        .split(" ")
                        .map((n) => n[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("");
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      background: "var(--paper-tint)"
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "var(--ink)",
                        color: "var(--ink-bg-text)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
                      {leader.title && (
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--ink-faint)",
                            marginTop: 1
                          }}
                        >
                          {leader.title}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyInline>Not indexed</EmptyInline>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 20 }}>
        <div>
          <KVLabel>USE CASES STATED</KVLabel>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {useCases.length > 0 ? (
              useCases.map((u, i) => (
                <li key={i} style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 3 }}>
                  {u}
                </li>
              ))
            ) : (
              <li style={{ listStyle: "none", marginLeft: -18 }}>
                <EmptyInline>Not indexed</EmptyInline>
              </li>
            )}
          </ul>
          <KVLabel style={{ marginTop: 14 }}>TARGET INDUSTRIES</KVLabel>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--ink)", textWrap: "pretty" }}>
            {data.target_industries && data.target_industries.length > 0
              ? data.target_industries.join(", ")
              : "Not stated"}
          </p>
        </div>
        <div>
          <KVLabel>COMPANY INFO</KVLabel>
          <KV row="Founded" value={data.founded_year != null ? String(data.founded_year) : "—"} />
          <KV row="Team size" value={data.team_size_stated ?? "—"} />
          <KV
            row="Offices"
            value={
              data.offices_or_locations && data.offices_or_locations.length > 0
                ? data.offices_or_locations.join(", ")
                : "—"
            }
          />
          <KV row="Target co. size" value={data.target_company_size ?? "—"} />
          <KVLabel style={{ marginTop: 14 }}>NAMED CUSTOMERS</KVLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {customers.length > 0 ? (
              customers.map((c) => (
                <span
                  key={c}
                  style={{
                    padding: "3px 9px",
                    background: "var(--paper-tint)",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  {c}
                </span>
              ))
            ) : (
              <EmptyInline>None extracted</EmptyInline>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ row, value }: { row: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 0",
        borderBottom: "1px dotted var(--paper-rule-2)"
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-faint)" }}>{row}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function EmptyInline({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-ghost)", fontStyle: "italic" }}>
      {children}
    </span>
  );
}

// ── Reviews section ──────────────────────────────────────────────

function ReviewsSection({
  scans,
  qualityByType
}: {
  scans: Array<{
    id: string;
    pageId: string;
    scannedAt: Date;
    rawResult: unknown;
    page: { label: string; type: string | null };
  }>;
  qualityByType: Map<string, number[]>;
}) {
  const primary = scans[0];
  if (!primary) {
    return (
      <div style={{ marginTop: 36 }}>
        <RDSSectionHead title="Reviews" />
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}>
          No reviews scan data available. Add a G2, Capterra, or Product Hunt page to start.
        </p>
      </div>
    );
  }
  const data = asObject<ReviewsData>(primary.rawResult);
  const health = healthFor(qualityByType, "reviews");
  const platform = data?.platform ?? primary.page.label;
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Reviews" count={`${platform.toUpperCase()}${health != null ? ` · ${health}%` : ""}`} />
      <p
        style={{
          margin: "0 0 16px",
          padding: "10px 14px",
          background: "var(--paper-tint)",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--ink-2)",
          fontStyle: "italic"
        }}
      >
        G2, Capterra, Trustpilot, ProductHunt — review sites actively block scraping. <code>content_blocked</code> logs
        here are expected and high-value experience-logging signals.
      </p>
      {data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 28 }}>
            <div style={{ background: "var(--ink-bg)", color: "var(--ink-bg-text)", padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>
                  {data.overall_rating != null ? data.overall_rating.toFixed(1) : "—"}
                </span>
                <span style={{ color: "#e6a24a", fontSize: 18, letterSpacing: "2px" }}>
                  {data.overall_rating != null
                    ? "★".repeat(Math.round(data.overall_rating)) + "☆".repeat(5 - Math.round(data.overall_rating))
                    : ""}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-ghost)",
                  marginTop: 2
                }}
              >
                {data.review_count != null ? `${data.review_count.toLocaleString()} reviews` : "— reviews"}
              </div>
              {(data.ease_of_use_score != null || data.customer_support_score != null) && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--ink-2)" }}>
                  {data.ease_of_use_score != null && <SubScore k="Ease of Use" v={data.ease_of_use_score.toFixed(1)} />}
                  {data.customer_support_score != null && (
                    <SubScore k="Support" v={data.customer_support_score.toFixed(1)} />
                  )}
                </div>
              )}
              {data.recommended_percentage != null && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--ink-2)" }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#e66a5a", marginRight: 6 }}>
                    {data.recommended_percentage}%
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ink-ghost)" }}>of reviewers recommend</span>
                </div>
              )}
              <div
                style={{
                  marginTop: 14,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--ink-faint)",
                  letterSpacing: "0.06em"
                }}
              >
                Scanned: {primary.scannedAt.toISOString().slice(0, 10)}
              </div>
            </div>
            <div>
              <KVLabel>TOP PRAISE</KVLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.top_praise_themes && data.top_praise_themes.length > 0 ? (
                  data.top_praise_themes.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: "4px 10px",
                        background: "#f0f4e8",
                        border: "1px solid #c4d0a8",
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                        color: "#3a5a3a"
                      }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <EmptyInline>None extracted</EmptyInline>
                )}
              </div>
              <KVLabel style={{ marginTop: 14, color: "var(--accent-hot)" }}>
                TOP COMPLAINTS · HIGHEST-SIGNAL FIELD
              </KVLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.top_complaint_themes && data.top_complaint_themes.length > 0 ? (
                  data.top_complaint_themes.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: "4px 10px",
                        background: "#fff0ec",
                        border: "1px solid #e8c4b0",
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                        color: "#7a2a1a"
                      }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <EmptyInline>None extracted</EmptyInline>
                )}
              </div>
            </div>
          </div>
          {data.recent_reviews && data.recent_reviews.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <KVLabel>RECENT REVIEWS</KVLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.recent_reviews.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "12px 16px",
                      background: "#fff",
                      border: "1px solid var(--paper-rule)"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "baseline",
                        marginBottom: 4
                      }}
                    >
                      {r.rating != null && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#e6a24a"
                          }}
                        >
                          {r.rating.toFixed(1)} ★
                        </span>
                      )}
                      {r.date && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-faint)"
                          }}
                        >
                          {r.date}
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: "var(--ink)",
                        fontStyle: "italic",
                        textWrap: "pretty"
                      }}
                    >
                      {r.summary ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}>
          No data extracted yet — last scan may have been blocked.
        </p>
      )}
    </div>
  );
}

function SubScore({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "var(--ink-ghost)" }}>{k}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{v}</span>
    </div>
  );
}

// ── Blog section ─────────────────────────────────────────────────

function BlogSection({
  data,
  scan,
  health,
  baseUrl
}: {
  data: BlogData | null;
  scan: { scannedAt: Date } | null;
  health: number | null;
  baseUrl: string;
}) {
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead
        title="Blog"
        count={
          health != null
            ? `${health}% SCHEMA${scan ? ` · SCANNED ${scan.scannedAt.toISOString().slice(0, 10)}` : ""}`
            : null
        }
      />
      <p
        style={{
          margin: "0 0 16px",
          padding: "10px 14px",
          background: "var(--paper-tint)",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--ink-2)",
          fontStyle: "italic"
        }}
      >
        Content strategy signals — topics, audience focus, and publishing cadence.
      </p>
      {data == null ? (
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic", margin: 0 }}>No blog scan data available yet.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            <BlogStat label="POST FREQUENCY" value={data.post_frequency ?? "unknown"} />
            <BlogStat
              label="AUDIENCE FOCUS"
              value={
                data.developer_focused === undefined
                  ? "Unknown"
                  : data.developer_focused
                    ? "Developer-focused"
                    : "Buyer-focused"
              }
            />
            <BlogStat label="RECENT POSTS INDEXED" value={String(data.recent_post_titles?.length ?? 0)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32 }}>
            <div>
              <KVLabel>PRIMARY TOPICS</KVLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.primary_topics && data.primary_topics.length > 0 ? (
                  data.primary_topics.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: "4px 10px",
                        background: "var(--ink)",
                        color: "var(--ink-bg-text)",
                        fontFamily: "var(--font-sans)",
                        fontSize: 12,
                        fontWeight: 500
                      }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <EmptyInline>None extracted</EmptyInline>
                )}
              </div>

              <KVLabel style={{ marginTop: 18 }}>RECENT POSTS</KVLabel>
              <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {data.recent_post_titles && data.recent_post_titles.length > 0 ? (
                  data.recent_post_titles.map((title, i) => {
                    const safeUrl = toSafeHttpUrl(data.recent_post_urls?.[i], baseUrl);
                    return (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          gap: 14,
                          padding: "8px 0",
                          borderBottom: "1px dotted var(--paper-rule-2)"
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-faint)",
                            width: 80,
                            flexShrink: 0,
                            paddingTop: 2
                          }}
                        >
                          {data.recent_post_dates?.[i] ?? "—"}
                        </span>
                        {safeUrl ? (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 14,
                              color: "var(--ink)",
                              textDecoration: "none",
                              borderBottom: "1px dotted var(--accent)",
                              lineHeight: 1.4
                            }}
                          >
                            {title}
                          </a>
                        ) : (
                          <span style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.4 }}>{title}</span>
                        )}
                      </li>
                    );
                  })
                ) : (
                  <li style={{ listStyle: "none" }}>
                    <EmptyInline>None indexed</EmptyInline>
                  </li>
                )}
              </ol>
            </div>
            <div>
              <KVLabel>CATEGORIES / TAGS</KVLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, lineHeight: 1.6 }}>
                {data.visible_categories && data.visible_categories.length > 0 ? (
                  data.visible_categories.map((c) => (
                    <span
                      key={c}
                      style={{
                        padding: "2px 8px",
                        border: "1px solid var(--paper-rule-2)",
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                        color: "var(--ink-2)"
                      }}
                    >
                      {c}
                    </span>
                  ))
                ) : (
                  <EmptyInline>None extracted</EmptyInline>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BlogStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "14px 16px", background: "var(--paper-tint)", borderLeft: "3px solid var(--accent)" }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: "var(--ink-faint)",
          marginTop: 2
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Section health grid ──────────────────────────────────────────

function SectionHealth({ list }: { list: Array<{ name: string; pct: number }> }) {
  if (list.length === 0) return null;
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Section Health" count={`${list.length} SURFACES`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {list.map((s) => {
          const color = s.pct >= 85 ? "var(--ok)" : s.pct >= 60 ? "var(--warn)" : "var(--accent-hot)";
          return (
            <div
              key={s.name}
              style={{ padding: "12px 14px", border: "1px solid var(--paper-rule)", background: "#fff" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{s.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color }}>{s.pct}%</span>
              </div>
              <div style={{ height: 4, background: "var(--paper-rule)", marginTop: 8 }}>
                <div style={{ height: "100%", width: `${s.pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Latest scans ─────────────────────────────────────────────────

function LatestScansSection({
  scans
}: {
  scans: Array<{
    id: string;
    scannedAt: Date;
    hasChanges: boolean;
    diffSummary: string | null;
    page: { label: string; type: string | null };
  }>;
}) {
  if (scans.length === 0) return null;
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Latest Scans" count={`${scans.length} PAGES`} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {scans.map((s) => (
          <div
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 120px",
              gap: 16,
              padding: "12px 14px",
              alignItems: "center",
              borderBottom: "1px solid var(--paper-rule)"
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{s.page.label}</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  color: "var(--ink-faint)",
                  marginTop: 1
                }}
              >
                {s.page.type ?? "unknown"}
              </div>
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: "var(--ink-2)",
                fontStyle: "italic",
                textWrap: "pretty"
              }}
            >
              {s.diffSummary ?? "No diff summary recorded."}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: s.hasChanges ? "var(--accent-hot)" : "var(--ink-faint)",
                padding: "4px 10px",
                border: `1px solid ${s.hasChanges ? "var(--accent-hot)" : "var(--paper-rule-2)"}`,
                textAlign: "center",
                fontWeight: 600
              }}
            >
              {s.hasChanges ? "CHANGED" : "NO CHANGES"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Logs ─────────────────────────────────────────────────────────

function LogsSection({
  logs
}: {
  logs: Array<{
    id: string;
    calledAt: Date;
    endpoint: string;
    status: string;
    resultQuality: string | null;
    fallbackTriggered: boolean;
    missingFields: string[];
    isDemo: boolean;
    page?: { label?: string | null } | null;
  }>;
}) {
  if (logs.length === 0) return null;
  const widths = "180px 130px 120px 70px 70px 70px 1fr 40px";
  return (
    <div style={{ marginTop: 36 }}>
      <RDSSectionHead title="Logs" count={`LATEST ${logs.length}`} />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          background: "#fff",
          border: "1px solid var(--paper-rule)"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: widths,
            gap: 8,
            padding: "8px 12px",
            background: "var(--paper-tint)",
            borderBottom: "1px solid var(--paper-rule-2)",
            color: "var(--ink-faint)",
            letterSpacing: "0.08em",
            fontSize: 10,
            fontWeight: 700
          }}
        >
          <span>WHEN</span>
          <span>PAGE</span>
          <span>ENDPOINT</span>
          <span>STATUS</span>
          <span>QUALITY</span>
          <span>FALLBACK</span>
          <span>MISSING FIELDS</span>
          <span>DEMO</span>
        </div>
        {logs.map((l) => {
          const q = l.resultQuality ?? "—";
          const qColor = q === "full" ? "var(--ok)" : q === "partial" ? "var(--warn)" : "var(--accent-hot)";
          const statusColor = l.status === "success" ? "var(--ok)" : "var(--accent-hot)";
          const missing = l.missingFields.length === 0 ? "none" : l.missingFields.join(", ");
          return (
            <div
              key={l.id}
              style={{
                display: "grid",
                gridTemplateColumns: widths,
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px dotted var(--paper-rule)",
                color: "var(--ink)"
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatLogTime(l.calledAt)}
              </span>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.page?.label ?? "Demo / Unknown"}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.endpoint}</span>
              <span style={{ color: statusColor, fontWeight: 600 }}>{l.status}</span>
              <span style={{ color: qColor, fontWeight: 600 }}>{q}</span>
              <span>{l.fallbackTriggered ? "yes" : "no"}</span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: missing === "none" ? "var(--ink-faint)" : "var(--accent-hot)"
                }}
              >
                {missing}
              </span>
              <span>{l.isDemo ? "yes" : "no"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLogTime(d: Date): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC"
    })
      .format(d)
      .replace(",", "") + " UTC"
  );
}

// ── Footer bar ───────────────────────────────────────────────────

function DetailFooter() {
  return (
    <div
      style={{
        marginTop: 40,
        paddingTop: 18,
        borderTop: "1px solid var(--ink)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          color: "var(--accent)",
          textDecoration: "underline"
        }}
      >
        ← Back to briefing
      </Link>
    </div>
  );
}
