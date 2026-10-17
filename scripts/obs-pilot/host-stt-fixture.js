'use strict';

// Synthetic host pilot only. No LTTH server, profile, speech provider or VM receipt.
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
  ['/overlay/stt-ticker', ['app/plugins/stt-ticker/overlay/ticker.html', 'text/html; charset=utf-8']],
  ['/js/i18n-client.js', ['app/public/js/i18n-client.js', 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', ['app/node_modules/socket.io/client-dist/socket.io.js', 'text/javascript; charset=utf-8']]
]);

async function createHostSttFixture() {
  const hostUid = randomUUID();
  const stats = { requests: 0, denied: 0, connections: 0, emitted: 0, translationFault: false, localeChanges: [] };
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  const allowedRequest = (req) => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);
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
    // No encoded paths, arbitrary query controls or app admin/API surfaces.
    if (url.pathname.includes('%') || req.url.includes('..')) return deny();
    const isEntry = url.pathname === '/overlay/stt-ticker';
    if (isEntry) {
      const keys = [...url.searchParams.keys()];
      if (keys.some(key => key !== 'lang') || keys.length > 1
        || (keys.length === 1 && !LOCALES.includes(url.searchParams.get('lang')))) return deny();
    } else if (url.search) return deny();
    const locale = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (locale) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (stats.translationFault) { res.writeHead(503); return res.end(req.method === 'HEAD' ? undefined : '{"error":"synthetic_unavailable"}'); }
      const bytes = fs.readFileSync(path.join(ROOT, 'app/plugins/stt-ticker/locales', `${locale[1]}.json`));
      res.writeHead(200); return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    const file = STATIC.get(url.pathname);
    if (!file) return deny();
    res.setHeader('Content-Type', file[1]);
    const bytes = fs.readFileSync(path.join(ROOT, file[0]));
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : bytes);
  });
  const io = new Server({
    serveClient: false,
  });
  transport = new EngineServer({
    maxHttpBufferSize: 8192,
    allowRequest: (req, callback) => callback(null, allowedRequest(req)),
    cors: { origin: false }
  });
  // Route Engine.IO explicitly: automatic attach also captures the exact browser-bundle GET.
  io.bind(transport);
  server.on('upgrade', (req, socket, head) => {
    if (closing || !allowedRequest(req) || req.url.split('?')[0] !== '/socket.io/') return socket.destroy();
    transport.handleUpgrade(req, socket, head);
  });
  io.on('connection', (socket) => {
    stats.connections += 1;
    // This pilot accepts no renderer controls, writes or relayed client events.
    socket.onAny(() => { stats.denied += 1; });
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
      transcript: ['command', 'text'], interim: ['command', 'text'], clear: ['command'],
      fault: ['command', 'kind', 'enabled'], locale: ['command', 'locale'], getstats: ['command'], close: ['command']
    }[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats') return getStats();
    if (command.command === 'locale') {
      if (!LOCALES.includes(command.locale)) throw new Error('locale must be de, en, es or fr');
      stats.localeChanges.push(command.locale);
      // Mirrors the production server's locale-changed sender using only this synthetic host.
      io.emit('locale-changed', { locale: command.locale });
      return getStats();
    }
    if (command.command === 'fault') {
      if (command.kind === 'disconnect' && command.enabled === undefined) {
        for (const socket of io.of('/').sockets.values()) socket.conn.close();
      } else if (command.kind === 'translations' && typeof command.enabled === 'boolean') {
        stats.translationFault = command.enabled;
      } else throw new Error('Fault requires disconnect or translations with Boolean enabled');
      return getStats();
    }
    if (command.command !== 'clear' && (typeof command.text !== 'string' || command.text.length > 2000)) throw new Error('Synthetic text must be at most 2000 characters');
    if (command.command === 'clear') io.emit('stt-ticker:clear');
    if (command.command === 'interim') io.emit('stt-ticker:interim', { text: command.text, isFinal: false });
    if (command.command === 'transcript') {
      io.emit('stt-ticker:interim', { text: '', isFinal: true });
      io.emit('stt-ticker:transcript', { text: command.text, segments: [{ id: stats.emitted + 1, text: command.text }] });
    }
    stats.emitted += 1;
    return getStats();
  }
  return { hostUid, origin: `http://${authority}`, getStats, execute, close };
}

async function main() {
  const fixture = await createHostSttFixture();
  process.stdout.write(`${JSON.stringify({ status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin, entries: LOCALES.map(locale => `${fixture.origin}/overlay/stt-ticker?lang=${locale}`), scope: 'synthetic-host-only-no-vm-receipt' })}\n`);
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

module.exports = { createHostSttFixture };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
