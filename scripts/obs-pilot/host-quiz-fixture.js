'use strict';

// Synthetic Quiz Show renderer host. It never constructs or starts the LTTH plugin.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const { Server } = require('../../app/node_modules/socket.io');
const { Server: EngineServer } = require('../../app/node_modules/engine.io');

const ROOT = path.resolve(__dirname, '../..');
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const STATIC = new Map([
  ['/quiz-show/overlay', ['app/plugins/quiz-show/quiz_show_overlay.html', 'text/html; charset=utf-8']],
  ['/css/themes.css', ['app/public/css/themes.css', 'text/css; charset=utf-8']],
  ['/quiz-show/quiz_show_overlay.css', ['app/plugins/quiz-show/quiz_show_overlay.css', 'text/css; charset=utf-8']],
  ['/quiz-show/quiz_show_overlay.js', ['app/plugins/quiz-show/quiz_show_overlay.js', 'text/javascript; charset=utf-8']],
  ['/js/public-overlay-render-mode.js', ['app/public/js/public-overlay-render-mode.js', 'text/javascript; charset=utf-8']],
  ['/js/i18n-client.js', ['app/public/js/i18n-client.js', 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', ['app/node_modules/socket.io/client-dist/socket.io.js', 'text/javascript; charset=utf-8']]
]);

const VOTER_CONFIG = Object.freeze({
  enabled: true, size: 'medium', maxVisible: 4, compactMode: true,
  animation: 'fade', position: 'above', performanceMode: 'minimal', cacheEnabled: false
});

function publicState({ round = 1, question = 'Synthetic fixture question?', category = 'Synthetic Category', answers = ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
  timeRemaining = 20, votersPerAnswer = { 0: [], 1: [], 2: [], 3: [] }, answerCount = 0, hiddenAnswers = [],
  revealedWrongAnswer = null, running = true } = {}) {
  return {
    isRunning: running,
    roundState: running ? 'running' : 'idle',
    currentRound: running ? round : 0,
    totalRounds: 3,
    showRoundNumber: true,
    currentQuestion: running ? { question, category, answers: [...answers] } : null,
    timeRemaining: running ? timeRemaining : 0,
    totalTime: 30,
    answerCount: running ? answerCount : 0,
    jokersUsed: {},
    jokerEvents: [],
    hiddenAnswers: running ? [...hiddenAnswers] : [],
    revealedWrongAnswer: running ? revealedWrongAnswer : null,
    giftJokerMappings: {},
    votersPerAnswer: running ? structuredClone(votersPerAnswer) : { 0: [], 1: [], 2: [], 3: [] },
    voterIconsConfig: { ...VOTER_CONFIG },
    themePreset: 'dark',
    reducedMotion: true,
    highContrast: false,
    duel: null,
    ultraKompaktModus: false,
    ultraKompaktAnswerDelay: 0
  };
}

function mergeTranslations(base, plugin) {
  if (!base || typeof base !== 'object' || Array.isArray(base)) return structuredClone(plugin);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(plugin || {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeTranslations(result[key], value)
      : value;
  }
  return result;
}

function localeCatalog(locale) {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/locales', `${locale}.json`), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/quiz-show/locales', `${locale}.json`), 'utf8'));
  return mergeTranslations(base, plugin);
}

function attachCommandInput(fixture, input, output = process.stdout) {
  let chain = Promise.resolve();
  let finish;
  const closed = new Promise(resolve => { finish = resolve; });
  input.on('line', line => {
    chain = chain.then(async () => {
      try {
        if (line.length > 8192) throw new Error('Command too large');
        const command = JSON.parse(line);
        output.write(`${JSON.stringify({ status: 'ok', ...(await fixture.execute(command))})}\n`);
        if (command.command === 'close') input.close();
      } catch (error) { output.write(`${JSON.stringify({ status: 'rejected', error: error.message })}\n`); }
    });
  });
  input.on('close', () => { chain.then(() => fixture.close()).then(finish); });
  return { closed };
}

