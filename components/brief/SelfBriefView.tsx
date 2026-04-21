function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Accepts Record<string, unknown> because the brief comes from a Prisma
// JsonValue column with no compile-time shape guarantees. Narrowing and
// coercion happen per field inside this component.
export function SelfBriefView({ brief }: { brief: Record<string, unknown> }) {
  const positioning = asOptionalString(brief.positioning_summary);
  const icp = asOptionalString(brief.icp_summary);
  const pricing = asOptionalString(brief.pricing_summary);
  const differentiators = asStringArray(brief.differentiators);
  const recentSignals = asStringArray(brief.recent_signals);

  return (
    <div className="self-brief">
      {positioning && (
        <section className="brief-section">
          <h3 className="brief-section-label">Positioning</h3>
          <p>{positioning}</p>
        </section>
      )}
      {icp && (
        <section className="brief-section">
          <h3 className="brief-section-label">ICP</h3>
          <p>{icp}</p>
        </section>
      )}
      {pricing && (
        <section className="brief-section">
          <h3 className="brief-section-label">Pricing</h3>
          <p>{pricing}</p>
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
