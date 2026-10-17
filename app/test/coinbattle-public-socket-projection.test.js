'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CoinBattleEngine = require('../plugins/coinbattle/engine/game-engine');
const CoinBattlePlugin = require('../plugins/coinbattle/main');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');
const { OUTGOING_SOCKET_EVENTS } = require('../modules/public-overlay-registry');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.broadcastCalls = [];
  }

  broadcast(packet, options) {
    this.broadcastCalls.push({ packet, options });
  }
}

function createOverlayConsumer() {
  const htmlPath = path.join(__dirname, '../plugins/coinbattle/overlay/overlay.html');
  const scriptPath = path.join(__dirname, '../plugins/coinbattle/overlay/overlay.js');
  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8').replace(/<script[^>]*><\/script>/gi, ''), {
    runScripts: 'outside-only',
    url: 'http://localhost/plugins/coinbattle/overlay?showAvatars=false'
  });
  const handlers = new Map();
  const socket = {
    on(event, handler) { handlers.set(event, handler); return this; },
    off() { return this; },
    emit() { return this; },
    disconnect() {}
  };

  dom.window.io = () => socket;
  dom.window.setInterval = callback => { callback(); return 1; };
  dom.window.clearInterval = () => {};
  dom.window.setTimeout = () => 1;
  dom.window.clearTimeout = () => {};
  dom.window.requestAnimationFrame = callback => callback();
  dom.window.cancelAnimationFrame = () => {};
  dom.window.eval(fs.readFileSync(scriptPath, 'utf8'));
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return { dom, handlers };
}

function createPluginRouteHarness({ io, getConfig = () => ({}), setConfig = () => {} }) {
  const routes = new Map();
  const api = {
    getSocketIO: () => ({}),
    registerRoute: (method, route, handler) => routes.set(`${method} ${route}`, handler),
    getConfig,
    setConfig,
    log() {}
  };
  const plugin = new CoinBattlePlugin(api);
  plugin.io = io;
  plugin.engine = { loadConfig: jest.fn() };
  plugin.teamNamesManager = { setTeamName: jest.fn(() => ({ success: true })) };
  plugin.registerRoutes();
  return { plugin, routes };
}

