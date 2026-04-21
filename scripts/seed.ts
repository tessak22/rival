import fs from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { parseRivalConfig, type ParsedRivalConfig, type RivalConfigEntry } from "@/lib/config/rival-config";

async function loadConfig(): Promise<ParsedRivalConfig> {
  const configPath = path.join(process.cwd(), "rivals.config.json");
  const raw = await fs.readFile(configPath, "utf8");
  return parseRivalConfig(JSON.parse(raw));
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

async function upsertEntry(entry: RivalConfigEntry, isSelf: boolean) {
  const record = await prisma.competitor.upsert({
    where: { slug: entry.slug },
    create: {
      name: entry.name,
      slug: entry.slug,
      baseUrl: entry.url,
      isSelf,
      manualData: toJsonValue(entry.manual),
      manualLastUpdated: toDate(entry.manual?.manual_last_updated)
    },
    update: {
      name: entry.name,
      baseUrl: entry.url,
      isSelf,
      manualData: toJsonValue(entry.manual),
      manualLastUpdated: toDate(entry.manual?.manual_last_updated)
    }
  });

  const configUrls = new Set((entry.pages ?? []).map((p) => p.url));

  for (const page of entry.pages ?? []) {
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

  return { record, configUrls };
}

async function main() {
  const prunePages = process.argv.includes("--prune-pages");
  const config = await loadConfig();
  const entries: Array<{ entry: RivalConfigEntry; isSelf: boolean }> = [];
  if (config.self) entries.push({ entry: config.self, isSelf: true });
  for (const c of config.competitors) entries.push({ entry: c, isSelf: false });

  if (entries.length === 0) {
    console.log("No self or competitors in rivals.config.json, nothing to seed.");
    return;
  }

  // Demote any previously-flagged self rows whose slug no longer matches the
  // current config's self. The partial unique index on is_self=true means the
  // subsequent upsert would otherwise fail when rotating the self slug or
  // removing the self block entirely. Safe to run even when no prior self
  // exists — updateMany returns count: 0.
  const newSelfSlug = config.self?.slug ?? null;
  const demoted = await prisma.competitor.updateMany({
    where: {
      isSelf: true,
      ...(newSelfSlug ? { slug: { not: newSelfSlug } } : {})
    },
    data: { isSelf: false }
  });
  if (demoted.count > 0) {
    console.log(`Demoted ${demoted.count} previously-self competitor row(s) whose slug no longer matches config.self.`);
  }

  for (const { entry, isSelf } of entries) {
    const { record, configUrls } = await upsertEntry(entry, isSelf);

    const dbPages = await prisma.competitorPage.findMany({ where: { competitorId: record.id } });
    const orphaned = dbPages.filter((p) => !configUrls.has(p.url));

    if (orphaned.length > 0) {
      if (prunePages) {
        await prisma.competitorPage.deleteMany({
          where: { id: { in: orphaned.map((p) => p.id) } }
        });
        console.warn(
          `  Pruned ${orphaned.length} page(s) for ${record.slug} (scan history deleted): ${orphaned.map((p) => p.url).join(", ")}`
        );
      } else {
        console.warn(
          `  Warning: ${orphaned.length} page(s) in DB but not in config for ${record.slug} — cron will keep scanning them. Run with --prune-pages to remove (deletes scan history): ${orphaned.map((p) => p.url).join(", ")}`
        );
      }
    }

    console.log(`Seeded ${isSelf ? "[self] " : ""}${record.name} (${record.slug})`);
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
