const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PARTS,
  createSelection,
  setPart,
  randomize
} = require('../builder-state');

test('changes only the requested valid layer without mutating the selection', () => {
  const start = createSelection();

  const next = setPart(start, 'eyes', 7);

  assert.deepEqual(next, { heads: 0, eyes: 7, mouths: 0 });
  assert.deepEqual(start, { heads: 0, eyes: 0, mouths: 0 });
  assert.notStrictEqual(next, start);
});

test('keeps a selection unchanged for invalid part names and atlas indices', () => {
  const start = { heads: 3, eyes: 4, mouths: 5 };

  assert.strictEqual(setPart(start, 'ears', 7), start);
  assert.strictEqual(setPart(start, 'eyes', -1), start);
  assert.strictEqual(setPart(start, 'eyes', 12), start);
  assert.strictEqual(setPart(start, 'eyes', 2.5), start);
});

test('randomizes every named layer to a valid independently sampled cell', () => {
  const values = [0.01, 0.5, 0.99];
  let index = 0;

  const next = randomize(createSelection(), () => values[index++]);

  assert.deepEqual(next, { heads: 0, eyes: 6, mouths: 11 });
  assert.deepEqual(PARTS, ['heads', 'eyes', 'mouths']);
});
