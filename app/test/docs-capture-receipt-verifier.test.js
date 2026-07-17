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
    expect(source).toContain('assert.strictEqual(output.receipt?.schemaVersion, 2');
    expect(source).toContain('asset.workflow.captureRule.imageCrop');
    expect(source).toContain('assert.ok(Array.isArray(output.receipt?.network)');
    expect(source).toContain('isAllowedCaptureNetworkUrl(entry.url)');
    expect(source).toContain('assert.deepStrictEqual(output.receipt?.console, []');
    expect(source).toContain('assert.ok(Array.isArray(output.receipt?.interactions)');
    expect(source).toContain('assert.ok(png.bytes > 2048');
    expect(source).toContain('assert.ok(png.colors > 1 && png.contrast > 0');
    expect(source).not.toContain('mayStartEmpty');
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
