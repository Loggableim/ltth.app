const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extract } = require('zip-lib');
const {
  assertPluginId,
  assertPathInside,
  resolvePluginEntryPath
} = require('./plugin-paths');
const { hasStoreAdminAccess } = require('./clerk-store-auth');

const DEFAULT_OFFICIAL_STORE_URL = process.env.LTTH_PLUGIN_STORE_URL || 'https://ltth.app/plugin-store.json';

const PREINSTALLED_PLUGIN_IDS = new Set([
  'chatango',
  'goals',
  'spotlight',
  'soundboard',
  'toptier',
  'tts',
  'webgpu-emoji-rain'
]);

const CLOSED_BETA_PLUGIN_IDS = new Set([
  'animazingpal',
  'interactive-story',
  'openshock',
  'sidekick',
  'streamalchemy'
]);

const ADMIN_PLUGIN_IDS = new Set([
  'store-admin'
]);

function normalizeLocale(locale = 'en') {
  const baseLocale = String(locale || 'en').trim().toLowerCase().replace('_', '-').split('-')[0];
  return ['en', 'de', 'es', 'fr'].includes(baseLocale) ? baseLocale : 'en';
}

function localize(value, locale = 'en') {
  if (!value || typeof value !== 'object') {
    return value || '';
  }

  const normalizedLocale = normalizeLocale(locale);
  return value[normalizedLocale] || value.en || Object.values(value)[0] || '';
}

