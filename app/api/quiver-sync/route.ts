import { type NextRequest, NextResponse } from "next/server";

import { hasValidInternalApiKey } from "@/app/api/_lib/auth";
import { prisma } from "@/lib/db/client";
import { pushCompetitorToQuiver } from "@/lib/quiver";

export const dynamic = "force-dynamic";

/**
 * POST /api/quiver-sync
 *
 * Pushes all tracked competitors to Quiver's research layer using existing
 * scan data — no re-scanning. Useful for a manual first-run or re-sync.
 *
 * Auth: INTERNAL_API_KEY via x-internal-api-key header or Bearer token.
 *
 * curl example:
 *   curl -X POST https://your-rival.com/api/quiver-sync \
 *     -H "x-internal-api-key: <INTERNAL_API_KEY>"
 */
export async function POST(request: NextRequest) {
  if (!hasValidInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const competitors = await prisma.competitor.findMany({
    where: { isSelf: false },
    select: { id: true, name: true, baseUrl: true }
  });

  const results: Array<{ name: string; status: "pushed" | "skipped" }> = [];

  for (const c of competitors) {
    await pushCompetitorToQuiver(c.id, c.name, c.baseUrl);
    results.push({ name: c.name, status: "pushed" });
  }

  return NextResponse.json({ pushed: results.length, competitors: results });
}
