'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { io: connect } = require('../../../app/node_modules/socket.io-client');
const { createHostGoalsFixture } = require('../host-goals-fixture');
const GoalsWebSocket = require('../../../app/plugins/goals/backend/websocket');

const LOCALES = ['de', 'en', 'es', 'fr'];

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

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)); }, 3000);
    function receive(value) { clearTimeout(timer); resolve(value); }
    socket.once(name, receive);
  });
}

function createSocket(fixture) {
  return connect(fixture.origin, { transports: ['websocket'], reconnection: false, timeout: 3000 });
}

function realConsumerEnvelope(goalId, currentValue, previousValue, state, previousState) {
  const goal = {
    id: goalId, name: 'Synthetic goal', goal_type: 'coin', enabled: 1, current_value: currentValue,
    target_value: 100, start_value: 0, template_id: 'compact-bar',
    animation_on_update: 'fixture-no-animation', animation_on_reach: 'fixture-no-animation',
    theme: {}, overlay_width: 500, overlay_height: 100
  };
  const snapshot = {
    goalId, state, previousState,
    data: { currentValue, targetValue: 100, startValue: 0, previousValue, onReachAction: 'hide', onReachIncrement: 100 },
    progress: currentValue, isReached: currentValue >= 100
  };
  let emitted;
  const producer = new GoalsWebSocket({
    api: {},
    db: { getGoal: id => id === goalId ? goal : null },
    stateMachineManager: { getMachine: id => id === goalId ? { getSnapshot: () => snapshot } : null }
  });
  producer.io = {
    to(room) {
      assert.equal(room, `goal:${goalId}`);
      return { emit(eventName, payload) { emitted = { event: eventName, payload }; } };
    }
  };
  producer.broadcastGoalReached(goalId);
  return emitted;
}

