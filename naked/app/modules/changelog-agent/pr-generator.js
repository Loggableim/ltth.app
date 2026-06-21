/**
 * PR Generator Module
 * 
 * Generates pull requests or patch bundles
 */

const fs = require('fs');
const path = require('path');

class PRGenerator {
  constructor(gitAuth) {
    this.gitAuth = gitAuth;
  }

  /**
   * Generate patch bundle for dry-run mode
   */
  async generatePatchBundle(data, workspaceDir, shortSha) {
    const bundleDir = path.join(workspaceDir, `patch-${shortSha}`);
    
    // Create bundle directory
    if (!fs.existsSync(bundleDir)) {
      fs.mkdirSync(bundleDir, { recursive: true });
    }

    // Copy changelogs
    const files = fs.readdirSync(workspaceDir);
    files.forEach(file => {
      if (file.startsWith('CHANGELOG') || file.startsWith('changelog')) {
        const src = path.join(workspaceDir, file);
        const dest = path.join(bundleDir, file);
        fs.copyFileSync(src, dest);
      }
    });

    // Generate PR body file
    const prBody = this.generatePRBody(data);
    fs.writeFileSync(path.join(bundleDir, 'PR_BODY.md'), prBody, 'utf8');

    // Generate test/build logs
    const logsFile = this.generateLogsReport(data.validationResults);
    fs.writeFileSync(path.join(bundleDir, 'validation-logs.txt'), logsFile, 'utf8');

    // Generate summary
    const summary = this.generateSummary(data, shortSha);
    fs.writeFileSync(path.join(bundleDir, 'SUMMARY.md'), summary, 'utf8');

    return {
      type: 'patch_bundle',
      path: bundleDir,
      files: fs.readdirSync(bundleDir)
    };
  }

  /**
   * Create pull request (not implemented - would use GitHub API)
   */
  async createPullRequest(data, baseRef, targetRef, shortSha) {
    // This would use GitHub API in production
    // For now, return structure showing what would be created
    const branchName = `changelog/auto/${this.slugify(targetRef)}/${shortSha}`;
    const prTitle = this.generatePRTitle(data, baseRef, targetRef);
    const prBody = this.generatePRBody(data);

    return {
      type: 'pull_request',
      branchName,
      prTitle,
      prBody,
      baseRef,
      targetRef,
      labels: this.generateLabels(data),
      message: 'PR creation would require GitHub API token and implementation'
    };
  }

  /**
   * Generate PR title
   */
  generatePRTitle(data, baseRef, targetRef) {
    const version = data.versionUpdates[0]?.newVersion || 'unknown';
    return `Release prep: ${version} — changes from ${baseRef} to ${targetRef}`;
  }

  /**
   * Generate PR body
   */
  generatePRBody(data) {
    let body = '# Release Preparation\n\n';
    
    // Summary
    body += '## 📋 Summary\n\n';
    body += `This PR prepares a release with ${data.commits.length} commits.\n\n`;
    
    // Version updates
    body += '## 📦 Version Updates\n\n';
    data.versionUpdates.forEach(update => {
      body += `- **${update.package.name}**: ${update.currentVersion} → ${update.newVersion} (${update.bumpType})\n`;
    });
    body += '\n';

    // Changelog link
    body += '## 📝 Changelog\n\n';
    body += `Full changelog available in workspace/CHANGELOG.auto.${data.changelogData.meta.changelogId}.md\n\n`;

    // Commits summary by type
    body += '## 🔍 Commits by Type\n\n';
    const byType = {};
    data.commits.forEach(c => {
      const type = c.classification.type;
      byType[type] = (byType[type] || 0) + 1;
    });
    for (const [type, count] of Object.entries(byType)) {
      body += `- **${type}**: ${count}\n`;
    }
    body += '\n';

    // Files changed
    body += '## 📁 Files Changed\n\n';
    body += `${data.changedFiles.length} files modified\n\n`;

    // Risk assessment
    body += '## ⚠️ Risk Assessment\n\n';
    const risks = { low: 0, medium: 0, high: 0 };
    data.riskAssessment.forEach(r => risks[r.risk]++);
    body += `- 🟢 Low: ${risks.low}\n`;
    body += `- 🟡 Medium: ${risks.medium}\n`;
    body += `- 🔴 High: ${risks.high}\n\n`;

    // High-risk files
    const highRisk = data.riskAssessment.filter(r => r.risk === 'high');
    if (highRisk.length > 0) {
      body += '### High-Risk Files\n\n';
      highRisk.forEach(r => {
        body += `- \`${r.file}\`: ${r.reasons.join(', ')}\n`;
      });
      body += '\n';
    }

    // Validation results
    body += '## ✅ Validation Results\n\n';
    body += this.formatValidationResults(data.validationResults);

    // Migration steps
    const hasBreaking = data.commits.some(c => c.classification.breaking);
    if (hasBreaking) {
      body += '## 🔄 Migration Required\n\n';
      body += 'This release contains breaking changes. See CHANGELOG for migration steps.\n\n';
    }

    // Revert plan
    body += '## ↩️ Revert Plan\n\n';
    body += '```bash\n';
    body += '# To revert this release:\n';
    body += 'git revert -m 1 <merge-commit>\n';
    body += 'npm ci\n';
    body += 'npm test\n';
    body += '```\n\n';

    // Footer
    body += '---\n\n';
    body += `**Changelog ID:** \`${data.changelogData.meta.changelogId}\`\n`;
    body += `**Generated:** ${new Date(data.changelogData.meta.generatedAt).toISOString()}\n\n`;
    body += '**Please review carefully before merging!**\n';

    return body;
  }

