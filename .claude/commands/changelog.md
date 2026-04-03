# Update Changelog

Update CHANGELOG.md with changes since the last release.

## Instructions

Analyze commits since the last release and add missing entries to the `[Unreleased]` section of CHANGELOG.md using the Keep a Changelog format.

## Steps

1. **Find the last release tag**:
   ```
   git describe --tags --abbrev=0
   ```
   If no tags exist, use the initial commit.

2. **Get commits since the last release**:
   ```
   git log <last-tag>..HEAD --oneline
   ```

3. **Check for existing CHANGELOG.md**:
   - If it doesn't exist, create one following the Keep a Changelog format
   - If it exists, read the current `[Unreleased]` section

4. **Categorize each commit** into Keep a Changelog categories:
   - **Added** - New features
   - **Changed** - Changes in existing functionality
   - **Deprecated** - Soon-to-be removed features
   - **Removed** - Removed features
   - **Fixed** - Bug fixes
   - **Security** - Vulnerability fixes

5. **Compare commits against existing entries**:
   - Identify commits NOT already captured in the changelog
   - Skip commits that are already documented

6. **Add missing entries** to the appropriate category under `[Unreleased]`:
   - Write clear, user-facing descriptions (not raw commit messages)
   - Focus on what changed from the user's perspective
   - Group related commits into single entries when appropriate
   - Omit internal changes that don't affect users (CI tweaks, refactors with no behavior change)

7. **Present the changes** to the user before writing:
   - Show what entries will be added
   - Ask for confirmation before updating the file

## Keep a Changelog Format Reference

```markdown
## [Unreleased]

### Added
- New feature description

### Changed
- Change to existing feature

### Fixed
- Bug fix description

### Security
- Security fix description
```

## Notes

- Only add categories that have entries
- Write descriptions meaningful to end users
- Link to issues/PRs where relevant: `Fixed login bug (#123)`
- Be concise but descriptive
