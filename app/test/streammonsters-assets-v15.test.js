const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { TEMPLATE_CATALOG } = require('../plugins/streamalchemy/backend/streammonsters/catalog');

const EXPECTED_CUES = [
  'ui.navigate',
  'egg.spawn',
  'egg.ready',
  'egg.crack',
  'egg.hatch',
  'arena.portal',
  'arena.hit',
  'arena.shield',
  'arena.heal',
  'element.ember',
  'element.tide',
  'element.grove',
  'element.gale',
  'element.volt',
  'element.lunar',
  'arena.special',
  'arena.ko',
  'arena.victory',
  'progress.xp',
  'progress.level',
  'progress.evolution',
  'progress.rank'
];

function hashFile(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

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
  const header = chunks.find(chunk => chunk.type === 'IHDR')?.data;
  if (!header) throw new Error(`PNG has no IHDR: ${filename}`);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (header[8] !== 8 || header[9] !== 6) {
    throw new Error(`Expected 8-bit RGBA PNG: ${filename}`);
  }
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
  return {
    width,
    height,
    rgba,
    chunkTypes: chunks.map(chunk => chunk.type)
  };
}

function readPcmWavHeader(filename) {
  const buffer = fs.readFileSync(filename);
  expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
  let offset = 12;
  let format = null;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    if (type === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        byteRate: buffer.readUInt32LE(offset + 16),
        blockAlign: buffer.readUInt16LE(offset + 20),
        bitsPerSample: buffer.readUInt16LE(offset + 22)
      };
    }
    if (type === 'data') dataLength = length;
    offset += 8 + length + (length % 2);
  }
  if (!format || !dataLength) throw new Error(`Invalid WAV chunks: ${filename}`);
  return {
    ...format,
    durationMs: Math.round((dataLength / format.byteRate) * 1000)
  };
}

