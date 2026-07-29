const assert = require('node:assert/strict');
const test = require('node:test');

const { drawComposite } = require('../furry-builder-lab');

class TestImage {
  static created = [];

  constructor() {
    this.width = 300;
    this.height = 400;
    TestImage.created.push(this);
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

test('draws selected alpha atlas cells in layer order and reuses loaded atlases', async () => {
  const canvas = createCanvas();
  const atlasManifest = {
    columns: 3,
    rows: 4,
    cellSize: 100,
    renderMode: 'alpha',
    atlases: { heads: 'head.png', eyes: 'eyes.png', mouths: 'mouths.png' }
  };
  const attachmentItems = Array.from(
    { length: 12 },
    (_, cell) => ({ cell, localBounds: [0, 0, 0.5, 0.25] })
  );
  const headItems = Array.from(
    { length: 12 },
    (_, cell) => ({
      cell,
      localBounds: [0, 0, 1, 1],
      slots: {
        eyes: { center: [0.5, 0.25], maxSize: [0.5, 0.25] },
        mouths: { center: [0.5, 0.75], maxSize: [0.5, 0.25] }
      }
    })
  );
  const rigManifest = {
    version: 2,
    canvas: { size: 1024 },
    layers: {
      heads: { z: 0, items: headItems },
      eyes: {
        z: 10,
        fit: 'contain',
        attachTo: { layer: 'heads', slot: 'eyes' },
        items: attachmentItems
      },
      mouths: {
        z: 20,
        fit: 'contain',
        attachTo: { layer: 'heads', slot: 'mouths' },
        items: attachmentItems
      }
    }
  };

  await drawComposite(canvas, atlasManifest, rigManifest, { heads: 5, eyes: 7, mouths: 9 });
  await drawComposite(canvas, atlasManifest, rigManifest, { heads: 0, eyes: 0, mouths: 0 });

  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 1024);
  assert.equal(TestImage.created.length, 3);
  assert.deepEqual(
    canvas.calls.slice(1, 4).map((call) => [call[1].source, ...call.slice(2)]),
    [
      ['head.png', 200, 100, 100, 100, 0, 0, 1024, 1024],
      ['eyes.png', 100, 200, 50, 25, 256, 128, 512, 256],
      ['mouths.png', 0, 300, 50, 25, 256, 640, 512, 256]
    ]
  );
});
