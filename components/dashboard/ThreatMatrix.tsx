import Link from "next/link";

type CompetitorThreat = {
  id: string;
  slug: string;
  name: string;
  threatLevel: string | null;
  schemaHealth: number;
  hasRecentChanges: boolean;
  lastScanAt: Date | null;
};

type ThreatMatrixProps = {
  competitors: CompetitorThreat[];
};

const ORDER = ["High", "Medium", "Low", "Unknown"] as const;

export function ThreatMatrix({ competitors }: ThreatMatrixProps) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC"
  });

  const grouped = new Map<string, CompetitorThreat[]>();
  for (const level of ORDER) grouped.set(level, []);

  for (const competitor of competitors) {
    const level = competitor.threatLevel ?? "Unknown";
    grouped.set(level, [...(grouped.get(level) ?? []), competitor]);
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Threat Matrix</h2>
      </header>
      <div className="matrix">
        {ORDER.map((level) => (
          <div key={level} className="matrix-column">
            <h3>{level}</h3>
            <ul>
              {(grouped.get(level) ?? []).map((competitor) => (
                <li key={competitor.id}>
                  <Link href={`/${competitor.slug}`} className="matrix-item">
                    <div className="matrix-item-title">{competitor.name}</div>
                    <div className="matrix-item-meta">
                      <span>Health {Math.round(competitor.schemaHealth * 100)}%</span>
                      <span>{competitor.hasRecentChanges ? "Changes detected" : "Stable"}</span>
                      <span>
                        {competitor.lastScanAt ? `${dateFormatter.format(competitor.lastScanAt)} UTC` : "No scans"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
