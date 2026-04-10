type LogRow = {
  id: string;
  calledAt: Date;
  endpoint: string;
  status: string;
  resultQuality: string | null;
  fallbackTriggered: boolean;
  fallbackReason: string | null;
  missingFields: string[];
  pageLabel: string;
};

type LogsTableProps = {
  logs: LogRow[];
};

export function LogsTable({ logs }: LogsTableProps) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  });

  if (logs.length === 0) {
    return <p className="muted">No API logs captured yet.</p>;
  }

  return (
    <div className="logs-table-wrap">
      <table className="logs-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Page</th>
            <th>Endpoint</th>
            <th>Status</th>
            <th>Quality</th>
            <th>Fallback</th>
            <th>Missing fields</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className={log.fallbackTriggered ? "log-row log-row--fallback" : "log-row"}>
              <td>{formatter.format(log.calledAt)} UTC</td>
              <td>{log.pageLabel}</td>
              <td>{log.endpoint}</td>
              <td>{log.status}</td>
              <td>{log.resultQuality ?? "n/a"}</td>
              <td>{log.fallbackTriggered ? (log.fallbackReason ?? "yes") : "no"}</td>
              <td>{log.missingFields.length ? log.missingFields.join(", ") : "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
