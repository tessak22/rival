import { NextResponse, type NextRequest } from "next/server";

import { hasValidInternalApiKey, isSameOriginRequest } from "@/app/api/_lib/auth";
import { prisma } from "@/lib/db/client";

type NotificationsQuery = {
  competitorId?: string;
  limit?: string;
};

export async function GET(request: NextRequest) {
  if (!hasValidInternalApiKey(request) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
