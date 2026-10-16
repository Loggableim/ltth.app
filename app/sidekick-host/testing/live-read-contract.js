'use strict';

const { HostCore } = require('../host-core');
const { ShowPlanner } = require('../show-planner');
const { createPluginPort } = require('../plugin-port');
const { createTextAdapter } = require('../adapters/text-adapter');
const { createAnimazeAdapter } = require('../adapters/animaze-adapter');
const { createReplyEngine } = require('../llm-reply');
const { RateLimiter } = require('../rate-limiter');

// Security contract for the sidekick live read path.
// createHarness(options) returns { adapter, stream, logLines, networkCalls, credentialReads, effects }.
// The production module is app/sidekick-host/adapters/live-read-adapter.js
// and must export createLiveReadAdapter({ stream, env, log, network, readCredential }).
// HostCore is not modified by this contract.

const VIEWER = 'viewer_zz_secretname';
const SENTINEL = 'sentinel-not-a-key';
const FORBIDDEN = ['send', 'reply', 'action'];

function functionNames(value) {
  const names = new Set();
  let current = value;
  while (current && current !== Object.prototype && current !== Function.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor && typeof descriptor.value === 'function') names.add(name);
    }
    current = Object.getPrototypeOf(current);
  }
  return [...names];
}

function watchEnv(values) {
  const seen = [];
  const env = new Proxy(values, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') seen.push(prop);
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === 'string') seen.push(`has:${prop}`);
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      seen.push('ownKeys');
      return Reflect.ownKeys(target);
    }
  });
  return { env, seen };
}

function sampleEvents() {
  return [
    { type: 'chat', username: VIEWER, uniqueId: VIEWER, nickname: VIEWER, userId: VIEWER, text: 'hallo' },
    { type: 'chat', username: VIEWER, uniqueId: VIEWER, text: '!sound' },
    { type: 'gift', username: VIEWER, gift: 'rose', text: '' },
    { type: 'follow', username: VIEWER }
  ];
}

function defineLiveReadContract(createHarness) {
  test.each([undefined, '', '0', 'true', 'yes'])('SIDEKICK_LIVE=%p does not start, read, or use the network', async (flag) => {
    const harness = createHarness({
      live: flag,
      events: sampleEvents(),
      networkThrows: true
    });
    const result = await harness.adapter.start();
    expect(result).toEqual({ started: false, events: [] });
    expect(harness.stream.calls).toEqual({ connect: 0, read: 0, close: 0 });
    expect(harness.networkCalls()).toBe(0);
    expect(harness.credentialReads()).toBe(0);
    expect(harness.envSeen().every(key => key === 'SIDEKICK_LIVE')).toBe(true);
    await harness.adapter.stop();
    expect(harness.stream.calls.close).toBe(0);
  });

  test('the adapter exposes start and stop and no send, reply, or action method', async () => {
    const { adapter } = createHarness({ live: '1', events: [] });
    const names = functionNames(adapter);
    expect(names).toEqual(expect.arrayContaining(['start', 'stop']));
    for (const name of FORBIDDEN) {
      expect(names).not.toContain(name);
      expect(typeof adapter[name]).not.toBe('function');
    }
  });

  test('a started read uses only the injected stream and strips identity from events and logs', async () => {
    const harness = createHarness({ live: '1', events: sampleEvents() });
    const result = await harness.adapter.start();
    expect(result.started).toBe(true);
    expect(result.events).toEqual([
      { type: 'chat', text: 'hallo' },
      { type: 'chat', text: '!sound' },
      { type: 'gift', text: '' },
      { type: 'follow', text: '' }
    ]);
    expect(harness.stream.calls.connect).toBe(1);
    expect(harness.stream.calls.read).toBe(1);
    expect(harness.networkCalls()).toBe(0);
    expect(harness.credentialReads()).toBe(0);
    expect(harness.envSeen().filter(key => key !== 'SIDEKICK_LIVE')).toEqual([]);
    const dumped = JSON.stringify({ events: result.events, log: harness.logLines() });
    expect(dumped).not.toContain(VIEWER);
    expect(dumped).not.toContain(SENTINEL);
    expect(harness.effects()).toEqual({ sound: 0, overlay: 0, action: 0 });
  });

  test('chat, gift, and follow events do not call sound, overlay, or plugin actions', async () => {
    const harness = createHarness({ live: '1', events: sampleEvents() });
    await harness.adapter.start();
    await harness.adapter.stop();
    expect(harness.effects()).toEqual({ sound: 0, overlay: 0, action: 0 });
    expect(harness.networkCalls()).toBe(0);
  });

  test('credentials and the key sentinel are never read', async () => {
    const off = createHarness({ live: undefined, events: sampleEvents() });
    await off.adapter.start();
    const on = createHarness({ live: '1', events: sampleEvents() });
    await on.adapter.start();
    expect(off.credentialReads()).toBe(0);
    expect(on.credentialReads()).toBe(0);
    expect(JSON.stringify(on.logLines())).not.toContain(SENTINEL);
    expect(on.envSeen()).not.toContain('OPENROUTER_API_KEY');
  });
}

