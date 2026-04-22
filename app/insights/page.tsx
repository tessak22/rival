import { prisma } from "@/lib/db/client";
import { getApiInsights } from "@/lib/db/api-logs";
import { InsightsFilters } from "@/components/insights/InsightsFilters";
import {
  RDSPageShell,
  RDSHeader,
  RDSFooter,
  RDSSectionHead,
  RDSStat,
  RDSKicker,
  RDSEmpty,
  RDSChip
} from "@/components/rds";

export const dynamic = "force-dynamic";

type InsightsPageProps = {
  searchParams: Promise<{
    endpoint?: string;
    competitorId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

function toDate(value?: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function safeText(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char);
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 12px",
  borderBottom: "1px solid var(--ink)",
  fontSize: "var(--fs-10)",
  letterSpacing: "var(--tr-kicker)",
  textTransform: "uppercase",
  color: "var(--ink-faint)",
  fontFamily: "var(--font-mono)",
  whiteSpace: "nowrap"
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--paper-rule)",
  fontSize: "var(--fs-12)",
  fontFamily: "var(--font-mono)",
  verticalAlign: "top",
  color: "var(--ink)"
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid var(--paper-rule)"
};

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const params = await searchParams;
  const [competitors, endpointRows] = await Promise.all([
    prisma.competitor.findMany({
      where: { isSelf: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    }),
    prisma.apiLog.findMany({
      distinct: ["endpoint"],
      orderBy: { endpoint: "asc" },
      select: { endpoint: true }
    })
  ]);

  const filters = {
    endpoint: params.endpoint || undefined,
    competitorId: params.competitorId || undefined,
    dateFrom: toDate(params.dateFrom),
    dateTo: toDate(params.dateTo)
  };

  const insights = await getApiInsights(filters);
  const successPct = Math.round(insights.successRate.successRate * 100);

  return (
    <RDSPageShell>
      <RDSHeader />

      <div style={{ marginBottom: 28 }}>
        <RDSKicker>Tabstack API</RDSKicker>
        <h1
          style={{
            margin: "6px 0 4px",
            fontSize: "var(--fs-28)",
            fontWeight: 700,
            fontFamily: "var(--font-serif)",
            letterSpacing: "var(--tr-snug)"
          }}
        >
          API Insights
        </h1>
        <p style={{ margin: 0, color: "var(--ink-mute)", fontSize: "var(--fs-14)" }}>
          Schema health and extraction quality telemetry from api_logs.
        </p>
      </div>

      {/* Top stats */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 32,
          marginBottom: 32,
          paddingBottom: 28,
          borderBottom: "1px solid var(--paper-rule)"
        }}
      >
        <RDSStat
          label="Success Rate"
          value={`${successPct}%`}
          color={successPct >= 90 ? "var(--ok)" : successPct >= 75 ? "var(--warn)" : "var(--accent-hot)"}
        />
        <RDSStat label="Total Calls" value={insights.successRate.totalCalls.toLocaleString()} />
        <RDSStat label="Successful" value={insights.successRate.successCalls.toLocaleString()} />
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 32 }}>
        <RDSSectionHead title="Filters" />
        <InsightsFilters
          endpoints={endpointRows.map((row) => row.endpoint)}
          competitors={competitors}
          initial={{
            endpoint: params.endpoint,
            competitorId: params.competitorId,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo
          }}
        />
      </div>

      {/* Missing Fields */}
      <div style={{ marginBottom: 32 }}>
        <RDSSectionHead title="Most Common Missing Fields" count={insights.missingFields.length} />
        {insights.missingFields.length === 0 ? (
          <RDSEmpty title="No missing fields" body="All schema fields are returning data." />
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Page type</th>
                <th style={th}>Field</th>
                <th style={{ ...th, textAlign: "right" }}>Missing</th>
              </tr>
            </thead>
            <tbody>
              {insights.missingFields.slice(0, 25).map((row, i) => (
                <tr key={`${row.pageType}-${row.field}-${i}`}>
                  <td style={td}>
                    <RDSChip>{safeText(row.pageType)}</RDSChip>
                  </td>
                  <td style={{ ...td, color: "var(--accent)" }}>{safeText(row.field)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{row.missingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Fallback Frequency */}
      <div style={{ marginBottom: 32 }}>
        <RDSSectionHead title="Fallback Frequency" count={insights.fallbackFrequency.length} />
        {insights.fallbackFrequency.length === 0 ? (
          <RDSEmpty title="No fallbacks" body="No fallback events recorded." />
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Page</th>
                <th style={th}>Type</th>
                <th style={{ ...th, textAlign: "right" }}>Fallbacks</th>
                <th style={{ ...th, textAlign: "right" }}>Total calls</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {insights.fallbackFrequency.slice(0, 25).map((row) => {
                const rate = Math.round(row.fallbackRate * 100);
                return (
                  <tr key={row.pageId}>
                    <td style={td}>{safeText(row.pageLabel)}</td>
                    <td style={td}>
                      <RDSChip>{safeText(row.pageType)}</RDSChip>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{row.fallbackCount}</td>
                    <td style={{ ...td, textAlign: "right" }}>{row.totalCalls}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span
                        style={{
                          color: rate > 20 ? "var(--accent-hot)" : rate > 0 ? "var(--warn)" : "var(--ok)",
                          fontWeight: 600
                        }}
                      >
                        {rate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 3-col stat panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 24,
          marginBottom: 32
        }}
      >
        {/* Effort Distribution */}
        <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
          <RDSSectionHead title="Effort" level={3} />
          {insights.effortDistribution.length === 0 ? (
            <p
              style={{ margin: 0, color: "var(--ink-faint)", fontSize: "var(--fs-12)", fontFamily: "var(--font-mono)" }}
            >
              No data.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.effortDistribution.map((item) => (
                <div
                  key={item.effort}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-12)", color: "var(--ink-mute)" }}>
                    {item.effort ?? "unknown"}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-14)", fontWeight: 700 }}>
                    {item.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Geo-target Outcomes */}
        <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
          <RDSSectionHead title="Geo-target" level={3} />
          {insights.geoTargetComparisons.length === 0 ? (
            <p
              style={{ margin: 0, color: "var(--ink-faint)", fontSize: "var(--fs-12)", fontFamily: "var(--font-mono)" }}
            >
              No data.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.geoTargetComparisons.map((item) => (
                <div
                  key={item.segment}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-12)", color: "var(--ink-mute)" }}>
                    {item.segment}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-12)", fontWeight: 600 }}>
                    {Math.round(item.successRate * 100)}%{" "}
                    <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>
                      ({item.successCalls}/{item.totalCalls})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Blocked by Domain */}
        <div style={{ border: "1px solid var(--paper-rule)", padding: 20 }}>
          <RDSSectionHead title="Blocked" level={3} />
          {insights.blockedByDomain.length === 0 ? (
            <p
              style={{ margin: 0, color: "var(--ink-faint)", fontSize: "var(--fs-12)", fontFamily: "var(--font-mono)" }}
            >
              None.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.blockedByDomain.slice(0, 8).map((item) => (
                <div
                  key={item.domain}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-12)",
                      color: "var(--ink-mute)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 140
                    }}
                  >
                    {safeText(item.domain)}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-14)",
                      fontWeight: 700,
                      color: "var(--accent-hot)",
                      flexShrink: 0
                    }}
                  >
                    {item.blockedCount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Errors */}
      <div style={{ marginBottom: 32 }}>
        <RDSSectionHead title="Top Errors Over Time" count={insights.topErrors.length} />
        {insights.topErrors.length === 0 ? (
          <RDSEmpty title="No errors" body="No errors recorded in this period." />
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Error</th>
                <th style={{ ...th, textAlign: "right" }}>Count</th>
                <th style={th}>Timeline</th>
              </tr>
            </thead>
            <tbody>
              {insights.topErrors.map((item) => (
                <tr key={item.error}>
                  <td style={{ ...td, color: "var(--accent-hot)", maxWidth: 380, wordBreak: "break-word" }}>
                    {safeText(item.error)}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{item.count}</td>
                  <td style={{ ...td, color: "var(--ink-faint)" }}>
                    {item.timeline.map((point) => `${point.day}: ${point.count}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RDSFooter />
    </RDSPageShell>
  );
}
