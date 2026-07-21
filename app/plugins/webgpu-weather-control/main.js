const crypto = require('crypto');
const path = require('path');
const { createInitialWebgpuWeatherConfig } = require('./lib/bootstrap-config');

const PLUGIN_ID = 'webgpu-weather-control';
const CONFIG_KEY = `plugin:${PLUGIN_ID}:weather_config`;
const BOOTSTRAP_KEY = `plugin:${PLUGIN_ID}:bootstrap_v1`;
const CLASSIC_CONFIG_KEY = 'plugin:weather-control:weather_config';
const SUPPORTED_EFFECTS = ['rain', 'snow', 'storm', 'fog', 'thunder', 'sunbeam', 'glitchclouds', 'aurora', 'fireflies', 'meteors', 'sakura', 'embers', 'heatwave'];

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.value);
  } catch (error) {
    return null;
  }
}

function writeSetting(db, key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function legacyMappings(db) {
  if (!tableExists(db, 'gift_weather_mappings')) {
    return [];
  }
  return db.prepare(`
    SELECT gift_id, weather_effect, intensity, duration, enabled
    FROM gift_weather_mappings
  `).all();
}

/**
 * One-time synchronous bootstrap. The entire import is deliberately within a
 * better-sqlite3 transaction so a malformed legacy mapping can never leave a
 * partly migrated configuration behind.
 */
function migrateWebgpuWeatherStorage(databaseManager, generateApiKey) {
  const db = databaseManager && (databaseManager.db || databaseManager);
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new Error('WebGPU Weather Control requires a better-sqlite3 database');
  }

  const existingConfig = readSetting(db, CONFIG_KEY);
  const completionMarker = readSetting(db, BOOTSTRAP_KEY);
  if (existingConfig || completionMarker) {
    return { migrated: false, config: existingConfig, marker: completionMarker };
  }

  const classicConfig = readSetting(db, CLASSIC_CONFIG_KEY);
  const config = createInitialWebgpuWeatherConfig(classicConfig, generateApiKey);
  // The legacy plugin's live effect and community progress are never portable.
  Object.values(config.effects).forEach((effect) => {
    effect.permanent = false;
  });
  config.gamification.enabled = false;
  config.gamification.overlay.enabled = false;
  const mappings = legacyMappings(db);
  const marker = { version: 1, completedAt: Date.now() };

  const bootstrap = db.transaction(() => {
    writeSetting(db, CONFIG_KEY, config);
    const insertMapping = db.prepare(`
      INSERT INTO webgpu_gift_weather_mappings
        (gift_id, weather_effect, intensity, duration, enabled)
      VALUES (?, ?, ?, ?, ?)
    `);
    mappings.forEach((mapping) => {
      insertMapping.run(
        mapping.gift_id,
        mapping.weather_effect,
        mapping.intensity,
        mapping.duration,
        mapping.enabled
      );
    });
    writeSetting(db, BOOTSTRAP_KEY, marker);
  });
  bootstrap();

  return { migrated: true, config, marker };
}

class WebgpuWeatherControlPlugin {
  constructor(api) {
    this.api = api;
    this.config = null;
    this.apiKey = null;
    this.gamificationPersistTimer = null;
    this.questRotationTimer = null;
  }

  generateApiKey() {
    return `webgpu_weather_${crypto.randomBytes(24).toString('base64url')}`;
  }

  apiKeysEqual(provided, expected) {
    const actualBuffer = Buffer.from(String(provided || ''), 'utf8');
    const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  }

  async init() {
    const database = this.api.getDatabase();
    const migration = migrateWebgpuWeatherStorage(database, () => this.generateApiKey());
    this.config = migration.config || createInitialWebgpuWeatherConfig(null, () => this.generateApiKey());
    this.apiKey = this.config.apiKey;
    this.registerRoutes();
    this.registerSocketHandlers();
    this.registerFlowActions();
    this.registerGcceCommands();
    if (!this.isGamificationEnabled()) {
      this.clearGamificationTimers();
    }
    this.api.log('[WEBGPU WEATHER] Independent WebGPU shell initialized', 'info');
  }

