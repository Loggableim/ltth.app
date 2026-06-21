/**
 * Changelog Generation Agent
 * 
 * Autonomous agent for comparing branches, generating changelogs,
 * updating version metadata, and creating release PRs.
 * 
 * Features:
 * - Branch comparison with commit classification
 * - Conventional Commits parsing
 * - Semantic analysis for unclassified commits
 * - Risk assessment for changed files
 * - Machine-readable (JSON) and human-readable (Markdown) changelogs
 * - Version bumping (semver/calver)
 * - Multi-package/monorepo support
 * - Automated testing and validation
 * - PR generation with detailed metadata
 */

const GitOperations = require('./git-operations');
const CommitClassifier = require('./commit-classifier');
const ChangelogGenerator = require('./changelog-generator');
const VersionManager = require('./version-manager');
const ValidationRunner = require('./validation-runner');
const PRGenerator = require('./pr-generator');
const logger = require('../logger');
const path = require('path');
const fs = require('fs');

class ChangelogAgent {
  constructor(options = {}) {
    this.options = {
      repositoryPath: options.repositoryPath || process.cwd(),
      baseRef: options.baseRef || null, // Auto-detect if null
      targetRef: options.targetRef || 'HEAD',
      gitAuth: options.gitAuth || null,
      monorepo: options.monorepo || false,
      releasePolicy: options.releasePolicy || 'semver',
      dryRun: options.dryRun || false,
      ...options
    };

    this.workspaceDir = path.join(this.options.repositoryPath, 'workspace');
    this.logsDir = path.join(this.workspaceDir, 'logs');
    this.reportsDir = path.join(this.workspaceDir, 'reports');
    
    // Initialize sub-modules
    this.gitOps = new GitOperations(this.options.repositoryPath);
    this.classifier = new CommitClassifier();
    this.changelogGen = new ChangelogGenerator();
    this.versionMgr = new VersionManager(this.options.releasePolicy);
    this.validator = new ValidationRunner(this.options.repositoryPath);
    this.prGen = new PRGenerator(this.options.gitAuth);
    
    // State
    this.generatorVersion = '1.0.0';
    this.agentLog = [];
  }