async function createHostQuizFixture() {
  const hostUid = randomUUID();
  const stats = { requests: 0, denied: 0, connections: 0, rejectedSocketEvents: 0, stateRequests: 0, roundsAdvanced: 0, resets: 0, errors: 0, faultDisconnects: 0 };
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  let state = publicState();
  let leaderboard = [{ username: 'Fixture Viewer', points: 100 }, { username: 'Second Fixture', points: 50 }];
  const io = new Server({ serveClient: false, maxHttpBufferSize: 8192 });
  const allowedRequest = req => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);
  const deny = (res) => { stats.denied += 1; res.writeHead(404); res.end(); };

  const server = http.createServer((req, res) => {
    stats.requests += 1;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${authority}; img-src 'none'; media-src 'none'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
    if (!closing && allowedRequest(req) && req.url.split('?')[0] === '/socket.io/' && ['GET', 'POST'].includes(req.method)) {
      return transport.handleRequest(req, res);
    }
    if (closing || !allowedRequest(req) || !['GET', 'HEAD'].includes(req.method)) return deny(res);
    let url;
    try { url = new URL(req.url, `http://${authority}`); } catch (_) { return deny(res); }
    if (url.pathname.includes('%') || req.url.includes('..')) return deny(res);
    const send = (status, type, body) => {
      res.setHeader('Content-Type', type);
      res.writeHead(status);
      res.end(req.method === 'HEAD' ? undefined : body);
    };

    if (url.pathname === '/quiz-show/overlay') {
      if ([...url.searchParams.keys()].some(key => key !== 'lang') || url.searchParams.size > 1
        || (url.searchParams.has('lang') && !LOCALES.includes(url.searchParams.get('lang')))) return deny(res);
      return send(200, 'text/html; charset=utf-8', fs.readFileSync(path.join(ROOT, STATIC.get(url.pathname)[0])));
    }
    if (url.pathname === '/api/i18n/translations/de' || /^\/api\/i18n\/translations\/(en|es|fr)$/.test(url.pathname)) {
      if (url.search) return deny(res);
      const locale = url.pathname.split('/').pop();
      return send(200, 'application/json; charset=utf-8', JSON.stringify(localeCatalog(locale)));
    }
    if (url.pathname === '/api/quiz-show/hud-config' && !url.search) {
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ success: true, config: {
        theme: 'dark', questionAnimation: 'slide-in-bottom', correctAnimation: 'glow-pulse', wrongAnimation: 'shake',
        timerVariant: 'bar', answersLayout: 'grid', animationSpeed: 1, glowIntensity: 1, customCSS: '',
        streamWidth: 1920, streamHeight: 1080, customLayoutEnabled: false, fonts: { sizeQuestion: '2rem' }
      } }));
    }
    if (url.pathname === '/api/quiz-show/brand-kit' && !url.search) {
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ success: true, brandKit: {} }));
    }
    if (url.pathname === '/api/quiz-show/state' && !url.search) {
      // Original renderer always probes active-layout state; return default layout only.
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ success: true, config: { customLayoutEnabled: false, activeLayoutId: null } }));
    }
    if (url.pathname === '/api/quiz-show/leaderboard') {
      if (req.url !== '/api/quiz-show/leaderboard?type=round') return deny(res);
      return send(200, 'application/json; charset=utf-8', JSON.stringify({ success: true, leaderboard }));
    }
    if (url.search) return deny(res);
    const file = STATIC.get(url.pathname);
    if (!file) return deny(res);
    return send(200, file[1], fs.readFileSync(path.join(ROOT, file[0])));
  });

  transport = new EngineServer({ maxHttpBufferSize: 8192, allowRequest: (req, callback) => callback(null, allowedRequest(req)), cors: { origin: false } });
  io.bind(transport);
  server.on('upgrade', (req, socket, head) => {
    if (closing || !allowedRequest(req) || req.url.split('?')[0] !== '/socket.io/') return socket.destroy();
    transport.handleUpgrade(req, socket, head);
  });
  io.on('connection', socket => {
    stats.connections += 1;
    socket.onAny((event, ...args) => {
      if (event === 'quiz-show:get-public-state' && args.length === 0) {
        stats.stateRequests += 1;
        socket.emit('quiz-show:state-update', structuredClone(state));
      } else {
        stats.rejectedSocketEvents += 1;
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  authority = `127.0.0.1:${server.address().port}`;

  function getStats() {
    return { hostUid, ...stats, state: structuredClone(state), leaderboard: structuredClone(leaderboard), clients: io.of('/').sockets.size, closed: closing };
  }

  function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = io.close().then(() => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    }));
    return closePromise;
  }

  async function execute(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('JSON command object required');
    const schemas = {
      question: ['command'], answer: ['command'], reveal: ['command'], score: ['command'], hidescore: ['command'], error: ['command'], joker: ['command'],
      newround: ['command'], reset: ['command'], fault: ['command', 'kind'], getstats: ['command'], close: ['command']
    };
    const allowedKeys = schemas[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats') return getStats();

    if (command.command === 'question' || command.command === 'newround') {
      const nextRound = command.command === 'newround' ? Math.min(3, state.currentRound + 1) : Math.max(1, state.currentRound);
      state = publicState({ round: nextRound });
      io.emit('quiz-show:state-update', structuredClone(state));
      if (command.command === 'newround') stats.roundsAdvanced += 1;
    } else if (command.command === 'answer') {
      const votersPerAnswer = { 0: [], 1: [{ username: 'Fixture Viewer', profilePictureUrl: null }], 2: [], 3: [] };
      state = { ...state, answerCount: 1, votersPerAnswer };
      io.emit('quiz-show:state-update', structuredClone(state));
    } else if (command.command === 'reveal') {
      io.emit('quiz-show:round-ended', {
        correctAnswer: 1, correctAnswerLetter: 'B', correctAnswerText: state.currentQuestion?.answers?.[1] || 'Choice B',
        answerDisplayDuration: 6, votersPerAnswer: structuredClone(state.votersPerAnswer), voterIconsConfig: { ...VOTER_CONFIG }
      });
    } else if (command.command === 'score') {
      io.emit('quiz-show:show-leaderboard', { leaderboard: structuredClone(leaderboard), displayType: 'round', animationStyle: 'fade' });
    } else if (command.command === 'hidescore') {
      io.emit('quiz-show:hide-leaderboard');
    } else if (command.command === 'error') {
      io.emit('quiz-show:error', { type: 'no_questions_available', message: 'Synthetic fixture error: no questions available' });
      stats.errors += 1;
    } else if (command.command === 'joker') {
      io.emit('quiz-show:joker-activated', { type: 'time', username: 'Synthetic Viewer', data: {} });
    } else if (command.command === 'reset') {
      state = publicState({ running: false });
      io.emit('quiz-show:stopped');
      io.emit('quiz-show:state-update', structuredClone(state));
      stats.resets += 1;
    } else if (command.command === 'fault') {
      if (command.kind !== 'disconnect') throw new Error('Fault kind must be disconnect');
      for (const socket of io.of('/').sockets.values()) socket.conn.close();
      stats.faultDisconnects += 1;
    }
    return getStats();
  }

  return {
    hostUid,
    origin: `http://${authority}`,
    getStats,
    execute,
    close,
    entries: LOCALES.map(locale => `${`http://${authority}`}/quiz-show/overlay?lang=${locale}`)
  };
}

async function main() {
  const fixture = await createHostQuizFixture();
  process.stdout.write(`${JSON.stringify({
    status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin, entries: fixture.entries,
    canonicalEntrySource: 'app/plugins/quiz-show/quiz_show_overlay.html via GET /quiz-show/overlay',
    rendererSource: 'app/plugins/quiz-show/quiz_show_overlay.js plus canonical CSS and shared local assets',
    allowedCommands: ['question', 'answer', 'reveal', 'score', 'hidescore', 'error', 'joker', 'newround', 'reset', 'fault {"kind":"disconnect"}', 'getstats', 'close'],
    scope: 'synthetic-loopback-only-default-layout-no-plugin-no-db-no-provider-no-audio-no-mpv-no-obs-no-profile'
  })}\n`);
  const input = readline.createInterface({ input: process.stdin });
  attachCommandInput(fixture, input);
  process.once('SIGINT', () => input.close());
  process.once('SIGTERM', () => input.close());
}

module.exports = { createHostQuizFixture, publicState, VOTER_CONFIG, attachCommandInput };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
