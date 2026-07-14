const path = require('path');

const CoinJarStore = require('./lib/state-store');
const CoinJarEngine = require('./lib/coin-jar-engine');

class SchnorrbecherPlugin {
  constructor(api) {
    this.api = api;
    this.store = new CoinJarStore(api.getPluginDataDir());
    this.config = this.store.loadConfig();
    this.rendererMetrics = {
      physicalCoinCount: null,
      pendingSpawns: 0
    };
    this.engine = new CoinJarEngine({
      store: this.store,
      getConfig: () => this.config,
      emit: (event, payload) => this.api.emit(event, payload),
      log: (message, level) => this.api.log(message, level),
      now: () => Date.now(),
      setTimeoutFn: setTimeout,
      clearTimeoutFn: clearTimeout
    });
  }

  async init() {
    this.api.ensurePluginDataDir();
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
      livestreamStatus: state.sessionId ? 'active' : 'waiting'
    };
  }

  resolveGiftImage(event = {}) {
    try {
      const catalogGift = this.api.getDatabase()?.getGift?.(event.giftId ?? event.gift_id);
      return catalogGift?.image_url || catalogGift?.imageUrl ||
        event.giftImage || event.giftImageUrl || event.giftPictureUrl || null;
    } catch (error) {
      this.api.log(`Gift catalog lookup failed: ${error.message}`, 'warn');
      return event.giftImage || event.giftImageUrl || event.giftPictureUrl || null;
    }
  }

  _sendSync(socket) {
    socket.emit('coinJar.sync', {
      ...this.engine.syncPayload(),
      config: this.config
    });
  }

  _handleAdd(payload = {}) {
    const value = payload.value ?? payload.totalValue;
    return this.engine.addValue(value, {
      eventId: payload.eventId,
      comboId: payload.comboId,
      senderId: payload.senderId,
      senderName: payload.senderName,
      giftId: payload.giftId,
      giftName: payload.giftName || 'Manual Coins',
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
      const result = this._handleAdd({
        value: body.value ?? 100,
        giftId: body.giftId || 'test-gift',
        giftName: body.giftName || 'Test Gift',
        giftImage: body.giftImage || null,
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
  }

  registerEvents() {
    this.api.registerTikTokEvent('gift', data => {
      const giftImage = this.resolveGiftImage(data);
      return this.engine.handleGift({ ...data, giftImage });
    });

    this.api.registerTikTokEvent('streamSessionStarted', data => {
      return this.engine.handleStreamSession(data);
    });

    this.api.registerTikTokEvent('connected', data => {
      return this.engine.handleStreamSession(data, { requireIsNewStream: true });
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
