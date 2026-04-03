---
context: fork
---

# Dead Code Audit

Detect unused exports, unreachable code, orphaned files, and stale feature flags.

## The Core Problem

Dead code degrades comprehensibility and introduces maintenance risk. It confuses developers, increases bundle size, and creates false dependencies.

## What This Command Detects

| Pattern | Confidence | Description |
|---------|------------|-------------|
| **Unreachable Code** | 100% | Code after return/throw/break |
| **Unused Imports** | 90% | Imported but never referenced |
| **Orphaned Files** | 85% | Files unreachable from entry points |
| **Unused Exports** | 60% | Exported but never imported elsewhere |
| **Commented-out Code** | 70% | Old code left in comments |
| **Stale Feature Flags** | 80% | Flags at 100%/0% for extended periods |

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: Unreachable Code (100% Confidence)

```
Audit this codebase for unreachable code that can be safely removed.

## UNREACHABLE AFTER CONTROL FLOW (100% confidence)
Code following these statements is unreachable:
- return, throw/raise, break, continue, process.exit()

## ALWAYS-TRUE/FALSE CONDITIONS (100% confidence)
```typescript
if (true) { }   // Condition always true
if (false) { }  // Block never executes
```

Report each finding with:
- file:line reference
- The unreachable code and why it's unreachable
- Safe to delete: YES (100% confidence)
```

---

### Subagent 2: Unused Imports & Exports

```
Audit this codebase for unused imports and exports.

## UNUSED IMPORTS (90% confidence)
Find imports where the imported symbol is never used in the file.

## UNUSED EXPORTS (60% confidence)
Find exports never imported by other files.

## FALSE POSITIVES - Don't flag:
- Exports from package entry points (index.ts, main)
- Exports with @public, @api JSDoc tags
- Type-only exports in declaration files

Report each finding with:
- file:line reference
- The unused import/export
- Confidence level
- Suggested action: remove or verify
```

---

### Subagent 3: Orphaned Files

```
Audit this codebase for files not reachable from any entry point.

## ORPHANED FILE DETECTION (85% confidence)
A file is orphaned if no import path leads to it from entry points.

## FALSE POSITIVES - Don't flag:
- Test files (*_test.*, *.spec.*, __tests__/*)
- Config files (*.config.js, .eslintrc, etc.)
- Build scripts, migration files, seed/fixture files
- Type declaration files (*.d.ts)
- Files in: /scripts/, /migrations/, /seeds/, /fixtures/

NOTE FOR RIVAL: Watch for orphaned files from the demo vs. self-hosted
split. If a demo route is scaffolded then restructured, the old version may linger.

Report each finding with:
- file path, why it's considered orphaned
- Files that import it (if any)
- Confidence level
- Suggested action: delete or verify
```

---

### Subagent 4: Commented-out Code

```
Audit this codebase for commented-out code that should be deleted.

## COMMENTED CODE DETECTION (70% confidence)
Distinguish code comments from documentation:

POSITIVE indicators (likely code):
- Contains keywords: if, for, while, return, class, function, const, let
- Contains operators: {, }, ;, =, =>, ()
- Contains function calls: word()

NEGATIVE indicators (likely documentation):
- JSDoc/docstring patterns: /**, @param, @return
- Natural language sentences
- TODO/FIXME markers (handled by audit-todos)

NOTE FOR RIVAL: Watch for commented-out experimental JSON schema attempts
in lib/tabstack/ modules. These accumulate during iteration.

Report each finding with:
- file:line reference
- The commented code snippet, age (from git blame), size
- Suggested action: delete (recoverable via git)
```

---

### Subagent 5: Stale Feature Flags & Dead Conditionals

```
Audit this codebase for stale feature flags and dead conditional branches.

## CONSTANT CONDITIONALS
Find conditionals that always evaluate the same:
```typescript
const DEBUG = false;
if (DEBUG) {
  console.log('debug info');  // Never runs
}
```

## DEAD FEATURE CODE
When a flag is removed but code remains:
```typescript
const useNewCheckout = true;  // Was a flag, now hardcoded
if (useNewCheckout) {
  newCheckout();
} else {
  oldCheckout();  // DEAD - flag is always true
}
```

Report each finding with:
- file:line reference
- The stale flag or dead conditional
- Current value (if determinable)
- Code that can be removed
```

---

## Phase 3: Confidence-Based Actions

| Confidence | Action |
|------------|--------|
| **100%** | Auto-remove safe |
| **90%** | Brief review |
| **85%** | Check for dynamic usage |
| **70%** | Manual review |
| **60%** | Flag for discussion |

## Framework-Specific False Positive Rules

### Next.js
- Don't flag: Components (may be dynamically routed)
- Don't flag: Pages in /pages or /app directory
- Don't flag: API routes

## Notes

- Run tests after any deletion
- Commented code is recoverable via git history
- Dynamic imports make static analysis incomplete
