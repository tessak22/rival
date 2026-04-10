type IntelFeedItem = {
  id: string;
  competitorName: string;
  pageLabel: string;
  scannedAt: Date;
  diffSummary: string | null;
};

type IntelFeedProps = {
  items: IntelFeedItem[];
};

export function IntelFeed({ items }: IntelFeedProps) {
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
                <time>{item.scannedAt.toLocaleString()}</time>
              </div>
              <p>{item.diffSummary ?? "Change detected, summary pending."}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
