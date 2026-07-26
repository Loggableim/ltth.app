const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Database = require('better-sqlite3');
const GCCE = require('../plugins/gcce');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const overlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');
const chatViewRuntime = require('../plugins/streamalchemy/streammonsters-chat-view');

const activeDoms = new Set();
const activeGcceInstances = new Set();

function closeDom(dom) {
  if (!dom) return;
  activeDoms.delete(dom);
  try {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  } catch (_) {}
  try {
    dom.window.close();
  } catch (_) {}
}

afterEach(async () => {
  for (const dom of [...activeDoms]) closeDom(dom);
  for (const gcce of [...activeGcceInstances]) {
    try {
      await gcce.destroy();
    } catch (_) {}
  }
});

function createGCCEApi() {
  const configStore = {};
  return {
    pluginDir: path.join(process.cwd(), 'plugins', 'gcce'),
    emitted: [],
    log: jest.fn(),
    getConfig: key => configStore[key] || null,
    setConfig: (key, value) => { configStore[key] = value; },
    registerTikTokEvent: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerFlowAction: jest.fn(),
    registerIFTTTAction: jest.fn(),
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    on: jest.fn().mockReturnValue(true),
    getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
    getSocketIO() {
      return { emit: (event, payload) => this.emitted.push({ event, payload }) };
    },
    getPluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-review-round2'),
    ensurePluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-review-round2'),
    pluginLoader: { loadedPlugins: new Map() }
  };
}

async function createCollisionRuntime() {
  const gcce = new GCCE(createGCCEApi());
  const destroy = gcce.destroy.bind(gcce);
  gcce.destroy = async () => {
    activeGcceInstances.delete(gcce);
    return destroy();
  };
  activeGcceInstances.add(gcce);
  await gcce.init();
  gcce.parser.commandPrefix = '/';
  gcce.pluginConfig.commandPrefix = '/';
  gcce.registerCommandsForPlugin('milestone-leaderboard', [{
    name: 'rank',
    description: 'Viewer XP rank',
    permission: 'all',
    handler: () => ({ success: true })
  }]);

  const plugin = new StreamAlchemyPlugin({
    pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
    log: jest.fn()
  });
  plugin.config = {
    enabled: true,
    streamMonsters: {
      enabled: true,
      commandAliases: plugin.normalizeCommandAliases({
        hatch: { enabled: ['schlupf'], disabled: ['hatch'] },
        inventory: { enabled: ['sammlung'], disabled: ['inventory'] },
        battle: { enabled: ['kampf'], disabled: ['battle'] }
      })
    }
  };
  plugin.streamMonstersCommandPrefix = '!';
  plugin.streamMonstersGCCERegistrationState = 'fallback';
  plugin.streamMonstersGCCERegistrationError = null;
  plugin.streamMonstersGCCERegistrationConflicts = [];
  plugin.streamMonstersGCCERegisteredCommands = [];
  plugin.streamMonstersGCCEUnavailableCommands = [];
  plugin.streamMonstersCommandIngress = {
    setCommands: jest.fn(),
    executeCommand: jest.fn().mockResolvedValue({ success: true })
  };
  plugin.resolveStreamMonstersViewerId = jest.fn().mockReturnValue('viewer-a');
  plugin.integrateStreamMonstersGCCE({ candidate: gcce });
  return { gcce, plugin };
}

function createEggEvents(plugin) {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  store.upsertGiftMapping({
    giftId: 77,
    giftName: 'Team Heart',
    coinValue: 1,
    effect: 'spawn',
    element: 'Random',
    enabled: true
  });
  let now = 1_000;
  const emitted = [];
  const engine = new StreamMonstersEngine({
    store,
    now: () => now,
    emit: (event, payload) => emitted.push({ event, payload }),
    getCommandReference: command => plugin.getStreamMonstersCommandReference(command),
    config: { hatchDurationMs: 100 }
  });
  engine.processGift({
    userId: 'viewer-a',
    giftId: 77,
    giftName: 'Team Heart',
    eventKey: 'overlay-guidance'
  });
  const commands = new ChatCommands({
    store,
    engine,
    battleService: {},
    getCommandReference: command => plugin.getStreamMonstersCommandReference(command)
  });
  const earlyHatch = commands.hatch('viewer-a', 1);
  now = 1_100;
  engine.markReadyEggs();
  return {
    spawned: emitted.find(entry => entry.event === 'streammonsters:egg_spawned').payload,
    ready: emitted.find(entry => entry.event === 'streammonsters:egg_ready').payload,
    earlyHatch
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

async function createLiveOverlay(snapshot) {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'),
    'utf8'
  );
  const translations = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', 'en.json'),
    'utf8'
  )).plugins.streamalchemy.ui.monsters;
  const socketHandlers = new Map();
  const chatWaitResolvers = [];
  let fetchFailure = null;
  const interpolate = (template, params = {}) => String(template).replace(
    /\{(\w+)\}/g,
    (match, key) => Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
  );
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/streammonsters/overlay',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.i18n = {
        init: async () => {},
        updateDOM: () => {},
        t: (key, params) => {
          const name = key.split('.').pop();
          return Object.prototype.hasOwnProperty.call(translations, name)
            ? interpolate(translations[name], params)
            : key;
        }
      };
      window.io = () => ({
        on: (event, handler) => socketHandlers.set(event, handler)
      });
      window.fetch = jest.fn(async () => {
        if (fetchFailure) throw fetchFailure;
        return {
          ok: true,
          json: async () => snapshot
        };
      });
      window.StreamMonstersOverlayRuntime = overlayRuntime;
      window.StreamMonstersChatView = {
        ...chatViewRuntime,
        createChatView: options => chatViewRuntime.createChatView({
          ...options,
          wait: () => new Promise(resolve => chatWaitResolvers.push(resolve))
        })
      };
      window.StreamMonstersEffectsRenderer = {
        createEffectsRenderer: () => ({
          init: () => {},
          resize: () => {},
          play: async () => {}
        })
      };
      window.StreamMonstersAudioCues = {};
      window.setTimeout = callback => {
        Promise.resolve().then(callback);
        return 1;
      };
      window.clearTimeout = () => {};
    }
  });
  activeDoms.add(dom);
  await flush();
  await flush();
  await socketHandlers.get('connect')();
  await flush();
  await flush();
  return {
    dom,
    hint: () => dom.window.document.getElementById('hint'),
    chat: () => dom.window.document.getElementById('chat-card'),
    detail: () => dom.window.document.getElementById('chat-detail'),
    close: () => closeDom(dom),
    async releaseChat() {
      for (const resolve of chatWaitResolvers.splice(0)) resolve();
      await flush();
      await flush();
    },
    failFetch(error = new Error('state unavailable')) {
      fetchFailure = error;
    },
    async reconnect() {
      await socketHandlers.get('connect')();
      await flush();
      await flush();
    },
    async emit(event, payload) {
      socketHandlers.get(event)(payload);
      await flush();
      await flush();
    }
  };
}

