'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FRAME_COLUMNS, resolveTemplatePlan } = require('../template-rig');
const manifest = require('../assets/face-templates.json');

const FRAMES = Object.freeze(['rest', 'small', 'wide', 'round', 'teeth']);
const TEMPLATE_IDS = Object.freeze([
  'raccoon-slate',
  'fox-ember',
  'wolf-fog',
  'otter-cocoa',
  'cat-lilac',
  'fawn-cream'
]);

test('registers the six published templates in stable rotation order', () => {
  assert.deepEqual(manifest.templates.map((template) => template.id), TEMPLATE_IDS);
});

test('keeps one template mouth destination identical for all five frames', () => {
  const destinations = FRAMES.map((frame) => resolveTemplatePlan(manifest, 'raccoon-slate', frame)
    .operations.find((operation) => operation.layer === 'mouth').destination);

  for (const destination of destinations) {
    assert.deepEqual(destination, destinations[0]);
  }
});

test('changes only the mouth source cell when a frame changes', () => {
  const rest = resolveTemplatePlan(manifest, 'raccoon-slate', 'rest');
  const wide = resolveTemplatePlan(manifest, 'raccoon-slate', 'wide');
  const restMouth = rest.operations.find((operation) => operation.layer === 'mouth');
  const wideMouth = wide.operations.find((operation) => operation.layer === 'mouth');

  assert.equal(restMouth.cell, 0);
  assert.equal(wideMouth.cell, 2);
  assert.deepEqual(restMouth.destination, wideMouth.destination);
});

test('returns head, eyes, and mouth operations in render order', () => {
  const plan = resolveTemplatePlan(manifest, 'fox-ember', 'teeth');

  assert.deepEqual(plan.operations.map((operation) => operation.layer), ['head', 'eyes', 'mouth']);
  assert.equal(plan.operations[0].atlasId, 'template-heads');
  assert.equal(plan.operations[1].atlasId, 'template-eyes');
  assert.equal(plan.operations[2].atlasId, 'template-mouths');
  assert.equal(plan.operations[2].cell, 9);
  assert.equal(FRAME_COLUMNS.teeth, 4);
});

test('rejects an unknown template and mouth frame with descriptive errors', () => {
  assert.throws(
    () => resolveTemplatePlan(manifest, 'unknown-face', 'rest'),
    /Unknown face template: unknown-face/
  );
  assert.throws(
    () => resolveTemplatePlan(manifest, 'raccoon-slate', 'smile'),
    /Unknown mouth frame: smile/
  );
});