  /**
   * Format validation results
   */
  formatValidationResults(results) {
    let output = '';
    
    const items = [
      { key: 'install', name: 'Dependencies Install' },
      { key: 'lint', name: 'Linting' },
      { key: 'test', name: 'Tests' },
      { key: 'build', name: 'Build' }
    ];

    items.forEach(item => {
      const result = results[item.key];
      if (result) {
        const icon = result.success ? '✅' : '❌';
        const status = result.success ? 'PASSED' : 'FAILED';
        output += `${icon} **${item.name}**: ${status}\n`;
        
        if (!result.success && result.error) {
          output += `   - Error: ${result.error}\n`;
        }
        if (result.skipped) {
          output += '   - (Skipped - no script found)\n';
        }
      }
    });

    output += '\n';
    return output;
  }

  /**
   * Generate labels for PR
   */
  generateLabels(data) {
    const labels = ['release', 'changelog-generated', 'needs-review'];
    
    // Add risk label
    const risks = { low: 0, medium: 0, high: 0 };
    data.riskAssessment.forEach(r => risks[r.risk]++);
    
    if (risks.high > 0) {
      labels.push('risk-high');
    } else if (risks.medium > 0) {
      labels.push('risk-medium');
    } else {
      labels.push('risk-low');
    }

    // Add breaking change label
    const hasBreaking = data.commits.some(c => c.classification.breaking);
    if (hasBreaking) {
      labels.push('breaking-change');
    }

    return labels;
  }

  /**
   * Generate logs report
   */
  generateLogsReport(validationResults) {
    let report = 'Validation Logs\n';
    report += '='.repeat(80) + '\n\n';

    ['install', 'lint', 'test', 'build'].forEach(key => {
      const result = validationResults[key];
      if (result) {
        report += `${key.toUpperCase()}\n`;
        report += '-'.repeat(80) + '\n';
        report += `Command: ${result.command}\n`;
        report += `Exit Code: ${result.exitCode}\n`;
        report += `Success: ${result.success}\n\n`;
        
        if (result.stdout) {
          report += 'STDOUT:\n';
          report += result.stdout + '\n\n';
        }
        
        if (result.stderr) {
          report += 'STDERR:\n';
          report += result.stderr + '\n\n';
        }
        
        report += '\n';
      }
    });

    return report;
  }

  /**
   * Generate summary report
   */
  generateSummary(data, shortSha) {
    let summary = '# Changelog Generation Summary\n\n';
    summary += `**Changelog ID:** \`${shortSha}\`\n`;
    summary += `**Generated:** ${new Date().toISOString()}\n\n`;
    
    summary += '## Commands to Create PR\n\n';
    summary += '```bash\n';
    summary += '# 1. Create and switch to new branch\n';
    summary += `git checkout -b changelog/auto/${this.slugify(data.changelogData.meta.targetRef)}/${shortSha}\n\n`;
    summary += '# 2. Stage all changes\n';
    summary += 'git add -A\n\n';
    summary += '# 3. Commit changes\n';
    summary += `git commit -m "chore(release): bump versions and add changelog - Changelog-ID: ${shortSha}"\n\n`;
    summary += '# 4. Push to remote\n';
    summary += `git push origin changelog/auto/${this.slugify(data.changelogData.meta.targetRef)}/${shortSha}\n\n`;
    summary += '# 5. Create PR using GitHub CLI or web interface\n';
    summary += `gh pr create --title "${this.generatePRTitle(data, data.changelogData.meta.baseRef, data.changelogData.meta.targetRef)}" --body-file PR_BODY.md\n`;
    summary += '```\n\n';

    return summary;
  }

  /**
   * Generate report
   */
  generateReport(result) {
    let report = '# Changelog Agent Report\n\n';
    report += `**Type:** ${result.type}\n`;
    report += `**Generated:** ${new Date().toISOString()}\n\n`;

    if (result.type === 'patch_bundle') {
      report += '## Patch Bundle\n\n';
      report += `**Location:** \`${result.path}\`\n\n`;
      report += '**Files:**\n\n';
      result.files.forEach(file => {
        report += `- ${file}\n`;
      });
    } else if (result.type === 'pull_request') {
      report += '## Pull Request\n\n';
      report += `**Branch:** \`${result.branchName}\`\n`;
      report += `**Title:** ${result.prTitle}\n`;
      report += `**Labels:** ${result.labels.join(', ')}\n\n`;
      report += `**Message:** ${result.message}\n`;
    }

    return report;
  }

  /**
   * Slugify string for branch names
   */
  slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

module.exports = PRGenerator;