  async stop() {
    this.clearGamificationTimers();
    const gcce = this.api.getPlugin('gcce');
    if (gcce && typeof gcce.unregisterCommandsForPlugin === 'function') {
      gcce.unregisterCommandsForPlugin(PLUGIN_ID);
    }
  }

  isAuthorized(req) {
    return this.apiKeysEqual(req && req.headers && req.headers['x-webgpu-weather-key'], this.apiKey);
  }

  requireKey(handler) {
    return async (req, res) => {
      if (!this.isAuthorized(req)) {
        return res.status(401).json({ success: false, error: 'Missing or invalid X-WebGPU-Weather-Key' });
      }
      return handler(req, res);
    };
  }

  persistConfig() {
    const database = this.api.getDatabase();
    const db = database && (database.db || database);
    writeSetting(db, CONFIG_KEY, this.config);
  }

  registerRoutes() {
    this.api.registerRoute('get', `/${PLUGIN_ID}/ui`, (req, res) => res.sendFile(path.join(__dirname, 'ui.html')));
    this.api.registerRoute('get', `/${PLUGIN_ID}/overlay`, (req, res) => res.sendFile(path.join(__dirname, 'overlay.html')));
    this.api.registerRoute('get', '/api/webgpu-weather/config', (req, res) => {
      res.json({ success: true, config: { ...this.config, apiKey: undefined, hasApiKey: Boolean(this.apiKey) } });
    });
    this.api.registerRoute('post', '/api/webgpu-weather/config', this.requireKey(async (req, res) => {
      const incoming = req.body && typeof req.body === 'object' ? req.body : {};
      const wasGamificationEnabled = this.isGamificationEnabled();
      this.config = {
        ...this.config,
        ...incoming,
        effects: { ...this.config.effects, ...(incoming.effects || {}) },
        gamification: incoming.gamification ? {
          ...this.config.gamification,
          ...incoming.gamification,
          overlay: { ...this.config.gamification.overlay, ...(incoming.gamification.overlay || {}) },
          // Community progress remains owned by this plugin, never client input.
          state: this.config.gamification.state
        } : this.config.gamification
      };
      this.config.apiKey = this.apiKey;
      if (wasGamificationEnabled && !this.isGamificationEnabled()) {
        this.clearGamificationTimers();
      }
      this.persistConfig();
      this.api.emit('webgpu-weather:config-changed', { config: { ...this.config, apiKey: undefined } });
      res.json({ success: true });
    }));
    this.api.registerRoute('post', '/api/webgpu-weather/trigger', this.requireKey(async (req, res) => {
      const event = this.createWeatherEvent(req.body || {});
      if (!event) {
        return res.status(400).json({ success: false, error: 'Invalid or disabled WebGPU weather action' });
      }
      this.api.emit('webgpu-weather:trigger', event);
      return res.json({ success: true, event });
    }));
    this.api.registerRoute('post', '/api/webgpu-weather/stop', this.requireKey(async (req, res) => {
      const action = req.body && req.body.action;
      this.api.emit('webgpu-weather:stop', { action: SUPPORTED_EFFECTS.includes(action) ? action : null, timestamp: Date.now() });
      res.json({ success: true });
    }));
  }

  createWeatherEvent(params) {
    if (!this.config.enabled || !SUPPORTED_EFFECTS.includes(params.action) || !this.config.effects[params.action]?.enabled) {
      return null;
    }
    const effect = this.config.effects[params.action];
    const intensity = Number(params.intensity);
    const duration = Number(params.duration);
    return {
      action: params.action,
      intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : effect.defaultIntensity,
      duration: Number.isFinite(duration) ? Math.max(100, Math.min(600000, duration)) : effect.defaultDuration,
      permanent: false,
      timestamp: Date.now(),
      source: 'webgpu-weather-control'
    };
  }

