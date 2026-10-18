'use strict';

// Contract tests for the read-only live-chat interface (lt-6qo T1).
// Everything runs against the local fixture. No key, no network, no real viewers.

const { createLiveReadAdapter, publicEvent, KNOWN_TYPES } = require('../sidekick-host/adapters/live-read-adapter');
const { createFixtureStream } = require('../sidekick-host/adapters/live-read-stream');
const {
  FIXTURE_PATH,
  readFixture,
  createFixtureStreamFromFile
} = require('../sidekick-host/testing/live-read-fixture');

const FORBIDDEN = ['send', 'reply', 'post', 'comment', 'moderate', 'action', 'emit', 'write'];

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

function makeHarness({ events = [], batchSize = 0, file } = {}) {
  const stream = file
    ? createFixtureStreamFromFile({ file, batchSize })
    : createFixtureStream({ events, batchSize });
  const calls = { connect: 0, read: 0, close: 0 };
  const wrapped = {
    async connect() {
      calls.connect += 1;
      return stream.connect();
    },
    async read() {
      calls.read += 1;
      return stream.read();
    },
    async close() {
      calls.close += 1;
      return stream.close();
    }
  };
  const logLines = [];
  const adapter = createLiveReadAdapter({ stream: wrapped, log: entry => logLines.push(entry) });
  return { adapter, calls, logLines, stream };
}

describe('read-only live-chat interface', () => {
  test('exposes start, poll and stop and no outbound method', () => {
    const { adapter } = makeHarness();
    const names = functionNames(adapter);
    expect(names).toEqual(expect.arrayContaining(['start', 'poll', 'stop']));
    for (const name of FORBIDDEN) {
      expect(names).not.toContain(name);
      expect(typeof adapter[name]).not.toBe('function');
    }
    expect(Object.isFrozen(adapter)).toBe(true);
  });

  test('without a usable stream start does nothing and never throws', async () => {
    const adapter = createLiveReadAdapter({});
    await expect(adapter.start()).resolves.toEqual({ started: false, events: [] });
    expect(await adapter.poll()).toEqual([]);
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  test('reads the fixture through the injected stream only', async () => {
    const { adapter, calls } = makeHarness({ file: FIXTURE_PATH });
    const result = await adapter.start();
    expect(result.started).toBe(true);
    expect(calls).toEqual({ connect: 1, read: 1, close: 0 });
    expect(result.events.length).toBe(readFixture(FIXTURE_PATH).length);
  });

  test('normalizes known types and collapses everything else to other', async () => {
    const events = [
      { type: 'chat', text: 'hallo' },
      { type: 'gift', gift: 'rose' },
      { type: 'follow' },
      { type: 'social', action: 1 },
      { type: 'like', count: 3 },
      { type: 'share' },
      { type: 'chat', text: 42 }
    ];
    const { adapter } = makeHarness({ events });
    const { events: normalized } = await adapter.start();
    expect(normalized).toEqual([
      { type: 'chat', text: 'hallo' },
      { type: 'gift', text: '' },
      { type: 'follow', text: '' },
      { type: 'other', text: '' },
      { type: 'other', text: '' },
      { type: 'other', text: '' },
      { type: 'chat', text: '' }
    ]);
    expect(KNOWN_TYPES).toEqual(['chat', 'gift', 'follow']);
  });

  test('strips identity from events and logs', async () => {
    const { adapter, logLines } = makeHarness({ file: FIXTURE_PATH });
    const { events } = await adapter.start();
    const dumped = JSON.stringify({ events, logLines });
    expect(dumped).not.toContain('viewer_');
    expect(dumped).not.toContain('nickname');
    expect(dumped).not.toContain('uniqueId');
    expect(dumped).not.toContain('userId');
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['text', 'type']);
    }
    expect(logLines.every(entry => entry.kind === 'live-read')).toBe(true);
  });

  test('poll drains later batches and stop closes exactly once', async () => {
    const events = [
      { type: 'chat', text: 'eins' },
      { type: 'chat', text: 'zwei' },
      { type: 'follow' }
    ];
    const { adapter, calls } = makeHarness({ events, batchSize: 1 });
    const first = await adapter.start();
    expect(first.events).toEqual([{ type: 'chat', text: 'eins' }]);
    expect(await adapter.poll()).toEqual([{ type: 'chat', text: 'zwei' }]);
    await adapter.stop();
    expect(calls.close).toBe(1);
    // Events drained at stop stay readable once, then the adapter is empty.
    expect(await adapter.poll()).toEqual([{ type: 'follow', text: '' }]);
    expect(await adapter.poll()).toEqual([]);
    await adapter.stop();
    expect(calls.close).toBe(1);
  });

  test('a second start does not connect or read again', async () => {
    const { adapter, calls } = makeHarness({ file: FIXTURE_PATH });
    await adapter.start();
    const again = await adapter.start();
    expect(again.started).toBe(true);
    expect(again.events).toEqual([]);
    expect(calls.connect).toBe(1);
    expect(calls.read).toBe(1);
  });

  test('never touches the network', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('network must not be used');
    });
    try {
      const { adapter } = makeHarness({ file: FIXTURE_PATH });
      await adapter.start();
      await adapter.poll();
      await adapter.stop();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('publicEvent is pure and total', () => {
    expect(publicEvent(undefined)).toEqual({ type: 'other', text: '' });
    expect(publicEvent({ type: 'chat', text: 'ok', username: 'x' })).toEqual({ type: 'chat', text: 'ok' });
  });
});

describe('offline live-read fixture playback', () => {
  test('counts the normalized fixture types without a network', async () => {
    const { playLiveReadFixture, formatSummary } = require('../sidekick-host/live-read-fixture-play');
    const result = await playLiveReadFixture();
    expect(result.total).toBe(readFixture(FIXTURE_PATH).length);
    expect(result.events.length).toBe(result.total);
    expect(result.byType).toEqual({ chat: 5, gift: 2, follow: 1, other: 2 });
    expect(JSON.stringify(result)).not.toContain('viewer_');
    expect(formatSummary(result)).toContain('total=10 normalized=10');
  });
});
