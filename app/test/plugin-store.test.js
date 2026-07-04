const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PluginStore, compareVersions, ensureUrlAllowed } = require('../modules/plugin-store');

function writePlugin(root, id, version = '1.0.0') {
  const pluginDir = path.join(root, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = class TestPlugin {};\n');
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id,
    name: id,
    version,
    entry: 'index.js',
    enabled: true
  }, null, 2));
}

function createStore(tempDir, registry) {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => registry
  }));
  const pluginLoader = {
    pluginsDir: tempDir,
    plugins: new Map(),
    state: {},
    saveState: jest.fn(),
    isPluginEnabledFromDisk: () => true,
    logger: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    }
  };

  return new PluginStore(pluginLoader, {
    fetchImpl,
    officialStoreUrl: 'https://example.com/store.json',
    stateFile: path.join(tempDir, '_state', 'sources.json')
  });
}

describe('PluginStore', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-store-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('compares simple semantic versions', () => {
    assert.strictEqual(compareVersions('1.2.0', '1.1.9') > 0, true);
    assert.strictEqual(compareVersions('1.2.0', '1.2.0'), 0);
    assert.strictEqual(compareVersions('1.2.0', '1.3.0') < 0, true);
  });

  it('requires HTTPS source URLs', () => {
    assert.strictEqual(ensureUrlAllowed('https://example.com/store.json'), 'https://example.com/store.json');
    assert.throws(() => ensureUrlAllowed('http://example.com/store.json'), /Only HTTPS/);
  });

  it('lists official plugins and marks installed/update state', async () => {
    writePlugin(tempDir, 'tts', '1.0.0');

    const store = createStore(tempDir, {
      schemaVersion: 1,
      plugins: [
        {
          id: 'tts',
          name: { en: 'TTS', de: 'TTS' },
          description: { en: 'Speech', de: 'Sprache' },
          version: '1.1.0',
          category: 'audio',
          channel: 'open-beta',
          packageUrl: 'https://example.com/tts.zip'
        },
        {
          id: 'soundboard',
          name: { en: 'Soundboard' },
          description: { en: 'Sounds' },
          version: '1.0.0',
          pricing: { type: 'paid', amount: 499, currency: 'EUR' },
          packageUrl: 'https://example.com/soundboard.zip'
        }
      ]
    });

    const result = await store.listPlugins({ locale: 'de' });
    const tts = result.plugins.find((plugin) => plugin.id === 'tts');
    const soundboard = result.plugins.find((plugin) => plugin.id === 'soundboard');

    assert.strictEqual(result.communityEnabled, false);
    assert.strictEqual(tts.installed, true);
    assert.strictEqual(tts.updateAvailable, true);
    assert.strictEqual(tts.installedVersion, '1.0.0');
    assert.strictEqual(tts.channel, 'open-beta');
    assert.deepStrictEqual(tts.pricing, { type: 'free', amount: 0, currency: 'EUR' });
    assert.strictEqual(soundboard.installed, false);
    assert.strictEqual(soundboard.official, true);
    assert.deepStrictEqual(soundboard.pricing, { type: 'paid', amount: 499, currency: 'EUR' });
  });

  it('falls back to bundled plugin manifests when the official registry is unavailable', async () => {
    writePlugin(tempDir, 'webgpu-emoji-rain', '2.0.0');
    const store = createStore(tempDir, { schemaVersion: 1, plugins: [] });
    store.fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    }));

    const result = await store.listPlugins({ locale: 'de' });
    const emojiRain = result.plugins.find((plugin) => plugin.id === 'webgpu-emoji-rain');

    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.notices[0].fallback, 'bundled');
    assert.strictEqual(emojiRain.name, 'Emoji Regen');
    assert.strictEqual(emojiRain.installed, true);
    assert(emojiRain.packageUrl.startsWith('https://ltth.app/plugin-store/packages/'));
    assert.deepStrictEqual(emojiRain.pricing, { type: 'free', amount: 0, currency: 'EUR' });
  });

  it('keeps community sources hidden until opt-in', async () => {
    const store = createStore(tempDir, { schemaVersion: 1, plugins: [] });

    assert.throws(() => {
      store.addCommunitySource({
        id: 'creator',
        name: 'Creator Store',
        url: 'https://example.com/community.json'
      });
    }, /disabled/);

    store.enableCommunitySources();
    const state = store.addCommunitySource({
      id: 'creator',
      name: 'Creator Store',
      url: 'https://example.com/community.json'
    });

    assert.strictEqual(state.communityEnabled, true);
    assert.strictEqual(state.sources.some((source) => source.id === 'creator'), true);
  });

  it('requires package checksums before downloading store installs', async () => {
    const store = createStore(tempDir, { schemaVersion: 1, plugins: [] });
    store.fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('zip')
    }));

    await assert.rejects(
      () => store.downloadPackage({ packageUrl: 'https://example.com/plugin.zip' }, tempDir),
      /checksum is required/
    );
  });
});
