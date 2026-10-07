'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  projectPublicOverlayPayload,
  registerPublicZappieHellGoal,
  forgetPublicZappieHellGoal,
  projectWeatherConfigResponse,
  projectQuizShowLeaderboardResponse,
  projectGameEngineConfigResponse
} = require('../modules/public-overlay-payload-projection');
const ArenaGame = require('../plugins/game-engine/games/arena');

describe('public Arena renderer state projection', () => {
  function arenaStateFixture() {
    return {
      gameType: 'arena', reason: 'internal-snapshot-reason', timestamp: 123,
      config: {
        arenaSizePreset: 'standard', arenaWidth: 1080, arenaHeight: 1000,
        fieldFrameEnabled: true, fieldFrameDesign: 'minimal', fieldFrameThickness: 3, fieldFrameGlow: 0.5,
        largeBallTransparencyEnabled: true, largeBallTransparencyMode: 'scale',
        largeBallTransparencyStartMass: 55, largeBallMinOpacity: 0.42,
        maxPlayers: 80, maxFoodRender: 66, baseMass: 18, maxMass: 6500,
        renderScale: 0.7, adaptiveResolutionEnabled: true, targetFps: 45, maxRenderPlayers: 48,
        rendererMode: 'auto', topOverlayDesign: 'framed-field', topOverlayPosition: 'top-center',
        topOverlayDensity: 'full', topOverlayAccent: 'cyan', topOverlayBackdrop: 'solid',
        topOverlayRotatorStyle: 'card', topOverlayPlacement: 'below-field', topOverlayTextScale: 'normal',
        topOverlayShowTitle: true, topOverlayShowCount: true, topOverlayShowLeaderboard: true,
        topOverlayLeaderboardRows: 3, topOverlayShowAbilityLegend: false, topOverlayShowCommandHints: true,
        chatStrategyEnabled: true, chatTargetCommandEnabled: true, directAbilitiesEnabled: true,
        abilityChargeMs: 60000, boostDurationMs: 6000, shieldDurationMs: 8000,
        likeLifeValue: 7.5, likeGrowthMaxMass: 123, giftLifePerCoin: 39,
        boostColor: '#EF4444', shieldColor: '#3B82F6', tickRateMs: 66, stateEmitIntervalMs: 66,
        infoRotatorPlacement: 'in-hud', infoRotatorLanguageMode: 'de-en', infoRotatorIntervalMs: 4200,
        infoRotatorMessages: ['Fixture public hint'], displayTexts: { titleText: 'Arena', feverText: 'Fever', emptyText: 'Waiting', privateText: 'drop' },
        giftWeaponMappings: { 'gift-id-secret': { weaponType: 'chainsaw', internalGiftId: 456 } },
        bombBlastRadius: 999, chatStrategyCooldownMs: 8000, internalConfig: 'private'
      },
      fever: { active: true, endsAt: 456, scheduleId: 'private-schedule' },
      players: [{
        username: 'fixture-viewer', nickname: 'Fixture Viewer', x: 100, y: 200, vx: 4, vy: -3,
        radius: 15, mass: 80, score: 12, kills: 2, lives: 400, energy: 45,
        color: 'hsl(120, 78%, 58%)', profilePictureUrl: 'https://fixture.invalid/avatar?token=private',
        profilePictureProxyUrl: '/api/game-engine/arena/avatar?url=private', personality: { aggression: 1.8 },
        strategy: 'role', strategyExpiresAt: 999, targetUsername: 'private-target', targetExpiresAt: 1000,
        activeRole: 'tactician', lastActivityAt: 44,
        abilities: {
          boost: { ready: true, chargeProgress: 1, activeUntil: 555 },
          shield: { ready: false, chargeProgress: 0.5, availableAt: 666 },
          bomb: { ready: true, availableAt: 777, cooldownProgress: 1 }
        },
        ai: { state: 'farming', reason: 'private AI rationale', targetKey: 'private-target', planner: 'private-planner' },
        weapon: { type: 'chainsaw', sourceGift: 'private gift', power: 99, durationMs: 10000 }
      }],
      food: [{ id: 'food-id', x: 5, y: 6, radius: 4, value: 999, source: 'death-drop', excludedUsername: 'private-target', spawnedAt: 10, expiresAt: 20, fadeOutMs: 5000, motionScale: 1 }],
      weaponPickups: [{ id: 'pickup-id', type: 'laser', tier: 'internal', power: 99, durationMs: 2000, x: 7, y: 8, radius: 9, spawnedAt: 10, expiresAt: 20 }],
      mines: [{ id: 'mine-id', owner: 'private-owner', x: 9, y: 10, radius: 11, power: 99, spawnedAt: 10, expiresAt: 20 }],
      bombs: [{ id: 'bomb-id', owner: 'private-owner', targetUsername: 'private-target', x: 12, y: 13, vx: 1, vy: 2, radius: 12, range: 500, speed: 650, blastRadius: 99, phase: 'flying', armedAt: null, expiresAt: null }],
      leaderboard: [{ rank: 1, username: 'fixture-viewer', nickname: 'Fixture Viewer', mass: 80, score: 12, kills: 2 }]
    };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  test('keeps the actual renderer contract and strips internal player, entity, AI, and config fields without mutating input', () => {
    const source = arenaStateFixture();
    const before = JSON.stringify(source);
    const projected = projectPublicOverlayPayload('arena:state', deepFreeze(source));

    expect(JSON.stringify(source)).toBe(before);
    expect(projected).toMatchObject({
      gameType: 'arena',
      config: {
        arenaWidth: 1080, arenaHeight: 1000, giftWeaponMappings: {},
        likeLifeValue: 7.5, likeGrowthMaxMass: 123, giftLifePerCoin: 39,
        displayTexts: { titleText: 'Arena', feverText: 'Fever', emptyText: 'Waiting' }
      },
      fever: { active: true },
      players: [{ username: 'fixture-viewer', nickname: 'Fixture Viewer', x: 100, y: 200, vx: 4, vy: -3, radius: 15, mass: 80, strategy: 'role', targetUsername: true, activeRole: 'tactician', ai: { state: 'farming' }, weapon: { type: 'chainsaw' } }],
      food: [{ x: 5, y: 6, radius: 4, source: 'burst', spawnedAt: 10, expiresAt: 20, fadeOutMs: 5000 }],
      weaponPickups: [{ x: 7, y: 8, radius: 9, type: 'laser' }],
      mines: [{ x: 9, y: 10, radius: 11 }],
      bombs: [{ x: 12, y: 13, vx: 1, vy: 2, radius: 12, phase: 'flying' }],
      leaderboard: [{ rank: 1, username: 'fixture-viewer', nickname: 'Fixture Viewer', mass: 80 }]
    });
    expect(projected.config).not.toHaveProperty('bombBlastRadius');
    expect(projected.config).not.toHaveProperty('internalConfig');
    expect(projected.config.infoRotatorMessages).toEqual(['Fixture public hint']);
    expect(projected.players[0]).not.toHaveProperty('profilePictureUrl');
    expect(projected.players[0]).not.toHaveProperty('profilePictureProxyUrl');
    expect(projected.players[0]).not.toHaveProperty('personality');
    expect(projected.players[0].ai).toEqual({ state: 'farming' });
    expect(projected.food[0]).not.toHaveProperty('excludedUsername');
    expect(projected.weaponPickups[0]).not.toHaveProperty('power');
    expect(projected.mines[0]).not.toHaveProperty('owner');
    expect(projected.bombs[0]).not.toHaveProperty('targetUsername');
    expect(projected.leaderboard[0]).not.toHaveProperty('score');
    expect(JSON.stringify(projected)).not.toMatch(/private-target|private-owner|private gift|private-planner|fixture\.invalid|gift-id-secret/);
  });

  test('projects Arena, Chess, and Connect4 config updates and withholds unsupported game types', () => {
    expect(projectPublicOverlayPayload('game-engine:config-updated', {
      gameType: 'arena', config: { arenaWidth: 1280, arenaHeight: 720, maxBombs: 99, giftWeaponMappings: { 'gift-id': { weaponType: 'mine' } } }
    })).toEqual({ gameType: 'arena', config: { giftWeaponMappings: {}, arenaWidth: 1280, arenaHeight: 720 } });
    expect(projectPublicOverlayPayload('game-engine:config-updated', { gameType: 'plinko', config: { internal: true } }))
      .toBeNull();
    expect(projectPublicOverlayPayload('game-engine:config-updated', { gameType: 'arena', config: { arenaWidth: Infinity } }))
      .toBeNull();
  });

  test('keeps only fields consumed by original Chess and Connect4 overlays', () => {
    const chess = {
      boardTheme: 'light', backgroundColor: '#123456', whiteColor: '#abcdef', blackColor: '#fedcba',
      fontFamily: 'Verdana, sans-serif', showCoordinates: false, highlightLastMove: false,
      highlightCheck: true, showCapturedPieces: false, celebrationEnabled: true,
      timerWarningTime: 45, animationSpeed: 400,
      displayTexts: { titleText: 'Public Chess', labelWhite: 'White', labelBlack: 'Black', privateText: 'drop' },
      streamerRole: 'black', autoplay: { enabled: true, eloOffset: 100, moveDelayMs: 1000 },
      timeControls: ['3+0'], defaultTimeControl: '3+0', eloKFactor: 32, privateCanary: 'secret'
    };
    const connect4 = {
      boardColor: '#123456', player1Color: '#abcdef', player2Color: '#fedcba', textColor: '#ffffff',
      fontFamily: 'Arial, sans-serif', showCoordinates: false, animationSpeed: 500,
      soundEnabled: true, soundVolume: 0.4, showWinStreaks: true, celebrationEnabled: false,
      leaderboardEnabled: true, leaderboardDisplayTime: 5, leaderboardTypes: ['daily', 'elo'], eloEnabled: true,
      displayTexts: { titleText: 'Public Connect4', labelPlayer1: 'P1', privateText: 'drop' },
      streamerRole: 'player2', chatCommand: 'secretcommand', timeoutLockoutMinutes: 1440,
      roundTimerEnabled: true, privateCanary: 'secret'
    };

    expect(projectGameEngineConfigResponse('chess', chess)).toEqual({
      boardTheme: 'light', backgroundColor: '#123456', whiteColor: '#ABCDEF', blackColor: '#FEDCBA',
      fontFamily: 'Verdana, sans-serif', showCoordinates: false, highlightLastMove: false,
      highlightCheck: true, showCapturedPieces: false, celebrationEnabled: true, timerWarningTime: 45,
      animationSpeed: 400, displayTexts: { titleText: 'Public Chess', labelWhite: 'White', labelBlack: 'Black' }
    });
    expect(projectPublicOverlayPayload('game-engine:config-updated', { gameType: 'chess', config: chess }))
      .toEqual({ gameType: 'chess', config: projectGameEngineConfigResponse('chess', chess) });
    expect(projectGameEngineConfigResponse('connect4', connect4)).toEqual({
      boardColor: '#123456', player1Color: '#ABCDEF', player2Color: '#FEDCBA', textColor: '#FFFFFF',
      fontFamily: 'Arial, sans-serif', showCoordinates: false, animationSpeed: 500,
      soundEnabled: true, soundVolume: 0.4, showWinStreaks: true, celebrationEnabled: false,
      leaderboardEnabled: true, leaderboardDisplayTime: 5, leaderboardTypes: ['daily', 'elo'], eloEnabled: true,
      displayTexts: { titleText: 'Public Connect4', labelPlayer1: 'P1' }
    });
    expect(projectPublicOverlayPayload('game-engine:config-updated', { gameType: 'connect4', config: connect4 }))
      .toEqual({ gameType: 'connect4', config: projectGameEngineConfigResponse('connect4', connect4) });
    expect(projectPublicOverlayPayload('game-engine:config-updated', { gameType: 'interactive', config: { owner: 'secret' } }))
      .toBeNull();
    expect(projectGameEngineConfigResponse('plinko', { privateCanary: 'secret' })).toBeNull();
  });

  test.each([
    ['unsafe Chess font', 'chess', { fontFamily: 'Arial);background:url(https://example.invalid)' }],
    ['malformed Chess warning threshold', 'chess', { timerWarningTime: Infinity }],
    ['unsafe Connect4 color', 'connect4', { boardColor: 'url(javascript:alert(1))' }],
    ['malformed Connect4 sound volume', 'connect4', { soundVolume: 2 }],
    ['unknown Connect4 leaderboard', 'connect4', { leaderboardTypes: ['daily', 'private'] }]
  ])('fails closed for %s', (_label, gameType, config) => {
    expect(projectGameEngineConfigResponse(gameType, config)).toBeNull();
    expect(projectPublicOverlayPayload('game-engine:config-updated', { gameType, config })).toBeNull();
  });

  test('matches the existing Game Engine config-updated producer shape for Arena only', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'game-engine', 'main.js'), 'utf8');
    expect(source).toContain("this.io.emit('game-engine:config-updated', { gameType, config });");
    const game = new ArenaGame(
      { getSocketIO: () => ({ emit: jest.fn() }) },
      { getGameConfig: () => null, saveGameConfig: jest.fn() },
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      { now: () => 1700000000000, random: () => 0.5 }
    );
    const actualEvent = { gameType: 'arena', config: game.getConfig() };
    const publicEvent = projectPublicOverlayPayload('game-engine:config-updated', actualEvent);

    expect(publicEvent.gameType).toBe('arena');
    expect(publicEvent.config).toHaveProperty('arenaWidth', actualEvent.config.arenaWidth);
    expect(publicEvent.config).toHaveProperty('boostColor', actualEvent.config.boostColor);
    expect(publicEvent.config.giftWeaponMappings).toEqual({});
    expect(publicEvent.config).not.toHaveProperty('bombBlastRadius');
    expect(game.tickTimer).toBeNull();
  });

  test('accepts the actual Arena producer snapshot without starting a game tick', () => {
    const socketEmits = [];
    const game = new ArenaGame(
      { getSocketIO: () => ({ emit: (...args) => socketEmits.push(args) }) },
      { getGameConfig: () => null, saveGameConfig: jest.fn() },
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      { now: () => 1700000000000, random: () => 0.5 }
    );

    game.emitState('public-fixture', { force: true });

    expect(socketEmits).toHaveLength(1);
    expect(socketEmits[0][0]).toBe('arena:state');
    expect(socketEmits[0][1]).toMatchObject({ gameType: 'arena', config: expect.any(Object), players: [], food: [] });
    expect(projectPublicOverlayPayload(socketEmits[0][0], socketEmits[0][1])).not.toBeNull();
    expect(game.tickTimer).toBeNull();
    expect(game.destroyed).toBe(false);
  });

  test('fails closed for invalid renderer values and oversized arrays', () => {
    const source = arenaStateFixture();
    expect(projectPublicOverlayPayload('arena:state', { ...source, players: [{ ...source.players[0], color: 'url(javascript:alert(1))' }] })).toBeNull();
    expect(projectPublicOverlayPayload('arena:state', { ...source, food: Array(2049).fill(source.food[0]) })).toBeNull();
    expect(projectPublicOverlayPayload('arena:state', { ...source, bombs: [{ ...source.bombs[0], phase: 'secret' }] })).toBeNull();
  });

  test('preserves bounded Arena economy values consumed by original localized hints', () => {
    const source = arenaStateFixture();
    const projected = projectPublicOverlayPayload('arena:state', source);
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'game-engine', 'overlay', 'arena.html'), 'utf8');
    const clampStart = overlay.indexOf('    function clampNumber(value, min, max, fallback) {');
    const clampEnd = overlay.indexOf('    function normalizeTopOverlayDesign(value) {', clampStart);
    const hintsStart = overlay.indexOf('    function localizedInfoDefinitions(config) {');
    const hintsEnd = overlay.indexOf('    function buildLocalizedInfoMessages(config) {', hintsStart);
    expect([clampStart, clampEnd, hintsStart, hintsEnd].every(index => index >= 0)).toBe(true);

    const hintConsumer = {};
    vm.runInNewContext(
      `${overlay.slice(clampStart, clampEnd)};${overlay.slice(hintsStart, hintsEnd)};globalThis.getHints = localizedInfoDefinitions;`,
      hintConsumer
    );
    const hints = hintConsumer.getHints(projected.config);
    expect(hints.find(item => item.kind === 'like').text.de).toContain('Masse 123');
    expect(hints.find(item => item.kind === 'like').text.de).toContain('1 Like = 7.5 Leben');
    expect(hints.find(item => item.kind === 'gift-life').text.de).toContain('1 Coin = 39 Leben');

    const bounded = projectPublicOverlayPayload('arena:state', {
      ...source,
      config: { ...source.config, likeLifeValue: 0, likeGrowthMaxMass: 25000, giftLifePerCoin: 250000 }
    });
    expect(bounded.config).toMatchObject({ likeLifeValue: 0.1, likeGrowthMaxMass: 10000, giftLifePerCoin: 100000 });
    expect(ArenaGame.DEFAULT_CONFIG).toMatchObject({ likeLifeValue: 1, likeGrowthMaxMass: 42, giftLifePerCoin: 25 });
  });

  test('keeps the existing overlay fallbacks for target badges and avatars', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'game-engine', 'overlay', 'arena.html'), 'utf8');
    expect(overlay).toMatch(/if \(player\.targetUsername\) return 'TARGET';/);
    expect(overlay).toContain('player?.profilePictureProxyUrl ||');
    expect(overlay).toContain('player?.profilePictureUrl ||');
    expect(overlay).toContain('drawFallbackOrb(player, point)');
    const player = projectPublicOverlayPayload('arena:state', arenaStateFixture()).players[0];
    expect(player.targetUsername).toBe(true);
    expect(player).not.toHaveProperty('profilePictureUrl');
    expect(player).not.toHaveProperty('profilePictureProxyUrl');
  });

  test('runs original strategy/avatar helpers and drawPlayer against the projected DTO with a CPU canvas stub', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'game-engine', 'overlay', 'arena.html'), 'utf8');
    const projected = projectPublicOverlayPayload('arena:state', arenaStateFixture()).players[0];
    const helperStart = overlay.indexOf('    function strategyLabelForPlayer(player) {');
    const helperEnd = overlay.indexOf('    function drawStrategyLabel(player, point) {', helperStart);
    const avatarStart = overlay.indexOf('    function avatarRenderUrl(player) {');
    const avatarEnd = overlay.indexOf('    function normalizeGiftCatalogEntry(gift) {', avatarStart);
    const drawStart = overlay.indexOf('    function drawPlayer(player, now) {');
    const drawEnd = overlay.indexOf('    function drawAbilityRings(player, point, now) {', drawStart);
    expect([helperStart, helperEnd, avatarStart, avatarEnd, drawStart, drawEnd].every(index => index >= 0)).toBe(true);

    const helpersSource = overlay.slice(helperStart, helperEnd);
    const avatarSource = overlay.slice(avatarStart, avatarEnd);
    const drawPlayerSource = overlay.slice(drawStart, drawEnd).trim();
    const avatarContext = {};
    vm.runInNewContext(`${avatarSource}; globalThis.renderUrl = avatarRenderUrl;`, avatarContext);
    expect(avatarContext.renderUrl(projected)).toBe('');

    const strategyContext = {};
    vm.runInNewContext(`${helpersSource}; globalThis.strategyLabel = strategyLabelForPlayer;`, strategyContext);
    expect(strategyContext.strategyLabel(projected)).toBe('TARGET');
    expect(strategyContext.strategyLabel({ ...projected, targetUsername: false, strategy: null, activeRole: null })).toBe('FARM');

    const fallbackOrb = jest.fn();
    const ctx = {
      save: jest.fn(), restore: jest.fn(), fillText: jest.fn(), strokeText: jest.fn(),
      set globalAlpha(_value) {}, font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 1
    };
    const sandbox = {
      ctx,
      state: { players: [projected] },
      renderStats: { quality: 0.5 },
      project: () => ({ x: 10, y: 20, radius: 20 }),
      playerVisualAlpha: () => 1,
      updateTrail: jest.fn(), drawWeapon: jest.fn(), drawAvatarImage: () => false,
      drawFallbackOrb: fallbackOrb, drawAvatarChrome: jest.fn(), drawAnimatedWeaponAttachment: jest.fn(),
      drawAbilityRings: jest.fn(), drawStrategyLabel: jest.fn(), clampText: value => String(value || ''),
      window: { innerWidth: 100, innerHeight: 100 }
    };
    vm.runInNewContext(drawPlayerSource, sandbox);
    sandbox.drawPlayer(projected, 100);
    expect(fallbackOrb).toHaveBeenCalledWith(projected, { x: 10, y: 20, radius: 20 });
  });
});

