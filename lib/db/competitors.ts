import { prisma } from "@/lib/db/client";

export type CompetitorListFilters = {
  includePages?: boolean;
  includeSelf?: boolean;
};

export async function listCompetitors(filters: CompetitorListFilters = {}) {
  return prisma.competitor.findMany({
    where: filters.includeSelf ? undefined : { isSelf: false },
    orderBy: { name: "asc" },
    include: filters.includePages ? { pages: true } : undefined
  });
}

export async function getCompetitorById(id: string) {
  return prisma.competitor.findUnique({
    where: { id },
    include: { pages: true }
  });
}

export async function getCompetitorBySlug(slug: string) {
  return prisma.competitor.findUnique({
    where: { slug },
    include: { pages: true }
  });
}

export async function getSelfCompetitor() {
  return prisma.competitor.findFirst({
    where: { isSelf: true },
    include: { pages: true }
  });
}
