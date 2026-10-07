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

const EVENT_NAME = 'tts:playback:ended';

function makePayload() {
  return {
    playbackId: 'private-playback-id-canary',
    userId: 'private-user-id-canary',
    username: 'Synthetic Narrator',
    source: 'interactive-story',
    rendererOutcome: 'ended',
    duration: 1234,
    timestamp: 5678
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

describe('TTS playback ended public boundary', () => {
  test('has no Public incoming consumer and withholds raw outgoing lifecycle data', () => {
    expect(isIncomingSocketEventAllowed(EVENT_NAME)).toBe(false);
    expect(isOutgoingSocketEventAllowed(EVENT_NAME)).toBe(true);
    expect(projectPublicOverlayPayload(EVENT_NAME, makePayload())).toBeNull();
  });

  test('preserves the original local event and suppresses its public-room broadcast', () => {
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter({ name: '/' });
    const payload = makePayload();
    const options = { rooms: new Set(), except: new Set() };

    adapter.broadcast({ data: [EVENT_NAME, payload] }, options);

    expect(adapter.broadcastCalls).toHaveLength(1);
    expect(adapter.broadcastCalls[0].packet.data).toEqual([EVENT_NAME, payload]);
    expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
    expect([...adapter.broadcastCalls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
  });

  test('blocks direct Public-socket emits without exposing lifecycle identifiers in logs', () => {
    const logger = { warn: jest.fn() };
    const socket = {
      handshake: { headers: { host: 'tts-review.trycloudflare.com' } },
      data: {},
      join: jest.fn(),
      use: jest.fn(),
      emit: jest.fn(() => true)
    };
    const originalEmit = socket.emit;

    protectPublicSocket({ socket, logger });
    const result = socket.emit(EVENT_NAME, makePayload());

    expect(result).toBe(false);
    expect(originalEmit).not.toHaveBeenCalled();
    const warningText = logger.warn.mock.calls.flat().join(' ');
    expect(warningText).not.toContain('private-playback-id-canary');
    expect(warningText).not.toContain('private-user-id-canary');
  });
});
