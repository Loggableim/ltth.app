'use strict';

const SchnorrbecherPlugin = require('../main');
const { CoinJarOverlay } = require('../overlay/coincup');
const { DEFAULT_CONFIG } = require('../lib/config');
const { protectPublicSocket } = require('../../../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../../../modules/public-overlay-payload-projection');

function createSyncHandlerFixture() {
  const socketHandlers = new Map();
  const config = { ...DEFAULT_CONFIG, persistenceMode: 'persistent', internalSetting: 'fixture-private' };
  const sourceState = {
    sessionId: 'fixture-internal-room-id', totalCoinValue: 25, visualCoinCount: 2,
    recentGifts: [{ giftId: 'fixture-private-gift-id', giftName: 'Rose', giftImage: '' }],
    updatedAt: 456, generation: 3, lastProcessedEventIds: ['fixture-private-event-id']
  };
  const plugin = Object.create(SchnorrbecherPlugin.prototype);
  plugin.config = config;
  plugin.engine = {
    syncPayload: () => ({ ...sourceState }),
    isLive: () => true,
    handleGift: jest.fn(),
    handleStreamSession: jest.fn(),
    handleStreamDisconnect: jest.fn(),
    addValue: jest.fn(),
    reset: jest.fn(),
    clearEventCache: jest.fn()
  };
  plugin.api = {
    registerTikTokEvent: jest.fn(),
    registerSocket: jest.fn((eventName, handler) => socketHandlers.set(eventName, handler)),
    registerSocketConnection: jest.fn(),
    emit: jest.fn(),
    log: jest.fn()
  };
  plugin.rendererMetrics = { physicalCoinCount: null, pendingSpawns: 0 };
  plugin.registerEvents();
  return { plugin, socketHandlers, sourceState, config };
}

function makePublicSocket(packets) {
  const socket = {
    handshake: { headers: { host: 'fixture-room.trycloudflare.com' } },
    join: jest.fn(),
    use: jest.fn(),
    emit: (eventName, payload) => packets.push({ eventName, payload })
  };
  protectPublicSocket({ socket, logger: { warn: jest.fn() } });
  return socket;
}

describe('Schnorrbecher public projection and original renderer contract', () => {
  test('actual sync.request handler preserves local state but projects public state for the original renderer', () => {
    const { plugin, socketHandlers, sourceState, config } = createSyncHandlerFixture();
    const localPackets = [];
    const publicPackets = [];
    const localSocket = { emit: (eventName, payload) => localPackets.push({ eventName, payload }) };
    const publicSocket = makePublicSocket(publicPackets);

    socketHandlers.get('coinJar.sync.request')(localSocket);
    socketHandlers.get('coinJar.sync.request')(publicSocket);

    expect(localPackets[0].payload).toMatchObject({ ...sourceState, config, livestreamStatus: 'active' });
    expect(publicPackets).toHaveLength(1);
    const publicPayload = publicPackets[0].payload;
    expect(publicPackets[0].eventName).toBe('coinJar.sync');
    expect(JSON.stringify(publicPayload)).not.toMatch(/fixture-(?:internal-room|private-gift|private-event|private)/);
    expect(publicPayload.recentGifts[0]).not.toHaveProperty('giftId');

    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.config = { ...DEFAULT_CONFIG, debug: true };
    overlay.generation = 0;
    overlay.queue = [];
    overlay.bodies = [];
    overlay.counterValue = 0;
    overlay.counterTarget = 0;
    overlay.elements = {};
    overlay.applyConfig = jest.fn(configPayload => { overlay.config = { ...overlay.config, ...configPayload }; });
    overlay._renderCounter = jest.fn();
    overlay._emitTelemetry = jest.fn();
    overlay._isJarFull = jest.fn(() => false);
    overlay._createCoin = jest.fn(function createCoin(payload) {
      this.bodies.push({ plugin: { element: null } });
      return payload;
    });

    overlay.applySync(publicPayload);
    const liveBodyCountAfterFirstSync = overlay.bodies.length;
    overlay.applySync(publicPayload);

    expect(liveBodyCountAfterFirstSync).toBe(2);
    expect(overlay.bodies).toHaveLength(2);
    expect(overlay.generation).toBe(3);
    expect(overlay.counterValue).toBe(25);
    expect(overlay.applyConfig).toHaveBeenCalledWith(expect.objectContaining({ jarStyle: 'classic', soundEnabled: false }));
    expect(overlay.config.debug).toBe(true); // Local query setting survives the projected config merge.
    expect(overlay._createCoin.mock.calls[0][0].giftId).toBeUndefined();

  });

  test('actual renderer reset generation rejects stale queued adds after reconnect synchronization', () => {
    const config = { ...DEFAULT_CONFIG, showGiftPopup: false, enabled: true };
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.config = config;
    overlay.destroyed = false;
    overlay.generation = 4;
    overlay.queue = [{ generation: 4 }];
    overlay.bodies = [];
    overlay.elements = {};
    overlay._renderCounter = jest.fn();
    overlay._emitTelemetry = jest.fn();
    overlay._showGiftPopup = jest.fn();
    overlay._compactFor = jest.fn();
    overlay._scheduleSpawn = jest.fn();

    overlay.clear({ generation: 5 });
    overlay.enqueueSpawn({ generation: 4, totalValue: 3, visualCoins: 2, totalCoinValue: 10, giftName: 'Rose' });
    expect(overlay.generation).toBe(5);
    expect(overlay.queue).toEqual([]);

    overlay.enqueueSpawn({ generation: 5, totalValue: 3, visualCoins: 2, totalCoinValue: 10, giftName: 'Rose' });
    expect(overlay.queue).toHaveLength(2);
    expect(overlay.queue[0]).toMatchObject({ generation: 5, payload: { giftName: 'Rose' } });
  });

  test('original applyConfig consumes only projected settings and keeps local-only debug state', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    const sceneStyle = { setProperty: jest.fn() };
    const jarStyle = { setProperty: jest.fn() };
    const counterStyle = {};
    overlay.config = { ...DEFAULT_CONFIG, debug: true };
    overlay.elements = {
      scene: { style: sceneStyle },
      jar: { dataset: {}, style: jarStyle },
      jarLabel: { textContent: '' },
      counter: { style: counterStyle },
      debug: { style: {} }
    };
    overlay.resize = jest.fn();
    overlay._renderCounter = jest.fn();

    const publicConfig = projectPublicOverlayPayload('coinJar.config', {
      jarStyle: 'arcade', maxPhysicalIcons: 123, debug: false, privateKey: 'fixture-secret'
    });
    overlay.applyConfig(publicConfig);

    expect(overlay.config.jarStyle).toBe('arcade');
    expect(overlay.config.maxPhysicalIcons).toBe(123);
    expect(overlay.config.debug).toBe(true); // Remote debug is omitted, so the local query setting remains active.
    expect(overlay.config).not.toHaveProperty('privateKey');
    expect(overlay.elements.jar.dataset.jarStyle).toBe('arcade');
  });
});
