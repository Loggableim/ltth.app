const fs = require('fs');
const path = require('path');

describe('docs capture receipt verifier', () => {
  test('requires workflow parity and passed receipt evidence for every screenshot', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'verify-docs-screenshot-coverage.js'),
      'utf8'
    );

    expect(source).toContain('assert.deepStrictEqual(output.workflow, asset.workflow');
    expect(source).toContain('assert.deepStrictEqual(output.receipt?.operations, asset.workflow.operations');
    expect(source).toContain('assert.ok(output.receipt?.postconditions?.every((condition) => condition.passed === true)');
  });

  test('allows only declared local creation workflows for overlays that require a generated id', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'verify-docs-screenshot-coverage.js'),
      'utf8'
    );

    expect(source).toContain("asset.guideId === 'advanced-timer'");
    expect(source).toContain("preparation?.type === 'create-demo-timer'");
    expect(source).toContain("asset.guideId === 'goals'");
    expect(source).toContain("preparation?.type === 'create-demo-goal'");
  });
});
