# Self-Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every AI call in Rival context about the user's own company so briefs, threat scores, and deep dives produce recommendations relative to the user instead of generic competitor commentary.

**Architecture:** Reuse the `Competitor` model with a new `isSelf` boolean flag. Self goes through the existing scanner/cron/brief pipeline with a purpose-built self-brief schema. A new `buildSelfContext()` helper reads the self row's brief + manual_data and prepends it as a context block to every competitor-facing AI call (brief, research, future compare).

**Tech Stack:** Next.js App Router, TypeScript strict, Prisma + Postgres, `@tabstack/sdk`, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-21-self-profile-design.md`

---

## Pre-flight

- [ ] Confirm on branch `feat/self-profile-spec` (or create a new feature branch off it)
- [ ] `npm install` clean
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes

---

## Task 1: Add `isSelf` column to Competitor

**Files:**
- Modify: `prisma/schema.prisma` (Competitor model, ~line 11)
- Create: `prisma/migrations/<timestamp>_add_is_self_to_competitors/migration.sql`

- [ ] **Step 1: Add `isSelf` field to the Prisma schema**

Edit `prisma/schema.prisma`, inside the `Competitor` model. Insert after the `createdAt` line:

```prisma
  isSelf            Boolean   @default(false) @map("is_self")
```

- [ ] **Step 2: Create the migration**

```bash
npx prisma migrate dev --name add_is_self_to_competitors --create-only
```

- [ ] **Step 3: Edit the generated migration SQL**

Open the newly created `prisma/migrations/<timestamp>_add_is_self_to_competitors/migration.sql` and append the partial unique index after the generated `ALTER TABLE` statement:

```sql
-- Enforce at most one Competitor row with is_self = true
CREATE UNIQUE INDEX "competitors_is_self_unique"
  ON "competitors" ("is_self") WHERE "is_self" = true;
```

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate dev
```

Expected: migration applies cleanly, Prisma client regenerates.

- [ ] **Step 5: Verify the constraint**

```bash
npx prisma studio
```

(Or via psql.) Manually: insert two rows with `is_self = true`, confirm the second fails with a unique-violation error. Then delete both test rows.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add is_self flag to competitors with partial unique index"
```

---

## Task 2: Extend seed script to read `config.self`

**Files:**
- Modify: `scripts/seed.ts` (full file replacement of RivalConfig type + main loop)
- Test: `scripts/__tests__/seed.test.ts` (create if absent; skip if integration-only seed tests aren't a pattern in this repo)

- [ ] **Step 1: Write a failing unit test for config parsing**

Create `lib/config/__tests__/rival-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRivalConfig } from "@/lib/config/rival-config";

