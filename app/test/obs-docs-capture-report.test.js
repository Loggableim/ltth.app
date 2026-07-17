'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { validateObsCaptureReport } = require('../../scripts/verify-obs-docs-capture');

describe('OBS documentation capture report', () => {
  let repoRoot;
  let screenshotPath;
  let sourceScreenshotPath;

  function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const name = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
  }

  function visiblePng(width = 1280, height = 720) {
    const raw = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
      const row = y * (1 + width * 3);
      raw[row] = 0;
      raw[row + 1] = 8;
      raw[row + 2] = 16;
      raw[row + 3] = 32;
      raw[row + 1 + 16 * 3] = 240;
      raw[row + 2 + 16 * 3] = 220;
      raw[row + 3 + 16 * 3] = 200;
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-obs-report-'));
    screenshotPath = path.join(repoRoot, 'screenshots', 'docs', 'obs', 'emoji-rain', 'de.png');
    sourceScreenshotPath = path.join(repoRoot, 'screenshots', 'docs', 'obs', 'emoji-rain', 'de.source.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, visiblePng());
    fs.writeFileSync(sourceScreenshotPath, visiblePng());
  });

  afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  function inventory() {
    return [{
      plugin: 'emoji-rain',
      locale: 'de',
      sceneName: 'tutorial',
      sourceName: 'LTTH Docs Capture',
      overlayUrl: 'http://127.0.0.1:3000/emoji-rain/obs-hud?lang=de',
      width: 1280,
      height: 720
    }];
  }

  function report(overrides = {}) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(screenshotPath)).digest('hex');
    const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourceScreenshotPath)).digest('hex');
    return {
      schemaVersion: 2,
      targetCount: 1,
      records: [{
        plugin: 'emoji-rain',
        locale: 'de',
        sceneName: 'tutorial',
        sourceName: 'LTTH Docs Capture',
        overlayUrl: 'http://127.0.0.1:3000/emoji-rain/obs-hud?lang=de',
        screenshotPath: 'screenshots/docs/obs/emoji-rain/de.png',
        sha256: hash,
        sourceScreenshotPath: 'screenshots/docs/obs/emoji-rain/de.source.png',
        sourceSha256: sourceHash,
        width: 1280,
        height: 720,
        visible: true,
        nonEmpty: true,
        sourceVisible: true,
        sourceNonEmpty: true,
        restored: true,
        initialSourceNames: [],
        restoredSourceNames: [],
        initialSceneItems: [],
        restoredSceneItems: [],
        temporarySceneItemRemoved: true,
        temporaryInputRemoved: true,
        streamActive: false,
        recordActive: false,
        colors: 3,
        contrast: 240,
        sourceColors: 3,
        sourceContrast: 240,
        outputChecks: [
          { stage: 'before-mutation', streamActive: false, recordActive: false },
          { stage: 'before-screenshots', streamActive: false, recordActive: false },
          { stage: 'before-cleanup', streamActive: false, recordActive: false }
        ]
      }],
      ...overrides
    };
  }

  test('requires every declared overlay-language target and an empty restored scene', () => {
    expect(validateObsCaptureReport({ repoRoot, report: report(), inventory: inventory() }))
      .toEqual({ recordCount: 1 });
    expect(() => validateObsCaptureReport({
      repoRoot,
      inventory: inventory(),
      report: report({ records: [{ ...report().records[0], restoredSceneItems: [{ sourceName: 'stale' }] }] })
    })).toThrow('OBS tutorial scene-item state changed after capture');
  });

  test('requires a hashed temporary-source screenshot instead of report-only source metadata', () => {
    const record = { ...report().records[0] };
    delete record.sourceScreenshotPath;
    delete record.sourceSha256;

    expect(() => validateObsCaptureReport({ repoRoot, report: report({ records: [record] }), inventory: inventory() }))
      .toThrow('temporary-source screenshot evidence');
  });
});
