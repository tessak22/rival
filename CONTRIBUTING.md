# Contributing to Rival

Thanks for your interest in contributing to Rival! This project is both a useful competitive intelligence tool and a showcase for the Tabstack API — so code quality matters twice.

## Getting Started

1. Fork the repo and clone your fork
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in your keys
4. `npx prisma migrate dev`
5. `npm run dev`

## Development Workflow

1. Pick an issue from the [issue tracker](../../issues)
2. Create a branch from `main`
3. Make your changes, following the conventions below
4. Run `npm run typecheck`, `npm test`, and `npm run build` to verify
5. Open a PR using the PR template — it includes an audit checklist

## Audit Commands

Rival includes Claude Code audit commands in `.claude/commands/` for automated code quality checks. See [`.claude/AUDIT_GUIDE.md`](.claude/AUDIT_GUIDE.md) for when to run each one.

### Quick reference

| Command               | When to Run                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `/audit-errors`       | Every PR touching `lib/tabstack/`, `lib/logger.ts`, cron, or SSE |
| `/audit-boundaries`   | Every PR adding imports across architectural layers              |
| `/audit-drift`        | Every PR modifying state, status fields, or enums                |
| `/audit-names`        | PRs adding public functions or Tabstack module code              |
| `/audit-abstractions` | PRs adding utility classes or interfaces                         |
| `/audit-dead-code`    | Monthly or before release                                        |
| `/audit-todos`        | Monthly                                                          |
| `/audit-idiomatic`    | Before release                                                   |
| `/finalize`           | End of every session                                             |
| `/tests-new`          | After any `lib/tabstack/` or `lib/logger.ts` changes             |
| `/changelog`          | Before each release                                              |

## Code Conventions

- **TypeScript strict mode** — no `any` types in `lib/`
- **Tabstack calls** — always go through `lib/logger.ts`, never raw `fetch`
- **Prisma** — use the query builder, not raw SQL (unless justified)
- **Naming** — domain-specific names in `lib/tabstack/` (`extractedPricing`, not `data`)
- **Status values** — typed unions, not raw strings

## Highest-Value Contributions

The `missing_fields` data in `api_logs` is the feedback loop for schema quality. Check the `/insights` page to find which fields are consistently missing, then improve the schemas in `lib/schemas/`. That's the open source flywheel.
