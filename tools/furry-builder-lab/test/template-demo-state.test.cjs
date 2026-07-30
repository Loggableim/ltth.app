'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDemoState, rotateTemplate } = require('../template-demo-state');
const manifest = require('../assets/face-templates.json');

const templateIds = Object.freeze(manifest.templates.map((template) => template.id));
const PUBLISHED_TEMPLATE_IDS = Object.freeze([
  'raccoon-slate',
  'fox-ember',
  'wolf-fog',
  'otter-cocoa',
  'cat-lilac',
  'fawn-cream'
]);

test('rotates the published six-template catalog in its visual order', () => {
  assert.deepEqual(templateIds, PUBLISHED_TEMPLATE_IDS);
});

test('creates a render-ready state with neutral audio and rotation disabled', () => {
  assert.deepEqual(createDemoState('raccoon-slate', 'wide'), {
    templateId: 'raccoon-slate',
    mouthFrame: 'wide',
    audioLevel: 0,
    rotating: false
  });
});

test('wraps face rotation without changing the active mouth frame', () => {
  const state = createDemoState('raccoon-slate', 'wide');
  const rotated = rotateTemplate(state, templateIds, -1);

  assert.equal(rotated.templateId, 'fawn-cream');
  assert.equal(rotated.mouthFrame, 'wide');
  assert.equal(rotated.audioLevel, 0);
  assert.equal(rotated.rotating, false);
  assert.notStrictEqual(rotated, state);
});

test('wraps forward rotation while preserving live audio and rotation state', () => {
  const state = {
    ...createDemoState('fawn-cream', 'round'),
    audioLevel: 0.73,
    rotating: true
  };

  assert.deepEqual(rotateTemplate(state, templateIds, 1), {
    templateId: 'raccoon-slate',
    mouthFrame: 'round',
    audioLevel: 0.73,
    rotating: true
  });
});

test('rejects unsupported directions and states outside the template catalog', () => {
  const state = createDemoState('raccoon-slate', 'rest');

  assert.throws(() => rotateTemplate(state, templateIds, 0), /Rotation direction must be 1 or -1/);
  assert.throws(
    () => rotateTemplate({ ...state, templateId: 'unknown-face' }, templateIds, 1),
    /Active template is not in the template catalog: unknown-face/
  );
});
