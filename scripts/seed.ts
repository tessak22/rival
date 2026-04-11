import fs from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

type RivalConfig = {
  competitors?: Array<{
    name: string;
    slug: string;
    url: string;
    manual?: Record<string, unknown> & { manual_last_updated?: string };
    pages?: Array<{
      label: string;
      url: string;
      type: string;
      geo_target?: string;
    }>;
  }>;
};

async function loadConfig(): Promise<RivalConfig> {
  const configPath = path.join(process.cwd(), "rivals.config.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as RivalConfig;
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return value as Prisma.InputJsonValue;
  }
  return String(value);
}

async function main() {
  const config = await loadConfig();
  const competitors = config.competitors ?? [];

  if (competitors.length === 0) {
    console.log("No competitors in rivals.config.json, nothing to seed.");
    return;
  }

  for (const competitor of competitors) {
    const record = await prisma.competitor.upsert({
      where: { slug: competitor.slug },
      create: {
        name: competitor.name,
        slug: competitor.slug,
        baseUrl: competitor.url,
        manualData: toJsonValue(competitor.manual),
        manualLastUpdated: toDate(competitor.manual?.manual_last_updated)
      },
      update: {
        name: competitor.name,
        baseUrl: competitor.url,
        manualData: toJsonValue(competitor.manual),
        manualLastUpdated: toDate(competitor.manual?.manual_last_updated)
      }
    });

    for (const page of competitor.pages ?? []) {
      const existing = await prisma.competitorPage.findFirst({
        where: { competitorId: record.id, url: page.url }
      });

      if (existing) {
        await prisma.competitorPage.update({
          where: { id: existing.id },
          data: { label: page.label, type: page.type, geoTarget: page.geo_target ?? null }
        });
      } else {
        await prisma.competitorPage.create({
          data: {
            competitorId: record.id,
            label: page.label,
            url: page.url,
            type: page.type,
            geoTarget: page.geo_target ?? null
          }
        });
      }
    }

    console.log(`Seeded ${record.name} (${record.slug})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
