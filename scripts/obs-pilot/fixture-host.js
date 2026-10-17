'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('../../app/node_modules/socket.io');
const { DEFAULT_PORT, HOST, isVerifiedIsolationReceipt, readIsolationReceipt } = require('./safety-contract');

const ROOT = path.resolve(__dirname, '../..');
const HUD_PATH = path.join(ROOT, 'app/plugins/sidekick/overlay/sidekick-hud.html');
const SOCKET_BUNDLE_PATH = path.join(ROOT, 'app/node_modules/socket.io-client/dist/socket.io.js');
const STATUS_PATH = '/api/sidekick/public-status';
const EVENTS_PATH = '/api/sidekick/public-events';
const HUD_PATHNAME = '/overlay/sidekick/hud';

const STATUS_PHASES = Object.freeze([
  Object.freeze({ connected: true, muted: false, chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 }),
  Object.freeze({ connected: true, muted: true, chatsPerMinute: 12, totalGifts: 3, totalFollows: 2, activeViewers: 5 }),
  Object.freeze({ connected: false, muted: false, chatsPerMinute: 0, totalGifts: 3, totalFollows: 2, activeViewers: 0 }),
  Object.freeze({ connected: true, muted: false, chatsPerMinute: 8, totalGifts: 4, totalFollows: 3, activeViewers: 6 })
]);

const SYNTHETIC_EVENTS = Object.freeze([
  Object.freeze({ type: 'chat', ts: 1, nickname: 'Pilot Viewer', payload: Object.freeze({ comment: 'Synthetic OBS pilot chat', commentTruncated: false }) }),
  Object.freeze({ type: 'gift', ts: 2, nickname: 'Pilot Viewer', payload: Object.freeze({ giftName: 'Synthetic Rose' }) })
]);

