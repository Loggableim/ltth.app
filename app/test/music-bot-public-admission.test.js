'use strict';

const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const { createPublicOverlayAdapter, PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');
const { isIncomingSocketEventAllowed, isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');
const { isApprovedQuickTunnelRequest, protectPublicSocket } = require('../modules/public-overlay-access');

class RecordingAdapter {
  constructor() { this.calls = []; }
  broadcast(packet, options) { this.calls.push({ packet, options }); }
}

function createPublicSocket() {
  const emitted = [];
  const socket = {
    handshake: { headers: { host: 'isolated-fixture.trycloudflare.com' } },
    data: {},
    join: jest.fn(),
    use: jest.fn(handler => { socket.incomingMiddleware = handler; }),
    emit: jest.fn((event, payload) => { emitted.push({ event, payload }); return true; })
  };
  protectPublicSocket({ socket, logger: { warn: jest.fn() } });
  return { socket, emitted };
}

describe('Music Bot public admission uses the real closed-beta policy', () => {
  test('keeps Quick-Tunnel HTML, status requests, and display events fail-closed', () => {
    const guard = createPublicReleaseEventGuard();
    const musicEvents = [
      'musicbot:now-playing', 'musicbot:playback-sync', 'musicbot:queue-update',
      'musicbot:next-song-vote', 'musicbot:vote-skip-update', 'musicbot:paused',
      'musicbot:resumed', 'musicbot:playback-stopped', 'musicbot:volume-changed'
    ];

    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/plugins/music-bot/overlay.html' })).toBe(false);
    expect(isIncomingSocketEventAllowed('musicbot:request-status')).toBe(true);
    expect(guard('incoming', 'musicbot:request-status')).toBe(false);
    for (const eventName of musicEvents) {
      expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
      expect(guard('outgoing', eventName)).toBe(false);
    }

    const { socket, emitted } = createPublicSocket();
    const next = jest.fn();
    socket.incomingMiddleware(['musicbot:request-status', {}], next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].data.code).toBe('PUBLIC_SOCKET_EVENT_NOT_ALLOWED');
    expect(socket.emit('musicbot:now-playing', { title: 'private-canary' })).toBe(false);
    expect(emitted).toEqual([]);

    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter();
    adapter.broadcast(
      { data: ['musicbot:now-playing', { title: 'private-canary', url: 'https://private.example/stream' }] },
      { rooms: new Set(), except: new Set() }
    );
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0].options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    expect(adapter.calls[0].options.rooms).toEqual(new Set());
    expect(adapter.calls[0].packet.data[1]).toMatchObject({ title: 'private-canary' });
  });
});
