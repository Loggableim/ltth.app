'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyCurrentCaptures } = require('../../scripts/build-plugin-docs-gallery');

describe('plugin documentation gallery receipt classification', () => {
  let repoRoot = null;
  let spec;
  let asset;
  let screenshotBytes;

  beforeEach(() => {
    repoRoot = null;
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-gallery-coverage-'));
    asset = {
      id: 'stream-monsters__alchemy-card',
      guideId: 'stream-monsters',
      stepId: 'alchemy-card',
      canonical: '/screenshots/docs/plugins/stream-monsters/alchemy-card.png',
      route: '/stream-monsters/ui',
      selector: '#live-center',
      action: { type: 'open-plugin-surface', stepId: 'alchemy-card' },
      workflow: {
        operations: [{ type: 'goto', route: '/stream-monsters/ui' }],
        postconditions: [{ type: 'visible', selector: '#live-center' }]
      }
    };
    spec = { version: 'gallery-fixture-v1', assets: [asset], locales: ['de', 'en', 'es', 'fr'] };
    screenshotBytes = Buffer.from('synthetic screenshot bytes');
  });

  afterEach(() => {
    if (repoRoot) fs.rmSync(repoRoot, { recursive: true, force: true });
    repoRoot = null;
  });

  function makeOutput(locale, overrides = {}) {
    const canonical = asset.canonical.replace(/^\/screenshots\//, '');
    const screenshotPath = `screenshots/${locale === 'en' ? '' : `${locale}/`}${canonical}`;
    const screenshotFile = path.join(repoRoot, screenshotPath);
    fs.mkdirSync(path.dirname(screenshotFile), { recursive: true });
    fs.writeFileSync(screenshotFile, screenshotBytes);
    const sha256 = crypto.createHash('sha256').update(screenshotBytes).digest('hex');
    return {
      id: asset.id,
      locale,
      guideId: asset.guideId,
      stepId: asset.stepId,
      route: asset.route,
      selector: asset.selector,
      action: asset.action,
      workflow: asset.workflow,
      path: screenshotPath,
      sha256,
      receipt: {
        schemaVersion: 2,
        plugin: asset.guideId,
        language: locale,
        route: asset.route,
        screenshotPath,
        sha256,
        operations: asset.workflow.operations,
        postconditions: [{ type: 'visible', selector: asset.selector, actual: true, passed: true }],
        network: [],
        blockedNetwork: [],
        console: [],
        interactions: []
      },
      ...overrides
    };
  }

  function makeManifest(outputs) {
    const specHash = crypto.createHash('sha256')
      .update(JSON.stringify({ version: spec.version, assets: spec.assets }))
      .digest('hex');
    return { version: spec.version, specHash, failures: [], outputs };
  }

  test('does not map legacy Streamalchemy alias receipts onto current Stream Monsters IDs', () => {
    const result = classifyCurrentCaptures({
      repoRoot,
      spec,
      manifest: makeManifest([{ locale: 'de', id: 'streamalchemy__alchemy-card' }])
    });

    expect(result).toMatchObject({ expected: 4, validCurrent: 0, stale: 1, missing: 4, invalid: 0, complete: false });
    expect(result.records).toEqual([]);
    expect(result.staleKeys).toEqual(['de:streamalchemy__alchemy-card']);
  });

  test('counts a current hash-checked receipt and separates absent locales from stale outputs', () => {
    const result = classifyCurrentCaptures({
      repoRoot,
      spec,
      manifest: makeManifest([
        makeOutput('de'),
        { locale: 'de', id: 'streamalchemy__alchemy-card' }
      ])
    });

    expect(result).toMatchObject({ expected: 4, validCurrent: 1, stale: 1, missing: 3, invalid: 0, complete: false });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ plugin: 'stream-monsters', locale: 'de', stepId: 'alchemy-card' });
  });

  test('reports route mismatches with a bounded reason code', () => {
    const output = makeOutput('de', { route: '/wrong-route' });
    const result = classifyCurrentCaptures({ repoRoot, spec, manifest: makeManifest([output]) });

    expect(result).toMatchObject({ expected: 4, validCurrent: 0, stale: 0, missing: 3, invalid: 1, incomplete: 4, complete: false });
    expect(result.invalidKeys).toEqual(['de:stream-monsters__alchemy-card']);
    expect(result.invalidDetails).toEqual([{ key: 'de:stream-monsters__alchemy-card', reason: 'route-mismatch' }]);
    expect(result.records).toEqual([]);
  });

  test('reports changed screenshot bytes separately from route or workflow errors', () => {
    const output = makeOutput('de');
    fs.writeFileSync(path.join(repoRoot, output.path), 'changed after receipt');
    const result = classifyCurrentCaptures({ repoRoot, spec, manifest: makeManifest([output]) });

    expect(result).toMatchObject({ expected: 4, validCurrent: 0, stale: 0, missing: 3, invalid: 1, incomplete: 4, complete: false });
    expect(result.invalidDetails).toEqual([{ key: 'de:stream-monsters__alchemy-card', reason: 'image-hash-mismatch' }]);
    expect(result.records).toEqual([]);
  });

  test('reports workflow and expected image path drift independently', () => {
    const workflowOutput = makeOutput('de', { workflow: { ...asset.workflow, route: '/old-route' } });
    const workflowResult = classifyCurrentCaptures({ repoRoot, spec, manifest: makeManifest([workflowOutput]) });
    expect(workflowResult.invalidDetails).toEqual([{ key: 'de:stream-monsters__alchemy-card', reason: 'workflow-mismatch' }]);

    const pathOutput = makeOutput('en', { path: 'screenshots/en/docs/plugins/stream-monsters/alchemy-card.png' });
    const pathResult = classifyCurrentCaptures({ repoRoot, spec, manifest: makeManifest([pathOutput]) });
    expect(pathResult.invalidDetails).toEqual([{ key: 'en:stream-monsters__alchemy-card', reason: 'image-path-mismatch' }]);
  });
});
