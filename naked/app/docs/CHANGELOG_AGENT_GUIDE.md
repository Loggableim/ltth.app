# Changelog Generation Agent Documentation

## Overview

The Changelog Generation Agent is an autonomous system that automates the process of:
- Comparing branches/tags to identify changes
- Classifying commits using Conventional Commits format
- Generating machine-readable (JSON) and human-readable (Markdown) changelogs
- Determining version bumps (semver/calver)
- Updating version metadata across all project files
- Running validation (lint/test/build)
- Creating pull requests or patch bundles

## Architecture

The agent is composed of several specialized modules:

### Core Modules

1. **ChangelogAgent (index.js)** - Main orchestrator
2. **GitOperations** - Git command wrapper
3. **CommitClassifier** - Commit parsing and classification
4. **ChangelogGenerator** - Changelog file generation
5. **VersionManager** - Version bump calculation and file updates
6. **ValidationRunner** - Lint/test/build execution
7. **PRGenerator** - Pull request or patch bundle creation

## Installation

The agent is installed as a module in the app:

```bash
cd app/modules/changelog-agent
```

## Usage

### Command Line Interface

```bash
# Basic usage - auto-detect base ref
node app/modules/changelog-agent/changelog-cli.js

# Specify base and target refs
node app/modules/changelog-agent/changelog-cli.js --base-ref v1.2.0 --target-ref develop

# Dry run mode (no PR, generates patch bundle)
node app/modules/changelog-agent/changelog-cli.js --dry-run

# Use calver versioning
node app/modules/changelog-agent/changelog-cli.js --release-policy calver

# Monorepo mode
node app/modules/changelog-agent/changelog-cli.js --monorepo
```

### Programmatic Usage

```javascript
const ChangelogAgent = require('./app/modules/changelog-agent');

const agent = new ChangelogAgent({
  repositoryPath: '/path/to/repo',
  baseRef: 'v1.0.0',        // Optional - auto-detects if not provided
  targetRef: 'HEAD',        // Optional - defaults to HEAD
  dryRun: false,            // Optional - defaults to false
  monorepo: false,          // Optional - defaults to false
  releasePolicy: 'semver',  // Optional - 'semver' or 'calver'
  gitAuth: {                // Optional - for PR creation
    token: 'github_token'
  }
});

const result = await agent.execute();
```

## Configuration

### Environment Variables

- `GITHUB_TOKEN` - GitHub API token for PR creation (optional)

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `repositoryPath` | string | `process.cwd()` | Path to git repository |
| `baseRef` | string | `null` | Base reference (auto-detects if null) |
| `targetRef` | string | `'HEAD'` | Target reference |
| `gitAuth` | object | `null` | GitHub authentication |
| `monorepo` | boolean | `false` | Enable monorepo support |
| `releasePolicy` | string | `'semver'` | Version policy ('semver' or 'calver') |
| `dryRun` | boolean | `false` | Generate patch bundle instead of PR |

## Base Reference Detection

If `baseRef` is not provided, the agent uses the following heuristics:

1. **Latest Annotated Tag**: Searches for tags matching `v*` pattern
2. **Main Branch**: Tries `origin/main` then `origin/master`
3. **Merge Base**: Falls back to `git merge-base` between HEAD and target

## Commit Classification

### Conventional Commits

The agent parses Conventional Commits format:

```
type(scope)!: subject

body

BREAKING CHANGE: description
```

**Supported types:**
- `feat` - New features
- `fix` - Bug fixes
- `perf` - Performance improvements
- `docs` - Documentation
- `refactor` - Code refactoring
- `chore` - Maintenance tasks
- `build` - Build system changes
- `ci` - CI/CD changes
- `test` - Tests
- `style` - Code style changes

**Breaking changes** are detected via:
- `!` in commit header (e.g., `feat!:`)
- `BREAKING CHANGE:` in commit body

### Semantic Analysis

For non-conventional commits, the agent performs semantic analysis:
- Keyword matching for commit type detection
- Lower confidence scores (30-70%)
- Flags for human review when confidence is low

## Risk Assessment

The agent assesses risk for each changed file:

### Risk Levels

- **High**: Core modules, database, auth, plugin system
- **Medium**: Plugins, package.json, native modules
- **Low**: Documentation, assets, CSS

### High-Risk Indicators

- Core module changes (`modules/database.js`, `modules/tiktok.js`, etc.)
- Database migrations or schema changes
- Native module dependencies (`better-sqlite3`, `node-gyp`)
- Plugin API modifications
- package.json changes

## Version Bumping

### Semver (Semantic Versioning)

Format: `MAJOR.MINOR.PATCH`

- **Major**: Breaking changes present
- **Minor**: New features, no breaking changes
- **Patch**: Bug fixes only

### Calver (Calendar Versioning)

Format: `YYYY.MM.DD`

Based on current date.

## Files Updated

The agent automatically updates:

