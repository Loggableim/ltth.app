const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { inflateSync } = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CELL_SIZE = 512;
const templatesRoot = path.join(__dirname, '..', 'assets', 'templates');

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
    assert.ok(filter <= 4, `${fileName} uses a supported PNG filter`);
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
      pixels[row + x] = value;
    }
  }

  return { width, height, pixels };
}

function alphaBounds(image, originX, originY, width = CELL_SIZE, height = CELL_SIZE) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = image.pixels[((originY + y) * image.width + originX + x) * 4 + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  assert.ok(maxX >= minX && maxY >= minY, `cell at ${originX},${originY} has alpha coverage`);
  return { minX, minY, maxX, maxY };
}

function alphaComponentCount(image, originX, originY, width = CELL_SIZE, height = CELL_SIZE) {
  const area = width * height;
  const seen = new Uint8Array(area);
  const queue = new Int32Array(area);
  let components = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      const alpha = image.pixels[((originY + y) * image.width + originX + x) * 4 + 3];
      if (seen[start] || alpha <= 8) continue;

      components += 1;
      seen[start] = 1;
      let read = 0;
      let write = 1;
      queue[0] = start;
      while (read < write) {
        const point = queue[read++];
        const pointX = point % width;
        const pointY = Math.floor(point / width);
        const neighbors = [
          pointX > 0 ? point - 1 : -1,
          pointX < width - 1 ? point + 1 : -1,
          pointY > 0 ? point - width : -1,
          pointY < height - 1 ? point + width : -1
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || seen[neighbor]) continue;
          const neighborX = neighbor % width;
          const neighborY = Math.floor(neighbor / width);
          const neighborAlpha = image.pixels[((originY + neighborY) * image.width + originX + neighborX) * 4 + 3];
          if (neighborAlpha <= 8) continue;
          seen[neighbor] = 1;
          queue[write++] = neighbor;
        }
      }
    }
  }

  return components;
}

function assertTransparentCorners(image, label) {
  const corners = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1]
  ];
  for (const [x, y] of corners) {
    assert.equal(image.pixels[(y * image.width + x) * 4 + 3], 0, `${label} corner ${x},${y} is transparent`);
  }
}

function assertGridCoverage(image, columns, rows, label) {
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      alphaBounds(image, column * CELL_SIZE, row * CELL_SIZE);
    }
  }
  assertTransparentCorners(image, label);
}

test('ships six transparent head and eye cells plus thirty transparent mouth cells', () => {
  const heads = readRgbaPng(path.join(templatesRoot, 'heads.png'));
  const eyes = readRgbaPng(path.join(templatesRoot, 'eyes.png'));
  const mouths = readRgbaPng(path.join(templatesRoot, 'mouths.png'));

  assert.deepEqual([heads.width, heads.height], [1536, 1024]);
  assert.deepEqual([eyes.width, eyes.height], [1536, 1024]);
  assert.deepEqual([mouths.width, mouths.height], [2560, 3072]);

  assertGridCoverage(heads, 3, 2, 'heads');
  assertGridCoverage(eyes, 3, 2, 'eyes');
  assertGridCoverage(mouths, 5, 6, 'mouths');
});

test('registers all thirty mouth frames to the same fixed cell convention', () => {
  const mouths = readRgbaPng(path.join(templatesRoot, 'mouths.png'));
  const horizontalCenters = [];
  const verticalCenters = [];

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const bounds = alphaBounds(mouths, column * CELL_SIZE, row * CELL_SIZE);
      assert.ok(bounds.minX >= 24 && bounds.maxX <= 487, `mouth ${row},${column} has safe horizontal padding`);
      assert.ok(bounds.minY >= 80 && bounds.maxY <= 447, `mouth ${row},${column} has safe vertical padding`);
      assert.equal(
        alphaComponentCount(mouths, column * CELL_SIZE, row * CELL_SIZE),
        1,
        `mouth ${row},${column} contains no neighboring-cell alpha residue`
      );
      horizontalCenters.push((bounds.minX + bounds.maxX) / 2);
      verticalCenters.push((bounds.minY + bounds.maxY) / 2);
    }
  }

  const horizontalDrift = Math.max(...horizontalCenters) - Math.min(...horizontalCenters);
  const verticalDrift = Math.max(...verticalCenters) - Math.min(...verticalCenters);
  assert.ok(horizontalDrift <= 8, `mouth-frame horizontal drift is ${horizontalDrift}px, expected <= 8px`);
  assert.ok(verticalDrift <= 24, `mouth-frame vertical drift is ${verticalDrift}px, expected <= 24px`);
});
