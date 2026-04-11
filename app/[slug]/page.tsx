import { notFound } from "next/navigation";

import { SchemaHealthBadge } from "@/components/competitor/SchemaHealthBadge";
import { LogsTable } from "@/components/logs/LogsTable";
import { prisma } from "@/lib/db/client";
import type { ProfileData } from "@/lib/schemas/profile";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

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

  const [scans, logs] = await Promise.all([
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
    })
  ]);

  const seenPageIds = new Set<string>();
  const latestScans: (typeof scans)[number][] = [];
  for (const scan of scans) {
    if (seenPageIds.has(scan.pageId)) continue;
    seenPageIds.add(scan.pageId);
    latestScans.push(scan);
  }

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
                    {profileData.key_leadership.map((leader, i) => (
                      <li key={i}>
                        {leader.name} — {leader.title}
                      </li>
                    ))}
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
                <strong>Founded:</strong>{" "}
                {profileData.founded_year != null ? String(profileData.founded_year) : "—"}
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
