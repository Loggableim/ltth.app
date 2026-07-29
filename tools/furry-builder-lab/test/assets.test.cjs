const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { inflateSync } = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

function alphaAt(image, x, y) {
  return image.pixels[(y * image.width + x) * 4 + 3];
}

test('declares three readable twelve-cell alpha atlases', () => {
  const manifest = require('../assets/atlas-manifest.json');
  assert.equal(manifest.columns, 3);
  assert.equal(manifest.rows, 4);
  assert.equal(manifest.renderMode, 'alpha');
  assert.deepEqual(Object.keys(manifest.atlases).sort(), ['eyes', 'heads', 'mouths']);

  for (const relativeFile of Object.values(manifest.atlases)) {
    const image = readRgbaPng(path.join(__dirname, '..', 'assets', relativeFile));
    assert.equal(image.width % manifest.columns, 0, `${relativeFile} width is divisible by columns`);
    assert.equal(image.height % manifest.rows, 0, `${relativeFile} height is divisible by rows`);
    assert.equal(alphaAt(image, 0, 0), 0, `${relativeFile} top-left corner is transparent`);
    assert.equal(alphaAt(image, image.width - 1, 0), 0, `${relativeFile} top-right corner is transparent`);
    assert.equal(alphaAt(image, 0, image.height - 1), 0, `${relativeFile} bottom-left corner is transparent`);
    assert.equal(alphaAt(image, image.width - 1, image.height - 1), 0, `${relativeFile} bottom-right corner is transparent`);

    const cellWidth = image.width / manifest.columns;
    const cellHeight = image.height / manifest.rows;
    for (let row = 0; row < manifest.rows; row += 1) {
      for (let column = 0; column < manifest.columns; column += 1) {
        let hasOpaquePixel = false;
        for (let y = row * cellHeight; y < (row + 1) * cellHeight && !hasOpaquePixel; y += 1) {
          for (let x = column * cellWidth; x < (column + 1) * cellWidth; x += 1) {
            if (alphaAt(image, x, y) > 0) {
              hasOpaquePixel = true;
              break;
            }
          }
        }
        assert.ok(hasOpaquePixel, `${relativeFile} cell ${row * manifest.columns + column} has alpha coverage`);
      }
    }
  }
});
