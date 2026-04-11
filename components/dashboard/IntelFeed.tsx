import type { HomepageData } from "@/lib/schemas/homepage";

type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  pageType: string | null;
  scannedAt: Date;
  diffSummary: string | null;
  rawResult?: unknown;
  previousRawResult?: unknown;
};

type IntelFeedProps = {
  items: IntelFeedItem[];
};

/**
 * Derive a human-readable homepage change message from the raw scan results.
 * Returns null if no specific change pattern is detected.
 */
function getHomepageChangeMessage(
  competitorName: string,
  current: HomepageData,
  previous: HomepageData | null
): string | null {
  if (!previous) return null;

  const normalize = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  };
  const taglineChanged = normalize(current.primary_tagline) !== normalize(previous.primary_tagline);
  const subTaglineChanged = normalize(current.sub_tagline) !== normalize(previous.sub_tagline);
  const differentiatorItemsChanged =
    JSON.stringify(current.key_differentiators ?? []) !== JSON.stringify(previous.key_differentiators ?? []);

  if (taglineChanged || subTaglineChanged) {
    return `${competitorName} changed their homepage headline`;
  }

  if (differentiatorItemsChanged) {
    return `${competitorName} updated their homepage positioning`;
  }

  return null;
}

export function IntelFeed({ items }: IntelFeedProps) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  });

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Intel Feed</h2>
      </header>
      {items.length === 0 ? (
        <p className="muted">No change events yet.</p>
      ) : (
        <ul className="intel-feed">
          {items.map((item) => {
            let displaySummary = item.diffSummary ?? "Change detected, summary pending.";

            if (item.pageType === "homepage" && item.rawResult) {
              const homepageMessage = getHomepageChangeMessage(
                item.competitorName,
                item.rawResult as HomepageData,
                item.previousRawResult ? (item.previousRawResult as HomepageData) : null
              );
              if (homepageMessage) {
                displaySummary = homepageMessage;
              }
            }

            return (
              <li key={item.id} className="intel-item">
                <div className="intel-item-top">
                  <strong>{item.competitorName}</strong>
                  <span>{item.pageLabel}</span>
                  <time>{formatter.format(item.scannedAt)} UTC</time>
                </div>
                <p>{displaySummary}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