test('loopback host serves the guide entry, original overlay assets and exact four locale files only', async () => {
  const fixture = await createHostGoalsFixture();
  try {
    assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const guide = require('../../../scripts/plugin-guides/goals');
    assert.equal(guide.overlay, '/goals/overlay');
    const entrySource = fs.readFileSync(path.resolve(__dirname, '../../../app/plugins/goals/overlay/index.html'));
    const rendererSource = fs.readFileSync(path.resolve(__dirname, '../../../app/plugins/goals/overlay/overlay.js'));
    const localeClient = fs.readFileSync(path.resolve(__dirname, '../../../app/public/js/i18n-client.js'));
    const socketClient = fs.readFileSync(path.resolve(__dirname, '../../../app/node_modules/socket.io/client-dist/socket.io.js'));

    for (const locale of LOCALES) {
      const id = `fixture-goal-${locale}`;
      const entry = await request(fixture.origin, `/goals/overlay?id=${id}&lang=${locale}`);
      assert.equal(entry.status, 200);
      assert.deepEqual(entry.bytes, entrySource);
      assert.match(entry.headers['content-security-policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1:/);
      for (const [route, expected] of [
        ['/plugins/goals/overlay/overlay.js', rendererSource],
        ['/js/i18n-client.js', localeClient],
        ['/socket.io/socket.io.js', socketClient]
      ]) {
        const response = await request(fixture.origin, route);
        assert.equal(response.status, 200, route);
        assert.deepEqual(response.bytes, expected, route);
      }
      const translations = await request(fixture.origin, `/api/i18n/translations/${locale}`);
      assert.equal(translations.status, 200);
      assert.deepEqual(JSON.parse(translations.bytes), JSON.parse(fs.readFileSync(
        path.resolve(__dirname, `../../../app/plugins/goals/locales/${locale}.json`)
      )));
    }

    for (const route of [
      '/goals/overlay?id=', '/goals/overlay?id=real-goal', '/goals/overlay?id=fixture-goal-de&id=fixture-goal-en',
      '/goals/overlay?id=fixture-goal-de&profile=real', '/goals/overlay?id=fixture-goal-de&lang=it',
      '/goals/overlay?id=fixture-goal-de&lang=de&template=unknown',
      '/api/goals', '/api/goals/fixture-goal-de', '/api/i18n/translations/it', '/unknown'
    ]) assert.equal((await request(fixture.origin, route)).status, 404, route);
    assert.equal((await request(fixture.origin, '/goals/overlay?id=fixture-goal-de', { method: 'POST' })).status, 404);
    assert.equal((await request(fixture.origin, '/goals/overlay?id=fixture-goal-de', { headers: { Host: 'foreign.example' } })).status, 404);
    assert.equal((await request(fixture.origin, '/goals/overlay?id=fixture-goal-de', { headers: { Origin: 'https://foreign.example' } })).status, 404);
  } finally { await fixture.close(); }
  assert.equal(fixture.getStats().closed, true);
});

test('real Socket.IO serves only synthetic locale ids and runs update, reset, clear and unsubscribe contracts', async () => {
  const fixture = await createHostGoalsFixture();
  const de = createSocket(fixture);
  const en = createSocket(fixture);
  const idle = createSocket(fixture);
  try {
    await Promise.all([event(de, 'connect'), event(en, 'connect'), event(idle, 'connect')]);

    const deSubscribed = event(de, 'goals:subscribed');
    de.emit('goals:subscribe', 'fixture-goal-de');
    const initialDe = await deSubscribed;
    assert.equal(initialDe.goalId, 'fixture-goal-de');
    assert.deepEqual(initialDe.goal, {
      id: 'fixture-goal-de', name: 'Synthetic goal', goal_type: 'coin', enabled: 1,
      current_value: 25, target_value: 100, start_value: 0, template_id: 'compact-bar',
      animation_on_update: 'fixture-no-animation', animation_on_reach: 'fixture-no-animation',
      theme: {}, overlay_width: 500, overlay_height: 100
    });
    assert.deepEqual(initialDe.state, {
      goalId: 'fixture-goal-de', state: 'idle', previousState: null,
      data: { currentValue: 25, targetValue: 100, startValue: 0, previousValue: 25, onReachAction: 'hide', onReachIncrement: 100 },
      progress: 25, isReached: false
    });

    const enSubscribed = event(en, 'goals:subscribed');
    en.emit('goals:subscribe', 'fixture-goal-en');
    assert.equal((await enSubscribed).goalId, 'fixture-goal-en');
    const rejectedId = event(idle, 'goals:error');
    idle.emit('goals:subscribe', 'real-goal');
    assert.deepEqual(await rejectedId, { error: 'Unsupported fixture goal', goalId: null });

    const deUpdate = event(de, 'goals:value-changed');
    const enUpdate = event(en, 'goals:value-changed');
    await fixture.execute({ command: 'update', value: 40 });
    const [updatedDe, updatedEn] = await Promise.all([deUpdate, enUpdate]);
    for (const payload of [updatedDe, updatedEn]) {
      assert.equal(payload.goal.current_value, 40);
      assert.equal(payload.state.data.previousValue, 25);
      assert.equal(payload.state.progress, 40);
    }
    assert.equal(fixture.getStats().currentValue, 40);

    const reset = event(de, 'goals:reset');
    await fixture.execute({ command: 'reset' });
    const resetPayload = await reset;
    assert.equal(resetPayload.goal.current_value, 0);
    assert.equal(resetPayload.state.data.currentValue, 0);
    assert.equal(resetPayload.state.data.previousValue, 40);

    const deleted = event(de, 'goals:deleted');
    await fixture.execute({ command: 'clear' });
    assert.deepEqual(await deleted, { goalId: 'fixture-goal-de' });
    assert.equal(fixture.getStats().cleared, true);

    de.emit('goals:unsubscribe', 'fixture-goal-de');
    const enOnlyUpdate = event(en, 'goals:value-changed');
    await fixture.execute({ command: 'update', value: 60 });
    assert.equal((await enOnlyUpdate).goal.current_value, 60);
    assert.equal(fixture.getStats().denied, 1);
    assert.equal(fixture.getStats().subscribed, 2);
    await assert.rejects(fixture.execute({ command: 'update', value: 101 }), /from 0 to 100/);
    await assert.rejects(fixture.execute({ command: 'update', value: 1.5 }), /from 0 to 100/);
    await assert.rejects(fixture.execute({ command: 'update', value: 20, goalId: 'real-goal' }), /Unsupported/);
  } finally {
    de.disconnect(); en.disconnect(); idle.disconnect();
    await fixture.close();
  }
  assert.equal(fixture.getStats().clients, 0);
});

test('target 100 emits the production goals:reached envelope after the exact renderer update-animation event', async t => {
  const fixture = await createHostGoalsFixture();
  const socket = createSocket(fixture);
  t.after(async () => { socket.disconnect(); await fixture.close(); });
  await event(socket, 'connect');
  const id = 'fixture-goal-de';
  const subscribed = event(socket, 'goals:subscribed');
  socket.emit('goals:subscribe', id);
  assert.equal((await subscribed).goal.current_value, 25);

  const update = event(socket, 'goals:value-changed');
  const reached = event(socket, 'goals:reached');
  const statsAfterUpdate = await fixture.execute({ command: 'update', value: 100 });
  const updatePayload = await update;
  assert.equal(updatePayload.goal.current_value, 100);
  assert.equal(updatePayload.state.state, 'animating_update');
  assert.equal(updatePayload.state.previousState, 'updating');
  assert.equal(statsAfterUpdate.pendingReaches, 1);
  assert.equal(statsAfterUpdate.reachedEvents, 0);

  let reachedBeforeAnimationEnd = false;
  reached.then(() => { reachedBeforeAnimationEnd = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(reachedBeforeAnimationEnd, false);
  socket.emit('goals:animation-end', { goalId: id, animationType: 'update' });

  const reachedEnvelope = await reached;
  const realReached = realConsumerEnvelope(id, 100, 25, 'animating_reach', 'reached');
  assert.equal(realReached.event, 'goals:reached');
  assert.deepEqual(reachedEnvelope, realReached.payload);
  assert.equal(fixture.getStats().animationEnds, 1);
  assert.equal(fixture.getStats().reachedEvents, 1);
  assert.equal(fixture.getStats().pendingReaches, 0);

  socket.emit('goals:animation-end', { goalId: id, animationType: 'update', extra: 'denied' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fixture.getStats().reachedEvents, 1);
  assert.equal(fixture.getStats().denied, 1);
});

test('read-only template query selects only Vertical Meter and Glassy Card synthetic renderers', async t => {
  const fixture = await createHostGoalsFixture();
  const vertical = createSocket(fixture);
  const glassy = createSocket(fixture);
  t.after(async () => { vertical.disconnect(); glassy.disconnect(); await fixture.close(); });
  await Promise.all([event(vertical, 'connect'), event(glassy, 'connect')]);

  assert.equal((await request(fixture.origin, '/goals/overlay?id=fixture-goal-de&lang=de&template=vertical-meter')).status, 200);
  assert.equal((await request(fixture.origin, '/goals/overlay?id=fixture-goal-en&lang=en&template=glassy-card')).status, 200);
  for (const [socket, id, template] of [
    [vertical, 'fixture-goal-de', 'vertical-meter'], [glassy, 'fixture-goal-en', 'glassy-card']
  ]) {
    const subscribed = event(socket, 'goals:subscribed');
    socket.emit('goals:subscribe', id);
    assert.equal((await subscribed).goal.template_id, template);
  }
  assert.equal(fixture.getStats().denied, 0);
});

test('bounded locale command forwards only the original i18n socket event envelope to subscribed renderers', async t => {
  const fixture = await createHostGoalsFixture();
  const sender = createSocket(fixture);
  const receiver = createSocket(fixture);
  const idle = createSocket(fixture);
  t.after(async () => { sender.disconnect(); receiver.disconnect(); idle.disconnect(); await fixture.close(); });
  await Promise.all([event(sender, 'connect'), event(receiver, 'connect'), event(idle, 'connect')]);

  const senderSubscribed = event(sender, 'goals:subscribed');
  sender.emit('goals:subscribe', 'fixture-goal-de');
  await senderSubscribed;
  const receiverSubscribed = event(receiver, 'goals:subscribed');
  receiver.emit('goals:subscribe', 'fixture-goal-en');
  await receiverSubscribed;

  const changes = Promise.all([event(sender, 'locale-changed'), event(receiver, 'locale-changed'), event(idle, 'locale-changed')]);
  const result = await fixture.execute({ command: 'language', locale: 'fr' });
  assert.deepEqual(await changes, [{ locale: 'fr' }, { locale: 'fr' }, { locale: 'fr' }]);
  assert.equal(fixture.getStats().languageEvents, 3);
  assert.equal(fixture.getStats().denied, 0);
  assert.equal(result.languageEvents, 3);

  const changed = event(receiver, 'locale-changed');
  await fixture.execute({ command: 'language', locale: 'es' });
  assert.deepEqual(await changed, { locale: 'es' });
  assert.equal(fixture.getStats().languageEvents, 6);
  assert.equal(fixture.getStats().denied, 0);

  await assert.rejects(fixture.execute({ command: 'language', locale: 'it', event: 'locale-changed' }), /Unsupported/);
  await assert.rejects(fixture.execute({ command: 'language', locale: 'de', event: 'unknown' }), /Unsupported/);
});

test('missing-id entry and reserved missing goal are bounded, subscribed errors and reconnect recover', async () => {
  const fixture = await createHostGoalsFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnectionDelay: 10, timeout: 3000 });
  const idle = createSocket(fixture);
  const unexpectedIdle = [];
  idle.on('goals:error', payload => unexpectedIdle.push(payload));
  socket.on('connect', () => socket.emit('goals:subscribe', 'fixture-goal-de'));
  try {
    const subscribed = event(socket, 'goals:subscribed');
    await Promise.all([subscribed, event(idle, 'connect')]);
    for (const route of ['/goals/overlay', '/goals/overlay?lang=fr', '/goals/overlay?id=fixture-goal-missing&lang=de']) {
      assert.equal((await request(fixture.origin, route)).status, 200);
    }
    const notFound = event(idle, 'goals:error');
    idle.emit('goals:subscribe', 'fixture-goal-missing');
    assert.deepEqual(await notFound, { error: 'Goal not found', goalId: 'fixture-goal-missing' });
    unexpectedIdle.length = 0;
    for (const [kind, error] of [['unavailable', 'Synthetic service unavailable'], ['not-found', 'Goal not found']]) {
      const received = event(socket, 'goals:error');
      await fixture.execute({ command: 'fault', kind });
      assert.deepEqual(await received, { goalId: 'fixture-goal-de', error });
      const recovery = event(socket, 'goals:value-changed');
      await fixture.execute({ command: 'update', value: 40 });
      assert.equal((await recovery).goal.current_value, 40);
    }
    const disconnected = event(socket, 'disconnect');
    const recovered = event(socket, 'goals:subscribed');
    await fixture.execute({ command: 'fault', kind: 'disconnect' });
    await disconnected;
    assert.equal((await recovered).goal.current_value, 40);
    assert.equal(idle.connected, true);
    assert.deepEqual(unexpectedIdle, []);
    await assert.rejects(fixture.execute({ command: 'fault', kind: 'arbitrary' }), /Unsupported synthetic/);
    await assert.rejects(fixture.execute({ command: 'fault', kind: 'unavailable', message: 'raw' }), /Unsupported command/);
  } finally { socket.disconnect(); idle.disconnect(); await fixture.close(); }
});

test('command contract reports stats, rejects unknown input and closes the loopback host idempotently', async () => {
  const fixture = await createHostGoalsFixture();
  assert.equal(fixture.getStats().currentValue, 25);
  await assert.rejects(fixture.execute({ command: 'reset', profile: 'real' }), /Unsupported/);
  await assert.rejects(fixture.execute({ command: 'update', value: -1 }), /from 0 to 100/);
  const firstClose = fixture.execute({ command: 'close' });
  const secondClose = fixture.close();
  await Promise.all([firstClose, secondClose]);
  assert.equal(fixture.getStats().closed, true);
  await assert.rejects(fixture.execute({ command: 'getstats' }), /Host is closed/);
});
