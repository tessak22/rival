import { notFound } from "next/navigation";

import { DeepDiveClient } from "@/components/deep-dive/DeepDiveClient";
import { prisma } from "@/lib/db/client";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DeepDivePage({ params }: PageProps) {
  const { slug } = await params;
  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    select: { id: true, name: true, baseUrl: true }
  });

  if (!competitor) {
    notFound();
  }

  const previousDeepDives = await prisma.deepDive.findMany({
    where: { competitorId: competitor.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return (
    <main className="dashboard-page">
      <header className="page-header">
        <h1>{competitor.name} Deep Dive</h1>
        <p>{competitor.baseUrl}</p>
      </header>

      <DeepDiveClient competitorId={competitor.id} competitorName={competitor.name} />

      <section className="panel">
        <header className="panel-header">
          <h2>Previous Deep Dives</h2>
        </header>
        {previousDeepDives.length === 0 ? (
          <p className="muted">No previous deep dives yet.</p>
        ) : (
          <ul className="stat-list">
            {previousDeepDives.map((item) => (
              <li key={item.id}>
                <span>{item.mode}</span>
                <strong>{item.createdAt.toLocaleString()}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
