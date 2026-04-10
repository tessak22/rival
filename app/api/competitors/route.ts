import { NextResponse, type NextRequest } from "next/server";

import { hasValidInternalApiKey, isSameOriginRequest } from "@/app/api/_lib/auth";
import { listCompetitors } from "@/lib/db/competitors";

export async function GET(request: NextRequest) {
  if (!hasValidInternalApiKey(request) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const competitors = await listCompetitors({ includePages: true });
    return NextResponse.json({ competitors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load competitors";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
