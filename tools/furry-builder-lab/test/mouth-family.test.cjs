const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDrawPlan, drawComposite } = require('../furry-builder-lab');

function createFamilyFixture() {
  return {
    atlasManifest: {
      columns: 5,
      rows: 3,
      cellSize: 100,
      renderMode: 'alpha',
      atlases: {
        heads: 'head.png',
        eyes: 'eyes.png',
        'classic-mouths': 'classic-mouths.png',
        'furry-muzzle-family': 'furry-muzzle-family.png'
      }
    },
    rigManifest: {
      version: 2,
      canvas: { size: 1000 },
      layers: {
        heads: {
          z: 0,
          items: [{
            cell: 0,
            localBounds: [0, 0, 1, 1],
            slots: {
              eyes: { center: [0.5, 0.32], maxSize: [0.5, 0.18] },
              mouths: { center: [0.5, 0.7], maxSize: [0.5, 0.2] }
            }
          }]
        },
        eyes: {
          z: 10,
          fit: 'contain',
          attachTo: { layer: 'heads', slot: 'eyes' },
          items: [{ cell: 1, localBounds: [0.1, 0.4, 0.8, 0.2] }]
        },
        mouths: {
          z: 20,
          fit: 'contain',
          attachTo: { layer: 'heads', slot: 'mouths' },
          packs: {
            'classic-mouths': {
              atlasId: 'classic-mouths',
              items: [{ cell: 4, localBounds: [0.1, 0.4, 0.8, 0.2] }]
            },
            'furry-muzzle-family': {
              atlasId: 'furry-muzzle-family',
              items: [{
                cell: 5,
                localBounds: [0.1, 0.4, 0.8, 0.2],
                frames: {
                  rest: { cell: 5 },
                  small: { cell: 6 },
                  wide: { cell: 7 },
                  round: { cell: 8 },
                  teeth: { cell: 9 }
                }
              }]
            }
          }
        }
      }
    }
  };
}

function selectedFamily(frame) {
  return {
    selection: {
      heads: { packId: 'heads', index: 0 },
      eyes: { packId: 'eyes', index: 0 },
      mouths: { packId: 'furry-muzzle-family', index: 0 }
    },
    renderState: frame ? { frameByLayer: { mouths: frame } } : { frameByLayer: {} }
  };
}

test('resolves every transient TTS mouth pose from one persisted family selection', () => {
  const { atlasManifest, rigManifest } = createFamilyFixture();
  const expectedCells = {
    rest: { x: 10, y: 140 },
    small: { x: 110, y: 140 },
    wide: { x: 210, y: 140 },
    round: { x: 310, y: 140 },
    teeth: { x: 410, y: 140 }
  };

  for (const [frame, expectedOrigin] of Object.entries(expectedCells)) {
    const { selection, renderState } = selectedFamily(frame === 'rest' ? undefined : frame);
    const persistedBeforeRender = structuredClone(selection);
    const plan = buildDrawPlan(atlasManifest, rigManifest, selection, renderState);
    const mouth = plan.find(operation => operation.layer === 'mouths');

    assert.equal(mouth.atlas, 'furry-muzzle-family.png');
    assert.deepEqual(mouth.source, {
      ...expectedOrigin,
      width: 80,
      height: 20
    });
    assert.deepEqual(selection, persistedBeforeRender, `${frame} must not mutate persisted selection`);
  }
});

test('keeps a static mouth item on its selected cell when the renderer has a TTS pose', () => {
  const { atlasManifest, rigManifest } = createFamilyFixture();
  const selection = {
    heads: { packId: 'heads', index: 0 },
    eyes: { packId: 'eyes', index: 0 },
    mouths: { packId: 'classic-mouths', index: 0 }
  };

  const plan = buildDrawPlan(atlasManifest, rigManifest, selection, {
    frameByLayer: { mouths: 'wide' }
  });
  const mouth = plan.find(operation => operation.layer === 'mouths');

  assert.equal(mouth.atlas, 'classic-mouths.png');
  assert.deepEqual(mouth.source, { x: 410, y: 40, width: 80, height: 20 });
});

test('rejects an unknown mouth family through the selection contract', () => {
  const { atlasManifest, rigManifest } = createFamilyFixture();
  const { selection } = selectedFamily('wide');
  selection.mouths = { packId: 'unknown-mouth-family', index: 0 };

  assert.throws(
    () => buildDrawPlan(atlasManifest, rigManifest, selection, { frameByLayer: { mouths: 'wide' } }),
    { name: 'RangeError', message: 'Invalid mouths selection' }
  );
});

test('falls back to rest for unknown or inherited mouth pose names', () => {
  const { atlasManifest, rigManifest } = createFamilyFixture();

  for (const frame of ['unknown-pose', 'toString', 'constructor', '__proto__']) {
    const { selection } = selectedFamily('wide');
    const persistedBeforeRender = structuredClone(selection);
    const plan = buildDrawPlan(atlasManifest, rigManifest, selection, {
      frameByLayer: { mouths: frame }
    });
    const mouth = plan.find(operation => operation.layer === 'mouths');

    assert.deepEqual(mouth.source, { x: 10, y: 140, width: 80, height: 20 }, frame);
    assert.deepEqual(selection, persistedBeforeRender, `${frame} must not mutate persisted selection`);
  }
});

class TestImage {
  constructor() {
    this.width = 500;
    this.height = 300;
  }

  set src(value) {
    this.source = value;
    queueMicrotask(() => this.onload());
  }
}

function createCanvas() {
  const calls = [];
  return {
    ownerDocument: { defaultView: { Image: TestImage } },
    getContext() {
      return {
        clearRect(...args) {
          calls.push(['clearRect', ...args]);
        },
        drawImage(...args) {
          calls.push(['drawImage', ...args]);
        }
      };
    },
    calls
  };
}

test('draws the mouth cell selected by transient TTS frame state', async () => {
  const { atlasManifest, rigManifest } = createFamilyFixture();
  const { selection, renderState } = selectedFamily('round');
  const canvas = createCanvas();

  await drawComposite(canvas, atlasManifest, rigManifest, selection, renderState);

  const mouthCall = canvas.calls.find(call => call[0] === 'drawImage' && call[1].source === 'furry-muzzle-family.png');
  assert.deepEqual(mouthCall.slice(2, 6), [310, 140, 80, 20]);
});
