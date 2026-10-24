'use strict';

const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const QuizShowPlugin = require('../plugins/quiz-show/main');
const {
  createPublicOverlayMiddleware
} = require('../modules/public-overlay-access');
const { OUTGOING_SOCKET_EVENTS } = require('../modules/public-overlay-registry');
const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

const APP_ROOT = path.resolve(__dirname, '..');

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.broadcasts = [];
  }

  broadcast(packet, options) {
    this.broadcasts.push({ packet, options });
  }
}

function makeQuizState() {
  return {
    isRunning: true,
    roundState: 'running',
    currentRound: 2,
    totalRounds: 5,
    showRoundNumber: true,
    currentQuestion: { question: 'Synthetic?', answers: ['A', 'B', 'C', 'D'], correct: 2 },
    timeRemaining: 19,
    totalTime: 30,
    answers: new Map([['platform-user-secret', { answer: 'C', username: 'Fixture Viewer', timestamp: 1 }]]),
    eliminatedUsers: new Set(['platform-user-secret']),
    jokersUsed: { '25': 1, internal: 'remove-me' },
    jokerEvents: [{ type: '50', userId: 'platform-user-secret', username: 'Fixture Viewer', timestamp: 42, data: { hiddenAnswers: [1, 3] }, isGiftActivated: false }],
    hiddenAnswers: [1, 3],
    revealedWrongAnswer: null,
    votersPerAnswer: { 0: [{ userId: 'platform-user-secret', username: 'Fixture Viewer', profilePictureUrl: 'https://example.test/avatar.png' }], 1: [], 2: [], 3: [] },
    duel: {
      active: true,
      left: { label: 'Left team', users: ['platform-user-secret'], score: 1, streak: 1, lastAnswerCorrect: true },
      right: { label: 'Right team', users: ['another-platform-id'], score: 0, streak: 0, lastAnswerCorrect: null },
      winner: null
    }
  };
}

