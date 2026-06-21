# Changelog Agent Integration Examples

This document provides practical examples of integrating the Changelog Generation Agent into various workflows.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [CI/CD Integration](#cicd-integration)
3. [Release Workflow](#release-workflow)
4. [Monorepo Usage](#monorepo-usage)
5. [Custom Automation](#custom-automation)

## Basic Usage

### Manual Changelog Generation

```bash
# Navigate to repository root
cd /path/to/pupcidslittletiktoolhelper_desktop

# Generate changelog comparing last tag with current HEAD
node app/modules/changelog-agent/changelog-cli.js --dry-run

# Review generated files
cat workspace/CHANGELOG.auto.*.md
cat workspace/patch-*/PR_BODY.md
```

### Compare Specific Versions

```bash
# Compare two specific versions
node app/modules/changelog-agent/changelog-cli.js \
  --base-ref v1.2.0 \
  --target-ref v1.3.0 \
  --dry-run

# Compare branch with main
node app/modules/changelog-agent/changelog-cli.js \
  --base-ref origin/main \
  --target-ref feature/new-feature \
  --dry-run
```

### Calendar Versioning

```bash
# Use calendar versioning instead of semver
node app/modules/changelog-agent/changelog-cli.js \
  --release-policy calver \
  --dry-run
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/changelog.yml`:

```yaml
name: Generate Changelog

on:
  push:
    branches:
      - develop
      - main
  pull_request:
    types: [opened, synchronize]

jobs:
  changelog:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git operations
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd app
          npm ci
      
      - name: Generate Changelog
        run: |
          node app/modules/changelog-agent/changelog-cli.js \
            --base-ref ${{ github.event.before }} \
            --target-ref ${{ github.event.after }} \
            --dry-run
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload Changelog Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: changelog-bundle
          path: workspace/
          retention-days: 30
      
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const changelogFiles = fs.readdirSync('workspace')
              .filter(f => f.startsWith('CHANGELOG.auto'));
            
            if (changelogFiles.length > 0) {
              const changelog = fs.readFileSync(
                `workspace/${changelogFiles[0]}`, 
                'utf8'
              );
              
              github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: `## 📝 Generated Changelog\n\n${changelog.substring(0, 5000)}\n\n*Full changelog available in artifacts*`
              });
            }
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
changelog:
  stage: build
  image: node:20
  script:
    - cd app && npm ci
    - cd ..
    - node app/modules/changelog-agent/changelog-cli.js --dry-run
  artifacts:
    paths:
      - workspace/
    expire_in: 30 days
  only:
    - develop
    - main
```

### Jenkins

Create `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '20'
    }
    
    stages {
        stage('Setup') {
            steps {
                nodejs(nodeJSInstallationName: env.NODE_VERSION) {
                    sh 'cd app && npm ci'
                }
            }
        }
        
        stage('Generate Changelog') {
            steps {
                nodejs(nodeJSInstallationName: env.NODE_VERSION) {
                    sh '''
                        node app/modules/changelog-agent/changelog-cli.js \
                          --base-ref ${GIT_PREVIOUS_COMMIT} \
                          --target-ref ${GIT_COMMIT} \
                          --dry-run
                    '''
                }
            }
        }
        
        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'workspace/**/*', fingerprint: true
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
    }
}
```

## Release Workflow

### Automated Release Preparation

Create `scripts/prepare-release.sh`:

```bash
#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Release Preparation Script${NC}\n"

# 1. Ensure we're on the right branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo -e "${YELLOW}⚠️  Not on develop branch. Current: $CURRENT_BRANCH${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 2. Fetch latest changes
echo -e "${GREEN}📥 Fetching latest changes...${NC}"
git fetch --all --tags --prune

# 3. Determine base ref
LATEST_TAG=$(git tag --list --sort=-creatordate 'v*' | head -n 1)
if [ -z "$LATEST_TAG" ]; then
    echo -e "${YELLOW}⚠️  No existing tags found. Using origin/main as base.${NC}"
    BASE_REF="origin/main"
