'use strict';

// Synthetic Spotlight Chatter host pilot only. No LTTH app, profile, database or TikTok session.
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
  ['/overlay/spotlight/chatter', ['app/plugins/spotlight/overlays/chatter.html', 'text/html; charset=utf-8']],
  ['/fonts/exo-2.css', ['app/public/fonts/exo-2.css', 'text/css; charset=utf-8']],
  ['/js/i18n-client.js', ['app/public/js/i18n-client.js', 'text/javascript; charset=utf-8']],
  ['/plugins/spotlight/lib/animations.js', ['app/plugins/spotlight/lib/animations.js', 'text/javascript; charset=utf-8']],
  ['/plugins/spotlight/lib/text-effects.js', ['app/plugins/spotlight/lib/text-effects.js', 'text/javascript; charset=utf-8']],
  ['/plugins/spotlight/lib/template-renderer.js', ['app/plugins/spotlight/lib/template-renderer.js', 'text/javascript; charset=utf-8']],
  ['/plugins/spotlight/overlays/single-overlay.js', ['app/plugins/spotlight/overlays/single-overlay.js', 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', ['app/node_modules/socket.io/client-dist/socket.io.js', 'text/javascript; charset=utf-8']]
]);

const SETTINGS = Object.freeze({
  designVariant: 'default',
  fontFamily: 'Exo 2',
  fontSize: '32px',
  fontColor: '#FFFFFF',
  usernameEffect: 'none',
  enableBorder: true,
  borderColor: '#00D8FF',
  enableBackground: true,
  backgroundColor: 'rgba(0, 0, 0, 0.92)',
  showProfilePicture: false,
  showUsername: true,
  hudAlignment: 'center',
  inAnimationType: 'none',
  outAnimationType: 'none',
  animationSpeed: 'fast',
  refreshIntervalSeconds: 0,
  hideOnNullUser: true,
  preloadImages: false
});

function syntheticUser(name, sessionToken) {
  return {
    nickname: name,
    profilePictureUrl: '',
    eventType: 'chatter',
    label: 'New Chat',
    overlaySessionToken: sessionToken
  };
}

async function createHostSpotlightFixture() {
  const hostUid = randomUUID();
  const stats = { requests: 0, denied: 0, connections: 0, updates: 0, sessionResets: 0, faultDisconnects: 0 };
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  let sessionNumber = 1;
  let currentName = 'Synthetic Chatter';
  let hasLastEvent = true;
  const io = new Server({ serveClient: false });
  const allowedRequest = req => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);

  const server = http.createServer((req, res) => {
    stats.requests += 1;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${authority}; img-src 'none'; media-src 'none'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
    const deny = () => { stats.denied += 1; res.writeHead(404); res.end(); };
    if (!closing && allowedRequest(req) && req.url.split('?')[0] === '/socket.io/'
      && ['GET', 'POST'].includes(req.method)) return transport.handleRequest(req, res);
    if (closing || !allowedRequest(req) || !['GET', 'HEAD'].includes(req.method)) return deny();
    let url;
    try { url = new URL(req.url, `http://${authority}`); } catch (_) { return deny(); }
    if (url.pathname.includes('%') || req.url.includes('..')) return deny();

    if (url.pathname === '/overlay/spotlight/chatter') {
      const keys = [...url.searchParams.keys()];
      const locale = url.searchParams.get('lang');
      if (keys.some(key => key !== 'lang') || keys.length > 1
        || (locale !== null && !LOCALES.includes(locale))) return deny();
    } else if (url.search) return deny();

    const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (localeMatch) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const bytes = fs.readFileSync(path.join(ROOT, 'app/plugins/spotlight/locales', `${localeMatch[1]}.json`));
      res.writeHead(200);
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    if (url.pathname === '/api/lastevent/settings/chatter') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200);
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ success: true, settings: SETTINGS }));
    }
    if (url.pathname === '/api/lastevent/last/chatter') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const sessionToken = `fixture-session-${sessionNumber}`;
      const response = { success: true, type: 'chatter', overlaySessionToken: sessionToken, user: hasLastEvent ? syntheticUser(currentName, sessionToken) : null };
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
    socket.onAny(() => { stats.denied += 1; });
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
      currentName: hasLastEvent ? currentName : null,
      sessionNumber,
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
      update: ['command'], reset: ['command'], getstats: ['command'], fault: ['command', 'kind'], close: ['command']
    }[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats') return getStats();
    if (command.command === 'update') {
      currentName = currentName === 'Synthetic Chatter' ? 'Updated Synthetic Chatter' : 'Synthetic Chatter';
      hasLastEvent = true;
      io.emit('lastevent.update.chatter', syntheticUser(currentName, `fixture-session-${sessionNumber}`));
      stats.updates += 1;
      return getStats();
    }
    if (command.command === 'reset') {
      sessionNumber += 1;
      currentName = 'Synthetic Chatter';
      hasLastEvent = false;
      io.emit('lastevent.session.reset', { overlaySessionToken: `fixture-session-${sessionNumber}` });
      stats.sessionResets += 1;
      return getStats();
    }
    if (command.command === 'fault' && command.kind === 'disconnect') {
      for (const socket of io.of('/').sockets.values()) socket.conn.close();
      stats.faultDisconnects += 1;
      return getStats();
    }
    throw new Error('Fault kind must be disconnect');
  }

  return { hostUid, origin: `http://${authority}`, getStats, execute, close };
}

async function main() {
  const fixture = await createHostSpotlightFixture();
  process.stdout.write(`${JSON.stringify({
    status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin,
    entries: LOCALES.map(locale => `${fixture.origin}/overlay/spotlight/chatter?lang=${locale}`),
    commands: ['getstats', 'update', 'reset', 'fault {"kind":"disconnect"}', 'close'],
    scope: 'synthetic-host-only-no-database-no-profile-no-avatar-or-external-requests'
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

module.exports = { createHostSpotlightFixture };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
