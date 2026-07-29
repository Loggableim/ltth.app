const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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

function inspectRgbaWebp(filename) {
  const script = [
    'import json, sys',
    'from PIL import Image',
    'image = Image.open(sys.argv[1]).convert("RGBA")',
    'pixels = list(image.getdata())',
    'visible = sum(alpha > 200 for _, _, _, alpha in pixels)',
    'partial_green = sum(8 < alpha < 248 and green > 190 and red < 100 and blue < 100 and green > red + 72 and green > blue + 72 for red, green, blue, alpha in pixels)',
    'partial_magenta = sum(8 < alpha < 248 and red > 190 and blue > 190 and green < 100 and red > green + 72 and blue > green + 72 for red, green, blue, alpha in pixels)',
    'print(json.dumps({"width": image.width, "height": image.height, "corners": [image.getpixel((0, 0))[3], image.getpixel((image.width - 1, 0))[3], image.getpixel((0, image.height - 1))[3], image.getpixel((image.width - 1, image.height - 1))[3]], "visible": visible, "partialGreen": partial_green, "partialMagenta": partial_magenta}))'
  ].join('\n');
  const result = childProcess.spawnSync('python', ['-c', script, filename], {
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(result.stderr || 'WebP inspection failed');
  return JSON.parse(result.stdout);
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
      schemaVersion: 3,
      assetVersion: 'furry-1.12.0',
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
          mediaType: 'image/webp',
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

        expect(asset.assetPath).toMatch(/\.webp$/);
        const image = inspectRgbaWebp(absolutePath);
        expect([image.width, image.height]).toEqual([1024, 1024]);
        image.corners.forEach(alpha => expect(alpha).toBe(0));
        const coverage = image.visible / (image.width * image.height);
        expect(coverage).toBeGreaterThan(0.18);
        expect(coverage).toBeLessThan(0.68);
        expect(image.partialGreen).toBeLessThan(25);
        expect(image.partialMagenta).toBeLessThan(25);
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