describe('Stream Monsters review fix round 2 guidance', () => {
  test('resolves a real GCCE collision to the first successfully registered alias', async () => {
    const { gcce, plugin } = await createCollisionRuntime();

    expect(plugin.getStreamMonstersCommandReference('rank')).toBe('/monsterrank');
    expect(gcce.registry.getCommand('rank').pluginId).toBe('milestone-leaderboard');
    expect(gcce.registry.getCommand('monsterrank').pluginId).toBe('streamalchemy');

    await gcce.destroy();
  });

  test('renders effective state and event guidance through the live overlay path', async () => {
    const { gcce, plugin } = await createCollisionRuntime();
    const events = createEggEvents(plugin);
    const overlay = await createLiveOverlay({
      hype: { points: 0 },
      config: {
        hatchDurationMs: 120_000,
        commandAliases: plugin.config.streamMonsters.commandAliases
      },
      gcce: plugin.getStreamMonstersGCCEState()
    });

    expect(overlay.hint().textContent).toContain('/eier');
    expect(overlay.hint().textContent).toContain('/schlupf [slot]');
    expect(overlay.hint().textContent).not.toContain('/eggs');

    await overlay.emit('streammonsters:egg_spawned', events.spawned);
    expect(overlay.hint().textContent).toBe('/sammlung');

    expect(events.earlyHatch.hint).toBe('/eier');
    await overlay.emit('streammonsters:chat_result', {
      userId: 'viewer-a-secret',
      displayName: 'Public Hatcher',
      result: {
        ...events.earlyHatch,
        messageKey: 'chatResultEggNotReady'
      }
    });
    expect(overlay.detail().dataset.placement).toBe('upper');
    expect(overlay.detail().dataset.kind).toBe('egg-wait');
    expect(overlay.detail().textContent).toContain('Public Hatcher');
    expect(overlay.detail().textContent).toContain('The egg is still incubating');
    expect(overlay.detail().textContent).toContain('Ready in 00:01');
    expect(overlay.detail().textContent).not.toContain('viewer-a-secret');
    expect(overlay.chat().textContent).toBe('');
    await overlay.releaseChat();

    await overlay.emit('streammonsters:egg_ready', events.ready);
    expect(overlay.hint().textContent).toBe('/schlupf [slot]');
    expect(overlay.hint().textContent).not.toContain('/hatch');

    overlay.close();
    await gcce.destroy();
  });

  test('uses effective alias fallback when an event hint is absent and never injects hint HTML', async () => {
    const { gcce, plugin } = await createCollisionRuntime();
    const events = createEggEvents(plugin);
    const overlay = await createLiveOverlay({
      hype: { points: 0 },
      config: {
        hatchDurationMs: 120_000,
        commandAliases: plugin.config.streamMonsters.commandAliases
      },
      gcce: plugin.getStreamMonstersGCCEState()
    });
    const withoutHint = { ...events.spawned };
    delete withoutHint.hint;

    await overlay.emit('streammonsters:egg_spawned', withoutHint);
    expect(overlay.hint().textContent).toContain('/eier');
    expect(overlay.hint().textContent).not.toContain('/eggs');

    await overlay.emit('streammonsters:egg_ready', {
      ...events.ready,
      hint: '<img src=x onerror=\"window.overlayPwned=true\"> /schlupf [slot]'
    });
    expect(overlay.hint().querySelector('img')).toBeNull();
    expect(overlay.dom.window.overlayPwned).toBeUndefined();

    overlay.close();
    await gcce.destroy();
  });

  test('renders safe enabled defaults with the known prefix when reconnect state fetch fails', async () => {
    const overlay = await createLiveOverlay({
      hype: { points: 0 },
      gcce: { commandPrefix: '/' },
      config: { hatchDurationMs: 120_000 }
    });

    overlay.failFetch();
    await overlay.reconnect();

    expect(overlay.hint().textContent).toContain('/eier');
    expect(overlay.hint().textContent).toContain('/hatch [slot]');
    expect(overlay.hint().textContent).not.toContain('/eggs');

    overlay.close();
  });
});
