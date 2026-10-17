'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { mergePartialCaptureOutputs, writeCaptureManifest } = require('../../scripts/lib/capture-manifest');

describe('capture manifest writes', () => {
  let tempDir;
  let manifestPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-capture-manifest-test-'));
    manifestPath = path.join(tempDir, 'manifest.json');
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test('leaves the existing manifest byte-for-byte unchanged when capture produced no screenshots', () => {
    const existing = '{"outputs":[{"id":"existing-receipt"}]}\n';
    fs.writeFileSync(manifestPath, existing, 'utf8');
    const written = writeCaptureManifest(manifestPath, { outputs: [] }, []);

    expect(written).toBe(false);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(existing);
  });

  test('writes the manifest after at least one successful screenshot', () => {
    const manifest = { outputs: [{ id: 'new-receipt' }] };
    const written = writeCaptureManifest(manifestPath, manifest, manifest.outputs);

    expect(written).toBe(true);
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toEqual(manifest);
  });

  test('adds only the successful locale/id receipt and preserves all unrelated existing outputs', () => {
    const existing = [
      { locale: 'en', id: 'legacy__asset', receipt: { stale: true } },
      { locale: 'de', id: 'other__asset', receipt: null },
      { malformed: 'preserve untouched' }
    ];
    const added = { locale: 'de', id: 'sidekick__status-view', receipt: { schemaVersion: 2 } };
    const merged = mergePartialCaptureOutputs(existing, [added]);

    expect(merged).toHaveLength(existing.length + 1);
    expect(merged.slice(0, existing.length)).toEqual(existing);
    expect(merged.at(-1)).toEqual(added);
  });

  test('replaces only an existing output with the exact same locale/id key', () => {
    const existing = [
      { locale: 'de', id: 'sidekick__status-view', receipt: { schemaVersion: 1 } },
      { locale: 'en', id: 'sidekick__status-view', receipt: { schemaVersion: 2 } },
      { locale: 'de', id: 'unrelated__asset' }
    ];
    const replacement = { locale: 'de', id: 'sidekick__status-view', receipt: { schemaVersion: 2 } };
    const merged = mergePartialCaptureOutputs(existing, [replacement]);

    expect(merged).toEqual([existing[1], existing[2], replacement]);
  });

  test('rejects duplicate successful outputs for a locale/id pair', () => {
    const duplicate = { locale: 'de', id: 'sidekick__status-view' };
    expect(() => mergePartialCaptureOutputs([], [duplicate, duplicate]))
      .toThrow('Partial capture produced duplicate locale/ID outputs');
  });
});
