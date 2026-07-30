'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const manifest = require('../assets/face-templates.json');

let createTemplateCanvasRenderer;
try {
  ({ createTemplateCanvasRenderer } = require('../template-canvas-renderer'));
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const LAB_ROOT = path.join(__dirname, '..');
const MOUTH_FRAMES = Object.freeze([
  ['rest', { x: 0, y: 0 }],
  ['small', { x: 512, y: 0 }],
  ['round', { x: 1536, y: 0 }],
  ['wide', { x: 1024, y: 0 }],
  ['teeth', { x: 2048, y: 0 }]
]);

function createFakeCanvas() {
  const calls = [];
  const context = {
    clearRect(...args) {
      calls.push({ type: 'clear', args });
    },
    drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
      calls.push({
        type: 'draw',
        image,
        source: { x: sx, y: sy, width: sw, height: sh },
        destination: { x: dx, y: dy, width: dw, height: dh }
      });
    }
  };

  return {
    canvas: {
      width: 1024,
      height: 1024,
      getContext(kind) {
        assert.equal(kind, '2d');
        return context;
      }
    },
    calls
  };
}

function drawCalls(calls) {
  return calls.filter((call) => call.type === 'draw');
}

test('renders every mouth frame from its fixed atlas source into one unchanged manifest destination', async () => {
  assert.equal(
    typeof createTemplateCanvasRenderer,
    'function',
    'the canvas renderer must be available to render the local TTS demo'
  );
  if (typeof createTemplateCanvasRenderer !== 'function') return;

  const { canvas, calls } = createFakeCanvas();
  const assets = {
    'templates/heads.png': { id: 'heads' },
    'templates/eyes.png': { id: 'eyes' },
    'templates/mouths.png': { id: 'mouths' }
  };
  const renderer = createTemplateCanvasRenderer({
    canvas,
    manifest,
    loadImage(fileName) {
      return assets[fileName];
    }
  });
  const mouthDestinations = [];

  for (const [frame, expectedSource] of MOUTH_FRAMES) {
    calls.length = 0;
    await renderer.render('raccoon-slate', frame);

    const layers = drawCalls(calls);
    assert.deepEqual(layers.map((call) => call.image.id), ['heads', 'eyes', 'mouths']);

    const mouth = layers[2];
    assert.deepEqual(mouth.source, { ...expectedSource, width: 512, height: 512 });
    mouthDestinations.push(mouth.destination);
  }

  for (const destination of mouthDestinations) {
    assert.deepEqual(destination, { x: 320, y: 576, width: 384, height: 224 });
  }
});

test('defers template atlas loading until the first render and reuses those assets afterwards', async () => {
  assert.equal(
    typeof createTemplateCanvasRenderer,
    'function',
    'the canvas renderer must be available to render the local TTS demo'
  );
  if (typeof createTemplateCanvasRenderer !== 'function') return;

  const { canvas } = createFakeCanvas();
  const loadedFiles = [];
  const renderer = createTemplateCanvasRenderer({
    canvas,
    manifest,
    loadImage(fileName) {
      loadedFiles.push(fileName);
      return { fileName };
    }
  });

  assert.deepEqual(loadedFiles, []);
  await renderer.render('fox-ember', 'round');
  await renderer.render('cat-lilac', 'teeth');
  assert.deepEqual(loadedFiles, [
    'templates/heads.png',
    'templates/eyes.png',
    'templates/mouths.png'
  ]);
});
