/**
 * Changelog Generator Module
 * 
 * Generates machine-readable (JSON) and human-readable (Markdown) changelogs
 */

const fs = require('fs');
const path = require('path');

class ChangelogGenerator {
  constructor() {
    this.typeHeaders = {
      feat: '### ✨ Features',
      fix: '### 🐛 Bug Fixes',
      perf: '### ⚡ Performance',
      docs: '### 📚 Documentation',
      refactor: '### ♻️ Refactoring',
      chore: '### 🔧 Chores',
      build: '### 🏗️ Build System',
      ci: '### 👷 CI/CD',
      test: '### ✅ Tests',
      style: '### 💄 Style'
    };
  }

  /**
   * Generate machine-readable JSON changelog
   */
  async generateJSON(changelogData, outputPath) {
    const json = JSON.stringify(changelogData, null, 2);
    fs.writeFileSync(outputPath, json, 'utf8');
    return outputPath;
  }

  /**
   * Generate human-readable Markdown changelog
   */
  async generateMarkdown(changelogData, outputPath) {
    const { meta, changes, packages } = changelogData;
    
    let markdown = this.generateHeader(meta);
    markdown += this.generateSummary(changes);
    markdown += this.generateBreakingChanges(changes);
    markdown += this.generateChangesByType(changes);
    markdown += this.generateMigrationSteps(changes);
    markdown += this.generateUpgradeInstructions(meta, packages);
    markdown += this.generateFooter(meta);

    fs.writeFileSync(outputPath, markdown, 'utf8');
    return outputPath;
  }

  /**
   * Generate changelog header
   */
  generateHeader(meta) {
    return `# Changelog

**Generated:** ${new Date(meta.generatedAt).toLocaleString('de-DE')}  
**Repository:** ${meta.repo}  
**Base:** \`${meta.baseRef}\`  
**Target:** \`${meta.targetRef}\`  
**Changelog ID:** \`${meta.changelogId}\`  
**Generator Version:** ${meta.generatorVersion}

---

`;
  }

  /**
   * Generate summary section
   */
  generateSummary(changes) {
    const types = {};
    let breakingCount = 0;

    changes.forEach(commit => {
      const type = commit.classification.type;
      types[type] = (types[type] || 0) + 1;
      if (commit.classification.breaking) {
        breakingCount++;
      }
    });

    let summary = '## 📋 Summary\n\n';
    summary += `This release includes **${changes.length} commits** across multiple areas:\n\n`;

    for (const [type, count] of Object.entries(types)) {
      const icon = this.getTypeIcon(type);
      summary += `- ${icon} **${count}** ${type}\n`;
    }

    if (breakingCount > 0) {
      summary += `\n⚠️ **${breakingCount} BREAKING CHANGE${breakingCount > 1 ? 'S' : ''}** - Review carefully before upgrading!\n`;
    }

    summary += '\n---\n\n';
    return summary;
  }

  /**
   * Generate breaking changes section
   */
  generateBreakingChanges(changes) {
    const breaking = changes.filter(c => c.classification.breaking);
    
    if (breaking.length === 0) {
      return '';
    }

    let section = '## ⚠️ BREAKING CHANGES\n\n';
    section += '**Please review these changes carefully before upgrading:**\n\n';

    breaking.forEach(commit => {
      const scope = commit.classification.scope ? `**${commit.classification.scope}:**` : '';
      section += `- ${scope} ${commit.subject}\n`;
      section += `  - Commit: \`${commit.hash.substring(0, 7)}\`\n`;
      section += `  - Author: ${commit.author}\n`;
      if (commit.body) {
        section += `  - Details: ${commit.body.split('\n')[0]}\n`;
      }
      section += '\n';
    });

    section += '---\n\n';
    return section;
  }