describe("parseRivalConfig", () => {
  it("parses config without a self block", () => {
    const result = parseRivalConfig({
      competitors: [{ name: "Acme", slug: "acme", url: "https://a.co", pages: [] }]
    });
    expect(result.self).toBeNull();
    expect(result.competitors).toHaveLength(1);
  });

  it("parses a self block identically to a competitor entry", () => {
    const result = parseRivalConfig({
      self: {
        name: "Rival",
        slug: "rival",
        url: "https://rival.so",
        pages: [{ label: "Home", url: "https://rival.so", type: "homepage" }]
      },
      competitors: []
    });
    expect(result.self).not.toBeNull();
    expect(result.self?.slug).toBe("rival");
    expect(result.self?.pages).toHaveLength(1);
  });

  it("rejects a self entry whose slug collides with a competitor slug", () => {
    expect(() =>
      parseRivalConfig({
        self: { name: "Rival", slug: "acme", url: "https://rival.so", pages: [] },
        competitors: [{ name: "Acme", slug: "acme", url: "https://a.co", pages: [] }]
      })
    ).toThrow(/slug.*collision|duplicate slug/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test -- rival-config
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create the parser module**

Create `lib/config/rival-config.ts`:

```ts
export type RivalConfigEntry = {
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
};

export type ParsedRivalConfig = {
  self: RivalConfigEntry | null;
  competitors: RivalConfigEntry[];
};

type RawConfig = {
  self?: RivalConfigEntry;
  competitors?: RivalConfigEntry[];
};

export function parseRivalConfig(raw: RawConfig): ParsedRivalConfig {
  const self = raw.self ?? null;
  const competitors = raw.competitors ?? [];

  if (self) {
    const collision = competitors.find((c) => c.slug === self.slug);
    if (collision) {
      throw new Error(
        `rivals.config.json: slug collision between self and competitor "${self.slug}". Choose a different slug for one of them.`
      );
    }
  }

  return { self, competitors };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- rival-config
```

Expected: PASS (3 tests).

- [ ] **Step 5: Rewire `scripts/seed.ts` to use the parser and upsert self**

Replace the top of `scripts/seed.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { parseRivalConfig, type RivalConfigEntry } from "@/lib/config/rival-config";

async function loadConfig() {
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
```

Replace the `main()` function body (keep the existing `--prune-pages` behavior, now applied to both self and competitors):

```ts
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
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/config scripts/seed.ts
git commit -m "feat(seed): upsert self entry from rivals.config.json"
```

---

## Task 3: Self-profile schema + `generateSelfProfile` in `lib/tabstack/generate.ts`

**Files:**
- Modify: `lib/tabstack/generate.ts` (append new schema + function)
- Test: `lib/tabstack/__tests__/generate.test.ts` (add new test block)

- [ ] **Step 1: Write a failing test**

Append to `lib/tabstack/__tests__/generate.test.ts`:

```ts
describe("generateSelfProfile", () => {
  it("calls tabstack /generate with SELF_PROFILE_SCHEMA and the provided context", async () => {
    const { generateSelfProfile, SELF_PROFILE_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    // (Reuse existing client+logger mocks from the top of this file.)

    const response = await generateSelfProfile({
      competitorId: "self_1",
      url: "https://rival.so",
      contextData: JSON.stringify([{ page_type: "homepage", result: { headline: "CI for devs" } }]),
      effort: "low",
      nocache: true
    });

    expect(response).toBeDefined();
    expect(SELF_PROFILE_EXPECTED_FIELDS).toEqual(
      expect.arrayContaining([
        "positioning_summary",
        "icp_summary",
        "pricing_summary",
        "differentiators",
        "recent_signals"
      ])
    );
    // The mocked client should have been called once with the self-profile schema.
    // (Match the existing test pattern in this file: assert on the mocked client's call args.)
  });
});
```

(The existing test file will show the mock-wiring pattern for `getTabstackClient`. Follow it exactly when filling in the assertion on call args.)

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- generate
```

Expected: FAIL (`generateSelfProfile` / `SELF_PROFILE_EXPECTED_FIELDS` not exported).

- [ ] **Step 3: Add the schema and function to `lib/tabstack/generate.ts`**

After the existing `BRIEF_SCHEMA` constant, add:

```ts
export const SELF_PROFILE_SCHEMA = {
  type: "object",
  properties: {
    positioning_summary: {
      type: "string",
      description: "1–2 sentences describing who this company is and what it sells."
    },
    icp_summary: {
      type: "string",
      description: "1–2 sentences describing the company's ideal customer profile."
    },
    pricing_summary: {
      type: "string",
      description: "Brief description of the monetization model (free, paid, freemium, OSS+paid, etc.)."
    },
    differentiators: {
      type: "array",
      items: { type: "string" },
      description: "3–5 bullets naming what makes this company distinct."
    },
    recent_signals: {
      type: "array",
      items: { type: "string" },
      description: "3–5 bullets of recent changes visible from changelog, blog, or careers."
    }
  },
  required: ["positioning_summary", "icp_summary", "pricing_summary", "differentiators", "recent_signals"]
} as const;

export const SELF_PROFILE_EXPECTED_FIELDS: string[] = [...SELF_PROFILE_SCHEMA.required];
```

After `generateBrief`, add:

```ts
export type GenerateSelfProfileInput = GenerateBriefInput;

/**
 * Analyze the user's own company data and produce a structured self-profile.
 * This output is stored on the self Competitor row and later injected as context
 * into every competitor-facing AI call (brief, research, compare).
 */
export async function generateSelfProfile(input: GenerateSelfProfileInput): Promise<GenerateJsonResponse> {
  const client = getTabstackClient();
  const geoTarget = toGeoTarget(input.geoTarget);
  const contextData = input.contextData.slice(0, MAX_CONTEXT_LENGTH);
  if (input.contextData.length > MAX_CONTEXT_LENGTH) {
    process.emitWarning(
      `[generateSelfProfile] contextData truncated from ${input.contextData.length} to ${MAX_CONTEXT_LENGTH} chars`,
      { code: "RIVAL_CONTEXT_TRUNCATED" }
    );
  }

  const instructions = `You are analyzing a company's own public surfaces (website, pricing,
docs, changelog, careers, blog, social) to produce a concise self-profile. This
profile will later be used as context when evaluating competitors, so it must be
factual and compact.

Produce:
1. positioning_summary — 1–2 sentences: who they are, what they sell.
2. icp_summary — 1–2 sentences: who they serve (technical ICP + use case).
3. pricing_summary — monetization model in one short paragraph.
4. differentiators — 3–5 bullets of what makes them distinct (not marketing fluff).
5. recent_signals — 3–5 bullets of recent changes visible in changelog, blog, or careers.

Be direct and specific. No generic commentary. Do not speculate — only describe
what the data shows.

Company data:
${contextData}`;

  const requestPayload: GenerateJsonParams = {
    url: input.url,
    instructions,
    json_schema: SELF_PROFILE_SCHEMA,
    effort: toSdkEffort(input.effort),
    nocache: input.nocache,
    geo_target: geoTarget
  };

  return logger.call(() => client.generate.json(requestPayload), {
    competitorId: input.competitorId,
    pageId: input.pageId,
    endpoint: "generate",
    url: input.url,
    effort: input.effort,
    nocache: input.nocache,
    geoTarget: geoTarget?.country,
    isDemo: input.isDemo,
    fallback: input.fallback,
    expectedFields: SELF_PROFILE_EXPECTED_FIELDS
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- generate
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/tabstack/generate.ts lib/tabstack/__tests__/generate.test.ts
git commit -m "feat(tabstack): add generateSelfProfile + SELF_PROFILE_SCHEMA"
```

---

## Task 4: `generateSelfBrief` orchestrator in `lib/brief.ts`

**Files:**
- Modify: `lib/brief.ts`
- Test: `lib/__tests__/brief.test.ts` (add new describe block)

- [ ] **Step 1: Write a failing test**

Append a new `describe` block to `lib/__tests__/brief.test.ts` (mirror the existing `generateCompetitorBrief` test setup — same mocks plus a new `generateSelfProfileMock`):

```ts
describe("generateSelfBrief", () => {
  beforeEach(() => {
    competitorFindUniqueMock.mockReset();
    scanFindManyMock.mockReset();
    competitorUpdateMock.mockReset();
    // If you add `generateSelfProfileMock` to the hoisted vi.mock block, reset it here too.
  });

  it("stores the self-profile output on the self Competitor row", async () => {
    competitorFindUniqueMock.mockResolvedValue({
      ...COMPETITOR,
      isSelf: true
    });
    scanFindManyMock.mockResolvedValue([makeRecentScan()]);
    // generateSelfProfileMock returns a valid payload
    // competitorUpdateMock asserts intelligenceBrief = self profile shape, threatLevel = null

    const { generateSelfBrief } = await import("@/lib/brief");
    const payload = await generateSelfBrief("cmp_1", true);

    expect(payload).toMatchObject({
      positioning_summary: expect.any(String),
      icp_summary: expect.any(String),
      pricing_summary: expect.any(String)
    });
    expect(competitorUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmp_1" },
        data: expect.objectContaining({ threatLevel: null })
      })
    );
  });

  it("throws when no recent scans exist", async () => {
    competitorFindUniqueMock.mockResolvedValue({ ...COMPETITOR, isSelf: true });
    scanFindManyMock.mockResolvedValue([]);
    const { generateSelfBrief } = await import("@/lib/brief");
    await expect(generateSelfBrief("cmp_1")).rejects.toThrow(/no recent scans/i);
  });
});
```

Update the top-of-file hoisted `vi.mock` block to also export `generateSelfProfileMock` and reshape the `@/lib/tabstack/generate` mock:

```ts
const {
  competitorFindUniqueMock,
  scanFindManyMock,
  competitorUpdateMock,
  generateBriefMock,
  generateSelfProfileMock
} = vi.hoisted(() => ({
  competitorFindUniqueMock: vi.fn(),
  scanFindManyMock: vi.fn(),
  competitorUpdateMock: vi.fn(),
  generateBriefMock: vi.fn(),
  generateSelfProfileMock: vi.fn().mockResolvedValue({
    positioning_summary: "Rival is a competitive intelligence tool.",
    icp_summary: "Developers tracking competitors.",
    pricing_summary: "Open source, self-hosted.",
    differentiators: ["Powered by Tabstack", "Open source"],
    recent_signals: ["Added self-profile feature"]
  })
}));

vi.mock("@/lib/tabstack/generate", () => ({
  generateBrief: generateBriefMock,
  generateSelfProfile: generateSelfProfileMock
}));
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- brief
```

Expected: FAIL (`generateSelfBrief` not exported).

- [ ] **Step 3: Add `generateSelfBrief` to `lib/brief.ts`**

At the top, update imports:

```ts
import { generateBrief, generateSelfProfile } from "@/lib/tabstack/generate";
```

Add a constant above the functions (self's brief considers a broader page set than competitor brief — we include everything we've got):

```ts
const SELF_BRIEF_PAGE_TYPES: Set<string> | null = null; // null = include all page types
```

Below `generateCompetitorBrief`, add:

```ts
export async function generateSelfBrief(competitorId: string, nocache = true) {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    include: { pages: true }
  });

  if (!competitor) {
    throw new Error("Competitor not found");
  }

  const staleThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // 7 days
  const scans = await prisma.scan.findMany({
    where: { page: { competitorId } },
    include: { page: true },
    orderBy: { scannedAt: "desc" }
  });

  const latestByPage = new Map<string, { pageType: string; pageLabel: string; result: unknown }>();
  for (const scan of scans) {
    if (latestByPage.has(scan.pageId)) continue;
    if (scan.scannedAt < staleThreshold) continue;
    latestByPage.set(scan.pageId, {
      pageType: scan.page.type,
      pageLabel: scan.page.label,
      result: scan.markdownResult ?? scan.rawResult
    });
  }

  if (latestByPage.size === 0) {
    throw new Error("No recent scans available for self-profile generation");
  }

  // Self brief includes ALL page types. Unlike competitor briefs, we want every
  // signal from the user's own surfaces so the injected context is maximally
  // useful downstream.
  const contextData = JSON.stringify(
    [...latestByPage.values()].map((scan) => ({
      page_type: scan.pageType,
      page_label: scan.pageLabel,
      result: truncateResult(scan.result)
    }))
  );

  const response = await generateSelfProfile({
    competitorId,
    url: competitor.baseUrl,
    contextData,
    effort: "low",
    nocache
  });

  const payload = extractBriefPayload(response);

  await prisma.competitor.update({
    where: { id: competitorId },
    data: {
      intelligenceBrief: toJsonValue(payload),
      threatLevel: null,
      briefGeneratedAt: new Date()
    }
  });

  return payload;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- brief
```

Expected: PASS (both existing `generateCompetitorBrief` tests AND new `generateSelfBrief` tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/brief.ts lib/__tests__/brief.test.ts
git commit -m "feat(brief): add generateSelfBrief for self Competitor rows"
```

---

## Task 5: Branch `run-scans.ts` and `bootstrap-new-competitors.ts` on `isSelf`

**Files:**
- Modify: `lib/run-scans.ts`
- Modify: `scripts/bootstrap-new-competitors.ts`
- Test: `lib/__tests__/run-scans.test.ts` (check if this exists; if not, create minimal test)

- [ ] **Step 1: Write a failing test for `run-scans.ts` branching**

If `lib/__tests__/run-scans.test.ts` doesn't exist, create it. Mirror the Prisma mocking pattern from `brief.test.ts`. Key test:

```ts
it("calls generateSelfBrief for isSelf competitors and generateCompetitorBrief for others", async () => {
  competitorFindManyMock.mockResolvedValue([
    { id: "cmp_a", isSelf: false, pages: [] },
    { id: "cmp_self", isSelf: true, pages: [] }
  ]);
  scanPageMock.mockResolvedValue({});
  const { runScans } = await import("@/lib/run-scans");
  await runScans();

  expect(generateCompetitorBriefMock).toHaveBeenCalledWith("cmp_a", expect.any(Boolean));
  expect(generateSelfBriefMock).toHaveBeenCalledWith("cmp_self", expect.any(Boolean));
});
```

Wire the hoisted mocks to export `generateCompetitorBriefMock`, `generateSelfBriefMock`, `scanPageMock`, `competitorFindManyMock` as appropriate.

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- run-scans
```

Expected: FAIL.

- [ ] **Step 3: Update `lib/run-scans.ts`**

Import `generateSelfBrief`:

```ts
import { generateCompetitorBrief, generateSelfBrief } from "./brief";
```

Update the `CompetitorWithPages` type:

```ts
type CompetitorWithPages = {
  id: string;
  isSelf: boolean;
  pages: Array<{
    id: string;
    label: string;
    url: string;
    type: string;
    geoTarget: string | null;
  }>;
};
```

Update `processCompetitor` to branch on `competitor.isSelf`:

```ts
try {
  if (competitor.isSelf) {
    await generateSelfBrief(competitor.id, briefNocache);
  } else {
    await generateCompetitorBrief(competitor.id, briefNocache);
  }
  item.briefGenerated = true;
} catch (error) {
  item.errors.push(`brief: ${error instanceof Error ? error.message : "brief failed"}`);
}
```

No change needed to the `prisma.competitor.findMany` call — it returns `isSelf` automatically with the full model.

- [ ] **Step 4: Update `scripts/bootstrap-new-competitors.ts`**

Import `generateSelfBrief`:

```ts
import { generateCompetitorBrief, generateSelfBrief } from "@/lib/brief";
```

Update the `bootstrapCompetitor` parameter type:

```ts
async function bootstrapCompetitor(competitor: {
  id: string;
  slug: string;
  name: string;
  isSelf: boolean;
  pages: Array<{ id: string; label: string; url: string; type: string; geoTarget: string | null }>;
}) {
```

And its brief-gen block:

```ts
console.log(`[bootstrap] ${competitor.slug}: generating brief...`);
try {
  const payload = competitor.isSelf
    ? await generateSelfBrief(competitor.id, true)
    : await generateCompetitorBrief(competitor.id, true);
  const threat = competitor.isSelf ? "—" : ((payload as { threat_level?: string })?.threat_level ?? "—");
  console.log(
    `[bootstrap] ${competitor.slug}: brief generated (${competitor.isSelf ? "self-profile" : `threat=${threat}`}, scan errors=${scanErrors}).`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[bootstrap] ${competitor.slug}: brief failed: ${message}`);
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npm run test
```

Expected: PASS — all brief and run-scans tests green.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/run-scans.ts scripts/bootstrap-new-competitors.ts lib/__tests__/run-scans.test.ts
git commit -m "feat(scans): branch cron + bootstrap brief gen on isSelf"
```

---

## Task 6: `buildSelfContext` helper

**Files:**
- Create: `lib/context/self-context.ts`
- Create: `lib/context/__tests__/self-context.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/context/__tests__/self-context.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { competitorFindFirstMock } = vi.hoisted(() => ({
  competitorFindFirstMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    competitor: {
      findFirst: competitorFindFirstMock
    }
  }
}));

describe("buildSelfContext", () => {
  beforeEach(() => {
    competitorFindFirstMock.mockReset();
  });

  it("returns null when no self row exists", async () => {
    competitorFindFirstMock.mockResolvedValue(null);
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toBeNull();
  });

  it("returns null when self row has no intelligenceBrief", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: null,
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toBeNull();
  });

  it("returns a compact context string when brief is present", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "CI tool for devs",
        icp_summary: "Developers tracking competitors",
        pricing_summary: "Open source, self-hosted",
        differentiators: ["Powered by Tabstack", "Open source"],
        recent_signals: ["Added self-profile"]
      },
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).not.toBeNull();
    expect(result).toContain("Rival");
    expect(result).toContain("CI tool for devs");
    expect(result).toContain("Powered by Tabstack");
    expect(result!.length).toBeLessThanOrEqual(1200); // 800 target + framing overhead
  });

  it("lets manual_data override brief fields", async () => {
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: {
        positioning_summary: "OLD positioning",
        icp_summary: "Devs",
        pricing_summary: "Free",
        differentiators: [],
        recent_signals: []
      },
      manualData: { positioning_summary: "NEW positioning" }
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext();
    expect(result).toContain("NEW positioning");
    expect(result).not.toContain("OLD positioning");
  });

  it("skips injection when isDemo is true", async () => {
    // Even if a self row exists, demo scans must not inject self-context.
    competitorFindFirstMock.mockResolvedValue({
      id: "self_1",
      name: "Rival",
      isSelf: true,
      intelligenceBrief: { positioning_summary: "x", icp_summary: "x", pricing_summary: "x", differentiators: [], recent_signals: [] },
      manualData: null
    });
    const { buildSelfContext } = await import("@/lib/context/self-context");
    const result = await buildSelfContext({ isDemo: true });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- self-context
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `lib/context/self-context.ts`**

```ts
/**
 * Builds a compact context string describing the user's own company,
 * for injection into every competitor-facing AI call (brief, research, compare).
 *
 * When:
 * - Returns null if no self row exists, or if the self brief has not yet been
 *   generated. Callers pass through without injection.
 * - Returns null when isDemo is true. Demo scans target arbitrary URLs the user
 *   pastes, which are not the operator's product — injecting self-context
 *   would poison the output.
 *
 * Output shape: a short prose block capped at ~800 chars of payload, with
 * framing that tells the downstream prompt NOT to echo it back.
 */

import { prisma } from "@/lib/db/client";
import { isPlainObject } from "@/lib/utils/types";

const MAX_PAYLOAD_CHARS = 800;

type SelfBriefShape = {
  positioning_summary?: string;
  icp_summary?: string;
  pricing_summary?: string;
  differentiators?: string[];
  recent_signals?: string[];
};

function mergeBriefAndManual(
  brief: SelfBriefShape,
  manual: Record<string, unknown> | null
): { fields: SelfBriefShape; extras: Record<string, unknown> } {
  if (!manual) return { fields: brief, extras: {} };
  const merged: SelfBriefShape = { ...brief };
  const extras: Record<string, unknown> = {};
  const knownKeys = new Set([
    "positioning_summary",
    "icp_summary",
    "pricing_summary",
    "differentiators",
    "recent_signals"
  ]);
  for (const [key, value] of Object.entries(manual)) {
    if (knownKeys.has(key)) {
      (merged as Record<string, unknown>)[key] = value;
    } else {
      extras[key] = value;
    }
  }
  return { fields: merged, extras };
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "…";
}

export type BuildSelfContextOptions = {
  isDemo?: boolean;
};

export async function buildSelfContext(options: BuildSelfContextOptions = {}): Promise<string | null> {
  if (options.isDemo) return null;

  const self = await prisma.competitor.findFirst({
    where: { isSelf: true }
  });

  if (!self) return null;
  if (!self.intelligenceBrief || !isPlainObject(self.intelligenceBrief)) return null;

  const brief = self.intelligenceBrief as SelfBriefShape;
  const manual = isPlainObject(self.manualData) ? (self.manualData as Record<string, unknown>) : null;
  const { fields, extras } = mergeBriefAndManual(brief, manual);

  const parts: string[] = [];
  parts.push(`Name: ${self.name}`);
  if (fields.positioning_summary) parts.push(`Positioning: ${fields.positioning_summary}`);
  if (fields.icp_summary) parts.push(`ICP: ${fields.icp_summary}`);
  if (fields.pricing_summary) parts.push(`Pricing: ${fields.pricing_summary}`);
  if (fields.differentiators?.length) {
    parts.push(`What makes us distinct: ${fields.differentiators.join("; ")}`);
  }
  if (fields.recent_signals?.length) {
    parts.push(`Recent signals: ${fields.recent_signals.join("; ")}`);
  }
  if (Object.keys(extras).length > 0) {
    parts.push(`User notes: ${JSON.stringify(extras)}`);
  }

  const payload = truncate(parts.join("\n"), MAX_PAYLOAD_CHARS);

  return `CONTEXT — about the user's own company (who this brief is for):
${payload}
Use this to frame recommendations, threat levels, and opportunities relative to THIS company specifically. Do not echo this context in the output.`;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- self-context
```

Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/context
git commit -m "feat(context): add buildSelfContext helper"
```

---

## Task 7: Inject self-context into `generateBrief`

**Files:**
- Modify: `lib/tabstack/generate.ts` (`generateBrief` only — NOT `generateSelfProfile`)
- Test: `lib/tabstack/__tests__/generate.test.ts`

- [ ] **Step 1: Write a failing test**

Add to `lib/tabstack/__tests__/generate.test.ts`. At the top, extend the hoisted mock block to include `buildSelfContextMock`:

```ts
const { /* existing mocks */, buildSelfContextMock } = vi.hoisted(() => ({
  /* existing mocks */,
  buildSelfContextMock: vi.fn()
}));

vi.mock("@/lib/context/self-context", () => ({
  buildSelfContext: buildSelfContextMock
}));
```

Add a test:

```ts
describe("generateBrief with self-context injection", () => {
  beforeEach(() => {
    buildSelfContextMock.mockReset();
  });

  it("prepends self-context to instructions when buildSelfContext returns a string", async () => {
    buildSelfContextMock.mockResolvedValue("CONTEXT — about the user's own company...\nName: Rival");
    const { generateBrief } = await import("@/lib/tabstack/generate");

    await generateBrief({
      competitorId: "cmp_1",
      url: "https://acme.com",
      contextData: JSON.stringify([{ page_type: "homepage", result: {} }]),
      effort: "low",
      nocache: true
    });

    // Assert the mocked Tabstack client was called with instructions containing BOTH
    // "CONTEXT — about the user's own company" AND "Additional competitor context:"
    // (match the existing pattern in this test file for grabbing call args.)
  });

  it("calls generate without self-context prefix when buildSelfContext returns null", async () => {
    buildSelfContextMock.mockResolvedValue(null);
    const { generateBrief } = await import("@/lib/tabstack/generate");

    await generateBrief({
      competitorId: "cmp_1",
      url: "https://acme.com",
      contextData: "[]",
      effort: "low",
      nocache: true
    });

    // Assert instructions does NOT contain "CONTEXT — about the user's own company".
  });

  it("does not inject self-context for demo calls", async () => {
    buildSelfContextMock.mockImplementation(async (opts: { isDemo?: boolean }) =>
      opts?.isDemo ? null : "CONTEXT — about the user's own company..."
    );
    const { generateBrief } = await import("@/lib/tabstack/generate");

    await generateBrief({
      competitorId: null,
      url: "https://acme.com",
      contextData: "[]",
      effort: "low",
      nocache: true,
      isDemo: true
    });

    // Assert instructions does NOT contain the self-context block.
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- generate
```

Expected: FAIL (injection not implemented).

- [ ] **Step 3: Update `generateBrief` in `lib/tabstack/generate.ts`**

Import at the top:

```ts
import { buildSelfContext } from "@/lib/context/self-context";
```

Modify `generateBrief` to call `buildSelfContext` and prepend the result when non-null. Inside `generateBrief`, replace the `const instructions = ...` block:

```ts
const selfContext = await buildSelfContext({ isDemo: input.isDemo });
const instructions = `${selfContext ? `${selfContext}\n\n` : ""}You are a competitive intelligence analyst. Based on this competitor data,
produce a structured brief covering:
[... existing instructions body unchanged ...]

Additional competitor context:
${contextData}`;
```

(Keep the full existing rubric inside the instructions — don't truncate.)

**Do NOT modify `generateSelfProfile`.** It is analyzing self, not competitors — it must not inject self-context into its own prompt.

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- generate
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/tabstack/generate.ts lib/tabstack/__tests__/generate.test.ts
git commit -m "feat(brief): inject self-context into competitor brief prompts"
```

---

## Task 8: Inject self-context into `runResearch`

**Files:**
- Modify: `lib/tabstack/research.ts`
- Test: `lib/tabstack/__tests__/research.test.ts` (check if exists; if not, create with same mocking pattern)

- [ ] **Step 1: Write a failing test**

In the research test file (create if needed), mock `buildSelfContext` and assert:

```ts
it("prepends self-context to the research query when buildSelfContext returns a string", async () => {
  buildSelfContextMock.mockResolvedValue("CONTEXT — about the user's own company...\nName: Rival");

  const { runResearch } = await import("@/lib/tabstack/research");
  await runResearch({
    competitorId: "cmp_1",
    query: "What are customers saying about Acme?",
    mode: "fast"
  });

  // Assert mocked client.agent.research was called with a query containing BOTH
  // "CONTEXT — about the user's own company" AND the original question.
});

it("leaves the research query untouched when buildSelfContext returns null", async () => {
  buildSelfContextMock.mockResolvedValue(null);
  const { runResearch } = await import("@/lib/tabstack/research");
  await runResearch({
    competitorId: "cmp_1",
    query: "What are customers saying about Acme?",
    mode: "fast"
  });
  // Assert the mocked research call received the query unchanged.
});

it("does not inject self-context for demo research calls", async () => {
  buildSelfContextMock.mockImplementation(async (opts: { isDemo?: boolean }) =>
    opts?.isDemo ? null : "CONTEXT..."
  );
  const { runResearch } = await import("@/lib/tabstack/research");
  await runResearch({
    competitorId: null,
    query: "Anything",
    mode: "fast",
    isDemo: true
  });
  // Assert no self-context in query.
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- research
```

Expected: FAIL.

- [ ] **Step 3: Update `runResearch` in `lib/tabstack/research.ts`**

Import:

```ts
import { buildSelfContext } from "@/lib/context/self-context";
```

Modify the start of `runResearch`'s `logger.call` body:

```ts
return logger.call(
  async () => {
    const selfContext = await buildSelfContext({ isDemo: input.isDemo });
    const query = selfContext
      ? `${selfContext}\n\nRESEARCH QUESTION:\n${input.query}`
      : input.query;

    const stream = await client.agent.research({
      query,
      mode: input.mode,
      nocache: input.nocache
    });

    const { events, result, citations, error } = await collectStream(
      stream,
      input.maxStreamEvents ?? DEFAULT_MAX_STREAM_EVENTS
    );
    return { events, result, citations, error } satisfies ResearchResult;
  },
  // ... logger metadata unchanged
);
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test -- research
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/tabstack/research.ts lib/tabstack/__tests__/research.test.ts
git commit -m "feat(research): inject self-context into deep-dive research queries"
```

---

## Task 9: Filter self from competitor listings

**Files:**
- Modify: `lib/db/competitors.ts`
- Modify: `app/api/competitors/route.ts` (if any change needed)
- Modify: `app/page.tsx` (dashboard — it calls `prisma.competitor.findMany` directly)
- Test: `lib/db/__tests__/competitors.test.ts` (create or extend)

- [ ] **Step 1: Write a failing test for `listCompetitors`**

Create or extend `lib/db/__tests__/competitors.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  prisma: { competitor: { findMany: findManyMock } }
}));

describe("listCompetitors", () => {
  beforeEach(() => findManyMock.mockReset());

  it("excludes self rows by default", async () => {
    findManyMock.mockResolvedValue([]);
    const { listCompetitors } = await import("@/lib/db/competitors");
    await listCompetitors();
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isSelf: false } })
    );
  });

  it("includes self when includeSelf is true", async () => {
    findManyMock.mockResolvedValue([]);
    const { listCompetitors } = await import("@/lib/db/competitors");
    await listCompetitors({ includeSelf: true });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: { isSelf: false } })
    );
  });
});

describe("getSelfCompetitor", () => {
  beforeEach(() => findManyMock.mockReset());
  // Extend with mocks for findFirst if needed
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- competitors
```

Expected: FAIL.

- [ ] **Step 3: Update `lib/db/competitors.ts`**

```ts
import { prisma } from "@/lib/db/client";

export type CompetitorListFilters = {
  includePages?: boolean;
  includeSelf?: boolean;
};

export async function listCompetitors(filters: CompetitorListFilters = {}) {
  return prisma.competitor.findMany({
    where: filters.includeSelf ? undefined : { isSelf: false },
    orderBy: { name: "asc" },
    include: filters.includePages ? { pages: true } : undefined
  });
}

export async function getCompetitorById(id: string) {
  return prisma.competitor.findUnique({
    where: { id },
    include: { pages: true }
  });
}

export async function getCompetitorBySlug(slug: string) {
  return prisma.competitor.findUnique({
    where: { slug },
    include: { pages: true }
  });
}

export async function getSelfCompetitor() {
  return prisma.competitor.findFirst({
    where: { isSelf: true },
    include: { pages: true }
  });
}
```

- [ ] **Step 4: Update `app/page.tsx` dashboard query**

In `app/page.tsx`, inside `loadDashboardData`, change the competitor query:

```ts
const competitors = await prisma.competitor.findMany({
  where: { isSelf: false },
  orderBy: { name: "asc" }
});
```

(This keeps existing filtering, analysis, intel feed code unchanged — they already operate on `competitorIds` which now excludes self.)

- [ ] **Step 5: Verify `app/api/competitors/route.ts`**

No change required — it calls `listCompetitors({ includePages: true })` which now filters self automatically.

- [ ] **Step 6: Run tests**

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/db/competitors.ts lib/db/__tests__/competitors.test.ts app/page.tsx
git commit -m "feat(db,ui): exclude self from competitor listings by default"
```

---

## Task 10: `/api/self` route

**Files:**
- Create: `app/api/self/route.ts`
- Create: `app/api/self/__tests__/route.test.ts`

- [ ] **Step 1: Write a failing test**

Create `app/api/self/__tests__/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const { getSelfCompetitorMock, hasValidInternalApiKeyMock, isSameOriginRequestMock } = vi.hoisted(() => ({
  getSelfCompetitorMock: vi.fn(),
  hasValidInternalApiKeyMock: vi.fn(),
  isSameOriginRequestMock: vi.fn()
}));

vi.mock("@/lib/db/competitors", () => ({
  getSelfCompetitor: getSelfCompetitorMock
}));

vi.mock("@/app/api/_lib/auth", () => ({
  hasValidInternalApiKey: hasValidInternalApiKeyMock,
  isSameOriginRequest: isSameOriginRequestMock
}));

describe("/api/self", () => {
  it("returns 403 when neither internal key nor same origin", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(false);
    isSameOriginRequestMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/self/route");
    const response = await GET(new Request("http://localhost/api/self") as any);
    expect(response.status).toBe(403);
  });

  it("returns 200 with self payload when present", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(true);
    getSelfCompetitorMock.mockResolvedValue({ id: "self_1", name: "Rival", isSelf: true, pages: [] });
    const { GET } = await import("@/app/api/self/route");
    const response = await GET(new Request("http://localhost/api/self") as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.self?.slug).toBeUndefined(); // slug not required but name is
    expect(body.self?.name).toBe("Rival");
  });

  it("returns 200 with self: null when no self row exists", async () => {
    hasValidInternalApiKeyMock.mockReturnValue(true);
    isSameOriginRequestMock.mockReturnValue(true);
    getSelfCompetitorMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/self/route");
    const response = await GET(new Request("http://localhost/api/self") as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.self).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- api/self
```

Expected: FAIL (route not found).

- [ ] **Step 3: Create the route**

Create `app/api/self/route.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- api/self
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/self
git commit -m "feat(api): add /api/self read endpoint"
```

---

## Task 11: "Your Profile" dashboard section + detail page branching

**Files:**
- Modify: `app/page.tsx` (add Your Profile section)
- Modify: `app/[slug]/page.tsx` (hide threat UI for self; branch brief rendering)
- Create: `components/dashboard/SelfProfileCard.tsx`
- Create: `components/brief/SelfBriefView.tsx`

- [ ] **Step 1: Write a failing component test for `SelfProfileCard`**

Create `components/dashboard/__tests__/SelfProfileCard.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelfProfileCard } from "../SelfProfileCard";

describe("SelfProfileCard", () => {
  it("renders the self company name and positioning", () => {
    render(
      <SelfProfileCard
        self={{
          id: "self_1",
          name: "Rival",
          slug: "rival",
          baseUrl: "https://rival.so",
          intelligenceBrief: {
            positioning_summary: "CI for devs",
            icp_summary: "Devs",
            pricing_summary: "OSS",
            differentiators: ["Tabstack-powered"],
            recent_signals: []
          }
        } as any}
      />
    );
    expect(screen.getByText(/Your Profile/i)).toBeInTheDocument();
    expect(screen.getByText("Rival")).toBeInTheDocument();
    expect(screen.getByText(/CI for devs/i)).toBeInTheDocument();
  });

  it("renders an empty state when no brief has been generated", () => {
    render(
      <SelfProfileCard
        self={{
          id: "self_1",
          name: "Rival",
          slug: "rival",
          baseUrl: "https://rival.so",
          intelligenceBrief: null
        } as any}
      />
    );
    expect(screen.getByText(/not yet analyzed|no profile yet/i)).toBeInTheDocument();
  });
});
```

If `@testing-library/react` is not yet installed in the project, install it as a devDependency. Check `package.json` first; if not present, add it with:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom jsdom
```

And update `vitest.config.ts` to use the `jsdom` environment for React component tests. If component tests aren't yet a pattern in this repo, skip the React tests and manually verify instead — record the skip in the commit message.

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test -- SelfProfileCard
```

Expected: FAIL (component not found).

- [ ] **Step 3: Create `components/dashboard/SelfProfileCard.tsx`**

```tsx
import Link from "next/link";
import type { Competitor } from "@prisma/client";

type SelfBrief = {
  positioning_summary?: string;
  icp_summary?: string;
  pricing_summary?: string;
  differentiators?: string[];
  recent_signals?: string[];
};

function isSelfBrief(value: unknown): value is SelfBrief {
  return typeof value === "object" && value !== null;
}

export function SelfProfileCard({ self }: { self: Competitor }) {
  const brief = isSelfBrief(self.intelligenceBrief) ? (self.intelligenceBrief as SelfBrief) : null;

  return (
    <section className="self-profile-card">
      <div className="self-profile-card__header">
        <h2>Your Profile</h2>
        <Link href={`/${self.slug}`} className="self-profile-card__link">
          View details →
        </Link>
      </div>
      <div className="self-profile-card__body">
        <h3>{self.name}</h3>
        {brief?.positioning_summary ? (
          <p className="self-profile-card__positioning">{brief.positioning_summary}</p>
        ) : (
          <p className="self-profile-card__empty">
            Not yet analyzed — self-profile will populate on the next scan cycle.
          </p>
        )}
        {brief?.icp_summary && (
          <p className="self-profile-card__icp"><strong>ICP:</strong> {brief.icp_summary}</p>
        )}
        {brief?.pricing_summary && (
          <p className="self-profile-card__pricing"><strong>Pricing:</strong> {brief.pricing_summary}</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add styles in `app/globals.css`**

Append:

```css
.self-profile-card {
  border: 1px solid var(--border-subtle, #e5e5e5);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 2rem;
  background: var(--surface-1, #fafafa);
}
.self-profile-card__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
}
.self-profile-card__header h2 {
  margin: 0;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #666);
}
.self-profile-card__link {
  font-size: 0.875rem;
}
.self-profile-card__body h3 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}
.self-profile-card__positioning { margin: 0 0 0.5rem; }
.self-profile-card__icp,
.self-profile-card__pricing { margin: 0.25rem 0; font-size: 0.9rem; color: var(--text-secondary, #444); }
.self-profile-card__empty { color: var(--text-muted, #666); font-style: italic; }
```

(Match variable names to what already exists in `app/globals.css`. If those variables don't exist, use direct values.)

- [ ] **Step 5: Wire `SelfProfileCard` into `app/page.tsx`**

At the top, import:

```ts
import { SelfProfileCard } from "@/components/dashboard/SelfProfileCard";
import { getSelfCompetitor } from "@/lib/db/competitors";
```

In `loadDashboardData` (or wherever the page fetches data), also fetch self:

```ts
const [competitors, self] = await Promise.all([
  prisma.competitor.findMany({ where: { isSelf: false }, orderBy: { name: "asc" } }),
  getSelfCompetitor()
]);
```

Pass `self` down to the page component. In the JSX, above the existing `<ThreatMatrix>` / `<IntelFeed>` render:

```tsx
{self && <SelfProfileCard self={self} />}
```

- [ ] **Step 6: Create `components/brief/SelfBriefView.tsx`**

```tsx
type SelfBrief = {
  positioning_summary?: string;
  icp_summary?: string;
  pricing_summary?: string;
  differentiators?: string[];
  recent_signals?: string[];
};

export function SelfBriefView({ brief }: { brief: SelfBrief }) {
  return (
    <div className="self-brief">
      {brief.positioning_summary && (
        <section>
          <h3>Positioning</h3>
          <p>{brief.positioning_summary}</p>
        </section>
      )}
      {brief.icp_summary && (
        <section>
          <h3>ICP</h3>
          <p>{brief.icp_summary}</p>
        </section>
      )}
      {brief.pricing_summary && (
        <section>
          <h3>Pricing</h3>
          <p>{brief.pricing_summary}</p>
        </section>
      )}
      {brief.differentiators && brief.differentiators.length > 0 && (
        <section>
          <h3>Differentiators</h3>
          <ul>
            {brief.differentiators.map((item, i) => (<li key={i}>{item}</li>))}
          </ul>
        </section>
      )}
      {brief.recent_signals && brief.recent_signals.length > 0 && (
        <section>
          <h3>Recent Signals</h3>
          <ul>
            {brief.recent_signals.map((item, i) => (<li key={i}>{item}</li>))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Update `app/[slug]/page.tsx` to branch brief rendering and hide threat UI for self**

Read the current file first. Where it renders the threat-level badge and the competitor brief, add a branch:

```tsx
{competitor.isSelf ? (
  <SelfBriefView brief={competitor.intelligenceBrief as any} />
) : (
  // ...existing competitor brief rendering + threat badge
)}
```

Import `SelfBriefView` at the top.

- [ ] **Step 8: Run tests**

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 9: Typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: both PASS.

- [ ] **Step 10: Manual verification**

```bash
npm run dev
```

With a self row seeded and a brief generated, verify:
- `/` shows "Your Profile" card at top, self not in competitor list
- `/<self-slug>` renders `SelfBriefView`, no threat badge, scan history link works
- `/<competitor-slug>` unchanged behavior, threat badge present

- [ ] **Step 11: Commit**

```bash
git add app/page.tsx app/[slug]/page.tsx components/dashboard/SelfProfileCard.tsx components/brief/SelfBriefView.tsx app/globals.css components/dashboard/__tests__
git commit -m "feat(ui): add Your Profile dashboard section and self brief view"
```

---

## Task 12: Add `self` block to `rivals.config.json`

**Files:**
- Modify: `rivals.config.json`

This is a project-specific content change. Only include pages that actually exist for Rival's own site today.

- [ ] **Step 1: Add the self block**

Open `rivals.config.json`. Above the `"competitors"` array, insert:

```json
{
  "self": {
    "name": "Rival",
    "slug": "rival",
    "url": "https://rival.so",
    "pages": [
      { "label": "Homepage", "url": "https://rival.so", "type": "homepage" }
    ]
  },
  "competitors": [ ... existing ... ]
}
```

Start with just the homepage. Add pricing / changelog / blog / about / github / docs / social / careers as they become real URLs on the Rival site. Do not add URLs that 404 — the scanner will log noise.

- [ ] **Step 2: Local seed + bootstrap dry run**

With a local database:

```bash
npm run db:seed
npm run bootstrap-new
```

Expected: a `Rival` row is inserted with `is_self=true`, homepage scan runs, self brief generates.

- [ ] **Step 3: Verify self-brief is present**

```bash
npx prisma studio
```

Navigate to `competitors`. Confirm the Rival row has `is_self = true`, `intelligence_brief` populated with the self-profile shape.

- [ ] **Step 4: Verify self-context injection end-to-end**

Run a single competitor scan manually (choose one existing competitor):

```bash
# via the /api/scan route, or tsx script, or trigger cron locally
```

Confirm in `api_logs` that the subsequent `generate` call's instructions include the "CONTEXT — about the user's own company" block. (If the logger doesn't store the full prompt, add a debug `console.log` in `generateBrief` for this verification step and remove before committing.)

- [ ] **Step 5: Commit**

```bash
git add rivals.config.json
git commit -m "feat(config): add Rival self entry to rivals.config.json"
```

---

## Task 13: End-to-end validation and PR

- [ ] **Step 1: Full test suite + coverage**

```bash
npm run test:coverage
```

Expected: PASS, coverage ≥ 80% per CLAUDE.md.

- [ ] **Step 2: Typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: both PASS.

- [ ] **Step 3: Update DX notes**

Per CLAUDE.md, any change in `lib/tabstack/*.ts` must update `notes-local/tabstack-dx-notes.md`. Append entries about:

- Injecting operator/self context into `/generate` instructions (DX observation: was the string prepend ergonomic? did the 800-char cap feel right?)
- Reusing `/generate` with a second schema (`SELF_PROFILE_SCHEMA`) alongside `BRIEF_SCHEMA` (DX observation: schema structuring overhead? readability of the calling code?)
- Prepending context to a natural-language `/research` `query` (DX observation: was that the right surface area, or would a separate system-prompt-equivalent be cleaner?)

- [ ] **Step 4: Commit DX notes**

```bash
git add notes-local/tabstack-dx-notes.md
git commit -m "docs(dx): self-profile DX observations for Tabstack integration"
```

- [ ] **Step 5: Push branch and open PR**

```bash
git push -u origin feat/self-profile-spec
gh pr create --title "feat: self-profile for personalized competitive context" --body "$(cat <<'EOF'
## Summary
- Add `isSelf` flag to `Competitor` model (partial unique index) so the user's own company rides the existing scanner/cron/brief pipeline
- Add `SELF_PROFILE_SCHEMA` + `generateSelfProfile` in `lib/tabstack/generate.ts` and `generateSelfBrief` in `lib/brief.ts` for self-analysis
- Add `buildSelfContext()` helper; inject into `generateBrief` and `runResearch` so every competitor-facing AI call gets context about the user's company
- Filter self from competitor listings; add "Your Profile" dashboard section and self-specific detail-page brief view
- Config: new top-level `self` block in `rivals.config.json`, seeded the same way as competitors

See spec: `docs/superpowers/specs/2026-04-21-self-profile-design.md`

## Test plan
- [ ] `npm run test:coverage` passes with ≥80% coverage
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Local seed + bootstrap produces a self row with is_self=true and a self-profile brief
- [ ] `/` dashboard renders "Your Profile" section; self is NOT in the competitor grid
- [ ] A competitor brief generated AFTER the self brief exists contains self-context in its `/generate` instructions (verify via api_logs or temporary debug log)
- [ ] Demo scan path (`isDemo: true`) does NOT include self-context in its prompts
EOF
)"
```

---

## Self-Review (complete before handoff)

- [ ] **Spec coverage:** Every section of the spec is covered by at least one task above. Specifically:
  - Config shape (spec §Config) → Task 2 + Task 12
  - DB change (spec §Database) → Task 1
  - Seed (spec §Seed) → Task 2
  - Bootstrap + cron (spec §Bootstrap and Cron, §Branching) → Task 5
  - Self brief (spec §Self Brief) → Tasks 3, 4
  - Context injection (spec §Context Injection, §Injection Sites, §Demo path) → Tasks 6, 7, 8
  - API (spec §API Routes) → Tasks 9, 10
  - UI (spec §Dashboard UI) → Task 11
  - Rollout + project config (spec §Rollout) → Task 12
- [ ] **No placeholders** — every step has actual code, exact file paths, exact commands
- [ ] **Type consistency** — `isSelf` (camelCase TS) / `is_self` (snake_case SQL column) used consistently throughout
- [ ] **Function name consistency** — `generateSelfProfile` (Tabstack layer), `generateSelfBrief` (orchestrator), `buildSelfContext` (injection helper) used identically in every task
- [ ] **Test coverage** — every new function has at least one unit test with a failing-test-first step
- [ ] **Demo guard** — `buildSelfContext({ isDemo })` is tested and enforced at every injection site
