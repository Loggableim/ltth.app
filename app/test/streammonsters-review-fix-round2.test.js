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
const eggStageView = require('../plugins/streamalchemy/streammonsters-egg-stage-view');
const arenaDirector = require('../plugins/streamalchemy/streammonsters-arena-director');
const effectsRenderer = require('../plugins/streamalchemy/streammonsters-effects-renderer');

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
  engine.hatchEgg('viewer-a', 1);
  return {
    giftEvents: emitted.filter(entry => (
      entry.event === 'streammonsters:egg_spawned' ||
      entry.event === 'streammonsters:egg_landed'
    )),
    spawned: emitted.find(entry => entry.event === 'streammonsters:egg_spawned').payload,
    landed: emitted.find(entry => entry.event === 'streammonsters:egg_landed').payload,
    ready: emitted.find(entry => entry.event === 'streammonsters:egg_ready').payload,
    hatchStarted: emitted.find(entry => entry.event === 'streammonsters:hatch_started').payload,
    hatched: emitted.find(entry => entry.event === 'streammonsters:egg_hatched').payload,
    stageRemoved: emitted.find(entry => entry.event === 'streammonsters:egg_stage_removed')?.payload,
    earlyHatch
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

async function createLiveOverlay(snapshot) {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'),
    'utf8'
  );
  const localePayloads = Object.fromEntries(['de', 'en', 'es', 'fr'].map(locale => [
    locale,
    JSON.parse(fs.readFileSync(
      path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'locales',
        `${locale}.json`
      ),
      'utf8'
    ))
  ]));
  const translations = localePayloads.en.plugins.streamalchemy.ui.monsters;
  const socketHandlers = new Map();
  const chatWaitResolvers = [];
  const eggStageTimers = new Map();
  const playedEffects = [];
  let nextEggStageTimerId = 1;
  let currentSnapshot = snapshot;
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
      window.fetch = jest.fn(async input => {
        const localeMatch = String(input || '').match(
          /\/plugins\/streamalchemy\/locales\/(de|en|es|fr)\.json(?:\?|$)/
        );
        if (localeMatch) {
          return {
            ok: true,
            json: async () => localePayloads[localeMatch[1]]
          };
        }
        if (fetchFailure) throw fetchFailure;
        return {
          ok: true,
          json: async () => currentSnapshot
        };
      });
      window.StreamMonstersOverlayRuntime = overlayRuntime;
      window.StreamMonstersEggStageView = {
        ...eggStageView,
        createEggStageView: options => eggStageView.createEggStageView({
          ...options,
          setTimeout: (callback, milliseconds) => {
            const timerId = nextEggStageTimerId;
            nextEggStageTimerId += 1;
            eggStageTimers.set(timerId, { callback, milliseconds });
            return timerId;
          },
          clearTimeout: timerId => eggStageTimers.delete(timerId)
        })
      };
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
          play: async (scene, payload) => {
            playedEffects.push({ scene, payload });
          }
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
    playedEffects,
    hint: () => dom.window.document.getElementById('hint'),
    chat: () => dom.window.document.getElementById('chat-card'),
    detail: () => dom.window.document.getElementById('chat-detail'),
    close: () => closeDom(dom),
    async releaseChat() {
      for (const resolve of chatWaitResolvers.splice(0)) resolve();
      await flush();
      await flush();
    },
    async settleEggAnimations() {
      const pending = [...eggStageTimers.values()];
      eggStageTimers.clear();
      pending.forEach(timer => timer.callback());
      await flush();
      await flush();
    },
    failFetch(error = new Error('state unavailable')) {
      fetchFailure = error;
    },
    setSnapshot(nextSnapshot) {
      currentSnapshot = nextSnapshot;
    },
    hasSocketHandler(event) {
      return socketHandlers.has(event);
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
    expect(overlay.hint().textContent).toContain('/eier');
    expect(overlay.hint().textContent).toContain('/schlupf [slot]');
    expect(overlay.hint().textContent).toContain('2 Minuten');

    expect(events.earlyHatch.hint).toBe('/eier');
    await overlay.emit('streammonsters:chat_result', {
      userId: 'viewer-a-secret',
      displayName: 'Public Hatcher',
      result: {
        ...events.earlyHatch,
        messageKey: 'chatResultEggNotReady'
      }
    });
    expect(overlay.detail().dataset.placement).toBe('upper-third');
    expect(overlay.detail().dataset.kind).toBe('egg-wait');
    expect(overlay.detail().textContent).toContain('Public Hatcher');
    expect(overlay.detail().textContent).toContain('Das Ei brütet noch');
    expect(overlay.detail().textContent).toContain('Bereit in 00:01');
    expect(overlay.detail().textContent).not.toContain('viewer-a-secret');
    expect(overlay.chat().textContent).toBe('');
    await overlay.releaseChat();

    await overlay.emit('streammonsters:egg_ready', events.ready);
    expect(overlay.hint().textContent).toContain('/schlupf');
    expect(overlay.hint().textContent).not.toContain('/hatch');

    overlay.close();
    await gcce.destroy();
  });

  test('updates and clears the connected shelf through ready and hatch socket events', async () => {
    const { gcce, plugin } = await createCollisionRuntime();
    const events = createEggEvents(plugin);
    const overlay = await createLiveOverlay({
      hype: { points: 0 },
      config: {
        hatchDurationMs: 120_000,
        commandAliases: plugin.config.streamMonsters.commandAliases
      },
      gcce: plugin.getStreamMonstersGCCEState(),
      eggStage: []
    });
    const shelfItem = visualId => overlay.dom.window.document.querySelector(
      `[data-egg-id="${visualId}"]`
    );
    const timing = visualId => shelfItem(visualId)?.querySelector(
      '[data-egg-timing]'
    )?.textContent;
    const visualId = events.landed.eggStage.visualId;
    const neighbour = {
      ...events.landed,
      eventId: 'neighbour-landed',
      correlationId: 'neighbour',
      eggStage: {
        ...events.landed.eggStage,
        visualId: 'egg-neighbour-stays',
        element: 'Tide'
      }
    };

    await overlay.emit('streammonsters:egg_landed', events.landed);
    await overlay.emit('streammonsters:egg_landed', neighbour);
    expect(shelfItem(visualId)).not.toBeNull();
    expect(shelfItem('egg-neighbour-stays')).not.toBeNull();

    await overlay.emit('streammonsters:egg_ready', events.ready);
    expect(timing(visualId)).toBe('Bereit · /schlupf');

    await overlay.emit('streammonsters:hatch_started', events.hatchStarted);
    await overlay.emit('streammonsters:egg_hatched', events.hatched);
    expect(events.stageRemoved).toEqual(expect.objectContaining({
      eggStage: expect.objectContaining({ visualId })
    }));
    await overlay.emit('streammonsters:egg_stage_removed', events.stageRemoved);
    expect(shelfItem(visualId)).toBeNull();
    expect(shelfItem('egg-neighbour-stays')).not.toBeNull();

    overlay.close();
    await gcce.destroy();
  });

  test('uses exactly one spatial flight and landing for a complete gift transaction', async () => {
    const { gcce, plugin } = await createCollisionRuntime();
    const events = createEggEvents(plugin);
    const timeline = arenaDirector.buildArcadeTimeline('egg_spawned', events.spawned);
    const overlay = await createLiveOverlay({
      hype: { points: 0 },
      config: { hatchDurationMs: 120_000 },
      gcce: plugin.getStreamMonstersGCCEState(),
      eggStage: []
    });
    const spatialSteps = new Set(['egg-fly-in', 'spring-landing']);

    await overlay.emit('streammonsters:egg_spawned', events.spawned);
    await overlay.emit('streammonsters:egg_landed', events.landed);

    const directorSpatialBeats = timeline.beats.filter(beat => (
      beat.type === 'egg_flight' || beat.type === 'egg_impact'
    ));
    const effectInputs = [
      ...timeline.beats
        .filter(beat => beat.effect?.scene)
        .map(beat => ({ scene: beat.effect.scene, payload: beat.effect })),
      ...overlay.playedEffects
    ];
    const spatialEffectScenes = effectInputs.filter(input => (
      effectsRenderer.sceneChoreography(input.scene, input.payload).steps
        .some(step => spatialSteps.has(step))
    ));
    const shelfLandingCount = overlay.dom.window.document
      .querySelectorAll('.egg-shelf-item.landing').length;

    expect(events.giftEvents.map(entry => entry.event)).toEqual([
      'streammonsters:egg_spawned',
      'streammonsters:egg_landed'
    ]);
    expect(timeline.beats.filter(beat => beat.effect?.scene).map(beat => (
      effectsRenderer.sceneChoreography(beat.effect.scene, beat.effect).steps
    ))).toEqual([['element-portal', 'particle-swirl']]);
    expect({
      directorSpatialBeats: directorSpatialBeats.length,
      spatialEffectScenes: spatialEffectScenes.length,
      shelfLandingCount,
      totalSpatialChoreographies:
        directorSpatialBeats.length + spatialEffectScenes.length + shelfLandingCount
    }).toEqual({
      directorSpatialBeats: 0,
      spatialEffectScenes: 0,
      shelfLandingCount: 1,
      totalSpatialChoreographies: 1
    });

    await overlay.settleEggAnimations();
    const effectCountBeforeReconnect = overlay.playedEffects.length;
    overlay.setSnapshot({
      hype: { points: 0 },
      config: { hatchDurationMs: 120_000 },
      gcce: plugin.getStreamMonstersGCCEState(),
      eggStage: [events.landed.eggStage]
    });
    await overlay.reconnect();

    expect(overlay.playedEffects).toHaveLength(effectCountBeforeReconnect);
    expect(overlay.dom.window.document.querySelector(
      `[data-egg-id="${events.landed.eggStage.visualId}"]`
    ).classList.contains('landing')).toBe(false);

    overlay.close();
    await gcce.destroy();
  });

  test('applies promotion and boost stage refreshes through live socket handlers', async () => {
    const readyAtMs = Date.now() + 120_000;
    const queued = {
      visualId: 'egg-live-refresh',
      provenance: 'gift',
      state: 'queued',
      element: 'Ember',
      variant: 'standard',
      timing: { landedAtMs: Date.now(), readyAtMs: null },
      queuePosition: 1,
      adoptionStatus: 'owned',
      adoptable: false
    };
    const overlay = await createLiveOverlay({
      hype: { points: 0 },
      config: { hatchDurationMs: 120_000 },
      eggStage: [queued]
    });
    const timing = () => overlay.dom.window.document.querySelector(
      '[data-egg-id="egg-live-refresh"] [data-egg-timing]'
    )?.textContent;

    expect(timing()).toBe('Warteschlange #1');
    expect(overlay.hasSocketHandler('streammonsters:egg_stage_updated')).toBe(true);
    expect(overlay.hasSocketHandler('streammonsters:egg_boosted')).toBe(true);

    await overlay.emit('streammonsters:egg_stage_updated', {
      eggStage: {
        ...queued,
        state: 'incubating',
        timing: { ...queued.timing, readyAtMs },
        queuePosition: null
      }
    });
    expect(timing()).toMatch(/^Schlüpft in 0[12]:\d{2}$/);

    await overlay.emit('streammonsters:egg_boosted', {
      eggStage: {
        ...queued,
        state: 'incubating',
        timing: { ...queued.timing, readyAtMs: Date.now() + 30_000 },
        queuePosition: null
      }
    });
    expect(timing()).toMatch(/^Schlüpft in 00:30$/);
    overlay.close();
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
