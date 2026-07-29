const assert = require('node:assert/strict');
const test = require('node:test');

const atlasManifest = require('../assets/atlas-manifest.json');
const rigManifest = require('../assets/rig-manifest.json');
const { buildDrawPlan } = require('../furry-builder-lab');

function assertRectangleWithin(rectangle, bounds, label) {
  assert.ok(rectangle.x >= 0, `${label} x is in bounds`);
  assert.ok(rectangle.y >= 0, `${label} y is in bounds`);
  assert.ok(rectangle.width > 0, `${label} width is positive`);
  assert.ok(rectangle.height > 0, `${label} height is positive`);
  assert.ok(rectangle.x + rectangle.width <= bounds.width, `${label} right edge is in bounds`);
  assert.ok(rectangle.y + rectangle.height <= bounds.height, `${label} bottom edge is in bounds`);
}

test('places requested Kopf 12 / Augen 2 / Mund 3 in distinct face slots', () => {
  const plan = buildDrawPlan(
    atlasManifest,
    rigManifest,
    { heads: 11, eyes: 1, mouths: 2 }
  );
  const eyes = plan.find(operation => operation.layer === 'eyes').destination;
  const mouth = plan.find(operation => operation.layer === 'mouths').destination;

  assert.ok(eyes.y + eyes.height < mouth.y, 'mouth must be below eyes');
});

test('builds representative extreme selections in z order with safe rectangles', () => {
  const canvas = {
    width: rigManifest.canvas.size,
    height: rigManifest.canvas.size
  };
  const atlas = {
    width: atlasManifest.columns * atlasManifest.cellSize,
    height: atlasManifest.rows * atlasManifest.cellSize
  };

  const representativeSelections = [
    { heads: 11, eyes: 1, mouths: 2, reason: 'reported overlap' },
    { heads: 5, eyes: 6, mouths: 7, reason: 'tall mouth bounds' },
    { heads: 4, eyes: 0, mouths: 8, reason: 'wide mouth bounds' },
    { heads: 6, eyes: 9, mouths: 4, reason: 'tall head and small mouth bounds' }
  ];

  for (const selection of representativeSelections) {
    const { reason, ...ids } = selection;
    const label = `${reason}: ${JSON.stringify(ids)}`;
    const plan = buildDrawPlan(atlasManifest, rigManifest, ids);

    assert.deepEqual(plan.map(operation => operation.layer), ['heads', 'eyes', 'mouths'], `${label} layer order`);
    assert.deepEqual(plan.map(operation => operation.z), [0, 10, 20], `${label} z order`);

    for (const operation of plan) {
      assertRectangleWithin(operation.source, atlas, `${label} ${operation.layer} source`);
      assertRectangleWithin(operation.destination, canvas, `${label} ${operation.layer} destination`);
    }

    const eyeDestination = plan[1].destination;
    const mouthDestination = plan[2].destination;
    assert.ok(
      eyeDestination.y + eyeDestination.height < mouthDestination.y,
      `${label} mouth must be strictly below eyes`
    );
  }
});

test('resolves an added attachment layer through attachTo metadata', () => {
  const extendedAtlas = {
    ...atlasManifest,
    atlases: { ...atlasManifest.atlases, glasses: 'glasses-atlas.png' }
  };
  const extendedRig = structuredClone(rigManifest);
  extendedRig.layers.glasses = {
    z: 15,
    fit: 'contain',
    attachTo: { layer: 'heads', slot: 'eyes' },
    items: [{ cell: 0, localBounds: [0.1, 0.25, 0.8, 0.25] }]
  };
  const selection = { heads: 0, eyes: 0, glasses: 0, mouths: 0 };

  const plan = buildDrawPlan(extendedAtlas, extendedRig, selection);

  assert.deepEqual(plan.map(operation => operation.layer), ['heads', 'eyes', 'glasses', 'mouths']);
  assert.ok(plan[2].destination.x >= plan[2].slot.x);
  assert.ok(plan[2].destination.y >= plan[2].slot.y);
  assert.ok(plan[2].destination.x + plan[2].destination.width <= plan[2].slot.x + plan[2].slot.width);
  assert.ok(plan[2].destination.y + plan[2].destination.height <= plan[2].slot.y + plan[2].slot.height);
});
