const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { TEMPLATE_CATALOG } = require('../plugins/streamalchemy/backend/streammonsters/catalog');

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

describe('Stream Monsters furry template assets', () => {
  test('ships the exact unique 24-image transparent pack with verified manifest hashes', () => {
    const assetDir = path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'assets',
      'streammonsters',
      'furry'
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
    const expectedElements = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
    const hashes = new Set();

    expect(manifest).toEqual(expect.objectContaining({
      schemaVersion: 2,
      pack: 'furry',
      productionMode: 'bundled-only',
      generator: expect.stringMatching(/chat image/i)
    }));
    expect(manifest.assets).toHaveLength(72);
    const baseForms = manifest.assets.filter(asset => asset.stage === 1);
    expect(baseForms).toHaveLength(24);
    expect(baseForms.map(asset => asset.templateId).sort()).toEqual(
      TEMPLATE_CATALOG.map(template => template.templateId).sort()
    );
    expectedElements.forEach(element => {
      expect(baseForms.filter(asset => asset.element === element)).toHaveLength(4);
    });

    baseForms.forEach(asset => {
      const catalogEntry = TEMPLATE_CATALOG.find(template => template.templateId === asset.templateId);
      expect(asset).toEqual(expect.objectContaining({
        templateId: expect.any(String),
        name: expect.any(String),
        species: expect.any(String),
        dimensions: [1024, 1024],
        promptVersion: expect.stringMatching(/^furry-v1/),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(`/${asset.assetPath}`).toBe(catalogEntry.assetPath.replace('/plugins/streamalchemy', ''));
      const absolutePath = path.join(assetDir, `${asset.templateId}.png`);
      const raw = fs.readFileSync(absolutePath);
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      hashes.add(hash);
      expect(hash).toBe(asset.sha256);

      const image = readRgbaPng(absolutePath);
      expect(image).toEqual(expect.objectContaining({ width: 1024, height: 1024 }));
      const cornerOffsets = [
        3,
        ((image.width - 1) * 4) + 3,
        ((image.height - 1) * image.width * 4) + 3,
        (((image.height * image.width) - 1) * 4) + 3
      ];
      cornerOffsets.forEach(offset => expect(image.rgba[offset]).toBe(0));
      expect(image.chunkTypes).not.toEqual(expect.arrayContaining(['tEXt', 'iTXt', 'zTXt']));

      let opaquePixels = 0;
      let chromaFringePixels = 0;
      let opaqueChromaPixels = 0;
      expect(asset.backgroundRgb).toEqual([
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      ]);
      for (let index = 0; index < image.rgba.length; index += 4) {
        const alpha = image.rgba[index + 3];
        if (alpha > 200) opaquePixels += 1;
        const red = image.rgba[index];
        const green = image.rgba[index + 1];
        const blue = image.rgba[index + 2];
        const backgroundDistance = Math.sqrt(
          ((red - asset.backgroundRgb[0]) ** 2) +
          ((green - asset.backgroundRgb[1]) ** 2) +
          ((blue - asset.backgroundRgb[2]) ** 2)
        );
        if (alpha >= 248 && backgroundDistance < 62) opaqueChromaPixels += 1;
        if (alpha > 8 && alpha < 248 && backgroundDistance < 90) chromaFringePixels += 1;
      }
      const opaqueFraction = opaquePixels / (image.width * image.height);
      expect(opaqueFraction).toBeGreaterThan(0.2);
      expect(opaqueFraction).toBeLessThan(0.65);
      expect(opaqueChromaPixels).toBeLessThan(25);
      expect(chromaFringePixels).toBeLessThan(100);
    });

    expect(hashes.size).toBe(24);
  });
});
