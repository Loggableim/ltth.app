'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const manifest = require('../assets/face-templates.json');
const { mount, selectTemplate, stateForLevel, templateAssetUrl } = require('../tts-demo');

const LAB_ROOT = path.join(__dirname, '..');
const TEMPLATE_IDS = Object.freeze([
  'raccoon-slate',
  'fox-ember',
  'wolf-fog',
  'otter-cocoa',
  'cat-lilac',
  'fawn-cream'
]);

function readDemoPage() {
  const pagePath = path.join(LAB_ROOT, 'tts-demo.html');
  assert.equal(fs.existsSync(pagePath), true, 'the local TTS demo page should exist');
  return fs.readFileSync(pagePath, 'utf8');
}

function createElement({ dataset = {}, value = '' } = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  const element = {
    dataset,
    value,
    textContent: '',
    classList: {
      contains(className) {
        return classes.has(className);
      },
      toggle(className, enabled) {
        if (enabled) classes.add(className);
        else classes.delete(className);
      }
    },
    setAttribute(name, attributeValue) {
      attributes.set(name, String(attributeValue));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    trigger(type) {
      const listener = listeners.get(type);
      assert.equal(typeof listener, 'function', `expected a ${type} listener`);
      listener({ target: element });
    }
  };

  return element;
}

function createDemoDocument() {
  const templateChips = TEMPLATE_IDS.map((templateId) => createElement({ dataset: { templateId } }));
  const stateButtons = ['rest', 'small', 'round', 'wide', 'teeth']
    .map((state) => createElement({ dataset: { state } }));
  const elements = {
    '#template-canvas': { width: 1024, height: 1024 },
    '#audio-level': createElement({ value: '0' }),
    '#audio-level-value': createElement({ value: '0' }),
    '#state-description': createElement(),
    '#frame-badge': createElement(),
    '#template-prev': createElement(),
    '#template-next': createElement(),
    '#rotation-toggle': createElement(),
    '#rotation-message': createElement(),
    '#canvas-status': createElement()
  };

  return {
    elements,
    templateChips,
    stateButtons,
    querySelector(selector) {
      return elements[selector] || null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-template-id]') return templateChips;
      if (selector === '[data-state]') return stateButtons;
      return [];
    }
  };
}

test('local TTS demo ships a 1024 square canvas and the six published template chips in order', () => {
  const markup = readDemoPage();

  assert.match(markup, /<canvas[^>]*id="template-canvas"[^>]*width="1024"[^>]*height="1024"/);
  assert.match(markup, /id="template-prev"/);
  assert.match(markup, /id="template-next"/);
  assert.match(markup, /id="rotation-toggle"/);
  assert.deepEqual(
    Array.from(markup.matchAll(/data-template-id="([^"]+)"/g), (match) => match[1]),
    TEMPLATE_IDS
  );
  assert.doesNotMatch(markup, /full-tts-/);
  assert.doesNotMatch(fs.readFileSync(path.join(LAB_ROOT, 'tts-demo.js'), 'utf8'), /full-tts-/);
});

test('local TTS demo maps the complete audio-level range to predictable frames', () => {
  for (const [level, expectedState] of [
    [0, 'rest'],
    [1, 'small'],
    [25, 'small'],
    [26, 'round'],
    [50, 'round'],
    [51, 'wide'],
    [75, 'wide'],
    [76, 'teeth'],
    [100, 'teeth'],
    [-1, 'rest'],
    [101, 'teeth']
  ]) {
    assert.equal(stateForLevel(level), expectedState, `level ${level} should select ${expectedState}`);
  }
});

test('resolves each atlas file relative to the face-template manifest', () => {
  assert.equal(typeof templateAssetUrl, 'function', 'the demo should resolve manifest-relative atlas paths');
  if (typeof templateAssetUrl !== 'function') return;

  assert.equal(
    templateAssetUrl('templates/mouths.png', 'http://127.0.0.1:41731/assets/face-templates.json'),
    'http://127.0.0.1:41731/assets/templates/mouths.png'
  );
});

test('selecting a template preserves the active mouth frame, audio level, and rotation state', () => {
  assert.equal(typeof selectTemplate, 'function', 'template selection should be a state transition');
  if (typeof selectTemplate !== 'function') return;

  assert.deepEqual(selectTemplate({
    templateId: 'fox-ember',
    mouthFrame: 'wide',
    audioLevel: 65,
    rotating: true
  }, 'cat-lilac'), {
    templateId: 'cat-lilac',
    mouthFrame: 'wide',
    audioLevel: 65,
    rotating: true
  });
});

test('chip, next, and automatic rotation changes keep the active canvas mouth frame', async () => {
  assert.equal(typeof mount, 'function', 'the demo should mount its controls onto the local page');
  if (typeof mount !== 'function') return;

  const documentRef = createDemoDocument();
  const renderCalls = [];
  const timers = [];
  const clearedTimers = [];
  const demo = await mount(documentRef, {
    manifest,
    createRenderer() {
      return {
        render(templateId, mouthFrame) {
          renderCalls.push({ templateId, mouthFrame });
          return Promise.resolve();
        }
      };
    },
    setInterval(callback, interval) {
      timers.push({ callback, interval });
      return timers.length;
    },
    clearInterval(timerId) {
      clearedTimers.push(timerId);
    }
  });

  documentRef.elements['#audio-level'].value = '76';
  documentRef.elements['#audio-level'].trigger('input');
  documentRef.templateChips[4].trigger('click');
  documentRef.elements['#template-next'].trigger('click');

  assert.deepEqual(demo.getState(), {
    templateId: 'fawn-cream',
    mouthFrame: 'teeth',
    audioLevel: 76,
    rotating: false
  });
  assert.deepEqual(renderCalls.at(-1), { templateId: 'fawn-cream', mouthFrame: 'teeth' });

  documentRef.elements['#rotation-toggle'].trigger('click');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].interval, 2600);
  timers[0].callback();
  assert.deepEqual(demo.getState(), {
    templateId: 'raccoon-slate',
    mouthFrame: 'teeth',
    audioLevel: 76,
    rotating: true
  });

  documentRef.elements['#rotation-toggle'].trigger('click');
  assert.deepEqual(clearedTimers, [1]);
  assert.equal(demo.getState().rotating, false);
});
