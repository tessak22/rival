---
context: fork
---

# Names Audit

Detect vague, inconsistent, and confusing identifier names that hurt code comprehension.

## The Core Problem

Research by Butler et al. found **statistically significant associations** between flawed identifier names and bugs. Naming quality directly impacts code comprehension and defect rates.

## What This Command Detects

| Pattern | Description |
|---------|-------------|
| **Vague Generic Names** | data, info, item, thing, handler, manager |
| **Single-letter Variables** | Non-idiomatic use outside loops/math |
| **Missing Boolean Prefixes** | `loading` instead of `isLoading` |
| **Negative Booleans** | `isNotDisabled`, `hasNoErrors` causing double-negation |
| **Casing Inconsistency** | Mixed camelCase/snake_case in same codebase |
| **Abbreviation Inconsistency** | Both `btn` and `button` in same codebase |

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: Vague Generic Names

```
Audit this codebase for vague and generic identifier names.

## ALWAYS FLAG THESE NAMES
```
data, info, item, thing, stuff, misc, foo, bar, baz,
temp, tmp, val, value, obj, object, element, node,
ret, retval, rv, output, input
```

## FLAG IF STANDALONE (needs qualification)
```
result, response, request, handler, processor, manager,
controller, helper, util, service, factory, wrapper,
list, array, map, set, dict, collection
```

GOOD: `userResult`, `apiResponse`, `formHandler`
BAD: `result`, `response`, `handler`

NOTE FOR RIVAL: In `lib/tabstack/` modules, prefer domain names:
- `extractedPricing` not `data`
- `changelogMarkdown` not `result`
- `careersJson` not `response`

Report each finding with:
- file:line reference
- The vague name and its scope size
- Suggested qualified alternatives
```

---

### Subagent 2: Boolean Naming Issues

```
Audit this codebase for boolean naming problems.

## MISSING BOOLEAN PREFIX (High)
Booleans should have predicative names.

VALID PREFIXES: is, are, was, were, has, have, had, can, could, should, will, does

NEEDS PREFIX - flag these standalone boolean names:
```
loading, loaded, active, visible, enabled, disabled,
valid, invalid, empty, open, closed, connected,
authenticated, selected, checked, ready, pending,
complete, done, finished, success, error, failed
```

## NEGATIVE BOOLEANS (Critical)
Negative booleans cause double-negation confusion:

FLAG THESE PATTERNS:
- `isNotValid`, `isNotReady`
- `hasNoErrors`, `hasNoItems`
- `notFound`, `notAllowed`

BAD: `if (!isNotDisabled) { }` // Triple negative!
GOOD: `if (isEnabled) { }`

## BOOLEAN FUNCTIONS WITHOUT PREDICATE
```typescript
// BAD
function checkPermission(): boolean { }
// GOOD
function hasPermission(): boolean { }
```

Report each finding with:
- file:line reference
- The problematic boolean name
- Negation issues if present
- Suggested positive form
```

---

### Subagent 3: Casing & Abbreviation Inconsistency

```
Audit this codebase for naming convention inconsistencies.

## LANGUAGE-SPECIFIC CONVENTIONS
| Language | Variables | Functions | Classes | Constants |
|----------|-----------|-----------|---------|-----------|
| TypeScript | camelCase | camelCase | PascalCase | SCREAMING_SNAKE |

## COMMON VIOLATIONS
```typescript
// Mixed casing in same file
const user_name = "John";      // snake_case
const userEmail = "j@x.com";   // camelCase - inconsistent!

// Constant without SCREAMING_SNAKE
const maxRetries = 3;          // Should be MAX_RETRIES
```

## ABBREVIATION INCONSISTENCY
Flag when both abbreviated and full forms appear:
- "button": 45 occurrences, "btn": 23 occurrences → INCONSISTENT

AMBIGUOUS ABBREVIATIONS (always flag):
- `res` → response? result? resource?
- `val` → value? validation? valid?
- `mod` → module? modifier? modulo?

## DOMAIN-SPECIFIC EXEMPTIONS
Don't flag:
- networking: ip, tcp, http, url, dns
- database: id, pk, fk, sql, db
- react: props, ref, ctx
- express: req, res, next

Report each finding with:
- file:line reference
- The inconsistent identifier
- Expected convention and suggested fix
```

---

## Phase 3: Prioritize Findings

| Priority | Issue | Rationale |
|----------|-------|-----------|
| **P1 Critical** | Negative boolean in conditionals | Logic errors |
| **P2 High** | Vague names in public APIs | Documentation debt |
| **P2 High** | Missing boolean prefix | Readability |
| **P2 High** | Ambiguous abbreviations | Multiple meanings |
| **P3 Medium** | Abbreviation inconsistency | Maintenance burden |
| **P3 Medium** | Casing inconsistency within file | Style debt |

## Notes

- Rival is a teaching artifact — bad names hurt twice: maintainability AND developer learning
- Domain experts may have valid abbreviation preferences
- Renaming public APIs requires deprecation cycle
