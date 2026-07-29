const PARTS = ['heads', 'eyes', 'mouths'];
const CELL_COUNT = 12;

function createSelection() {
  return { heads: 0, eyes: 0, mouths: 0 };
}

function isValidPart(part) {
  return PARTS.includes(part);
}

function isValidPartId(partId) {
  return Number.isInteger(partId) && partId >= 0 && partId < CELL_COUNT;
}

function setPart(selection, part, partId) {
  if (!isValidPart(part) || !isValidPartId(partId)) return selection;
  return { ...selection, [part]: partId };
}

function randomize(selection = createSelection(), random = Math.random) {
  return PARTS.reduce(
    (next, part) => setPart(next, part, Math.floor(random() * CELL_COUNT)),
    selection
  );
}

module.exports = { PARTS, createSelection, setPart, randomize };
