# Positioning Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/matrix` page — a 2×2 quadrant scatter plot of all tracked competitors, with LLM-scored positioning axes configured in `rivals.config.json` and native SVG download.

**Architecture:** Extend `BRIEF_SCHEMA` with 5 numeric axis scores (0–10) the LLM fills during brief generation. Matrix config (which two axes to plot, axis labels, quadrant labels) lives in `rivals.config.json`. The `/matrix` server component page reads competitor brief data from Postgres and matrix config from the config file, rendering a pure SVG scatter plot. A `"use client"` download button serializes the SVG to a file.

**Tech Stack:** Next.js App Router (server + client components), Prisma, Vitest, plain SVG (no charting library)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/tabstack/generate.ts` | Modify | Add 5 axis score fields to `BRIEF_SCHEMA` + `BRIEF_EXPECTED_FIELDS` |
| `lib/tabstack/__tests__/generate.test.ts` | Modify | Tests for new schema fields |
| `lib/config/rival-config.ts` | Modify | Add `MatrixConfig` type, `parseRivalConfig` matrix support, `loadRivalConfig()` |
| `lib/config/__tests__/rival-config.test.ts` | Modify | Tests for matrix config parsing |
| `app/compare/` → `app/matrix/` | Rename dir | Move placeholder dir |
| `app/matrix/page.tsx` | Create | Server component page |
| `components/matrix/PositioningMatrix.tsx` | Create | SVG chart component |
| `components/matrix/MatrixDownloadButton.tsx` | Create | Client component — SVG download |
| `app/page.tsx` | Modify | Add Matrix nav link to dashboard header |
| `rivals.config.json` | Modify | Add default `matrix` block |
| `notes-local/tabstack-dx-notes.md` | Modify | DX observations (required per CLAUDE.md) |

---

## Task 1: Extend BRIEF_SCHEMA with axis scores

**Files:**
- Modify: `lib/tabstack/generate.ts`
- Modify: `lib/tabstack/__tests__/generate.test.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block to `lib/tabstack/__tests__/generate.test.ts` (after the existing `generateDiff` describe):

```typescript
describe("BRIEF_SCHEMA axis scores", () => {
  it("includes all five axis score fields as number type", async () => {
    const { BRIEF_SCHEMA } = await import("@/lib/tabstack/generate");
    const props = BRIEF_SCHEMA.properties as Record<string, { type: string; minimum?: number; maximum?: number }>;
    const axisFields = [
      "openness_score",
      "brand_trust_score",
      "pricing_score",
      "market_maturity_score",
      "feature_breadth_score"
    ];
    for (const field of axisFields) {
      expect(props[field], `${field} missing from BRIEF_SCHEMA`).toBeDefined();
      expect(props[field].type).toBe("number");
      expect(props[field].minimum).toBe(0);
      expect(props[field].maximum).toBe(10);
    }
  });

  it("includes all five axis score fields in BRIEF_EXPECTED_FIELDS", async () => {
    const { BRIEF_EXPECTED_FIELDS } = await import("@/lib/tabstack/generate");
    for (const field of [
      "openness_score",
      "brand_trust_score",
      "pricing_score",
      "market_maturity_score",
      "feature_breadth_score"
    ]) {
      expect(BRIEF_EXPECTED_FIELDS).toContain(field);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm run test lib/tabstack/__tests__/generate.test.ts
```

Expected: FAIL — "openness_score missing from BRIEF_SCHEMA"

- [ ] **Step 3: Add five fields to `BRIEF_SCHEMA.properties` in `lib/tabstack/generate.ts`**

In `lib/tabstack/generate.ts`, find the `BRIEF_SCHEMA` constant. After the `watch_list` property block, add:

```typescript
    openness_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description:
        "0 = fully open source, transparent, no lock-in; 10 = fully proprietary, closed, high lock-in"
    },
    brand_trust_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = low brand recognition and trust; 10 = high brand recognition and trust"
    },
    pricing_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = entirely free or open source; 10 = premium or enterprise pricing only"
    },
    market_maturity_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description: "0 = early-stage or emerging; 10 = established and mature market presence"
    },
    feature_breadth_score: {
      type: "number",
      minimum: 0,
      maximum: 10,
      description:
        "0 = narrow specialist with a single focused use case; 10 = broad generalist covering many use cases"
    }
```

