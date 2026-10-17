'use strict';

// Synthetic Advanced Timer host pilot only. No LTTH server, plugin backend, database or profile.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const { Server } = require('../../app/node_modules/socket.io');
const { Server: EngineServer } = require('../../app/node_modules/engine.io');

const ROOT = path.resolve(__dirname, '../..');
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const TEMPLATES = Object.freeze(['default', 'progress', 'circular', 'minimal', 'big']);
const STATIC = new Map([
  ['/advanced-timer/overlay', ['app/plugins/advanced-timer/overlay.html', 'text/html; charset=utf-8']],
  ['/advanced-timer/overlay.js', ['app/plugins/advanced-timer/overlay/overlay.js', 'text/javascript; charset=utf-8']],
  ['/js/i18n-client.js', ['app/public/js/i18n-client.js', 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', ['app/node_modules/socket.io/client-dist/socket.io.js', 'text/javascript; charset=utf-8']]
]);

function createTimer(id, currentValue = 90, state = 'running') {
  return {
    id,
    name: 'Synthetic Timer',
    mode: 'countdown',
    current_value: currentValue,
    initial_duration: 90,
    target_value: 0,
    state,
    config: { animateOnRunning: false, animateOnComplete: false }
  };
}

async function createHostTimerFixture() {
  const hostUid = randomUUID();
  const stats = { requests: 0, denied: 0, connections: 0, rejectedSocketEvents: 0, timerStateReads: 0, tickCount: 0, pauseCount: 0, resumeCount: 0, resetCount: 0, faultDisconnects: 0 };
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  const timers = new Map(LOCALES.map(locale => [`fixture-timer-${locale}`, createTimer(`fixture-timer-${locale}`)]));
  const io = new Server({ serveClient: false });
  const allowedRequest = req => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);

  const server = http.createServer((req, res) => {
    stats.requests += 1;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The canonical original entry has an inline theme initializer and inline styles.
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${authority}; img-src 'none'; media-src 'none'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
    const deny = () => { stats.denied += 1; res.writeHead(404); res.end(); };
    if (!closing && allowedRequest(req) && req.url.split('?')[0] === '/socket.io/'
      && ['GET', 'POST'].includes(req.method)) return transport.handleRequest(req, res);
    if (closing || !allowedRequest(req) || !['GET', 'HEAD'].includes(req.method)) return deny();
    let url;
    try { url = new URL(req.url, `http://${authority}`); } catch (_) { return deny(); }
    if (url.pathname.includes('%') || req.url.includes('..')) return deny();

    if (url.pathname === '/advanced-timer/overlay') {
      const keys = [...url.searchParams.keys()];
      const timerId = url.searchParams.get('timer');
      const template = url.searchParams.get('template');
      const locale = url.searchParams.get('lang');
      if (keys.some(key => !['timer', 'template', 'lang'].includes(key)) || keys.length !== new Set(keys).size
        || (timerId !== null && (timerId.length > 100 || !/^[A-Za-z0-9_-]*$/.test(timerId)))
        || (template !== null && !TEMPLATES.includes(template))
        || (locale !== null && !LOCALES.includes(locale))) return deny();
    } else if (url.pathname === '/advanced-timer/overlay.js') {
      if (url.search !== '?v=3') return deny();
    } else if (url.search) return deny();

    const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (localeMatch) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const bytes = fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/locales', `${localeMatch[1]}.json`));
      res.writeHead(200);
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }

    const timerMatch = url.pathname.match(/^\/api\/advanced-timer\/timers\/([^/]+)(?:\/(rotator|threshold-effects))?$/);
    if (timerMatch) {
      const timerId = timerMatch[1];
      const timer = timers.get(timerId);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!timer) {
        res.writeHead(404);
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ success: false, error: 'Timer not found' }));
      }
      let response;
      if (timerMatch[2]) response = { success: true, settings: { enabled: false } };
      else {
        stats.timerStateReads += 1;
        response = { success: true, timer };
      }
      res.writeHead(200);
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(response));
    }

    const file = STATIC.get(url.pathname);
    if (!file) return deny();
    res.setHeader('Content-Type', file[1]);
    const bytes = fs.readFileSync(path.join(ROOT, file[0]));
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });

  transport = new EngineServer({
    maxHttpBufferSize: 8192,
    allowRequest: (req, callback) => callback(null, allowedRequest(req)),
    cors: { origin: false }
  });
  io.bind(transport);
  server.on('upgrade', (req, socket, head) => {
    if (closing || !allowedRequest(req) || req.url.split('?')[0] !== '/socket.io/') return socket.destroy();
    transport.handleUpgrade(req, socket, head);
  });
  io.on('connection', socket => {
    stats.connections += 1;
    socket.onAny(() => { stats.rejectedSocketEvents += 1; });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  authority = `127.0.0.1:${server.address().port}`;

  function getStats() {
    return {
      hostUid,
      ...stats,
      timers: [...timers.values()].map(({ id, current_value, state }) => ({ id, currentValue: current_value, state })),
      clients: io.of('/').sockets.size,
      closed: closing
    };
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
    const allowedKeys = {
      tick: ['command', 'id'], pause: ['command', 'id'], resume: ['command', 'id'], reset: ['command', 'id'],
      offlineState: ['command', 'id', 'state', 'currentValue'], unknown: ['command'], fault: ['command', 'kind'],
      getstats: ['command'], close: ['command']
    }[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats') return getStats();
    const timerId = command.id === undefined ? 'fixture-timer-de' : command.id;
    const timer = timers.get(timerId);
    if (command.command !== 'unknown' && !timer) throw new Error('Only fixture-timer-{de|en|es|fr} IDs are accepted');

    if (command.command === 'tick') {
      timer.current_value = 89;
      timer.state = 'running';
      io.emit('advanced-timer:tick', { id: timer.id, currentValue: timer.current_value, state: timer.state });
      stats.tickCount += 1;
    } else if (command.command === 'pause') {
      timer.state = 'paused';
      io.emit('advanced-timer:paused', { id: timer.id, currentValue: timer.current_value });
      stats.pauseCount += 1;
    } else if (command.command === 'resume') {
      if (timer.state !== 'paused') throw new Error('Only paused fixture timers can resume');
      timer.state = 'running';
      io.emit('advanced-timer:started', { id: timer.id, currentValue: timer.current_value });
      stats.resumeCount += 1;
    } else if (command.command === 'reset') {
      timer.current_value = 90;
      timer.state = 'stopped';
      io.emit('advanced-timer:reset', { id: timer.id, currentValue: timer.current_value });
      stats.resetCount += 1;
    } else if (command.command === 'offlineState') {
      if (!['running', 'paused', 'stopped', 'completed'].includes(command.state)) throw new Error('Unsupported fixture timer state');
      if (!Number.isFinite(command.currentValue) || command.currentValue < 0 || command.currentValue > 86400) {
        throw new Error('Fixture currentValue must be between 0 and 86400');
      }
      timer.state = command.state;
      timer.current_value = command.currentValue;
    } else if (command.command === 'unknown') {
      io.emit('advanced-timer:tick', { id: 'fixture-timer-unknown', currentValue: 1, state: 'paused' });
    } else if (command.command === 'fault') {
      if (command.kind !== 'disconnect') throw new Error('Fault kind must be disconnect');
      for (const socket of io.of('/').sockets.values()) socket.conn.close();
      stats.faultDisconnects += 1;
    }
    return getStats();
  }

  return { hostUid, origin: `http://${authority}`, getStats, execute, close };
}

async function main() {
  const fixture = await createHostTimerFixture();
  process.stdout.write(`${JSON.stringify({
    status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin,
    entries: LOCALES.map(locale => `${fixture.origin}/advanced-timer/overlay?timer=fixture-timer-${locale}&lang=${locale}`),
    canonicalEntrySource: 'app/plugins/advanced-timer/overlay.html via GET /advanced-timer/overlay',
    rendererSource: 'app/plugins/advanced-timer/overlay/overlay.js via /advanced-timer/overlay.js?v=3',
    guideFixtureOnlySource: 'app/plugins/advanced-timer/overlay/index.html is not the served canonical entry',
    commands: ['getstats', 'tick', 'pause', 'resume', 'reset', 'offlineState {"state":"paused","currentValue":75}', 'unknown', 'fault {"kind":"disconnect"}', 'close'],
    scope: 'synthetic-loopback-only-no-db-no-app-backend-no-obs-no-profile'
  })}\n`);
  const input = readline.createInterface({ input: process.stdin });
  let chain = Promise.resolve();
  input.on('line', line => {
    chain = chain.then(async () => {
      try {
        if (line.length > 8192) throw new Error('Command too large');
        const command = JSON.parse(line);
        process.stdout.write(`${JSON.stringify({ status: 'ok', ...(await fixture.execute(command)) })}\n`);
        if (command.command === 'close') input.close();
      } catch (error) { process.stdout.write(`${JSON.stringify({ status: 'rejected', error: error.message })}\n`); }
    });
  });
  input.on('close', () => { chain.then(() => fixture.close()); });
  process.once('SIGINT', () => { input.close(); });
  process.once('SIGTERM', () => { input.close(); });
}

module.exports = { createHostTimerFixture };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
