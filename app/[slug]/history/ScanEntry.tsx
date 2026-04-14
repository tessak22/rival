"use client";

import { getScanBadge } from "./scan-badge";

type ScanEntryProps = {
  scan: {
    id: string;
    scannedAt: Date;
    hasChanges: boolean;
    diffSummary: string | null;
    rawResult: unknown;
    markdownResult: string | null;
  };
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}

export function ScanEntry({ scan }: ScanEntryProps) {
  const badge = getScanBadge(scan.hasChanges);

  const variantClass =
    badge.variant === "changed"
      ? "tag-chip--green"
      : badge.variant === "no-change"
        ? "tag-chip--secondary"
        : "tag-chip--amber";

  const kvEntries =
    scan.rawResult !== null &&
    typeof scan.rawResult === "object" &&
    !Array.isArray(scan.rawResult)
      ? Object.entries(scan.rawResult as Record<string, unknown>)
      : [];

  return (
    <details className="history-entry">
      <summary className="history-entry-summary">
        <span className="history-entry-date">{formatDate(scan.scannedAt)}</span>
        <span className={`tag-chip ${variantClass}`}>{badge.label}</span>
        {badge.variant === "changed" && scan.diffSummary && (
          <span className="history-entry-diff">{scan.diffSummary}</span>
        )}
      </summary>
      <div className="history-entry-body">
        {kvEntries.length > 0 ? (
          <div>
            {kvEntries.map(([key, value]) => (
              <div key={key} className="history-kv-row">
                <span className="history-kv-key">{key}</span>
                <span className="history-kv-value">
                  {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                </span>
              </div>
            ))}
          </div>
        ) : scan.markdownResult ? (
          <pre className="history-markdown">{scan.markdownResult}</pre>
        ) : (
          <p className="history-empty">No data captured for this scan.</p>
        )}
      </div>
    </details>
  );
}
