import { prisma } from "@/lib/db/client";

export async function getLatestScanForPage(pageId: string) {
  return prisma.scan.findFirst({
    where: { pageId },
    orderBy: { scannedAt: "desc" }
  });
}

export async function listRecentScansForCompetitor(competitorId: string, limit = 50) {
  return prisma.scan.findMany({
    where: { page: { competitorId } },
    include: { page: true },
    orderBy: { scannedAt: "desc" },
    take: limit
  });
}

export async function listScansWithChanges(competitorId: string, limit = 25) {
  return prisma.scan.findMany({
    where: {
      hasChanges: true,
      page: { competitorId }
    },
    include: { page: true },
    orderBy: { scannedAt: "desc" },
    take: limit
  });
}
