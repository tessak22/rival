# Scan History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/[slug]/history?type=<page-type>` page that shows a reverse-chronological timeline of all scans for a competitor, filterable by page type, with expand/collapse per entry.

**Architecture:** New Server Component page at `app/[slug]/history/page.tsx` fetches scans directly via Prisma (same pattern as existing `[slug]/page.tsx`). A `ScanEntry` Client Component handles expand/collapse using native `<details>`/`<summary>` HTML. Page type filter is URL-driven (`?type=homepage`). Badge logic is extracted into a pure utility for testability.

**Tech Stack:** Next.js 16 App Router, Prisma, TypeScript, vitest, existing globals.css

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/globals.css` | Modify | Add `.history-*` CSS classes |
| `app/[slug]/history/scan-badge.ts` | Create | Pure utility: derive badge label+variant from `hasChanges` |
| `app/[slug]/history/__tests__/scan-badge.test.ts` | Create | Unit tests for badge utility |
| `app/[slug]/history/ScanEntry.tsx` | Create | Client Component: expand/collapse scan entry display |
| `app/[slug]/history/page.tsx` | Create | Server Component: fetch scans, render timeline |
| `app/[slug]/page.tsx` | Modify | Add "View History" link in page header |

---

### Task 1: Add CSS styles

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append history styles to the end of `app/globals.css`**

```css
/* ── Scan History ─────────────────────────────────────── */

.history-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.history-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0.5rem 0 1.5rem;
}

.history-type-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.history-type-tab {
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 0.82rem;
  text-decoration: none;
  color: var(--muted);
}

.history-type-tab:hover {
  border-color: var(--accent);
  color: var(--fg);
}

