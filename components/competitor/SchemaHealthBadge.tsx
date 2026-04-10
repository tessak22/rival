type SchemaHealthBadgeProps = {
  score: number;
  label?: string;
};

function scoreToTone(score: number): "good" | "warn" | "bad" {
  if (score >= 0.85) return "good";
  if (score >= 0.6) return "warn";
  return "bad";
}

export function SchemaHealthBadge({ score, label = "Schema health" }: SchemaHealthBadgeProps) {
  const tone = scoreToTone(score);
  const percent = Math.round(score * 100);
  return (
    <span className={`schema-health schema-health--${tone}`}>
      {label}: {percent}%
    </span>
  );
}
