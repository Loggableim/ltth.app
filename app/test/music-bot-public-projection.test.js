'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const MusicBotPlugin = require('../plugins/music-bot/main');
const { protectPublicSocket, isApprovedQuickTunnelRequest } = require('../modules/public-overlay-access');
const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const { isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const SoundboardManager = require('../plugins/soundboard/main').SoundboardManager;
const { PUBLIC_QUICK_TUNNEL_ROOM, createPublicOverlayAdapter } = require('../modules/public-overlay-socket-adapter');

class RecordingAdapter {
  constructor(namespace) {
    this.namespace = namespace;
    this.broadcastCalls = [];
  }

  broadcast(packet, options) {
    this.broadcastCalls.push({ packet, options });
  }
}

function createPublicSocket() {
  const handlers = [];
  const calls = [];
  const socket = {
    handshake: { headers: { host: 'music-fixture.trycloudflare.com' } },
    data: {},
    join: jest.fn(),
    use: jest.fn(handler => handlers.push(handler)),
    emit: jest.fn((event, payload) => {
      calls.push({ event, payload });
      return true;
    })
  };
  protectPublicSocket({ socket, logger: { warn: jest.fn() }, pluginReleasePolicy: allowPublicDtoTestPolicy() });
  return { socket, calls, handlers };
}

function allowPublicDtoTestPolicy() {
  // This opts the fixture past dynamic admission only to exercise DTO shape;
  // it does not claim Music Bot is currently admitted to public tunnels.
  return {
    getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
    isClosedBetaId: () => false
  };
}

function bootOverlay() {
  const socketHandlers = new Map();
  const socket = {
    on: (event, handler) => socketHandlers.set(event, handler),
    emit: jest.fn()
  };
  const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/overlay.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/plugins/music-bot/overlay.html?design=compact',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.io = () => socket;
    }
  });
  return { dom, socket, socketHandlers };
}

