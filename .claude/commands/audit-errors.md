---
context: fork
---

# Errors Audit

Detect error handling inconsistencies, anti-patterns, and silent failures.

## The Core Problem

Error handling inconsistency creates unpredictable failure modes and debugging nightmares. "Catch and Do Nothing" is among the most common anti-patterns, silently swallowing errors that should surface.

## What This Command Detects

| Pattern | Description |
|---------|-------------|
| **Empty Catch Blocks** | Exceptions caught but ignored |
| **Overly Broad Catches** | Catching Exception/Throwable/BaseException |
| **Lost Exception Chains** | Re-throwing without original cause |
| **Promises Without Catch** | Unhandled promise rejections |
| **Inconsistent Error Strategy** | Mixed approaches (exceptions vs result types vs error codes) |
| **Pointless Rethrow** | Catch only to rethrow unchanged |

## Phase 1: Discover the Codebase

1. **Identify the tech stack**:
   - Language (TypeScript, Python, Java, Go, PHP, Rust, etc.)
   - Error handling idioms (exceptions, Result types, error codes)
   - Async patterns (Promises, async/await, callbacks)

2. **Identify error handling conventions**:
   - Custom error classes
   - Error logging patterns
   - Global error handlers

## Phase 2: Parallel Audit (Using Subagents)

**Launch these subagents in parallel** using `Task` with `subagent_type=Explore`:

---

### Subagent 1: Empty & Broad Catch Blocks

```
Audit this codebase for empty catch blocks and overly broad exception handling.

Tech stack: [from Phase 1]

## EMPTY CATCH BLOCKS (Critical)
Find catch/except blocks with no meaningful handling:

Language patterns:
| Language | Empty Catch Pattern |
|----------|---------------------|
| JavaScript/TypeScript | `catch (e) { }` or `catch { }` |
| Python | `except: pass` or `except Exception: ...` with only pass/continue |
| Java/C# | `catch (Exception e) { }` |
| Go | `if err != nil { }` (empty block) |
| PHP | `catch (Exception $e) { }` |

Search for:
- catch/except blocks with 0 statements
- catch blocks with only comments
- catch blocks with only `pass`, `continue`, or `;`

## OVERLY BROAD CATCHES (High)
Find catches that are too generic:

| Language | Overly Broad Types |
|----------|-------------------|
| Java | Exception, Throwable, Error |
| Python | bare `except:`, `except BaseException`, `except Exception` |
| C# | Exception, SystemException |
| JavaScript | catch with no specific error type checking |

Flag when:
- Catching top-level exception type
- Not at application boundary (entry point, HTTP handler)
- No specific error type checking inside catch

## FALSE POSITIVES - Don't flag:
- `InterruptedException` in daemon threads (Java convention)
- `IOException` in finally block cleanup
- Comments containing "intentionally ignored" or "expected"
- Top-level error handlers at app entry points
- Framework boundaries (HTTP handlers, job processors)
- Annotations: @SuppressWarnings, # noqa, // NOPMD

Report each finding with:
- file:line reference
- The empty/broad catch
- What operation it wraps
- Risk level (data operations = critical)
- Suggested fix: log, propagate, or handle specifically
```

---

### Subagent 2: Lost Exception Chains

```
Audit this codebase for lost exception chains and re-throw anti-patterns.

Tech stack: [from Phase 1]

## LOST EXCEPTION CHAINS (High)
When catching and re-throwing, the original exception must be preserved:

BAD - loses original cause:
```java
catch (SQLException e) {
    throw new DataAccessException("DB error");  // 'e' not passed!
}
```

```python
except ValueError as e:
    raise CustomError("Invalid input")  # loses 'e'
```

```typescript
catch (error) {
    throw new AppError("Failed");  // loses 'error'
}
```

GOOD - preserves chain:
```java
catch (SQLException e) {
    throw new DataAccessException("DB error", e);  // cause preserved
}
```

```python
except ValueError as e:
    raise CustomError("Invalid input") from e  # chain preserved
```

```typescript
catch (error) {
    throw new AppError("Failed", { cause: error });  // ES2022 cause
}
```

Search for:
- throw/raise statements inside catch blocks
- New exception created without passing original
- Original exception variable not referenced in new throw

## POINTLESS RETHROW (Medium)
Catch only to rethrow unchanged adds noise:

```typescript
// Pointless - adds nothing
try {
    doSomething();
} catch (e) {
    throw e;  // Just rethrow - remove the try/catch
}
```

Legitimate rethrow (don't flag):
- Adds logging before rethrow
- Rethrows conditionally
- Rethrows in finally block

Report each finding with:
- file:line reference
- The lost chain or pointless rethrow
- Original exception type
- Suggested fix with correct syntax for the language
```

---

### Subagent 3: Promise & Async Error Handling

```
Audit this codebase for unhandled promise rejections and async error gaps.

Tech stack: [from Phase 1]

## PROMISES WITHOUT CATCH (High)
Find promise chains without error handling:

```typescript
// BAD - no catch
fetch('/api/data')
    .then(res => res.json())
    .then(data => setData(data));

// BAD - Promise.all without catch
Promise.all([fetchA(), fetchB()])
    .then(([a, b]) => process(a, b));
