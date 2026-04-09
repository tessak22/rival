import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db/client";

type NotificationsQuery = {
  competitorId?: string;
  limit?: string;
};

export async function GET(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries()) as NotificationsQuery;
  const limit = Number(query.limit ?? "50");

  const notifications = await prisma.notification.findMany({
    where: {
      competitorId: query.competitorId
    },
    include: {
      competitor: true,
      scan: {
        include: { page: true }
      }
    },
    orderBy: { sentAt: "desc" },
    take: Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50
  });

  return NextResponse.json({ notifications });
}
