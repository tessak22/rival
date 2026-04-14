# Missing CSS Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~60 missing CSS class definitions to `globals.css` so the competitor detail page renders all sections correctly instead of as unstyled plain text.

**Architecture:** Append five groups of CSS rules to `app/globals.css` — shared primitives first (tag chips, diff highlights, badges, panel helpers), then one group per content section (homepage, profile, reviews, blog). No JSX changes. No new files.

**Tech Stack:** Plain CSS, existing dark-theme CSS variables (`--bg`, `--panel`, `--text`, `--muted`, `--accent`).

---

### Task 1: Shared Primitives

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append shared primitive classes**

Open `app/globals.css` and append after the last line:

```css
/* ── Shared primitives ───────────────────────────────────────────────── */

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.35rem;
}

.tag-chip {
  display: inline-block;
  border: 1px solid #2b3d55;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
}

.tag-chip--green {
  border-color: #2f8f62;
  background: rgba(27, 95, 63, 0.18);
}

.tag-chip--amber {
  border-color: #ad7e2d;
  background: rgba(148, 107, 30, 0.18);
}

.tag-chip--secondary {
  border-color: #2b3d55;
  color: var(--muted);
}

.new-badge {
  color: var(--accent);
  font-weight: 600;
  font-size: 0.7rem;
}

.diff-highlight--amber {
  background: rgba(173, 126, 45, 0.12);
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
}

.diff-badge--amber {
  display: inline-block;
  border: 1px solid #ad7e2d;
  border-radius: 999px;
  padding: 0.15rem 0.45rem;
  font-size: 0.72rem;
  color: #c9943a;
  margin-left: 0.4rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.78rem;
  border: 1px solid #2b3d55;
  background: rgba(13, 20, 30, 0.6);
}

.badge--frequency {
  border-color: #3a5e89;
  background: rgba(28, 54, 92, 0.3);
}

.badge--developer {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(92, 179, 255, 0.08);
}

.badge--buyer {
  border-color: #8f6faa;
  color: #b09dca;
  background: rgba(100, 70, 140, 0.15);
}

.badge--unknown {
  border-color: #333f50;
  color: var(--muted);
}

.panel-sub {
  border: 1px solid #1f2d3d;
  background: rgba(10, 15, 22, 0.6);
  border-radius: 10px;
  padding: 1rem;
}

.scan-timestamp {
  color: var(--muted);
  font-size: 0.8rem;
}

.panel-header-note {
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0;
}

.scan-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.blocked-banner {
  border-left: 3px solid #ad7e2d;
  background: rgba(148, 107, 30, 0.1);
  padding: 0.5rem 0.75rem;
  border-radius: 0 6px 6px 0;
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}

.staleness-note {
  font-size: 0.78rem;
  color: var(--muted);
  font-style: italic;
}

.signal-note {
  font-size: 0.78rem;
  color: var(--muted);
}

.section-divider {
  border: none;
  border-top: 1px solid #1f2d3d;
  margin: 1rem 0;
}
```

- [ ] **Step 2: Verify dev server shows no console errors**

```bash
npm run dev
```

Open `http://localhost:3000` — no new console errors expected from CSS changes.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add shared primitive CSS classes (chips, diff, badges, panel helpers)"
```

---

### Task 2: Homepage Section CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append homepage classes**

Open `app/globals.css` and append after the last line:

```css
/* ── Homepage section ────────────────────────────────────────────────── */

.homepage-tab {
  display: grid;
  gap: 1rem;
}

.homepage-section {
  display: grid;
  gap: 0.3rem;
}

.homepage-label {
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0;
}

.homepage-primary-tagline {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.homepage-sub-tagline {
  font-size: 1rem;
  color: var(--muted);
  margin: 0;
}

.homepage-cta-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.82rem;
  color: var(--accent);
  text-decoration: none;
  gap: 0.3rem;
}

.homepage-field--changed {
  border-left: 3px solid #ad7e2d;
  padding-left: 0.5rem;
}

.homepage-change-badge {
  display: inline-block;
  border: 1px solid #ad7e2d;
  border-radius: 999px;
  padding: 0.15rem 0.45rem;
  font-size: 0.7rem;
  color: #c9943a;
  background: rgba(148, 107, 30, 0.15);
  margin-left: 0.4rem;
}

.homepage-differentiators {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.homepage-meta {
  font-size: 0.8rem;
  color: var(--muted);
  margin-top: 0.5rem;
}
```

- [ ] **Step 2: Visually verify homepage panel**

Navigate to any competitor detail page (e.g. `http://localhost:3000/firecrawl`). The HOMEPAGE panel should show:
- Primary tagline in larger bold text
- Sub-tagline in muted color beneath it
- Positioning statement, target audience, key differentiators in labeled sections with gray uppercase labels
- CTA badge as an outlined pill
- No unlabeled unstyled text blobs

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add homepage section CSS classes"
```

---

### Task 3: Profile Section CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append profile classes**

Open `app/globals.css` and append after the last line:

```css
/* ── Profile section ─────────────────────────────────────────────────── */

.profile-tab {
  display: grid;
  gap: 1rem;
}

.profile-fields {
  display: grid;
  grid-template-columns: minmax(120px, 200px) 1fr;
  gap: 0.5rem 1rem;
  align-items: start;
}

.profile-fields dt {
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  color: var(--muted);
  padding-top: 0.15rem;
}

.profile-fields dd {
  margin: 0;
}

.company-info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  font-size: 0.88rem;
}