```

Search patterns:
- `.then()` without subsequent `.catch()`
- `Promise.all/race/any` without catch
- `new Promise()` without catch on the consumer side

## ASYNC/AWAIT WITHOUT TRY-CATCH (Medium)
Find async functions that don't handle errors:

```typescript
// BAD - no error handling
async function fetchUser(id: string) {
    const res = await fetch(`/users/${id}`);
    return res.json();
}
```

Flag when:
- async function has no try/catch
- async function doesn't propagate errors explicitly
- Called without .catch() or try/catch wrapper

## FLOATING PROMISES (High)
Async functions called without await:

```typescript
// BAD - promise result ignored
function handleClick() {
    saveData();  // Returns promise but not awaited
}

async function saveData() {
    await db.save(data);
}
```

Search for:
- Async function calls not preceded by `await`
- Async function calls whose result is not stored or returned
- void-returning functions that call async functions

## FALSE POSITIVES
Don't flag:
- Fire-and-forget patterns with explicit comment
- Event handlers that log errors internally
- Functions that return the promise for caller to handle
- Top-level async with global error handler

Report each finding with:
- file:line reference
- The unhandled async operation
- Where errors would go (swallowed, unhandled rejection)
- Suggested fix: add try/catch, add .catch(), or propagate
```

---

### Subagent 4: Error Strategy Consistency

```
Audit this codebase for inconsistent error handling strategies.

Tech stack: [from Phase 1]

## ERROR STRATEGY FINGERPRINTING
Identify which strategies are used and where:

| Strategy | Detection Markers |
|----------|-------------------|
| Exceptions | throw, raise, catch, except, try |
| Result types | Result<, Either<, Ok(, Err(, Some(, None |
| Error codes | return -1, return null, errno, error codes |
| Null returns | return null, return None, return nil |
| Callbacks | callback(err, result), (error, data) => |

## INCONSISTENCY DETECTION
Algorithm:
1. Count occurrences of each pattern per file/module
2. Determine dominant strategy (>70% of files)
3. Flag files that deviate from dominant pattern

## MIXED PATTERNS IN SAME FUNCTION (Critical)
```typescript
// BAD - mixed strategies
function getUser(id: string): Result<User, Error> {
    try {
        const user = db.find(id);
        if (!user) return null;  // Null return in Result function!
        return Ok(user);
    } catch (e) {
        throw e;  // Throws in Result function!
    }
}
```

Report each finding with:
- file:line reference
- Expected strategy (based on codebase dominant pattern)
- Actual strategy used
- Suggested migration path
```

---

### Subagent 5: Error Message Quality

```
Audit this codebase for poor error messages and debugging gaps.

Tech stack: [from Phase 1]

## GENERIC ERROR MESSAGES (Medium)
Find errors with unhelpful messages:

```typescript
// BAD - no context
throw new Error("Failed");
throw new Error("Invalid input");
throw new Error("Something went wrong");

// GOOD - actionable context
throw new Error(`User ${userId} not found in database`);
throw new Error(`Invalid email format: ${email}`);
throw new Error(`API request failed: ${response.status} ${response.statusText}`);
```

## ERROR LOGGING GAPS (High)
Find errors that aren't logged:

```typescript
// BAD - error swallowed
try {
    processPayment();
} catch (e) {
    showToast("Payment failed");  // Error details lost!
}
```

Report each finding with:
- file:line reference
- The generic/contextless error
- What context should be added
- Suggested improved message
```

---

## Phase 3: Prioritize Findings

| Priority | Pattern | Rationale |
|----------|---------|-----------|
| **P1 Critical** | Empty catch with data operations | Silent data loss |
| **P1 Critical** | Floating promises in critical paths | Unhandled failures |
| **P2 High** | Empty catch (general) | Masks all failures |
| **P2 High** | Bare except / catch Throwable | Catches system errors |
| **P2 High** | Promise without catch | Unhandled rejection |
| **P2 High** | Lost exception chain | Debugging nightmare |
| **P3 Medium** | Pointless rethrow | Noise without value |
| **P3 Medium** | Inconsistent error strategy | Maintenance burden |
| **P4 Low** | Generic error message | Debugging hindrance |

## Phase 4: Present Findings

```markdown
## Errors Audit Results

### Summary
- X empty catch blocks
- X overly broad catches
- X lost exception chains
- X promises without catch
- X error strategy inconsistencies

### P1 Critical - Fix Immediately
| Issue | Location | Pattern | Fix |
|-------|----------|---------|-----|
| ... | file:line | ... | ... |

### P2 High - Fix Soon
...
```

## Phase 5: Fix Options

1. **Auto-fixable**:
   - Add `// intentionally ignored` comments to legitimate empty catches
   - Add `.catch(console.error)` to floating promises

2. **Semi-auto** (generate fix):
   - Add cause to re-thrown exceptions
   - Convert pointless rethrow to let exception propagate

3. **Manual review required**:
   - Migrate error strategy (exceptions → Result types)
   - Add proper error handling to empty catches

## Notes

- Some empty catches are legitimate (interrupt handling, cleanup)
- Error strategy migration should be gradual, module by module
- Consider adding global unhandled rejection handler as safety net