  registerSocketHandlers() {
    this.api.registerSocket('webgpu-weather:trigger', (socketOrParams, payload) => {
      const params = payload || (socketOrParams && typeof socketOrParams.emit !== 'function' ? socketOrParams : {});
      if (!this.apiKeysEqual(params.key, this.apiKey)) {
        return { success: false, error: 'Missing or invalid X-WebGPU-Weather-Key' };
      }
      const event = this.createWeatherEvent(params);
      if (!event) {
        return { success: false, error: 'Invalid or disabled WebGPU weather action' };
      }
      this.api.emit('webgpu-weather:trigger', event);
      return { success: true, event };
    });
    this.api.registerSocket('webgpu-weather:stop', (socketOrParams, payload) => {
      const params = payload || (socketOrParams && typeof socketOrParams.emit !== 'function' ? socketOrParams : {});
      if (!this.apiKeysEqual(params.key, this.apiKey)) {
        return { success: false, error: 'Missing or invalid X-WebGPU-Weather-Key' };
      }
      this.api.emit('webgpu-weather:stop', { action: params.action || null, timestamp: Date.now() });
      return { success: true };
    });
  }

  registerFlowActions() {
    this.api.registerFlowAction('webgpu-weather.trigger', async (params) => {
      const event = this.createWeatherEvent(params || {});
      if (!event) {
        return { success: false, error: 'Invalid or disabled WebGPU weather action' };
      }
      this.api.emit('webgpu-weather:trigger', event);
      return { success: true, event };
    });
    this.api.registerFlowAction('webgpu-weather.stop', async (params = {}) => {
      this.api.emit('webgpu-weather:stop', { action: params.action || null, timestamp: Date.now() });
      return { success: true };
    });
  }

  registerGcceCommands() {
    const gcce = this.api.getPlugin('gcce');
    if (!gcce || typeof gcce.registerCommandsForPlugin !== 'function') {
      return;
    }
    const names = this.config.chatCommands.commandNames;
    gcce.registerCommandsForPlugin(PLUGIN_ID, [
      { name: names.weather, description: 'Trigger a WebGPU weather effect', syntax: `/${names.weather} <effect>`, permission: 'all', handler: (args) => this.handleGcceTrigger(args) },
      { name: names.weatherlist, description: 'List available WebGPU weather effects', syntax: `/${names.weatherlist}`, permission: 'all', handler: () => ({ success: true, effects: SUPPORTED_EFFECTS }) },
      { name: names.weatherstop, description: 'Stop WebGPU weather effects', syntax: `/${names.weatherstop} [effect]`, permission: 'subscriber', handler: (args) => this.handleGcceStop(args) }
    ]);
  }

  handleGcceTrigger(args = []) {
    const event = this.createWeatherEvent({ action: String(args[0] || '').toLowerCase() });
    if (!event) {
      return { success: false, error: 'Invalid or disabled WebGPU weather action' };
    }
    this.api.emit('webgpu-weather:trigger', event);
    return { success: true, event };
  }

  handleGcceStop(args = []) {
    this.api.emit('webgpu-weather:stop', { action: args[0] || null, timestamp: Date.now() });
    return { success: true };
  }

  isGamificationEnabled() {
    return Boolean(this.config && this.config.gamification && this.config.gamification.enabled);
  }

  clearGamificationTimers() {
    if (this.gamificationPersistTimer) clearTimeout(this.gamificationPersistTimer);
    if (this.questRotationTimer) clearTimeout(this.questRotationTimer);
    this.gamificationPersistTimer = null;
    this.questRotationTimer = null;
  }

  scheduleGamificationPersist() {
    if (!this.isGamificationEnabled()) return;
    this.gamificationPersistTimer = setTimeout(() => this.persistConfig(), 250);
  }

  createNextQuest() {
    if (!this.isGamificationEnabled()) return null;
    return this.config.gamification.quests.pool[0] || null;
  }
}

module.exports = WebgpuWeatherControlPlugin;
module.exports.WebgpuWeatherControlPlugin = WebgpuWeatherControlPlugin;
module.exports.migrateWebgpuWeatherStorage = migrateWebgpuWeatherStorage;
