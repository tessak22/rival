/**
 * Blog change events for the Intel Feed.
 *
 * audience_focus_shifted: developer_focused flipped between scans.
 *   This is a strategic signal — it reveals which audience the competitor
 *   is now investing in with content. Do NOT emit per new post (too noisy).
 *
 * frequency_increased: post_frequency moved to a higher cadence tier.
 *   A cadence increase signals content investment, often ahead of a launch.
 *   Only emitted when the cadence rank increases — decreases are not emitted.
 */
type BlogChangeEvent =
  | { type: "audience_focus_shifted"; nowDeveloperFocused: boolean }
  | { type: "frequency_increased"; fromFrequency: string; toFrequency: string };

type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  scannedAt: Date;
  diffSummary: string | null;
  blogEvents?: BlogChangeEvent[];
};

type IntelFeedProps = {
  items: IntelFeedItem[];
};

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
          {items.map((item) => (
            <li key={item.id} className="intel-item">
              <div className="intel-item-top">
                <strong>{item.competitorName}</strong>
                <span>{item.pageLabel}</span>
                <time>{formatter.format(item.scannedAt)} UTC</time>
              </div>
              <p>{item.diffSummary ?? "Change detected, summary pending."}</p>
              {item.blogEvents && item.blogEvents.length > 0 && (
                <ul className="intel-blog-events">
                  {item.blogEvents.map((event, i) => (
                    <li key={i} className="intel-blog-event">
                      {event.type === "audience_focus_shifted" &&
                        `${item.competitorName} blog appears to have shifted audience focus — now ${event.nowDeveloperFocused ? "developer-focused" : "buyer-focused"}`}
                      {event.type === "frequency_increased" &&
                        `${item.competitorName} is publishing more frequently on their blog (${event.fromFrequency} → ${event.toFrequency})`}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
