import { notFound } from "next/navigation";

import { SchemaHealthBadge } from "@/components/competitor/SchemaHealthBadge";
import { LogsTable } from "@/components/logs/LogsTable";
import { prisma } from "@/lib/db/client";
import type { ProfileData } from "@/lib/schemas/profile";
import type { HomepageData } from "@/lib/schemas/homepage";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function toSafeHttpUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Invalid or non-absolute URL; do not render as clickable.
  }
  return null;
}

function computeSchemaHealthByType(
  logs: Array<{ pageType: string; resultQuality: string | null }>
): Array<{ pageType: string; score: number }> {
  const buckets = new Map<string, number[]>();
  for (const log of logs) {
    const score = log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0;
    buckets.set(log.pageType, [...(buckets.get(log.pageType) ?? []), score]);
  }

  return [...buckets.entries()]
    .map(([pageType, scores]) => ({
      pageType,
      score: scores.reduce((acc, value) => acc + value, 0) / scores.length
    }))
    .sort((a, b) => b.score - a.score);
}

export default async function CompetitorDetailPage({ params }: PageProps) {
  // TODO(auth): protect competitor detail routes before exposing a public deployment.
  const { slug } = await params;

  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    include: { pages: true }
  });

  if (!competitor) {
    notFound();
  }

  const homepagePage = competitor.pages.find((page) => page.type === "homepage") ?? null;

  const [scans, logs, homepageScans] = await Promise.all([
    prisma.scan.findMany({
      where: { page: { competitorId: competitor.id } },
      include: { page: true },
      orderBy: { scannedAt: "desc" },
      take: 100
    }),
    prisma.apiLog.findMany({
      where: { competitorId: competitor.id },
      include: { page: true },
      orderBy: { calledAt: "desc" },
      take: 200
    }),
    homepagePage
      ? prisma.scan.findMany({
          where: { pageId: homepagePage.id },
          orderBy: { scannedAt: "desc" },
          take: 2
        })
      : Promise.resolve([])
  ]);

  const seenPageIds = new Set<string>();
  const latestScans: (typeof scans)[number][] = [];
  for (const scan of scans) {
    if (seenPageIds.has(scan.pageId)) continue;
    seenPageIds.add(scan.pageId);
    latestScans.push(scan);
  }

  // Latest two homepage scans for diff highlighting, independent of the generic scan window.
  const homepageScan = homepageScans[0] ?? null;
  const previousHomepageScan = homepageScans[1] ?? null;

  const homepageData = (homepageScan?.rawResult as HomepageData | null) ?? null;
  const previousHomepageData = (previousHomepageScan?.rawResult as HomepageData | null) ?? null;
  const safeHomepageCtaUrl = toSafeHttpUrl(homepageData?.primary_cta_url);

  // Determine which high-signal fields changed since the previous homepage scan.
  const currentPrimaryTagline = normalizeOptionalText(homepageData?.primary_tagline);
  const previousPrimaryTagline = normalizeOptionalText(previousHomepageData?.primary_tagline);
  const homepageTaglineChanged = previousHomepageData !== null && currentPrimaryTagline !== previousPrimaryTagline;

  const currentSubTagline = normalizeOptionalText(homepageData?.sub_tagline);
  const previousSubTagline = normalizeOptionalText(previousHomepageData?.sub_tagline);
  const homepageSubTaglineChanged = previousHomepageData !== null && currentSubTagline !== previousSubTagline;

  const homepageKeyDifferentiatorsChanged =
    previousHomepageData !== null &&
    JSON.stringify(homepageData?.key_differentiators ?? []) !==
      JSON.stringify(previousHomepageData.key_differentiators ?? []);

  // Schema health for homepage tab badge.
  const homepageHealthScore = (() => {
    const homepageLogs = logs.filter((log) => log.page?.type === "homepage");
    if (homepageLogs.length === 0) return null;
    const total = homepageLogs.reduce((acc, log) => {
      return acc + (log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0);
    }, 0);
    return total / homepageLogs.length;
  })();

  const schemaHealth = computeSchemaHealthByType(
    logs
      .filter((log) => Boolean(log.page?.type))
      .map((log) => ({
        pageType: log.page?.type ?? "unknown",
        resultQuality: log.resultQuality
      }))
  );

  const profileScan = latestScans.find((scan) => scan.page.type === "profile");
  const profileData =
    profileScan && profileScan.rawResult && typeof profileScan.rawResult === "object"
      ? (profileScan.rawResult as ProfileData)
      : null;

  return (
    <main className="competitor-page">
      <header className="page-header">
        <h1>{competitor.name}</h1>
        <p>{competitor.baseUrl}</p>
      </header>

      <section className="panel">
        <header className="panel-header">
          <h2>Intelligence Brief</h2>
        </header>
        {competitor.intelligenceBrief ? (
          <pre className="json-view">{JSON.stringify(competitor.intelligenceBrief, null, 2)}</pre>
        ) : (
          <p className="muted">No brief generated yet.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Homepage</h2>
          {homepageHealthScore !== null && <SchemaHealthBadge score={homepageHealthScore} label="homepage" />}
        </header>
        {homepageData ? (
          <div className="homepage-tab">
            {(homepageData.primary_cta_text || homepageData.primary_cta_url) && (
              <div className="homepage-section">
                <h3 className="homepage-label">Primary CTA</h3>
                {safeHomepageCtaUrl ? (
                  <a href={safeHomepageCtaUrl} className="homepage-cta-badge" target="_blank" rel="noopener noreferrer">
                    {homepageData.primary_cta_text ?? safeHomepageCtaUrl}
                  </a>
                ) : (
                  <span className="homepage-cta-badge">
                    {homepageData.primary_cta_text ?? homepageData.primary_cta_url}
                  </span>
                )}
              </div>
            )}

            <div className="homepage-section">
              <p className={`homepage-primary-tagline${homepageTaglineChanged ? " homepage-field--changed" : ""}`}>
                {homepageData.primary_tagline ?? <span className="muted">Not captured</span>}
              </p>
              {homepageTaglineChanged && <span className="homepage-change-badge">Changed</span>}
            </div>

            {homepageData.sub_tagline && (
              <div className="homepage-section">
                <p className={`homepage-sub-tagline${homepageSubTaglineChanged ? " homepage-field--changed" : ""}`}>
                  {homepageData.sub_tagline}
                </p>
                {homepageSubTaglineChanged && <span className="homepage-change-badge">Changed</span>}
              </div>
            )}

            {homepageData.positioning_statement && (
              <div className="homepage-section">
                <h3 className="homepage-label">Positioning Statement</h3>
                <p>{homepageData.positioning_statement}</p>
              </div>
            )}

            <div className="homepage-section">
              <h3 className={`homepage-label${homepageKeyDifferentiatorsChanged ? " homepage-field--changed" : ""}`}>
                Key Differentiators
                {homepageKeyDifferentiatorsChanged && <span className="homepage-change-badge">Changed</span>}
              </h3>
              {homepageData.key_differentiators && homepageData.key_differentiators.length > 0 ? (
                <ul className="homepage-differentiators">
                  {homepageData.key_differentiators.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">None captured.</p>
              )}
            </div>

            <div className="homepage-section">
              <h3 className="homepage-label">Target Audience</h3>
              <p>{homepageData.target_audience_stated ?? <span className="muted">Not stated</span>}</p>
            </div>

            {homepageData.social_proof_summary && (
              <div className="homepage-section">
                <h3 className="homepage-label">Social Proof</h3>
                <p>{homepageData.social_proof_summary}</p>
              </div>
            )}

            {homepageData.nav_primary_items && homepageData.nav_primary_items.length > 0 && (
              <div className="homepage-section">
                <h3 className="homepage-label">Primary Nav</h3>
                <p>{homepageData.nav_primary_items.join(", ")}</p>
              </div>
            )}

            <div className="homepage-meta">
              <p className="muted">
                Last scanned:{" "}
                {homepageScan?.scannedAt
                  ? new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "UTC"
                    }).format(homepageScan.scannedAt) + " UTC"
                  : "Never"}
              </p>
            </div>
          </div>
        ) : (
          <p className="muted">{homepagePage ? "No homepage scan data yet." : "No homepage page configured."}</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Profile</h2>
        </header>
        {profileData ? (
          <div className="profile-tab">
            <dl className="profile-fields">
              <dt>Mission Statement</dt>
              <dd>{profileData.mission_statement ?? "—"}</dd>
              <dt>Positioning</dt>
              <dd>{profileData.positioning ?? "—"}</dd>
              <dt>Key Leadership</dt>
              <dd>
                {profileData.key_leadership && profileData.key_leadership.length > 0 ? (
                  <ul>
                    {profileData.key_leadership.map((leader, i) => {
                      if (!leader || typeof leader !== "object") {
                        return (
                          <li key={i} className="muted">
                            Unknown leader
                          </li>
                        );
                      }

                      const name =
                        typeof leader.name === "string" && leader.name.trim().length > 0 ? leader.name : null;
                      const title =
                        typeof leader.title === "string" && leader.title.trim().length > 0 ? leader.title : null;

                      if (!name && !title) {
                        return (
                          <li key={i} className="muted">
                            Unknown leader
                          </li>
                        );
                      }

                      return (
                        <li key={i}>
                          {name ?? "Unknown"} {title ? `— ${title}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Recent Partnerships</dt>
              <dd>
                {profileData.recent_partnerships && profileData.recent_partnerships.length > 0
                  ? profileData.recent_partnerships.join(", ")
                  : "—"}
              </dd>
              <dt>Recent Awards or Recognition</dt>
              <dd>
                {profileData.recent_awards_or_recognition && profileData.recent_awards_or_recognition.length > 0
                  ? profileData.recent_awards_or_recognition.join(", ")
                  : "—"}
              </dd>
            </dl>

            <hr className="section-divider" />

            <h3>Target Audience</h3>
            <dl className="profile-fields">
              <dt>Target Company Size</dt>
              <dd className={profileData.target_company_size ? "diff-highlight diff-highlight--amber" : ""}>
                {profileData.target_company_size ?? "—"}
              </dd>
              <dt>Target Industries</dt>
              <dd>
                {profileData.target_industries && profileData.target_industries.length > 0 ? (
                  <div className="tag-chips diff-highlight diff-highlight--amber">
                    {profileData.target_industries.map((industry, i) => (
                      <span key={i} className="tag-chip">
                        {industry}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted">Not stated</span>
                )}
              </dd>
              <dt>Use Cases Stated</dt>
              <dd>
                {profileData.use_cases_stated && profileData.use_cases_stated.length > 0 ? (
                  <ul className="diff-highlight diff-highlight--amber">
                    {profileData.use_cases_stated.map((useCase, i) => (
                      <li key={i}>{useCase}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">Not stated</span>
                )}
              </dd>
            </dl>

            <h3>Company Info</h3>
            <div className="company-info-row">
              <span>
                <strong>Founded:</strong> {profileData.founded_year != null ? String(profileData.founded_year) : "—"}
              </span>
              <span>
                <strong>Team Size:</strong> {profileData.team_size_stated ?? "—"}
              </span>
              <span>
                <strong>Offices:</strong>{" "}
                {profileData.offices_or_locations && profileData.offices_or_locations.length > 0
                  ? profileData.offices_or_locations.join(", ")
                  : "—"}
              </span>
            </div>

            {profileData.customer_logos && profileData.customer_logos.length > 0 && (
              <div className="customer-logos">
                <strong className="diff-highlight diff-highlight--amber">Named customers on About page:</strong>{" "}
                <span>{profileData.customer_logos.join(", ")}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">No profile scan data available.</p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Section Health</h2>
        </header>
        <div className="health-grid">
          {schemaHealth.length === 0 ? (
            <p className="muted">No schema health data yet.</p>
          ) : (
            schemaHealth.map((item) => (
              <SchemaHealthBadge key={item.pageType} score={item.score} label={item.pageType} />
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Latest Scans</h2>
        </header>
        <div className="scan-grid">
          {latestScans.map((scan) => (
            <article key={scan.id} className="scan-card">
              <h3>{scan.page.label}</h3>
              <p className="muted">{scan.page.type}</p>
              <p>{scan.diffSummary ?? "No diff summary recorded."}</p>
              <p className={scan.hasChanges ? "flag flag--changes" : "flag"}>
                {scan.hasChanges ? "Changes detected" : "No changes"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Logs</h2>
        </header>
        <p className="muted">Showing latest 200 log entries.</p>
        <LogsTable
          logs={logs.map((log) => ({
            id: log.id,
            calledAt: log.calledAt,
            endpoint: log.endpoint,
            status: log.status,
            resultQuality: log.resultQuality,
            fallbackTriggered: log.fallbackTriggered,
            fallbackReason: log.fallbackReason,
            missingFields: log.missingFields,
            isDemo: log.isDemo,
            pageLabel: log.page?.label ?? "Demo / Unknown"
          }))}
        />
      </section>
    </main>
  );
}
