const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { inflateSync } = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const assetsRoot = path.join(__dirname, '..', 'assets');

function readRgbaPng(fileName) {
  const data = readFileSync(fileName);
  assert.deepEqual(data.subarray(0, 8), PNG_SIGNATURE, `${fileName} has a PNG signature`);

  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      assert.equal(chunk[8], 8, `${fileName} uses 8-bit channels`);
      colorType = chunk[9];
    }
    if (type === 'IDAT') idat.push(chunk);
    if (type === 'IEND') break;
  }
  assert.ok(width && height && idat.length, `${fileName} is readable PNG data`);
  assert.equal(colorType, 6, `${fileName} is RGBA`);

  const stride = width * 4;
  const filtered = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[input++];
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[input++];
      const left = x >= 4 ? pixels[row + x - 4] : 0;
      const up = y ? pixels[row - stride + x] : 0;
      const upLeft = y && x >= 4 ? pixels[row - stride + x - 4] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      if (filter === 2) value = (raw + up) & 255;
      if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      }
      assert.ok(filter <= 4, `${fileName} uses a supported PNG filter`);
      pixels[row + x] = value;
    }
  }
  return { width, height, pixels };
}

function assertAtlasHasTwelveTransparentCells(fileName) {
  const image = readRgbaPng(fileName);
  assert.equal(image.width % 3, 0, `${fileName} has three columns`);
  assert.equal(image.height % 4, 0, `${fileName} has four rows`);
  const cellWidth = image.width / 3;
  const cellHeight = image.height / 4;
  for (let cell = 0; cell < 12; cell += 1) {
    const column = cell % 3;
    const row = Math.floor(cell / 3);
    let alphaCoverage = false;
    for (let y = row * cellHeight; y < (row + 1) * cellHeight && !alphaCoverage; y += 1) {
      for (let x = column * cellWidth; x < (column + 1) * cellWidth; x += 1) {
        if (image.pixels[(y * image.width + x) * 4 + 3] > 0) {
          alphaCoverage = true;
          break;
        }
      }
    }
    assert.ok(alphaCoverage, `${fileName} cell ${cell} has alpha coverage`);
  }
}

test('ships three additional transparent twelve-cell atlases', () => {
  for (const name of ['accessories', 'animal-mouths', 'hair']) {
    assertAtlasHasTwelveTransparentCells(path.join(assetsRoot, `${name}-atlas.png`));
  }
});