describe('public Quiz Show round leaderboard response projection', () => {
  test('keeps only bounded username and points rows', () => {
    expect(projectQuizShowLeaderboardResponse({
      success: true,
      leaderboard: [{ username: 'Fixture Viewer', points: 23, userId: 'private-id', rank: 1, seasonId: 9 }],
      private: true
    })).toEqual({ success: true, leaderboard: [{ username: 'Fixture Viewer', points: 23 }] });
  });

  test.each([
    { success: true, leaderboard: [{ username: 'x'.repeat(121), points: 1 }] },
    { success: true, leaderboard: [{ username: 'Fixture', points: -1 }] },
    { success: true, leaderboard: [{ username: 'Fixture', points: 1.5 }] },
    { success: true, leaderboard: Array.from({ length: 101 }, (_, index) => ({ username: `Viewer ${index}`, points: index })) }
  ])('rejects malformed or oversized leaderboard responses', payload => {
    expect(projectQuizShowLeaderboardResponse(payload)).toBeNull();
  });
});

describe('public ZappieHell payload projection', () => {
  test.each(['zappiehell:goals:state', 'zappiehell:goals:update'])('keeps only renderer goal fields for %s', eventName => {
    const fullGoal = {
      id: `internal-goal-${eventName}`, name: 'Goal', targetCoins: 100, currentCoins: 25,
      type: 'stream', active: true, chainId: 'internal-chain', apiKey: 'secret'
    };
    registerPublicZappieHellGoal(fullGoal);
    const projection = projectPublicOverlayPayload(eventName, {
      goals: [fullGoal],
      coinsAdded: 25,
      metadata: 'private'
    });
    expect(projection.goals[0]).toMatchObject({
      name: fullGoal.name, targetCoins: 100, currentCoins: 25, type: 'stream', active: true
    });
    expect(projection.goals[0].displayToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(projection.goals[0]).not.toHaveProperty('id');
    expect(JSON.stringify(projection)).not.toContain('internal-goal');
    expect(projection.goals[0]).not.toHaveProperty('chainId');
    expect(projection).not.toHaveProperty('coinsAdded');
  });

  test('keeps only completion card identity', () => {
    const fullGoal = {
      id: 'completion-goal', name: 'Goal', targetCoins: 100, currentCoins: 100,
      type: 'stream', active: true, chainId: 'internal-chain', apiKey: 'secret'
    };
    registerPublicZappieHellGoal(fullGoal);
    const state = projectPublicOverlayPayload('zappiehell:goals:state', { goals: [fullGoal] });
    const update = projectPublicOverlayPayload('zappiehell:goals:update', { goals: [fullGoal] });
    const completion = projectPublicOverlayPayload('zappiehell:goals:completed', { goal: fullGoal });
    expect(completion).toEqual({ goal: { displayToken: state.goals[0].displayToken } });
    expect(update.goals[0].displayToken).toBe(state.goals[0].displayToken);
    expect(JSON.stringify(completion)).not.toContain(fullGoal.id);
  });

  test('keeps only audio text and an optional nonempty voice', () => {
    expect(projectPublicOverlayPayload('zappiehell:audio:play', {
      audioId: 'internal-audio', text: 'Fixture words', voice: 'Fixture Voice', apiKey: 'secret'
    })).toEqual({ text: 'Fixture words', voice: 'Fixture Voice' });
    expect(projectPublicOverlayPayload('zappiehell:audio:play', {
      audioId: 'internal-audio', text: 'Fixture words', voice: ''
    })).toEqual({ text: 'Fixture words' });
  });

  test('withholds malformed public data and leaves unrelated events untouched', () => {
    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [{ id: 'id' }] })).toBeNull();
    expect(projectPublicOverlayPayload('zappiehell:goals:update', {
      goals: [{ id: '  ', name: 'Goal', targetCoins: 5, currentCoins: 0, type: 'stream', active: true }]
    })).toBeNull();
    expect(projectPublicOverlayPayload('zappiehell:audio:play', { text: '  ' })).toBeNull();
    expect(projectPublicOverlayPayload('zappiehell:overlay:animate', { duration: 500 })).toBeUndefined();
  });

  test('reconnect state reuses a token, deletes forget it, and process restart rotates it', () => {
    const internalGoalId = 'lifecycle-goal-fixture';
    const goal = {
      id: internalGoalId, name: 'Goal', targetCoins: 10, currentCoins: 0,
      type: 'stream', active: true
    };
    registerPublicZappieHellGoal(goal);
    const first = projectPublicOverlayPayload('zappiehell:goals:state', { goals: [goal] }).goals[0].displayToken;
    const reconnect = projectPublicOverlayPayload('zappiehell:goals:state', { goals: [goal] }).goals[0].displayToken;
    expect(reconnect).toBe(first);

    expect(projectPublicOverlayPayload('zappiehell:goals:state', { goals: [] })).toEqual({ goals: [] });
    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [goal] }).goals[0].displayToken).toBe(first);

    expect(forgetPublicZappieHellGoal(internalGoalId, goal)).toBe(true);
    expect(projectPublicOverlayPayload('zappiehell:goals:completed', { goal }))
      .toBeNull();
    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [goal] })).toBeNull();
    const recreatedGoal = { ...goal };
    registerPublicZappieHellGoal(recreatedGoal);
    const recreated = projectPublicOverlayPayload('zappiehell:goals:update', { goals: [recreatedGoal] }).goals[0].displayToken;
    expect(recreated).not.toBe(first);
    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [goal] })).toBeNull();
    expect(projectPublicOverlayPayload('zappiehell:goals:completed', { goal })).toBeNull();
    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [recreatedGoal] })
      .goals[0].displayToken).toBe(recreated);

    jest.resetModules();
    const freshProcessProjector = require('../modules/public-overlay-payload-projection');
    const restarted = freshProcessProjector.projectPublicOverlayPayload('zappiehell:goals:state', { goals: [recreatedGoal] }).goals[0].displayToken;
    expect(restarted).not.toBe(recreated);
  });
});

