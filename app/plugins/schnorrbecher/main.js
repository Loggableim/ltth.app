const path = require('path');

const CoinJarStore = require('./lib/state-store');
const CoinJarEngine = require('./lib/coin-jar-engine');
const { DEFAULT_STATE, normalizeConfig, normalizeState } = require('./lib/config');
const fs = require('fs');

class SchnorrbecherPlugin {
  constructor(api) {
    this.api = api;
    this.store = new CoinJarStore(api.getPluginDataDir({ profileScoped: true }));
    this.config = this.store.loadConfig();
    this.rendererMetrics = {
      physicalCoinCount: null,
      pendingSpawns: 0
    };
    this.engine = new CoinJarEngine({
      store: this.store,
      getConfig: () => this.config,
      emit: (event, payload) => this.api.emit(
        event,
        event === 'coinJar.sync' ? this._syncPayload(payload) : payload
      ),
      log: (message, level) => this.api.log(message, level),
      now: () => Date.now(),
      setTimeoutFn: setTimeout,
      clearTimeoutFn: clearTimeout
    });
  }

  async init() {
    this.api.ensurePluginDataDir({ profileScoped: true });
    this.registerRoutes();
    this.registerEvents();
    this.api.log('Schnorrbecher initialized – OBS: /overlay/coincup', 'info');
  }

  destroy() {
    this.engine.destroy();
    this.api.log('Schnorrbecher destroyed', 'info');
  }

  getStatus() {
    const state = this.engine.syncPayload();
    const physicalCoinCount = Number.isFinite(this.rendererMetrics.physicalCoinCount)
      ? this.rendererMetrics.physicalCoinCount
      : Math.min(this.config.maxPhysicalIcons, state.visualCoinCount);

    return {
      state,
      config: this.config,
      physicalCoinCount,
      pendingSpawns: this.rendererMetrics.pendingSpawns,
      livestreamStatus: this.engine.isLive() ? 'active' : 'waiting'
    };
  }

  resolveCatalogGift(giftId) {
    try {
      const database = this.api.getDatabase?.();
      const directGift = database?.getGift?.(giftId);
      if (directGift) return directGift;
      const catalog = database?.getGiftCatalog?.();
      return Array.isArray(catalog)
        ? catalog.find(gift => String(gift?.id) === String(giftId)) || null
        : null;
    } catch (error) {
      this.api.log(`Gift catalog lookup failed: ${error.message}`, 'warn');
      return null;
    }
  }

  resolveGiftImage(event = {}) {
    const catalogGift = this.resolveCatalogGift(event.giftId ?? event.gift_id);
    const candidates = [
      catalogGift?.image_url,
      catalogGift?.imageUrl,
      event.giftImage,
      event.giftImageUrl,
      event.giftPictureUrl
    ];
    return candidates.find(candidate => typeof candidate === 'string' && candidate.trim()) || null;
  }

  resolveTestCatalogGift() {
    try {
      const catalog = this.api.getDatabase?.()?.getGiftCatalog?.();
      return Array.isArray(catalog)
        ? catalog.find(gift => typeof (gift?.image_url || gift?.imageUrl) === 'string') || null
        : null;
    } catch (error) {
      this.api.log(`Test gift catalog lookup failed: ${error.message}`, 'warn');
      return null;
    }
  }

  _syncPayload(payload = this.engine.syncPayload()) {
    return {
      ...payload,
      config: this.config,
      livestreamStatus: this.engine.isLive() ? 'active' : 'waiting'
    };
  }

  _sendSync(socket) {
    socket.emit('coinJar.sync', this._syncPayload());
  }

  _broadcastSync() {
    this.api.emit('coinJar.sync', this._syncPayload());
  }

  _handleAdd(payload = {}) {
    const value = payload.value ?? payload.totalValue;
    return this.engine.addValue(value, {
      eventId: payload.eventId,
      comboId: payload.comboId,
      senderId: payload.senderId,
      senderName: payload.senderName,
      giftId: payload.giftId,
      giftName: payload.giftName || 'Manual Gift',
      giftImage: this.resolveGiftImage(payload) || payload.giftImage || null,
      timestamp: payload.timestamp
    });
  }