describe('CoinBattle public Socket projection', () => {
  let engine;
  let adapter;
  let db;
  let handlers;
  let dom;

  beforeEach(() => {
    const leaderboardRow = {
      id: 91,
      match_id: 71,
      player_id: 81,
      user_id: 'platform-user-secret',
      nickname: 'Fixture Viewer',
      unique_id: 'fixture_viewer',
      profile_picture_url: 'https://example.test/avatar.png',
      badges: '["supporter"]',
      team: 'red',
      coins: 123,
      gifts: 4,
      rank: 1
    };
    db = {
      createMatch: jest.fn(() => 71),
      getMatchLeaderboard: jest.fn(() => [leaderboardRow]),
      getTeamScores: jest.fn(() => ({ red: 123, blue: 4 })),
      getRawDb: () => ({ prepare: () => ({ get: () => null }) }),
      cleanupEventCache: jest.fn(),
      isEventProcessed: jest.fn(() => false),
      getOrCreatePlayer: jest.fn(() => ({ id: 81 })),
      addMatchParticipant: jest.fn(),
      recordGiftEvent: jest.fn(() => true),
      recordMultiplierEvent: jest.fn(),
      endMatch: jest.fn(),
      updatePlayerLifetimeStats: jest.fn(),
      checkAndAwardBadges: jest.fn(() => []),
      updateMatchStats: jest.fn(),
      markEventProcessed: jest.fn()
    };
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    adapter = new Adapter({ name: '/' });
    engine = new CoinBattleEngine(db, {
      emit: (event, payload) => adapter.broadcast(
        { data: [event, payload] },
        { rooms: new Set(), except: new Set() }
      )
    }, { info() {}, warn() {}, error() {}, debug() {} });
    engine.stateAugmenter = state => ({
      ...state,
      teamNames: {
        red: { name: 'Fixture Red', imageUrl: null },
        blue: { name: 'Fixture Blue', imageUrl: null }
      }
    });
    engine.startMatch('team', 300);
    engine.stopTimer();
    engine.config.autoReset = false;
    ({ dom, handlers } = createOverlayConsumer());
  });

  afterEach(() => {
    dom?.window.close();
    engine?.destroy();
  });

  test('has an explicit projection for every CoinBattle event in the public registry', () => {
    const fixtures = {
      'coinbattle:badges-awarded': { badges: [] },
      'coinbattle:config-updated': {},
      'coinbattle:gift-received': {},
      'coinbattle:leaderboard-update': { mode: 'solo', leaderboard: [] },
      'coinbattle:match-ended': { mode: 'solo', winner: {}, leaderboard: [] },
      'coinbattle:match-state': { active: false, match: null, leaderboard: [], teamScores: null },
      'coinbattle:multiplier-activated': { multiplier: 2, duration: 30 },
      'coinbattle:multiplier-ended': { matchId: 1 },
      'coinbattle:post-match': { config: {}, winnersWithXP: [], leaderboard: [] },
      'coinbattle:team-names-updated': { team: 'red', name: 'Red' },
      'coinbattle:timer-update': { elapsed: 0, remaining: 300, total: 300 }
    };
    const registered = [...OUTGOING_SOCKET_EVENTS].filter(event => event.startsWith('coinbattle:')).sort();
    expect(registered).toEqual(Object.keys(fixtures).sort());
    for (const event of registered) {
      expect(projectPublicOverlayPayload(event, fixtures[event])).not.toBeNull();
      expect(projectPublicOverlayPayload(event, fixtures[event])).not.toBeUndefined();
    }
  });

  test('projects the real engine state for the original renderer and keeps full local payload', () => {
    const call = adapter.broadcastCalls.find(({ packet }) => packet.data[0] === 'coinbattle:match-state');
    expect(call).toBeDefined();
    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:match-state' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:match-state' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));

    expect(local.packet.data[1].config).toBe(engine.config);
    expect(local.packet.data[1].match.id).toBe(71);
    const projected = publicCall.packet.data[1];
    expect(projected).toMatchObject({
      active: true,
      match: { mode: 'team', duration: 300, isPaused: false },
      leaderboard: [{ unique_id: 'fixture_viewer', nickname: 'Fixture Viewer', coins: 123, team: 'red' }],
      teamScores: { red: 123, blue: 4 },
      teamNames: { red: { name: 'Fixture Red' }, blue: { name: 'Fixture Blue' } }
    });
    expect(projected.match).not.toHaveProperty('id');
    expect(projected).not.toHaveProperty('config');
    expect(projected.leaderboard[0]).not.toHaveProperty('id');
    expect(projected.leaderboard[0]).not.toHaveProperty('match_id');
    expect(projected.leaderboard[0].user_id).toBe('fixture_viewer');
    expect(JSON.stringify(projected)).not.toContain('platform-user-secret');

    handlers.get('coinbattle:match-state')(projected);
    expect(dom.window.document.querySelector('.entry-name')?.textContent).toBe('Fixture Viewer');
    expect(dom.window.document.querySelector('.entry-coins')?.textContent).toContain('123');
    expect(dom.window.document.getElementById('team-red-name').textContent).toBe('Fixture Red');
    expect(dom.window.document.getElementById('team-blue-name').textContent).toBe('Fixture Blue');
    expect(dom.window.document.querySelector('.team-score.team-red').classList.contains('leading')).toBe(true);
  });

  test('projects actual gift producer events to the original gift animation contract', () => {
    engine.processGift(
      { giftId: 44, giftName: 'Rose', diamondCount: 1, coins: 1, repeatCount: 1, privateGiftField: 'secret' },
      { userId: 'platform-user-secret', uniqueId: 'fixture_viewer', nickname: 'Fixture Viewer', profilePictureUrl: 'https://example.test/avatar.png' },
      'internal-event-secret'
    );

    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:gift-received' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:gift-received' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(local.packet.data[1]).toMatchObject({
      eventId: 'internal-event-secret',
      player: { userId: 'platform-user-secret' },
      gift: { privateGiftField: 'secret' }
    });
    expect(publicCall.packet.data[1]).toEqual({});

    handlers.get('coinbattle:gift-received')(publicCall.packet.data[1]);
    expect(dom.window.document.querySelectorAll('#gift-animations .gift-particle')).toHaveLength(1);
  });

  test('projects engine leaderboard updates for team and solo renderer contracts', () => {
    const pluginSocketHandlers = {};
    const plugin = new CoinBattlePlugin({
      getSocketIO: () => ({}),
      registerSocket: (event, handler) => { pluginSocketHandlers[event] = handler; },
      log() {}
    });
    plugin.engine = engine;
    plugin.registerSocketEvents();

    for (const mode of ['team', 'solo']) {
      engine.currentMatch.mode = mode;
      adapter.broadcastCalls.length = 0;
      pluginSocketHandlers['coinbattle:get-leaderboard']();

      const local = adapter.broadcastCalls.find(({ packet, options }) => (
        packet.data[0] === 'coinbattle:leaderboard-update' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
      ));
      const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
        packet.data[0] === 'coinbattle:leaderboard-update' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
      ));
      expect(local.packet.data[1]).toMatchObject({ matchId: 71, mode });
      expect(local.packet.data[1].leaderboard[0].user_id).toBe('platform-user-secret');
      expect(publicCall.packet.data[1]).toEqual({
        mode,
        leaderboard: [{
          user_id: 'fixture_viewer',
          unique_id: 'fixture_viewer',
          nickname: 'Fixture Viewer',
          coins: 123,
          profile_picture_url: 'https://example.test/avatar.png',
          team: 'red',
          badges: ['supporter']
        }]
      });
      expect(publicCall.packet.data[1]).not.toHaveProperty('matchId');
      expect(JSON.stringify(publicCall.packet.data[1])).not.toContain('platform-user-secret');

      handlers.get('coinbattle:leaderboard-update')(publicCall.packet.data[1]);
      const row = dom.window.document.querySelector('.leaderboard-entry');
      expect(row.querySelector('.entry-name').textContent).toBe('Fixture Viewer');
      expect(row.querySelector('.entry-coins').textContent).toBe('123');
      expect(Boolean(row.querySelector('.entry-team'))).toBe(mode === 'team');
    }
  });

  test('withholds malformed leaderboard projections publicly and preserves local payload', () => {
    adapter.broadcastCalls.length = 0;
    const payload = {
      matchId: 71,
      mode: 'team',
      teamScores: { red: 123, blue: 4 },
      leaderboard: [{
        id: 91,
        match_id: 71,
        player_id: 81,
        user_id: 'platform-user-secret',
        unique_id: 'fixture_viewer',
        nickname: 'Fixture Viewer',
        coins: 'not-an-integer',
        team: 'green'
      }]
    };

    adapter.broadcast({ data: ['coinbattle:leaderboard-update', payload] }, { rooms: new Set(), except: new Set() });

    expect(adapter.broadcastCalls).toHaveLength(1);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect(adapter.broadcastCalls[0].options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
  });

  test('projects multiplier activation/expiry to the original display fields only', () => {
    engine.activateMultiplier(2, 30, 'platform-user-secret');

    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:multiplier-activated' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:multiplier-activated' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(local.packet.data[1]).toMatchObject({ matchId: 71, multiplier: 2, duration: 30, activatedBy: 'platform-user-secret' });
    expect(publicCall.packet.data[1]).toMatchObject({ multiplier: 2, duration: 30 });
    expect(publicCall.packet.data[1]).not.toHaveProperty('matchId');
    expect(publicCall.packet.data[1]).not.toHaveProperty('activatedBy');

    handlers.get('coinbattle:multiplier-activated')(publicCall.packet.data[1]);
    expect(dom.window.document.getElementById('multiplier-value').textContent).toBe('2x');
    expect(dom.window.document.getElementById('multiplier-container').style.display).toBe('block');

    adapter.broadcast({
      data: ['coinbattle:multiplier-ended', { matchId: 71, platformActor: 'platform-user-secret' }]
    }, { rooms: new Set(), except: new Set() });
    const ended = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:multiplier-ended' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(ended.packet.data[1]).toEqual({});
    handlers.get('coinbattle:multiplier-ended')(ended.packet.data[1]);
    expect(dom.window.document.getElementById('multiplier-container').style.display).toBe('none');
  });

  test('projects actual match-ended producer events to team and solo winner displays', () => {
    const finishMatch = (mode) => {
      if (!engine.currentMatch) {
        engine.startMatch(mode, 300);
        engine.stopTimer();
      }
      engine.currentMatch.mode = mode;
      adapter.broadcastCalls.length = 0;
      engine.endMatch({ skipAutoReset: true });
      const local = adapter.broadcastCalls.find(({ packet, options }) => (
        packet.data[0] === 'coinbattle:match-ended' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
      ));
      const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
        packet.data[0] === 'coinbattle:match-ended' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
      ));
      expect(local.packet.data[1].matchId).toBe(71);
      expect(local.packet.data[1].leaderboard[0].user_id).toBe('platform-user-secret');
      expect(local.packet.data[1].winnersWithXP[0].userId).toBe('platform-user-secret');
      expect(JSON.stringify(publicCall.packet.data[1])).not.toContain('platform-user-secret');
      handlers.get('coinbattle:match-ended')(publicCall.packet.data[1]);
      expect(dom.window.document.getElementById('winner-reveal').style.display).toBe('flex');
      return publicCall.packet.data[1];
    };

    const teamResult = finishMatch('team');
    expect(teamResult).toEqual({
      winner: { is_draw: false, winner_team: 'red' },
      teamScores: { red: 123, blue: 4 }
    });

    const soloResult = finishMatch('solo');
    expect(soloResult).toEqual({
      winner: {},
      leaderboard: [{ nickname: 'Fixture Viewer', unique_id: 'fixture_viewer', coins: 123 }]
    });
    expect(dom.window.document.getElementById('winner-name').textContent).toBe('Fixture Viewer');
    expect(dom.window.document.getElementById('winner-coins').textContent).toBe('123');
  });

  test('projects actual badge awards without the player identifier or badge metadata', () => {
    db.checkAndAwardBadges.mockReturnValue([{
      id: 4,
      badge_id: 'fixture-badge-key',
      name: 'Fixture Champion',
      description: 'private badge description',
      icon: '🏆',
      requirement_type: 'total_coins',
      requirement_value: 100,
      rarity: 'legendary'
    }]);
    adapter.broadcastCalls.length = 0;
    engine.endMatch({ skipAutoReset: true });

    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:badges-awarded' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:badges-awarded' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(local.packet.data[1].userId).toBe('platform-user-secret');
    expect(publicCall.packet.data[1]).toEqual({ badges: [{ name: 'Fixture Champion', icon: '🏆' }] });

    handlers.get('coinbattle:badges-awarded')(publicCall.packet.data[1]);
    expect(dom.window.document.getElementById('badge-name').textContent).toBe('Fixture Champion');
    expect(dom.window.document.getElementById('badge-icon').textContent).toBe('🏆');
  });

  test('projects actual post-match producer data for team and solo credit consumers', () => {
    engine.config.postMatch = {
      showLeaderboard: true,
      leaderboardTypes: ['lifetime'],
      leaderboardDuration: 15,
      showWinnerCredits: true,
      winnerCreditsDuration: 10,
      showXPAwards: true,
      privateConfig: 'not-for-public'
    };
    const emitPostMatch = mode => {
      if (!engine.currentMatch) {
        engine.startMatch(mode, 300);
        engine.stopTimer();
      }
      engine.currentMatch.mode = mode;
      adapter.broadcastCalls.length = 0;
      engine.endMatch({ skipAutoReset: true });
      const local = adapter.broadcastCalls.find(({ packet, options }) => (
        packet.data[0] === 'coinbattle:post-match' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
      ));
      const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
        packet.data[0] === 'coinbattle:post-match' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
      ));
      const localPayload = local.packet.data[1];
      const publicPayload = publicCall.packet.data[1];
      expect(localPayload.matchId).toBe(71);
      expect(localPayload.winnersWithXP[0]).toHaveProperty('userId', 'platform-user-secret');
      expect(localPayload.winnersWithXP[0]).toHaveProperty('profilePictureUrl');
      expect(localPayload.config.privateConfig).toBe('not-for-public');
      expect(publicPayload.config).toEqual({
        showLeaderboard: true,
        leaderboardTypes: ['lifetime'],
        leaderboardDuration: 15,
        showWinnerCredits: true,
        winnerCreditsDuration: 10,
        showXPAwards: true
      });
      expect(publicPayload.leaderboard).toEqual([{
        nickname: 'Fixture Viewer',
        unique_id: 'fixture_viewer',
        profile_picture_url: 'https://example.test/avatar.png',
        coins: 123
      }]);
      expect(JSON.stringify(publicPayload)).not.toContain('platform-user-secret');
      expect(JSON.stringify(publicPayload)).not.toContain('privateConfig');
      handlers.get('coinbattle:post-match')(publicPayload);
      return publicPayload;
    };

    const teamPayload = emitPostMatch('team');
    expect(teamPayload.winnersWithXP).toEqual([{
      placement: 1, nickname: 'Fixture Viewer', uniqueId: 'fixture_viewer', coins: 123, xp: 125, team: 'red'
    }]);
    const creditsEntry = dom.window.document.querySelector('#credits-list .credits-entry');
    expect(creditsEntry.querySelector('.credits-name').textContent).toBe('Fixture Viewer');
    expect(creditsEntry.querySelector('.credits-stat-value').textContent).toBe('123');
    expect(creditsEntry.querySelectorAll('.credits-stat-value')[1].textContent).toBe('RED');
    expect(creditsEntry.querySelector('.credits-xp').textContent).toBe('+125 XP');

    const soloPayload = emitPostMatch('solo');
    expect(soloPayload.winnersWithXP).toEqual([{
      placement: 1, nickname: 'Fixture Viewer', uniqueId: 'fixture_viewer', coins: 123, xp: 100
    }]);
    const soloCreditsEntry = dom.window.document.querySelector('#credits-list .credits-entry');
    expect(soloCreditsEntry.querySelector('.credits-name').textContent).toBe('Fixture Viewer');
    expect(soloCreditsEntry.querySelector('.credits-xp').textContent).toBe('+100 XP');
  });

  test('fails closed for malformed post-match config while retaining local data', () => {
    adapter.broadcastCalls.length = 0;
    const payload = {
      matchId: 71,
      config: { showWinnerCredits: true, winnerCreditsDuration: '10' },
      winnersWithXP: [{ userId: 'platform-user-secret', placement: 1, coins: 123, xp: 100 }]
    };
    adapter.broadcast({ data: ['coinbattle:post-match', payload] }, { rooms: new Set(), except: new Set() });
    expect(adapter.broadcastCalls).toHaveLength(1);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect(adapter.broadcastCalls[0].options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
  });

  test('projects team-name route output and permits only safe image URLs', async () => {
    const io = {
      emit: (event, payload) => adapter.broadcast(
        { data: [event, payload] }, { rooms: new Set(), except: new Set() }
      )
    };
    const { routes, plugin } = createPluginRouteHarness({ io });
    const route = routes.get('POST /api/plugins/coinbattle/team-names');
    adapter.broadcastCalls.length = 0;
    engine.emitMatchState();
    const publicState = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:match-state' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    handlers.get('coinbattle:match-state')(publicState.packet.data[1]);

    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await route({ ip: 'fixture', body: {
      team: 'red', name: 'Updated Red', matchId: 71, imageUrl: 'https://example.test/red.png'
    } }, res);
    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:team-names-updated' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:team-names-updated' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(local.packet.data[1]).toMatchObject({ matchId: 71, name: 'Updated Red' });
    expect(publicCall.packet.data[1]).toEqual({
      team: 'red', name: 'Updated Red', imageUrl: 'https://example.test/red.png'
    });
    handlers.get('coinbattle:team-names-updated')(publicCall.packet.data[1]);
    expect(dom.window.document.getElementById('team-red-name').textContent).toBe('Updated Red');
    expect(dom.window.document.getElementById('team-red-image').getAttribute('src')).toBe('https://example.test/red.png');

    adapter.broadcastCalls.length = 0;
    await route({ ip: 'fixture', body: {
      team: 'red', name: 'Bad URL', matchId: 71, imageUrl: 'javascript:alert(1)'
    } }, res);
    expect(adapter.broadcastCalls).toHaveLength(1);
    expect(adapter.broadcastCalls[0].options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    expect(adapter.broadcastCalls[0].packet.data[1].imageUrl).toBe('javascript:alert(1)');
    expect(plugin.teamNamesManager.setTeamName).toHaveBeenCalledTimes(2);
  });

  test('projects only live renderer settings from the actual config route', async () => {
    const io = {
      emit: (event, payload) => adapter.broadcast(
        { data: [event, payload] }, { rooms: new Set(), except: new Set() }
      )
    };
    const setConfig = jest.fn();
    const { routes } = createPluginRouteHarness({ io, setConfig });
    const route = routes.get('POST /api/plugins/coinbattle/config');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    adapter.broadcastCalls.length = 0;
    await route({ ip: 'fixture', body: {
      theme: 'day', skin: 'retro', layout: 'compact',
      showAvatars: false, showBadges: false, showXPAwards: true, toasterMode: true,
      overlayWidth: 1280, overlayHeight: 720,
      mode: 'team', matchDuration: 300, userId: 'private-config-user', apiSecret: 'fixture-secret'
    } }, res);

    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:config-updated' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:config-updated' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(local.packet.data[1]).toMatchObject({ userId: 'private-config-user', apiSecret: 'fixture-secret' });
    expect(publicCall.packet.data[1]).toEqual({
      theme: 'day', skin: 'retro', layout: 'compact', showAvatars: false,
      showBadges: false, showXPAwards: true, toasterMode: true,
      overlayWidth: 1280, overlayHeight: 720
    });
    expect(JSON.stringify(publicCall.packet.data[1])).not.toContain('fixture-secret');
    handlers.get('coinbattle:config-updated')(publicCall.packet.data[1]);
    expect(dom.window.document.body.className).toContain('theme-day');
    expect(dom.window.document.body.className).toContain('layout-compact');
    expect(dom.window.document.body.className).toContain('skin-retro');
    expect(dom.window.document.documentElement.style.getPropertyValue('--configured-overlay-width')).toBe('1280px');
    expect(dom.window.document.documentElement.style.getPropertyValue('--configured-overlay-height')).toBe('720px');
    expect(setConfig).toHaveBeenCalled();
  });

  test('projects timer ticks from the engine to both renderer timing fields', () => {
    let tick;
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(callback => {
      tick = callback;
      return 9191;
    });
    engine.startTimer();
    intervalSpy.mockRestore();
    engine.stopTimer();
    tick();

    const local = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:timer-update' && options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    const publicCall = adapter.broadcastCalls.find(({ packet, options }) => (
      packet.data[0] === 'coinbattle:timer-update' && options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
    ));
    expect(local.packet.data[1]).toMatchObject({ elapsed: 0, remaining: 300, total: 300 });
    expect(publicCall.packet.data[1]).toEqual({ elapsed: 0, remaining: 300, total: 300 });
    handlers.get('coinbattle:timer-update')(publicCall.packet.data[1]);
    expect(dom.window.document.getElementById('timer-display').textContent).toBe('05:00');
  });

  test('withholds malformed team-name URLs and invalid overlay config publicly', () => {
    adapter.broadcastCalls.length = 0;
    adapter.broadcast({
      data: ['coinbattle:team-names-updated', { team: 'blue', name: 'Blue', imageUrl: 'javascript:bad()', matchId: 71 }]
    }, { rooms: new Set(), except: new Set() });
    adapter.broadcast({
      data: ['coinbattle:config-updated', { theme: 'unknown-theme', overlayWidth: 9000, secret: 'private' }]
    }, { rooms: new Set(), except: new Set() });
    adapter.broadcast({
      data: ['coinbattle:timer-update', { elapsed: -1, remaining: 30, total: 300, secret: 'private' }]
    }, { rooms: new Set(), except: new Set() });
    expect(adapter.broadcastCalls).toHaveLength(3);
    expect(adapter.broadcastCalls.every(({ options }) => options.except.has(PUBLIC_QUICK_TUNNEL_ROOM))).toBe(true);
    expect(adapter.broadcastCalls[0].packet.data[1].imageUrl).toBe('javascript:bad()');
    expect(adapter.broadcastCalls[1].packet.data[1].secret).toBe('private');
    expect(adapter.broadcastCalls[2].packet.data[1].secret).toBe('private');
  });

  test('projects direct current-state requests on reconnect through the public socket guard', () => {
    const socketHandlers = {};
    const plugin = new CoinBattlePlugin({
      getSocketIO: () => ({}),
      registerSocket: (event, handler) => { socketHandlers[event] = handler; },
      log() {}
    });
    plugin.engine = engine;
    plugin.registerSocketEvents();

    const emitted = [];
    const socket = {
      handshake: { headers: { host: 'fixture.trycloudflare.com' } },
      join: jest.fn(),
      use: jest.fn(),
      emit(event, payload) { emitted.push({ event, payload }); }
    };
    protectPublicSocket({ socket, logger: { warn() {} } });
    socketHandlers['coinbattle:get-state'](socket);

    expect(socket.join).toHaveBeenCalledWith(PUBLIC_QUICK_TUNNEL_ROOM);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('coinbattle:match-state');
    expect(emitted[0].payload.match).not.toHaveProperty('id');
    expect(emitted[0].payload).not.toHaveProperty('config');
    handlers.get('coinbattle:match-state')(emitted[0].payload);
    expect(dom.window.document.querySelector('.entry-name')?.textContent).toBe('Fixture Viewer');
  });
});
