import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

type SaveRequest = {
  competitorId: string;
  mode: string;
  query: string;
  promptTemplate: string | null;
  result: unknown;
  citations: unknown;
  durationMs: number;
  status: "success" | "error";
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return value as Prisma.InputJsonValue;
  }
  return String(value);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as SaveRequest;
  if (!body.competitorId) {
    return new Response(JSON.stringify({ error: "competitorId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    await Promise.all([
      prisma.deepDive.create({
        data: {
          competitorId: body.competitorId,
          mode: body.mode,
          query: body.query,
          result: toJsonValue(body.result),
          citations: toJsonValue(body.citations),
          promptTemplate: body.promptTemplate ?? null
        }
      }),
      prisma.apiLog.create({
        data: {
          competitorId: body.competitorId,
          endpoint: "research",
          mode: body.mode,
          nocache: true,
          status: body.status,
          durationMs: body.durationMs,
          resultQuality: body.status === "success" ? "full" : "empty",
          isDemo: false
        }
      })
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Save failed" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
