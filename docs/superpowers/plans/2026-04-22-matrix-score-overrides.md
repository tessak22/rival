# Matrix Score Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow per-competitor manual overrides for matrix axis scores, stored in the existing `manual_data` JSON column, so inaccurate LLM-generated scores can be corrected without touching the brief schema.

**Architecture:** A new `lib/matrix/overrides.ts` module exports `getAxisScore()` which reads `manual_data.matrix_overrides.{key}` first, falling back to `intelligenceBrief.{key}`. The matrix page uses this helper instead of reading the brief directly. `MatrixPoint` gains `xOverride` and `yOverride` booleans, and the SVG component renders overridden dots as diamonds instead of circles so they're visually distinct. Overrides are set via `rivals.config.json` (synced to DB by the seeder on deploy) or by direct `manual_data` DB patch for ad-hoc changes.

**Tech Stack:** TypeScript, Next.js App Router server component, Prisma, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/matrix/overrides.ts` | Create | `getAxisScore()` — reads override then brief, returns score + provenance |
| `lib/matrix/__tests__/overrides.test.ts` | Create | Unit tests for `getAxisScore()` |
| `app/matrix/page.tsx` | Modify | Replace inline `getAxisScore` with import, add `manualData` to Prisma select, pass `xOverride`/`yOverride` |
| `components/matrix/PositioningMatrix.tsx` | Modify | Add `xOverride?`/`yOverride?` to `MatrixPoint`, render diamond + tooltip for overridden dots |

---

## Task 1: Create `getAxisScore` helper with tests

**Files:**
- Create: `lib/matrix/overrides.ts`
- Create: `lib/matrix/__tests__/overrides.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/matrix/__tests__/overrides.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getAxisScore } from "@/lib/matrix/overrides";

