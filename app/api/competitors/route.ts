import { NextResponse } from "next/server";

import { listCompetitors } from "@/lib/db/competitors";

export async function GET() {
  const competitors = await listCompetitors({ includePages: true });
  return NextResponse.json({ competitors });
}