describe('public Weather payload projection', () => {
  test('projects only overlay-consumed trigger fields and supported options', () => {
    expect(projectPublicOverlayPayload('weather:trigger', {
      type: 'weather', action: 'rain', intensity: 0.6, duration: 10000,
      permanent: false, username: 'private-user', meta: { secret: true }, timestamp: 1,
      options: { particleScale: 1.2, wind: -0.5, category: 'private-category', apiKey: 'secret' }
    })).toEqual({
      action: 'rain', intensity: 0.6, duration: 10000, permanent: false,
      options: { particleScale: 1.2, wind: -0.5 }
    });
  });

  test('withholds malformed or unsupported Weather triggers and stop payloads', () => {
    expect(projectPublicOverlayPayload('weather:trigger', { action: 'unknown', intensity: 1, duration: 1000, permanent: false, options: {} })).toBeNull();
    expect(projectPublicOverlayPayload('weather:trigger', { action: 'rain', intensity: 2, duration: 1000, permanent: false, options: {} })).toBeNull();
    expect(projectPublicOverlayPayload('weather:trigger', { action: 'rain', intensity: 0.5, duration: 1000, permanent: false, options: { apiKey: 'secret' } })).toEqual({ action: 'rain', intensity: 0.5, duration: 1000, permanent: false, options: {} });
    expect(projectPublicOverlayPayload('weather:stop-effect', { action: 'admin:all' })).toBeNull();
    expect(projectPublicOverlayPayload('weather:stop-effect', { action: 'snow', internal: true })).toEqual({ action: 'snow' });
    expect(projectPublicOverlayPayload('weather:stop', { internal: true })).toEqual({});
  });

  test('keeps only gamification HUD state', () => {
    expect(projectPublicOverlayPayload('weather:gamification-state', {
      timestamp: 123, gamification: {
        enabled: true,
        communityMeter: { current: 12, max: 100, total: 900, lastUpdatedAt: 123 },
        streaks: { current: 3, best: 9, lastContributor: 'private' },
        quest: { title: 'Rain quest', progress: 2, target: 5, id: 'private-id', reward: {} },
        rewards: { nextThreshold: { label: 'Next', meter: 25, action: 'storm' }, history: ['private'] }
      }
    })).toEqual({
      enabled: true,
      communityMeter: { current: 12, max: 100 },
      streaks: { current: 3 },
      quest: { title: 'Rain quest', progress: 2, target: 5 },
      rewards: { nextThreshold: { label: 'Next', meter: 25 } }
    });
  });

  test('projects Weather HTTP config with minimal visual and audio options', () => {
    const result = projectWeatherConfigResponse({ success: true, config: {
      enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4,
      apiKey: 'secret', permissions: { admin: ['private'] }, presets: [{ private: true }],
      effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20, category: 'private', apiKey: 'secret' }, internal: { apiKey: 'secret' } },
      gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: false, showRewardFeed: true }, state: { private: true } },
      audio: { enabled: true, volume: 0.4, effects: { rain: { enabled: true, volume: 0.2, path: 'private.wav' } }, directory: 'private' }
    } });
    expect(result).toEqual({ success: true, config: {
      enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4,
      effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20 } },
      gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: false, showRewardFeed: true } },
      audio: { enabled: true, volume: 0.4, effects: { rain: { enabled: true, volume: 0.2 } } }
    } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('public TopTier payload projection', () => {
  test('keeps renderer board fields and omits internal session and producer metadata', () => {
    const payload = {
      board: 'likes',
      entries: [{
        username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '/fixture.png',
        score: 42, rank: 1, sessionId: 'internal-row-session', internalFlags: { private: true }
      }],
      sessionId: 'internal-session-uuid',
      active: true,
      trace: { source: 'private' }
    };
    const projected = projectPublicOverlayPayload('toptier:update', payload);
    expect(projected).toEqual({
      board: 'likes',
      entries: [{ username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '/fixture.png', score: 42, rank: 1 }]
    });
    expect(JSON.stringify(projected)).not.toContain('internal-session');
    expect(projectPublicOverlayPayload('toptier:update', { board: 'gifts', entries: [] })).toEqual({ board: 'gifts', entries: [] });
    expect(projectPublicOverlayPayload('toptier:update', { board: 'unknown', entries: [] })).toBeNull();
    expect(projectPublicOverlayPayload('toptier:update', { board: 'likes', entries: [{ username: 'fixture', score: -1, rank: 1 }] })).toBeNull();
  });
});