else
    echo -e "${GREEN}✓ Found latest tag: $LATEST_TAG${NC}"
    BASE_REF="$LATEST_TAG"
fi

# 4. Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
cd app && npm ci && cd ..

# 5. Run tests first
echo -e "${GREEN}🧪 Running tests...${NC}"
cd app && npm test && cd ..

# 6. Generate changelog
echo -e "${GREEN}📝 Generating changelog...${NC}"
node app/modules/changelog-agent/changelog-cli.js \
    --base-ref "$BASE_REF" \
    --target-ref HEAD \
    --dry-run

# 7. Review changelog
echo -e "\n${GREEN}✅ Changelog generated successfully!${NC}\n"
echo -e "Review the changelog:"
echo -e "  ${YELLOW}workspace/CHANGELOG.auto.*.md${NC}\n"

# 8. Ask for confirmation
read -p "Create release branch and commit changes? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Get short SHA
    SHORT_SHA=$(git rev-parse --short HEAD)
    BRANCH_NAME="changelog/auto/release/${SHORT_SHA}"
    
    # Create branch
    echo -e "${GREEN}🌿 Creating branch: $BRANCH_NAME${NC}"
    git checkout -b "$BRANCH_NAME"
    
    # Copy patch files
    if [ -d "workspace/patch-${SHORT_SHA}" ]; then
        cp workspace/CHANGELOG.auto.*.md . 2>/dev/null || true
    fi
    
    # Stage changes
    git add -A
    
    # Commit
    COMMIT_MSG="chore(release): prepare release - Changelog-ID: ${SHORT_SHA}"
    git commit -m "$COMMIT_MSG"
    
    echo -e "\n${GREEN}✅ Release branch created!${NC}"
    echo -e "Next steps:"
    echo -e "  1. Review the changes: ${YELLOW}git diff origin/develop${NC}"
    echo -e "  2. Push branch: ${YELLOW}git push origin $BRANCH_NAME${NC}"
    echo -e "  3. Create PR on GitHub"
else
    echo -e "${YELLOW}ℹ️  Changes not committed. Review and commit manually.${NC}"
fi
```

Make it executable:

```bash
chmod +x scripts/prepare-release.sh
```

Usage:

```bash
./scripts/prepare-release.sh
```

### Pre-Release Checklist

Create `scripts/release-checklist.sh`:

```bash
#!/bin/bash

echo "🔍 Pre-Release Checklist"
echo "========================"
echo ""

PASS=0
FAIL=0

# Check 1: Clean working directory
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ Working directory is clean"
    ((PASS++))
else
    echo "❌ Working directory has uncommitted changes"
    ((FAIL++))
fi

# Check 2: Tests pass
cd app
if npm test > /dev/null 2>&1; then
    echo "✅ Tests pass"
    ((PASS++))
else
    echo "❌ Tests fail"
    ((FAIL++))
fi

# Check 3: Lint passes
if npm run lint > /dev/null 2>&1; then
    echo "✅ Linter passes"
    ((PASS++))
else
    echo "❌ Linter fails"
    ((FAIL++))
fi

# Check 4: Build succeeds
if npm run build > /dev/null 2>&1; then
    echo "✅ Build succeeds"
    ((PASS++))
else
    echo "❌ Build fails"
    ((FAIL++))
fi

cd ..

# Check 5: Changelog exists
if ls workspace/CHANGELOG.auto.*.md 1> /dev/null 2>&1; then
    echo "✅ Changelog generated"
    ((PASS++))
else
    echo "❌ Changelog not found"
    ((FAIL++))
fi

echo ""
echo "========================"
echo "Results: $PASS passed, $FAIL failed"

if [ $FAIL -eq 0 ]; then
    echo "✅ Ready for release!"
    exit 0
else
    echo "❌ Fix issues before releasing"
    exit 1
fi
```

## Monorepo Usage

For projects with multiple packages:

```bash
# Enable monorepo mode
node app/modules/changelog-agent/changelog-cli.js \
  --monorepo \
  --dry-run
