'use strict';

const assert = require('assert');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');
const { SPEC_VERSION, buildDocsSpec } = require('./docs-screenshot-spec');

const ROOT = path.resolve(__dirname, '..');
const guides = buildGuides(ROOT);
const spec = buildDocsSpec(ROOT);

assert.match(SPEC_VERSION, /v5$/, 'the docs capture manifest must use the required 1440 by 900 workflow receipt format');
assert.deepStrictEqual(spec.locales, LOCALES, 'the capture spec must include all four locales');
assert.strictEqual(spec.assets.length, guides.reduce((total, guide) => total + guide.steps.length, 0), 'every named tutorial step needs exactly one capture asset');

const seen = new Set();
for (const guide of guides) {
  const assets = spec.assets.filter((asset) => asset.guideId === guide.id);
  assert.strictEqual(assets.length, guide.steps.length, `${guide.id} needs one asset per named step`);
  for (const step of guide.steps) {
    const asset = assets.find((candidate) => candidate.stepId === step.id);
    assert.ok(asset, `${guide.id}/${step.id} is missing from the capture spec`);
    assert.strictEqual(asset.id, `${guide.id}__${step.id}`, `${guide.id}/${step.id} needs a stable capture id`);
    assert.strictEqual(asset.route, step.capture.route, `${guide.id}/${step.id} route drifted from the tutorial source`);
    assert.strictEqual(asset.selector, step.capture.assertVisible, `${guide.id}/${step.id} selector drifted from the tutorial source`);
    assert.deepStrictEqual(asset.action, step.capture.action, `${guide.id}/${step.id} action drifted from the tutorial source`);
    assert.deepStrictEqual(asset.workflow, step.workflow, `${guide.id}/${step.id} workflow drifted from the tutorial source`);
    assert.ok(asset.focusText && typeof asset.focusText.de === 'string', `${guide.id}/${step.id} needs localized focus text`);
    assert.ok(asset.fixture && asset.fixture.profile === `docs-${guide.id}`, `${guide.id}/${step.id} needs an isolated guide fixture`);
    assert.ok(!asset.route.includes('docsPlugin='), `${guide.id}/${step.id} must not use the ignored docsPlugin URL state`);
    assert.ok(!seen.has(asset.id), `duplicate capture id ${asset.id}`);
    seen.add(asset.id);
  }
}

console.log(`OK: ${spec.assets.length} named tutorial actions are ready for isolated captures.`);