async function createOverlayConsumer({ fetchImpl, exposeRoundLeaderboardReader = false } = {}) {
  const html = fs.readFileSync(path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/quiz-show/overlay' });
  const handlers = new Map();
  const emitted = [];
  const socket = {
    on(event, handler) { handlers.set(event, handler); },
    off() {},
    emit(event, payload) { emitted.push({ event, payload }); },
    disconnect() {}
  };
  dom.window.io = () => socket;
  dom.window.setTimeout = () => 1;
  dom.window.clearTimeout = () => {};
  dom.window.setInterval = () => 1;
  dom.window.clearInterval = () => {};
  dom.window.requestAnimationFrame = callback => callback(0);
  dom.window.cancelAnimationFrame = () => {};
  dom.window.fetch = fetchImpl || (async () => ({ ok: false, json: async () => ({ success: false }) }));
  dom.window.eval(fs.readFileSync(path.join(APP_ROOT, 'public/js/public-overlay-render-mode.js'), 'utf8'));
  const ready = new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  let overlayScript = fs.readFileSync(path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.js'), 'utf8');
  if (exposeRoundLeaderboardReader) {
    const functionStart = '    async function showCurrentGameLeaderboard() {';
    if (!overlayScript.includes(functionStart)) throw new Error('Original round leaderboard consumer was not found');
    overlayScript = overlayScript.replace(functionStart, '    window.__showCurrentGameLeaderboard = async function showCurrentGameLeaderboard() {');
  }
  dom.window.eval(overlayScript);
  await ready;
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  await Promise.resolve();
  return { dom, handlers, emitted };
}

function createHttpFixture() {
  const app = express();
  app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
  app.get('/api/quiz-show/state', (_req, res) => res.json({
    success: true,
    config: { customLayoutEnabled: true, activeLayoutId: 7, openaiApiKey: 'secret' },
    questions: [{ id: 91, answers: ['a', 'b', 'c', 'd'], correct: 2 }],
    gameState: { answers: [['platform-user-secret', 'C']] },
    stats: { totalGames: 42 }
  }));
  app.get('/api/quiz-show/hud-config', (_req, res) => res.json({
    success: true,
    config: {
      theme: 'dark', questionAnimation: 'slide-in-bottom', timerVariant: 'circular', answersLayout: 'grid',
      animationSpeed: 1, customCSS: '@import url(https://example.test/track.css); .question { color: red; }', secret: 'remove-me', avatarPerformance: { mode: 'balanced', maxVisible: 8, cacheEnabled: true }
    }
  }));
  app.get('/api/quiz-show/brand-kit', (_req, res) => res.json({
    success: true,
    brandKit: { id: 8, primary_color: '#abc', secondary_color: '#123456', logo_path: '/plugins/quiz-show/logo.png', local_path: 'C:\\Users\\secret\\logo.png' }
  }));
  app.get('/api/quiz-show/layouts/:id', (_req, res) => res.json({
    success: true,
    layout: {
      id: 7, name: 'Public fixture', resolution_width: 1920, resolution_height: 1080, orientation: 'horizontal',
      is_default: 1, created_at: 'private timestamp', secret: 'remove-me',
      layout_config: { mode: 'splitscreen', question: { gridColumn: 'C', gridRow: 2, size: 'large', visible: true, internal: 'remove-me' } }
    }
  }));
  return app;
}

function createActualRoundLeaderboardRouteFixture() {
  const routeHandlers = new Map();
  const api = {
    registerRoute: jest.fn((method, routePath, handler) => routeHandlers.set(`${method} ${routePath}`, handler)),
    getPluginDataDir: () => path.join(APP_ROOT, 'test-fixture-plugin-data'),
    log: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    getDatabase: jest.fn()
  };
  const plugin = new QuizShowPlugin(api);
  plugin.gameState = {
    ...makeQuizState(),
    currentQuestion: { question: 'Synthetic?', answers: ['A', 'B', 'C', 'D'], correct: 2 },
    answers: new Map([
      ['private-first-id', { answer: 'C', username: 'First Fixture', timestamp: 10 }],
      ['private-second-id', { answer: 'C', username: 'Second Fixture', timestamp: 20 }],
      ['private-wrong-id', { answer: 'A', username: 'Wrong Fixture', timestamp: 1 }]
    ]),
    pointsAwardedForRound: false
  };
  plugin.db = { prepare: jest.fn() };
  plugin.mainDb = { prepare: jest.fn() };
  plugin.addPoints = jest.fn();
  plugin.applyAnswerProgress = jest.fn();
  plugin.checkSeasonAutomation = jest.fn();
  plugin.registerRoutes();

  const handler = routeHandlers.get('get /api/quiz-show/leaderboard');
  if (typeof handler !== 'function') throw new Error('Actual Quiz Show round leaderboard route was not registered');
  const app = express();
  app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
  app.get('/api/quiz-show/leaderboard', handler);
  return { app, plugin };
}

describe('Quiz Show public surface projections', () => {
  test('gives every currently registered Quiz Show public event a fail-closed projection', () => {
    const duel = {
      active: true, winner: null,
      left: { label: 'Left', score: 2, streak: 1, users: ['private-id'] },
      right: { label: 'Right', score: 1, streak: 0, users: [] }
    };
    const fixtures = {
      'quiz-show:achievement-unlocked': { username: 'Fixture', label: 'Achievement', userId: 'private-id' },
      'quiz-show:brand-kit-updated': { primary_color: '#abc', id: 9 },
      'quiz-show:category-vote-ended': { selectedCategory: 'Science', votesByCategory: { Science: 3 }, totalVotes: 3 },
      'quiz-show:category-vote-started': { options: ['Science'], votesByUser: { 'private-id': { username: 'Fixture' } }, votesByCategory: { Science: 0 }, endsAt: 99 },
      'quiz-show:category-vote-update': { options: ['Science'], votesByUser: { 'private-id': { username: 'Fixture' } }, votesByCategory: { Science: 1 }, endsAt: 99 },
      'quiz-show:config-updated': { ultraKompaktModus: false, secret: 'remove' },
      'quiz-show:duel-ended': duel,
      'quiz-show:duel-update': duel,
      'quiz-show:error': { message: 'C:\\private\\error', type: 'no_questions_available' },
      'quiz-show:hide-leaderboard': undefined,
      'quiz-show:hide-timer': undefined,
      'quiz-show:hud-config-updated': { theme: 'dark', secret: 'remove' },
      'quiz-show:joker-activated': { type: '50', username: 'Fixture', userId: 'private-id', timestamp: 1, data: { hiddenAnswers: [1] }, isGiftActivated: false },
      'quiz-show:layout-updated': { customLayoutEnabled: false, layout: { secret: 'remove' } },
      'quiz-show:leaderboard-hide': undefined,
      'quiz-show:leaderboard-show': { leaderboard: [], displayType: 'round', animationStyle: 'fade' },
      'quiz-show:leaderboard-update': [],
      'quiz-show:leaderboard-updated': [{ username: 'Fixture', points: 3, userId: 'private-id' }],
      'quiz-show:play-sound': { filePath: 'C:\\private\\sound.mp3', volume: 1 },
      'quiz-show:quiz-ended': { mvp: { userId: 'private-id', username: 'Fixture', points: 3 } },
      'quiz-show:round-ended': { correctAnswer: 1, eliminatedUsers: ['private-id'], results: { secret: true } },
      'quiz-show:show-leaderboard': { leaderboard: [], displayType: 'round', animationStyle: 'fade' },
      'quiz-show:slot-machine-start': { categories: ['Science'], spinDuration: 3, spinSpeed: 100 },
      'quiz-show:slot-machine-stop': { selectedCategory: 'Science' },
      'quiz-show:state-update': { isRunning: false, answers: [['private-id', 'A']] },
      'quiz-show:stopped': {},
      'quiz-show:time-update': { timeRemaining: 3, totalTime: 30 }
    };
    const registered = [...OUTGOING_SOCKET_EVENTS].filter(event => event.startsWith('quiz-show:'));
    expect(Object.keys(fixtures).sort()).toEqual(registered.sort());
    for (const event of registered) {
      expect(projectPublicOverlayPayload(event, fixtures[event])).not.toBeUndefined();
    }
  });

  test('projects the actual broadcastGameState producer while retaining the local payload', () => {
    let rawEvent;
    const plugin = {
      gameState: makeQuizState(),
      config: {
        roundDuration: 30, totalRounds: 5, showRoundNumber: true, voterIconsEnabled: true,
        voterIconSize: 'medium', voterIconMaxVisible: 10, voterIconCompactMode: true,
        voterIconAnimation: 'fade', voterIconPosition: 'above', avatarPerformanceMode: 'balanced',
        avatarCacheEnabled: true, hudThemePreset: 'neon', reducedMotion: false,
        highContrast: false, ultraKompaktModus: false, ultraKompaktAnswerDelay: 3,
        giftJokerMappings: { secretGift: '50' }, privateApiKey: 'secret'
      },
      api: { emit: (event, payload) => { rawEvent = { event, payload }; } }
    };
    plugin.buildGameStatePayload = QuizShowPlugin.prototype.buildGameStatePayload;
    QuizShowPlugin.prototype.broadcastGameState.call(plugin);

    expect(rawEvent.event).toBe('quiz-show:state-update');
    expect(rawEvent.payload).not.toHaveProperty('answers');
    expect(rawEvent.payload.votersPerAnswer[0][0].userId).toBe('platform-user-secret');
    const projected = projectPublicOverlayPayload(rawEvent.event, rawEvent.payload);
    expect(projected.currentQuestion).toEqual({ question: 'Synthetic?', answers: ['A', 'B', 'C', 'D'] });
    expect(projected.votersPerAnswer[0]).toEqual([{ username: 'Fixture Viewer', profilePictureUrl: 'https://example.test/avatar.png' }]);
    expect(projected.duel.left).toEqual({ label: 'Left team', score: 1, streak: 1 });
    expect(JSON.stringify(projected)).not.toMatch(/platform-user-secret|another-platform-id|cacheEnabled|giftJokerMappings|correct/);
    expect(projectPublicOverlayPayload('quiz-show:state-update', { ...rawEvent.payload, currentQuestion: { ...rawEvent.payload.currentQuestion, correct: 2 } })).not.toHaveProperty('currentQuestion.correct');
    expect(projectPublicOverlayPayload('quiz-show:state-update', { isRunning: true, currentQuestion: { question: 'bad', answers: [] } })).toBeNull();

    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter({ name: '/' });
    adapter.broadcast({ data: [rawEvent.event, rawEvent.payload] }, { rooms: new Set(), except: new Set() });
    const local = adapter.broadcasts.find(call => !call.options.rooms?.has(PUBLIC_QUICK_TUNNEL_ROOM));
    const publicCall = adapter.broadcasts.find(call => call.options.rooms?.has(PUBLIC_QUICK_TUNNEL_ROOM));
    expect(local.packet.data[1]).toBe(rawEvent.payload);
    expect(publicCall.packet.data[1]).toEqual(projected);
  });

  test.each([
    {
      label: 'renders a normal category as text',
      category: 'Science',
      includeCategory: true,
      expectedDisplay: 'flex',
      expectedText: 'Science'
    },
    {
      label: 'renders HTML-like category content as text',
      category: '<img src=x onerror="window.__categoryInjected = true">',
      includeCategory: true,
      expectedDisplay: 'flex',
      expectedText: '<img src=x onerror="window.__categoryInjected = true">'
    },
    {
      label: 'hides a missing category',
      category: undefined,
      includeCategory: false,
      expectedDisplay: 'none'
    },
    {
      label: 'hides an empty category',
      category: '',
      includeCategory: true,
      expectedDisplay: 'none'
    },
    {
      label: 'bounds a long category to the projector limit',
      category: 'x'.repeat(1201),
      includeCategory: true,
      expectedDisplay: 'flex',
      expectedText: 'x'.repeat(1000)
    }
  ])('$label through the producer, public projection and original overlay', async scenario => {
    const { dom, handlers, emitted } = await createOverlayConsumer();
    try {
      const gameState = makeQuizState();
      if (scenario.includeCategory) {
        gameState.currentQuestion.category = scenario.category;
      } else {
        delete gameState.currentQuestion.category;
      }
      const plugin = {
        gameState,
        config: { roundDuration: 30, totalRounds: 5, showRoundNumber: true, voterIconsEnabled: true,
          voterIconSize: 'medium', voterIconMaxVisible: 10, voterIconCompactMode: true,
          voterIconAnimation: 'fade', voterIconPosition: 'above', avatarPerformanceMode: 'balanced',
          avatarCacheEnabled: true, hudThemePreset: 'neon', reducedMotion: false, highContrast: false,
          ultraKompaktModus: false, ultraKompaktAnswerDelay: 3 },
        api: { emit(event, payload) { const safe = projectPublicOverlayPayload(event, payload); handlers.get(event)?.(safe); } }
      };
      plugin.buildGameStatePayload = QuizShowPlugin.prototype.buildGameStatePayload;
      QuizShowPlugin.prototype.broadcastGameState.call(plugin);
      const projected = projectPublicOverlayPayload('quiz-show:state-update', plugin.buildGameStatePayload());
      expect(dom.window.document.getElementById('questionText').textContent).toContain('Synthetic?');
      expect(dom.window.document.getElementById('answerA').textContent).toBe('A');
      expect(dom.window.document.getElementById('categoryDisplay').style.display).toBe(scenario.expectedDisplay);
      if (scenario.expectedDisplay === 'flex') {
        expect(dom.window.document.getElementById('categoryText').textContent).toBe(scenario.expectedText);
      } else {
        expect(dom.window.document.getElementById('categoryText').textContent).not.toBe('');
      }
      expect(dom.window.document.querySelector('#categoryText img')).toBeNull();
      expect(dom.window.__categoryInjected).toBeUndefined();
      if (scenario.includeCategory) {
        expect(projected.currentQuestion.category).toBe(scenario.category.slice(0, 1000));
      } else {
        expect(projected.currentQuestion).not.toHaveProperty('category');
      }
      expect(emitted).toEqual([]);
    } finally {
      dom.window.close();
    }
  });

  test('projects only the original overlay display fields from existing public HTTP routes', async () => {
    const paths = [
      '/api/quiz-show/state', '/api/quiz-show/hud-config', '/api/quiz-show/brand-kit',
      '/api/quiz-show/layouts/7'
    ];
    for (const pathname of paths) {
      const [publicResponse, localResponse] = await Promise.all([
        request(createHttpFixture()).get(pathname).set('Host', 'quiz-fixture.trycloudflare.com'),
        request(createHttpFixture()).get(pathname).set('Host', '127.0.0.1:3000')
      ]);
      expect(publicResponse.status).toBe(200);
      expect(localResponse.status).toBe(200);
      expect(JSON.stringify(publicResponse.body)).not.toMatch(/openaiApiKey|platform-user-secret|remove-me|private timestamp|local_path|cacheEnabled|"correct"|"stats"|"questions"/);
      expect(JSON.stringify(localResponse.body)).toMatch(/remove-me|openaiApiKey|userId|local_path|"correct"|"stats"|"questions"/);
    }
  });

  test('serves the actual round route to public/local clients and the original overlay reader without mutations', async () => {
    const { app, plugin } = createActualRoundLeaderboardRouteFixture();
    const requestTarget = '/api/quiz-show/leaderboard?type=round';
    const before = { gameState: structuredClone(plugin.gameState), config: structuredClone(plugin.config) };
    const [publicResponse, localResponse] = await Promise.all([
      request(app).get(requestTarget).set('Host', 'quiz-fixture.trycloudflare.com'),
      request(app).get(requestTarget).set('Host', '127.0.0.1:3000')
    ]);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual({ success: true, leaderboard: [
      { username: 'First Fixture', points: 100 },
      { username: 'Second Fixture', points: 50 }
    ] });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual(publicResponse.body);
    const publicHead = await request(app).head(requestTarget).set('Host', 'quiz-fixture.trycloudflare.com');
    expect(publicHead.status).toBe(200);
    expect(publicHead.text || '').toBe('');
    expect({ gameState: structuredClone(plugin.gameState), config: structuredClone(plugin.config) }).toEqual(before);
    expect(plugin.db.prepare).not.toHaveBeenCalled();
    expect(plugin.mainDb.prepare).not.toHaveBeenCalled();
    expect(plugin.addPoints).not.toHaveBeenCalled();
    expect(plugin.applyAnswerProgress).not.toHaveBeenCalled();
    expect(plugin.checkSeasonAutomation).not.toHaveBeenCalled();
    expect(plugin.api.emit).not.toHaveBeenCalled();

    const consumer = await createOverlayConsumer({
      exposeRoundLeaderboardReader: true,
      fetchImpl: async url => {
        const response = await request(app).get(url).set('Host', 'quiz-fixture.trycloudflare.com');
        return { ok: response.status === 200, json: async () => response.body };
      }
    });
    try {
      consumer.dom.window.i18n = {
        t: (key, params) => key === 'plugins.quiz-show.runtime.overlay.points'
          ? `${params.points} points`
          : key
      };
      await consumer.dom.window.__showCurrentGameLeaderboard();
      const rows = [...consumer.dom.window.document.querySelectorAll('#leaderboardList .leaderboard-entry')];
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.leaderboard-username').textContent).toBe('First Fixture');
      expect(rows[0].querySelector('.leaderboard-points').textContent).toContain('100');
      expect(rows[1].querySelector('.leaderboard-username').textContent).toBe('Second Fixture');
      expect(rows[1].querySelector('.leaderboard-points').textContent).toContain('50');
      expect(consumer.dom.window.document.getElementById('leaderboardOverlay').classList.contains('hidden')).toBe(false);
    } finally {
      consumer.dom.window.close();
    }
  });

  test('serves an empty current round and rejects unsupported queries before building', async () => {
    const { app, plugin } = createActualRoundLeaderboardRouteFixture();
    plugin.gameState.answers = new Map();
    const empty = await request(app).get('/api/quiz-show/leaderboard?type=round').set('Host', 'quiz-fixture.trycloudflare.com');
    const localEmpty = await request(app).get('/api/quiz-show/leaderboard?type=round').set('Host', '127.0.0.1:3000');
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ success: true, leaderboard: [] });
    expect(localEmpty.status).toBe(200);
    expect(localEmpty.body).toEqual(empty.body);

    const consumer = await createOverlayConsumer({
      exposeRoundLeaderboardReader: true,
      fetchImpl: async url => {
        const response = await request(app).get(url).set('Host', 'quiz-fixture.trycloudflare.com');
        return { ok: response.status === 200, json: async () => response.body };
      }
    });
    try {
      consumer.dom.window.i18n = { t: key => key };
      const overlay = consumer.dom.window.document.getElementById('leaderboardOverlay');
      const list = consumer.dom.window.document.getElementById('leaderboardList');
      const question = consumer.dom.window.document.getElementById('questionSection');
      overlay.classList.remove('hidden');
      list.innerHTML = '<li class="leaderboard-entry">stale prior round</li>';
      question.style.display = 'none';
      await consumer.dom.window.__showCurrentGameLeaderboard();
      expect(list.children).toHaveLength(0);
      expect(overlay.classList.contains('hidden')).toBe(true);
      expect(question.style.display).toBe('');
    } finally {
      consumer.dom.window.close();
    }

    const invalidQueries = [
      '/api/quiz-show/leaderboard',
      '/api/quiz-show/leaderboard?type=season',
      '/api/quiz-show/leaderboard?type=round&type=round',
      '/api/quiz-show/leaderboard?type=round&extra=1'
    ];
    for (const pathname of invalidQueries) {
      const local = await request(app).get(pathname).set('Host', '127.0.0.1:3000');
      const publicResponse = await request(app).get(pathname).set('Host', 'quiz-fixture.trycloudflare.com');
      expect(local.status).toBe(400);
      expect(local.body).toEqual({ success: false, error: 'Unsupported leaderboard query' });
      expect(publicResponse.status).toBe(404);
      expect(publicResponse.body).toEqual({ error: 'Not found' });
    }
    expect(plugin.db.prepare).not.toHaveBeenCalled();
    expect(plugin.mainDb.prepare).not.toHaveBeenCalled();
  });

  test('rejects malformed state, HUD, and layout public responses closed', async () => {
    const middlewareApp = express();
    middlewareApp.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    middlewareApp.get('/api/quiz-show/state', (_req, res) => res.json({ success: true, config: { customLayoutEnabled: true, activeLayoutId: 'C:\\private' }, questions: [] }));
    middlewareApp.get('/api/quiz-show/hud-config', (_req, res) => res.json({ success: true, config: { theme: 'unsafe-theme' } }));
    middlewareApp.get('/api/quiz-show/layouts/7', (_req, res) => res.json({ success: true, layout: { id: 7, name: 'Fixture', resolution_width: 1920, resolution_height: 1080, orientation: 'horizontal', layout_config: { question: { gridColumn: 'Z;url(x)', gridRow: 1, size: 'large' } } } }));
    for (const pathname of ['/api/quiz-show/state', '/api/quiz-show/hud-config', '/api/quiz-show/layouts/7']) {
      const response = await request(middlewareApp).get(pathname).set('Host', 'quiz-fixture.trycloudflare.com');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Response unavailable' });
    }
  });

  test('drops custom CSS that would trigger public resource requests while retaining safe HUD fields', async () => {
    const response = await request(createHttpFixture())
      .get('/api/quiz-show/hud-config')
      .set('Host', 'quiz-fixture.trycloudflare.com');
    expect(response.status).toBe(200);
    expect(response.body.config.theme).toBe('dark');
    expect(response.body.config).not.toHaveProperty('customCSS');
  });

  test('does not invent a Quiz Show reconnect request or disclose the broad state GET as hydration', () => {
    const renderer = fs.readFileSync(path.join(APP_ROOT, 'plugins/quiz-show/quiz_show_overlay.js'), 'utf8');
    const connectHandler = renderer.match(/registerSocketHandler\('connect',[\s\S]*?\n\s*\}\);/);
    expect(connectHandler).not.toBeNull();
    expect(connectHandler[0]).not.toMatch(/emit\(|fetch\(/);
    expect(projectPublicOverlayPayload('quiz-show:get-state', {})).toBeUndefined();
  });
});
