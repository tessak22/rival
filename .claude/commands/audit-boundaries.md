---
context: fork
---

# Boundaries Audit

Detect architectural layer violations and improper dependencies between modules.

## The Core Problem

Clean Architecture's fundamental rule: "Source code dependencies can only point inwards." Violations create tight coupling, make testing difficult, and undermine the architecture's benefits.

## What This Command Detects

| Pattern | Description |
|---------|-------------|
| **UI → Database Direct** | Presentation layer accessing persistence directly |
| **Domain → Infrastructure** | Core business logic depending on external services |
| **Business Logic in Controllers** | Fat controllers doing too much |
| **ORM Outside Repository** | Database queries scattered across codebase |
| **Scattered Environment Variables** | Config access outside config module |
| **Cross-bounded-context Imports** | DDD boundary violations |

## Phase 1: Discover the Codebase

1. **Identify architecture style**:
   - Clean/Hexagonal/Onion Architecture
   - MVC/MVVM
   - Layered Architecture
   - Module-based
   - No clear architecture (flag this)

2. **Infer layers from structure**:

**Layer folder patterns**:
```javascript
LAYERS = {
  presentation: ["controllers", "handlers", "routes", "views", "components", "pages", "ui"],
  application: ["services", "usecases", "use-cases", "commands", "queries", "interactors"],
  domain: ["domain", "entities", "models", "core", "aggregates", "valueobjects"],
  infrastructure: ["repositories", "persistence", "db", "infrastructure", "adapters", "gateways"],
  configuration: ["config", "settings", "env"]
}
```

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: Presentation → Data Violations

```
Audit this codebase for presentation layer directly accessing data layer.

Tech stack: [from Phase 1]
Architecture: [from Phase 1]

## UI IMPORTING DATABASE LAYER (Critical)
Find imports where presentation code accesses persistence:

Rule:
FROM: (controllers|views|components|pages|handlers|routes)
TO:   (repositories|persistence|db|dao|prisma|sequelize|typeorm|mongoose)

Examples of VIOLATIONS:
```typescript
// In: components/UserList.tsx
import { prisma } from '../db/client';  // VIOLATION: component → db

// In: pages/orders.tsx
import { OrderRepository } from '../repositories/order';  // VIOLATION

// In: controllers/UserController.ts
import { Pool } from 'pg';  // VIOLATION: controller → raw db
```

## WHAT TO ALLOW
Don't flag:
- Controllers calling services/use-cases (proper layering)
- Controllers using DTOs from shared types
- Test files mocking database
- Configuration/bootstrap files

Report each finding with:
- file:line reference
- The violating import or query
- Source layer → target layer
- Suggested fix: introduce service layer, use repository pattern
```

---

### Subagent 2: Domain → Infrastructure Violations

```
Audit this codebase for domain layer depending on infrastructure.

## DOMAIN DEPENDING ON INFRASTRUCTURE (Critical)
Core business logic should have NO external dependencies.

## PROPER PATTERN
Domain defines interfaces (ports), infrastructure implements:

```typescript
// GOOD: domain/ports/PaymentGateway.ts (interface only)
export interface PaymentGateway {
  charge(amount: Money): Promise<PaymentResult>;
}

// GOOD: infrastructure/StripePaymentGateway.ts (implementation)
import Stripe from 'stripe';
export class StripePaymentGateway implements PaymentGateway {
  charge(amount: Money): Promise<PaymentResult> { ... }
}
```

Report each finding with:
- file:line reference
- The domain file with infrastructure import
- What infrastructure it depends on
- Suggested fix: define interface in domain, implement in infrastructure
```

---

### Subagent 3: Business Logic in Controllers

```
Audit this codebase for fat controllers with business logic.

## FAT CONTROLLER HEURISTICS
A controller is doing too much if:
- >50 lines of code (excluding imports/decorators)
- Imports BOTH ORM AND domain entities
- Contains SQL or complex query strings
- Has >4 injected dependencies
- Contains loops processing business data
- Has conditional business rules (not just routing)

## PROPER CONTROLLER
Controller should only:
- Parse request (params, body, query)
- Call single service/use-case method
- Format response
- Handle HTTP-specific concerns (status codes, headers)

Report each finding with:
- file:line reference
- Controller name and lines of code
- Business logic indicators found
- Suggested extraction to service layer
```

---

### Subagent 4: ORM & Database Access Violations

```
Audit this codebase for database queries outside repository/data layer.

## ORM OUTSIDE REPOSITORY (High)
Database access should be encapsulated in repository/data layer.

Flag when files outside data layer:
- Import ORM/database packages
- Contain query builder calls
- Have raw SQL strings
- Use database transactions

Report each finding with:
- file:line reference
- The non-repository file
- What database access it contains
- Suggested refactor to repository pattern
```

---

### Subagent 5: Configuration & Environment Violations

```
Audit this codebase for scattered environment variable access.

## ENVIRONMENT VARIABLES OUTSIDE CONFIG (Medium)
All env var access should be centralized in config module.

Rule:
FROM: NOT (config|configuration|settings|env)
TO:   process.env | os.environ | getenv

## PROPER PATTERN
Centralized config with typed exports:

```typescript
// GOOD: config/index.ts
export const config = {
  email: {
    apiKey: process.env.SENDGRID_API_KEY || '',
  },
} as const;

// GOOD: services/EmailService.ts
import { config } from '../config';
const apiKey = config.email.apiKey;  // Typed, centralized
```

Report each finding with:
- file:line reference
- The env var access
- Where it should be defined (config module)
- Suggested config structure
```

---

## Phase 3: Prioritize Findings

| Priority | Violation | Impact |
|----------|-----------|--------|
| **P1 Critical** | UI → Database direct | Bypasses validation, security risk |
| **P1 Critical** | Domain → Infrastructure | Core architecture violation |
| **P2 High** | Controller with DB queries | Untestable, tightly coupled |
| **P2 High** | ORM outside repository | Data access scattered |
| **P3 Medium** | Env vars scattered | Testing difficulty |
| **P4 Low** | Controller slightly fat (<100 LOC) | Minor maintainability |

## Legitimate Cross-cutting Concerns

Don't flag these cross-layer imports:
- **Logging**: `/logging/`, `/logger/`
- **Errors**: `/errors/`, `/exceptions/`
- **Auth middleware**: `/auth/`, `/middleware/`
- **Shared types**: `/types/`, `/interfaces/`, `/contracts/`, `/dto/`
- **DI setup**: `main.*`, `bootstrap.*`, `container.*`, `app.*`
- **Tests**: All test directories

## Notes

- Some frameworks require certain patterns (e.g., Next.js API routes)
- Monorepos may have different boundaries per package
- Legacy codebases may need gradual migration strategy
