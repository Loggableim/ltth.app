'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');
const manifests = fs.readdirSync(path.join(ROOT, 'app', 'plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'app', 'plugins', entry.name, 'plugin.json')))
  .map((entry) => JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'plugins', entry.name, 'plugin.json'), 'utf8')));
const guides = buildGuides(ROOT);

assert.deepStrictEqual(LOCALES, ['de', 'en', 'es', 'fr']);
assert.strictEqual(guides.length, manifests.length + 1, 'every manifest plus Store Admin needs one guide');
assert.ok(guides.some((guide) => guide.id === 'visual-fx-frame-webgpu'), 'Visual FX Frame WEBGPU needs a guide');
const workflowSignatures = new Set();

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
    assert.ok(step.capture.route.startsWith('/'), `${guide.id}/${step.id} needs an application route`);
    assert.ok(step.capture.assertVisible, `${guide.id}/${step.id} needs a visible UI assertion`);
    assert.notStrictEqual(step.capture.assertVisible, 'body', `${guide.id}/${step.id} must not use the body as its UI assertion`);
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
