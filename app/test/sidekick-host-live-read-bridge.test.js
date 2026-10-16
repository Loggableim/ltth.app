'use strict';

const { EventEmitter } = require('events');
const { createEventBridgeStream } = require('../sidekick-host/adapters/live-read-stream');
const { createLiveReadAdapter } = require('../sidekick-host/adapters/live-read-adapter');

describe('live read event bridge', () => {
  test('buffers chat, gift and follow events from the injected source and reads them once', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source });
    await stream.connect();
    source.emit('chat', { comment: 'hallo', uniqueId: 'viewer_zz' });
    source.emit('gift', { giftName: 'rose' });
    source.emit('follow', { uniqueId: 'viewer_zz' });
    const first = await stream.read();
    expect(first).toEqual([
      { type: 'chat', text: 'hallo' },
      { type: 'gift', text: '' },
      { type: 'follow', text: '' }
    ]);
    expect(await stream.read()).toEqual([]);
  });

  test('close removes listeners and opens no network', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source });
    await stream.connect();
    await stream.close();
    source.emit('chat', { comment: 'nach close' });
    expect(await stream.read()).toEqual([]);
    expect(source.listenerCount('chat')).toBe(0);
  });

  test('the bridge is not used without SIDEKICK_LIVE=1', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source });
    const adapter = createLiveReadAdapter({ stream, env: { SIDEKICK_LIVE: undefined } });
    expect(await adapter.start()).toEqual({ started: false, events: [] });
    expect(source.listenerCount('chat')).toBe(0);
  });

  test('a bridge with a live switch returns only the stripped public event fields', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source });
    const adapter = createLiveReadAdapter({ stream, env: { SIDEKICK_LIVE: '1' } });
    await adapter.start();
    source.emit('chat', { comment: 'x', uniqueId: 'viewer_zz' });
    const result = await adapter.stop();
    expect(result).toBeUndefined();
    expect(JSON.stringify(await stream.read())).not.toContain('viewer_zz');
  });
});
