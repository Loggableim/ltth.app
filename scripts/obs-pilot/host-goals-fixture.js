'use strict';

// Synthetic Goals host pilot only. No LTTH app server, database, profile or provider.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const { Server } = require('../../app/node_modules/socket.io');
const { Server: EngineServer } = require('../../app/node_modules/engine.io');

const ROOT = path.resolve(__dirname, '../..');
const LOCALES = Object.freeze(['de', 'en', 'es', 'fr']);
const TEMPLATES = Object.freeze(['compact-bar', 'vertical-meter', 'glassy-card']);
const MISSING_ID = 'fixture-goal-missing';
const STATIC = new Map([
  ['/goals/overlay', ['app/plugins/goals/overlay/index.html', 'text/html; charset=utf-8']],
  ['/js/i18n-client.js', ['app/public/js/i18n-client.js', 'text/javascript; charset=utf-8']],
  ['/plugins/goals/overlay/overlay.js', ['app/plugins/goals/overlay/overlay.js', 'text/javascript; charset=utf-8']],
  ['/socket.io/socket.io.js', ['app/node_modules/socket.io/client-dist/socket.io.js', 'text/javascript; charset=utf-8']]
]);

function createGoal(id, currentValue, templateId = 'compact-bar') {
  return {
    id,
    name: 'Synthetic goal',
    goal_type: 'coin',
    enabled: 1,
    current_value: currentValue,
    target_value: 100,
    start_value: 0,
    template_id: templateId,
    animation_on_update: 'fixture-no-animation',
    animation_on_reach: 'fixture-no-animation',
    theme: {},
    overlay_width: 500,
    overlay_height: 100
  };
}

function createSnapshot(id, currentValue, previousValue = currentValue, state = 'idle', previousState = null) {
  return {
    goalId: id,
    state,
    previousState,
    data: {
      currentValue,
      targetValue: 100,
      startValue: 0,
      previousValue,
      onReachAction: 'hide',
      onReachIncrement: 100
    },
    progress: currentValue,
    isReached: currentValue >= 100
  };
}

