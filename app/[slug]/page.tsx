import { notFound } from "next/navigation";

import { SchemaHealthBadge } from "@/components/competitor/SchemaHealthBadge";
import { LogsTable } from "@/components/logs/LogsTable";
import { prisma } from "@/lib/db/client";
import type { BlogData } from "@/lib/schemas/blog";
import type { ProfileData } from "@/lib/schemas/profile";
import type { ReviewsData } from "@/lib/schemas/reviews";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

function renderStars(rating: number): string {
  const bounded = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
  const full = Math.floor(bounded);
  const half = bounded - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function toSafeExternalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // ignore invalid/untrusted URL values from extracted payloads
  }
  return null;
}

function hasMeaningfulReviewsData(data: ReviewsData | null): boolean {
  if (!data) return false;
  if (typeof data.overall_rating === "number") return true;
  if (typeof data.review_count === "number") return true;
  if ((data.top_praise_themes?.length ?? 0) > 0) return true;
  if ((data.top_complaint_themes?.length ?? 0) > 0) return true;
  if ((data.recent_reviews?.length ?? 0) > 0) return true;
  if (typeof data.recommended_percentage === "number") return true;
  return false;
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

  // Collect all reviews-type latest scans (one per review page/platform).
  const reviewsScans = latestScans.filter((scan) => scan.page.type === "reviews");

  // For each reviews page, determine if the most recent log shows content_blocked.
  // Build a map: pageId -> contentBlocked (from the latest log for that page).
  const reviewsPageIds = reviewsScans.map((s) => s.pageId);
  const latestReviewsLogs = new Map<string, boolean>();
  for (const pageId of reviewsPageIds) {
    const latestLog = logs.find((log) => log.pageId === pageId);
    if (latestLog) {
      latestReviewsLogs.set(pageId, latestLog.contentBlocked);
    }
  }

  // For manual field staleness: if a reviews scan for g2 or capterra has succeeded
  // within the last 7 days, suppress the "manual field is stale" warning.
  // We detect platform from the extracted rawResult.platform field.
  const now = Date.now();
  const suppressStaleWarningPlatforms = new Set<string>();
  for (const scan of reviewsScans) {
    const data = scan.rawResult && typeof scan.rawResult === "object" ? (scan.rawResult as ReviewsData) : null;
    const platform = data?.platform?.toLowerCase() ?? "";
    const isRecentSuccess = now - scan.scannedAt.getTime() < SEVEN_DAYS_MS;
    if (isRecentSuccess && (platform.includes("g2") || platform.includes("capterra"))) {
      suppressStaleWarningPlatforms.add(platform);
    }
  }

  // Detect previous reviews scan per page for diff highlighting.
  // For simplicity, we use the second occurrence of each pageId in the scans array.
  const previousReviewsScanByPageId = new Map<string, (typeof scans)[number]>();
  const seenReviewsPageIds = new Set<string>();
  for (const scan of scans) {
    if (scan.page.type !== "reviews") continue;
    if (!seenReviewsPageIds.has(scan.pageId)) {
      seenReviewsPageIds.add(scan.pageId);
      // This is the latest — skip; we want the previous one.
      continue;
    }
    if (!previousReviewsScanByPageId.has(scan.pageId)) {
      previousReviewsScanByPageId.set(scan.pageId, scan);
    }
  }

  // Blog scan data for the Blog tab.
  const blogScan = latestScans.find((scan) => scan.page.type === "blog");
  const blogData =
    blogScan && blogScan.rawResult && typeof blogScan.rawResult === "object" ? (blogScan.rawResult as BlogData) : null;

  // Detect previous scan for the same blog page to avoid cross-page comparisons.
  const previousBlogScan = blogScan
    ? scans.find((scan) => scan.page.type === "blog" && scan.pageId === blogScan.pageId && scan.id !== blogScan.id)
    : null;
  const previousBlogData =
    previousBlogScan?.rawResult && typeof previousBlogScan.rawResult === "object"
      ? (previousBlogScan.rawResult as BlogData)
      : null;

  // Blog diff signals
  const blogAudienceFlipped =
    previousBlogData !== null &&
    blogData?.developer_focused !== undefined &&
    previousBlogData.developer_focused !== undefined &&
    blogData.developer_focused !== previousBlogData.developer_focused;

  const CADENCE_RANK: Record<string, number> = {
    daily: 7,
    "2-3x per week": 5,
    weekly: 4,
    "2-3x per month": 3,
    monthly: 2,
    sporadic: 1,
    unknown: 0
  };

  const blogFrequencyIncreased =
    previousBlogData?.post_frequency !== undefined &&
    blogData?.post_frequency !== undefined &&
    blogData.post_frequency !== previousBlogData.post_frequency &&
    (CADENCE_RANK[blogData.post_frequency] ?? 0) > (CADENCE_RANK[previousBlogData.post_frequency] ?? 0);

  const prevTopicsSet = new Set(previousBlogData?.primary_topics ?? []);
  const newBlogTopics = (blogData?.primary_topics ?? []).filter((topic) => !prevTopicsSet.has(topic));

  // Blog schema health from logs
  const blogPageLogs = blogScan ? logs.filter((log) => log.pageId === blogScan.pageId) : [];
  const blogHealthScore =
    blogPageLogs.length === 0
      ? null
      : blogPageLogs.reduce((acc, log) => {
          const s = log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0;
          return acc + s;
        }, 0) / blogPageLogs.length;

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

      {/* ── Reviews Tab ─────────────────────────────────────────────────────── */}
      <section className="panel">
        <header className="panel-header">
          <h2>Reviews</h2>
          <p className="muted panel-header-note">
            G2, Capterra, Trustpilot, ProductHunt — review sites actively block scraping. <code>content_blocked</code>{" "}
            logs here are expected and high-value experience-logging signals.
          </p>
        </header>

        {reviewsScans.length === 0 ? (
          <p className="muted">No reviews scan data available. Add a G2, Capterra, or Trustpilot page to start.</p>
        ) : (
          <div className="reviews-platform-tabs">
            {reviewsScans.map((scan) => {
              const latestData =
                scan.rawResult && typeof scan.rawResult === "object" ? (scan.rawResult as ReviewsData) : null;
              const isBlocked = latestReviewsLogs.get(scan.pageId) ?? false;
              const prevScan = previousReviewsScanByPageId.get(scan.pageId);
              const prevData =
                prevScan?.rawResult && typeof prevScan.rawResult === "object"
                  ? (prevScan.rawResult as ReviewsData)
                  : null;
              const usePreviousData =
                isBlocked && !hasMeaningfulReviewsData(latestData) && hasMeaningfulReviewsData(prevData);
              const data = usePreviousData ? prevData : latestData;

              // Diff flags
              const ratingChanged =
                !usePreviousData &&
                prevData?.overall_rating != null &&
                data?.overall_rating != null &&
                Math.abs(data.overall_rating - prevData.overall_rating) > 0.1;

              const prevComplaintSet = new Set(prevData?.top_complaint_themes ?? []);
              const newComplaints = (data?.top_complaint_themes ?? []).filter((theme) => !prevComplaintSet.has(theme));
              const complaintsChanged = !usePreviousData && newComplaints.length > 0;

              // Platform label — prefer extracted platform, fall back to page label.
              const platformLabel = data?.platform ?? scan.page.label;

              // Schema health from logs for this page.
              const pageLogsForHealth = logs.filter((log) => log.pageId === scan.pageId);
              const healthScore =
                pageLogsForHealth.length === 0
                  ? null
                  : pageLogsForHealth.reduce((acc, log) => {
                      const s = log.resultQuality === "full" ? 1 : log.resultQuality === "partial" ? 0.5 : 0;
                      return acc + s;
                    }, 0) / pageLogsForHealth.length;

              return (
                <article key={scan.pageId} className="reviews-platform-card panel-sub">
                  <header className="reviews-platform-header">
                    <h3>{platformLabel}</h3>
                    {healthScore !== null && (
                      <SchemaHealthBadge score={healthScore} label={`${platformLabel} schema`} />
                    )}
                    <span className="muted scan-timestamp">
                      Last scanned: {scan.scannedAt.toISOString().slice(0, 10)}
                    </span>
                  </header>

                  {/* Blocked scan banner */}
                  {isBlocked && (
                    <div className="blocked-banner" role="alert">
                      Last scan was blocked by {platformLabel}.{" "}
                      {usePreviousData ? "Showing the previous available scan data." : "Recent data may be incomplete."}
                    </div>
                  )}

                  {data ? (
                    <>
                      {/* Rating row */}
                      <div className="reviews-rating-row">
                        <span
                          className={`reviews-rating-score${ratingChanged ? " diff-highlight diff-highlight--amber" : ""}`}
                        >
                          {data.overall_rating != null ? data.overall_rating.toFixed(1) : "—"}
                        </span>
                        <span className="reviews-stars" aria-hidden="true">
                          {data.overall_rating != null ? renderStars(data.overall_rating) : ""}
                        </span>
                        <span className="reviews-count muted">
                          {data.review_count != null ? `${data.review_count.toLocaleString()} reviews` : ""}
                        </span>
                        {ratingChanged && prevData?.overall_rating != null && (
                          <span className="diff-badge diff-badge--amber">was {prevData.overall_rating.toFixed(1)}</span>
                        )}
                      </div>

                      {/* Sub-scores */}
                      {(data.ease_of_use_score != null || data.customer_support_score != null) && (
                        <div className="reviews-subscores-row">
                          {data.ease_of_use_score != null && (
                            <div className="reviews-subscore">
                              <span className="reviews-subscore-label">Ease of Use</span>
                              <span className="reviews-subscore-value">{data.ease_of_use_score.toFixed(1)}</span>
                            </div>
                          )}
                          {data.customer_support_score != null && (
                            <div className="reviews-subscore">
                              <span className="reviews-subscore-label">Support</span>
                              <span className="reviews-subscore-value">{data.customer_support_score.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Recommended % */}
                      {data.recommended_percentage != null && (
                        <p className="reviews-recommended">
                          <strong>{data.recommended_percentage}%</strong> of reviewers recommend this product
                        </p>
                      )}

                      {/* Top Praise Themes */}
                      {data.top_praise_themes && data.top_praise_themes.length > 0 && (
                        <div className="reviews-themes">
                          <h4>Top Praise</h4>
                          <div className="tag-chips tag-chips--green">
                            {data.top_praise_themes.map((theme, i) => (
                              <span key={i} className="tag-chip tag-chip--green">
                                {theme}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Top Complaint Themes — visually most important */}
                      {data.top_complaint_themes && data.top_complaint_themes.length > 0 && (
                        <div className="reviews-themes reviews-themes--complaints">
                          <h4>
                            Top Complaints
                            <span className="muted signal-note"> — highest-signal field</span>
                          </h4>
                          <div className="tag-chips tag-chips--amber">
                            {data.top_complaint_themes.map((theme, i) => {
                              const isNew = complaintsChanged && newComplaints.includes(theme);
                              return (
                                <span
                                  key={i}
                                  className={`tag-chip tag-chip--amber${isNew ? " tag-chip--new diff-highlight diff-highlight--amber" : ""}`}
                                  title={isNew ? "New complaint theme since last scan" : undefined}
                                >
                                  {theme}
                                  {isNew && <span className="new-badge"> new</span>}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Recent Reviews */}
                      {data.recent_reviews && data.recent_reviews.length > 0 && (
                        <div className="reviews-recent">
                          <h4>Recent Reviews</h4>
                          <ul className="reviews-recent-list">
                            {data.recent_reviews.map((review, i) => (
                              <li key={i} className="reviews-recent-item">
                                <div className="reviews-recent-meta">
                                  {review.rating != null && (
                                    <span className="reviews-recent-rating">{review.rating.toFixed(1)} ★</span>
                                  )}
                                  {review.date && <time className="reviews-recent-date muted">{review.date}</time>}
                                </div>
                                <p className="reviews-recent-summary">{review.summary ?? "—"}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="muted">No data extracted yet — scan may have been blocked.</p>
                  )}

                  {/* Manual field staleness note */}
                  {suppressStaleWarningPlatforms.size > 0 &&
                    (() => {
                      const platform = data?.platform?.toLowerCase() ?? "";
                      if (
                        (platform.includes("g2") || platform.includes("capterra")) &&
                        suppressStaleWarningPlatforms.has(platform)
                      ) {
                        return (
                          <p className="muted staleness-note">
                            Manual field staleness warning suppressed — {platformLabel} scan succeeded within the last 7
                            days.
                          </p>
                        );
                      }
                      return null;
                    })()}

                  <div className="scan-actions">
                    <span className={`flag${scan.hasChanges ? " flag--changes" : ""}`}>
                      {scan.hasChanges ? "Changes detected" : "No changes since last scan"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {/* ── /Reviews Tab ────────────────────────────────────────────────────── */}

      {/* ── Blog Tab ────────────────────────────────────────────────────────── */}
      <section className="panel">
        <header className="panel-header">
          <h2>Blog</h2>
          <p className="muted panel-header-note">
            Content strategy signals — topics, audience focus, and publishing cadence.
          </p>
        </header>

        {blogScan == null ? (
          <p className="muted">No blog scan data available. Add a blog index page to start.</p>
        ) : (
          <div className="blog-tab">
            {/* Schema health + last scanned */}
            <div className="blog-tab-header-row">
              {blogHealthScore !== null && <SchemaHealthBadge score={blogHealthScore} label="blog schema" />}
              <span className="muted scan-timestamp">
                Last scanned: {blogScan.scannedAt.toISOString().slice(0, 10)}
              </span>
              <span className={`flag${blogScan.hasChanges ? " flag--changes" : ""}`}>
                {blogScan.hasChanges ? "Changes detected" : "No changes since last scan"}
              </span>
            </div>

            {/* Post Frequency — prominent badge at top */}
            <div className="blog-frequency-row">
              <span className="blog-frequency-label">Post Frequency</span>
              <span
                className={`badge badge--frequency${blogFrequencyIncreased ? " diff-highlight diff-highlight--amber" : ""}`}
              >
                {blogData?.post_frequency ?? "unknown"}
              </span>
              {blogFrequencyIncreased && previousBlogData?.post_frequency && (
                <span className="diff-badge diff-badge--amber">
                  was {previousBlogData.post_frequency} — cadence increase is an investment signal
                </span>
              )}
            </div>

            {/* Developer Focused badge */}
            <div className="blog-audience-row">
              <span className="blog-audience-label">Audience Focus</span>
              {blogData?.developer_focused !== undefined ? (
                <span
                  className={`badge${blogData.developer_focused ? " badge--developer" : " badge--buyer"}${blogAudienceFlipped ? " diff-highlight diff-highlight--amber" : ""}`}
                >
                  {blogData.developer_focused ? "Developer-focused" : "Buyer-focused"}
                </span>
              ) : (
                <span className="badge badge--unknown">Unknown</span>
              )}
              {blogAudienceFlipped && (
                <span className="diff-badge diff-badge--amber">audience focus shifted — strategic signal</span>
              )}
            </div>

            {/* Primary Topics */}
            {blogData?.primary_topics && blogData.primary_topics.length > 0 && (
              <div className="blog-topics">
                <h3>Primary Topics</h3>
                <div className="tag-chips">
                  {blogData.primary_topics.map((topic, i) => {
                    const isNew = newBlogTopics.includes(topic);
                    return (
                      <span
                        key={i}
                        className={`tag-chip${isNew ? " tag-chip--new diff-highlight diff-highlight--amber" : ""}`}
                        title={isNew ? "New topic since last scan" : undefined}
                      >
                        {topic}
                        {isNew && <span className="new-badge"> new</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Posts */}
            {blogData?.recent_post_titles && blogData.recent_post_titles.length > 0 && (
              <div className="blog-recent-posts">
                <h3>Recent Posts</h3>
                <ol className="blog-post-list">
                  {blogData.recent_post_titles.map((title, i) => {
                    const url = blogData.recent_post_urls?.[i];
                    const safeUrl = toSafeExternalUrl(url);
                    const date = blogData.recent_post_dates?.[i];
                    return (
                      <li key={i} className="blog-post-item">
                        <div className="blog-post-title">
                          {safeUrl ? (
                            <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                              {title}
                            </a>
                          ) : (
                            title
                          )}
                        </div>
                        {date && <time className="blog-post-date muted">{date}</time>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {/* Categories / Tags */}
            {blogData?.has_categories_or_tags &&
              blogData.visible_categories &&
              blogData.visible_categories.length > 0 && (
                <div className="blog-categories">
                  <h3>Categories / Tags</h3>
                  <div className="tag-chips tag-chips--secondary">
                    {blogData.visible_categories.map((cat, i) => (
                      <span key={i} className="tag-chip tag-chip--secondary">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {blogData == null && <p className="muted">Scan ran but no data was extracted. Check logs for details.</p>}
          </div>
        )}
      </section>
      {/* ── /Blog Tab ───────────────────────────────────────────────────────── */}

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
