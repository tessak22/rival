import Link from "next/link";
import type { Competitor } from "@prisma/client";

import { SelfBriefView } from "@/components/brief/SelfBriefView";

function hasBriefShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function SelfProfileCard({ self }: { self: Competitor }) {
  const brief = hasBriefShape(self.intelligenceBrief) ? self.intelligenceBrief : null;

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
      {brief ? (
        <SelfBriefView brief={brief as never} />
      ) : (
        <p className="muted self-profile-card__empty">
          Not yet analyzed — self-profile will populate on the next scan cycle.
        </p>
      )}
    </section>
  );
}
