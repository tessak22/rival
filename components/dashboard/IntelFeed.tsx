type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  scannedAt: Date;
  diffSummary: string | null;
  reviewsEvents?: ReviewsChangeEvent[];
};

/**
 * Reviews change events for the Intel Feed.
 *
 * rating_changed: overall_rating moved by more than 0.1 — meaningful signal
 *   in customer perception. Emitted with from/to values in the event label.
 *
 * complaint_theme_added: a new recurring complaint theme appeared. This is
 *   the highest-signal reviews event — new complaints map to product
 *   opportunities and competitor weaknesses.
 */
type ReviewsChangeEvent =
  | { type: "rating_changed"; platform: string; fromRating: number; toRating: number }
  | { type: "complaint_theme_added"; platform: string; theme: string };

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
              {item.reviewsEvents && item.reviewsEvents.length > 0 && (
                <ul className="intel-reviews-events">
                  {item.reviewsEvents.map((event, i) => (
                    <li key={i} className="intel-reviews-event">
                      {event.type === "rating_changed" &&
                        `${item.competitorName} ${event.platform} rating changed from ${event.fromRating.toFixed(1)} to ${event.toRating.toFixed(1)}`}
                      {event.type === "complaint_theme_added" &&
                        `${item.competitorName} has a new recurring complaint on ${event.platform}: ${event.theme}`}
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