.history-type-tab--active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.history-entry {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.history-entry-summary {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.history-entry-summary::-webkit-details-marker {
  display: none;
}

.history-entry-date {
  font-size: 0.82rem;
  color: var(--muted);
  min-width: 180px;
  flex-shrink: 0;
}

.history-entry-diff {
  font-size: 0.82rem;
  color: var(--fg);
  flex: 1;
}

.history-entry-body {
  padding: 1rem;
  border-top: 1px solid var(--border);
}

.history-kv-row {
  display: flex;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.83rem;
}

.history-kv-row:last-child {
  border-bottom: none;
}

.history-kv-key {
  min-width: 160px;
  flex-shrink: 0;
  color: var(--muted);
  font-weight: 500;
}

.history-kv-value {
  flex: 1;
  word-break: break-word;
  white-space: pre-wrap;
}

.history-markdown {
  font-size: 0.83rem;
  white-space: pre-wrap;
  line-height: 1.6;
}

.history-empty {
  color: var(--muted);
  font-size: 0.9rem;
  text-align: center;
  padding: 3rem 0;
}
```

- [ ] **Step 2: Verify the app still builds**

```bash
npm run build 2>&1 | tail -5
```

Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add scan history CSS"
```

---

### Task 2: Badge utility (TDD)

**Files:**
- Create: `app/[slug]/history/scan-badge.ts`
- Create: `app/[slug]/history/__tests__/scan-badge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/[slug]/history/__tests__/scan-badge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getScanBadge } from "../scan-badge";

describe("getScanBadge", () => {
  it("returns CHANGED + changed variant for hasChanges=true", () => {
    expect(getScanBadge(true)).toEqual({ label: "CHANGED", variant: "changed" });
  });

  it("returns NO CHANGE + no-change variant for hasChanges=false", () => {
    expect(getScanBadge(false)).toEqual({ label: "NO CHANGE", variant: "no-change" });
  });

  it("returns UNKNOWN + unknown variant for null", () => {
    expect(getScanBadge(null)).toEqual({ label: "UNKNOWN", variant: "unknown" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- app/\[slug\]/history/__tests__/scan-badge.test.ts
```

Expected: FAIL — `Cannot find module '../scan-badge'`

- [ ] **Step 3: Create the utility**

Create `app/[slug]/history/scan-badge.ts`:

```ts
export type BadgeVariant = "changed" | "no-change" | "unknown";

export interface ScanBadge {
  label: string;
  variant: BadgeVariant;
}

export function getScanBadge(hasChanges: boolean | null): ScanBadge {
  if (hasChanges === true) return { label: "CHANGED", variant: "changed" };
  if (hasChanges === false) return { label: "NO CHANGE", variant: "no-change" };
  return { label: "UNKNOWN", variant: "unknown" };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- app/\[slug\]/history/__tests__/scan-badge.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: same result as before (1 pre-existing failure in `brief.test.ts`, everything else passes).

- [ ] **Step 6: Commit**

```bash
git add app/\[slug\]/history/scan-badge.ts app/\[slug\]/history/__tests__/scan-badge.test.ts
git commit -m "feat: add scan badge utility with tests"
```

---

### Task 3: ScanEntry client component

**Files:**
- Create: `app/[slug]/history/ScanEntry.tsx`

- [ ] **Step 1: Create the component**

Create `app/[slug]/history/ScanEntry.tsx`:

```tsx
"use client";

import { getScanBadge } from "./scan-badge";

type ScanEntryProps = {
  scan: {
    id: string;
    scannedAt: Date;
    hasChanges: boolean;
    diffSummary: string | null;
    rawResult: unknown;
    markdownResult: string | null;
  };
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}

export function ScanEntry({ scan }: ScanEntryProps) {
  const badge = getScanBadge(scan.hasChanges);

  const variantClass =
    badge.variant === "changed"
      ? "tag-chip--green"
      : badge.variant === "no-change"
        ? "tag-chip--secondary"
        : "tag-chip--amber";

  const kvEntries =
    scan.rawResult !== null &&
    typeof scan.rawResult === "object" &&
    !Array.isArray(scan.rawResult)
      ? Object.entries(scan.rawResult as Record<string, unknown>)
      : [];

  return (
    <details className="history-entry">
      <summary className="history-entry-summary">
        <span className="history-entry-date">{formatDate(scan.scannedAt)}</span>
        <span className={`tag-chip ${variantClass}`}>{badge.label}</span>
        {badge.variant === "changed" && scan.diffSummary && (
          <span className="history-entry-diff">{scan.diffSummary}</span>
        )}
      </summary>
      <div className="history-entry-body">
        {kvEntries.length > 0 ? (
          <div>
            {kvEntries.map(([key, value]) => (
              <div key={key} className="history-kv-row">
                <span className="history-kv-key">{key}</span>
                <span className="history-kv-value">
                  {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                </span>
              </div>
            ))}
          </div>
        ) : scan.markdownResult ? (
          <pre className="history-markdown">{scan.markdownResult}</pre>
        ) : (
          <p className="history-empty">No data captured for this scan.</p>
        )}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\[slug\]/history/ScanEntry.tsx
git commit -m "feat: add ScanEntry client component"
```

---

### Task 4: History page server component

**Files:**
- Create: `app/[slug]/history/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/[slug]/history/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/client";
import { ScanEntry } from "./ScanEntry";

const DEFAULT_TYPE = "homepage";
const MAX_SCANS = 90;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
};

export default async function HistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { type: rawType } = await searchParams;

  const competitor = await prisma.competitor.findUnique({
    where: { slug },
    include: {
      pages: {
        select: { type: true },
      },
    },
  });

  if (!competitor) notFound();

  const distinctTypes = [...new Set(competitor.pages.map((p) => p.type))].sort();
  const selectedType = distinctTypes.includes(rawType ?? "") ? (rawType as string) : DEFAULT_TYPE;

  const scans = await prisma.scan.findMany({
    where: {
      page: {
        competitorId: competitor.id,
        type: selectedType,
      },
    },
    orderBy: { scannedAt: "desc" },
    take: MAX_SCANS,
  });

  return (
    <div className="history-page">
      <Link href={`/${slug}`} className="back-link">
        ← {competitor.name}
      </Link>

      <h1 className="history-title">{competitor.name} — Scan History</h1>

      <nav className="history-type-tabs">
        {distinctTypes.map((type) => (
          <Link
            key={type}
            href={`/${slug}/history?type=${type}`}
            className={`history-type-tab${type === selectedType ? " history-type-tab--active" : ""}`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Link>
        ))}
      </nav>

      {scans.length === 0 ? (
        <p className="history-empty">
          No scans yet for this page type. Scans run daily at 6am UTC.
        </p>
      ) : (
        <div className="history-timeline">
          {scans.map((scan) => (
            <ScanEntry key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Verify build passes**

```bash
npm run build 2>&1 | tail -10
```

Expected: `/[slug]/history` appears in the route list as `ƒ (Dynamic)`, no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\[slug\]/history/page.tsx
git commit -m "feat: add scan history page at /[slug]/history"
```

---

### Task 5: Add history link to competitor page

**Files:**
- Modify: `app/[slug]/page.tsx` (around line 275 — the `<header className="page-header">` block)

- [ ] **Step 1: Add the history link to the page header**

In `app/[slug]/page.tsx`, find this block (around line 272):

```tsx
      <header className="page-header">
        <Link href="/" className="back-link">← Dashboard</Link>
        <h1>{competitor.name}</h1>
        <p>{competitor.baseUrl}</p>
      </header>
```

Replace it with:

```tsx
      <header className="page-header">
        <Link href="/" className="back-link">← Dashboard</Link>
        <h1>{competitor.name}</h1>
        <p>{competitor.baseUrl}</p>
        <Link href={`/${competitor.slug}/history`} className="tag-chip tag-chip--secondary">
          View History
        </Link>
      </header>
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: same 1 pre-existing failure, everything else passes.

- [ ] **Step 4: Commit**

```bash
git add app/\[slug\]/page.tsx
git commit -m "feat: add View History link to competitor page"
```

---

### Task 6: Push PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin fix/cron-timeout
```

(This branch already has the cron timeout fix + history commits stacked on it.)

- [ ] **Step 2: Verify the existing PR is updated**

The branch `fix/cron-timeout` is already open as tessak22/rival#69. The new commits will appear there automatically.
