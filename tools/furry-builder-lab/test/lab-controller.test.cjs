const assert = require('node:assert/strict');
const test = require('node:test');

const { createSelection } = require('../builder-state');
const { createLabController } = require('../lab-controller');

test('controller makes a direct selection observable exactly once', () => {
  const calls = [];
  const controller = createLabController({
    selection: createSelection(),
    onChange: value => calls.push(value)
  });

  controller.select('mouths', 2);

  assert.deepEqual(calls, [{ heads: 0, eyes: 0, mouths: 2 }]);
});

test('controller ignores invalid and unchanged direct selections', () => {
  const calls = [];
  const start = { heads: 3, eyes: 4, mouths: 5 };
  const controller = createLabController({
    selection: start,
    onChange: value => calls.push(value)
  });

  assert.strictEqual(controller.select('ears', 2), start);
  assert.strictEqual(controller.select('eyes', 12), start);
  assert.strictEqual(controller.select('eyes', 4), start);
  assert.deepEqual(calls, []);
});

test('controller cycles in both directions with atlas wrapping', () => {
  const calls = [];
  const controller = createLabController({
    selection: createSelection(),
    onChange: value => calls.push(value)
  });

  controller.cycle('heads', -1);
  controller.cycle('mouths', 1);

  assert.deepEqual(calls, [
    { heads: 11, eyes: 0, mouths: 0 },
    { heads: 11, eyes: 0, mouths: 1 }
  ]);
});

test('controller randomizes every part and notifies once', () => {
  const calls = [];
  const values = [0.01, 0.5, 0.99];
  let index = 0;
  const controller = createLabController({
    selection: createSelection(),
    onChange: value => calls.push(value),
    random: () => values[index++]
  });

  controller.randomize();

  assert.deepEqual(calls, [{ heads: 0, eyes: 6, mouths: 11 }]);
});