function compareVersions(a = '0.0.0', b = '0.0.0') {
  const left = String(a).split('.').map((part) => parseInt(part, 10) || 0);
  const right = String(b).split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function ensureUrlAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }

  return parsed.toString();
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return parseJsonText(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseJsonText(text) {
  const value = String(text || '');
  return JSON.parse(value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value);
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function findManifestRoot(extractedDir) {
  const rootManifest = path.join(extractedDir, 'plugin.json');
  if (fs.existsSync(rootManifest)) {
    return extractedDir;
  }

  for (const entry of fs.readdirSync(extractedDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.join(extractedDir, entry.name);
    if (fs.existsSync(path.join(candidate, 'plugin.json'))) {
      return candidate;
    }
  }

  throw new Error('No plugin.json found in package');
}

function getCategoryFromType(type) {
  const normalizedType = String(type || '').toLowerCase();
  if (['overlay', 'integration', 'utility', 'tool', 'core'].includes(normalizedType)) {
    return normalizedType;
  }

  return 'plugin';
}

function normalizeBadges(badges = [], access = { type: 'public' }) {
  const items = Array.isArray(badges) ? badges.slice() : [];
  if (access.type === 'closed-beta') {
    items.push('closed-beta');
  }
  if (access.type === 'admin') {
    items.push('admin-only');
  }

  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeList(value = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizeRequirements(requirements = {}) {
  return {
    secrets: normalizeList(requirements.secrets),
    externalAccounts: normalizeList(requirements.externalAccounts),
    hardware: normalizeList(requirements.hardware),
    permissions: normalizeList(requirements.permissions)
  };
}

function normalizeChangelog(changelog = []) {
  return Array.isArray(changelog)
    ? changelog.map((entry) => ({
        version: String(entry.version || '').trim(),
        date: String(entry.date || '').trim() || null,
        notes: normalizeList(entry.notes)
      })).filter((entry) => entry.version || entry.notes.length > 0)
    : [];
}

function normalizeSupport(support = {}) {
  return {
    docsUrl: String(support.docsUrl || '').trim() || null,
    feedbackEnabled: support.feedbackEnabled !== false
  };
}

function normalizeQuality(plugin = {}, access = { type: 'public' }) {
  const rawBadges = Array.isArray(plugin.badges) ? plugin.badges : [];
  const quality = plugin.quality || {};
  const badges = normalizeBadges([
    ...rawBadges,
    ...normalizeList(quality.badges)
  ], access);

  return {
    level: String(quality.level || plugin.channel || 'open-beta').trim(),
    badges
  };
}

class PluginStore {
  constructor(pluginLoader, options = {}) {
    this.pluginLoader = pluginLoader;
    this.logger = options.logger || pluginLoader.logger || console;
    this.fetchImpl = options.fetchImpl || global.fetch;
    this.officialStoreUrl = options.officialStoreUrl || DEFAULT_OFFICIAL_STORE_URL;
    this.cacheTtlMs = options.cacheTtlMs || 5 * 60 * 1000;
    this.cache = new Map();
    this.stateFile = options.stateFile || this.getDefaultStateFile();
    this.state = readJsonFile(this.stateFile, { communityEnabled: false, sources: [] });
    this.closedStore = options.closedStore === true;
  }

  getDefaultStateFile() {
    const configPathManager = this.pluginLoader.configPathManager;
    if (configPathManager && typeof configPathManager.getUserConfigsDir === 'function') {
      return path.join(configPathManager.getUserConfigsDir(), 'plugin_store_sources.json');
    }

    return path.join(this.pluginLoader.pluginsDir, '_store', 'sources.json');
  }

  saveState() {
    writeJsonFile(this.stateFile, this.state);
  }

  getSources() {
    const sources = [
      {
        id: 'official',
        name: 'Official LTTH Store',
        url: this.officialStoreUrl,
        official: true,
        enabled: true
      }
    ];

    if (!this.closedStore && this.state.communityEnabled) {
      for (const source of this.state.sources || []) {
        sources.push({
          id: source.id,
          name: source.name,
          url: source.url,
          official: false,
          enabled: source.enabled !== false
        });
      }
    }

    return sources;
  }

  getSourceState() {
    return {
      communityEnabled: this.state.communityEnabled === true,
      closedStore: this.closedStore,
      sources: this.getSources()
    };
  }

  enableCommunitySources() {
    this.state.communityEnabled = true;
    this.saveState();
    return this.getSourceState();
  }

  addCommunitySource({ id, name, url }) {
    if (!this.state.communityEnabled) {
      throw new Error('Community plugin sources are disabled');
    }

    const safeId = assertPluginId(id);
    if (safeId === 'official') {
      throw new Error('Source id is reserved');
    }

    const safeUrl = ensureUrlAllowed(url);
    const sourceName = String(name || safeId).trim();
    if (!sourceName) {
      throw new Error('Source name is required');
    }

    const sources = this.state.sources || [];
    if (sources.some((source) => source.id === safeId)) {
      throw new Error(`Source already exists: ${safeId}`);
    }

    sources.push({ id: safeId, name: sourceName, url: safeUrl, enabled: true });
    this.state.sources = sources;
    this.saveState();
    return this.getSourceState();
  }

  removeCommunitySource(sourceId) {
    const safeId = assertPluginId(sourceId);
    this.state.sources = (this.state.sources || []).filter((source) => source.id !== safeId);
    this.saveState();
    return this.getSourceState();
  }

  async fetchRegistry(source, forceRefresh = false) {
    const cached = this.cache.get(source.id);
    if (!forceRefresh && cached && Date.now() - cached.loadedAt < this.cacheTtlMs) {
      return cached.registry;
    }

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch API is not available');
    }

    const response = await this.fetchImpl(source.url, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Store source ${source.id} returned HTTP ${response.status}`);
    }

    const registry = await response.json();
    this.validateRegistry(registry);
    this.cache.set(source.id, { loadedAt: Date.now(), registry });
    return registry;
  }

  validateRegistry(registry) {
    if (!registry || typeof registry !== 'object') {
      throw new Error('Invalid store registry');
    }

    if (!Array.isArray(registry.plugins)) {
      throw new Error('Store registry must contain a plugins array');
    }
  }

  buildBundledOfficialRegistry() {
    const registryPath = path.join(__dirname, '..', '..', 'plugin-store.json');
    if (fs.existsSync(registryPath)) {
      try {
        const registry = parseJsonText(fs.readFileSync(registryPath, 'utf8'));
        this.validateRegistry(registry);
        return {
          ...registry,
          generatedFrom: registry.generatedFrom || 'bundled-store-manifest'
        };
      } catch (error) {
        this.logger.warn?.(`Failed to load bundled plugin store registry: ${error.message}`);
      }
    }

    const plugins = [];
    const pluginsDir = this.pluginLoader.pluginsDir;

    if (!fs.existsSync(pluginsDir)) {
      return { schemaVersion: 1, generatedFrom: 'local-manifests', plugins };
    }

    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) {
        continue;
      }

      const manifestPath = path.join(pluginsDir, entry.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.id || manifest.disabled === true) {
          continue;
        }

        const id = assertPluginId(manifest.id);
        plugins.push({
          id,
          name: id === 'webgpu-emoji-rain'
            ? { en: 'Emoji Rain', de: 'Emoji Regen', es: 'Lluvia de emojis', fr: 'Pluie d emojis' }
            : { en: manifest.name || id },
          description: manifest.descriptions || { en: manifest.description || '' },
          version: manifest.version || '0.0.0',
          author: manifest.author || '',
          icon: manifest.icon || null,
          logo: manifest.logo || null,
          category: getCategoryFromType(manifest.type),
          channel: 'open-beta',
          pricing: { type: 'free', amount: 0, currency: 'EUR' },
          badges: PREINSTALLED_PLUGIN_IDS.has(id) ? ['preinstalled'] : [],
          packageUrl: '',
          sha256: ''
        });
      } catch (error) {
        this.logger.warn?.(`Failed to add bundled store plugin ${entry.name}: ${error.message}`);
      }
    }

    plugins.sort((a, b) => a.id.localeCompare(b.id));
    return { schemaVersion: 1, generatedFrom: 'local-manifests', plugins };
  }

  getInstalledPlugins() {
    const installed = new Map();
    const pluginsDir = this.pluginLoader.pluginsDir;

    if (!fs.existsSync(pluginsDir)) {
      return installed;
    }

    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) {
        continue;
      }

      const manifestPath = path.join(pluginsDir, entry.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.id) {
          installed.set(manifest.id, {
            id: manifest.id,
            version: manifest.version || '0.0.0',
            enabled: this.pluginLoader.isPluginEnabledFromDisk
              ? this.pluginLoader.isPluginEnabledFromDisk(manifest.id)
              : manifest.enabled !== false
          });
        }
      } catch (error) {
        this.logger.warn?.(`Failed to inspect installed plugin ${entry.name}: ${error.message}`);
      }
    }

    return installed;
  }

  normalizeStorePlugin(plugin, source, locale, installedPlugins) {
    const id = assertPluginId(plugin.id);
    const installed = installedPlugins.get(id);
    const storeVersion = plugin.version || '0.0.0';
    const installedVersion = installed?.version || null;
    const updateAvailable = installedVersion ? compareVersions(storeVersion, installedVersion) > 0 : false;
    const pricing = this.normalizePricing(plugin.pricing);
    const access = this.normalizeAccess(plugin.access, id);

    return {
      id,
      sourceId: source.id,
      sourceName: source.name,
      official: source.official === true,
      community: source.official !== true,
      name: localize(plugin.name, locale) || id,
      description: localize(plugin.description, locale),
      version: storeVersion,
      installedVersion,
      installed: Boolean(installed),
      enabled: installed?.enabled === true,
      updateAvailable,
      icon: plugin.icon || null,
      logo: plugin.logo || null,
      category: plugin.category || 'other',
      channel: plugin.channel || 'stable',
      pricing,
      access,
      quality: normalizeQuality(plugin, access),
      requirements: normalizeRequirements(plugin.requirements),
      changelog: normalizeChangelog(plugin.changelog),
      support: normalizeSupport(plugin.support),
      updateSafety: {
        rollbackProtected: true
      },
      badges: normalizeBadges(plugin.badges, access),
      author: plugin.author || '',
      minLtthVersion: plugin.minLtthVersion || null,
      catalogOnly: plugin.catalogOnly === true,
      packageUrl: plugin.packageUrl || '',
      sha256: plugin.sha256 || '',
      screenshots: Array.isArray(plugin.screenshots) ? plugin.screenshots : []
    };
  }

  normalizeAccess(access = {}, pluginId = '') {
    const safePluginId = assertPluginId(pluginId);
    const type = String(access?.type || '').trim().toLowerCase();

    if (ADMIN_PLUGIN_IDS.has(safePluginId) || type === 'admin') {
      return {
        type: 'admin',
        hidden: access.hidden !== false
      };
    }

    if (CLOSED_BETA_PLUGIN_IDS.has(safePluginId) || type === 'closed-beta') {
      return {
        type: 'closed-beta',
        hidden: access.hidden === true
      };
    }

    return {
      type: 'public',
      hidden: access.hidden === true
    };
  }

  shouldIncludePluginForAccount(plugin, account = {}) {
    if (plugin.access?.type === 'admin' && plugin.access.hidden === true) {
      return hasStoreAdminAccess(account);
    }

    return true;
  }

  normalizePricing(pricing) {
    if (!pricing || pricing.type === 'free') {
      return { type: 'free', amount: 0, currency: 'EUR' };
    }

    if (pricing.type === 'paid') {
      return {
        type: 'paid',
        amount: Number.isFinite(pricing.amount) ? pricing.amount : 0,
        currency: pricing.currency || 'EUR'
      };
    }

    return { type: 'free', amount: 0, currency: 'EUR' };
  }

  async listPlugins({ locale = 'en', forceRefresh = false, account = {} } = {}) {
    const installedPlugins = this.getInstalledPlugins();
    const plugins = [];
    const errors = [];
    const notices = [];

    for (const source of this.getSources().filter((item) => item.enabled)) {
      try {
        const registry = await this.fetchRegistry(source, forceRefresh);
        for (const plugin of registry.plugins) {
          const normalized = this.normalizeStorePlugin(plugin, source, locale, installedPlugins);
          if (this.shouldIncludePluginForAccount(normalized, account)) {
            plugins.push(normalized);
          }
        }
      } catch (error) {
        if (source.official) {
          const fallbackRegistry = this.buildBundledOfficialRegistry();
          for (const plugin of fallbackRegistry.plugins) {
            const normalized = this.normalizeStorePlugin(plugin, source, locale, installedPlugins);
            if (this.shouldIncludePluginForAccount(normalized, account)) {
              plugins.push(normalized);
            }
          }
          notices.push({
            sourceId: source.id,
            message: error.message,
            fallback: 'bundled'
          });
          this.logger.warn?.(`Failed to load official plugin store; using bundled catalog: ${error.message}`);
        } else {
          errors.push({ sourceId: source.id, error: error.message });
          this.logger.warn?.(`Failed to load plugin store source ${source.id}: ${error.message}`);
        }
      }
    }

    return {
      communityEnabled: this.closedStore ? false : this.state.communityEnabled === true,
      closedStore: this.closedStore,
      sources: this.getSources(),
      plugins,
      errors,
      notices
    };
  }

  async findPlugin(sourceId, pluginId) {
    const safeSourceId = assertPluginId(sourceId);
    const safePluginId = assertPluginId(pluginId);
    const source = this.getSources().find((item) => item.id === safeSourceId);
    if (!source) {
      throw new Error(`Unknown store source: ${safeSourceId}`);
    }

    const registry = await this.fetchRegistry(source);
    const plugin = registry.plugins.find((item) => item.id === safePluginId);
    if (!plugin) {
      throw new Error(`Plugin ${safePluginId} not found in source ${safeSourceId}`);
    }

    return { source, plugin };
  }

  async downloadPackage(plugin, tempDir) {
    const packageUrl = ensureUrlAllowed(plugin.packageUrl);
    const response = await this.fetchImpl(packageUrl);
    if (!response.ok) {
      throw new Error(`Plugin package returned HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!plugin.sha256) {
      throw new Error('Plugin package checksum is required');
    }

    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest.toLowerCase() !== String(plugin.sha256).toLowerCase()) {
      throw new Error('Plugin package checksum mismatch');
    }

    const zipPath = path.join(tempDir, 'plugin.zip');
    fs.writeFileSync(zipPath, buffer);
    return zipPath;
  }

  validateExtractedPackage(pluginDir, expectedPluginId) {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));

    if (!manifest.id || !manifest.name || !manifest.entry) {
      throw new Error('Invalid plugin.json: missing id, name, or entry');
    }

    const safeManifestId = assertPluginId(manifest.id);
    if (safeManifestId !== expectedPluginId) {
      throw new Error(`Plugin id mismatch: expected ${expectedPluginId}, got ${safeManifestId}`);
    }

    const entryPath = resolvePluginEntryPath(pluginDir, manifest.entry);
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Plugin entry file not found: ${manifest.entry}`);
    }

    return manifest;
  }

  async installPlugin(sourceId, pluginId) {
    const safePluginId = assertPluginId(pluginId);
    const { plugin } = await this.findPlugin(sourceId, safePluginId);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-store-'));
    const extractDir = path.join(tempDir, 'extract');
    const rollbackDir = path.join(tempDir, 'rollback');
    const targetDir = assertPathInside(
      this.pluginLoader.pluginsDir,
      path.join(this.pluginLoader.pluginsDir, safePluginId),
      'Plugin install path'
    );
    const previousState = this.pluginLoader.state[safePluginId]
      ? { ...this.pluginLoader.state[safePluginId] }
      : null;
    let rollbackAvailable = false;

    try {
      fs.mkdirSync(extractDir, { recursive: true });
      const zipPath = await this.downloadPackage(plugin, tempDir);
      await extract(zipPath, extractDir);
      const packageRoot = findManifestRoot(extractDir);
      const manifest = this.validateExtractedPackage(packageRoot, safePluginId);

      if (fs.existsSync(targetDir)) {
        copyDirectory(targetDir, rollbackDir);
        rollbackAvailable = true;
        await this.pluginLoader.unloadPlugin(safePluginId);
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      copyDirectory(packageRoot, targetDir);

      if (!this.pluginLoader.state[safePluginId]) {
        this.pluginLoader.state[safePluginId] = {};
      }
      this.pluginLoader.state[safePluginId].enabled = false;
      this.pluginLoader.saveState?.();

      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version || plugin.version || '0.0.0',
        enabled: false,
        rollbackProtected: rollbackAvailable
      };
    } catch (error) {
      if (rollbackAvailable && fs.existsSync(rollbackDir)) {
        try {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          copyDirectory(rollbackDir, targetDir);
          if (previousState) {
            this.pluginLoader.state[safePluginId] = previousState;
          } else {
            delete this.pluginLoader.state[safePluginId];
          }
          error.rollbackApplied = true;
          this.logger.warn?.(`Rolled back plugin ${safePluginId} after failed store install: ${error.message}`);
        } catch (rollbackError) {
          error.rollbackError = rollbackError.message;
          this.logger.error?.(`Failed to roll back plugin ${safePluginId}: ${rollbackError.message}`);
        }
      }
      throw error;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  ADMIN_PLUGIN_IDS,
  CLOSED_BETA_PLUGIN_IDS,
  DEFAULT_OFFICIAL_STORE_URL,
  PluginStore,
  compareVersions,
  ensureUrlAllowed
};
