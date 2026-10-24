'use strict';

const {
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

const WHEEL_PUBLIC_OUTGOING_EVENTS = [
  'wheel:audio-updated',
  'wheel:config',
  'wheel:config-updated',
  'wheel:queue-processing',
  'wheel:spin-error',
  'wheel:spin-queued',
  'wheel:spin-result',
  'wheel:spin-start',
  'wheel:spin-timeout'
];

function wheelPayload(eventName) {
  return {
    wheelId: 'private-wheel-id',
    spinId: 'private-spin-id',
    segmentIndex: 2,
    winningSegmentIndex: 2,
    segments: [{
      text: 'Prize canary',
      color: '#123456',
      xpReward: 900,
      shockDevices: ['private-device-id'],
      shockDuration: 5000,
      shockType: 'shock'
    }],
    settings: {
      privateSetting: 'private-setting-canary',
      displayTexts: { titleText: 'Wheel' }
    },
    giftTriggers: { 'private-gift-id': true },
    chatCommand: '!private-wheel',
    winningSegment: {
      text: 'Winner canary',
      shockDevices: ['private-device-id'],
      shockDuration: 5000
    },
    xpAwarded: 900,
    shockScheduled: true,
    filename: 'private-audio-filename',
    audioType: 'spinning',
    enabled: true,
    username: 'synthetic-viewer',
    nickname: 'Synthetic Viewer',
    position: 1,
    error: eventName === 'wheel:spin-error' ? 'synthetic error' : undefined
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

describe('Wheel public output deny-by-default boundary', () => {
  const Adapter = createPublicOverlayAdapter(RecordingAdapter);

  test.each(WHEEL_PUBLIC_OUTGOING_EVENTS)(
    'withholds %s from public projection while preserving the local original payload',
    eventName => {
      const payload = wheelPayload(eventName);

      expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
      expect(projectPublicOverlayPayload(eventName, payload)).toBeNull();

      const adapter = new Adapter({ name: '/' });
      const options = { rooms: new Set(), except: new Set() };
      adapter.broadcast({ data: [eventName, payload] }, options);

      expect(adapter.broadcastCalls).toHaveLength(1);
      expect(adapter.broadcastCalls[0].packet.data[0]).toBe(eventName);
      expect(adapter.broadcastCalls[0].packet.data[1]).toBe(payload);
      expect([...adapter.broadcastCalls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
      expect([...adapter.broadcastCalls[0].options.rooms]).toHaveLength(0);
    }
  );

  test.each(WHEEL_PUBLIC_OUTGOING_EVENTS)(
    'withholds direct %s emits on public sockets without logging payload fields',
    eventName => {
      const logger = { warn: jest.fn() };
      const socket = {
        handshake: { headers: { host: 'wheel-review.trycloudflare.com' } },
        data: {},
        join: jest.fn(),
        use: jest.fn(),
        emit: jest.fn(() => true)
      };
      const payload = wheelPayload(eventName);
      const originalEmit = socket.emit;

      protectPublicSocket({ socket, logger });
      const result = socket.emit(eventName, payload);

      expect(result).toBe(false);
      expect(originalEmit).not.toHaveBeenCalled();
      expect(logger.warn.mock.calls.flat().join(' ')).not.toContain('private-wheel-id');
      expect(logger.warn.mock.calls.flat().join(' ')).not.toContain('private-device-id');
    }
  );

  test('does not add a wildcard or suppress unrelated Game Engine events', () => {
    expect(projectPublicOverlayPayload('game-engine:timer-update', {
      timers: { white: 10000, black: 20000 },
      privateCanary: 'must-be-projected-out'
    })).toEqual({ timers: { white: 10000, black: 20000 } });
    expect(projectPublicOverlayPayload('game-engine:unrelated-fixture', { timer: 10 })).toBeUndefined();
    expect(isOutgoingSocketEventAllowed('game-engine:timer-update')).toBe(true);
    expect(isOutgoingSocketEventAllowed('wheel:unregistered-private-event')).toBe(false);
  });
});
