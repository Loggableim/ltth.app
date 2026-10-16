'use strict';

const { EventEmitter } = require('events');
const { createEventBridgeStream } = require('../sidekick-host/adapters/live-read-stream');
const { createLiveReadAdapter } = require('../sidekick-host/adapters/live-read-adapter');

describe('live read event bridge', () => {
  test('buffers chat (comment, message, text), gift and follow and reads them once', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source, env: { SIDEKICK_LIVE: '1' } });
    await stream.connect();
    source.emit('chat', { comment: 'a', uniqueId: 'viewer_zz' });
    source.emit('chat', { message: 'b', uniqueId: 'viewer_zz' });
    source.emit('chat', { text: 'c' });
    source.emit('gift', { giftName: 'rose' });
    source.emit('follow', { uniqueId: 'viewer_zz' });
    expect(await stream.read()).toEqual([
      { type: 'chat', text: 'a' },
      { type: 'chat', text: 'b' },
      { type: 'chat', text: 'c' },
      { type: 'gift', text: '' },
      { type: 'follow', text: '' }
    ]);
    expect(await stream.read()).toEqual([]);
  });

  test('without SIDEKICK_LIVE=1 the bridge subscribes to nothing, even when connect is called directly', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source, env: {} });
    await stream.connect();
    expect(source.listenerCount('chat')).toBe(0);
    expect(source.listenerCount('gift')).toBe(0);
    expect(source.listenerCount('follow')).toBe(0);
    source.emit('chat', { comment: 'nicht gelesen' });
    expect(await stream.read()).toEqual([]);
  });

  test('close removes listeners but keeps events received before close', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source, env: { SIDEKICK_LIVE: '1' } });
    await stream.connect();
    source.emit('chat', { comment: 'vor close' });
    await stream.close();
    source.emit('chat', { comment: 'nach close' });
    expect(source.listenerCount('chat')).toBe(0);
    expect(await stream.read()).toEqual([{ type: 'chat', text: 'vor close' }]);
  });

  test('the adapter returns events received after start through poll, before stop', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source, env: { SIDEKICK_LIVE: '1' } });
    const adapter = createLiveReadAdapter({ stream, env: { SIDEKICK_LIVE: '1' } });
    await adapter.start();
    source.emit('chat', { comment: 'nach start', uniqueId: 'viewer_zz' });
    source.emit('follow', { uniqueId: 'viewer_zz' });
    const polled = await adapter.poll();
    expect(polled).toEqual([
      { type: 'chat', text: 'nach start' },
      { type: 'follow', text: '' }
    ]);
    expect(JSON.stringify(polled)).not.toContain('viewer_zz');
    await adapter.stop();
    expect(source.listenerCount('chat')).toBe(0);
  });

  test('events received after start are still returned by poll when stop comes first', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source, env: { SIDEKICK_LIVE: '1' } });
    const adapter = createLiveReadAdapter({ stream, env: { SIDEKICK_LIVE: '1' } });
    await adapter.start();
    source.emit('chat', { message: 'vor stop', uniqueId: 'viewer_zz' });
    await adapter.stop();
    const polled = await adapter.poll();
    expect(polled).toEqual([{ type: 'chat', text: 'vor stop' }]);
    expect(JSON.stringify(polled)).not.toContain('viewer_zz');
    expect(await adapter.poll()).toEqual([]);
    expect(source.listenerCount('chat')).toBe(0);
  });

  test('the adapter does not start and nothing is subscribed without SIDEKICK_LIVE=1', async () => {
    const source = new EventEmitter();
    const stream = createEventBridgeStream({ source, env: {} });
    const adapter = createLiveReadAdapter({ stream, env: { SIDEKICK_LIVE: undefined } });
    expect(await adapter.start()).toEqual({ started: false, events: [] });
    expect(await adapter.poll()).toEqual([]);
    expect(source.listenerCount('chat')).toBe(0);
  });
});
