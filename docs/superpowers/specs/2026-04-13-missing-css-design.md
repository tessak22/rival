# Missing CSS Classes — Competitor Detail Page

**Date:** 2026-04-13  
**Branch:** fix/bugs  
**Scope:** `app/globals.css` only — no JSX changes, no new files

## Problem

`app/[slug]/page.tsx` references ~60 CSS class names that do not exist in `globals.css`. The shell/layout classes (`panel`, `matrix`, `intel-feed`, etc.) are styled, but every section-specific content class is absent. This causes the entire detail page to render as unstyled plain text.

## Approach

Append all missing class definitions to `globals.css`, grouped by section. Stay within the existing design language: dark theme CSS variables (`--bg`, `--panel`, `--text`, `--muted`, `--accent`), existing border colors (`#1f2d3d`, `#203147`, `#26384f`, `#2b3d55`), and existing border-radius conventions (8px for cards, 999px for pills).

No JSX changes. No new files. No framework additions.

## CSS Groups to Add

### Shared Primitives
- **Tag chips** — small pill badges with colored borders. Variants: `--green` (praise), `--amber` (complaints/changes), `--secondary` (neutral/categories). Match visual weight of existing `.schema-health` pills.
- **Diff highlights** — `.diff-highlight--amber`: subtle amber background tint on a changed field's container. `.diff-badge--amber`: small inline "was X" callout badge.
- **`.badge`** — small pill for enumerated labels (frequency, audience type). Variants: `--frequency` (blue-ish), `--developer` (accent blue), `--buyer` (muted purple), `--unknown` (gray).
- **`.panel-sub`** — nested card within a panel, slightly darker background, 8px border-radius.
- **`.scan-timestamp`** — `color: var(--muted); font-size: 0.8rem`.
- **`.scan-actions`** — flex row, gap, align-items center.
- **`.blocked-banner`** — amber border-left accent, background tint, padding. Used for content-blocked warnings.
- **`.staleness-note`, `.signal-note`** — small muted italic helper text.
- **`.panel-header-note`** — muted smaller text in the panel header area.
- **`.section-divider`** — thin HR, border-color matches existing panel borders.
- **`.new-badge`** — tiny accent-colored "new" label inline within a tag chip.

### Homepage Section
- **`.homepage-tab`** — padding/gap container.
- **`.homepage-section`** — margin-bottom spacing block for each labeled field.
- **`.homepage-label`** — `text-transform: uppercase; font-size: 0.75rem; color: var(--muted); letter-spacing: 0.06em`.
- **`.homepage-primary-tagline`** — larger font-size, font-weight 600.
- **`.homepage-sub-tagline`** — normal weight, slight muted color.
- **`.homepage-cta-badge`** — pill button display (accent border, small padding).
- **`.homepage-field--changed`** — amber left-border accent to flag changed fields.
- **`.homepage-change-badge`** — small amber pill, "Changed" label.
- **`.homepage-differentiators`** — flex-wrap list of chips, resets list styles.
- **`.homepage-meta`** — muted small text block at bottom of homepage tab.

### Profile Section
- **`.profile-tab`** — spacing container.
- **`.profile-fields`** — `dl` styled as a grid (2-column: dt label / dd value). `dt`: muted, small, uppercase label. `dd`: normal text, no default margin.
- **`.company-info-row`** — flex row for GitHub stats and misc company metadata.
- **`.customer-logos`** — block with slight indent for named customers list.

### Reviews Section
- **`.reviews-platform-tabs`** — `display: grid; gap: 1rem`.
- **`.reviews-platform-card`** — extends `.panel-sub`, adds left accent border in a neutral color.
- **`.reviews-platform-header`** — flex row, space-between, align-items baseline.
- **`.reviews-rating-row`** — flex, align-items center, gap. Large score display.
- **`.reviews-rating-score`** — `font-size: 2rem; font-weight: 700`.
- **`.reviews-stars`** — normal size, letter-spacing for star characters.
- **`.reviews-count`** — muted, small.
- **`.reviews-subscores-row`** — flex, gap, margin-top.
- **`.reviews-subscore`** — flex column, label + value pairs.
- **`.reviews-subscore-label`** — muted, small.
- **`.reviews-subscore-value`** — font-weight 600.
- **`.reviews-recommended`** — italic, muted.
- **`.reviews-themes`** — margin-top block for praise/complaint chip groups.
- **`.reviews-themes--complaints`** — no additional style beyond `.reviews-themes`.
- **`.reviews-recent`** — section block.
- **`.reviews-recent-list`** — list-style none, grid gap.
- **`.reviews-recent-item`** — border-bottom separator, padding-bottom.
- **`.reviews-recent-meta`** — flex, gap, muted, small (rating + date row).
- **`.reviews-recent-rating`** — font-weight 600.
- **`.reviews-recent-date`** — muted.
- **`.reviews-recent-summary`** — normal text, small top margin.

### Blog Section
- **`.blog-tab`** — spacing container.
- **`.blog-tab-header-row`** — flex, space-between, align-items center, margin-bottom.
- **`.blog-frequency-row`, `.blog-audience-row`** — flex, align-items center, gap, margin-bottom.
- **`.blog-frequency-label`, `.blog-audience-label`** — muted, small, min-width so value aligns.
- **`.blog-topics`** — margin-top block for primary topics chips.
- **`.blog-recent-posts`** — margin-top block.
- **`.blog-post-list`** — `list-style: decimal; padding-left: 1.25rem; display: grid; gap: 0.5rem`.
- **`.blog-post-item`** — minimal padding, no extra border (list marker provides structure).
- **`.blog-post-title`** — normal weight. Links within: `color: var(--accent); text-decoration: none`. Hover: underline.
- **`.blog-post-date`** — muted, `font-size: 0.78rem`, block display below title.
- **`.blog-categories`** — margin-top block for category chips.

## Out of Scope
- No layout changes to the page structure.
- No changes to the Intelligence Brief section (raw JSON pre display is intentional for now).
- No typography or color system changes.
- No changes to JSX.
