type ProfileChangeEvent = "target_company_size_changed" | "target_industry_added";

type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  scannedAt: Date;
  diffSummary: string | null;
  pageType?: string | null;
  profileEvents?: ProfileChangeEvent[];
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
