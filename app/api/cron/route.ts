import { NextResponse, type NextRequest } from "next/server";

import { runScans } from "@/lib/run-scans";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[api/cron] CRON_SECRET is not configured.");
    return false;
  }
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization");
  return headerSecret === secret || bearer === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScans();
  return NextResponse.json(result);
}
