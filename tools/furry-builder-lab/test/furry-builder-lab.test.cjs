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
  const manifest = {
    columns: 3,
    rows: 4,
    renderMode: 'alpha',
    atlases: { heads: 'head.png', eyes: 'eyes.png', mouths: 'mouths.png' }
  };

  await drawComposite(canvas, manifest, { heads: 5, eyes: 7, mouths: 9 });
  await drawComposite(canvas, manifest, { heads: 0, eyes: 0, mouths: 0 });

  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 1024);
  assert.equal(TestImage.created.length, 3);
  assert.deepEqual(
    canvas.calls.slice(1, 4).map((call) => [call[1].source, ...call.slice(2)]),
    [
      ['head.png', 200, 100, 100, 100, 0, 0, 1024, 1024],
      ['eyes.png', 100, 200, 100, 100, 0, 0, 1024, 1024],
      ['mouths.png', 0, 300, 100, 100, 0, 0, 1024, 1024]
    ]
  );
});
