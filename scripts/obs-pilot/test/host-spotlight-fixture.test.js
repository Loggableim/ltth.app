'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { io: connect } = require('../../../app/node_modules/socket.io-client');
const { createHostSpotlightFixture } = require('../host-spotlight-fixture');

const LOCALES = ['de', 'en', 'es', 'fr'];
const REPO_ROOT = path.resolve(__dirname, '../../..');
const ASSETS = new Map([
  ['/fonts/exo-2.css', 'app/public/fonts/exo-2.css'],
  ['/js/i18n-client.js', 'app/public/js/i18n-client.js'],
  ['/plugins/spotlight/lib/animations.js', 'app/plugins/spotlight/lib/animations.js'],
  ['/plugins/spotlight/lib/text-effects.js', 'app/plugins/spotlight/lib/text-effects.js'],
  ['/plugins/spotlight/lib/template-renderer.js', 'app/plugins/spotlight/lib/template-renderer.js'],
  ['/plugins/spotlight/overlays/single-overlay.js', 'app/plugins/spotlight/overlays/single-overlay.js'],
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
    function receive(value) { clearTimeout(timer); resolve(value); }
    socket.once(name, receive);
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Expected synthetic host state did not settle');
}

function syntheticUser(nickname, sessionToken) {
  return { nickname, profilePictureUrl: '', eventType: 'chatter', label: 'New Chat', overlaySessionToken: sessionToken };
}

test('loopback host serves the canonical Chatter entry, exact assets/locales and synthetic read routes only', async () => {
  const fixture = await createHostSpotlightFixture();
  try {
    assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const pluginSource = fs.readFileSync(path.join(REPO_ROOT, 'app/plugins/spotlight/main.js'), 'utf8');
    assert.match(pluginSource, /registerRouteAlias\('GET', `\/overlay\/spotlight\/\$\{type\}`/);
    assert.match(pluginSource, /'chatter': \{ event: 'chat', label: 'New Chat' \}/);
    const entry = fs.readFileSync(path.join(REPO_ROOT, 'app/plugins/spotlight/overlays/chatter.html'));
    const response = await request(fixture.origin, '/overlay/spotlight/chatter?lang=fr');
    assert.equal(response.status, 200);
    assert.deepEqual(response.bytes, entry);
    assert.match(response.headers['content-security-policy'], /img-src 'none'; media-src 'none'/);
    assert.match(response.headers['content-security-policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1:/);

    for (const [route, file] of ASSETS) {
      const asset = await request(fixture.origin, route);
      assert.equal(asset.status, 200, route);
      assert.deepEqual(asset.bytes, fs.readFileSync(path.join(REPO_ROOT, file)), route);
    }
    for (const locale of LOCALES) {
      const translations = await request(fixture.origin, `/api/i18n/translations/${locale}`);
      assert.equal(translations.status, 200);
      assert.deepEqual(JSON.parse(translations.bytes), JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, `app/plugins/spotlight/locales/${locale}.json`)
      )));
    }

    const settings = await request(fixture.origin, '/api/lastevent/settings/chatter');
    assert.deepEqual(JSON.parse(settings.bytes), {
      success: true,
      settings: {
        designVariant: 'default', fontFamily: 'Exo 2', fontSize: '32px', fontColor: '#FFFFFF',
        usernameEffect: 'none', enableBorder: true, borderColor: '#00D8FF', enableBackground: true,
        backgroundColor: 'rgba(0, 0, 0, 0.92)', showProfilePicture: false,
        showUsername: true, hudAlignment: 'center', inAnimationType: 'none', outAnimationType: 'none',
        animationSpeed: 'fast', refreshIntervalSeconds: 0, hideOnNullUser: true, preloadImages: false
      }
    });
    const last = await request(fixture.origin, '/api/lastevent/last/chatter');
    const lastData = JSON.parse(last.bytes);
    assert.equal(lastData.success, true);
    assert.equal(lastData.type, 'chatter');
    assert.equal(lastData.overlaySessionToken, 'fixture-session-1');
    assert.deepEqual(lastData.user, syntheticUser('Synthetic Chatter', 'fixture-session-1'));
    assert.equal(Object.hasOwn(lastData.user, 'uniqueId'), false);
    assert.equal(Object.hasOwn(lastData.user, 'metadata'), false);

    for (const route of [
      '/overlay/spotlight/chatter?lang=it', '/overlay/spotlight/chatter?profile=real',
      '/overlay/lastevent/chatter', '/plugins/spotlight/overlays/chatter.js',
      '/api/lastevent/settings/like', '/api/lastevent/last/gifter', '/api/lastevent/all',
      '/api/lastevent/test/chatter', '/api/i18n/translations/it', '/unknown'
    ]) assert.equal((await request(fixture.origin, route)).status, 404, route);
    assert.equal((await request(fixture.origin, '/api/lastevent/settings/chatter', { method: 'POST' })).status, 404);
    assert.equal((await request(fixture.origin, '/api/lastevent/last/chatter', { headers: { Host: 'foreign.example' } })).status, 404);
    assert.equal((await request(fixture.origin, '/api/lastevent/last/chatter', { headers: { Origin: 'https://foreign.example' } })).status, 404);
  } finally { await fixture.close(); }
  assert.equal(fixture.getStats().closed, true);
});

test('real Socket.IO delivers only synthetic chatter updates and resets session identity after reconnect', async () => {
  const fixture = await createHostSpotlightFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnectionDelay: 20, reconnectionAttempts: 5, timeout: 3000 });
  try {
    await event(socket, 'connect');
    socket.emit('lastevent.update.chatter', { nickname: 'Real viewer' });
    await waitFor(() => fixture.getStats().denied === 1);
    const updated = event(socket, 'lastevent.update.chatter');
    const updateStats = await fixture.execute({ command: 'update' });
    assert.deepEqual(await updated, syntheticUser('Updated Synthetic Chatter', 'fixture-session-1'));
    assert.equal(updateStats.currentName, 'Updated Synthetic Chatter');
    assert.equal(updateStats.updates, 1);
    assert.equal(updateStats.denied, 1);

    const reset = event(socket, 'lastevent.session.reset');
    const resetStats = await fixture.execute({ command: 'reset' });
    assert.deepEqual(await reset, { overlaySessionToken: 'fixture-session-2' });
    assert.equal(resetStats.currentName, null);
    const emptyLast = await request(fixture.origin, '/api/lastevent/last/chatter');
    assert.deepEqual(JSON.parse(emptyLast.bytes), {
      success: true, type: 'chatter', overlaySessionToken: 'fixture-session-2', user: null
    });

    const disconnect = event(socket, 'disconnect');
    const reconnect = event(socket, 'connect');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await disconnect;
    await reconnect;
    const nextUpdate = event(socket, 'lastevent.update.chatter');
    const nextStats = await fixture.execute({ command: 'update' });
    assert.deepEqual(await nextUpdate, syntheticUser('Updated Synthetic Chatter', 'fixture-session-2'));
    assert.equal(nextStats.sessionNumber, 2);
    assert.equal(nextStats.faultDisconnects, 1);
    assert.equal(nextStats.connections, 2);
    assert.equal(nextStats.denied, 1);
    assert.equal(nextStats.clients, 1);
  } finally {
    socket.disconnect();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
});

test('stdin command contract is synthetic-only, rejects extra fields and shuts down idempotently', async () => {
  const fixture = await createHostSpotlightFixture();
  assert.equal(fixture.getStats().currentName, 'Synthetic Chatter');
  await assert.rejects(fixture.execute({ command: 'update', nickname: 'Real viewer' }), /Unsupported/);
  await assert.rejects(fixture.execute({ command: 'fault', kind: 'profile-switch' }), /disconnect/);
  const closeResult = fixture.execute({ command: 'close' });
  const repeatedClose = fixture.close();
  await Promise.all([closeResult, repeatedClose]);
  assert.equal(fixture.getStats().closed, true);
  await assert.rejects(fixture.execute({ command: 'getstats' }), /Host is closed/);
});
