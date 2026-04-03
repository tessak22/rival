---
disable-model-invocation: true
---

# Finalize Recent Work

Clean up completed feature work.

## Purpose

Clean up the feature or refactor we've been working on in this session. Remove false starts, dead-end approaches, and experimental code now that we have a working solution. This is NOT a general codebase cleanup — it's specifically about consolidating the recent work into a clean, final implementation.

## Instructions

### Step 1: Identify Recent Work Scope

1. **Review the conversation** to understand:
   - What feature/refactor we've been building
   - Which files were created or modified
   - What approaches were tried (including ones that didn't work)

2. **Check git status** to see uncommitted changes and recently modified files:
   ```
   git status
   git diff --stat HEAD~5
   ```

### Step 2: Identify Cleanup Targets

Look for these patterns in the files we touched:

1. **False starts**: Commented-out alternative implementations, functions superseded by a better approach, imports no longer needed

2. **Experimental remnants**: Debug logging/console statements added during development, temporary variables or flags used for testing approaches, hardcoded test values

3. **Duplicated logic**: Multiple ways of doing the same thing where we settled on one

4. **Naming inconsistencies**: Variables/functions named for the first approach that no longer fit

5. **Over-engineering from iteration**: Abstractions added "just in case", configuration options that will never vary

### Step 3: Clean Up

For each file in scope:

1. **Remove dead code** — don't comment it out, delete it
2. **Consolidate** the working approach into clean, readable code
3. **Rename** anything that no longer reflects its purpose
4. **Simplify** — remove unnecessary indirection or abstraction
5. **Ensure consistency** — make sure the final implementation follows project conventions

### Step 4: Verify

1. **Run tests** to ensure the cleanup didn't break anything
2. **Run the build** if applicable

### Step 5: Summary

Report back with:
- Files cleaned up
- What was removed/consolidated
- Any concerns or items that need user input

## Important

- **Don't expand scope** — only touch files related to the recent work
- **Preserve the working solution** — this is about cleaning, not reimplementing
- **Ask if uncertain** — if unsure whether something is a false start or intentional, ask
- **Keep it simple** — the goal is clarity and maintainability, not perfection