- [ ] **Step 4: Add the five fields to the `required` array in `BRIEF_SCHEMA`**

The `required` array currently reads:
```typescript
  required: [
    "positioning_opportunity",
    "content_opportunity",
    "product_opportunity",
    "threat_level",
    "threat_reasoning",
    "watch_list"
  ]
```

Replace it with:
```typescript
  required: [
    "positioning_opportunity",
    "content_opportunity",
    "product_opportunity",
    "threat_level",
    "threat_reasoning",
    "watch_list",
    "openness_score",
    "brand_trust_score",
    "pricing_score",
    "market_maturity_score",
    "feature_breadth_score"
  ]
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test lib/tabstack/__tests__/generate.test.ts
```

Expected: all PASS

- [ ] **Step 6: Full test suite**

```bash
npm run test
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add lib/tabstack/generate.ts lib/tabstack/__tests__/generate.test.ts
git commit -m "feat(brief): add axis score fields to BRIEF_SCHEMA for positioning matrix (#70)"
```

---

## Task 2: Add matrix config type to rival-config

**Files:**
- Modify: `lib/config/rival-config.ts`
- Modify: `lib/config/__tests__/rival-config.test.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block to `lib/config/__tests__/rival-config.test.ts`:

```typescript
describe("parseRivalConfig matrix block", () => {
  it("returns null matrix when config has no matrix block", () => {
    const result = parseRivalConfig({ competitors: [] });
    expect(result.matrix).toBeNull();
  });

  it("parses a valid matrix block", () => {
    const result = parseRivalConfig({
      competitors: [],
      matrix: {
        x_axis: { key: "openness_score", label_low: "Open Source", label_high: "Proprietary" },
        y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" }
      }
    });
    expect(result.matrix).not.toBeNull();
    expect(result.matrix?.x_axis.key).toBe("openness_score");
    expect(result.matrix?.y_axis.label_high).toBe("High Trust");
  });

  it("parses optional quadrant_labels when all four are present", () => {
    const result = parseRivalConfig({
      competitors: [],
      matrix: {
        x_axis: { key: "openness_score", label_low: "Open Source", label_high: "Proprietary" },
        y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" },
        quadrant_labels: {
          top_left: "Trusted OSS",
          top_right: "Established Leaders",
          bottom_left: "Emerging Players",
          bottom_right: "Niche Specialists"
        }
      }
    });
    expect(result.matrix?.quadrant_labels?.top_right).toBe("Established Leaders");
    expect(result.matrix?.quadrant_labels?.bottom_left).toBe("Emerging Players");
  });

  it("returns null matrix when axis key is not a valid dimension", () => {
    const result = parseRivalConfig({
      competitors: [],
      matrix: {
        x_axis: { key: "not_a_valid_key", label_low: "Low", label_high: "High" },
        y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" }
      }
    });
    expect(result.matrix).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm run test lib/config/__tests__/rival-config.test.ts
```

Expected: FAIL — "returns null matrix when config has no matrix block" (no `matrix` property on `ParsedRivalConfig`)

- [ ] **Step 3: Replace `lib/config/rival-config.ts` with the updated version**

```typescript
import fs from "node:fs";
import path from "node:path";

export type MatrixAxisKey =
  | "openness_score"
  | "brand_trust_score"
  | "pricing_score"
  | "market_maturity_score"
  | "feature_breadth_score";

export type MatrixAxisConfig = {
  key: MatrixAxisKey;
  label_low: string;
  label_high: string;
};

export type MatrixQuadrantLabels = {
  top_left: string;
  top_right: string;
  bottom_left: string;
  bottom_right: string;
};

export type MatrixConfig = {
  x_axis: MatrixAxisConfig;
  y_axis: MatrixAxisConfig;
  quadrant_labels?: MatrixQuadrantLabels;
};

export const DEFAULT_MATRIX_CONFIG: MatrixConfig = {
  x_axis: { key: "openness_score", label_low: "Open Source", label_high: "Proprietary" },
  y_axis: { key: "brand_trust_score", label_low: "Low Trust", label_high: "High Trust" },
  quadrant_labels: {
    top_left: "Trusted OSS",
    top_right: "Established Leaders",
    bottom_left: "Emerging Players",
    bottom_right: "Niche Specialists"
  }
};

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
  matrix: MatrixConfig | null;
};

type RawAxisConfig = {
  key?: string;
  label_low?: string;
  label_high?: string;
};

type RawConfig = {
  self?: RivalConfigEntry;
  competitors?: RivalConfigEntry[];
  matrix?: {
    x_axis?: RawAxisConfig;
    y_axis?: RawAxisConfig;
    quadrant_labels?: Partial<MatrixQuadrantLabels>;
  };
};

const VALID_AXIS_KEYS = new Set<MatrixAxisKey>([
  "openness_score",
  "brand_trust_score",
  "pricing_score",
  "market_maturity_score",
  "feature_breadth_score"
]);

function isValidAxisKey(key: unknown): key is MatrixAxisKey {
  return typeof key === "string" && VALID_AXIS_KEYS.has(key as MatrixAxisKey);
}

function parseAxisConfig(raw: RawAxisConfig | undefined): MatrixAxisConfig | null {
  if (!raw) return null;
  if (!isValidAxisKey(raw.key)) return null;
  if (typeof raw.label_low !== "string" || typeof raw.label_high !== "string") return null;
  return { key: raw.key, label_low: raw.label_low, label_high: raw.label_high };
}

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

  let matrix: MatrixConfig | null = null;
  if (raw.matrix) {
    const x = parseAxisConfig(raw.matrix.x_axis);
    const y = parseAxisConfig(raw.matrix.y_axis);
    if (x && y) {
      matrix = { x_axis: x, y_axis: y };
      const ql = raw.matrix.quadrant_labels;
      if (
        ql &&
        typeof ql.top_left === "string" &&
        typeof ql.top_right === "string" &&
        typeof ql.bottom_left === "string" &&
        typeof ql.bottom_right === "string"
      ) {
        matrix.quadrant_labels = ql as MatrixQuadrantLabels;
      }
    }
  }

  return { self, competitors, matrix };
}

export function loadRivalConfig(): ParsedRivalConfig {
  const configPath = path.join(process.cwd(), "rivals.config.json");
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as RawConfig;
  return parseRivalConfig(raw);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test lib/config/__tests__/rival-config.test.ts
```

Expected: all PASS

- [ ] **Step 5: Full test suite**

```bash
npm run test
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add lib/config/rival-config.ts lib/config/__tests__/rival-config.test.ts
git commit -m "feat(config): add MatrixConfig type and loadRivalConfig to rival-config (#70)"
```

---

## Task 3: Create PositioningMatrix SVG component

**Files:**
- Create: `components/matrix/PositioningMatrix.tsx`

No unit test — pure SVG layout, vitest is `node` environment (no DOM). Visual correctness verified by running the dev server in Task 6.

- [ ] **Step 1: Create `components/matrix/PositioningMatrix.tsx`**

```tsx
import type { MatrixConfig } from "@/lib/config/rival-config";

export type MatrixPoint = {
  name: string;
  slug: string;
  x: number; // 0–10
  y: number; // 0–10
};

type Props = {
  points: MatrixPoint[];
  config: MatrixConfig;
};

const SVG_W = 560;
const SVG_H = 560;
const M = 70; // margin
const PLOT = SVG_W - M * 2; // 420px plot area
const MID_X = M + PLOT / 2;
const MID_Y = M + PLOT / 2;

function toSvgX(score: number): number {
  return M + (score / 10) * PLOT;
}

function toSvgY(score: number): number {
  // SVG y increases downward; score 10 = top of plot
  return M + PLOT - (score / 10) * PLOT;
}

const monoSm = {
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const
};

export function PositioningMatrix({ points, config }: Props) {
  const ql = config.quadrant_labels;

  return (
    <svg
      id="positioning-matrix-svg"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      style={{ display: "block", maxWidth: "100%", background: "var(--paper)" }}
      aria-label="Competitive positioning matrix"
    >
      {/* Quadrant tints */}
      <rect x={M} y={M} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.5} />
      <rect x={MID_X} y={M} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.2} />
      <rect x={M} y={MID_Y} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.2} />
      <rect x={MID_X} y={MID_Y} width={PLOT / 2} height={PLOT / 2} fill="var(--paper-edge)" opacity={0.5} />

      {/* Plot border */}
      <rect x={M} y={M} width={PLOT} height={PLOT} fill="none" stroke="var(--ink)" strokeWidth={1} />

      {/* Quadrant dividers */}
      <line x1={MID_X} y1={M} x2={MID_X} y2={M + PLOT} stroke="var(--ink)" strokeWidth={0.5} strokeDasharray="4 4" />
      <line x1={M} y1={MID_Y} x2={M + PLOT} y2={MID_Y} stroke="var(--ink)" strokeWidth={0.5} strokeDasharray="4 4" />

      {/* Quadrant labels */}
      {ql && (
        <>
          <text x={M + 8} y={M + 16} fill="var(--ink-faint)" style={monoSm}>{ql.top_left}</text>
          <text x={MID_X + 8} y={M + 16} fill="var(--ink-faint)" style={monoSm}>{ql.top_right}</text>
          <text x={M + 8} y={MID_Y + 16} fill="var(--ink-faint)" style={monoSm}>{ql.bottom_left}</text>
          <text x={MID_X + 8} y={MID_Y + 16} fill="var(--ink-faint)" style={monoSm}>{ql.bottom_right}</text>
        </>
      )}

      {/* X-axis labels */}
      <text
        x={M}
        y={M + PLOT + 22}
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        ← {config.x_axis.label_low}
      </text>
      <text
        x={M + PLOT}
        y={M + PLOT + 22}
        textAnchor="end"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.x_axis.label_high} →
      </text>

      {/* Y-axis labels */}
      <text
        x={M - 10}
        y={M + PLOT}
        textAnchor="end"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.y_axis.label_low}
      </text>
      <text
        x={M - 10}
        y={M + 4}
        textAnchor="end"
        fill="var(--ink-mute)"
        style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}
      >
        {config.y_axis.label_high}
      </text>

      {/* Competitor dots + name labels */}
      {points.map((pt) => {
        const cx = toSvgX(pt.x);
        const cy = toSvgY(pt.y);
        const nearRight = cx > M + PLOT - 90;
        return (
          <g key={pt.slug}>
            <circle cx={cx} cy={cy} r={6} fill="var(--ink)" />
            <text
              x={nearRight ? cx - 10 : cx + 10}
              y={cy + 4}
              textAnchor={nearRight ? "end" : "start"}
              fill="var(--ink)"
              style={{ fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              {pt.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/matrix/PositioningMatrix.tsx
git commit -m "feat(matrix): add PositioningMatrix SVG component (#70)"
```

---

## Task 4: Create MatrixDownloadButton client component

**Files:**
- Create: `components/matrix/MatrixDownloadButton.tsx`

- [ ] **Step 1: Create `components/matrix/MatrixDownloadButton.tsx`**

```tsx
"use client";

import { RDSButton } from "@/components/rds";

export function MatrixDownloadButton() {
  function handleDownload() {
    const svg = document.getElementById("positioning-matrix-svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rival-matrix.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RDSButton variant="ghost" size="sm" onClick={handleDownload}>
      Download SVG
    </RDSButton>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/matrix/MatrixDownloadButton.tsx
git commit -m "feat(matrix): add MatrixDownloadButton client component (#70)"
```

---

## Task 5: Create the /matrix page

**Files:**
- Rename: `app/compare/` → `app/matrix/`
- Create: `app/matrix/page.tsx`

- [ ] **Step 1: Rename the compare directory**

```bash
git mv app/compare app/matrix
```

- [ ] **Step 2: Create `app/matrix/page.tsx`**

```tsx
import { prisma } from "@/lib/db/client";
import {
  loadRivalConfig,
  DEFAULT_MATRIX_CONFIG,
  type MatrixConfig,
  type MatrixAxisKey
} from "@/lib/config/rival-config";
import { PositioningMatrix, type MatrixPoint } from "@/components/matrix/PositioningMatrix";
import { MatrixDownloadButton } from "@/components/matrix/MatrixDownloadButton";
import { RDSPageShell, RDSHeader, RDSFooter, RDSEmpty, RDSKicker } from "@/components/rds";

export const dynamic = "force-dynamic";

function getAxisScore(brief: unknown, key: MatrixAxisKey): number | null {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) return null;
  const val = (brief as Record<string, unknown>)[key];
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return Math.max(0, Math.min(10, val));
}

export default async function MatrixPage() {
  let matrixConfig: MatrixConfig;
  try {
    const config = loadRivalConfig();
    matrixConfig = config.matrix ?? DEFAULT_MATRIX_CONFIG;
  } catch {
    matrixConfig = DEFAULT_MATRIX_CONFIG;
  }

  const competitors = await prisma.competitor.findMany({
    where: { isSelf: false },
    select: { id: true, name: true, slug: true, intelligenceBrief: true },
    orderBy: { name: "asc" }
  });

  const points: MatrixPoint[] = [];
  let missingScores = 0;

  for (const c of competitors) {
    const x = getAxisScore(c.intelligenceBrief, matrixConfig.x_axis.key);
    const y = getAxisScore(c.intelligenceBrief, matrixConfig.y_axis.key);
    if (x === null || y === null) {
      missingScores++;
      continue;
    }
    points.push({ name: c.name, slug: c.slug, x, y });
  }

  const hasEnoughData = points.length >= 2;

  return (
    <RDSPageShell>
      <RDSHeader right={hasEnoughData ? <MatrixDownloadButton /> : null} />

      <div style={{ marginBottom: 24 }}>
        <RDSKicker>Competitive Landscape</RDSKicker>
        <h1
          style={{
            margin: "6px 0 4px",
            fontSize: "var(--fs-28)",
            fontWeight: 700,
            fontFamily: "var(--font-serif)",
            letterSpacing: "var(--tr-snug)"
          }}
        >
          Positioning Matrix
        </h1>
        <p style={{ margin: 0, color: "var(--ink-mute)", fontSize: "var(--fs-14)" }}>
          {matrixConfig.x_axis.label_low} ↔ {matrixConfig.x_axis.label_high} vs{" "}
          {matrixConfig.y_axis.label_low} ↔ {matrixConfig.y_axis.label_high}
        </p>
      </div>

      {!hasEnoughData ? (
        <RDSEmpty
          title="Not enough data"
          body={
            missingScores > 0
              ? `${missingScores} competitor${missingScores === 1 ? "" : "s"} ${
                  missingScores === 1 ? "has" : "have"
                } no brief scores yet. Re-generate briefs to populate the matrix.`
              : "Add at least 2 competitors and generate their intelligence briefs to see the positioning matrix."
          }
        />
      ) : (
        <div>
          <PositioningMatrix points={points} config={matrixConfig} />
          {missingScores > 0 && (
            <p
              style={{
                marginTop: 12,
                fontSize: "var(--fs-12)",
                color: "var(--ink-faint)",
                fontFamily: "var(--font-mono)"
              }}
            >
              {missingScores} competitor{missingScores === 1 ? "" : "s"} excluded — brief scores missing. Re-generate to
              include.
            </p>
          )}
        </div>
      )}

      <RDSFooter />
    </RDSPageShell>
  );
}
```

- [ ] **Step 3: Remove the .gitkeep placeholder**

```bash
git rm app/matrix/.gitkeep
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors. If you see "Cannot find module '@/components/matrix/...'" errors, verify the component files from Tasks 3 and 4 are saved correctly.

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Step 6: Commit**

```bash
git add app/matrix/page.tsx
git commit -m "feat(matrix): add /matrix server component page (#70)"
```

---

## Task 6: Add Matrix link to dashboard nav and update rivals.config.json

**Files:**
- Modify: `app/page.tsx`
- Modify: `rivals.config.json`

- [ ] **Step 1: Add Matrix link to `HeaderRow` in `app/page.tsx`**

Find this function in `app/page.tsx`:

```tsx
function HeaderRow({ self, generatedAt }: { self: DashboardData["self"]; generatedAt: string }) {
  return (
    <RDSHeader
      right={
        <>
          <span style={{ letterSpacing: "0.04em" }}>{generatedAt}</span>
          <RDSLiveDot />
          {self && <SelfChip name={self.name} slug={self.slug} />}
        </>
      }
    />
  );
}
```

Replace it with:

```tsx
function HeaderRow({ self, generatedAt }: { self: DashboardData["self"]; generatedAt: string }) {
  return (
    <RDSHeader
      right={
        <>
          <Link
            href="/matrix"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-11)",
              color: "var(--ink-faint)",
              letterSpacing: "0.08em",
              textDecoration: "none",
              textTransform: "uppercase"
            }}
          >
            Matrix
          </Link>
          <Link
            href="/insights"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-11)",
              color: "var(--ink-faint)",
              letterSpacing: "0.08em",
              textDecoration: "none",
              textTransform: "uppercase"
            }}
          >
            Insights
          </Link>
          <span style={{ letterSpacing: "0.04em" }}>{generatedAt}</span>
          <RDSLiveDot />
          {self && <SelfChip name={self.name} slug={self.slug} />}
        </>
      }
    />
  );
}
```

- [ ] **Step 2: Add default matrix block to `rivals.config.json`**

At the top level of `rivals.config.json`, after the `competitors` array, add:

```json
"matrix": {
  "x_axis": {
    "key": "openness_score",
    "label_low": "Open Source",
    "label_high": "Proprietary"
  },
  "y_axis": {
    "key": "brand_trust_score",
    "label_low": "Low Trust",
    "label_high": "High Trust"
  },
  "quadrant_labels": {
    "top_left": "Trusted OSS",
    "top_right": "Established Leaders",
    "bottom_left": "Emerging Players",
    "bottom_right": "Niche Specialists"
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx rivals.config.json
git commit -m "feat(matrix): add Matrix nav link and default config (#70)"
```

---

## Task 7: Update DX notes and run full verification

**Files:**
- Modify: `notes-local/tabstack-dx-notes.md`

- [ ] **Step 1: Add DX entry to `notes-local/tabstack-dx-notes.md`**

Using the Fast Entry Template, add an entry at the top of the notes (after the template block):

```markdown
## 2026-04-22 — BRIEF_SCHEMA with numeric scores for positioning matrix

- **Observation:** Adding minimum/maximum constraints to number fields in BRIEF_SCHEMA (for the axis scores) — the schema is passed directly as `json_schema` to `/generate`. The SDK doesn't validate these constraints locally; they're forwarded as-is to the API. The LLM does respect them in practice (scores came back in 0–10 range), but there's no SDK-level guarantee that `minimum`/`maximum` enforces clamping rather than rejection on out-of-range values.
- **DX impact:** Required defensive clamping in `getAxisScore()` in the matrix page (`Math.max(0, Math.min(10, val))`). Without this, a hallucinated score of 11 would silently plot a competitor outside the chart boundary.
- **Mitigation in Rival:** `getAxisScore()` clamps to `[0, 10]` regardless of what the LLM returns. The page gracefully excludes competitors with missing or non-numeric scores.
- **Upstream idea:** Document whether JSON Schema `minimum`/`maximum` constraints are enforced as hard clamps, as soft hints, or ignored — the current docs don't distinguish. Alternatively, a `clamp: true` option on numeric fields would remove the need for application-layer clamping.
```

- [ ] **Step 2: Run the full test suite with coverage**

```bash
npm run test:coverage
```

Expected: all PASS, 80%+ coverage on lines/functions/branches/statements.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: build completes.

- [ ] **Step 5: Commit**

```bash
git add notes-local/tabstack-dx-notes.md
git commit -m "docs(dx): add positioning matrix DX notes (#70)"
```

---

## Definition of Done

Per CLAUDE.md:
- [ ] Scope matches issue #70
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run test:coverage` passes with 80%+ coverage
- [ ] `notes-local/tabstack-dx-notes.md` updated
- [ ] `/matrix` page renders the chart when ≥2 competitors have brief data
- [ ] Empty state renders when data is missing
- [ ] Download SVG button triggers file download
- [ ] Matrix nav link visible on dashboard
