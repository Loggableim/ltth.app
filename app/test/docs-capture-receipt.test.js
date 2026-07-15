const fs = require('fs');
const path = require('path');

describe('documentation capture receipts', () => {
  test('records the executed workflow and postconditions for every screenshot', () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', '..', 'screenshots', 'docs-capture-manifest.json'),
      'utf8'
    ));

    expect(manifest.outputs.length).toBe(manifest.assets.length * manifest.locales.length);
    for (const output of manifest.outputs) {
      expect(output.receipt).toEqual(expect.objectContaining({
        schemaVersion: 2,
        plugin: output.guideId,
        language: output.locale,
        route: output.route,
        operations: expect.any(Array),
        postconditions: expect.any(Array),
        network: expect.any(Array),
        console: [],
        interactions: expect.any(Array),
        screenshotPath: output.path,
        sha256: output.sha256,
        appVersion: expect.any(String)
      }));
      expect(output.receipt.operations.length).toBeGreaterThanOrEqual(2);
      expect(output.receipt.postconditions.length).toBeGreaterThanOrEqual(4);
      expect(output.receipt.postconditions.every((condition) => condition.passed === true)).toBe(true);
    }
  });
});
