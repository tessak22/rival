import { NextResponse, type NextRequest } from "next/server";

import { hasValidInternalApiKey, isSameOriginRequest } from "@/app/api/_lib/auth";
import { getSelfCompetitor } from "@/lib/db/competitors";

export async function GET(request: NextRequest) {
  if (!hasValidInternalApiKey(request) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const self = await getSelfCompetitor();
    return NextResponse.json({ self });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load self profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
