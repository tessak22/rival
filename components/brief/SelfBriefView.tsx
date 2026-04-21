type SelfBrief = {
  positioning_summary?: string;
  icp_summary?: string;
  pricing_summary?: string;
  differentiators?: unknown;
  recent_signals?: unknown;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function SelfBriefView({ brief }: { brief: SelfBrief }) {
  const differentiators = asStringArray(brief.differentiators);
  const recentSignals = asStringArray(brief.recent_signals);

  return (
    <div className="self-brief">
      {brief.positioning_summary && (
        <section className="brief-section">
          <h3 className="brief-section-label">Positioning</h3>
          <p>{brief.positioning_summary}</p>
        </section>
      )}
      {brief.icp_summary && (
        <section className="brief-section">
          <h3 className="brief-section-label">ICP</h3>
          <p>{brief.icp_summary}</p>
        </section>
      )}
      {brief.pricing_summary && (
        <section className="brief-section">
          <h3 className="brief-section-label">Pricing</h3>
          <p>{brief.pricing_summary}</p>
        </section>
      )}
      {differentiators.length > 0 && (
        <section className="brief-section">
          <h3 className="brief-section-label">Differentiators</h3>
          <ul className="brief-watch-list">
            {differentiators.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {recentSignals.length > 0 && (
        <section className="brief-section">
          <h3 className="brief-section-label">Recent Signals</h3>
          <ul className="brief-watch-list">
            {recentSignals.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