describe("getAxisScore", () => {
  it("returns null when both manual_data and brief are empty", () => {
    expect(getAxisScore(null, null, "managed_service_score")).toBeNull();
  });

  it("returns brief score with isOverride: false when no override present", () => {
    const brief = { managed_service_score: 7 };
    expect(getAxisScore(null, brief, "managed_service_score")).toEqual({ score: 7, isOverride: false });
  });

  it("returns override score with isOverride: true when override present", () => {
    const manual = { matrix_overrides: { managed_service_score: 9 } };
    const brief = { managed_service_score: 3 };
    expect(getAxisScore(manual, brief, "managed_service_score")).toEqual({ score: 9, isOverride: true });
  });

  it("falls back to brief when override key is missing for requested axis", () => {
    const manual = { matrix_overrides: { llm_included_score: 8 } };
    const brief = { managed_service_score: 5 };
    expect(getAxisScore(manual, brief, "managed_service_score")).toEqual({ score: 5, isOverride: false });
  });

  it("clamps brief score to 0–10", () => {
    const brief = { managed_service_score: 15 };
    expect(getAxisScore(null, brief, "managed_service_score")).toEqual({ score: 10, isOverride: false });
  });

  it("clamps override score to 0–10", () => {
    const manual = { matrix_overrides: { managed_service_score: -3 } };
    expect(getAxisScore(manual, null, "managed_service_score")).toEqual({ score: 0, isOverride: true });
  });

  it("returns null when brief score is non-numeric", () => {
    const brief = { managed_service_score: "high" };
    expect(getAxisScore(null, brief, "managed_service_score")).toBeNull();
  });

  it("returns null when override is non-numeric", () => {
    const manual = { matrix_overrides: { managed_service_score: "high" } };
    expect(getAxisScore(manual, null, "managed_service_score")).toBeNull();
  });

  it("ignores override when matrix_overrides is not an object", () => {
    const manual = { matrix_overrides: "invalid" };
    const brief = { managed_service_score: 4 };
    expect(getAxisScore(manual, brief, "managed_service_score")).toEqual({ score: 4, isOverride: false });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
npm run test lib/matrix/__tests__/overrides.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/matrix/overrides'"

- [ ] **Step 3: Create `lib/matrix/overrides.ts`**

```typescript
import type { MatrixAxisKey } from "@/lib/config/rival-config";

export type AxisScoreResult = {
  score: number;
  isOverride: boolean;
};

export function getAxisScore(
  manualData: unknown,
  intelligenceBrief: unknown,
  key: MatrixAxisKey
): AxisScoreResult | null {
  // Check manual_data.matrix_overrides first
  if (manualData && typeof manualData === "object" && !Array.isArray(manualData)) {
    const overrides = (manualData as Record<string, unknown>).matrix_overrides;
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
      const val = (overrides as Record<string, unknown>)[key];
      if (typeof val === "number" && Number.isFinite(val)) {
        return { score: Math.max(0, Math.min(10, val)), isOverride: true };
      }
    }
  }

  // Fall back to intelligenceBrief
  if (intelligenceBrief && typeof intelligenceBrief === "object" && !Array.isArray(intelligenceBrief)) {
    const val = (intelligenceBrief as Record<string, unknown>)[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      return { score: Math.max(0, Math.min(10, val)), isOverride: false };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test lib/matrix/__tests__/overrides.test.ts
```

Expected: 9 tests PASS

- [ ] **Step 5: Full test suite**

```bash
npm run test
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add lib/matrix/overrides.ts lib/matrix/__tests__/overrides.test.ts
git commit -m "feat(matrix): add getAxisScore helper with manual override support"
```

---

## Task 2: Update PositioningMatrix to render overridden dots as diamonds

**Files:**
- Modify: `app/matrix/page.tsx`

The page currently has an inline `getAxisScore` function that only reads from `intelligenceBrief`. Replace it with the imported helper, add `manualData` to the Prisma select, and pass `xOverride`/`yOverride` to each `MatrixPoint`.

- [ ] **Step 1: Modify `app/matrix/page.tsx`**

Replace the top of the file. The full updated file:

```tsx
import { prisma } from "@/lib/db/client";
import {
  loadRivalConfig,
  DEFAULT_MATRIX_CONFIG,
  type MatrixConfig
} from "@/lib/config/rival-config";
import { getAxisScore } from "@/lib/matrix/overrides";
import { PositioningMatrix, type MatrixPoint } from "@/components/matrix/PositioningMatrix";
import { MatrixDownloadButton } from "@/components/matrix/MatrixDownloadButton";
import { RDSPageShell, RDSHeader, RDSFooter, RDSEmpty, RDSKicker } from "@/components/rds";

export const dynamic = "force-dynamic";

export default async function MatrixPage() {
  let matrixConfig: MatrixConfig;
  try {
    const config = loadRivalConfig();
    matrixConfig = config.matrix ?? DEFAULT_MATRIX_CONFIG;
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      matrixConfig = DEFAULT_MATRIX_CONFIG;
    } else {
      throw err;
    }
  }

  const competitors = await prisma.competitor.findMany({
    select: { id: true, name: true, slug: true, intelligenceBrief: true, manualData: true, isSelf: true },
    orderBy: [{ isSelf: "asc" }, { name: "asc" }]
  });

  const points: MatrixPoint[] = [];
  let missingScores = 0;

  for (const c of competitors) {
    const xResult = getAxisScore(c.manualData, c.intelligenceBrief, matrixConfig.x_axis.key);
    const yResult = getAxisScore(c.manualData, c.intelligenceBrief, matrixConfig.y_axis.key);
    if (xResult === null || yResult === null) {
      missingScores++;
      continue;
    }
    points.push({
      name: c.name,
      slug: c.slug,
      x: xResult.score,
      y: yResult.score,
      isSelf: c.isSelf,
      xOverride: xResult.isOverride,
      yOverride: yResult.isOverride
    });
  }

  const hasEnoughData = points.some((p) => !p.isSelf);

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
              : "Generate intelligence briefs for at least 1 competitor to see the positioning matrix."
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

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors (Task 2 already extended `MatrixPoint` with `xOverride`/`yOverride`).

- [ ] **Step 3: Run full test suite**

```bash
npm run test
```

Expected: all PASS

- [ ] **Step 4: Run format check and fix if needed**

```bash
npm run format:check
```

If issues: `npx prettier --write app/matrix/page.tsx`

- [ ] **Step 5: Commit**

```bash
git add app/matrix/page.tsx
git commit -m "feat(matrix): use getAxisScore helper, pass override flags to matrix points"
```

---

## Task 3: Update matrix page to use the helper

**Files:**
- Modify: `components/matrix/PositioningMatrix.tsx`

Add `xOverride?: boolean` and `yOverride?: boolean` to `MatrixPoint`. When either is true, render a diamond (rotated square) instead of a circle and add a `<title>` tooltip indicating the score was manually set.

- [ ] **Step 1: Update `MatrixPoint` type and dot rendering in `components/matrix/PositioningMatrix.tsx`**

Change `MatrixPoint`:
```typescript
export type MatrixPoint = {
  name: string;
  slug: string;
  x: number; // 0–10
  y: number; // 0–10
  isSelf?: boolean;
  xOverride?: boolean;
  yOverride?: boolean;
};
```

Replace the dot rendering section (the `{/* Competitor dots + name labels */}` block). Find the current `{pt.isSelf ? (...) : (...)}` block and replace it with this expanded version:

```tsx
{/* Competitor dots + name labels */}
{(() => {
  const labelOffsets = computeLabelOffsets(points);
  return points.map((pt) => {
    const cx = toSvgX(pt.x);
    const cy = toSvgY(pt.y);
    const labelYOffset = labelOffsets.get(pt.slug) ?? 0;
    const labelY = cy + labelYOffset + 4;
    const nearRight = cx > M + PLOT - 90;
    const isOverridden = pt.xOverride || pt.yOverride;
    const overrideTitle = [
      pt.xOverride ? "X-axis manually set" : null,
      pt.yOverride ? "Y-axis manually set" : null
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <g key={pt.slug}>
        {labelYOffset !== 0 && (
          <line
            x1={cx}
            y1={cy}
            x2={nearRight ? cx - 10 : cx + 10}
            y2={labelY}
            stroke="var(--ink-faint)"
            strokeWidth={0.5}
          />
        )}
        {pt.isSelf ? (
          <>
            <title>{pt.name} (you)</title>
            <circle cx={cx} cy={cy} r={8} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
            <circle cx={cx} cy={cy} r={4} fill="var(--ink)" />
          </>
        ) : isOverridden ? (
          <>
            <title>{`${pt.name} — ${overrideTitle}`}</title>
            <rect
              x={cx - 7}
              y={cy - 7}
              width={14}
              height={14}
              transform={`rotate(45, ${cx}, ${cy})`}
              fill="var(--ink)"
            />
          </>
        ) : (
          <>
            <title>{pt.name}</title>
            <circle cx={cx} cy={cy} r={6} fill="var(--ink)" />
          </>
        )}
        <text
          x={nearRight ? cx - 12 : cx + 12}
          y={labelY}
          textAnchor={nearRight ? "end" : "start"}
          fill="var(--ink)"
          style={{ fontSize: 12, fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "-0.01em" }}
        >
          {pt.name}
          {pt.isSelf && " ★"}
        </text>
      </g>
    );
  });
})()}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run full test suite**

```bash
npm run test
```

Expected: all PASS

- [ ] **Step 4: Run format check and fix if needed**

```bash
npm run format:check
```

If issues: `npx prettier --write components/matrix/PositioningMatrix.tsx`

- [ ] **Step 5: Commit**

```bash
git add components/matrix/PositioningMatrix.tsx
git commit -m "feat(matrix): render overridden dots as diamonds with tooltip"
```

---

## Task 4: Document override usage and add rivals.config.json example

**Files:**
- Modify: `rivals.config.json`

Add a `matrix_overrides` block to one competitor as a reference example showing the pattern. Use Browserbase since we know its correct scores.

- [ ] **Step 1: Add `matrix_overrides` to the Browserbase competitor entry in `rivals.config.json`**

Find the Browserbase entry in `rivals.config.json`. Inside its `manual` block, add:

```json
"matrix_overrides": {
  "managed_service_score": 9,
  "llm_included_score": 1
}
```

The full Browserbase `manual` block should look like:
```json
"manual": {
  "matrix_overrides": {
    "managed_service_score": 9,
    "llm_included_score": 1
  }
}
```

(If Browserbase already has other manual fields, add `matrix_overrides` alongside them.)

- [ ] **Step 2: Verify JSON is valid**

```bash
python3 -m json.tool rivals.config.json > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`

- [ ] **Step 3: Run typecheck and tests**

```bash
npm run typecheck && npm run test
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add rivals.config.json
git commit -m "docs(matrix): add matrix_overrides example to rivals.config.json"
```

---

## Definition of Done

- [ ] `npm run test:coverage` passes with 80%+ coverage
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `getAxisScore` reads `manual_data.matrix_overrides` before `intelligenceBrief`
- [ ] Overridden dots render as diamonds on the matrix SVG
- [ ] Non-overridden dots are unchanged (circles / bullseye for self)
- [ ] `rivals.config.json` shows the override pattern for other contributors