1. **Root package.json** - Main Electron app version
2. **app/package.json** - Node.js app version
3. **plugins/*/plugin.json** - All plugin versions
4. **VERSION file** - If present
5. **CHANGELOG.md** - Appends/updates changelog

## Validation Pipeline

The agent runs the following validations:

1. **Dependencies Install**: `npm ci`
2. **Linting**: `npm run lint` (if exists)
3. **Tests**: `npm test`
4. **Build**: `npm run build` (if exists)

All validation results are captured and included in the PR/report.

## Human Approval Required

The agent pauses and requests human input when:

1. **Low Confidence**: Classification confidence < 80% for core modules
2. **Breaking Changes**: Any breaking changes detected
3. **Validation Failures**: Lint/test/build failures
4. **Database Migrations**: SQL schema or migration changes detected
5. **Native Modules**: Changes to native dependencies
6. **Large Changes**: >500 files or >100k lines changed

## Output Artifacts

### Dry Run Mode (Default without GitHub token)

Creates a patch bundle at `workspace/patch-{short_sha}/`:

- `changelog.json` - Machine-readable changelog
- `CHANGELOG.auto.{short_sha}.md` - Human-readable changelog
- `PR_BODY.md` - Generated PR body text
- `validation-logs.txt` - Test/build logs
- `SUMMARY.md` - Manual PR creation instructions

### PR Mode (With GitHub token)

Creates a branch and PR:

- Branch: `changelog/auto/{target-ref-slug}/{short-sha}`
- PR title: `Release prep: {version} — changes from {base} to {target}`
- Labels: `release`, `changelog-generated`, `needs-review`, `risk-{level}`
- Includes all validation results and risk assessment

## PR Structure

Generated PRs include:

1. **Summary**: Commit count, types breakdown
2. **Version Updates**: All version bumps
3. **Changelog**: Full or linked changelog
4. **Commits by Type**: Grouped by Conventional Commit type
5. **Files Changed**: Count and list
6. **Risk Assessment**: Risk levels and high-risk files
7. **Validation Results**: All test/build results
8. **Migration Steps**: If breaking changes present
9. **Revert Plan**: How to rollback the release

## Logging

Logs are written to:
- **Winston Logger**: Standard app logging
- **workspace/logs/changelog-agent.log**: Agent-specific log file
- **workspace/reports/changelog-report-{short_sha}.md**: Final report

## Example Workflow

```bash
# 1. Run the agent
node app/modules/changelog-agent/changelog-cli.js --dry-run

# 2. Review generated changelog
cat workspace/CHANGELOG.auto.*.md

# 3. Review validation results
cat workspace/patch-*/validation-logs.txt

# 4. If satisfied, create PR manually or run without dry-run
node app/modules/changelog-agent/changelog-cli.js
```

## Testing

Run the test suite:

```bash
node app/modules/changelog-agent/test-agent.js
```

Tests cover:
- Commit classification (Conventional Commits and semantic analysis)
- Version bump calculations (semver and calver)
- Risk assessment
- Changelog generation

## Security Considerations

- **Never commit secrets**: Agent never commits GitHub tokens or API keys
- **Secret detection**: Flags secrets in diffs for human review
- **Token masking**: GitHub tokens are never logged
- **Audit trail**: All actions logged with Changelog ID for traceability

## Error Handling

The agent includes comprehensive error handling:

- Git operation failures are caught and logged
- Validation failures don't stop the process
- Low confidence classifications are flagged
- All errors include context and stack traces

## Extending the Agent

### Adding Custom Classification Rules

Edit `commit-classifier.js`:

```javascript
// Add custom keywords
const keywords = {
  security: ['security', 'vulnerability', 'cve'],
  // ... other types
};
```

### Adding Custom Risk Patterns

Edit `commit-classifier.js`:

```javascript
this.highRiskPatterns = [
  /your-pattern/i,
  // ... other patterns
];
```

### Custom Version Policies

Edit `version-manager.js`:

```javascript
if (this.releasePolicy === 'custom') {
  return this.calculateCustomVersion();
}
```

## Best Practices

1. **Always review generated changelogs** before merging PRs
2. **Run in dry-run mode first** to preview changes
3. **Verify breaking changes** are correctly classified
4. **Test validation results** - don't merge if tests fail
5. **Keep commit messages clean** - use Conventional Commits format
6. **Tag releases** after merging for future base reference
7. **Backup before major releases** - especially with breaking changes

## Troubleshooting

### Agent can't detect base ref

**Solution**: Explicitly provide `--base-ref` or create a tag:
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
```

### Validation failures

**Solution**: Fix the issues before generating changelog:
```bash
cd app
npm run lint
npm test
npm run build
```

### Low classification confidence

**Solution**: Use Conventional Commits format in commit messages:
```bash
git commit -m "feat(module): add new feature"
```

### Git command failures

**Solution**: Ensure git is installed and repository is clean:
```bash
git status
git fetch --all --tags
```

## Future Enhancements

Planned features:
- [ ] Full GitHub API integration for automatic PR creation
- [ ] Slack/Discord notifications
- [ ] Interactive CLI mode for classification review
- [ ] Plugin-specific changelog generation
- [ ] Changelog template customization
- [ ] Integration with release notes generator
- [ ] Automated rollback functionality

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Calendar Versioning](https://calver.org/)
- [GitHub REST API](https://docs.github.com/en/rest)

## Support

For issues or questions:
1. Check this documentation
2. Review test files for examples
3. Check agent logs in `workspace/logs/`
4. Open an issue in the repository

---

**Version:** 1.0.0  
**Last Updated:** 2024-01-05  
**Author:** PupCid's Little TikTool Helper Team
