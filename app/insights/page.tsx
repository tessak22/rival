import { prisma } from "@/lib/db/client";
import { getApiInsights } from "@/lib/db/api-logs";
import { InsightsFilters } from "@/components/insights/InsightsFilters";

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

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const params = await searchParams;
  const [competitors, endpointRows] = await Promise.all([
    prisma.competitor.findMany({
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

  return (
    <main className="dashboard-page">
      <header className="page-header">
        <h1>API Insights</h1>
        <p>Schema health and extraction quality telemetry from api_logs.</p>
      </header>

      <section className="panel">
        <header className="panel-header">
          <h2>Filters</h2>
        </header>
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
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Success Rate</h2>
        </header>
        {insights.successRate.totalCalls === 0 ? (
          <p className="muted">No data yet.</p>
        ) : (
          <p>
            {Math.round(insights.successRate.successRate * 100)}% ({insights.successRate.successCalls}/
            {insights.successRate.totalCalls})
          </p>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Most Common Missing Fields</h2>
        </header>
        <div className="logs-table-wrap">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Page type</th>
                <th>Field</th>
                <th>Missing count</th>
              </tr>
            </thead>
            <tbody>
              {insights.missingFields.slice(0, 25).map((row, index) => (
                <tr key={`${row.pageType}-${row.field}-${index}`}>
                  <td>{safeText(row.pageType)}</td>
                  <td>{safeText(row.field)}</td>
                  <td>{row.missingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Fallback Frequency</h2>
        </header>
        <div className="logs-table-wrap">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Type</th>
                <th>Fallback count</th>
                <th>Total calls</th>
                <th>Fallback rate</th>
              </tr>
            </thead>
            <tbody>
              {insights.fallbackFrequency.slice(0, 25).map((row) => (
                <tr key={row.pageId}>
                  <td>{safeText(row.pageLabel)}</td>
                  <td>{safeText(row.pageType)}</td>
                  <td>{row.fallbackCount}</td>
                  <td>{row.totalCalls}</td>
                  <td>{Math.round(row.fallbackRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="insights-grid">
        <article className="panel">
          <header className="panel-header">
            <h2>Effort Distribution</h2>
          </header>
          <ul className="stat-list">
            {insights.effortDistribution.map((item) => (
              <li key={item.effort}>
                <span>{item.effort}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <header className="panel-header">
            <h2>Geo-target Outcomes</h2>
          </header>
          <ul className="stat-list">
            {insights.geoTargetComparisons.map((item) => (
              <li key={item.segment}>
                <span>{item.segment}</span>
                <strong>
                  {Math.round(item.successRate * 100)}% ({item.successCalls}/{item.totalCalls})
                </strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <header className="panel-header">
            <h2>Blocked Content by Domain</h2>
          </header>
          <ul className="stat-list">
            {insights.blockedByDomain.slice(0, 20).map((item) => (
              <li key={item.domain}>
                <span>{safeText(item.domain)}</span>
                <strong>{item.blockedCount}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Top Errors Over Time</h2>
        </header>
        <div className="logs-table-wrap">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Error</th>
                <th>Count</th>
                <th>Timeline</th>
              </tr>
            </thead>
            <tbody>
              {insights.topErrors.map((item) => (
                <tr key={item.error}>
                  <td>{safeText(item.error)}</td>
                  <td>{item.count}</td>
                  <td>{item.timeline.map((point) => `${point.day}: ${point.count}`).join(" | ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
