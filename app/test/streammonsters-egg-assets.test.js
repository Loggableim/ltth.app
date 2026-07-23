const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ELEMENTS = ['ember', 'tide', 'grove', 'gale', 'volt', 'lunar'];
const VARIANTS = ['standard', 'charged'];

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function readRgbaPng(filename) {
  const buffer = fs.readFileSync(filename);
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  const header = chunks.find(chunk => chunk.type === 'IHDR').data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  expect(header[8]).toBe(8);
  expect(header[9]).toBe(6);
  const source = zlib.inflateSync(Buffer.concat(
    chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)
  ));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = source[y * (stride + 1)];
    const input = source.subarray((y * (stride + 1)) + 1, (y + 1) * (stride + 1));
    const output = rgba.subarray(y * stride, (y + 1) * stride);
    const previous = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? output[x - 4] : 0;
      const above = previous ? previous[x] : 0;
      const upperLeft = previous && x >= 4 ? previous[x - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      output[x] = (input[x] + predictor) & 255;
    }
  }
  return { width, height, rgba, chunkTypes: chunks.map(chunk => chunk.type) };
}

describe('Stream Monsters generated egg assets', () => {
  test('ships twelve distinct 1024px RGBA eggs with transparent corners and no text metadata', () => {
    const assetDir = path.join(process.cwd(), 'plugins', 'streamalchemy', 'assets', 'eggs');
    const filenames = ELEMENTS.flatMap(element => (
      VARIANTS.map(variant => `${element}-${variant}.png`)
    ));
    const hashes = new Set();

    filenames.forEach(filename => {
      const absolutePath = path.join(assetDir, filename);
      expect(fs.existsSync(absolutePath)).toBe(true);
      const raw = fs.readFileSync(absolutePath);
      hashes.add(crypto.createHash('sha256').update(raw).digest('hex'));
      const image = readRgbaPng(absolutePath);
      expect(image).toEqual(expect.objectContaining({ width: 1024, height: 1024 }));
      let minimumAlpha = 255;
      let maximumAlpha = 0;
      for (let offset = 3; offset < image.rgba.length; offset += 4) {
        minimumAlpha = Math.min(minimumAlpha, image.rgba[offset]);
        maximumAlpha = Math.max(maximumAlpha, image.rgba[offset]);
      }
      expect(minimumAlpha).toBe(0);
      expect(maximumAlpha).toBe(255);
      const cornerOffsets = [
        3,
        ((image.width - 1) * 4) + 3,
        ((image.height - 1) * image.width * 4) + 3,
        (((image.height * image.width) - 1) * 4) + 3
      ];
      cornerOffsets.forEach(offset => expect(image.rgba[offset]).toBe(0));
      expect(image.chunkTypes).not.toEqual(expect.arrayContaining(['tEXt', 'iTXt', 'zTXt']));
    });

    expect(hashes.size).toBe(12);
  });
});
