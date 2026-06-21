#!/usr/bin/env node
/**
 * Changelog Agent CLI
 * 
 * Command-line interface for the changelog generation agent
 * 
 * Usage:
 *   node changelog-cli.js [options]
 * 
 * Options:
 *   --base-ref <ref>        Base reference (tag/branch/SHA)
 *   --target-ref <ref>      Target reference (default: HEAD)
 *   --dry-run               Generate patch bundle instead of PR
 *   --monorepo              Enable monorepo mode
 *   --release-policy <type> Release policy (semver|calver, default: semver)
 */

const ChangelogAgent = require('./index');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    repositoryPath: process.cwd(),
    baseRef: null,
    targetRef: 'HEAD',
    dryRun: false,
    monorepo: false,
    releasePolicy: 'semver',
    gitAuth: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--base-ref':
        options.baseRef = args[++i];
        break;
      case '--target-ref':
        options.targetRef = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--monorepo':
        options.monorepo = true;
        break;
      case '--release-policy':
        options.releasePolicy = args[++i];
        break;
      case '--repo-path':
        options.repositoryPath = path.resolve(args[++i]);
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }

  return options;
}

// Show help message
function showHelp() {
  console.log(`
Changelog Agent CLI

Autonomous agent for comparing branches, generating changelogs,
and preparing release pull requests.

Usage:
  node changelog-cli.js [options]

Options:
  --base-ref <ref>        Base reference (tag/branch/SHA)
                          If not provided, will auto-detect latest tag
  --target-ref <ref>      Target reference (default: HEAD)
  --repo-path <path>      Repository path (default: current directory)
  --dry-run               Generate patch bundle instead of creating PR
  --monorepo              Enable monorepo mode for multi-package repos
  --release-policy <type> Release policy: semver or calver (default: semver)
  --help, -h              Show this help message

Examples:
  # Compare latest tag with HEAD
  node changelog-cli.js

  # Compare specific tag with branch
  node changelog-cli.js --base-ref v1.2.0 --target-ref develop

  # Dry run mode (no PR creation)
  node changelog-cli.js --dry-run

  # Use calver versioning
  node changelog-cli.js --release-policy calver

Environment Variables:
  GITHUB_TOKEN            GitHub API token for PR creation
  
For more information, see the documentation at:
  /app/docs/CHANGELOG_AGENT_GUIDE.md
`);
}

// Main execution
async function main() {
  try {
    console.log('🤖 Changelog Generation Agent\n');
    console.log('═'.repeat(80));
    
    const options = parseArgs();
    
    console.log('\n📋 Configuration:');
    console.log(`   Repository: ${options.repositoryPath}`);
    console.log(`   Base Ref: ${options.baseRef || 'auto-detect'}`);
    console.log(`   Target Ref: ${options.targetRef}`);
    console.log(`   Release Policy: ${options.releasePolicy}`);
    console.log(`   Dry Run: ${options.dryRun}`);
    console.log(`   Monorepo: ${options.monorepo}`);
    console.log();

    // Check for GitHub token if not dry run
    if (!options.dryRun && process.env.GITHUB_TOKEN) {
      options.gitAuth = {
        token: process.env.GITHUB_TOKEN
      };
      console.log('✓ GitHub token found\n');
    } else if (!options.dryRun) {
      console.log('⚠️  No GitHub token found, running in dry-run mode\n');
      options.dryRun = true;
    }

    // Create and execute agent
    const agent = new ChangelogAgent(options);
    
    console.log('🚀 Starting changelog generation...\n');
    const result = await agent.execute();
    
    console.log('\n✅ Changelog generation completed!\n');
    console.log('═'.repeat(80));
    
    if (result.type === 'patch_bundle') {
      console.log('\n📦 Patch Bundle Generated:');
      console.log(`   Location: ${result.path}`);
      console.log('\n   Files:');
      result.files.forEach(file => {
        console.log(`   - ${file}`);
      });
      console.log('\n   To create a PR, see SUMMARY.md in the bundle directory.');
    } else if (result.type === 'pull_request') {
      console.log('\n🔀 Pull Request:');
      console.log(`   Branch: ${result.branchName}`);
      console.log(`   Title: ${result.prTitle}`);
      console.log(`   Labels: ${result.labels.join(', ')}`);
      console.log(`\n   ${result.message}`);
    }
    
    console.log('\n✨ Done!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { parseArgs, main };