  /**
   * Generate changes organized by type
   */
  generateChangesByType(changes) {
    const byType = {};

    changes.forEach(commit => {
      const type = commit.classification.type;
      if (!byType[type]) {
        byType[type] = [];
      }
      byType[type].push(commit);
    });

    let section = '## 📝 Changes\n\n';

    // Order types logically
    const orderedTypes = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style'];

    orderedTypes.forEach(type => {
      if (byType[type]) {
        section += `${this.typeHeaders[type] || `### ${type}`}\n\n`;

        byType[type].forEach(commit => {
          const scope = commit.classification.scope ? `**${commit.classification.scope}:**` : '';
          const breaking = commit.classification.breaking ? ' 🔥 **BREAKING**' : '';
          section += `- ${scope} ${commit.subject}${breaking}\n`;
          section += `  - \`${commit.hash.substring(0, 7)}\` by ${commit.author}\n`;
          
          // Add confidence warning if low
          if (commit.classification.confidence < 0.8) {
            section += `  - ⚠️ Classification confidence: ${(commit.classification.confidence * 100).toFixed(0)}%\n`;
          }
          section += '\n';
        });
      }
    });

    section += '---\n\n';
    return section;
  }

  /**
   * Generate migration steps
   */
  generateMigrationSteps(changes) {
    const breaking = changes.filter(c => c.classification.breaking);
    
    if (breaking.length === 0) {
      return '';
    }

    let section = '## 🔄 Migration Steps\n\n';
    section += 'Follow these steps to migrate to this version:\n\n';
    section += '1. **Backup your data**\n';
    section += '   ```bash\n';
    section += '   cp -r app/data app/data.backup\n';
    section += '   cp -r app/user_configs app/user_configs.backup\n';
    section += '   ```\n\n';
    section += '2. **Review breaking changes** listed above\n\n';
    section += '3. **Update dependencies**\n';
    section += '   ```bash\n';
    section += '   cd app\n';
    section += '   npm ci\n';
    section += '   ```\n\n';
    section += '4. **Test in development mode**\n';
    section += '   ```bash\n';
    section += '   npm run dev\n';
    section += '   ```\n\n';
    section += '5. **Verify all functionality** before going live\n\n';
    section += '---\n\n';
    return section;
  }

  /**
   * Generate upgrade instructions
   */
  generateUpgradeInstructions(meta, packages) {
    let section = '## 📦 Upgrade Instructions\n\n';
    section += '### Standard Upgrade\n\n';
    section += '```bash\n';
    section += `# Fetch and checkout the new version\n`;
    section += `git fetch --all --tags\n`;
    section += `git checkout ${meta.targetRef}\n\n`;
    section += '# Update dependencies\n';
    section += 'cd app\n';
    section += 'npm ci\n\n';
    section += '# Restart the application\n';
    section += 'npm start\n';
    section += '```\n\n';
    
    if (packages && packages.length > 1) {
      section += '### Package-Specific Updates\n\n';
      packages.forEach(pkg => {
        section += `- **${pkg.name}**: Update from \`${pkg.version_before || 'N/A'}\` to \`${pkg.version_after || 'N/A'}\`\n`;
      });
      section += '\n';
    }

    section += '---\n\n';
    return section;
  }

  /**
   * Generate footer with metadata
   */
  generateFooter(meta) {
    let footer = '## 📊 Metadata\n\n';
    footer += '| Field | Value |\n';
    footer += '|-------|-------|\n';
    footer += `| Changelog ID | \`${meta.changelogId}\` |\n`;
    footer += `| Base Ref | \`${meta.baseRef}\` |\n`;
    footer += `| Target Ref | \`${meta.targetRef}\` |\n`;
    footer += `| Generated | ${new Date(meta.generatedAt).toISOString()} |\n`;
    footer += `| Generator Version | ${meta.generatorVersion} |\n\n`;
    footer += '---\n\n';
    footer += '*This changelog was automatically generated by the Changelog Generation Agent*\n';
    return footer;
  }

  /**
   * Get icon for commit type
   */
  getTypeIcon(type) {
    const icons = {
      feat: '✨',
      fix: '🐛',
      perf: '⚡',
      docs: '📚',
      refactor: '♻️',
      chore: '🔧',
      build: '🏗️',
      ci: '👷',
      test: '✅',
      style: '💄'
    };
    return icons[type] || '📝';
  }
}

module.exports = ChangelogGenerator;
