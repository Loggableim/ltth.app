'use strict';

const {
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed
} = require('../modules/public-overlay-registry');
const {
  projectPublicOverlayPayload
} = require('../modules/public-overlay-payload-projection');
const {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
} = require('../modules/public-overlay-socket-adapter');
const {
  protectPublicSocket
} = require('../modules/public-overlay-access');

const PRIVATE_QUEUE_EVENTS = [
  'unified-queue:status',
  'unified-queue:wheel-queued'
];

function makePayload(eventName) {
  if (eventName === 'unified-queue:wheel-queued') {
    return {
      position: 2,
      username: 'synthetic-viewer-id',
      nickname: 'Synthetic Viewer',
      spinId: 'private-spin-id-canary',
      wheelId: 'private-wheel-id-canary',
      segmentCount: 7,
      timestamp: 123456,
      queueLength: 2
    };
  }

  return {
    isProcessing: true,
    queueLength: 2,
    currentItem: {
      type: 'wheel',
      username: 'synthetic-viewer-id',
      nickname: 'Synthetic Viewer',
      timestamp: 123456,
      spinId: 'private-spin-id-canary',
      batchId: 'private-batch-id-canary',
      gameType: 'wheel'
    },
    queue: [{
      position: 1,
      type: 'wheel',
      username: 'synthetic-viewer-id',
      nickname: 'Synthetic Viewer',
      timestamp: 123456,
      spinId: 'private-spin-id-canary',
      gameType: 'wheel'
    }],
    privateCanary: 'must-not-leak-publicly'
  };
}

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.broadcastCalls = [];
  }

  broadcast(packet, options) {
    this.broadcastCalls.push({ packet, options });
  }
}

describe('Unified Queue public boundary', () => {
  const Adapter = createPublicOverlayAdapter(RecordingAdapter);

  test.each(PRIVATE_QUEUE_EVENTS)(
    'withholds exact %s event and preserves the full local payload',
    eventName => {
      const payload = makePayload(eventName);
      const adapter = new Adapter({ name: '/' });
      const options = { rooms: new Set(), except: new Set() };

      expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
      expect(projectPublicOverlayPayload(eventName, payload)).toBeNull();

      adapter.broadcast({ data: [eventName, payload] }, options);

      expect(adapter.broadcastCalls).toHaveLength(1);
      expect(adapter.broadcastCalls[0].packet.data[0]).toBe(eventName);
      expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
      expect([...adapter.broadcastCalls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
      expect([...adapter.broadcastCalls[0].options.rooms]).toHaveLength(0);
    }
  );

  test.each(PRIVATE_QUEUE_EVENTS)(
    'blocks direct public %s emits without logging private IDs',
    eventName => {
      const logger = { warn: jest.fn() };
      const socket = {
        handshake: { headers: { host: 'queue-review.trycloudflare.com' } },
        data: {},
        join: jest.fn(),
        use: jest.fn(),
        emit: jest.fn(() => true)
      };
      const originalEmit = socket.emit;

      protectPublicSocket({ socket, logger });
      expect(socket.emit(eventName, makePayload(eventName))).toBe(false);
      expect(originalEmit).not.toHaveBeenCalled();
      const warningText = logger.warn.mock.calls.flat().join(' ');
      expect(warningText).not.toContain('private-spin-id-canary');
      expect(warningText).not.toContain('private-wheel-id-canary');
    }
  );

  test('keeps the exact status request and unrelated queue events unchanged', () => {
    expect(isIncomingSocketEventAllowed('unified-queue:request-status')).toBe(true);
    expect(isOutgoingSocketEventAllowed('unified-queue:cleared')).toBe(true);
    expect(projectPublicOverlayPayload('unified-queue:cleared', { count: 3 })).toBeUndefined();
    expect(projectPublicOverlayPayload('unified-queue:chess-queued', { type: 'chess' })).toBeUndefined();
  });
});
