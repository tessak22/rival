import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/client";
import { ScanEntry } from "./ScanEntry";

const DEFAULT_TYPE = "homepage";
const MAX_SCANS = 90;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
};

export default async function HistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { type: rawType } = await searchParams;

  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    include: {
      pages: {
        select: { type: true },
      },
    },
  });

  if (!competitor) notFound();

  const distinctTypes = [...new Set(competitor.pages.map((p) => p.type))].sort();
  const selectedType = distinctTypes.includes(rawType ?? "") ? (rawType as string) : DEFAULT_TYPE;

  const scans = await prisma.scan.findMany({
    where: {
      page: {
        competitorId: competitor.id,
        type: selectedType,
      },
    },
    orderBy: { scannedAt: "desc" },
    take: MAX_SCANS,
  });

  return (
    <div className="history-page">
      <Link href={`/${slug}`} className="back-link">
        ← {competitor.name}
      </Link>

      <h1 className="history-title">{competitor.name} — Scan History</h1>

      <nav className="history-type-tabs">
        {distinctTypes.map((type) => (
          <Link
            key={type}
            href={`/${slug}/history?type=${type}`}
            className={`history-type-tab${type === selectedType ? " history-type-tab--active" : ""}`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Link>
        ))}
      </nav>

      {scans.length === 0 ? (
        <p className="history-empty">
          No scans yet for this page type. Scans run daily at 6am UTC.
        </p>
      ) : (
        <div className="history-timeline">
          {scans.map((scan) => (
            <ScanEntry key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </div>
  );
}