  registerRoutes() {
    this.api.registerRoute('get', '/overlay/coincup', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'coincup.html'));
    });

    this.api.registerRoute('get', '/schnorrbecher/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    this.api.registerRoute('get', '/api/coin-jar/state', (req, res) => {
      res.json({ success: true, ...this.getStatus() });
    });

    this.api.registerRoute('get', '/api/coin-jar/config', (req, res) => {
      res.json({ success: true, config: this.config });
    });

    this.api.registerRoute('post', '/api/coin-jar/config', (req, res) => {
      this.config = this.store.saveConfig({ ...this.config, ...(req.body || {}) });
      this.api.emit('coinJar.config', this.config);
      res.json({ success: true, config: this.config });
    });

    this.api.registerRoute('post', '/api/coin-jar/add', (req, res) => {
      const result = this._handleAdd(req.body || {});
      res.status(result.accepted ? 200 : 400).json({ success: result.accepted, result });
    });

    this.api.registerRoute('post', '/api/coin-jar/test-gift', (req, res) => {
      const body = req.body || {};
      const catalogGift = this.resolveTestCatalogGift();
      const giftId = body.giftId || catalogGift?.id || 'test-gift';
      const result = this._handleAdd({
        value: body.value ?? 100,
        giftId,
        giftName: body.giftName || catalogGift?.name || 'Test Gift',
        giftImage: body.giftImage || this.resolveGiftImage({ giftId }),
        senderName: body.senderName || 'LTTH Test'
      });
      res.status(result.accepted ? 200 : 400).json({ success: result.accepted, result });
    });

    this.api.registerRoute('post', '/api/coin-jar/reset', (req, res) => {
      const result = this.engine.reset(req.body?.reason || 'admin');
      this.rendererMetrics = { physicalCoinCount: 0, pendingSpawns: 0 };
      res.json({ success: true, result });
    });

    this.api.registerRoute('post', '/api/coin-jar/event-cache/clear', (req, res) => {
      const state = this.engine.clearEventCache();
      res.json({ success: true, state });
    });

    const getLegacyData = () => {
      const configPathManager = this.api.getConfigPathManager();
      const legacyDir = configPathManager.getPluginDataDir('schnorrbecher');
      const targetDir = this.api.getPluginDataDir({ profileScoped: true });
      const legacyConfigPath = path.join(legacyDir, 'coin-jar-config.json');
      const legacyStatePath = path.join(legacyDir, 'coin-jar-state.json');
      const targetStatePath = path.join(targetDir, 'coin-jar-state.json');
      let config = null;
      let state = null;
      try { if (fs.existsSync(legacyConfigPath)) config = normalizeConfig(JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'))); } catch (_) { /* preview reports invalid data */ }
      try { if (fs.existsSync(legacyStatePath)) state = normalizeState(JSON.parse(fs.readFileSync(legacyStatePath, 'utf8'))); } catch (_) { /* preview reports invalid data */ }
      let targetState = null;
      try { if (fs.existsSync(targetStatePath)) targetState = normalizeState(JSON.parse(fs.readFileSync(targetStatePath, 'utf8'))); } catch (_) { /* non-empty/corrupt target is a conflict */ }
      return {
        legacyDir, targetDir, legacyConfigPath, legacyStatePath, config, state, targetState,
        hasLegacyConfigFile: fs.existsSync(legacyConfigPath),
        hasLegacyStateFile: fs.existsSync(legacyStatePath),
        targetStateIsInitializedEmpty: Boolean(targetState) && JSON.stringify(targetState) === JSON.stringify(normalizeState(DEFAULT_STATE))
      };
    };

    this.api.registerRoute('get', '/api/coin-jar/legacy-data/status', (req, res) => {
      const legacy = getLegacyData();
      res.json({
        success: true,
        targetProfile: this.api.getActiveProfile?.() || null,
        hasLegacyData: legacy.hasLegacyConfigFile || legacy.hasLegacyStateFile,
        hasConfig: Boolean(legacy.config),
        hasState: Boolean(legacy.state),
        targetConfigExists: fs.existsSync(path.join(legacy.targetDir, 'coin-jar-config.json')),
        targetStateExists: fs.existsSync(path.join(legacy.targetDir, 'coin-jar-state.json'))
      });
    });

    this.api.registerRoute('get', '/api/coin-jar/legacy-data/preview', (req, res) => {
      const legacy = getLegacyData();
      const configTargetExists = fs.existsSync(path.join(legacy.targetDir, 'coin-jar-config.json'));
      const stateTargetExists = fs.existsSync(path.join(legacy.targetDir, 'coin-jar-state.json'));
      res.json({
        success: true,
        targetProfile: this.api.getActiveProfile?.() || null,
        config: { available: Boolean(legacy.config), invalid: legacy.hasLegacyConfigFile && !legacy.config, targetExists: configTargetExists, canImport: Boolean(legacy.config) && !configTargetExists },
        state: {
          available: Boolean(legacy.state),
          invalid: legacy.hasLegacyStateFile && !legacy.state,
          targetExists: stateTargetExists,
          targetIsInitializedEmpty: legacy.targetStateIsInitializedEmpty,
          totalCoinValue: legacy.state?.totalCoinValue || 0,
          importAllowed: Boolean(legacy.state && legacy.config?.persistenceMode === 'persistent') && (!stateTargetExists || legacy.targetStateIsInitializedEmpty),
          note: legacy.config?.persistenceMode === 'session'
            ? 'Legacy Session state is deliberately not imported.'
            : legacy.targetStateIsInitializedEmpty
              ? 'The target contains only the verified empty initialization state, which will be replaced after confirmation.'
              : 'Persistent state is imported only when explicitly selected.'
        }
      });
    });

    this.api.registerRoute('post', '/api/coin-jar/legacy-data/import', (req, res) => {
      const body = req.body || {};
      if (body.confirm !== true || (body.includeConfig !== true && body.includePersistentState !== true)) {
        return res.status(400).json({ success: false, error: 'Explicit confirmation and at least one import selection are required' });
      }
      const legacy = getLegacyData();
      const includeState = body.includePersistentState === true;
      if (body.includeConfig === true && (!legacy.config || fs.existsSync(path.join(legacy.targetDir, 'coin-jar-config.json')))) {
        return res.status(409).json({ success: false, error: 'Legacy config is invalid or the target config already exists' });
      }
      if (includeState && (!legacy.state || (legacy.config || this.config).persistenceMode !== 'persistent' ||
          (fs.existsSync(path.join(legacy.targetDir, 'coin-jar-state.json')) && !legacy.targetStateIsInitializedEmpty))) {
        return res.status(409).json({ success: false, error: 'Persistent legacy state is unavailable, session-only, or the target state is not provably empty' });
      }
      const stageDir = fs.mkdtempSync(path.join(legacy.targetDir, '.legacy-import-'));
      const staged = [];
      const installed = [];
      const replaced = [];
      const previousConfig = this.config;
      const previousState = this.engine.state;
      const previousEventIds = this.engine.completedEventIds;
      try {
        if (body.includeConfig === true) {
          const stage = path.join(stageDir, 'coin-jar-config.json');
          fs.writeFileSync(stage, `${JSON.stringify(legacy.config, null, 2)}\n`, 'utf8');
          staged.push({ stage, target: path.join(legacy.targetDir, 'coin-jar-config.json'), value: legacy.config, kind: 'config' });
        }
        if (includeState) {
          const stage = path.join(stageDir, 'coin-jar-state.json');
          fs.writeFileSync(stage, `${JSON.stringify(legacy.state, null, 2)}\n`, 'utf8');
          staged.push({ stage, target: path.join(legacy.targetDir, 'coin-jar-state.json'), value: legacy.state, kind: 'state' });
        }
        for (const entry of staged) {
          if (entry.kind === 'state' && legacy.targetStateIsInitializedEmpty) {
            const backup = path.join(stageDir, 'previous-empty-state.json');
            fs.renameSync(entry.target, backup);
            replaced.push({ target: entry.target, backup });
          }
          fs.copyFileSync(entry.stage, entry.target, fs.constants.COPYFILE_EXCL);
          installed.push(entry.target);
        }
        for (const entry of staged) {
          if (entry.kind === 'config') this.config = entry.value;
          if (entry.kind === 'state') {
            this.engine.state = normalizeState(entry.value);
            this.engine.completedEventIds = new Set(this.engine.state.lastProcessedEventIds);
          }
        }
        this._broadcastSync();
        res.json({ success: true, imported: staged.map(entry => entry.kind), originalsPreserved: true });
      } catch (error) {
        this.config = previousConfig;
        this.engine.state = previousState;
        this.engine.completedEventIds = previousEventIds;
        for (const target of installed.reverse()) {
          try { fs.unlinkSync(target); } catch (_) { /* rollback best effort */ }
        }
        for (const entry of replaced.reverse()) {
          try { fs.renameSync(entry.backup, entry.target); } catch (_) { /* rollback best effort */ }
        }
        res.status(500).json({ success: false, error: error.message, originalsPreserved: true });
      } finally {
        fs.rmSync(stageDir, { recursive: true, force: true });
      }
    });
  }

  registerEvents() {
    this.api.registerTikTokEvent('gift', data => {
      const giftImage = this.resolveGiftImage(data);
      return this.engine.handleGift({ ...data, giftImage });
    });

    this.api.registerTikTokEvent('streamSessionStarted', data => {
      const result = this.engine.handleStreamSession(data);
      this._broadcastSync();
      return result;
    });

    this.api.registerTikTokEvent('connected', data => {
      const result = this.engine.handleStreamSession(data, { requireIsNewStream: true });
      this._broadcastSync();
      return result;
    });

    this.api.registerTikTokEvent('disconnected', () => {
      this.engine.handleStreamDisconnect();
      this._broadcastSync();
    });

    this.api.registerSocket('coinJar.sync.request', socket => {
      this._sendSync(socket);
    });

    this.api.registerSocket('coinJar.add', (socket, payload) => {
      const result = this._handleAdd(payload || {});
      socket.emit('coinJar.command.result', result);
    });

    this.api.registerSocket('coinJar.reset', (socket, payload) => {
      const result = this.engine.reset(payload?.reason || 'socket');
      this.rendererMetrics = { physicalCoinCount: 0, pendingSpawns: 0 };
      socket.emit('coinJar.command.result', result);
    });

    this.api.registerSocket('coinJar.telemetry', (socket, payload = {}) => {
      const max = this.config.maxPhysicalIcons;
      const physicalCoinCount = Math.max(0, Math.min(max, Math.floor(Number(payload.physicalCoinCount) || 0)));
      const pendingSpawns = Math.max(0, Math.floor(Number(payload.pendingSpawns) || 0));
      this.rendererMetrics = { physicalCoinCount, pendingSpawns };
    });

    this.api.registerSocketConnection(socket => this._sendSync(socket));
  }
}

module.exports = SchnorrbecherPlugin;
