const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveFolder } = require('zip-lib');

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

function createStore(tempDir, registry, options = {}) {
  const fetchImpl = options.fetchImpl || jest.fn(async () => ({
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
    },
    ...(options.pluginLoader || {})
  };

  return new PluginStore(pluginLoader, {
    fetchImpl,
    officialStoreUrl: 'https://example.com/store.json',
    stateFile: path.join(tempDir, '_state', 'sources.json'),
    ...(options.storeOptions || {})
  });
}

async function createPluginPackage(tempDir, id, version) {
  const packageRoot = path.join(tempDir, `${id}-package`);
  const zipPath = path.join(tempDir, `${id}-${version}.zip`);
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'index.js'), `module.exports = class ${id.replace(/-/g, '')}Plugin {};\n`);
  fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
    id,
    name: id,
    version,
    entry: 'index.js',
    enabled: true
  }, null, 2));

  await archiveFolder(packageRoot, zipPath);
  return {
    zipPath,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')
  };
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
    assert.strictEqual(tts.sha256, '');
    assert.strictEqual(soundboard.installed, false);
    assert.strictEqual(soundboard.official, true);
    assert.deepStrictEqual(soundboard.pricing, { type: 'paid', amount: 499, currency: 'EUR' });
  });

  it('hides admin-only store plugins unless the account has admin access', async () => {
    const store = createStore(tempDir, {
      schemaVersion: 1,
      plugins: [
        {
          id: 'store-admin',
          name: { en: 'Store Admin' },
          description: { en: 'User management' },
          version: '1.0.0',
          access: { type: 'admin', hidden: true },
          packageUrl: 'https://example.com/store-admin.zip'
        },
        {
          id: 'animazingpal',
          name: { en: 'AnimazingPal' },
          description: { en: 'VTuber avatar control' },
          version: '1.4.0',
          access: { type: 'subscriber' },
          packageUrl: 'https://example.com/animazingpal.zip'
        },
        {
          id: 'openshock',
          name: { en: 'OpenShock' },
          description: { en: 'Shock integration' },
          version: '1.1.0',
          access: { type: 'closed-beta' },
          packageUrl: 'https://example.com/openshock.zip'
        }
      ]
    });

    const normalResult = await store.listPlugins({
      account: { access: { groups: [], closedBetaPlugins: [] } }
    });
    const adminResult = await store.listPlugins({
      account: { access: { groups: ['admin'], closedBetaPlugins: [] } }
    });

    assert.strictEqual(normalResult.plugins.some((plugin) => plugin.id === 'store-admin'), false);
    assert.strictEqual(normalResult.plugins.some((plugin) => plugin.id === 'openshock'), true);
    assert.strictEqual(normalResult.plugins.some((plugin) => plugin.id === 'animazingpal'), true);
    assert.strictEqual(adminResult.plugins.some((plugin) => plugin.id === 'store-admin'), true);
    assert.strictEqual(adminResult.plugins.find((plugin) => plugin.id === 'store-admin').access.type, 'admin');
    assert.strictEqual(normalResult.plugins.find((plugin) => plugin.id === 'openshock').access.type, 'closed-beta');
    assert.strictEqual(normalResult.plugins.find((plugin) => plugin.id === 'animazingpal').access.type, 'subscriber');
  });

  it('normalizes detail metadata for quality badges, requirements and update notes', async () => {
    const store = createStore(tempDir, {
      schemaVersion: 1,
      plugins: [
        {
          id: 'tts',
          name: { en: 'TTS' },
          description: { en: 'Text to speech' },
          version: '2.0.0',
          badges: ['ai-required'],
          quality: {
            level: 'stable',
            badges: ['obs-ready', 'needs-setup']
          },
          requirements: {
            secrets: ['FISH_AUDIO_API_KEY'],
            externalAccounts: ['Fish.audio'],
            hardware: []
          },
          changelog: [
            { version: '2.0.0', date: '2026-07-06', notes: ['Adds safer queue handling'] }
          ],
          support: {
            docsUrl: '/wiki/plugins/tts',
            feedbackEnabled: true
          },
          packageUrl: 'https://example.com/tts.zip'
        }
      ]
    });

    const result = await store.listPlugins({ locale: 'en' });
    const tts = result.plugins.find((plugin) => plugin.id === 'tts');

    assert.deepStrictEqual(tts.quality.badges, ['ai-required', 'obs-ready', 'needs-setup']);
    assert.strictEqual(tts.quality.level, 'stable');
    assert.deepStrictEqual(tts.requirements.secrets, ['FISH_AUDIO_API_KEY']);
    assert.deepStrictEqual(tts.requirements.externalAccounts, ['Fish.audio']);
    assert.strictEqual(tts.changelog[0].version, '2.0.0');
    assert.strictEqual(tts.changelog[0].notes[0], 'Adds safer queue handling');
    assert.strictEqual(tts.support.feedbackEnabled, true);
  });

  it('rolls back an existing plugin when a store update fails after replacement', async () => {
    writePlugin(tempDir, 'tts', '1.0.0');
    const { zipPath, sha256 } = await createPluginPackage(tempDir, 'tts', '2.0.0');
    const fetchImpl = jest.fn(async (url) => {
      if (String(url).endsWith('.zip')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => fs.readFileSync(zipPath)
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          schemaVersion: 1,
          plugins: [
            {
              id: 'tts',
              name: { en: 'TTS' },
              description: { en: 'Text to speech' },
              version: '2.0.0',
              packageUrl: 'https://example.com/tts.zip',
              sha256
            }
          ]
        })
      };
    });
    const saveState = jest.fn(() => {
      throw new Error('state write failed');
    });
    const store = createStore(tempDir, { schemaVersion: 1, plugins: [] }, {
      fetchImpl,
      pluginLoader: {
        saveState,
        unloadPlugin: jest.fn(async () => true)
      }
    });

    await assert.rejects(
      () => store.installPlugin('official', 'tts'),
      /state write failed/
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'tts', 'plugin.json'), 'utf8'));
    assert.strictEqual(manifest.version, '1.0.0');
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
