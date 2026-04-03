---
context: fork
---

# TODOs Audit

Detect and prioritize technical debt markers, stale TODOs, and forgotten FIXMEs.

## The Core Problem

TODOs have an average lifespan of **166 days**. Nearly **47% are low-quality**, lacking actionable information. Without systematic tracking, debt accumulates invisibly.

## What This Command Detects

| Pattern | Description |
|---------|-------------|
| **Stale TODOs** | Old markers that should be resolved or removed |
| **Security TODOs** | Debt related to auth, validation, encryption |
| **Bug Markers** | FIXME, BUG, XXX indicating known defects |
| **Missing Context** | TODOs without explanation or owner |
| **Closed Issue References** | TODOs pointing to resolved issues |

## Marker Types & Severity

| Marker | Meaning | Default Priority |
|--------|---------|------------------|
| `TODO` | Planned improvement | Medium |
| `FIXME` | Known bug, needs fix | High |
| `HACK` | Temporary workaround | High |
| `XXX` | Dangerous/problematic | High |
| `BUG` | Confirmed defect | Critical |
| `OPTIMIZE` | Performance issue | Medium |

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: TODO Inventory & Age Analysis

```
Audit this codebase for all TODO/FIXME markers and their age.

## DETECTION PATTERNS
Universal marker regex:
(?://|#|<!--|/\*)\s*@?(TODO|FIXME|HACK|XXX|BUG|OPTIMIZE|REFACTOR|REVIEW|NOTE|DEPRECATED)\s*(?:\(([^)]+)\))?\s*:?\s*(.*)

## AGE SCORING (via git blame)
| Age | Priority Boost |
|-----|----------------|
| 0-30 days | None (fresh) |
| 31-90 days | +0.5 |
| 91-180 days | +1.0 |
| >365 days | +2.0 (stale) |

Sort by age descending (oldest first).
```

---

### Subagent 2: Security & Bug Markers

```
Audit this codebase for high-priority security and bug-related TODOs.

## SECURITY CONCERNS (Critical Priority)
Search for TODOs containing:
(TODO|FIXME|HACK|XXX).*(security|auth|password|credential|token|encrypt|decrypt|injection|XSS|CSRF|sanitize|validate|escape|permission|access.?control|vulnerability)

## BUG & DEFECT MARKERS (Critical/High)
Search for:
(TODO|FIXME|BUG|XXX).*(bug|crash|error|exception|race|deadlock|corrupt|memory.?leak|overflow|infinite.?loop|null.?pointer|broken)

## LOCATION MODIFIERS
| Path Contains | Priority Modifier |
|---------------|-------------------|
| /lib/tabstack/, /lib/logger | +3 (core Rival infrastructure) |
| /app/api/ | +2 (exposed surface) |
| /test/, /spec/ | -1 (test code) |

Report each finding with priority (base + modifiers) and suggested action.
```

---

### Subagent 3: Quality & Context Analysis

```
Audit this codebase for low-quality TODOs lacking context.

## MISSING EXPLANATION (High)
Flag TODOs with minimal content:
```typescript
// BAD - no context
// TODO
// TODO fix this

// GOOD - has context
// TODO: Add retry logic for transient network failures
// FIXME: Race condition when two users edit simultaneously - see #123
```

## QUALITY SCORE (0-100)
- Has explanation (>5 words): +40
- Has owner: +20
- Has issue reference: +20
- Has specific action verb: +10
- Not vague: +10

Flag TODOs with score <50.

## STALE GITHUB ISSUE REFERENCES
For TODOs referencing GitHub issues (#123), check if the issue is closed.
If closed, the TODO is stale and should be resolved or removed.

Report each finding with quality score and what's missing.
```

---

## Phase 3: Generate Report

```markdown
## TODO Audit Summary

### By Priority
| Priority | Count | Action |
|----------|-------|--------|
| Critical | X | Resolve now |
| High | X | Plan soon |
| Medium | X | Add to backlog |
| Low | X | Review/delete |

### Oldest Markers
[Top 5 oldest by age]

### Health Score
Technical Debt Index: X/100
```

## Notes

- Run this monthly to prevent debt accumulation
- Skip vendor/, node_modules/, generated/ directories
- README TODOs have different lifecycle than code TODOs
- Rival-specific: deferred spec decisions will accumulate as TODOs; keep them linked to open GitHub issues