describe('public Schnorrbecher payload projection', () => {
  test('keeps renderer Add fields, neutralizes unproven sender provenance, and removes event identifiers', () => {
    const projected = projectPublicOverlayPayload('coinJar.add', {
      eventId: 'fixture-event-id', comboId: 'fixture-combo-id', senderId: 'fixture-platform-user-id',
      senderName: 'Fixture Nickname', senderAvatar: 'https://fixture.invalid/avatar.png',
      giftId: 'fixture-gift-id', giftName: 'Rose', giftImage: 'https://fixture.invalid/rose.png',
      diamondValue: 1, repeatCount: 2, repeatEnd: true, timestamp: 123,
      totalValue: 2, visualCoins: 2, totalCoinValue: 10, visualCoinCount: 8, generation: 4,
      producerMetadata: { private: true }
    });
    expect(projected).toEqual({
      generation: 4, totalValue: 2, visualCoins: 2, totalCoinValue: 10,
      giftName: 'Rose', giftImage: 'https://fixture.invalid/rose.png', senderName: 'Viewer'
    });
    expect(JSON.stringify(projected)).not.toMatch(/fixture-(?:event|combo|platform-user|gift)-id/);

    // The normalized producer does not retain whether senderName came from nickname or username.
    for (const senderName of ['Fixture Nickname', 'fixture_unique_id']) {
      expect(projectPublicOverlayPayload('coinJar.add', {
        senderName, giftName: 'Rose', totalValue: 1, visualCoins: 1, totalCoinValue: 1, generation: 0
      }).senderName).toBe('Viewer');
    }
  });

  test('projects Sync, Config, and Reset to the actual renderer contract only', () => {
    const { DEFAULT_CONFIG } = require('../plugins/schnorrbecher/lib/config');
    const config = { ...DEFAULT_CONFIG, debug: true, persistenceMode: 'persistent', resetOnNewStream: false, internalKey: 'fixture-secret' };
    const sync = projectPublicOverlayPayload('coinJar.sync', {
      sessionId: 'fixture-room-session-id', updatedAt: 123, livestreamStatus: 'active',
      generation: 3, totalCoinValue: 25, visualCoinCount: 3,
      recentGifts: [{ giftId: 'fixture-gift-id', giftName: 'Rose', giftImage: 'https://fixture.invalid/rose.png' }],
      config
    });
    expect(sync).toMatchObject({ generation: 3, totalCoinValue: 25, visualCoinCount: 3 });
    expect(sync.recentGifts).toEqual([{ giftName: 'Rose', giftImage: 'https://fixture.invalid/rose.png' }]);
    expect(sync.config).toEqual(expect.objectContaining({
      soundEnabled: false, soundVolume: 0.35, jarStyle: 'classic', showSenderName: true
    }));
    expect(sync.config).not.toHaveProperty('debug');
    expect(sync.config).not.toHaveProperty('persistenceMode');
    expect(sync.config).not.toHaveProperty('resetOnNewStream');
    expect(sync.config).not.toHaveProperty('internalKey');
    expect(sync).not.toHaveProperty('sessionId');
    expect(sync).not.toHaveProperty('updatedAt');
    expect(sync).not.toHaveProperty('livestreamStatus');
    expect(projectPublicOverlayPayload('coinJar.config', config)).toEqual(sync.config);
    expect(projectPublicOverlayPayload('coinJar.reset', { reason: 'admin', generation: 4, totalCoinValue: 0 })).toEqual({ generation: 4 });
  });

  test('withholds malformed CoinJar state/config rather than forwarding unbounded fields', () => {
    expect(projectPublicOverlayPayload('coinJar.add', {
      giftName: 'Rose', totalValue: 1, visualCoins: 1, totalCoinValue: 1, generation: -1
    })).toBeNull();
    expect(projectPublicOverlayPayload('coinJar.sync', {
      generation: 0, totalCoinValue: 0, visualCoinCount: 0, recentGifts: [], config: { maxPhysicalIcons: 9000 }
    })).toBeNull();
    expect(projectPublicOverlayPayload('coinJar.config', { debug: true, jarStyle: 'unknown' })).toBeNull();
    expect(projectPublicOverlayPayload('coinJar.reset', { generation: 1.5 })).toBeNull();
  });
});
