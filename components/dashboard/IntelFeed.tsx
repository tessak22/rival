type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  scannedAt: Date;
  diffSummary: string | null;
  pageType?: string | null;
  profileEvents?: ProfileChangeEvent[];
  reviewsEvents?: ReviewsChangeEvent[];
  blogEvents?: BlogChangeEvent[];
};

type ProfileChangeEvent = "target_company_size_changed" | "target_industry_added";

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
              {item.profileEvents && item.profileEvents.length > 0 && (
                <ul className="intel-profile-events">
                  {item.profileEvents.map((event) => (
                    <li key={event} className="intel-profile-event">
                      {event === "target_company_size_changed" &&
                        `${item.competitorName} updated their stated target company size`}
                      {event === "target_industry_added" &&
                        `${item.competitorName} added a new target industry to their About page`}
                    </li>
                  ))}
                </ul>
              )}
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
