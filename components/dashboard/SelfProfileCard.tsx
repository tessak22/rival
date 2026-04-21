import Link from "next/link";
import type { Competitor } from "@prisma/client";

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readPositioning(brief: unknown): string | null {
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) return null;
  return asOptionalString((brief as Record<string, unknown>).positioning_summary);
}

export function SelfProfileCard({ self }: { self: Competitor }) {
  const positioning = readPositioning(self.intelligenceBrief);

  return (
    <section className="self-profile-card panel">
      <header className="panel-header self-profile-card__header">
        <div>
          <span className="self-profile-card__eyebrow">Your Profile</span>
          <h2>{self.name}</h2>
        </div>
        <Link href={`/${self.slug}`} className="tag-chip tag-chip--secondary">
          View details →
        </Link>
      </header>
      {positioning ? (
        <p className="self-profile-card__positioning">{positioning}</p>
      ) : (
        <p className="muted self-profile-card__empty">
          Not yet analyzed — self-profile will populate on the next scan cycle.
        </p>
      )}
    </section>
  );
}