describe('Stream Monsters 1.5 bundled asset library', () => {
  const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
  const furryDir = path.join(pluginDir, 'assets', 'streammonsters', 'furry');
  const audioDir = path.join(pluginDir, 'assets', 'audio');

  test('ships 72 unique canonical furry forms with stage metadata and clean alpha', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(furryDir, 'manifest.json'), 'utf8'));
    expect(manifest).toEqual(expect.objectContaining({
      schemaVersion: 2,
      assetVersion: 'furry-1.5.0',
      pack: 'furry',
      productionMode: 'bundled-only'
    }));
    expect(manifest.assets).toHaveLength(72);

    const hashes = new Set();
    for (const template of TEMPLATE_CATALOG) {
      const forms = manifest.assets
        .filter(asset => asset.templateId === template.templateId)
        .sort((left, right) => left.stage - right.stage);
      expect(forms.map(asset => asset.stage)).toEqual([1, 2, 3]);
      forms.forEach(asset => {
        expect(asset).toEqual(expect.objectContaining({
          templateId: template.templateId,
          stage: expect.any(Number),
          element: template.element,
          species: template.species,
          assetPath: expect.any(String),
          promptVersion: expect.any(String),
          generator: expect.stringMatching(/chat image/i),
          dimensions: [1024, 1024],
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          trimRect: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number)
          }),
          pivot: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
          facing: expect.stringMatching(/^(left|right|center)$/),
          hitAnchor: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
          effectAnchor: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
        }));

        const absolutePath = path.join(pluginDir, asset.assetPath.replace(/^assets\//, 'assets/'));
        expect(fs.existsSync(absolutePath)).toBe(true);
        expect(hashFile(absolutePath)).toBe(asset.sha256);
        hashes.add(asset.sha256);

        const image = readRgbaPng(absolutePath);
        expect([image.width, image.height]).toEqual([1024, 1024]);
        expect(image.chunkTypes).not.toEqual(expect.arrayContaining(['tEXt', 'iTXt', 'zTXt']));
        const corners = [
          3,
          ((image.width - 1) * 4) + 3,
          ((image.height - 1) * image.width * 4) + 3,
          (((image.width * image.height) - 1) * 4) + 3
        ];
        corners.forEach(index => expect(image.rgba[index]).toBe(0));

        let visible = 0;
        let partialGreen = 0;
        let partialMagenta = 0;
        for (let index = 0; index < image.rgba.length; index += 4) {
          const red = image.rgba[index];
          const green = image.rgba[index + 1];
          const blue = image.rgba[index + 2];
          const alpha = image.rgba[index + 3];
          if (alpha > 200) visible += 1;
          if (
            alpha > 8 && alpha < 248 &&
            green > 190 && red < 100 && blue < 100 &&
            green > red + 72 && green > blue + 72
          ) partialGreen += 1;
          if (
            alpha > 8 && alpha < 248 &&
            red > 190 && blue > 190 && green < 100 &&
            red > green + 72 && blue > green + 72
          ) partialMagenta += 1;
        }
        const coverage = visible / (image.width * image.height);
        expect(coverage).toBeGreaterThan(0.18);
        expect(coverage).toBeLessThan(0.68);
        expect(partialGreen).toBeLessThan(25);
        expect(partialMagenta).toBeLessThan(25);
      });
    }
    expect(hashes.size).toBe(72);
  });

  test('bundles only licensed deterministic 48 kHz mono PCM cues with provenance hashes', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8'));
    expect(manifest).toEqual(expect.objectContaining({
      schemaVersion: 1,
      license: 'CC0-1.0',
      selection: 'deterministic'
    }));
    expect(manifest.sources).toHaveLength(4);
    manifest.sources.filter(source => source.id !== 'basic-spell').forEach(source => {
      expect(source).toEqual(expect.objectContaining({
        name: expect.stringMatching(/^Kenney /),
        url: expect.stringMatching(/^https:\/\/www\.kenney\.nl\/assets\//),
        archiveSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        licenseSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
    });
    const basicSpell = manifest.sources.find(source => source.id === 'basic-spell');
    expect(basicSpell).toEqual(expect.objectContaining({
      name: 'Basic Spell Impacts',
      url: 'https://lentikula.itch.io/freecc0-basic-spell-impacts-sfx',
      sourceArchive: 'Basic Spell Impacts.zip',
      archiveSha256: '6e265452877dd4121635200b2c59be3b36a2d2aed20ee15915c7c59396028f4d',
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      licensePath: 'assets/audio/licenses/basic-spell-impacts-LICENSE-EVIDENCE.txt',
      licenseSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    }));
    expect(manifest.excludedSources).toEqual([]);
    const licenseEvidence = fs.readFileSync(
      path.join(pluginDir, basicSpell.licensePath),
      'utf8'
    );
    expect(hashFile(path.join(pluginDir, basicSpell.licensePath))).toBe(basicSpell.licenseSha256);
    expect(licenseEvidence).toContain('Basic Spell Impacts [Free/CC0]');
    expect(licenseEvidence).toContain('20 spell impact sounds');
    expect(licenseEvidence).toContain('Retrieved: 2026-07-26');

    expect(Object.keys(manifest.cues).sort()).toEqual(EXPECTED_CUES.sort());
    ['element.ember', 'element.tide', 'element.volt', 'arena.special'].forEach(cueId => {
      expect(manifest.cues[cueId].variants).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceArchive: 'Basic Spell Impacts.zip',
          sourcePath: expect.stringMatching(/Spell Impacts\/.+\.wav$/)
        })
      ]));
    });
    const renderedHashes = new Set();
    Object.entries(manifest.cues).forEach(([cueId, cue]) => {
      expect(cue).toEqual(expect.objectContaining({
        channel: expect.stringMatching(/^(ui|egg|battle|reward)$/),
        gainDb: expect.any(Number),
        variants: expect.any(Array)
      }));
      expect(cue.variants.length).toBeGreaterThan(0);
      cue.variants.forEach(variant => {
        expect(variant).toEqual(expect.objectContaining({
          assetPath: expect.stringMatching(/^assets\/audio\/cues\/.+\.wav$/),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          sourceArchive: expect.any(String),
          sourcePath: expect.any(String),
          sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          durationMs: expect.any(Number),
          peakDbfs: expect.any(Number)
        }));
        const absolutePath = path.join(pluginDir, variant.assetPath);
        expect(hashFile(absolutePath)).toBe(variant.sha256);
        renderedHashes.add(variant.sha256);
        const wav = readPcmWavHeader(absolutePath);
        expect(wav).toEqual(expect.objectContaining({
          audioFormat: 1,
          channels: 1,
          sampleRate: 48000,
          bitsPerSample: 16
        }));
        expect(Math.abs(wav.durationMs - variant.durationMs)).toBeLessThanOrEqual(2);
        expect(wav.durationMs).toBeGreaterThan(40);
        expect(wav.durationMs).toBeLessThan(5000);
      });
    });
    expect(renderedHashes.size).toBeGreaterThanOrEqual(EXPECTED_CUES.length);
  });
});
