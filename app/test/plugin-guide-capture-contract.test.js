'use strict';

const fs = require('fs');
const path = require('path');
const { buildDocsSpec } = require('../../scripts/docs-screenshot-spec');
const { evaluatePostcondition } = require('../../scripts/lib/capture-receipt');

const REPO_ROOT = path.join(__dirname, '..', '..');
describe('guide capture postcondition contracts', () => {
  const spec = buildDocsSpec(REPO_ROOT);
  const manifest = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'screenshots', 'docs-capture-manifest.json'),
    'utf8'
  ));
  const assetsById = new Map(spec.assets.map((asset) => [asset.id, asset]));

  test('declares a narrow HTTP status set that contains the local capture result', () => {
    for (const output of manifest.outputs) {
      const asset = assetsById.get(output.id);
      const condition = asset.workflow.postconditions.find((entry) => entry.type === 'http-status');

      expect(condition).toBeDefined();
      const acceptedStatuses = Array.isArray(condition.expected)
        ? condition.expected
        : [condition.expected];
      expect(acceptedStatuses).toContain(output.httpStatus);
      expect(acceptedStatuses.every((status) => status === 200 || status === 304)).toBe(true);
    }
  });

  test('declares each capture URL exactly as observed per locale', () => {
    for (const output of manifest.outputs) {
      const asset = assetsById.get(output.id);
      const condition = asset.workflow.postconditions.find((entry) => entry.type === 'url');
      const result = evaluatePostcondition(condition, {
        httpStatus: output.httpStatus,
        state: output.state,
        consoleErrors: output.receipt.console,
        interactions: output.receipt.interactions,
        locale: output.locale
      });

      expect(condition).toBeDefined();
      expect(result.passed).toBe(true);
    }
  });
});
