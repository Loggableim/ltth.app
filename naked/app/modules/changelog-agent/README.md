# Changelog Generation Agent

Autonomous agent for automated changelog generation and release preparation.

## Quick Start

```bash
# Run with defaults (auto-detect base ref, dry-run mode)
node app/modules/changelog-agent/changelog-cli.js --dry-run

# Compare specific refs
node app/modules/changelog-agent/changelog-cli.js --base-ref v1.2.0 --target-ref develop

# Run tests
node app/modules/changelog-agent/test-agent.js
```

## Features

- ✅ **Automatic commit classification** using Conventional Commits
- ✅ **Semantic analysis** for non-conventional commits
- ✅ **Risk assessment** for changed files
- ✅ **Version bumping** (semver/calver)
- ✅ **Multi-file updates** (package.json, plugin.json, VERSION)
- ✅ **Validation pipeline** (lint/test/build)
- ✅ **Changelog generation** (JSON + Markdown)
- ✅ **PR preparation** with full metadata
- ✅ **Human approval** for critical changes
- ✅ **Dry-run mode** for safe preview

## Module Structure

```
changelog-agent/
├── index.js                  # Main ChangelogAgent orchestrator
├── git-operations.js         # Git command wrapper
├── commit-classifier.js      # Commit parsing & classification
├── changelog-generator.js    # Changelog file generation
├── version-manager.js        # Version bump logic
├── validation-runner.js      # Lint/test/build runner
├── pr-generator.js          # PR/patch bundle creation
├── changelog-cli.js         # Command-line interface
├── test-agent.js            # Test suite
└── README.md                # This file
```

## Documentation

See [CHANGELOG_AGENT_GUIDE.md](/app/docs/CHANGELOG_AGENT_GUIDE.md) for complete documentation.

## Output

### Dry-Run Mode (Default)

Generates a patch bundle at `workspace/patch-{sha}/`:
- `changelog.json` - Machine-readable changelog
- `CHANGELOG.auto.{sha}.md` - Human-readable changelog
- `PR_BODY.md` - PR description
- `validation-logs.txt` - Test results
- `SUMMARY.md` - Manual instructions

### PR Mode (With GitHub Token)

Creates:
- Branch: `changelog/auto/{target}/{sha}`
- Pull request with full metadata
- Labels: risk level, breaking changes, etc.

## Configuration

### CLI Options

```
--base-ref <ref>        Base reference (auto-detect if omitted)
--target-ref <ref>      Target reference (default: HEAD)
--repo-path <path>      Repository path (default: current dir)
--dry-run               Generate patch bundle (default if no token)
--monorepo              Enable monorepo mode
--release-policy <type> semver or calver (default: semver)
--help, -h              Show help
```

### Environment Variables

```bash
export GITHUB_TOKEN=ghp_...  # For PR creation
```

## Examples

### Compare with Latest Tag

```bash
node changelog-cli.js --dry-run
```

### Specific Version Comparison

```bash
node changelog-cli.js --base-ref v1.0.0 --target-ref v1.1.0
```

### Use Calendar Versioning

```bash
node changelog-cli.js --release-policy calver
```

## Testing

```bash
# Run all tests
node test-agent.js

# Expected output:
# ✅ Commit Classifier tests passed
# ✅ Version Manager tests passed
# ✅ Changelog Generator tests passed
```

## Integration

### As Module

```javascript
const ChangelogAgent = require('./app/modules/changelog-agent');

const agent = new ChangelogAgent({
  baseRef: 'v1.0.0',
  targetRef: 'HEAD',
  dryRun: true
});

const result = await agent.execute();
console.log(result);
```

### In CI/CD

```yaml
- name: Generate Changelog
  run: |
    node app/modules/changelog-agent/changelog-cli.js \
      --base-ref ${{ github.event.before }} \
      --target-ref ${{ github.event.after }} \
      --dry-run
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Workflow

1. **Initialize**: Fetch refs, detect base if needed
2. **Gather**: Collect commits and changed files
3. **Classify**: Parse commits (Conventional or semantic)
4. **Assess**: Evaluate risk for each file
5. **Generate**: Create JSON and Markdown changelogs
6. **Calculate**: Determine version bumps
7. **Validate**: Run lint/test/build
8. **Check**: Flag issues for human approval
9. **Update**: Modify version files (if not dry-run)
10. **Output**: Create PR or patch bundle

## Commit Classification

### Conventional Commits

Recognized format: `type(scope)!: subject`

**Types**: feat, fix, perf, docs, refactor, chore, build, ci, test, style

**Breaking changes**: `!` in header or `BREAKING CHANGE:` in body

### Semantic Analysis

For non-conventional commits:
- Keyword matching
- Lower confidence (30-70%)
- Flags for human review

## Risk Assessment

### Levels

- 🔴 **High**: Core modules, database, auth
- 🟡 **Medium**: Plugins, dependencies, native modules  
- 🟢 **Low**: Docs, assets, styles

### Human Approval Required

- Low confidence on core modules
- Breaking changes
- Validation failures
- Database migrations
- Native module changes

## Version Bumping

### Semver

- **Major** (x.0.0): Breaking changes
- **Minor** (0.x.0): New features
- **Patch** (0.0.x): Bug fixes

### Calver

- Format: `YYYY.MM.DD`
- Based on current date

## Files Updated

Automatically updates:
- Root `package.json` (Electron)
- `app/package.json` (Node.js)
- `plugins/*/plugin.json` (all plugins)
- `VERSION` (if exists)
- `CHANGELOG.md` (appends)

## Logging

Logs written to:
- **Winston**: Standard app logs
- `workspace/logs/changelog-agent.log`: Agent-specific
- `workspace/reports/changelog-report-{sha}.md`: Final report

## Security

- ✅ Never commits secrets
- ✅ Masks GitHub tokens in logs
- ✅ Detects secrets in diffs
- ✅ Audit trail via Changelog ID

## Error Handling

- Git failures caught and logged
- Validation failures captured
- Low confidence flagged
- Full stack traces in logs

## Best Practices

1. ✅ Review generated changelogs before merge
2. ✅ Run dry-run first
3. ✅ Verify breaking changes
4. ✅ Don't merge on test failures
5. ✅ Use Conventional Commits
6. ✅ Tag releases after merge
7. ✅ Backup before major updates

## Troubleshooting

### Can't detect base ref
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
```

### Validation failures
```bash
cd app && npm run lint && npm test
```

### Low confidence
Use Conventional Commits format:
```bash
git commit -m "feat(module): add feature"
```

## Future Enhancements

- [ ] GitHub API PR creation
- [ ] Slack/Discord notifications
- [ ] Interactive CLI review mode
- [ ] Plugin-specific changelogs
- [ ] Custom changelog templates
- [ ] Automated rollback

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Full Documentation](/app/docs/CHANGELOG_AGENT_GUIDE.md)

---

**Version:** 1.0.0  
**License:** CC-BY-NC-4.0  
**Author:** PupCid's Little TikTool Helper Team
