import type { HomepageData } from "@/lib/schemas/homepage";

type ProfileChangeEvent = "target_company_size_changed" | "target_industry_added";

type ReviewsChangeEvent =
  | { type: "rating_changed"; platform: string; fromRating: number; toRating: number }
  | { type: "complaint_theme_added"; platform: string; theme: string };

type BlogChangeEvent =
  | { type: "audience_focus_shifted"; nowDeveloperFocused: boolean }
  | { type: "frequency_increased"; fromFrequency: string; toFrequency: string };

type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  pageType: string | null;
  scannedAt: Date;
  diffSummary: string | null;
  rawResult?: unknown;
  previousRawResult?: unknown;
  profileEvents?: ProfileChangeEvent[];
  reviewsEvents?: ReviewsChangeEvent[];
  blogEvents?: BlogChangeEvent[];
};

type IntelFeedProps = {
  items: IntelFeedItem[];
};

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
            );
          })}
        </ul>
      )}
    </section>
  );
}
