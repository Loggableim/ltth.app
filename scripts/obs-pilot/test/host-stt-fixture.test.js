'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { io: connect } = require('../../../app/node_modules/socket.io-client');
const { createHostSttFixture } = require('../host-stt-fixture');

function request(origin, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${pathname}`, options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)); }, 3000);
    function receive(value) { clearTimeout(timer); resolve(value); }
    socket.once(name, receive);
  });
}

test('loopback pilot serves original sources/locales and rejects app routes, controls and foreign authority', async () => {
  const fixture = await createHostSttFixture();
  try {
    assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const html = await request(fixture.origin, '/overlay/stt-ticker?lang=fr');
    assert.equal(html.status, 200);
    assert.deepEqual(html.bytes, fs.readFileSync(path.resolve(__dirname, '../../../app/plugins/stt-ticker/overlay/ticker.html')));
    assert.match(html.headers['content-security-policy'], /img-src 'none'; media-src 'none'/);
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const response = await request(fixture.origin, `/api/i18n/translations/${locale}`);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.bytes), JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../app/plugins/stt-ticker/locales/${locale}.json`))));
    }
    assert.equal((await request(fixture.origin, '/socket.io/socket.io.js')).status, 200);
    for (const route of ['/api/i18n/locales', '/api/stt-ticker/config', '/api/i18n/translations/it', '/overlay/stt-ticker?lang=fr&lang=de', '/overlay/stt-ticker?profile=real']) {
      assert.equal((await request(fixture.origin, route)).status, 404);
    }
    assert.equal((await request(fixture.origin, '/overlay/stt-ticker', { method: 'POST' })).status, 404);
    assert.equal((await request(fixture.origin, '/overlay/stt-ticker', { headers: { Host: 'foreign.example' } })).status, 404);
    assert.equal((await request(fixture.origin, '/overlay/stt-ticker', { headers: { Origin: 'https://foreign.example' } })).status, 404);
    await fixture.execute({ command: 'fault', kind: 'translations', enabled: true });
    assert.equal((await request(fixture.origin, '/api/i18n/translations/de')).status, 503);
    await fixture.execute({ command: 'fault', kind: 'translations', enabled: false });
    assert.equal((await request(fixture.origin, '/api/i18n/translations/de')).status, 200);
    await assert.rejects(fixture.execute({ command: 'transcript', text: 'x', profile: 'real' }), /Unsupported/);
  } finally { await fixture.close(); }
  await fixture.close();
  assert.equal(fixture.getStats().closed, true);
});

test('actual Socket.IO delivers bounded synthetic transcript and clear, reconnects after owned fault and closes', async () => {
  const fixture = await createHostSttFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnectionDelay: 10 });
  try {
    await event(socket, 'connect');
    const partial = event(socket, 'stt-ticker:interim');
    await fixture.execute({ command: 'interim', text: 'Grüße – 世界 💬' });
    assert.deepEqual(await partial, { text: 'Grüße – 世界 💬', isFinal: false });
    const final = event(socket, 'stt-ticker:transcript');
    await fixture.execute({ command: 'transcript', text: '<script>synthetic text</script>' });
    const payload = await final;
    assert.equal(payload.text, '<script>synthetic text</script>');
    assert.deepEqual(payload.segments, [{ id: 2, text: payload.text }]);
    const clear = event(socket, 'stt-ticker:clear');
    await fixture.execute({ command: 'clear' });
    assert.equal(await clear, undefined);
    await assert.rejects(fixture.execute({ command: 'transcript', text: 'x'.repeat(2001) }), /at most 2000/);
    const disconnect = event(socket, 'disconnect');
    const reconnect = event(socket, 'connect');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await disconnect; await reconnect;
    assert.equal(fixture.getStats().clients, 1);
    const stopped = event(socket, 'disconnect');
    await fixture.close(); await stopped;
    assert.equal(fixture.getStats().clients, 0);
  } finally { socket.disconnect(); await fixture.close(); }
});

test('synthetic locale command emits the production server-origin locale-changed event and rejects other locales', async () => {
  const fixture = await createHostSttFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'] });
  try {
    await event(socket, 'connect');
    for (const locale of ['fr', 'es', 'en']) {
      const changed = event(socket, 'locale-changed');
      await fixture.execute({ command: 'locale', locale });
      assert.deepEqual(await changed, { locale });
    }
    await assert.rejects(fixture.execute({ command: 'locale', locale: 'it' }), /locale must be/);
    assert.deepEqual(fixture.getStats().localeChanges, ['fr', 'es', 'en']);
    assert.equal(fixture.getStats().denied, 0);
  } finally {
    socket.disconnect();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
  assert.equal(fixture.getStats().closed, true);
});
