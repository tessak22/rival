import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";

import { prisma } from "@/lib/db/client";

export async function createDeepDive(input: {
  competitorId: string;
  mode: string;
  query: string;
  result?: PrismaTypes.InputJsonValue | null;
  citations?: PrismaTypes.InputJsonValue | null;
}) {
  return prisma.deepDive.create({
    data: {
      competitorId: input.competitorId,
      mode: input.mode,
      query: input.query,
      result: input.result ?? Prisma.JsonNull,
      citations: input.citations ?? Prisma.JsonNull
    }
  });
}

export async function listDeepDivesForCompetitor(competitorId: string, limit = 20) {
  return prisma.deepDive.findMany({
    where: { competitorId },
    orderBy: { createdAt: "desc" },
    take: limit
  });
}
