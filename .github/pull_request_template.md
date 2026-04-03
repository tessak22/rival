## Description

<!-- What does this PR do? Why? -->

## Related Issue

Closes #

---

## Audit Checklist

Check which audits you ran for this PR. See `.claude/AUDIT_GUIDE.md` for when each applies.

### Required for Tabstack / lib/ changes
- [ ] `/audit-errors` — **Required** for any PR touching `lib/tabstack/`, `lib/logger.ts`, cron jobs, or SSE handlers
- [ ] `/audit-boundaries` — **Required** for any PR adding imports across architectural layers
- [ ] `/audit-drift` — **Required** for any PR adding/modifying state, status fields, or enums

### Recommended
- [ ] `/audit-abstractions` — for PRs adding new utility classes, interfaces, or `lib/` modules
- [ ] `/audit-names` — for PRs adding public-facing functions or `lib/tabstack/` code
- [ ] `/tests-new` — for any new `lib/tabstack/` module or `lib/logger.ts` changes

### Every PR
- [ ] `/finalize` — run at end of session before opening PR

### Not applicable to this PR
<!-- List any Required audits that don't apply and briefly explain why -->

---

## Validation

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Manually tested the affected feature

## Notes for Reviewer

<!-- Anything the reviewer should know: edge cases, tradeoffs, follow-up issues -->
