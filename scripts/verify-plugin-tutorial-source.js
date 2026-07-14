'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');
const manifestRoots = [path.join(ROOT, 'app', 'plugins'), path.join(ROOT, 'plugin-store', 'sources')];
const manifests = manifestRoots.flatMap((pluginRoot) => fs.readdirSync(pluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, entry.name, 'plugin.json')))
  .map((entry) => JSON.parse(fs.readFileSync(path.join(pluginRoot, entry.name, 'plugin.json'), 'utf8'))))
  .filter((manifest) => manifest.id !== 'store-admin');
const source = fs.readFileSync(path.join(__dirname, 'plugin-tutorial-source.js'), 'utf8');
const guides = buildGuides(ROOT);

assert.deepStrictEqual(LOCALES, ['de', 'en', 'es', 'fr']);
assert.ok(!source.includes('function stepCopy('), 'step copy must not be selected from a shared index-based template');
assert.ok(!source.includes('function buildSteps('), 'capture steps must not be built from a shared index-based template');
assert.ok(!source.includes('return `#${stepId}`;'), 'capture selectors must come from verified UI anchors, not generated step ids');
assert.strictEqual(guides.length, manifests.length + 1, 'every manifest plus Store Admin needs one guide');
assert.ok(guides.some((guide) => guide.id === 'visual-fx-frame-webgpu'), 'Visual FX Frame WEBGPU needs a guide');
const workflowSignatures = new Set();
const SAFE_ACTION_TYPES = new Set([
  'open-plugin-manager',
  'open-plugin-surface',
  'set-demo-value',
  'save-demo-config',
  'run-local-preview',
  'open-overlay-preview',
  'inspect-readonly-api',
  'inspect-safe-store-state',
  'reset-demo-state',
  'run-browser-workflow'
]);
const GENERIC_SELECTORS = new Set(['body', 'main', 'form', '[role="main"]', '.container', '#app', 'canvas']);

for (const guide of guides) {
  assert.ok(guide.steps.length >= 5 && guide.steps.length <= 9, `${guide.id} must have 5–9 specific steps`);
  const signature = guide.steps.map((step) => step.id).join('|');
  assert.ok(!workflowSignatures.has(signature), `${guide.id} must not reuse a generic workflow`);
  workflowSignatures.add(signature);
  assert.ok(guide.capture && guide.capture.fixture, `${guide.id} needs a safe capture fixture`);
  for (const locale of LOCALES) {
    for (const field of ['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']) {
      assert.ok(guide.copy[locale][field], `${guide.id} is missing ${locale} ${field}`);
    }
  }
  for (const step of guide.steps) {
    assert.ok(step.id && typeof step.id === 'string', `${guide.id} needs an explicit step id`);
    assert.ok(step.capture.route.startsWith('/'), `${guide.id}/${step.id} needs an application route`);
    assert.ok(step.capture.assertVisible, `${guide.id}/${step.id} needs a visible UI assertion`);
    assert.notStrictEqual(step.capture.assertVisible, 'body', `${guide.id}/${step.id} must not use the body as its UI assertion`);
    assert.ok(!step.capture.assertVisible.includes(','), `${guide.id}/${step.id} must use one explicit UI selector`);
    assert.ok(!GENERIC_SELECTORS.has(step.capture.assertVisible), `${guide.id}/${step.id} must not use a generic UI selector`);
    assert.ok(step.capture.action && SAFE_ACTION_TYPES.has(step.capture.action.type), `${guide.id}/${step.id} needs a declared safe action type`);
    assert.ok(step.capture.focusText && typeof step.capture.focusText === 'object', `${guide.id}/${step.id} needs localized focus text`);
    assert.ok(!step.capture.route.includes('docsPlugin='), `${guide.id}/${step.id} must not capture the ignored docsPlugin parameter`);
    for (const locale of LOCALES) {
      for (const field of ['title', 'body', 'expected', 'alt']) {
        assert.ok(step.copy[locale][field], `${guide.id}/${step.id} is missing ${locale} ${field}`);
      }
    }
  }
}

console.log(`OK: ${guides.length} plugin-specific guides with localized, actionable capture steps.`);