```

The agent will:
1. Detect all packages with `package.json` files
2. Generate per-package changelogs
3. Determine version bumps per package
4. Update all package versions

## Custom Automation

### Node.js Script

Create `scripts/custom-changelog.js`:

```javascript
const ChangelogAgent = require('../app/modules/changelog-agent');
const notifier = require('node-notifier');

async function generateChangelogWithNotifications() {
  try {
    console.log('Starting changelog generation...');
    
    const agent = new ChangelogAgent({
      repositoryPath: process.cwd(),
      baseRef: process.argv[2], // Pass as CLI arg
      targetRef: 'HEAD',
      dryRun: true,
      releasePolicy: 'semver'
    });
    
    const result = await agent.execute();
    
    // Send desktop notification
    notifier.notify({
      title: 'Changelog Generated',
      message: `Successfully created changelog bundle at ${result.path}`,
      sound: true
    });
    
    // Could also send to Slack, Discord, etc.
    console.log('✅ Done! Check:', result.path);
    
  } catch (error) {
    notifier.notify({
      title: 'Changelog Generation Failed',
      message: error.message,
      sound: true
    });
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

generateChangelogWithNotifications();
```

### Pre-Commit Hook

Create `.git/hooks/pre-push`:

```bash
#!/bin/bash

# Only run on main/develop pushes
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" == "main" || "$BRANCH" == "develop" ]]; then
    echo "🔍 Generating changelog preview before push..."
    
    node app/modules/changelog-agent/changelog-cli.js \
        --dry-run \
        --base-ref origin/$BRANCH \
        --target-ref HEAD
    
    if [ $? -ne 0 ]; then
        echo "❌ Changelog generation failed. Fix issues before pushing."
        exit 1
    fi
    
    echo "✅ Changelog preview generated. Continue with push."
fi

exit 0
```

Make it executable:

```bash
chmod +x .git/hooks/pre-push
```

## Advanced Integration

### With Release Management Tools

#### semantic-release Integration

```javascript
// release.config.js
module.exports = {
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node app/modules/changelog-agent/changelog-cli.js --base-ref ${lastRelease.gitTag} --target-ref ${nextRelease.gitHead} --dry-run'
      }
    ],
    '@semantic-release/npm',
    '@semantic-release/github'
  ]
};
```

#### Husky + Commitlint

```json
{
  "husky": {
    "hooks": {
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS",
      "pre-push": "bash scripts/changelog-preview.sh"
    }
  }
}
```

### Automated Tagging

Create `scripts/auto-tag-release.sh`:

```bash
#!/bin/bash

set -e

# Generate changelog and extract version
node app/modules/changelog-agent/changelog-cli.js --dry-run

# Parse version from package.json
VERSION=$(node -p "require('./app/package.json').version")

# Create annotated tag
git tag -a "v${VERSION}" -m "Release v${VERSION}

$(cat workspace/CHANGELOG.auto.*.md)"

# Push tag
git push origin "v${VERSION}"

echo "✅ Tagged and pushed v${VERSION}"
```

## Troubleshooting Integration

### Common Issues

1. **Module not found errors**
   ```bash
   cd app && npm ci
   ```

2. **Git command failures**
   ```bash
   git fetch --all --tags --prune
   ```

3. **Permission denied**
   ```bash
   chmod +x app/modules/changelog-agent/changelog-cli.js
   ```

4. **GitHub token issues**
   ```bash
   export GITHUB_TOKEN=ghp_your_token_here
   ```

## Best Practices

1. **Always run dry-run first** in CI/CD
2. **Review changelogs manually** before releasing
3. **Use Conventional Commits** for better classification
4. **Tag releases** after merging for future base references
5. **Backup data** before major version bumps
6. **Test in staging** before production releases
7. **Monitor validation results** - don't ignore test failures

## Resources

- [Changelog Agent Guide](/app/docs/CHANGELOG_AGENT_GUIDE.md)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

**Last Updated:** 2024-01-05  
**Version:** 1.0.0
