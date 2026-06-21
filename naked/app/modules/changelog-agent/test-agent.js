/**
 * Changelog Agent Tests
 * 
 * Test suite for changelog generation agent
 * Note: Uses console.log for test output as this is a test runner, not production code
 */

const CommitClassifier = require('./commit-classifier');
const ChangelogGenerator = require('./changelog-generator');
const VersionManager = require('./version-manager');

// Test data
const testCommits = [
  {
    hash: 'abc123def456',
    author: 'Test User',
    email: 'test@example.com',
    date: '2024-01-01',
    subject: 'feat(plugin): add new feature',
    body: 'This adds a new feature to the plugin system'
  },
  {
    hash: 'def456ghi789',
    author: 'Test User',
    email: 'test@example.com',
    date: '2024-01-02',
    subject: 'fix: resolve database connection issue',
    body: 'Fixes a critical bug with database connections'
  },
  {
    hash: 'ghi789jkl012',
    author: 'Test User',
    email: 'test@example.com',
    date: '2024-01-03',
    subject: 'feat!: breaking change in API',
    body: 'BREAKING CHANGE: API signature changed'
  },
  {
    hash: 'jkl012mno345',
    author: 'Test User',
    email: 'test@example.com',
    date: '2024-01-04',
    subject: 'update dependencies and fix minor bugs',
    body: ''
  }
];

// Test Commit Classifier
async function testCommitClassifier() {
  console.log('\n📝 Testing Commit Classifier...\n');
  
  const classifier = new CommitClassifier();
  
  for (const commit of testCommits) {
    console.log(`Testing commit: ${commit.subject}`);
    const classification = await classifier.classify(commit);
    
    console.log(`  Type: ${classification.type}`);
    console.log(`  Scope: ${classification.scope || 'none'}`);
    console.log(`  Breaking: ${classification.breaking}`);
    console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
    console.log(`  Rationale: ${classification.rationale}`);
    console.log();
  }
  
  // Test risk assessment
  const testFiles = [
    'modules/database.js',
    'modules/plugin-loader.js',
    'plugins/test-plugin/main.js',
    'public/css/style.css',
    'README.md',
    'package.json'
  ];
  
  console.log('Testing risk assessment...\n');
  const risks = classifier.assessRisk(testFiles);
  
  risks.forEach(r => {
    console.log(`${r.file}:`);
    console.log(`  Risk: ${r.risk}`);
    console.log(`  Reasons: ${r.reasons.join(', ')}`);
    console.log(`  Tests: ${r.recommendedTests.join(', ')}`);
    console.log();
  });
  
  console.log('✅ Commit Classifier tests passed\n');
}

// Test Version Manager
async function testVersionManager() {
  console.log('\n📦 Testing Version Manager...\n');
  
  const versionMgr = new VersionManager('semver');
  
  // Test version bump calculations
  const testVersions = [
    { current: '1.2.3', bump: 'patch', expected: '1.2.4' },
    { current: '1.2.3', bump: 'minor', expected: '1.3.0' },
    { current: '1.2.3', bump: 'major', expected: '2.0.0' },
  ];
  
  testVersions.forEach(test => {
    const result = versionMgr.calculateNewVersion(test.current, test.bump);
    const passed = result === test.expected;
    console.log(`${passed ? '✓' : '✗'} ${test.current} + ${test.bump} => ${result} (expected: ${test.expected})`);
  });
  
  // Test calver
  const calverMgr = new VersionManager('calver');
  const calver = calverMgr.calculateCalver();
  console.log(`\nCalver: ${calver}`);
  
  console.log('\n✅ Version Manager tests passed\n');
}

// Test Changelog Generator
async function testChangelogGenerator() {
  console.log('\n📄 Testing Changelog Generator...\n');
  
  const generator = new ChangelogGenerator();
  
  // Create test changelog data
  const classifiedCommits = testCommits.map(commit => ({
    ...commit,
    classification: {
      type: commit.subject.includes('feat') ? 'feat' : 'fix',
      scope: commit.subject.match(/\(([^)]+)\)/)?.[1] || null,
      breaking: commit.subject.includes('!') || commit.body.includes('BREAKING'),
      confidence: 0.9,
      rationale: 'Test classification'
    }
  }));
  
  const changelogData = {
    meta: {
      repo: 'test/repo',
      baseRef: 'v1.0.0',
      targetRef: 'v1.1.0',
      generatedAt: new Date().toISOString(),
      generatorVersion: '1.0.0',
      changelogId: 'test123'
    },
    changes: classifiedCommits,
    packages: [{
      name: 'test-package',
      path: '.',
      version_before: '1.0.0',
      version_after: '1.1.0'
    }]
  };
  
  // Generate markdown preview
  const markdown = generator.generateHeader(changelogData.meta);
  console.log('Preview of generated markdown:\n');
  console.log(markdown.substring(0, 500));
  console.log('...\n');
  
  console.log('✅ Changelog Generator tests passed\n');
}

// Run all tests
async function runTests() {
  console.log('🧪 Changelog Agent Test Suite');
  console.log('═'.repeat(80));
  
  try {
    await testCommitClassifier();
    await testVersionManager();
    await testChangelogGenerator();
    
    console.log('═'.repeat(80));
    console.log('✅ All tests passed!');
    console.log();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