function buildHost() {
  const portCalls = [];
  const spoken = [];
  const hostLog = [];
  const animazeSends = [];
  const quiz = createPluginPort({
    id: 'quiz-show',
    commands: ['!quiz'],
    handle: async () => {
      portCalls.push('!quiz');
      return { text: 'Quiz' };
    }
  });
  const music = createPluginPort({
    id: 'music-sound',
    commands: ['!song', '!sound'],
    handle: async (command) => {
      portCalls.push(command);
      return { text: command === '!sound' ? 'Sound abgespielt.' : 'Song' };
    }
  });
  const host = new HostCore({
    planner: new ShowPlanner([quiz, music]),
    output: createTextAdapter({ write: text => spoken.push(text) }),
    replyEngine: createReplyEngine({ apiKey: '' }),
    rateLimiter: new RateLimiter({ maxEvents: 18, windowMs: 60000, now: () => 0 }),
    log: entry => hostLog.push(entry)
  });
  const animaze = createAnimazeAdapter({
    transport: {
      async send(payload) {
        animazeSends.push(payload);
      }
    }
  });
  return { host, portCalls, spoken, hostLog, animaze, animazeSends };
}

function defineLiveReadHostBoundary(createHarness) {
  test('live chat, gifts, and follows do not reach HostCore, sounds, or Animaze', async () => {
    const { host, portCalls, spoken, hostLog, animaze, animazeSends } = buildHost();
    const harness = createHarness({
      live: '1',
      host,
      animaze,
      events: [
        { type: 'chat', username: VIEWER, text: '!sound' },
        { type: 'gift', username: VIEWER, gift: 'rose' },
        { type: 'follow', username: VIEWER }
      ]
    });
    await harness.adapter.start();
    expect(portCalls).toEqual([]);
    expect(spoken).toEqual([]);
    expect(hostLog).toEqual([]);
    expect(animazeSends).toEqual([]);
    expect(harness.effects()).toEqual({ sound: 0, overlay: 0, action: 0 });
    expect(JSON.stringify(harness.logLines())).not.toContain(VIEWER);
    expect(host.planner.active().id).toBe('quiz-show');
  });

  test('a local !sound still reaches the music port after a live read', async () => {
    const { host, portCalls, spoken, hostLog, animaze } = buildHost();
    const harness = createHarness({
      live: '1',
      host,
      animaze,
      events: [{ type: 'chat', username: VIEWER, text: '!sound' }]
    });
    await harness.adapter.start();
    host.planner.advance();
    const result = await host.handleChat({ user: 'viewer_01', text: '!sound' });
    expect(result).toMatchObject({ type: 'command', command: '!sound', emitted: true });
    expect(portCalls).toEqual(['!sound']);
    expect(spoken).toEqual(['Sound abgespielt.']);
    expect(JSON.stringify(hostLog)).not.toContain(VIEWER);
    expect(JSON.stringify(harness.logLines())).not.toContain(VIEWER);
  });
}

module.exports = {
  defineLiveReadContract,
  defineLiveReadHostBoundary,
  watchEnv,
  sampleEvents,
  VIEWER,
  SENTINEL
};
