'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { JSDOM } = require('../../../app/node_modules/jsdom');
const { io: connect } = require('../../../app/node_modules/socket.io-client');
const { createHostTimerFixture } = require('../host-timer-fixture');

const LOCALES = ['de', 'en', 'es', 'fr'];
const ROOT = path.resolve(__dirname, '../../..');
const ASSETS = new Map([
  ['/js/i18n-client.js', 'app/public/js/i18n-client.js'],
  ['/socket.io/socket.io.js', 'app/node_modules/socket.io/client-dist/socket.io.js']
]);

function request(origin, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${pathname}`, options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function event(socket, name, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)); }, timeoutMs);
    function receive(payload) { clearTimeout(timer); resolve(payload); }
    socket.once(name, receive);
  });
}

function timerRecord(id, currentValue = 90, state = 'running') {
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

function waitForTimerView(dom, predicate) {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const container = dom.window.document.getElementById('timer-container');
    const observer = new dom.window.MutationObserver(() => {
      if (!predicate()) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    });
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timed out waiting for original timer overlay state'));
    }, 4000);
    observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
  });
}

test('serves the canonical plugin-root entry, actual renderer assets/locales and exact read-only timer contract', async () => {
  const fixture = await createHostTimerFixture();
  try {
    assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const apiSource = fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/backend/api.js'), 'utf8');
    assert.match(apiSource, /registerRoute\('get', '\/advanced-timer\/overlay'/);
    assert.match(apiSource, /registerRoute\('get', '\/advanced-timer\/overlay\.js'/);
    const canonicalEntry = fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/overlay.html'));
    const renderer = fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/overlay/overlay.js'));
    const guideEntry = fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/overlay/index.html'));
    assert.notDeepEqual(canonicalEntry, guideEntry);
    assert.match(canonicalEntry.toString(), /src="\/advanced-timer\/overlay\.js\?v=3"/);
    assert.match(guideEntry.toString(), /src="\/plugins\/advanced-timer\/overlay\/overlay\.js\?v=3"/);
    assert.match(renderer.toString(), /urlParams\.get\('timer'\)/);

    for (const locale of LOCALES) {
      const id = `fixture-timer-${locale}`;
      const entry = await request(fixture.origin, `/advanced-timer/overlay?timer=${id}&template=default&lang=${locale}`);
      assert.equal(entry.status, 200);
      assert.deepEqual(entry.bytes, canonicalEntry);
      assert.match(entry.headers['content-security-policy'], /script-src 'self' 'unsafe-inline'/);
      assert.match(entry.headers['content-security-policy'], /img-src 'none'; media-src 'none'/);

      const script = await request(fixture.origin, '/advanced-timer/overlay.js?v=3');
      assert.equal(script.status, 200);
      assert.deepEqual(script.bytes, renderer);

      for (const [route, file] of ASSETS) {
        const response = await request(fixture.origin, route);
        assert.equal(response.status, 200, route);
        assert.deepEqual(response.bytes, fs.readFileSync(path.join(ROOT, file)), route);
      }

      const translation = await request(fixture.origin, `/api/i18n/translations/${locale}`);
      assert.equal(translation.status, 200);
      assert.deepEqual(JSON.parse(translation.bytes), JSON.parse(fs.readFileSync(
        path.join(ROOT, `app/plugins/advanced-timer/locales/${locale}.json`)
      )));

      const timer = await request(fixture.origin, `/api/advanced-timer/timers/${id}`);
      assert.equal(timer.status, 200);
      assert.deepEqual(JSON.parse(timer.bytes), { success: true, timer: timerRecord(id) });
      for (const subroute of ['rotator', 'threshold-effects']) {
        const response = await request(fixture.origin, `/api/advanced-timer/timers/${id}/${subroute}`);
        assert.equal(response.status, 200);
        assert.deepEqual(JSON.parse(response.bytes), { success: true, settings: { enabled: false } });
      }
    }

    // The canonical entry intentionally serves the original missing-ID guidance without reading a timer.
    const missingId = await request(fixture.origin, '/advanced-timer/overlay');
    assert.equal(missingId.status, 200);
    assert.deepEqual(missingId.bytes, canonicalEntry);
    const unknownEntry = await request(fixture.origin, '/advanced-timer/overlay?timer=fixture-timer-unknown&lang=de');
    assert.equal(unknownEntry.status, 200);
    const unknownTimer = await request(fixture.origin, '/api/advanced-timer/timers/fixture-timer-unknown');
    assert.equal(unknownTimer.status, 404);
    assert.deepEqual(JSON.parse(unknownTimer.bytes), { success: false, error: 'Timer not found' });

    for (const route of [
      '/advanced-timer/overlay?profile=real', '/advanced-timer/overlay?timer=fixture-timer-de&timer=fixture-timer-en',
      '/advanced-timer/overlay?timer=fixture-timer-de&template=admin', '/advanced-timer/overlay?lang=it',
      '/advanced-timer/overlay.js', '/advanced-timer/overlay.js?v=3&extra=x',
      '/plugins/advanced-timer/overlay/index.html', '/api/advanced-timer/timers',
      '/api/advanced-timer/timers/fixture-timer-de/logs', '/api/advanced-timer/timers/fixture-timer-de/rotator?x=1',
      '/api/advanced-timer/timers/fixture-timer-real'
    ]) assert.equal((await request(fixture.origin, route)).status, 404, route);
    assert.equal((await request(fixture.origin, '/api/advanced-timer/timers/fixture-timer-de', { method: 'POST' })).status, 404);
    assert.equal((await request(fixture.origin, '/advanced-timer/overlay', { headers: { Host: 'foreign.example' } })).status, 404);
    assert.equal((await request(fixture.origin, '/advanced-timer/overlay', { headers: { Origin: 'https://foreign.example' } })).status, 404);
  } finally { await fixture.close(); }
  assert.equal(fixture.getStats().closed, true);
});

test('actual Socket.IO contract changes synthetic 90 to 89, pauses, resets and ignores unknown timer IDs', async () => {
  const fixture = await createHostTimerFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnection: false, timeout: 3000 });
  try {
    await event(socket, 'connect');
    socket.emit('advanced-timer:pause', { id: 'fixture-timer-de' });
    for (let attempt = 0; attempt < 80 && fixture.getStats().rejectedSocketEvents === 0; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(fixture.getStats().rejectedSocketEvents, 1);
    assert.equal(fixture.getStats().timers[0].state, 'running');

    const wrongId = event(socket, 'advanced-timer:tick');
    await fixture.execute({ command: 'unknown' });
    assert.deepEqual(await wrongId, { id: 'fixture-timer-unknown', currentValue: 1, state: 'paused' });
    assert.equal(fixture.getStats().timers[0].currentValue, 90);

    const tick = event(socket, 'advanced-timer:tick');
    await fixture.execute({ command: 'tick', id: 'fixture-timer-de' });
    assert.deepEqual(await tick, { id: 'fixture-timer-de', currentValue: 89, state: 'running' });
    assert.deepEqual(JSON.parse((await request(fixture.origin, '/api/advanced-timer/timers/fixture-timer-de')).bytes), {
      success: true, timer: timerRecord('fixture-timer-de', 89, 'running')
    });

    const paused = event(socket, 'advanced-timer:paused');
    await fixture.execute({ command: 'pause' });
    assert.deepEqual(await paused, { id: 'fixture-timer-de', currentValue: 89 });
    assert.equal(fixture.getStats().timers[0].state, 'paused');

    const reset = event(socket, 'advanced-timer:reset');
    await fixture.execute({ command: 'reset' });
    assert.deepEqual(await reset, { id: 'fixture-timer-de', currentValue: 90 });
    assert.deepEqual(fixture.getStats().timers[0], { id: 'fixture-timer-de', currentValue: 90, state: 'stopped' });
    assert.equal(fixture.getStats().tickCount, 1);
    assert.equal(fixture.getStats().pauseCount, 1);
    assert.equal(fixture.getStats().resetCount, 1);
  } finally {
    socket.disconnect();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
});

test('original timer overlay keeps paused visuals and accepts the started resume event after reconnect', async () => {
  const fixture = await createHostTimerFixture();
  const socket = connect(fixture.origin, {
    transports: ['websocket'], reconnection: true, reconnectionDelay: 10, reconnectionAttempts: 3, timeout: 3000
  });
  let dom;
  try {
    await event(socket, 'connect');
    const entry = await request(fixture.origin, '/advanced-timer/overlay?timer=fixture-timer-de&lang=de');
    assert.equal(entry.status, 200);
    dom = new JSDOM(entry.bytes.toString(), {
      runScripts: 'outside-only', url: `${fixture.origin}/advanced-timer/overlay?timer=fixture-timer-de&lang=de`
    });
    dom.window.io = () => socket;
    dom.window.fetch = async input => {
      const response = await request(fixture.origin, String(input));
      return {
        ok: response.status === 200,
        status: response.status,
        json: async () => JSON.parse(response.bytes)
      };
    };
    const rendered = new Promise(resolve => {
      const observer = new dom.window.MutationObserver(() => {
        if (!dom.window.document.querySelector('.timer-display')) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(dom.window.document.getElementById('timer-container'), { childList: true, subtree: true });
    });
    dom.window.eval(fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/overlay/overlay.js'), 'utf8'));
    await rendered;

    const display = () => dom.window.document.querySelector('.timer-display');
    assert.equal(display().textContent, '01:30');
    assert.equal(display().classList.contains('state-running'), true);

    const paused = event(socket, 'advanced-timer:paused');
    await fixture.execute({ command: 'pause' });
    assert.deepEqual(await paused, { id: 'fixture-timer-de', currentValue: 90 });
    assert.equal(display().textContent, '01:30');
    assert.equal(display().classList.contains('state-paused'), true);
    assert.equal(display().classList.contains('state-running'), false);

    const disconnected = event(socket, 'disconnect');
    const reconnected = event(socket, 'connect');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await disconnected;
    await reconnected;
    assert.equal(display().classList.contains('state-paused'), true);

    const started = event(socket, 'advanced-timer:started');
    await fixture.execute({ command: 'resume' });
    assert.deepEqual(await started, { id: 'fixture-timer-de', currentValue: 90 });
    assert.equal(display().textContent, '01:30');
    assert.equal(display().classList.contains('state-running'), true);
    assert.equal(display().classList.contains('state-paused'), false);
    assert.equal(fixture.getStats().timers.find(timer => timer.id === 'fixture-timer-de').state, 'running');
    assert.equal(fixture.getStats().pauseCount, 1);
    assert.equal(fixture.getStats().resumeCount, 1);
    assert.equal(fixture.getStats().faultDisconnects, 1);
    assert.equal(fixture.getStats().connections, 2);

    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  } finally {
    dom?.window.close();
    socket.disconnect();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
});

test('original timer overlay refreshes missed offline state on reconnect and ignores stale reads across BFCache restore', async () => {
  const fixture = await createHostTimerFixture();
  const socket = connect(fixture.origin, {
    transports: ['websocket'], reconnection: true, reconnectionDelay: 10, reconnectionAttempts: 3, timeout: 3000
  });
  let dom;
  let heldTimerRead = null;
  try {
    await event(socket, 'connect');
    const entry = await request(fixture.origin, '/advanced-timer/overlay?timer=fixture-timer-de&lang=de');
    assert.equal(entry.status, 200);
    dom = new JSDOM(entry.bytes.toString(), {
      runScripts: 'outside-only', url: `${fixture.origin}/advanced-timer/overlay?timer=fixture-timer-de&lang=de`
    });
    dom.window.io = () => socket;
    dom.window.fetch = async input => {
      const url = new URL(String(input), fixture.origin);
      const response = await request(fixture.origin, `${url.pathname}${url.search}`);
      let held = null;
      if (url.pathname === '/api/advanced-timer/timers/fixture-timer-de' && heldTimerRead) {
        held = heldTimerRead;
        heldTimerRead = null;
        held.resolveCaptured(JSON.parse(response.bytes));
        await held.released;
        held.resolveReturned();
      }
      return {
        ok: response.status === 200,
        status: response.status,
        json: async () => {
          return JSON.parse(response.bytes);
        }
      };
    };

    const display = () => dom.window.document.querySelector('.timer-display');
    const initialRender = waitForTimerView(dom, () => display()?.textContent === '01:30' && display()?.classList.contains('state-running'));
    dom.window.eval(fs.readFileSync(path.join(ROOT, 'app/plugins/advanced-timer/overlay/overlay.js'), 'utf8'));
    await initialRender;
    assert.equal(fixture.getStats().timerStateReads, 1);

    const disconnected = event(socket, 'disconnect');
    const reconnected = event(socket, 'connect');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await disconnected;
    await fixture.execute({ command: 'offlineState', state: 'paused', currentValue: 75 });
    assert.equal(fixture.getStats().timerStateReads, 1);
    await reconnected;
    await waitForTimerView(dom, () => display()?.textContent === '01:15' && display()?.classList.contains('state-paused'));
    assert.equal(display().classList.contains('state-running'), false);
    assert.equal(fixture.getStats().timerStateReads, 2);
    assert.equal(fixture.getStats().tickCount, 0);

    let releaseHeldRead;
    let resolveCaptured;
    let resolveReturned;
    const captured = new Promise(resolve => { resolveCaptured = resolve; });
    const returned = new Promise(resolve => { resolveReturned = resolve; });
    const released = new Promise(resolve => { releaseHeldRead = resolve; });
    heldTimerRead = { captured, returned, released, resolveCaptured, resolveReturned };
    const secondDisconnect = event(socket, 'disconnect');
    const secondReconnect = event(socket, 'connect');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await secondDisconnect;
    await fixture.execute({ command: 'offlineState', state: 'paused', currentValue: 60 });
    await secondReconnect;
    assert.deepEqual(await captured, { success: true, timer: timerRecord('fixture-timer-de', 60, 'paused') });

    await fixture.execute({ command: 'offlineState', state: 'running', currentValue: 40 });
    const bfcacheRefresh = waitForTimerView(dom, () => display()?.textContent === '00:40' && display()?.classList.contains('state-running'));
    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
    await bfcacheRefresh;
    assert.equal(fixture.getStats().timerStateReads, 4);

    releaseHeldRead();
    await returned;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(display().textContent, '00:40');
    assert.equal(display().classList.contains('state-running'), true);
    assert.equal(display().classList.contains('state-paused'), false);
    assert.equal(fixture.getStats().tickCount, 0);

    let releaseRacingRead;
    let resolveRacingSnapshot;
    let resolveRacingReturn;
    const racingSnapshot = new Promise(resolve => { resolveRacingSnapshot = resolve; });
    const racingReturn = new Promise(resolve => { resolveRacingReturn = resolve; });
    const racingRelease = new Promise(resolve => { releaseRacingRead = resolve; });
    heldTimerRead = {
      captured: racingSnapshot,
      returned: racingReturn,
      released: racingRelease,
      resolveCaptured: resolveRacingSnapshot,
      resolveReturned: resolveRacingReturn
    };
    const thirdDisconnect = event(socket, 'disconnect');
    const thirdReconnect = event(socket, 'connect');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await thirdDisconnect;
    await fixture.execute({ command: 'offlineState', state: 'paused', currentValue: 60 });
    await thirdReconnect;
    assert.deepEqual(await racingSnapshot, { success: true, timer: timerRecord('fixture-timer-de', 60, 'paused') });

    const tick = event(socket, 'advanced-timer:tick');
    await fixture.execute({ command: 'tick' });
    assert.deepEqual(await tick, { id: 'fixture-timer-de', currentValue: 89, state: 'running' });
    assert.equal(display().textContent, '01:29');
    assert.equal(display().classList.contains('state-running'), true);
    releaseRacingRead();
    await racingReturn;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(display().textContent, '01:29', 'late reconnect GET must not overwrite a newer socket tick');
    assert.equal(display().classList.contains('state-running'), true);
    assert.equal(display().classList.contains('state-paused'), false);
    assert.equal(fixture.getStats().tickCount, 1);

    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  } finally {
    dom?.window.close();
    socket.disconnect();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
});

test('stdin fixture controls are bounded to synthetic timer IDs and close the owned listener', async () => {
  const fixture = await createHostTimerFixture();
  await assert.rejects(fixture.execute({ command: 'tick', id: 'real-timer' }), /fixture-timer/);
  await assert.rejects(fixture.execute({ command: 'reset', id: 'fixture-timer-real', profile: 'real' }), /Unsupported/);
  assert.equal(fixture.getStats().timers.every(timer => timer.currentValue === 90), true);
  const firstClose = fixture.execute({ command: 'close' });
  const secondClose = fixture.close();
  await Promise.all([firstClose, secondClose]);
  assert.equal(fixture.getStats().closed, true);
  await assert.rejects(fixture.execute({ command: 'getstats' }), /Host is closed/);
});
