'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs').promises;
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');
const { io: connectSocket } = require('socket.io-client');
const { Adapter } = require('socket.io-adapter');

const PluginLoader = require('../modules/plugin-loader');
const { PluginAPI } = PluginLoader;
const { attachPublicSocketPolicy } = require('../modules/public-overlay-access');
const {
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');
const { isIncomingSocketEventAllowed } = require('../modules/public-overlay-registry');
const TTSPlugin = require('../plugins/tts/main');
const TalkingHeadsPlugin = require('../plugins/talking-heads/main');
const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library');
const CacheManager = require('../plugins/talking-heads/utils/cache-manager');
const RoleManager = require('../plugins/talking-heads/utils/role-manager');
const AvatarLotteryManager = require('../plugins/talking-heads/utils/avatar-lottery-manager');
const AnimationController = require('../plugins/talking-heads/engines/animation-controller');

const SOURCE_FILES = [
  'app/plugins/tts/main.js',
  'app/plugins/talking-heads/main.js',
  'app/plugins/talking-heads/engines/asset-sprite-library.js',
  'app/plugins/talking-heads/utils/cache-manager.js',
  'app/modules/plugin-loader.js',
  'app/modules/public-overlay-access.js',
  'app/modules/public-overlay-registry.js',
  'app/modules/public-overlay-socket-adapter.js',
  'app/modules/public-overlay-payload-projection.js',
  'app/public/js/tts-renderer-lifecycle.js',
  'app/test/talking-heads-tts-loopback-integration.test.js'
];

const FRAME_NAMES = [
  'idle_neutral', 'blink', 'speak_closed', 'speak_mid', 'speak_open'
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function waitFor(predicate, timeoutMs = 1500, intervalMs = 5) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Loopback condition timed out after ${timeoutMs} ms`));
        return;
      }
      setTimeout(poll, intervalMs);
    };
    poll();
  });
}

function onceSocketEvent(socket, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Socket event ${eventName} timed out`));
    }, timeoutMs);
    const onEvent = payload => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(eventName, onEvent);
  });
}

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

