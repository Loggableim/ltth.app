'use strict';

// Synthetic host pilot only. No Music Bot runtime, queue DB, provider, profile, or audio process.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const { Server } = require('../../app/node_modules/socket.io');
const { Server: EngineServer } = require('../../app/node_modules/engine.io');
const { isHttpAllowed, isOutgoingSocketEventAllowed } = require('../../app/modules/public-overlay-registry');

const ROOT = path.resolve(__dirname, '../..');
const PLUGIN_ROOT = path.join(ROOT, 'app/plugins/music-bot');
function getMusicBotTranslations(locale) {
  const pluginCatalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'locales', `${locale}.json`), 'utf8'));
  const canonical = pluginCatalog.plugins?.['music-bot'];
  if (!canonical || typeof canonical !== 'object') throw new Error(`Music Bot locale is missing canonical namespace: ${locale}`);
  return { plugins: { 'music-bot': canonical } };
}
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const EVENTS = Object.freeze({
  request: 'musicbot:request-status', nowPlaying: 'musicbot:now-playing',
  pause: 'musicbot:paused', resume: 'musicbot:resumed', stop: 'musicbot:playback-stopped',
  queue: 'musicbot:queue-update', sync: 'musicbot:playback-sync'
});
const TRACKS = Object.freeze([
  Object.freeze({ id: 'fixture-track-01', title: 'Synthetic Sunrise', artist: 'Fixture Ensemble', requestedBy: 'viewer-one', duration: 240 }),
  Object.freeze({ id: 'fixture-track-02', title: 'Loopback Dreams', artist: 'Local Signals', requestedBy: 'viewer-two', duration: 180 })
]);
const STATIC = new Map([
  ['/plugins/music-bot/overlay.html', [path.join(PLUGIN_ROOT, 'overlay.html'), 'text/html; charset=utf-8']],
  ['/js/i18n-client.js', [path.join(ROOT, 'app/public/js/i18n-client.js'), 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', [path.join(ROOT, 'app/node_modules/socket.io/client-dist/socket.io.js'), 'text/javascript; charset=utf-8']]
]);

function isPublicHttpAllowed(method, pathname) {
  return isHttpAllowed({ method, pathname });
}

async function createHostMusicFixture() {
  const hostUid = randomUUID();
  const events = new EventEmitter();
  const stats = { requests: 0, denied: 0, connections: 0, clientEvents: 0, emitted: 0, localeRequests: [], localeResponses: [], localeChanges: [] };
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  let currentIndex = -1;
  let state = 'idle';
  let position = 0;
  let stateStartedAt = 0;
  const getPosition = () => state === 'playing' && stateStartedAt
    ? Math.min(TRACKS[currentIndex].duration, position + (Date.now() - stateStartedAt) / 1000)
    : position;
  const allowedRequest = req => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);

  const server = http.createServer((req, res) => {
    stats.requests += 1;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${authority}; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
    const deny = () => { stats.denied += 1; res.writeHead(404); res.end(); };
    let url;
    try { url = new URL(req.url, `http://${authority || '127.0.0.1'}`); } catch (_) { return deny(); }
    if (closing || !allowedRequest(req) || !isPublicHttpAllowed(req.method, url.pathname)) return deny();
    if (url.pathname === '/socket.io/' && ['GET', 'POST'].includes(req.method)) return transport.handleRequest(req, res);
    if (!['GET', 'HEAD'].includes(req.method) || req.url.includes('..') || url.pathname.includes('%')) return deny();
    const isEntry = url.pathname === '/plugins/music-bot/overlay.html';
    if (isEntry) {
      const keys = [...url.searchParams.keys()];
      if (keys.some(key => !['lang', 'design', 'theme', 'position'].includes(key))
        || keys.length !== new Set(keys).size
        || (url.searchParams.has('lang') && !LOCALES.includes(url.searchParams.get('lang')))) return deny();
    } else if (url.search) return deny();
    const locale = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (locale) {
      stats.localeRequests.push(locale[1]);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const sourcePath = path.join(PLUGIN_ROOT, 'locales', `${locale[1]}.json`);
      const sourceBytes = fs.readFileSync(sourcePath);
      const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
      const payload = getMusicBotTranslations(locale[1]);
      const bytes = Buffer.from(JSON.stringify(payload));
      stats.localeResponses.push({ locale: locale[1], sourceBytes: sourceBytes.length, sourceSha256: sourceHash, payloadSha256: createHash('sha256').update(bytes).digest('hex') });
      res.writeHead(200); return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    const file = STATIC.get(url.pathname);
    if (!file) return deny();
    res.setHeader('Content-Type', file[1]);
    const bytes = fs.readFileSync(file[0]);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : bytes);
  });

  const io = new Server({ serveClient: false, maxHttpBufferSize: 8192 });
  transport = new EngineServer({
    maxHttpBufferSize: 8192,
    allowRequest: (req, callback) => callback(null, !closing && allowedRequest(req)),
    cors: { origin: false }
  });
  io.bind(transport);
  server.on('upgrade', (req, socket, head) => {
    if (closing || !allowedRequest(req) || req.url.split('?')[0] !== '/socket.io/') return socket.destroy();
    transport.handleUpgrade(req, socket, head);
  });

  function emit(event, payload) {
    if (!isOutgoingSocketEventAllowed(event)) throw new Error(`Public socket registry rejects ${event}`);
    io.emit(event, payload);
    stats.emitted += 1;
  }
  function trackPayload() {
    if (currentIndex < 0) return null;
    return { ...TRACKS[currentIndex], duration: TRACKS[currentIndex].duration, position: getPosition(), state };
  }
  function emitQueue() {
    const queue = currentIndex < 0 ? [] : TRACKS.slice(currentIndex + 1).map(track => ({ ...track }));
    emit(EVENTS.queue, { queue, length: queue.length });
  }
  io.on('connection', socket => {
    stats.connections += 1;
    events.emit('connection');
    socket.on(EVENTS.request, (...args) => {
      stats.clientEvents += 1;
      events.emit('status-request');
      if (args.length !== 0) { stats.denied += 1; return; }
      emit(EVENTS.nowPlaying, trackPayload());
      emitQueue();
    });
    socket.onAny(event => {
      if (event !== EVENTS.request) stats.denied += 1;
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  authority = `127.0.0.1:${server.address().port}`;
  function getStats() {
    return { hostUid, ...stats, clients: io.of('/').sockets.size, state, track: trackPayload(), closed: closing };
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
      status: ['command'], play: ['command', 'track'], pause: ['command'],
      clear: ['command'], locale: ['command', 'locale'], getstats: ['command'], close: ['command']
    }[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats' || command.command === 'status') return getStats();
    if (command.command === 'locale') {
      if (!LOCALES.includes(command.locale)) throw new Error('locale must be de, en, es or fr');
      stats.localeChanges.push(command.locale);
      // The real server's POST /api/i18n/current emits this server-to-client event.
      // This bounded fixture command mirrors only that sender; it does not persist locale state.
      io.emit('locale-changed', { locale: command.locale });
      return getStats();
    }
    if (command.command === 'play') {
      const index = command.track === undefined ? (currentIndex + 1) % TRACKS.length : Number(command.track);
      if (!Number.isInteger(index) || index < 0 || index >= TRACKS.length) throw new Error('track must be 0 or 1');
      currentIndex = index; position = 0; stateStartedAt = Date.now(); state = 'playing';
      emit(EVENTS.nowPlaying, trackPayload()); emitQueue();
    } else if (command.command === 'pause') {
      if (currentIndex < 0) throw new Error('no synthetic track is active');
      if (state === 'playing') { position = getPosition(); state = 'paused'; stateStartedAt = 0; emit(EVENTS.pause, {}); }
      else if (state === 'paused') { stateStartedAt = Date.now(); state = 'playing'; emit(EVENTS.resume, {}); }
      else throw new Error('no synthetic track is active');
      emit(EVENTS.sync, { ...trackPayload() });
    } else if (command.command === 'clear') {
      currentIndex = -1; position = 0; stateStartedAt = 0; state = 'idle';
      emit(EVENTS.stop, {}); emitQueue();
    }
    return getStats();
  }
  return { hostUid, origin: `http://${authority}`, events, getStats, execute, close };
}

async function main() {
  const fixture = await createHostMusicFixture();
  process.stdout.write(`${JSON.stringify({ status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin, entries: LOCALES.map(locale => `${fixture.origin}/plugins/music-bot/overlay.html?lang=${locale}&design=card`), scope: 'synthetic-host-only-no-music-backend-no-audio' })}\n`);
  const input = readline.createInterface({ input: process.stdin });
  let chain = Promise.resolve();
  input.on('line', line => {
    chain = chain.then(async () => {
      try {
        if (line.length > 1024) throw new Error('Command too large');
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

module.exports = { createHostMusicFixture, EVENTS, LOCALES, STATIC, TRACKS, isPublicHttpAllowed };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
