'use strict';

const assert = require('assert');
const path = require('path');
const { buildGuides } = require('./plugin-tutorial-source');

const ROOT = path.resolve(__dirname, '..');
const guides = buildGuides(ROOT);

assert.strictEqual(guides.length, 38, 'the current manifest inventory plus Store Admin needs 38 guides');

for (const guide of guides) {
  assert.strictEqual(guide.workflowSource, 'explicit', `${guide.id} must come from an explicit plugin workflow definition`);
  assert.ok(guide.steps.length >= 5 && guide.steps.length <= 9, `${guide.id} needs 5–9 concrete steps`);
  for (const step of guide.steps) {
    assert.strictEqual(step.capture.action.type, 'run-browser-workflow', `${guide.id}/${step.id} must declare a real browser workflow`);
    assert.ok(Array.isArray(step.capture.operations) && step.capture.operations.length > 0, `${guide.id}/${step.id} needs a safe browser operation`);
    assert.ok(Array.isArray(step.capture.postconditions) && step.capture.postconditions.length > 0, `${guide.id}/${step.id} needs a verified UI outcome`);
  }
}

console.log(`OK: ${guides.length} guides are backed by explicit, executable plugin workflows.`);