async function connectClient(origin, { publicHost = false } = {}) {
  const socket = connectSocket(origin, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 2000,
    ...(publicHost ? { extraHeaders: { Host: 'loopback-fixture.trycloudflare.com' } } : {})
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Loopback Socket.IO connect timed out')), 2000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

async function createHarness(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ltth-tts-th-loopback-'));
  const resources = {};
  try {
    return await createHarnessAtRoot(root, options, resources);
  } catch (error) {
    try { await resources.tts?.destroy(); } catch {}
    try { await resources.talkingHeads?.destroy(); } catch {}
    resources.localSocket?.disconnect();
    resources.publicSocket?.disconnect();
    if (resources.io) {
      try { await new Promise(resolve => resources.io.close(resolve)); } catch {}
    } else if (resources.httpServer?.listening) {
      try { await new Promise(resolve => resources.httpServer.close(resolve)); } catch {}
    }
    if (resources.sqlite?.open) {
      try { resources.sqlite.close(); } catch {}
    }
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function createHarnessAtRoot(root, { avatarSetupTimeoutMs = 250 } = {}, resources) {
  const configRoot = path.join(root, 'config');
  const pluginDataRoot = path.join(root, 'plugin-data');
  const pluginSourcesRoot = path.join(root, 'plugin-sources');
  await Promise.all([
    fs.mkdir(configRoot, { recursive: true }),
    fs.mkdir(pluginDataRoot, { recursive: true }),
    fs.mkdir(pluginSourcesRoot, { recursive: true })
  ]);

  const sqlitePath = path.join(root, 'fixture.sqlite');
  const sqlite = new Database(sqlitePath);
  resources.sqlite = sqlite;
  const database = {
    db: sqlite,
    prepare: (...args) => sqlite.prepare(...args),
    exec: (...args) => sqlite.exec(...args),
    transaction: (...args) => sqlite.transaction(...args),
    getSetting: () => null
  };
  const configPathManager = {
    getUserConfigsDir: () => configRoot,
    getPluginDataDir: pluginId => path.join(pluginDataRoot, pluginId)
  };
  const logger = makeLogger();
  const app = express();
  const httpServer = http.createServer(app);
  resources.httpServer = httpServer;
  const io = new Server(httpServer, { serveClient: false });
  resources.io = io;
  io.adapter(createPublicOverlayAdapter(Adapter));
  attachPublicSocketPolicy({ io, logger });
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const address = httpServer.address();
  if (!address || address.address !== '127.0.0.1' || !Number.isInteger(address.port)) {
    throw new Error('Loopback Socket.IO server did not bind to an ephemeral 127.0.0.1 port');
  }

  const pluginLoader = new PluginLoader(
    pluginSourcesRoot,
    app,
    io,
    database,
    logger,
    configPathManager,
    null
  );
  const makeApi = (pluginId, disabledConfig = null) => {
    const api = new PluginAPI(
      pluginId,
      path.join(pluginSourcesRoot, pluginId),
      app,
      io,
      database,
      logger,
      pluginLoader,
      configPathManager
    );
    if (disabledConfig) api.getConfig = () => ({ ...disabledConfig });
    return api;
  };

  const ttsApi = makeApi('tts', {
    defaultEngine: '__loopback_fixture__',
    googleApiKey: null,
    speechifyApiKey: null,
    elevenlabsApiKey: null,
    openaiApiKey: null,
    fishaudioApiKey: null,
    siliconflowApiKey: null,
    tiktokSessionId: null,
    enableTikTokFallback: false,
    enableGoogleFallback: false,
    enableSpeechifyFallback: false,
    enableElevenlabsFallback: false,
    enableOpenAIFallback: false,
    enableFishAudioFallback: false,
    enableSiliconFlowFallback: false,
    avatarSetupTimeoutMs,
    rendererPlaybackWatchdogMs: 2000,
    rendererPlaybackMaxMs: 5000,
    playbackCompletionBufferMs: 0,
    playbackEstimateBufferMs: 0,
    duckOtherAudio: false
  });
  const talkingHeadsApi = makeApi('talking-heads');

  const tts = new TTSPlugin(ttsApi);
  const talkingHeads = new TalkingHeadsPlugin(talkingHeadsApi);
  resources.tts = tts;
  resources.talkingHeads = talkingHeads;
  tts.config.avatarSetupTimeoutMs = avatarSetupTimeoutMs;
  tts.config.rendererPlaybackWatchdogMs = 2000;
  tts.config.rendererPlaybackMaxMs = 5000;
  tts.config.playbackCompletionBufferMs = 0;
  tts.config.playbackEstimateBufferMs = 0;
  expect(Object.values(tts.engines).every(engine => engine === null)).toBe(true);
  tts._resolvePlaybackDuration = () => ({ durationMs: 40, source: 'fixture', format: 'mp3' });
  tts._registerSocketEvents();

  talkingHeads.config = {
    ...talkingHeads.config,
    enabled: true,
    rolePermission: 'all',
    firstAssignmentEnabled: true,
    avatarLotteryEnabled: true,
    lotteryAnimationDuration: 20,
    spinDurationMs: 20,
    fadeInDuration: 0,
    fadeOutDuration: 5,
    animationDuration: 40,
    spriteMode: 'asset-library',
    obsEnabled: false,
    obsHudEnabled: false,
    cacheEnabled: true,
    cacheDuration: 60000
  };
  talkingHeads.cacheManager = new CacheManager(
    talkingHeadsApi.getPluginDataDir(),
    database,
    logger,
    talkingHeads.config
  );
  await talkingHeads.cacheManager.init();
  talkingHeads.roleManager = new RoleManager(talkingHeads.config, logger);
  talkingHeads.avatarLotteryManager = new AvatarLotteryManager(database, logger);
  talkingHeads.avatarLotteryManager.init();
  talkingHeads.animationController = new AnimationController(io, logger, talkingHeads.config, null);

  const spriteSourceRoot = path.join(root, 'fixture-sprites');
  await fs.mkdir(spriteSourceRoot, { recursive: true });
  const spriteSource = path.join(spriteSourceRoot, 'layer.png');
  await fs.writeFile(spriteSource, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=',
    'base64'
  ));
  talkingHeads.assetSpriteLibrary = new AssetSpriteLibrary({
    assetRoot: spriteSourceRoot,
    dataDir: talkingHeadsApi.getPluginDataDir(),
    logger,
    generatedAssetRegistry: talkingHeads.cacheManager
  });
  talkingHeads.assetSpriteLibrary._getFrameLayers = async () => Object.fromEntries(
    FRAME_NAMES.map(frameName => [frameName, [spriteSource]])
  );
  talkingHeads._registerSocketEvents();
  talkingHeads._registerPlaybackBridge();

  pluginLoader.plugins.set('tts', {
    api: ttsApi,
    instance: tts,
    manifest: { id: 'tts' },
    loadedAt: new Date()
  });
  pluginLoader.plugins.set('talking-heads', {
    api: talkingHeadsApi,
    instance: talkingHeads,
    manifest: { id: 'talking-heads' },
    loadedAt: new Date()
  });
  io.on('connection', socket => pluginLoader.registerPluginSocketEvents(socket));

  const origin = `http://127.0.0.1:${address.port}`;
  const localSocket = await connectClient(origin);
  resources.localSocket = localSocket;
  const publicSocket = await connectClient(origin, { publicHost: true });
  resources.publicSocket = publicSocket;

  let closed = false;
  return {
    root,
    address,
    sqlite,
    sqlitePath,
    database,
    io,
    httpServer,
    pluginLoader,
    tts,
    talkingHeads,
    localSocket,
    publicSocket,
    close: async () => {
      if (closed) return;
      closed = true;
      await tts.destroy();
      await talkingHeads.destroy();
      localSocket.disconnect();
      publicSocket.disconnect();
      await waitFor(() => !localSocket.connected && !publicSocket.connected, 1000);
      await new Promise(resolve => io.close(resolve));
      sqlite.close();
      await fs.rm(root, { recursive: true, force: true });
      await expect(fs.access(root)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(httpServer.listening).toBe(false);
      return {
        clientsDisconnected: !localSocket.connected && !publicSocket.connected,
        httpServerClosed: httpServer.listening === false,
        socketIoClosed: io.engine?.clientsCount === 0,
        sqliteClosed: sqlite.open === false,
        tempRootRemoved: true
      };
    }
  };
}

function fixtureItem(id) {
  return {
    id,
    userId: 'synthetic-viewer-01',
    username: 'Synthetic Viewer',
    text: 'Fixture narration only',
    voice: 'fixture-voice',
    engine: '__loopback_fixture__',
    hasAssignedVoice: true,
    source: 'loopback-fixture',
    isStreaming: false,
    audioData: Buffer.from('synthetic-fixture-audio').toString('base64'),
    volume: 0,
    speed: 1
  };
}

async function sourceHashes() {
  const root = path.resolve(__dirname, '../..');
  const hashes = {};
  for (const relativePath of SOURCE_FILES) {
    const contents = await fs.readFile(path.join(root, relativePath));
    hashes[relativePath] = crypto.createHash('sha256').update(contents).digest('hex');
  }
  return hashes;
}

describe('TTS and Talking Heads isolated Socket.IO loopback integration', () => {
  let harness;
  const receiptCases = [];

  afterEach(async () => {
    if (harness) {
      const current = harness;
      const testName = expect.getState().currentTestName;
      const passed = current.casePassed === true;
      const cleanup = await current.close();
      receiptCases.push({
        testName,
        passed,
        bindHost: current.address.address,
        ephemeralPort: current.address.port,
        databasePathWasInsideTempRoot: current.sqlitePath.startsWith(current.root),
        outputKind: 'synthetic bytes; no browser audio element or hardware playback',
        externalProviderCalls: 0,
        tikTokCalls: 0,
        obsCalls: 0,
        quickTunnelStarted: false,
        cleanup
      });
      harness = null;
    }
  });

  afterAll(async () => {
    const receiptPath = process.env.LTTH_TTS_LOOPBACK_RECEIPT_PATH;
    if (!receiptPath) return;
    const receipt = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      result: receiptCases.length === 2 && receiptCases.every(item => item.passed &&
        item.bindHost === '127.0.0.1' &&
        item.cleanup.clientsDisconnected &&
        item.cleanup.httpServerClosed &&
        item.cleanup.socketIoClosed &&
        item.cleanup.sqliteClosed &&
        item.cleanup.tempRootRemoved) ? 'PASS' : 'FAIL_OR_INCOMPLETE',
      command: '..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand --runTestsByPath test\\talking-heads-tts-loopback-integration.test.js',
      node: process.version,
      jestMode: 'runInBand',
      server: { bindHost: '127.0.0.1', port: 0, noExternalListener: true },
      providersAndDevices: { ttsEnginesLoaded: 0, providerCalls: 0, browserAudioPlayCalls: 0, tiktokCalls: 0, obsCalls: 0, quickTunnelStarted: false },
      cases: receiptCases,
      sourceSha256: await sourceHashes()
    };
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  });

  test('completes assignment, public spin ACK, local renderer lifecycle and delayed owner release', async () => {
    harness = await createHarness();
    const {
      tts, talkingHeads, localSocket, publicSocket, database
    } = harness;
    const playbackId = 'fixture-normal-loopback';
    const localEvents = [];
    const publicEvents = [];
    const lifecycleSpy = jest.spyOn(tts, '_handleRendererLifecycle');
    const animationStartSpy = jest.spyOn(talkingHeads.animationController, 'startAnimation');
    const spinPromise = onceSocketEvent(publicSocket, 'talkingheads:avatar:spin:start');
    const preparedPromise = onceSocketEvent(localSocket, 'tts:playback:prepared');
    const playPromise = onceSocketEvent(localSocket, 'tts:play');
    const endedPromise = onceSocketEvent(localSocket, 'tts:playback:ended');

    for (const eventName of [
      'tts:play',
      'tts:playback:prepared',
      'tts:renderer:started',
      'tts:renderer:ended',
      'tts:playback:ended'
    ]) {
      publicSocket.on(eventName, payload => publicEvents.push({ eventName, payload }));
    }
    localSocket.on('tts:playback:prepared', () => localEvents.push('prepared'));
    localSocket.on('tts:play', () => localEvents.push('play'));

    const playback = tts._playAudio(fixtureItem(playbackId));
    const spin = await spinPromise;
    expect(spin).toEqual(expect.objectContaining({
      playbackId,
      userId: 'synthetic-viewer-01',
      spinId: expect.any(String),
      duration: 20
    }));
    expect(database.prepare(
      'SELECT user_id FROM talking_heads_avatar_lottery WHERE user_id = ?'
    ).get('synthetic-viewer-01')).toEqual({ user_id: 'synthetic-viewer-01' });
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM talking_heads_generated_assets WHERE owner_id = ?'
    ).get(`playback:${playbackId}`).count).toBeGreaterThan(0);
    expect(localEvents).toEqual([]);
    expect(talkingHeads.animationController.activeAnimations.has('synthetic-viewer-01')).toBe(false);

    await new Promise(resolve => setTimeout(resolve, spin.duration + 25));
    publicSocket.emit('talkingheads:avatar:spin:complete', {
      playbackId: spin.playbackId,
      userId: spin.userId,
      spinId: spin.spinId
    });
    const prepared = await preparedPromise;
    const playPayload = await playPromise;
    expect(prepared.avatarGate).toEqual({ state: 'complete', created: true });
    expect(playPayload).toEqual(expect.objectContaining({
      playbackId,
      userId: 'synthetic-viewer-01',
      audioData: fixtureItem(playbackId).audioData
    }));
    expect(localEvents).toEqual(['prepared', 'play']);
    expect(publicEvents).toEqual([]);

    localSocket.emit('tts:renderer:started', { playbackId, currentTimeMs: 0 });
    await waitFor(() => talkingHeads.animationController.activeAnimations.has('synthetic-viewer-01'));
    expect(animationStartSpy).toHaveBeenCalledTimes(1);
    expect(talkingHeads.activePlaybackByUser.get('synthetic-viewer-01')).toBe(playbackId);
    localSocket.emit('tts:renderer:ended', { playbackId, currentTimeMs: 40 });
    const terminal = await endedPromise;
    await playback;

    expect(terminal).toEqual(expect.objectContaining({
      playbackId,
      rendererAuthoritative: true,
      rendererOutcome: 'ended'
    }));
    expect(lifecycleSpy.mock.calls.map(([eventName]) => eventName)).toEqual([
      'tts:renderer:started',
      'tts:renderer:ended'
    ]);
    expect(talkingHeads.activePlaybackByUser.has('synthetic-viewer-01')).toBe(false);
    expect(talkingHeads.generatedAssetCleanupTimers.size).toBeGreaterThan(0);
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM talking_heads_generated_assets WHERE owner_id = ?'
    ).get(`playback:${playbackId}`).count).toBeGreaterThan(0);
    expect(isIncomingSocketEventAllowed('tts:renderer:started')).toBe(false);

    const authorizedCallCount = lifecycleSpy.mock.calls.length;
    publicSocket.emit('tts:renderer:started', { playbackId: 'public-forgery' });
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(lifecycleSpy).toHaveBeenCalledTimes(authorizedCallCount);
    expect(publicEvents).toEqual([]);

    await waitFor(() => database.prepare(
      'SELECT COUNT(*) AS count FROM talking_heads_generated_assets WHERE owner_id = ?'
    ).get(`playback:${playbackId}`).count === 0, 1800);
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM talking_heads_generated_assets WHERE owner_id = ?'
    ).get(`playback:${playbackId}`).count).toBe(0);
    harness.casePassed = true;
  }, 10000);

  test('aborts delayed fixture sprite loading without a late spin, audio dispatch or owner revival', async () => {
    harness = await createHarness({ avatarSetupTimeoutMs: 30 });
    const {
      tts, talkingHeads, localSocket, publicSocket, database
    } = harness;
    const playbackId = 'fixture-aborted-loopback';
    const layers = deferred();
    let layerRequests = 0;
    talkingHeads.assetSpriteLibrary._getFrameLayers = () => {
      layerRequests += 1;
      return layers.promise;
    };
    const originalPrepare = talkingHeads.prepareAvatarForPlayback.bind(talkingHeads);
    let originalPreparation;
    talkingHeads.prepareAvatarForPlayback = (meta, options) => {
      originalPreparation = originalPrepare(meta, options);
      return originalPreparation;
    };

    const spinEvents = [];
    const publicTtsEvents = [];
    const localPlayEvents = [];
    const publicEventNames = [
      'talkingheads:avatar:spin:start',
      'tts:play',
      'tts:playback:prepared',
      'tts:renderer:failed',
      'tts:playback:ended'
    ];
    publicEventNames.forEach(eventName => publicSocket.on(eventName, payload => {
      if (eventName === 'talkingheads:avatar:spin:start') spinEvents.push(payload);
      else publicTtsEvents.push({ eventName, payload });
    }));
    localSocket.on('tts:play', payload => localPlayEvents.push(payload));
    const failedPromise = onceSocketEvent(localSocket, 'tts:renderer:failed');

    const playback = tts._playAudio(fixtureItem(playbackId));
    await waitFor(() => layerRequests === 4);
    const failure = await failedPromise;
    await playback;
    expect(failure).toEqual(expect.objectContaining({
      playbackId,
      reason: 'avatar-setup-timeout'
    }));
    expect(localPlayEvents).toEqual([]);
    expect(spinEvents).toEqual([]);
    expect(publicTtsEvents).toEqual([]);
    expect(database.prepare(
      'SELECT user_id FROM talking_heads_avatar_lottery WHERE user_id = ?'
    ).get('synthetic-viewer-01')).toEqual({ user_id: 'synthetic-viewer-01' });
    expect(talkingHeads.initialAvatarPlaybackReservations.size).toBe(0);
    expect(talkingHeads.initialAvatarPreparations.size).toBe(0);
    expect(talkingHeads.pendingAvatarSpins.size).toBe(0);

    layers.resolve(Object.fromEntries(FRAME_NAMES.map(frameName => [frameName, []])));
    await expect(originalPreparation).resolves.toEqual(expect.objectContaining({
      created: true,
      spinStatus: 'aborted'
    }));
    await talkingHeads.cacheManager.generatedAssetLock;

    expect(spinEvents).toEqual([]);
    expect(localPlayEvents).toEqual([]);
    expect(database.prepare(
      'SELECT owner_id FROM talking_heads_generated_assets ORDER BY owner_id'
    ).all()).toEqual([]);
    const generatedFiles = await fs.readdir(talkingHeads.cacheManager.cacheDir);
    expect(generatedFiles).toEqual([]);
    harness.casePassed = true;
  }, 10000);
});