.customer-logos {
  font-size: 0.88rem;
}
```

- [ ] **Step 2: Visually verify profile panel**

On the competitor detail page, the PROFILE panel should show:
- Two-column layout: gray uppercase label on the left, value on the right
- Company info (GitHub stars, employee count, etc.) in a flex row
- No collapsed unlabeled dl/dd/dt raw output

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add profile section CSS classes"
```

---

### Task 4: Reviews Section CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append reviews classes**

Open `app/globals.css` and append after the last line:

```css
/* ── Reviews section ─────────────────────────────────────────────────── */

.reviews-platform-tabs {
  display: grid;
  gap: 1rem;
}

.reviews-platform-card {
  border: 1px solid #1f2d3d;
  border-left: 3px solid #3a5e89;
  background: rgba(10, 15, 22, 0.6);
  border-radius: 10px;
  padding: 1rem;
}

.reviews-platform-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.reviews-platform-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.reviews-rating-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.reviews-rating-score {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.reviews-stars {
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  color: #c9943a;
}

.reviews-count {
  font-size: 0.82rem;
}

.reviews-subscores-row {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.reviews-subscore {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.reviews-subscore-label {
  font-size: 0.72rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.reviews-subscore-value {
  font-weight: 600;
  font-size: 1rem;
}

.reviews-recommended {
  font-size: 0.85rem;
  font-style: italic;
  color: var(--muted);
  margin: 0.5rem 0;
}

.reviews-themes {
  margin-top: 0.75rem;
}

.reviews-themes h4 {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.reviews-themes--complaints {
  margin-top: 0.75rem;
}

.reviews-recent {
  margin-top: 1rem;
}

.reviews-recent h4 {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.reviews-recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.reviews-recent-item {
  border-bottom: 1px solid #1f2d3d;
  padding-bottom: 0.6rem;
}

.reviews-recent-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.reviews-recent-meta {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  font-size: 0.8rem;
  margin-bottom: 0.25rem;
}

.reviews-recent-rating {
  font-weight: 600;
}

.reviews-recent-date {
  color: var(--muted);
}

.reviews-recent-summary {
  margin: 0;
  font-size: 0.88rem;
}
```

- [ ] **Step 2: Visually verify reviews panel**

On the competitor detail page, the REVIEWS panel should show:
- Platform cards (G2, Capterra, etc.) as distinct nested cards with a blue left accent border
- Large numeric rating score (e.g. "4.5") with star characters beside it
- Ease of Use / Support subscores in a flex row
- Praise themes as green chip pills, complaint themes as amber chip pills
- Recent reviews as a separator-divided list

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add reviews section CSS classes"
```

---

### Task 5: Blog Section CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append blog classes**

Open `app/globals.css` and append after the last line:

```css
/* ── Blog section ────────────────────────────────────────────────────── */

.blog-tab {
  display: grid;
  gap: 1rem;
}

.blog-tab-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.blog-frequency-row,
.blog-audience-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.blog-frequency-label,
.blog-audience-label {
  font-size: 0.78rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 110px;
}

.blog-topics {
  margin-top: 0.25rem;
}

.blog-topics h3 {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.blog-recent-posts {
  margin-top: 0.25rem;
}

.blog-recent-posts h3 {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.blog-post-list {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.blog-post-item {
  padding: 0;
}

.blog-post-title a {
  color: var(--accent);
  text-decoration: none;
}

.blog-post-title a:hover {
  text-decoration: underline;
}

.blog-post-date {
  display: block;
  font-size: 0.75rem;
  color: var(--muted);
  margin-top: 0.1rem;
}

.blog-categories {
  margin-top: 0.5rem;
}

.blog-categories h3 {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 2: Visually verify blog panel**

On a competitor detail page that has a blog scan (e.g. Firecrawl), the BLOG panel should show:
- Header row with scan timestamp and change flag on the right
- Post frequency badge (e.g. "weekly") as a pill
- Audience focus badge as a pill (blue for developer-focused, purple for buyer-focused)
- Primary topics as chip pills
- Recent posts as a numbered list with post titles as clickable blue links and dates below each
- Categories as secondary chip pills

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: add blog section CSS classes"
```

---

### Task 6: Final Verification

**Files:**
- No changes

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Full visual pass**

Open `http://localhost:3000` (dashboard) and click through 2-3 competitor detail pages. Verify:
- Section Health panel: colored pills render (green/amber/red)
- Latest Scans panel: scan cards with page type and change flag
- Intelligence Brief: raw JSON pre block (intentionally unstyled)
- All five content sections (Reviews, Homepage, Profile, Blog, Section Health) render with proper visual structure

- [ ] **Step 3: Final commit if any touch-ups needed**

If you spotted any rendering issues and made small fixes:

```bash
git add app/globals.css
git commit -m "style: fix-up CSS after visual verification pass"
```