function sendJson(res, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function createPilotFixture({ failFirstStatus = true } = {}) {
  let phase = 0;
  let statusFailuresRemaining = failFirstStatus ? 1 : 0;
  let closed = false;
  let server;
  let io;
  let listenAddress = null;
  let socketStatusEnabled = false;
  const socketStatusEvents = [];
  const stats = { statusRequests: 0, statusFailures: 0, statusSuccesses: 0, eventRequests: 0, eventSuccesses: 0, socketRequests: 0, socketConnections: 0, socketDisconnects: 0, deniedRequests: 0 };

  function currentStatus() {
    return { ...STATUS_PHASES[phase] };
  }

  function advancePhase(nextPhase) {
    if (!Number.isInteger(nextPhase) || nextPhase < 0 || nextPhase >= STATUS_PHASES.length) {
      throw new RangeError('Unknown synthetic Sidekick status phase');
    }
    phase = nextPhase;
    if (io && socketStatusEnabled && stats.socketConnections > stats.socketDisconnects) {
      const status = currentStatus();
      socketStatusEvents.push(status);
      io.emit('sidekick:public-status', status);
    }
    return currentStatus();
  }

  function handleHttp(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch (_) {
      sendJson(res, 400, { success: false, error: 'Bad request' });
      return;
    }

    if (req.method !== 'GET') {
      stats.deniedRequests += 1;
      res.setHeader('allow', 'GET');
      sendJson(res, 405, { success: false, error: 'Method not allowed' });
      return;
    }

    if (url.pathname === HUD_PATHNAME) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:8765; img-src data:",
        'x-content-type-options': 'nosniff'
      });
      fs.createReadStream(HUD_PATH).pipe(res);
      return;
    }

    if (url.pathname === '/socket.io/socket.io.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      fs.createReadStream(SOCKET_BUNDLE_PATH).pipe(res);
      return;
    }

    if (url.pathname === STATUS_PATH) {
      stats.statusRequests += 1;
      if (statusFailuresRemaining > 0) {
        statusFailuresRemaining -= 1;
        stats.statusFailures += 1;
        sendJson(res, 503, { success: false, error: 'Synthetic pilot status unavailable' });
        return;
      }
      stats.statusSuccesses += 1;
      sendJson(res, 200, { success: true, status: currentStatus() });
      return;
    }

    if (url.pathname === EVENTS_PATH) {
      stats.eventRequests += 1;
      const parsed = Number.parseInt(url.searchParams.get('limit') || '5', 10);
      const limit = Number.isInteger(parsed) ? Math.max(1, Math.min(10, parsed)) : 5;
      stats.eventSuccesses += 1;
      sendJson(res, 200, { success: true, events: SYNTHETIC_EVENTS.slice(0, limit) });
      return;
    }

    stats.deniedRequests += 1;
    sendJson(res, 404, { success: false, error: 'Not found' });
  }

  function attachSocket(ioServer) {
    ioServer.on('connection', (socket) => {
      stats.socketConnections += 1;
      socket.on('disconnect', () => { stats.socketDisconnects += 1; });
      socket.on('sidekick:public-status:request', () => {
        stats.socketRequests += 1;
        if (socketStatusEnabled) {
          const status = currentStatus();
          socketStatusEvents.push(status);
          socket.emit('sidekick:public-status', status);
        }
      });
    });
  }

  async function start({ host = HOST, port = DEFAULT_PORT, isolationReceipt } = {}) {
    if (closed || server) throw new Error('Pilot fixture host may be started only once');
    if (host !== HOST) throw new Error('Pilot fixture host must bind exactly 127.0.0.1');
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new RangeError('Pilot fixture port must be an explicit unprivileged TCP port');
    if (!isVerifiedIsolationReceipt(isolationReceipt)) throw new Error('A separately hash-verified isolation receipt is required before starting the fixture host');
    server = http.createServer(handleHttp);
    io = new Server(server, {
      path: '/socket.io',
      serveClient: false,
      cors: false,
      allowRequest: (req, callback) => {
        const address = req.socket?.remoteAddress;
        callback(null, address === '127.0.0.1' || address === '::ffff:127.0.0.1');
      }
    });
    attachSocket(io);
    await new Promise((resolve, reject) => {
      const onError = (error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
    const address = server.address();
    if (!address || address.address !== HOST) {
      await close();
      throw new Error('Pilot fixture listener did not bind to loopback');
    }
    listenAddress = { host: address.address, port: address.port };
    return { ...listenAddress };
  }

  async function close() {
    if (closed) return;
    closed = true;
    if (io) await new Promise((resolve) => io.close(resolve));
    else if (server?.listening) await new Promise((resolve) => server.close(resolve));
    listenAddress = null;
  }

  async function waitForActivity(target, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (Object.entries(target).every(([key, value]) => stats[key] >= value)) return { ...stats };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Synthetic browser fixture activity did not reach the expected request counts');
  }

  async function waitForNoSocketClients(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (stats.socketConnections === stats.socketDisconnects) return { ...stats };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('OBS Browser Source Socket.IO connection did not close after temporary input removal');
  }

  function setSocketStatusEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Socket status fixture flag must be boolean');
    socketStatusEnabled = enabled;
    if (io && socketStatusEnabled && stats.socketConnections > stats.socketDisconnects) {
      const status = currentStatus();
      socketStatusEvents.push(status);
      io.emit('sidekick:public-status', status);
    }
  }

  return {
    handleHttp,
    attachSocket,
    start,
    close,
    currentStatus,
    advancePhase,
    setSocketStatusEnabled,
    getStats: () => ({ ...stats }),
    getSocketStatusEvents: () => socketStatusEvents.map((status) => ({ ...status })),
    waitForActivity,
    waitForNoSocketClients,
    getActiveSocketClients: () => stats.socketConnections - stats.socketDisconnects,
    getAddress: () => listenAddress && { ...listenAddress },
    isClosed: () => closed
  };
}

async function main() {
  const isolation = readIsolationReceipt(process.env.LTTH_OBS_PILOT_ISOLATION_RECEIPT, {
    expectedFileSha256: process.env.LTTH_OBS_PILOT_ISOLATION_RECEIPT_SHA256
  });
  if (isolation.vmUuid !== '1d436b46-6288-4c8c-8270-30df1e527329') throw new Error('Guest isolation receipt identifies an unexpected VM');
  const port = Number(process.env.LTTH_OBS_PILOT_FIXTURE_PORT || DEFAULT_PORT);
  const fixture = createPilotFixture();
  const address = await fixture.start({ port, isolationReceipt: isolation });
  process.stdout.write(`Synthetic Sidekick fixture listening on http://${address.host}:${address.port}\n`);
  const stop = () => fixture.close().finally(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Sidekick pilot fixture did not start: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_PORT, HOST, STATUS_PHASES, SYNTHETIC_EVENTS, createPilotFixture };
