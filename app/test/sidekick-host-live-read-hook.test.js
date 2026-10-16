'use strict';

const { EventEmitter } = require('events');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');
const { attachLiveReadHook } = require('../sidekick-host/adapters/live-read-hook');

function mockDeps() {
  const noop = () => {};
  return {
    io: { emit: noop },
    db: new Proxy({}, { get: () => () => null }),
    logger: { info: noop, warn: noop, debug: noop, error: noop }
  };
}

function newAdapter() {
  const { io, db, logger } = mockDeps();
  return new EulerstreamAdapter(io, db, logger);
}

describe('live read hook on the existing connection', () => {
  test('without SIDEKICK_LIVE=1 no hook, no listener, no extra emitter wiring', () => {
    const adapter = newAdapter();
    const spy = jest.spyOn(adapter, 'setEmitterListener');
    for (const value of [undefined, '', '0', 'true', 'yes']) {
      expect(attachLiveReadHook(adapter, value)).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
    expect(adapter._emitterListener).toBeUndefined();
  });

  test('with SIDEKICK_LIVE=1 events of the current emitter reach the bridge', async () => {
    const adapter = newAdapter();
    const hook = attachLiveReadHook(adapter, '1');
    const emitter = new EventEmitter();
    adapter.eventEmitter = emitter;
    adapter._notifyEmitterListener();
    emitter.emit('chat', { comment: 'hallo', uniqueId: 'viewer_zz', nickname: 'viewer_zz' });
    const events = await hook.stream.read();
    expect(events).toEqual([{ type: 'chat', text: 'hallo' }]);
    expect(JSON.stringify(events)).not.toContain('viewer_zz');
    hook.dispose();
  });

  test('re-attaches after an emitter reset without duplicate listeners', async () => {
    const adapter = newAdapter();
    const hook = attachLiveReadHook(adapter, '1');
    const first = new EventEmitter();
    adapter.eventEmitter = first;
    adapter._notifyEmitterListener();
    const second = new EventEmitter();
    adapter.eventEmitter = second;
    adapter._notifyEmitterListener();
    expect(first.listenerCount('chat')).toBe(0);
    expect(second.listenerCount('chat')).toBe(1);
    expect(second.listenerCount('gift')).toBe(1);
    expect(second.listenerCount('follow')).toBe(1);
    second.emit('follow', { uniqueId: 'viewer_zz' });
    expect(await hook.stream.read()).toEqual([{ type: 'follow', text: '' }]);
    hook.dispose();
  });

  test('a null emitter after disconnect detaches all listeners', () => {
    const adapter = newAdapter();
    const hook = attachLiveReadHook(adapter, '1');
    const emitter = new EventEmitter();
    adapter.eventEmitter = emitter;
    adapter._notifyEmitterListener();
    adapter.eventEmitter = null;
    adapter._notifyEmitterListener();
    expect(emitter.listenerCount('chat')).toBe(0);
    hook.dispose();
  });

  test('dispose removes the listener from the adapter and the emitter', () => {
    const adapter = newAdapter();
    const hook = attachLiveReadHook(adapter, '1');
    const emitter = new EventEmitter();
    adapter.eventEmitter = emitter;
    adapter._notifyEmitterListener();
    hook.dispose();
    expect(adapter._emitterListener).toBeNull();
    expect(emitter.listenerCount('chat')).toBe(0);
    adapter.eventEmitter = new EventEmitter();
    adapter._notifyEmitterListener();
    expect(adapter.eventEmitter.listenerCount('chat')).toBe(0);
  });
});