  /**
   * Initialize the agent and prepare workspace
   */
  async initialize() {
    try {
      this.log('info', 'Initializing Changelog Agent');
      
      // Create workspace directories
      [this.workspaceDir, this.logsDir, this.reportsDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // Fetch latest changes
      await this.gitOps.fetchAll();
      
      // Determine base ref if not provided
      if (!this.options.baseRef) {
        this.options.baseRef = await this.determineBaseRef();
        this.log('info', `Auto-detected base ref: ${this.options.baseRef}`);
      }

      // Get short SHA for tracking
      this.shortSha = await this.gitOps.getShortSha(this.options.targetRef);
      
      this.log('info', `Agent initialized: ${this.options.baseRef} → ${this.options.targetRef}`);
      return true;
    } catch (error) {
      this.log('error', `Failed to initialize agent: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Determine base ref using heuristics
   */
  async determineBaseRef() {
    try {
      // 1. Try to find latest annotated tag
      const latestTag = await this.gitOps.getLatestTag();
      if (latestTag) {
        this.log('info', `Found latest tag: ${latestTag}`);
        return latestTag;
      }

      // 2. Try origin/main or origin/master
      const mainBranch = await this.gitOps.getMainBranch();
      if (mainBranch) {
        this.log('info', `Using main branch: ${mainBranch}`);
        return mainBranch;
      }

      // 3. Use merge-base as fallback
      const mergeBase = await this.gitOps.getMergeBase('HEAD', this.options.targetRef);
      this.log('info', `Using merge-base: ${mergeBase}`);
      return mergeBase;
    } catch (error) {
      this.log('error', `Failed to determine base ref: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Main execution flow
   */
  async execute() {
    try {
      await this.initialize();

      this.log('info', 'Starting changelog generation process');

      // Step 1: Gather commits and changes
      const commits = await this.gatherCommits();
      const changedFiles = await this.gatherChangedFiles();

      // Step 2: Classify commits
      const classifiedCommits = await this.classifyCommits(commits);

      // Step 3: Assess risk
      const riskAssessment = await this.assessRisk(changedFiles);

      // Step 4: Detect packages (monorepo support)
      const packages = await this.detectPackages(changedFiles);

      // Step 5: Generate changelogs
      const changelogData = await this.generateChangelogs(classifiedCommits, packages);

      // Step 6: Determine version bumps
      const versionUpdates = await this.determineVersionBumps(classifiedCommits, packages);

      // Step 7: Run validation (lint/test/build)
      const validationResults = await this.runValidation();

      // Step 8: Check for issues requiring human approval
      await this.checkForHumanApproval(classifiedCommits, changedFiles, validationResults);

      // Step 9: Update version files
      if (!this.options.dryRun) {
        await this.updateVersionFiles(versionUpdates);
      }

      // Step 10: Generate PR or patch
      const result = await this.generatePROrPatch({
        commits: classifiedCommits,
        changedFiles,
        riskAssessment,
        packages,
        changelogData,
        versionUpdates,
        validationResults
      });

      this.log('info', 'Changelog generation completed successfully');

      // Write final report
      await this.writeReport(result);

      return result;
    } catch (error) {
      this.log('error', `Execution failed: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Gather commits between base and target
   */
  async gatherCommits() {
    this.log('info', 'Gathering commits');
    return await this.gitOps.getCommits(this.options.baseRef, this.options.targetRef);
  }

  /**
   * Gather changed files between base and target
   */
  async gatherChangedFiles() {
    this.log('info', 'Gathering changed files');
    return await this.gitOps.getChangedFiles(this.options.baseRef, this.options.targetRef);
  }

  /**
   * Classify commits using Conventional Commits and semantic analysis
   */
  async classifyCommits(commits) {
    this.log('info', `Classifying ${commits.length} commits`);
    const classified = [];

    for (const commit of commits) {
      const classification = await this.classifier.classify(commit);
      classified.push({
        ...commit,
        classification
      });
    }

    return classified;
  }

  /**
   * Assess risk for changed files
   */
  async assessRisk(changedFiles) {
    this.log('info', `Assessing risk for ${changedFiles.length} files`);
    return this.classifier.assessRisk(changedFiles);
  }

  /**
   * Detect packages in monorepo
   */
  async detectPackages(changedFiles) {
    if (!this.options.monorepo) {
      return [{
        name: 'root',
        path: '.',
        packageJson: path.join(this.options.repositoryPath, 'app', 'package.json')
      }];
    }

    this.log('info', 'Detecting packages in monorepo');
    // TODO: Implement monorepo package detection
    return [];
  }

  /**
   * Generate changelogs (JSON and Markdown)
   */
  async generateChangelogs(classifiedCommits, packages) {
    this.log('info', 'Generating changelogs');
    
    // Detect repository name from git config
    let repoName = 'Loggableim/pupcidslittletiktoolhelper_desktop';
    try {
      const remoteUrl = await this.gitOps.git('config --get remote.origin.url');
      const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (match) {
        repoName = match[1];
      }
    } catch (error) {
      this.log('warn', 'Could not detect repository name from git config, using default');
    }
    
    const changelogData = {
      meta: {
        repo: repoName,
        baseRef: this.options.baseRef,
        targetRef: this.options.targetRef,
        generatedAt: new Date().toISOString(),
        generatorVersion: this.generatorVersion,
        changelogId: this.shortSha
      },
      changes: classifiedCommits,
      packages
    };

    // Generate JSON
    const jsonPath = path.join(this.workspaceDir, 'changelog.json');
    await this.changelogGen.generateJSON(changelogData, jsonPath);

    // Generate Markdown
    const mdPath = path.join(this.workspaceDir, `CHANGELOG.auto.${this.shortSha}.md`);
    await this.changelogGen.generateMarkdown(changelogData, mdPath);

    this.log('info', `Changelogs generated: ${jsonPath}, ${mdPath}`);

    return changelogData;
  }

  /**
   * Determine version bumps based on classified commits
   */
  async determineVersionBumps(classifiedCommits, packages) {
    this.log('info', 'Determining version bumps');
    return await this.versionMgr.determineVersionBumps(classifiedCommits, packages);
  }

  /**
   * Run validation (lint, test, build)
   */
  async runValidation() {
    this.log('info', 'Running validation');
    return await this.validator.runAll();
  }

  /**
   * Check if human approval is required
   */
  async checkForHumanApproval(classifiedCommits, changedFiles, validationResults) {
    const issues = [];

    // Check for low-confidence classifications
    const lowConfidence = classifiedCommits.filter(c => 
      c.classification.confidence < 0.8 && 
      c.classification.affectsCoreModules
    );
    if (lowConfidence.length > 0) {
      issues.push({
        type: 'low_confidence',
        commits: lowConfidence,
        message: 'Some commits affecting core modules have low classification confidence'
      });
    }

    // Check for breaking changes
    const breaking = classifiedCommits.filter(c => c.classification.breaking);
    if (breaking.length > 0) {
      issues.push({
        type: 'breaking_changes',
        commits: breaking,
        message: 'Breaking changes detected'
      });
    }

    // Check for validation failures
    if (validationResults.failures.length > 0) {
      issues.push({
        type: 'validation_failure',
        failures: validationResults.failures,
        message: 'Validation failures detected'
      });
    }

    // Check for DB migrations
    const migrations = changedFiles.filter(f => 
      f.includes('migration') || f.includes('schema')
    );
    if (migrations.length > 0) {
      issues.push({
        type: 'db_migration',
        files: migrations,
        message: 'Database migrations detected'
      });
    }

    // Check for native module changes
    const nativeModules = changedFiles.filter(f =>
      f.includes('better-sqlite3') || f.includes('node-gyp') || f.includes('binding.gyp')
    );
    if (nativeModules.length > 0) {
      issues.push({
        type: 'native_modules',
        files: nativeModules,
        message: 'Native module changes detected'
      });
    }

    if (issues.length > 0) {
      this.log('warn', 'Issues requiring human approval detected', issues);
      // In a real implementation, this would pause and request human input
    }

    return issues;
  }

  /**
   * Update version files
   */
  async updateVersionFiles(versionUpdates) {
    this.log('info', 'Updating version files');
    return await this.versionMgr.updateFiles(versionUpdates);
  }

  /**
   * Generate PR or patch bundle
   */
  async generatePROrPatch(data) {
    if (this.options.dryRun || !this.options.gitAuth) {
      this.log('info', 'Dry run mode: generating patch bundle');
      return await this.prGen.generatePatchBundle(data, this.workspaceDir, this.shortSha);
    } else {
      this.log('info', 'Creating pull request');
      return await this.prGen.createPullRequest(data, this.options.baseRef, this.options.targetRef, this.shortSha);
    }
  }

  /**
   * Write final report
   */
  async writeReport(result) {
    const reportPath = path.join(this.reportsDir, `changelog-report-${this.shortSha}.md`);
    const report = this.prGen.generateReport(result);
    fs.writeFileSync(reportPath, report, 'utf8');
    this.log('info', `Report written to ${reportPath}`);
  }

  /**
   * Log with both Winston and internal tracking
   */
  log(level, message, meta = {}) {
    logger[level](message, meta);
    this.agentLog.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      meta
    });

    // Also write to agent-specific log file
    const logPath = path.join(this.logsDir, 'changelog-agent.log');
    const logEntry = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(logPath, logEntry, 'utf8');
  }
}

module.exports = ChangelogAgent;
