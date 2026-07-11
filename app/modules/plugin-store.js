const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extract } = require('zip-lib');
const yauzl = require('yauzl');
const {
  assertPluginId,
  assertPathInside,
  resolvePluginEntryPath
} = require('./plugin-paths');
const {
  hasStoreAdminAccess
} = require('./clerk-store-auth');

const DEFAULT_OFFICIAL_STORE_URL = process.env.LTTH_PLUGIN_STORE_URL || 'https://ltth.app/plugin-store.json';

const PREINSTALLED_PLUGIN_IDS = new Set([
  'chatango',
  'goals',
  'spotlight',
  'milestone-leaderboard',
  'soundboard',
  'toptier',
  'tts',
  'emoji-rain'
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

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isWindowsLockError(error) {
  return process.platform === 'win32' && ['EPERM', 'EACCES', 'EBUSY'].includes(error?.code);
}

function validateZipEntryPath(fileName) {
  const raw = String(fileName || '');
  const normalized = raw.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw new Error(`Unsafe ZIP entry path: ${raw}`);
  }

  if (normalized.split('/').some(segment => segment === '..')) {
    throw new Error(`Unsafe ZIP entry path: ${raw}`);
  }
}

function validateZipPaths(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) return reject(new Error(`Invalid plugin ZIP: ${openError.message}`));
      zipFile.on('error', error => reject(new Error(`Invalid plugin ZIP: ${error.message}`)));
      zipFile.on('entry', entry => {
        try {
          validateZipEntryPath(entry.fileName);
          zipFile.readEntry();
        } catch (error) {
          zipFile.close();
          reject(error);
        }
      });
      zipFile.on('end', resolve);
      zipFile.readEntry();
    });
  });
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
    this.fileOps = {
      copyDirectory,
      rename: fs.renameSync,
      remove: (targetPath) => fs.rmSync(targetPath, { recursive: true, force: true }),
      exists: fs.existsSync,
      mkdir: (targetPath) => fs.mkdirSync(targetPath, { recursive: true }),
      ...(options.fileOps || {})
    };
    this.isWindowsLockError = options.isWindowsLockError || isWindowsLockError;
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

    if (this.state.communityEnabled) {
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
          name: id === 'emoji-rain'
            ? { en: 'EmojiRain', de: 'EmojiRain', es: 'EmojiRain', fr: 'EmojiRain' }
            : id === 'webgpu-emoji-rain'
              ? { en: 'WebGPU EmojiRain', de: 'WebGPU EmojiRain', es: 'WebGPU EmojiRain', fr: 'WebGPU EmojiRain' }
              : { en: manifest.name || id },
          description: manifest.descriptions || { en: manifest.description || '' },
          version: manifest.version || '0.0.0',
          author: manifest.author || '',
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
    const access = plugin.access && typeof plugin.access === 'object'
      ? { ...plugin.access }
      : null;

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
      category: plugin.category || 'other',
      channel: plugin.channel || 'stable',
      pricing,
      badges: Array.isArray(plugin.badges) ? plugin.badges : [],
      access,
      author: plugin.author || '',
      minLtthVersion: plugin.minLtthVersion || null,
      catalogOnly: plugin.catalogOnly === true,
      packageUrl: plugin.packageUrl || '',
      sha256: plugin.sha256 || '',
      quality: plugin.quality ? {
        ...plugin.quality,
        badges: [...new Set([...(plugin.badges || []), ...(plugin.quality.badges || [])])]
      } : undefined,
      requirements: plugin.requirements || undefined,
      changelog: Array.isArray(plugin.changelog) ? plugin.changelog : undefined,
      support: plugin.support || undefined,
      screenshots: Array.isArray(plugin.screenshots) ? plugin.screenshots : []
    };
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
    const showHiddenPlugins = hasStoreAdminAccess(account);

    for (const source of this.getSources().filter((item) => item.enabled)) {
      try {
        const registry = await this.fetchRegistry(source, forceRefresh);
        for (const plugin of registry.plugins) {
          const normalized = this.normalizeStorePlugin(plugin, source, locale, installedPlugins);
          if (normalized.access?.hidden === true && !showHiddenPlugins) {
            continue;
          }

          plugins.push(normalized);
        }
      } catch (error) {
        if (source.official) {
          const fallbackRegistry = this.buildBundledOfficialRegistry();
          for (const plugin of fallbackRegistry.plugins) {
            const normalized = this.normalizeStorePlugin(plugin, source, locale, installedPlugins);
            if (normalized.access?.hidden === true && !showHiddenPlugins) {
              continue;
            }
            plugins.push(normalized);
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
      communityEnabled: this.state.communityEnabled === true,
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

  validateExtractedPackage(pluginDir, expectedPluginId, expectedVersion) {
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

    if (!manifest.version || !String(manifest.version).trim()) {
      throw new Error('Invalid plugin.json: version is required');
    }

    if (!expectedVersion || String(manifest.version) !== String(expectedVersion)) {
      throw new Error(`Plugin version mismatch: expected ${expectedVersion || '(missing)'}, got ${manifest.version}`);
    }

    return manifest;
  }

  savePluginLoaderState() {
    if (typeof this.pluginLoader.saveState !== 'function') return;
    const result = this.pluginLoader.saveState();
    if (result === false) throw new Error('Plugin loader state persistence returned false');
  }

  promoteStagedPlugin(stagedDir, targetDir, backupDir) {
    const targetExists = this.fileOps.exists(targetDir);
    if (targetExists) {
      try {
        this.fileOps.rename(targetDir, backupDir);
      } catch (error) {
        if (!this.isWindowsLockError(error)) throw error;
        this.logger.warn?.(`Plugin-store rename locked; using Windows copy fallback: ${error.message}`);
        this.fileOps.copyDirectory(targetDir, backupDir);
        this.fileOps.remove(targetDir);
      }
    }

    try {
      this.fileOps.rename(stagedDir, targetDir);
    } catch (error) {
      if (!this.isWindowsLockError(error)) throw error;
      this.logger.warn?.(`Plugin-store promotion rename locked; using Windows copy fallback: ${error.message}`);
      this.fileOps.copyDirectory(stagedDir, targetDir);
      this.fileOps.remove(stagedDir);
    }

    return targetExists;
  }

  restorePluginDirectory(targetDir, backupDir, hadExistingPlugin) {
    if (this.fileOps.exists(targetDir)) this.fileOps.remove(targetDir);
    if (!hadExistingPlugin) return;

    try {
      this.fileOps.rename(backupDir, targetDir);
    } catch (error) {
      if (!this.isWindowsLockError(error)) throw error;
      this.logger.warn?.(`Plugin-store rollback rename locked; using Windows copy fallback: ${error.message}`);
      this.fileOps.copyDirectory(backupDir, targetDir);
      this.fileOps.remove(backupDir);
    }
  }

  async installPlugin(sourceId, pluginId) {
    const safePluginId = assertPluginId(pluginId);
    const { plugin } = await this.findPlugin(sourceId, safePluginId);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-store-'));
    const extractDir = path.join(tempDir, 'extract');
    const transactionDir = path.join(this.pluginLoader.pluginsDir, `.store-transaction-${safePluginId}-${crypto.randomUUID()}`);
    const stagedDir = path.join(transactionDir, 'staged');
    const backupDir = path.join(transactionDir, 'backup');
    const targetDir = assertPathInside(
      this.pluginLoader.pluginsDir,
      path.join(this.pluginLoader.pluginsDir, safePluginId),
      'Plugin install path'
    );
    const previousState = cloneJson(this.pluginLoader.state?.[safePluginId]);
    const previousLoaderState = cloneJson(this.pluginLoader.state || {});
    const wasLoaded = this.pluginLoader.plugins?.has(safePluginId) === true;
    let hadExistingPlugin = false;
    let switched = false;

    try {
      fs.mkdirSync(extractDir, { recursive: true });
      const zipPath = await this.downloadPackage(plugin, tempDir);
      await validateZipPaths(zipPath);
      await extract(zipPath, extractDir);
      const packageRoot = findManifestRoot(extractDir);
      const manifest = this.validateExtractedPackage(packageRoot, safePluginId, plugin.version);

      this.fileOps.mkdir(transactionDir);
      this.fileOps.copyDirectory(packageRoot, stagedDir);
      this.validateExtractedPackage(stagedDir, safePluginId, plugin.version);

      if (wasLoaded && !await this.pluginLoader.unloadPlugin(safePluginId)) {
        throw new Error(`Failed to unload existing plugin ${safePluginId}`);
      }

      hadExistingPlugin = this.fileOps.exists(targetDir);
      switched = true;
      this.promoteStagedPlugin(stagedDir, targetDir, backupDir);

      if (!this.pluginLoader.state) this.pluginLoader.state = {};
      if (previousState === undefined) {
        this.pluginLoader.state[safePluginId] = { enabled: false };
      } else {
        this.pluginLoader.state[safePluginId] = cloneJson(previousState);
      }
      this.savePluginLoaderState();

      if (wasLoaded) {
        const loaded = await this.pluginLoader.loadPlugin(targetDir);
        if (!loaded) throw new Error(`Failed to initialize updated plugin ${safePluginId}`);
      }

      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version || plugin.version || '0.0.0',
        enabled: false
      };
    } catch (primaryError) {
      if (!switched) throw primaryError;

      const rollbackErrors = [];
      try {
        this.restorePluginDirectory(targetDir, backupDir, hadExistingPlugin);
      } catch (rollbackError) {
        rollbackErrors.push(`files: ${rollbackError.message}`);
      }

      try {
        this.pluginLoader.state = cloneJson(previousLoaderState);
        this.savePluginLoaderState();
      } catch (rollbackError) {
        rollbackErrors.push(`state: ${rollbackError.message}`);
      }

      if (wasLoaded && hadExistingPlugin) {
        try {
          const restored = await this.pluginLoader.loadPlugin(targetDir);
          if (!restored) throw new Error('loader returned no plugin');
        } catch (rollbackError) {
          rollbackErrors.push(`runtime: ${rollbackError.message}`);
        }
      }

      const rollbackMessage = rollbackErrors.length ? `; rollback failed (${rollbackErrors.join('; ')})` : '';
      this.logger.error?.(`Plugin store transaction failed for ${safePluginId}: ${primaryError.message}${rollbackMessage}`);
      throw new Error(`Plugin store transaction failed: ${primaryError.message}${rollbackMessage}`);
    } finally {
      try { this.fileOps.remove(transactionDir); } catch (cleanupError) { this.logger.warn?.(`Failed to clean plugin transaction directory: ${cleanupError.message}`); }
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (cleanupError) { this.logger.warn?.(`Failed to clean plugin download directory: ${cleanupError.message}`); }
    }
  }
}

module.exports = {
  DEFAULT_OFFICIAL_STORE_URL,
  PluginStore,
  compareVersions,
  ensureUrlAllowed
};
