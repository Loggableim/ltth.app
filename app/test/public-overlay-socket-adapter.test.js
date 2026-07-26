'use strict';

const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.broadcastCalls = [];
    this.broadcastWithAckCalls = [];
  }

  broadcast(packet, options) {
    this.broadcastCalls.push({ packet, options });
  }

  broadcastWithAck(packet, options, clientCountCallback, ack) {
    this.broadcastWithAckCalls.push({
      packet,
      options,
      clientCountCallback,
      ack
    });
  }
}

describe('PublicOverlayAdapter', () => {
  const Adapter = createPublicOverlayAdapter(RecordingAdapter);

  test('leaves a registered outgoing broadcast unchanged', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set(['local-exclusion']) };

    adapter.broadcast({ data: ['weather:trigger', { intensity: 1 }] }, options);

    expect(adapter.broadcastCalls[0].options).toBe(options);
  });

  test('adds the public room to exclusions for an unregistered broadcast', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set(['local-exclusion']) };

    adapter.broadcast({ data: ['admin:settings-updated', { secret: true }] }, options);

    const forwarded = adapter.broadcastCalls[0].options;
    expect(forwarded).not.toBe(options);
    expect([...forwarded.except]).toEqual([
      'local-exclusion',
      PUBLIC_QUICK_TUNNEL_ROOM
    ]);
    expect([...options.except]).toEqual(['local-exclusion']);
  });

  test('applies the same exclusion to acknowledgement broadcasts', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };
    const clientCountCallback = jest.fn();
    const ack = jest.fn();

    adapter.broadcastWithAck(
      { data: ['admin:settings-updated'] },
      options,
      clientCountCallback,
      ack
    );

    expect([
      ...adapter.broadcastWithAckCalls[0].options.except
    ]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect(adapter.broadcastWithAckCalls[0].clientCountCallback).toBe(clientCountCallback);
    expect(adapter.broadcastWithAckCalls[0].ack).toBe(ack);
  });

  test('preserves protocol packets that do not contain an application event', () => {
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };

    adapter.broadcast({ type: 3, data: undefined }, options);

    expect(adapter.broadcastCalls[0].options).toBe(options);
  });
});
