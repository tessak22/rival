---
context: fork
---

# Abstractions Audit

Detect premature, hollow, and over-engineered abstractions that add complexity without value.

## The Core Problem

Abstractions that add indirection without value increase cognitive load and maintenance burden. As Sandi Metz observed: "Duplication is far cheaper than the wrong abstraction."

## What This Command Detects

| Pattern | Description |
|---------|-------------|
| **Pass-through Functions** | Wrappers that merely forward calls without adding value |
| **Single-method Classes** | Classes that should be plain functions |
| **Single-implementation Interfaces** | Speculative generality - interfaces with only one implementation |
| **Middle Man** | Classes that delegate most work elsewhere |
| **Prop/Config Drilling** | Unchanged parameters passed through many layers |
| **God Utils** | Catch-all classes with unrelated static methods |

## Phase 1: Discover the Codebase

1. **Identify the tech stack** and framework patterns
2. **Identify architectural patterns**: Adapters, facades, anti-corruption layers (legitimate thin wrappers)

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: Pass-through & Hollow Wrappers

```
Audit this codebase for pass-through functions and hollow wrappers.

## PASS-THROUGH FUNCTION DETECTION
A function is hollow if:
- Body has exactly 1 statement that is a call expression
- 80%+ of parameters are forwarded unchanged
- No branching, validation, transformation, or logging

Examples of HOLLOW (flag these):
```typescript
function getUser(id: string) {
  return userService.getUser(id);  // Just forwards - hollow
}
```

Examples of LEGITIMATE (don't flag):
```typescript
function getUser(id: string) {
  logger.info('Fetching user', { id });  // Adds logging - legitimate
  return userService.getUser(id);
}
```

## FALSE POSITIVE SUPPRESSION
Don't flag if:
- File is in /adapters/, /facades/, /anti-corruption/
- Contains logging, metrics, or tracing calls
- Is an API boundary or test seam
- Has comments: "API boundary", "testing seam", "extension point"

NOTE FOR RIVAL: `lib/logger.ts` wrapping all Tabstack calls is INTENTIONAL.
It adds timing, result quality evaluation, missing field detection, and writes
to api_logs. Do NOT flag as a hollow wrapper.

Report each finding with:
- file:line reference
- The hollow function and what it wraps
- Suggested fix: inline or justify
```

---

### Subagent 2: Single-method Classes

```
Audit this codebase for single-method classes that should be plain functions.

## SINGLE-METHOD CLASS DETECTION
Flag classes where:
- Exactly 1 public method (excluding constructor, getters, setters)
- Class name is a verb (CreateUser, SendEmail, ProcessOrder)
- No meaningful state beyond constructor injection

## LEGITIMATE SINGLE-METHOD CLASSES
Don't flag if:
- Implements an interface/protocol (strategy pattern)
- Has @Injectable, @Service, @Component decorators (DI requirement)
- Is a Command/Query handler (CQRS pattern)
- Maintains state that changes over calls

Report each finding with:
- file:line reference
- The class and its single method
- Whether it has meaningful state
- Suggested fix: convert to function or justify pattern
```

---

### Subagent 3: Single-implementation Interfaces

```
Audit this codebase for interfaces with only one implementation.

## SINGLE-IMPLEMENTATION INTERFACE DETECTION
Find interfaces where only 1 concrete implementation exists and:
- Not at an API boundary
- No mock/stub implementations in tests
- Not in /ports/, /interfaces/, /contracts/ (explicit boundary)

## LEGITIMATE SINGLE IMPLEMENTATIONS
Don't flag if:
- Has a mock/stub/fake in test directories
- Is in /ports/, /interfaces/, /contracts/
- Part of hexagonal/clean architecture boundary

Report each finding with:
- file:line reference
- The interface and its single implementation
- Whether a test double exists
- Suggested fix: collapse to concrete class or justify boundary
```

---

### Subagent 4: Middle Man & Excessive Delegation

```
Audit this codebase for Middle Man pattern and excessive delegation.

## MIDDLE MAN DETECTION
A class is a Middle Man if:
- >50% of methods just call another object's method
- Class adds no state, validation, or transformation

Example:
```typescript
class OrderService {
  constructor(private orderRepo: OrderRepository) {}

  findById(id: string) { return this.orderRepo.findById(id); }
  save(order: Order) { return this.orderRepo.save(order); }
  delete(id: string) { return this.orderRepo.delete(id); }
  // Every method just delegates - this class adds nothing
}
```

## PROP/CONFIG DRILLING
Track parameters passed through 3+ layers unchanged.

Report each finding with:
- file:line reference
- The middle man class or drilling chain
- Delegation ratio or drilling depth
- Suggested fix
```

---

### Subagent 5: God Utils & Manager Classes

```
Audit this codebase for catch-all utility classes.

## GOD UTILS DETECTION
Flag classes/modules with name patterns:
/(Manager|Handler|Helper|Utils?|Service|Processor|Common|Misc|Shared)$/

Combined with:
- >10 static methods
- Low cohesion (methods don't share data/dependencies)
- Methods with diverse, unrelated responsibilities

## COHESION ANALYSIS
For each Utils/Helper class:
1. Group methods by what they operate on
2. If 3+ distinct groups exist, class should be split

Report each finding with:
- file:line reference
- The class and method count
- Identified responsibility groups
- Suggested extractions
```

---

## Phase 3: Prioritize Findings

| Priority | Pattern | Rationale |
|----------|---------|-----------|
| **P1 Critical** | Pass-through forwarding ALL params | Zero added value |
| **P1 Critical** | Single-method class with verb name | Should be plain function |
| **P2 High** | Interface with one implementation (no test double) | Premature abstraction |
| **P2 High** | Middle Man (>75% delegation) | Remove indirection |
| **P3 Medium** | Utils with >20 unrelated methods | Cohesion problem |

## Notes

- Some abstractions exist for future extensibility - ask before removing
- Test seams are legitimate single-implementation interfaces
- Framework requirements (DI decorators) justify some patterns
