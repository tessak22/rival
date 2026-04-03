---
disable-model-invocation: true
---

# New Tests for Recent Work

Identify and add tests for recent code changes.

## Purpose

Review the feature or changes we've been working on in this session and identify what tests are missing. This is NOT about achieving 100% coverage — it's about ensuring the recent work has appropriate test coverage for the behavior that matters.

## Instructions

### Step 1: Identify Recent Work Scope

1. **Review the conversation** to understand what changed
2. **Check git status**:
   ```
   git status
   git diff HEAD
   ```

### Step 2: Analyze Test Coverage Needs

For each modified file, consider:

1. **New functionality**: New functions/methods without tests, new code paths, new error handling
2. **Changed behavior**: Modified logic that existing tests don't cover, edge cases
3. **Risk areas**: Complex conditional logic, data transformations, external service interactions

4. **What NOT to test**:
   - Simple getters/setters
   - Framework-provided functionality
   - Code that's already well-tested
   - Trivial one-liners

### Step 3: Check Existing Tests

1. Find related test files for the modified code
2. Check what's already covered
3. Understand the testing patterns used in the project

### Step 4: Write Tests

For each gap identified:

1. **Follow project conventions** — match existing test file structure, naming, and patterns
2. **Focus on behavior** — test what the code does, not how it does it
3. **Keep tests focused** — one concept per test
4. **Use descriptive names** — test names should explain the scenario
5. **Cover the happy path first**, then edge cases and errors

**Rival-specific priorities:**
- `lib/logger.ts`: Test via the public `logger.call()` interface — verify that a `partial` result correctly identifies and records `missing_fields`. Do not test internal helpers directly; they are not exported.
- `lib/tabstack/` modules: Test that `fallback_triggered` is set correctly when primary extraction fails
- Scanner: Test that `nocache: true` is passed on all scheduled scan calls
- Error paths: Test that failed Tabstack calls still write a record to `api_logs` with status `error`

### Step 5: Verify

1. **Run the new tests** to ensure they pass
2. **Run the full test suite** to ensure nothing broke
3. **Intentionally break the code** to verify tests catch it (then revert)

### Step 6: Summary

Report back with:
- Tests added (file and test names)
- What behavior is now covered
- Any gaps that couldn't be easily tested (and why)

## Important

- **Don't over-test** — focus on behavior that matters, not coverage metrics
- **Don't expand scope** — only test the recent work, not the whole codebase
- **Match project style** — use the same test framework, patterns, and conventions
- **Tests should be maintainable** — avoid brittle tests that break on implementation changes