describe('Music Bot public socket projections', () => {
  test('projects the actual status handler only to overlay fields and blocks diagnostics', async () => {
    const registered = new Map();
    const api = {
      getSocketIO: () => ({}),
      getDatabase: () => ({}),
      registerSocket: (event, handler) => registered.set(event, handler),
      log: jest.fn()
    };
    const plugin = Object.create(MusicBotPlugin.prototype);
    plugin.api = api;
    plugin.config = { audio: { masterVolume: 80, sourceVolume: 45 }, autoDJ: { enabled: true } };
    plugin.playbackEngine = {
      getNowPlaying: () => ({
        id: 'track-internal-id', playbackId: 'playback-fixture', title: 'Fixture Song', artist: 'Fixture Artist',
        duration: 180, position: 12, requestedBy: 'Fixture Viewer', requesterAvatar: 'https://p16-sign.tiktokcdn.com/avatar.png',
        thumbnail: 'https://example.test/cover.png', startedAt: 1700000000000,
        url: 'https://media.example.test/private?token=secret', localPath: 'C:\\private\\song.mp3',
        providerId: 'provider-private', channelId: 'channel-private'
      }),
      getState: () => 'playing'
    };
    plugin.queueManager = {
      getQueue: () => [
        { id: 'queued-private-id', title: 'Queued Song', artist: 'Queue Artist', url: 'https://media.example.test/queued?token=secret', requesterKey: 'private-key' },
        { id: 'q2', title: 'Second Song', artist: 'Artist 2' },
        { id: 'q3', title: 'Third Song', artist: 'Artist 3' },
        { id: 'q4', title: 'Not rendered' }
      ]
    };
    plugin._computeEffectiveVolume = () => 37;
    plugin._buildRuntimeSnapshot = () => ({ pid: 4312, activePlaybackId: 'playback-fixture', pipePath: 'C:\\private\\pipe' });
    plugin._buildResolverSnapshot = () => ({ jobs: [{ url: 'https://private.example.test', token: 'secret' }] });
    plugin._buildHealthPayload = () => ({ lastError: 'private diagnostic' });
    plugin._nextSongVote = {
      getStatus: () => ({ status: 'open', closesAt: 1700000010000, votes: { 1: 2, 2: 1 },
        candidates: [{ id: 'candidate-private-id', title: 'Option A', artist: 'Artist A', url: 'https://private/a' },
          { id: 'candidate-private-id-2', title: 'Option B', artist: 'Artist B' }], winner: null })
    };
    plugin._registerSocketEvents();

    const { socket, calls } = createPublicSocket();
    await registered.get('musicbot:request-status')(socket);

    expect(calls).toEqual([
      { event: 'musicbot:now-playing', payload: {
        title: 'Fixture Song', artist: 'Fixture Artist', duration: 180, position: 12,
        requestedBy: 'Fixture Viewer', requesterAvatar: 'https://p16-sign.tiktokcdn.com/avatar.png'
      } },
    ]);
    expect(calls.map(call => call.event)).not.toContain('musicbot:runtime');
    expect(calls.map(call => call.event)).not.toContain('musicbot:resolver');
    expect(calls.map(call => call.event)).not.toContain('musicbot:health');
    expect(JSON.stringify(calls)).not.toMatch(/private|token|provider|channel|queued-private|candidate-private/);

    const localCalls = [];
    await registered.get('musicbot:request-status')({ emit: (event, payload) => localCalls.push({ event, payload }) });
    expect(localCalls.find(call => call.event === 'musicbot:now-playing').payload).toMatchObject({
      id: 'track-internal-id', playbackId: 'playback-fixture', url: 'https://media.example.test/private?token=secret',
      thumbnail: 'https://example.test/cover.png'
    });
  });

  test('projects playback sync to only fields used by the original overlay', () => {
    expect(projectPublicOverlayPayload('musicbot:playback-sync', {
      id: 'track-1', playbackId: 'playback-1', title: 'Song', artist: 'Artist', requestedBy: 'Viewer',
      requesterAvatar: null, thumbnail: null, duration: 180, position: 42, startedAt: 1700000000000,
      seekable: true, state: 'playing', streamUrl: 'https://private/stream', id3: 'private'
    })).toEqual({
      title: 'Song', artist: 'Artist', requestedBy: 'Viewer', duration: 180, position: 42, state: 'playing'
    });
    expect(projectPublicOverlayPayload('musicbot:vote-skip-update', {
      votes: 2, required: 5, skipped: false, voters: ['viewer-private'], title: 'Song', immuneInfo: { id: 7 }
    })).toBeUndefined();
    expect(projectPublicOverlayPayload('musicbot:volume-changed', { volume: 80, settings: 'CANARY' })).toBeUndefined();
  });

  test('redacts canary ids, source URLs, unknown fields, and non-HTTPS requester images', () => {
    const raw = {
      id: 'CANARY_TRACK_ID', playbackId: 'CANARY_PLAYBACK_ID', title: 'Canary Song', artist: 'Canary Artist',
      duration: 90, position: 12, state: 'playing', requestedBy: 'Public Display Name',
      requesterAvatar: 'http://avatar.example.test/canary.png',
      thumbnail: 'https://art.example.test/cover.png', url: 'https://media.example.test/CANARY_STREAM',
      streamUrl: 'https://media.example.test/CANARY_STREAM_URL', rawPayload: 'CANARY_RAW',
      settings: { secret: 'CANARY_SETTING' }, apiKey: 'CANARY_KEY', unexpected: 'CANARY_UNKNOWN'
    };
    const projected = projectPublicOverlayPayload('musicbot:now-playing', raw);
    expect(projected).toEqual({
      title: 'Canary Song', artist: 'Canary Artist', duration: 90, position: 12,
      state: 'playing', requestedBy: 'Public Display Name'
    });
    expect(JSON.stringify(projected)).not.toMatch(/CANARY|http:/);
    expect(projectPublicOverlayPayload('musicbot:now-playing', {
      title: 'Song', requesterAvatar: 'https://user:pass@p16-sign.tiktokcdn.com/pic.png', raw: 'CANARY'
    })).toEqual({ title: 'Song' });
    expect(projectPublicOverlayPayload('musicbot:now-playing', {
      title: 'Song', requesterAvatar: 'https://p16-sign.tiktokcdn.com/pic.png', id: 'CANARY_ID'
    })).toEqual({ title: 'Song', requesterAvatar: 'https://p16-sign.tiktokcdn.com/pic.png' });
    for (const requesterAvatar of [
      'http://p16-sign.tiktokcdn.com/pic.png',
      'https://untrusted.example.test/pic.png',
      'https://p16-sign.tiktokcdn.com/pic.png?x-signature=CANARY_TOKEN',
      'https://p16-sign.tiktokcdn.com/pic.png#CANARY_FRAGMENT'
    ]) {
      expect(projectPublicOverlayPayload('musicbot:now-playing', { title: 'Song', requesterAvatar }))
        .toEqual({ title: 'Song' });
    }
    expect(projectPublicOverlayPayload('musicbot:queue-update', {
      length: 99, queue: [{ id: 'CANARY_QUEUE_ID', title: 'Queue Canary', url: 'https://media.test/x' }],
      settings: 'CANARY_SETTINGS'
    })).toBeUndefined();
    expect(projectPublicOverlayPayload('musicbot:next-song-vote', {
      status: 'open', votes: { 1: 2, 2: 1, CANARY_VOTER: 99 },
      candidates: [{ id: 'CANARY_CANDIDATE_ID', title: 'Vote Canary', artist: 'Artist' }],
      voterIds: ['CANARY_VOTER_ID'], settings: 'CANARY_SETTINGS'
    })).toBeUndefined();
    expect(projectPublicOverlayPayload('musicbot:vote-skip-update', {
      votes: 5, required: 3, skipped: true, voters: ['CANARY_VOTER'], settings: 'CANARY_SETTINGS'
    })).toBeUndefined();
  });

  test.each([
    ['musicbot:now-playing', { id: 'track', title: '', state: 'invalid' }],
    ['musicbot:playback-sync', { id: 'track', title: 'Song', position: -1 }],
  ])('fails closed for invalid %s payloads', (eventName, payload) => {
    expect(projectPublicOverlayPayload(eventName, payload)).toBeNull();
  });

  test('keeps queue, vote, vote-skip, and volume events out of the public Socket.IO room', () => {
    const Adapter = createPublicOverlayAdapter(RecordingAdapter, { pluginReleasePolicy: allowPublicDtoTestPolicy() });
    const adapter = new Adapter({ name: '/' });
    for (const [eventName, payload] of [
      ['musicbot:queue-update', { queue: [{ title: 'QUEUE_CANARY' }] }],
      ['musicbot:next-song-vote', { candidates: [{ title: 'VOTE_CANARY' }], votes: { 1: 42 } }],
      ['musicbot:vote-skip-update', { votes: 5, required: 3, skipped: true }],
      ['musicbot:volume-changed', { volume: 80 }]
    ]) {
      adapter.broadcast({ data: [eventName, payload] }, { rooms: new Set(), except: new Set() });
    }
    expect(adapter.broadcastCalls).toHaveLength(4);
    for (const call of adapter.broadcastCalls) {
      expect(call.options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    }
    expect(adapter.broadcastCalls.some(call => call.options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)
      && !call.options.except.has(PUBLIC_QUICK_TUNNEL_ROOM))).toBe(false);
  });

  test('the original overlay renders approved track state without public queue or vote data', () => {
    const { dom, socketHandlers } = bootOverlay();
    try {
      socketHandlers.get('musicbot:now-playing')(projectPublicOverlayPayload('musicbot:now-playing', {
        id: 'track-1', playbackId: 'playback-1', title: 'Fixture Song', artist: 'Fixture Artist',
        duration: 180, position: 0, state: 'playing', streamUrl: 'https://private.test?token=x',
        requesterAvatar: 'https://p16-sign.tiktokcdn.com/profile.png', rawPayload: 'CANARY_RAW'
      }));
      expect(dom.window.document.getElementById('compact-title').textContent).toBe('Fixture Song');
      expect(dom.window.document.getElementById('compact-artist').textContent).toBe('Fixture Artist');
      expect(dom.window.document.getElementById('compact-avatar').src).toBe('https://p16-sign.tiktokcdn.com/profile.png');
      expect(dom.window.document.getElementById('up-next-items').textContent).toBe('');
      expect(dom.window.document.getElementById('next-song-vote-candidates').textContent).toBe('');
      socketHandlers.get('musicbot:playback-sync')(projectPublicOverlayPayload('musicbot:playback-sync', {
        id: 'private-next-id', title: 'Fixture Song', artist: 'Fixture Artist', position: 12, rawPayload: 'CANARY_SYNC'
      }));
      expect(dom.window.document.getElementById('compact-title').textContent).toBe('Fixture Song');
      expect(dom.window.document.querySelector('.requester-avatar')?.src || '').not.toContain('CANARY');
    } finally {
      dom.window.close();
    }
  });

  test('keeps Soundboard sound events local until public ownership and route are approved', () => {
    expect(isOutgoingSocketEventAllowed('soundboard:play')).toBe(true);
    expect(createPublicReleaseEventGuard(allowPublicDtoTestPolicy())('outgoing', 'soundboard:play')).toBe(false);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/animation-overlay.html' })).toBe(false);

    const Adapter = createPublicOverlayAdapter(RecordingAdapter, { pluginReleasePolicy: allowPublicDtoTestPolicy() });
    const adapter = new Adapter({ name: '/' });
    const io = {
      sockets: { sockets: new Map([['fixture-client', {}]]) },
      emit: (event, payload) => adapter.broadcast(
        { data: [event, payload] },
        { rooms: new Set(), except: new Set() }
      )
    };
    const originalLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const manager = new SoundboardManager({ getSetting: () => 'both' }, io, { log: jest.fn() });
    const sound = {
      url: '/sounds/fixture-sound.mp3', volume: 0.4, label: 'Fixture sound', giftId: 72,
      eventType: 'gift', repeatCount: 2, timestamp: 123456, privateUser: 'viewer-secret', token: 'private-token'
    };
    try {
      manager.emitSound(sound);
      expect(adapter.broadcastCalls).toHaveLength(1);
      const local = adapter.broadcastCalls[0];
      expect(local.packet.data).toEqual(['soundboard:play', {
        url: '/sounds/fixture-sound.mp3', volume: 0.4, label: 'Fixture sound', giftId: 72,
        eventType: 'gift', repeatCount: 2, timestamp: 123456, audioTarget: 'both'
      }]);
      expect(local.options.rooms).toEqual(new Set());
      expect(local.options.except).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    } finally {
      originalLog.mockRestore();
    }
  });

  test.each([
    { url: 'javascript:alert(1)', volume: 0.5, label: 'Sound', eventType: 'gift', audioTarget: 'both' },
    { url: 'https://user:pass@example.test/sound.mp3', volume: 0.5, label: 'Sound', eventType: 'gift', audioTarget: 'both' },
    { url: 'https://example.test/sound.mp3?token=private', volume: 0.5, label: 'Sound', eventType: 'gift', audioTarget: 'both' },
    { url: '/game-engine/sounds/custom.mp3', volume: 0.5, label: 'Sound', eventType: 'gift', audioTarget: 'both' },
    { url: '/sounds/sound.mp3', volume: 2, label: 'Sound', eventType: 'gift', audioTarget: 'both' },
    { url: '/sounds/sound.mp3', volume: 0.5, label: 'Sound', eventType: 'private', audioTarget: 'both' },
    { url: '/sounds/sound.mp3', volume: 0.5, label: 'Sound', eventType: 'gift', audioTarget: 'public' },
    { url: '/sounds/sound.mp3', volume: 0.5, label: 'Sound', eventType: 'gift', audioTarget: 'both', repeatCount: 51 }
  ])('fails closed on invalid Soundboard playback payload %#', payload => {
    expect(projectPublicOverlayPayload('soundboard:play', payload)).toBeNull();
  });
});