async function createHostGoalsFixture() {
  const hostUid = randomUUID();
  const stats = { requests: 0, denied: 0, connections: 0, emitted: 0, subscribed: 0, animationEnds: 0, reachedEvents: 0, languageEvents: 0, currentValue: 25, cleared: false };
  const templateByGoalId = new Map();
  const pendingReaches = new Map();
  let authority;
  let closing = false;
  let closePromise;
  let transport;
  const io = new Server({ serveClient: false });
  const allowedRequest = req => req.headers.host === authority
    && (!req.headers.origin || req.headers.origin === `http://${authority}`);

  const server = http.createServer((req, res) => {
    stats.requests += 1;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://${authority}; img-src 'self' data:; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`);
    const deny = () => { stats.denied += 1; res.writeHead(404); res.end(); };
    if (!closing && allowedRequest(req) && req.url.split('?')[0] === '/socket.io/'
      && ['GET', 'POST'].includes(req.method)) return transport.handleRequest(req, res);
    if (closing || !allowedRequest(req) || !['GET', 'HEAD'].includes(req.method)) return deny();
    let url;
    try { url = new URL(req.url, `http://${authority}`); } catch (_) { return deny(); }
    if (url.pathname.includes('%') || req.url.includes('..')) return deny();

    if (url.pathname === '/goals/overlay') {
      const keys = [...url.searchParams.keys()];
      const id = url.searchParams.get('id');
      const locale = url.searchParams.get('lang');
      const requestedTemplate = url.searchParams.get('template');
      const templateId = requestedTemplate === null ? 'compact-bar' : requestedTemplate;
      if (keys.some(key => !['id', 'lang', 'template'].includes(key)) || keys.length !== new Set(keys).size
        || !(id === null || id === MISSING_ID || LOCALES.some(value => id === `fixture-goal-${value}`))
        || (locale !== null && !LOCALES.includes(locale))
        || !TEMPLATES.includes(templateId)
        || (id === null && templateId !== 'compact-bar')) return deny();
      if (id !== null) templateByGoalId.set(id, templateId);
    } else if (url.search) return deny();

    const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
    if (localeMatch) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const bytes = fs.readFileSync(path.join(ROOT, 'app/plugins/goals/locales', `${localeMatch[1]}.json`));
      res.writeHead(200);
      return res.end(req.method === 'HEAD' ? undefined : bytes);
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

  function roomId(socket) {
    for (const id of LOCALES.map(locale => `fixture-goal-${locale}`)) {
      if (socket.rooms.has(`goal:${id}`)) return id;
    }
    return null;
  }

  function createConsumerEnvelope(id, currentValue, previousValue, snapshotState = 'idle', snapshotPreviousState = null) {
    return {
      goalId: id,
      goal: createGoal(id, currentValue, templateByGoalId.get(id) || 'compact-bar'),
      state: createSnapshot(id, currentValue, previousValue, snapshotState, snapshotPreviousState)
    };
  }

  io.on('connection', socket => {
    stats.connections += 1;
    socket.onAny(event => {
      if (event !== 'goals:subscribe' && event !== 'goals:unsubscribe' && event !== 'goals:animation-end') stats.denied += 1;
    });
    socket.on('goals:subscribe', id => {
      if (id === MISSING_ID) {
        socket.emit('goals:error', { error: 'Goal not found', goalId: MISSING_ID });
        return;
      }
      if (!LOCALES.some(locale => id === `fixture-goal-${locale}`)) {
        stats.denied += 1;
        socket.emit('goals:error', { error: 'Unsupported fixture goal', goalId: null });
        return;
      }
      const goalId = id;
      socket.join(`goal:${goalId}`);
      stats.subscribed += 1;
      socket.emit('goals:subscribed', {
        goalId,
        goal: createGoal(goalId, stats.currentValue, templateByGoalId.get(goalId)),
        state: createSnapshot(goalId, stats.currentValue)
      });
    });
    socket.on('goals:unsubscribe', id => {
      if (!LOCALES.some(locale => id === `fixture-goal-${locale}`)) { stats.denied += 1; return; }
      socket.leave(`goal:${id}`);
    });
    socket.on('goals:animation-end', payload => {
      const id = roomId(socket);
      const keys = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).sort() : [];
      if (!id || keys.length !== 2 || keys[0] !== 'animationType' || keys[1] !== 'goalId'
        || payload.goalId !== id || !['update', 'reach'].includes(payload.animationType)) {
        stats.denied += 1;
        return;
      }
      stats.animationEnds += 1;
      if (payload.animationType !== 'update' || !pendingReaches.has(id)) return;
      const previousValue = pendingReaches.get(id);
      pendingReaches.delete(id);
      emitToSubscribed('goals:reached', { current_value: stats.currentValue }, previousValue, 'animating_reach', 'reached', id);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  authority = `127.0.0.1:${server.address().port}`;

  function getStats() {
    return { hostUid, ...stats, pendingReaches: pendingReaches.size, clients: io.of('/').sockets.size, closed: closing };
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

  function emitToSubscribed(event, goal, previousValue = goal.current_value, snapshotState = 'idle', snapshotPreviousState = null, onlyGoalId = null) {
    let recipients = 0;
    for (const socket of io.of('/').sockets.values()) {
      const id = roomId(socket);
      if (!id || (onlyGoalId && id !== onlyGoalId)) continue;
      recipients += 1;
      socket.emit(event, createConsumerEnvelope(id, goal.current_value, previousValue, snapshotState, snapshotPreviousState));
    }
    stats.emitted += recipients;
    if (event === 'goals:reached') stats.reachedEvents += recipients;
    return recipients;
  }

  async function execute(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('JSON command object required');
    const allowedKeys = {
      getstats: ['command'], update: ['command', 'value'], reset: ['command'], clear: ['command'],
      language: ['command', 'locale'],
      fault: ['command', 'kind'], close: ['command']
    }[command.command];
    if (!allowedKeys || Object.keys(command).some(key => !allowedKeys.includes(key))) throw new Error('Unsupported command or fields');
    if (command.command === 'close') { await close(); return getStats(); }
    if (closing) throw new Error('Host is closed');
    if (command.command === 'getstats') return getStats();
    if (command.command === 'language') {
      if (!LOCALES.includes(command.locale)) {
        throw new Error('Unsupported synthetic language event');
      }
      const sockets = [...io.of('/').sockets.values()];
      const sender = sockets.find(socket => roomId(socket));
      if (!sender) throw new Error('No subscribed synthetic renderer');
      for (const recipient of sockets) recipient.emit('locale-changed', { locale: command.locale });
      stats.languageEvents += sockets.length;
      return getStats();
    }
    if (command.command === 'fault') {
      if (!['unavailable', 'not-found', 'disconnect'].includes(command.kind)) throw new Error('Unsupported synthetic fault');
      for (const socket of io.of('/').sockets.values()) {
        const id = roomId(socket);
        if (!id) continue;
        if (command.kind === 'disconnect') socket.conn.close();
        else {
          socket.emit('goals:error', {
            goalId: id,
            error: command.kind === 'not-found' ? 'Goal not found' : 'Synthetic service unavailable'
          });
          stats.emitted += 1;
        }
      }
      return getStats();
    }
    if (command.command === 'update') {
      if (!Number.isSafeInteger(command.value) || command.value < 0 || command.value > 100) throw new Error('Synthetic value must be an integer from 0 to 100');
      const previousValue = stats.currentValue;
      const crossesTarget = previousValue < 100 && command.value >= 100;
      stats.currentValue = command.value;
      stats.cleared = false;
      if (command.value < 100) pendingReaches.clear();
      if (crossesTarget) {
        for (const socket of io.of('/').sockets.values()) {
          const id = roomId(socket);
          if (id) pendingReaches.set(id, previousValue);
        }
      }
      emitToSubscribed('goals:value-changed', { current_value: stats.currentValue }, previousValue, crossesTarget ? 'animating_update' : 'idle', crossesTarget ? 'updating' : null);
      return getStats();
    }
    if (command.command === 'reset') {
      const previousValue = stats.currentValue;
      stats.currentValue = 0;
      stats.cleared = false;
      pendingReaches.clear();
      emitToSubscribed('goals:reset', { current_value: stats.currentValue }, previousValue);
      return getStats();
    }
    if (command.command === 'clear') {
      // Display-only deletion event: no goal is persisted/deleted; resubscribe restores it.
      stats.cleared = true;
      let recipients = 0;
      for (const socket of io.of('/').sockets.values()) {
        const id = roomId(socket);
        if (!id) continue;
        recipients += 1;
        socket.emit('goals:deleted', { goalId: id });
      }
      stats.emitted += recipients;
      return getStats();
    }
    throw new Error('Unsupported command');
  }

  return { hostUid, origin: `http://${authority}`, getStats, execute, close };
}

async function main() {
  const fixture = await createHostGoalsFixture();
  process.stdout.write(`${JSON.stringify({
    status: 'listening', pid: process.pid, hostUid: fixture.hostUid, origin: fixture.origin,
    entries: LOCALES.map(locale => `${fixture.origin}/goals/overlay?id=fixture-goal-${locale}&lang=${locale}`),
    negativeEntries: [`${fixture.origin}/goals/overlay?lang=de`, `${fixture.origin}/goals/overlay?id=${MISSING_ID}&lang=de`],
    commands: ['getstats', 'language {"locale":"de|en|es|fr"} (broadcasts the original server locale-changed event)', 'update {"value":0..100}', 'reset', 'clear (display-only)', 'fault {"kind":"unavailable|not-found|disconnect"}', 'close'],
    templateEntries: Object.fromEntries(LOCALES.map(locale => [locale, {
      verticalMeter: `${fixture.origin}/goals/overlay?id=fixture-goal-${locale}&lang=${locale}&template=vertical-meter`,
      glassyCard: `${fixture.origin}/goals/overlay?id=fixture-goal-${locale}&lang=${locale}&template=glassy-card`
    }])),
    scope: 'synthetic-host-only-no-database-no-provider-no-vm-receipt'
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

module.exports = { createHostGoalsFixture };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
