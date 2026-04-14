# Netlify Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Rival to Netlify at `rival.netlify.app` with GitHub auto-deploy on pushes to `main` and a daily scheduled competitor scan at 6am UTC.

**Architecture:** Add `netlify.toml` for build config (runs `prisma generate` before Next.js build, registers the Next.js plugin). A Netlify Scheduled Function in `netlify/functions/` fires daily and POSTs to the existing `/api/cron` route. The Netlify CLI creates the site, connects the GitHub repo, and sets all env vars. The existing GitHub Actions CI (lint, typecheck, tests) is untouched — Netlify only deploys on pushes to `main`.

**Tech Stack:** Netlify CLI, `@netlify/plugin-nextjs`, `@netlify/functions`, Next.js 16, Prisma, vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@netlify/plugin-nextjs`, `@netlify/functions`; remove `node-cron` |
| `netlify.toml` | Create | Build command, publish dir, functions dir, Next.js plugin |
| `netlify/functions/scheduled-scan.ts` | Create | Daily cron — POSTs to `/api/cron` at 6am UTC |
| `netlify/functions/__tests__/scheduled-scan.test.ts` | Create | Unit test for the scheduled function |

---

### Task 1: Swap dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove node-cron, add Netlify packages**

```bash
npm uninstall node-cron
npm install --save-dev @netlify/plugin-nextjs @netlify/functions
```

Expected: `package.json` no longer lists `node-cron` in `dependencies`; `@netlify/plugin-nextjs` and `@netlify/functions` appear in `devDependencies`.

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace node-cron with @netlify/plugin-nextjs and @netlify/functions"
```

---

### Task 2: Create netlify.toml

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Create `netlify.toml` at the repo root**

```toml
[build]
  command = "npx prisma generate && npm run build"
  publish = ".next"
  functions = "netlify/functions"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

- [ ] **Step 2: Verify the build still passes**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "chore: add netlify.toml with Next.js plugin and build config"
```

---

### Task 3: Create the scheduled function (TDD)

**Files:**
- Create: `netlify/functions/__tests__/scheduled-scan.test.ts`
- Create: `netlify/functions/scheduled-scan.ts`

- [ ] **Step 1: Create the functions directory structure**

```bash
mkdir -p netlify/functions/__tests__
```

- [ ] **Step 2: Write the failing test**

Create `netlify/functions/__tests__/scheduled-scan.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../scheduled-scan";

describe("scheduled-scan", () => {
  beforeEach(() => {
    vi.stubEnv("URL", "https://rival.netlify.app");
    vi.stubEnv("CRON_SECRET", "test-secret");
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("POSTs to /api/cron with x-cron-secret header", async () => {
    await handler();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://rival.netlify.app/api/cron",
      {
        method: "POST",
        headers: { "x-cron-secret": "test-secret" }
      }
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- netlify/functions/__tests__/scheduled-scan.test.ts
```

Expected: FAIL — `Cannot find module '../scheduled-scan'`

- [ ] **Step 4: Create the scheduled function**

Create `netlify/functions/scheduled-scan.ts`:

```ts
import type { Config } from "@netlify/functions";

export default async () => {
  await fetch(`${process.env.URL}/api/cron`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET! }
  });
};

export const config: Config = {
  schedule: "0 6 * * *"
};
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- netlify/functions/__tests__/scheduled-scan.test.ts
```

Expected: PASS

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/scheduled-scan.ts netlify/functions/__tests__/scheduled-scan.test.ts
git commit -m "feat: add Netlify scheduled function for daily competitor scans at 6am UTC"
```

---

### Task 4: Create and connect the Netlify site

**Files:** none (CLI only)

- [ ] **Step 1: Confirm you're logged in**

```bash
netlify status
```

Expected: shows your account name and email. If not: `netlify login`

- [ ] **Step 2: Initialize the Netlify site with GitHub auto-deploy**

From the repo root (ensure `netlify.toml` is already committed — it is after Task 2):

```bash
netlify init
```

Respond to prompts as follows:

| Prompt | Answer |
|---|---|
| What would you like to do? | **Create & configure a new site** |
| Team | select your team |
| Site name | `rival` (if taken, try `rival-app`) |
| Build command | press Enter (reads from `netlify.toml`) |
| Directory to deploy | press Enter (reads from `netlify.toml`) |
| GitHub authorization | authorize when browser opens |
| Repository | select the `rival` repo |
| Branch to deploy | `main` |

- [ ] **Step 3: Confirm the site was created**

```bash
netlify status
```

Expected: shows site name (`rival`) and a `*.netlify.app` URL.

---

### Task 5: Set environment variables

**Files:** none (CLI only)

Run each command, substituting values from your `.env.local`.

- [ ] **Step 1: Set TABSTACK_API_KEY**

```bash
netlify env:set TABSTACK_API_KEY "$(grep TABSTACK_API_KEY .env.local | cut -d= -f2)"
```

- [ ] **Step 2: Set DATABASE_URL**

```bash
netlify env:set DATABASE_URL "$(grep ^DATABASE_URL .env.local | cut -d= -f2-)"
```

- [ ] **Step 3: Set INTERNAL_API_KEY**

```bash
netlify env:set INTERNAL_API_KEY "$(grep INTERNAL_API_KEY .env.local | cut -d= -f2)"
```

- [ ] **Step 4: Generate and set a new CRON_SECRET**

```bash
CRON_SECRET=$(openssl rand -hex 32)
echo "CRON_SECRET=$CRON_SECRET  ← save this somewhere safe"
netlify env:set CRON_SECRET "$CRON_SECRET"
```

Save the printed value — you'll need it to manually trigger the cron endpoint.

- [ ] **Step 5: Set DEMO_RATE_LIMIT**

```bash
netlify env:set DEMO_RATE_LIMIT "$(grep DEMO_RATE_LIMIT .env.local | cut -d= -f2)"
```

- [ ] **Step 6: Set MANUAL_STALE_DAYS**

```bash
netlify env:set MANUAL_STALE_DAYS "$(grep MANUAL_STALE_DAYS .env.local | cut -d= -f2)"
```

- [ ] **Step 7: Verify all six variables are set**

```bash
netlify env:list
```

Expected: `TABSTACK_API_KEY`, `DATABASE_URL`, `INTERNAL_API_KEY`, `CRON_SECRET`, `DEMO_RATE_LIMIT`, `MANUAL_STALE_DAYS` all listed.

---

### Task 6: Deploy and verify

- [ ] **Step 1: Push to main to trigger the first auto-deploy**

If you're on `fix/bugs`, merge or PR to `main` first. Then:

```bash
git push origin main
```

- [ ] **Step 2: Watch the build log**

```bash
netlify watch
```

Expected: build runs `npx prisma generate && npm run build`, deploys successfully, prints the live URL.

- [ ] **Step 3: Open the live site**

```bash
netlify open
```

Expected: Rival dashboard loads at `rival.netlify.app` (or the accepted name).

- [ ] **Step 4: Smoke-test the cron endpoint**

```bash
CRON_SECRET=$(netlify env:get CRON_SECRET)
curl -s -X POST https://rival.netlify.app/api/cron \
  -H "x-cron-secret: $CRON_SECRET" | jq .
```

Expected: JSON like `{"competitors": 7, "staleLocksDeleted": 0, "summary": [...]}` — not a 401 or 500.

- [ ] **Step 5: Confirm the scheduled function is registered**

```bash
netlify functions:list
```

Expected: `scheduled-scan` appears in the output.
