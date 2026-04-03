---
context: fork
---

# State Drift Audit

Detect and fix state synchronization issues, impossible states, and state management anti-patterns.

## What This Command Detects

State drift occurs when application state becomes inconsistent, duplicated, or poorly modeled.

### Categories of State Drift

| Category | Description |
|----------|-------------|
| **Boolean Explosion** | Multiple booleans creating 2^n states, many impossible |
| **Magic Strings** | String literals for status/state instead of enums/constants |
| **Duplicated State** | Same data stored in multiple locations |
| **Derived State Stored** | Computed values stored instead of calculated |
| **Impossible States** | "Bags of optionals" instead of discriminated unions |
| **Status Mismatches** | Database enums not matching code enums |
| **Missing State Machines** | Ad-hoc state transitions instead of explicit FSMs |
| **Single Source of Truth Violations** | Multiple authoritative sources for same data |

## Phase 1: Discover the Codebase

1. **Identify the tech stack**:
   - Frontend framework (React, Vue, Svelte, etc.)
   - State management (Redux, Zustand, Pinia, MobX, Context, etc.)
   - Backend framework
   - Database and ORM

2. **Map state locations**:
   - Frontend state files (stores, reducers, atoms, signals)
   - API response types
   - Database schemas/migrations
   - Shared types between frontend/backend

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: Boolean Explosion & Impossible States

```
Audit this codebase for boolean explosion and impossible state patterns.

## BOOLEAN EXPLOSION
Look for objects/components with multiple boolean flags that could conflict:
- `isLoading && isError` (both true = impossible)
- `isOpen && isClosed` (mutually exclusive)
- `isEditing && isViewing && isDeleting` (should be enum)

## IMPOSSIBLE STATES (Bags of Optionals)
Find types that allow invalid combinations:

BAD:
```typescript
type State = {
  isLoading?: boolean;
  data?: Data;
  error?: Error;
}
// Allows: { isLoading: true, data: someData, error: someError }
```

GOOD (discriminated union):
```typescript
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: Error }
```

Report each finding with:
- file:line reference
- The problematic pattern
- Suggested discriminated union refactor
```

---

### Subagent 2: Magic Strings & Status Mismatches

```
Audit this codebase for magic strings and status/enum mismatches.

## MAGIC STRINGS
Find string literals used for state/status that should be enums:

BAD:
```typescript
if (order.status === 'pending') { }
user.role = 'admin';
setStatus('active');
```

GOOD:
```typescript
if (order.status === OrderStatus.Pending) { }
user.role = UserRole.Admin;
setStatus(Status.Active);
```

Common status words to flag: pending, active, inactive, draft, published, completed, failed, cancelled, approved, rejected

## STATUS MISMATCHES
Find where database enums don't match code enums:
- Check Prisma/Drizzle schema enums vs TypeScript enums
- Database has 'cancelled' but code uses 'canceled' (spelling)
- Database has 5 values, code has 4 (missing value)

Report each finding with:
- file:line reference
- The magic string or mismatch
- Database definition location (if applicable)
- Suggested enum/constant
```

---

### Subagent 3: Duplicated & Derived State

```
Audit this codebase for duplicated and derived state anti-patterns.

## DERIVED STATE STORED AS STATE
Find computed values stored instead of calculated:

BAD:
```typescript
const [items, setItems] = useState([]);
const [filteredItems, setFilteredItems] = useState([]); // DERIVED!
const [total, setTotal] = useState(0); // DERIVED!

useEffect(() => {
  setFilteredItems(items.filter(...));
  setTotal(items.reduce(...));
}, [items]);
```

GOOD:
```typescript
const [items, setItems] = useState([]);
const filteredItems = useMemo(() => items.filter(...), [items]);
const total = items.reduce(...);
```

Report each finding with:
- file:line reference
- What is duplicated/derived
- The source of truth it should derive from
- Suggested refactor
```

---

### Subagent 4: State Machine Opportunities

```
Audit this codebase for ad-hoc state transitions that should be state machines.

## COMPLEX STATE TRANSITIONS WITHOUT FSM
Signs you need a state machine:
- Multiple related booleans that change together
- Complex conditional logic checking current state before transitions
- Transitions that should be invalid but aren't prevented

Look for multi-stage flows:
- Wizard/stepper components without step enum
- Form submission: idle -> validating -> submitting -> success/error
- Async operations: idle -> loading -> success/error -> idle
- SSE streaming: idle -> connecting -> streaming -> complete | error

GOOD (explicit state machine):
```typescript
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: Error; retryCount: number }
```

Report each finding with:
- file:line reference
- The implicit state flow detected
- States and transitions identified
- Suggested state machine structure
```

---

### Subagent 5: Single Source of Truth Violations

```
Audit this codebase for single source of truth violations.

## MULTIPLE SOURCES OF TRUTH
Find data that exists in multiple authoritative locations:
- Same interface/type name in multiple files
- Identical enum values defined separately
- Validation schemas duplicated client and server side
- Constants with same value in multiple files

## CROSS-LAYER STATE INCONSISTENCY
- Optimistic updates without proper rollback
- Cache invalidation that might miss updates
- Stale closures capturing old state

Report each finding with:
- file:line reference
- What has multiple sources
- Which should be the single source
- How to eliminate duplication
```

---

## Phase 3: Prioritize Findings

| Priority | Criteria | Examples |
|----------|----------|---------|
| **P1 Critical** | Causes bugs now | Impossible states reached, data corruption |
| **P2 High** | Will cause bugs | Missing state machine, race conditions likely |
| **P3 Medium** | Tech debt | Magic strings, derived state stored |
| **P4 Low** | Code quality | Minor duplication, naming inconsistencies |

## Notes

- Focus on `src/`, `app/`, `lib/` - skip `node_modules/`, `vendor/`
- Some "duplication" is intentional (denormalization for performance)
- Ask before removing what might be intentional caching
