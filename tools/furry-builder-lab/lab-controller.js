const { PARTS, createSelection, setPart, randomize } = require('./builder-state');

const CELL_COUNT = 12;

function createLabController({
  selection = createSelection(),
  onChange = () => {},
  random = Math.random
} = {}) {
  let current = selection;

  function update(next) {
    if (next === current || PARTS.every(part => next[part] === current[part])) return current;
    current = next;
    onChange(current);
    return current;
  }

  return {
    select(part, partId) {
      return update(setPart(current, part, partId));
    },

    cycle(part, direction) {
      if (direction !== -1 && direction !== 1) return current;
      if (!Number.isInteger(current[part])) return current;
      const partId = (current[part] + direction + CELL_COUNT) % CELL_COUNT;
      return update(setPart(current, part, partId));
    },

    randomize() {
      return update(randomize(current, random));
    }
  };
}

module.exports = { createLabController };
