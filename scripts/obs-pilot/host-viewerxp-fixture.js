'use strict';

// Source-bound local browser fixture only. No LTTH app server, user profile,
// database, public tunnel, or OBS instance is started.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const crypto = require('node:crypto');
const { Server } = require('../../app/node_modules/socket.io');
const { Server: EngineServer } = require('../../app/node_modules/engine.io');

const ROOT = path.resolve(__dirname, '../..');
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const ENTRY_PATHS = Object.freeze({
  'xp-bar': 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html',
  leaderboard: 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html',
  'level-up': 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/level-up.html'
});
const STATIC = new Map([
  ['/js/i18n-client.js', ['app/public/js/i18n-client.js', 'text/javascript; charset=utf-8']],
  ['/plugins/viewer-leaderboard/viewer-xp-i18n.js', ['app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-i18n.js', 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', ['app/node_modules/socket.io/client-dist/socket.io.js', 'text/javascript; charset=utf-8']]
]);

async function createHostViewerXpFixture() {
  const hostUid = randomUUID();
  const stats = { requests: 0, denied: 0, connections: 0, emitted: 0, localeChanges: [], entries: [], servedSources: [] };
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  let io;
  const allowedRequest = req => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);
  function serveSource(req, res, pathname, sourcePath, contentType) {
    const bytes = fs.readFileSync(path.join(ROOT, sourcePath));
    stats.servedSources.push({
      requestPath: pathname,
      sourcePath,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    });
    res.setHeader('Content-Type', contentType);
    res.writeHead(200);
    return res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  const server = http.createServer((req, res) => {
    stats.requests += 1;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${authority}; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
    const deny = () => { stats.denied += 1; res.writeHead(404); res.end(); };
    if (!closing && allowedRequest(req) && req.url.split('?')[0] === '/socket.io/'
      && ['GET', 'POST'].includes(req.method)) return transport.handleRequest(req, res);
    if (closing || !allowedRequest(req) || !['GET', 'HEAD'].includes(req.method)) return deny();
    let url;
    try { url = new URL(req.url, `http://${authority}`); } catch (_) { return deny(); }
    if (url.pathname.includes('%') || req.url.includes('..')) return deny();

    const entry = Object.entries(ENTRY_PATHS).find(([name]) => url.pathname === `/overlay/viewer-xp/${name}`);
    if (entry) {
      const allowed = {
        'xp-bar': new Set(['lang', 'username', 'autoHide', 'duration', 'showPic']),
        leaderboard: new Set(['lang', 'limit', 'days', 'refresh', 'theme', 'accent', 'textColor', 'subtitleColor', 'font']),
        'level-up': new Set(['lang', 'sound', 'duration', 'minLevel'])
      }[entry[0]];
      if ([...url.searchParams.keys()].some(key => !allowed.has(key))
        || url.searchParams.getAll('lang').length !== 1
        || !LOCALES.includes(url.searchParams.get('lang'))) return deny();
      stats.entries.push(entry[0]);
      return serveSource(req, res, url.pathname, entry[1], 'text/html; charset=utf-8');
    }

    const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (localeMatch && !url.search) {
      return serveSource(req, res, url.pathname, `app/plugins/milestone-leaderboard/locales/${localeMatch[1]}.json`, 'application/json; charset=utf-8');
    }

    const asset = STATIC.get(url.pathname);
    if (!asset || url.search) return deny();
    return serveSource(req, res, url.pathname, asset[0], asset[1]);
  });

  io = new Server({ serveClient: false });
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
    socket.onAny(() => {}); // The fixture has no client-controlled write operation.
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  authority = `127.0.0.1:${server.address().port}`;

  function getStats() {
    return { hostUid, ...stats, clients: io.of('/').sockets.size, closed: closing };
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
      getstats: ['command'],
      locale: ['command', 'locale'],
      profile: ['command'],
      leaderboard: ['command'],
      'level-up': ['command'],
      close: ['command']
    }[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats') return getStats();
    if (io.of('/').sockets.size !== 1) throw new Error('Exactly one isolated browser renderer must be connected');
    if (command.command === 'locale') {
      if (!LOCALES.includes(command.locale)) throw new Error('locale must be de, en, es or fr');
      stats.localeChanges.push(command.locale);
      io.emit('locale-changed', { locale: command.locale });
    } else if (command.command === 'profile') {
      io.emit('viewer-xp:public-profile', {
        username: 'Fixture Viewer', name_color: '#2468ac', title: 'Fixture title', level: 7,
        xp_progress: 11, xp_for_next_level: 40, xp_progress_percent: 27.5, profilePictureUrl: null
      });
    } else if (command.command === 'leaderboard') {
      io.emit('viewer-xp:public-leaderboard', [{
        username: 'Fixture Viewer', name_color: '#2468ac', title: 'Fixture title', level: 7, xp: 321, rank: 1
      }]);
    } else {
      io.emit('viewer-xp:public-level-up', { username: 'Fixture Viewer', oldLevel: 7, newLevel: 8 });
    }
    stats.emitted += 1;
    return getStats();
  }
  return { hostUid, origin: `http://${authority}`, getStats, execute, close };
}

async function main() {
  const fixture = await createHostViewerXpFixture();
  process.stdout.write(`${JSON.stringify({ status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin, entries: Object.keys(ENTRY_PATHS).map(name => `${fixture.origin}/overlay/viewer-xp/${name}?lang=de`), scope: 'loopback-only-source-bound-synthetic-viewerxp-no-app-server-no-obs' })}\n`);
  const input = readline.createInterface({ input: process.stdin });
  let chain = Promise.resolve();
  input.on('line', line => {
    chain = chain.then(async () => {
      try {
        if (line.length > 8192) throw new Error('Command too large');
        const command = JSON.parse(line);
        process.stdout.write(`${JSON.stringify({ status: 'ok', ...(await fixture.execute(command)) })}\n`);
        if (command.command === 'close') input.close();
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ status: 'rejected', error: error.message })}\n`);
      }
    });
  });
  input.on('close', () => { chain.then(() => fixture.close()); });
  process.once('SIGINT', () => input.close());
  process.once('SIGTERM', () => input.close());
}

module.exports = { createHostViewerXpFixture };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
