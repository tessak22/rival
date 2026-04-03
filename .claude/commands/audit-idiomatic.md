# Audit Idiomatic

Analyze a codebase and audit for idiomatic usage of detected languages and frameworks.

## Workflow

### Phase 1: Stack Detection

Examine project root to identify the technology stack:

1. **Check manifest files** (in priority order):
   - `package.json` → Node.js ecosystem (check for React, Vue, Next.js, etc.)
   - `tsconfig.json` → TypeScript
   - `next.config.*` → Next.js
   - `tailwind.config.*` → Tailwind CSS
   - `prisma/schema.prisma` → Prisma ORM

2. **Sample source files** to confirm language usage and detect patterns.

3. **Check for existing guidelines** in `.claude/rules/` or `.claude/AUDIT_GUIDE.md`.

**Output**: Stack summary listing primary language, framework(s), and notable tools.

### Phase 2: Codebase Scan

Systematically review source files:
- Prioritize core application code over tests/configs
- Sample representative files from each major directory
- Focus on recent/active files when git history available

### Phase 3: Idiomatic Audit

Check code against idioms for the detected stack:

**Language Idioms**
- Preferred constructs (TypeScript strict mode, type inference)
- Error handling patterns
- Naming conventions
- Type usage and annotations

**Framework Conventions**
- Next.js App Router patterns (Server vs Client Components)
- React hooks usage
- Prisma query patterns and transaction idioms
- Tailwind CSS utility class usage

**Common Anti-Patterns to Flag**
- Reinventing framework functionality
- Using Pages Router patterns in App Router codebase
- Missing `async`/`await` on Server Components
- Client Components doing work that could be Server Components
- Prisma: N+1 query patterns, missing `include`/`select`
- TypeScript: `any` usage, missing return types on public functions
- Inconsistent style within the codebase

**Rival-Specific Checks**
- `lib/tabstack/` modules: Do they use `@tabstack/sdk` (not raw fetch)?
- Is `lib/logger.ts` called on every Tabstack API interaction?
- Are `effort` and `nocache` parameters typed correctly?
- Are SSE responses handled with proper streaming patterns?
- Is Prisma used through a repository/service layer, not directly in route handlers?

### Phase 4: Report

```markdown
# Idiomatic Audit Report

## Stack Detected
- **Language**: TypeScript
- **Framework**: Next.js (App Router)
- **Notable Tools**: Prisma, Tailwind CSS, @tabstack/sdk

## Summary
[2-3 sentence overview]

## Findings

### Critical (should fix)
[Issues that violate core idioms or cause problems]

### Recommended (improve quality)
[Patterns that could be more idiomatic]

### Minor (style preferences)
[Small improvements, optional]

## Positive Patterns Observed
[What the codebase does well idiomatically]
```

## Guidelines

- Be specific: cite file paths and line numbers
- Explain why: describe the idiomatic alternative and its benefits
- Prioritize: focus on impactful improvements over nitpicks
- Respect context: some "non-idiomatic" choices may be intentional
- Defer to project rules: if `.claude/AUDIT_GUIDE.md` contradicts an idiom, note it but don't flag as a violation
- **Run this before any public release** — Rival is a showcase codebase and non-idiomatic patterns undermine its credibility as a reference implementation
