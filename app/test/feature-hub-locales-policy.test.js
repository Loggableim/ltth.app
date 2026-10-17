'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyFeatureHubLocales } = require('../../scripts/verify-feature-hub-locales');

function makeFixture({ closedBeta = ['talking-heads', 'music-bot'], plugins = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-feature-hub-locales-'));
  const writeJson = (relativePath, content) => {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(content, null, 2));
  };

  writeJson('app/config/plugin-release-policy.json', {
    schemaVersion: 1,
    closedBeta,
    aliases: {}
  });
  writeJson('plugin-store.json', { plugins });
  for (const page of ['features/index.html', 'features-en.html', 'features-es.html', 'features-fr.html']) {
    const target = path.join(root, page);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '<!doctype html>\n');
  }
  return root;
}

const completePlugins = [
  'stt-ticker', 'toptier', 'openshock'
].map((id) => ({
  id,
  description: { en: `${id} english`, es: `${id} español`, fr: `${id} français` }
}));

describe('feature-hub locale source policy', () => {
  test('allows omitted Store source entries only for closed-beta plugins', () => {
    const root = makeFixture({ plugins: completePlugins });
    try {
      expect(verifyFeatureHubLocales(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('continues to reject a missing non-closed-beta feature-hub source', () => {
    const root = makeFixture({
      closedBeta: ['talking-heads'],
      plugins: completePlugins
    });
    try {
      expect(verifyFeatureHubLocales(root)).toContain('Missing feature-hub source plugin: music-bot');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('still checks translations when a closed-beta source entry exists', () => {
    const root = makeFixture({
      plugins: [
        ...completePlugins,
        { id: 'talking-heads', description: { en: 'Talking Heads' } },
        { id: 'music-bot', description: { en: 'Music Bot' } }
      ]
    });
    try {
      expect(verifyFeatureHubLocales(root)).toEqual(expect.arrayContaining([
        'Missing es feature-hub description: talking-heads',
        'Missing fr feature-hub description: talking-heads',
        'Missing es feature-hub description: music-bot',
        'Missing fr feature-hub description: music-bot'
      ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
