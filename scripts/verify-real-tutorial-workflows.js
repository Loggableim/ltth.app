'use strict';

const assert = require('assert');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');
const { buildDocsSpec } = require('./docs-screenshot-spec');

const ROOT = path.resolve(__dirname, '..');
const guide = buildGuides(ROOT).find((entry) => entry.id === 'advanced-timer');

assert.ok(guide, 'Advanced Timer needs a tutorial definition');
assert.deepStrictEqual(
  guide.steps.map((step) => step.id),
  ['open-timer-center', 'create-countdown', 'start-and-pause', 'add-manual-time', 'preview-overlay', 'configure-rotator', 'prepare-chat-rule', 'reset-countdown'],
  'Advanced Timer must describe its real safe workflow, not generic field anchors'
);

for (const step of guide.steps) {
  assert.ok(Array.isArray(step.capture.operations) && step.capture.operations.length > 0, `${step.id} needs executed browser operations`);
  assert.ok(Array.isArray(step.capture.postconditions) && step.capture.postconditions.length > 0, `${step.id} needs a verified success signal`);
  assert.ok(step.capture.route.startsWith('/advanced-timer/'), `${step.id} must use the registered Advanced Timer route`);
  for (const locale of LOCALES) {
    assert.ok(step.copy[locale].title.length > 12, `${step.id} needs a substantive ${locale} title`);
    assert.ok(step.copy[locale].body.length > 45, `${step.id} needs a substantive ${locale} instruction`);
  }
}

assert.ok(
  guide.steps.find((step) => step.id === 'preview-overlay').capture.route.includes('timer={{timerId}}'),
  'the overlay guide must use the timer-specific generated URL'
);

const createCountdownAsset = buildDocsSpec(ROOT).assets.find((asset) => asset.id === 'advanced-timer__create-countdown');
assert.ok(createCountdownAsset, 'Advanced Timer creation needs a capture asset');
assert.deepStrictEqual(
  createCountdownAsset.operations.map((operation) => operation.type),
  ['click', 'fill', 'select', 'fill', 'submit', 'capture-attribute'],
  'the capture specification must carry the real UI workflow instead of a label only'
);
assert.strictEqual(createCountdownAsset.postconditions[0].selector, '#timers-container .at-timer-card');

console.log('OK: Advanced Timer has an explicit, executable, localized tutorial workflow.');
