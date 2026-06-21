/**
 * Commit Classifier Module
 * 
 * Classifies commits using Conventional Commits format and semantic analysis
 */

class CommitClassifier {
  constructor() {
    // Conventional Commit types
    this.types = {
      feat: 'Features',
      fix: 'Bug Fixes',
      perf: 'Performance',
      docs: 'Documentation',
      refactor: 'Refactoring',
      chore: 'Chores',
      build: 'Build System',
      ci: 'CI/CD',
      test: 'Tests',
      style: 'Style'
    };

    // Core modules that require higher confidence
    this.coreModules = [
      'server.js',
      'modules/database.js',
      'modules/tiktok.js',
      'modules/auth',
      'modules/plugin-loader.js'
    ];

    // High-risk file patterns
    this.highRiskPatterns = [
      /migration/i,
      /schema/i,
      /better-sqlite3/,
      /node-gyp/,
      /binding\.gyp/,
      /package\.json/,
      /package-lock\.json/
    ];
  }

  /**
   * Classify a commit using Conventional Commits parsing
   */
  async classify(commit) {
    // Try to parse Conventional Commits format
    const parsed = this.parseConventionalCommit(commit.subject, commit.body);
    
    if (parsed && parsed.confidence > 0.7) {
      return {
        type: parsed.type,
        scope: parsed.scope,
        breaking: parsed.breaking,
        confidence: parsed.confidence,
        rationale: 'Parsed from Conventional Commits format',
        affectsCoreModules: false // Will be determined by file analysis
      };
    }

    // Fallback to semantic analysis
    return this.semanticAnalysis(commit);
  }

  /**
   * Parse Conventional Commits format
   * Format: type(scope)!: subject
   */
  parseConventionalCommit(subject, body) {
    // Match: type(scope)!: subject or type!: subject or type(scope): subject or type: subject
    const regex = /^(feat|fix|perf|docs|refactor|chore|build|ci|test|style)(\([a-zA-Z0-9_-]+\))?(!)?:\s*(.+)$/;
    const match = subject.match(regex);

    if (!match) {
      return null;
    }

    const type = match[1];
    const scope = match[2] ? match[2].replace(/[()]/g, '') : null;
    const hasBreakingMarker = match[3] === '!';
    const description = match[4];

    // Check for BREAKING CHANGE in body
    const breakingInBody = body && body.includes('BREAKING CHANGE');
    const breaking = hasBreakingMarker || breakingInBody;

    return {
      type,
      scope,
      breaking,
      description,
      confidence: 0.95
    };
  }

  /**
   * Semantic analysis for non-conventional commits
   */
  semanticAnalysis(commit) {
    const subject = commit.subject.toLowerCase();
    const body = (commit.body || '').toLowerCase();
    const text = `${subject} ${body}`;

    // Keywords for each type
    const keywords = {
      feat: ['add', 'new', 'feature', 'implement', 'create'],
      fix: ['fix', 'bug', 'issue', 'resolve', 'patch', 'correct'],
      perf: ['performance', 'optimize', 'speed', 'faster', 'improve'],
      docs: ['doc', 'documentation', 'readme', 'comment'],
      refactor: ['refactor', 'restructure', 'reorganize', 'rewrite'],
      test: ['test', 'testing', 'spec', 'coverage'],
      build: ['build', 'compile', 'bundle', 'dependency', 'dependencies'],
      ci: ['ci', 'pipeline', 'workflow', 'action'],
      chore: ['chore', 'update', 'upgrade', 'maintain']
    };

    // Breaking change keywords
    const breakingKeywords = ['breaking', 'breaking change', 'incompatible', 'removed'];
    const breaking = breakingKeywords.some(kw => text.includes(kw));

    // Score each type
    const scores = {};
    for (const [type, words] of Object.entries(keywords)) {
      scores[type] = words.filter(word => text.includes(word)).length;
    }

    // Find type with highest score
    const maxScore = Math.max(...Object.values(scores));
    const determinedType = Object.keys(scores).find(type => scores[type] === maxScore) || 'chore';
    
    // Calculate confidence (lower for semantic analysis)
    const confidence = maxScore > 0 ? Math.min(0.7, 0.4 + (maxScore * 0.15)) : 0.3;

    return {
      type: determinedType,
      scope: null,
      breaking,
      confidence,
      rationale: `Semantic analysis based on keywords: ${maxScore} matches`,
      affectsCoreModules: false
    };
  }

  /**
   * Assess risk for changed files
   */
  assessRisk(changedFiles) {
    const assessments = changedFiles.map(file => {
      let risk = 'low';
      let reasons = [];

      // Check if it's a core module
      const isCore = this.coreModules.some(mod => file.includes(mod));
      if (isCore) {
        risk = 'high';
        reasons.push('Core module affected');
      }

      // Check high-risk patterns
      const isHighRisk = this.highRiskPatterns.some(pattern => pattern.test(file));
      if (isHighRisk) {
        risk = risk === 'high' ? 'high' : 'medium';
        reasons.push('High-risk file pattern');
      }

      // Check if it's a plugin
      if (file.startsWith('plugins/') && !file.includes('/test/')) {
        risk = risk === 'high' ? 'high' : 'medium';
        reasons.push('Plugin code modified');
      }

      // Documentation/assets are low risk
      if (file.match(/\.(md|txt|png|jpg|svg|css)$/i)) {
        risk = 'low';
        reasons = ['Documentation or asset file'];
      }

      return {
        file,
        risk,
        reasons,
        recommendedTests: this.getRecommendedTests(file)
      };
    });

    return assessments;
  }

  /**
   * Get recommended tests for a file
   */
  getRecommendedTests(file) {
    const tests = [];

    if (file.includes('modules/database')) {
      tests.push('Database integrity tests', 'Migration tests');
    }
    if (file.includes('modules/tiktok')) {
      tests.push('TikTok connection tests', 'Event handling tests');
    }
    if (file.includes('modules/plugin-loader')) {
      tests.push('Plugin loading tests', 'Plugin API tests');
    }
    if (file.includes('plugins/')) {
      tests.push('Plugin-specific tests');
    }
    if (file.includes('package.json')) {
      tests.push('Dependency audit', 'Build tests');
    }

    if (tests.length === 0) {
      tests.push('General integration tests');
    }

    return tests;
  }
}

module.exports = CommitClassifier;
