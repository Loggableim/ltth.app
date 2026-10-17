'use strict';

const { projectAnonymousOverlayStatus, projectPublicOverlayEvent } = require('../backend/public-status');
const { isHttpAllowed } = require('../../../modules/public-overlay-registry');
const SidekickPlugin = require('../main');

describe('Sidekick anonymous overlay status projection', () => {
  test('withholds unapproved connection state, counters, and settings from public status', () => {
    const result = projectAnonymousOverlayStatus({
      driver: 'vnyan',
      avatar: { isConnected: true, uri: 'ws://private-host', isSpeaking: true },
      vnyan: { isConnected: true, currentEmotion: 'secret-emotion' },
      animaze: { isConnected: false, queueLength: 15 },
      muted: true,
      outbox: { pending: ['private message'] },
      deduper: { privateMetric: 2 },
      rateLimiter: { privateConfig: 'canary' },
      session: {
        totalGifts: 6,
        totalFollows: 3,
        totalChats: 51,
        totalDiamonds: 800
      },
      currentRates: { chatsPerMinute: 12, likesPerMinute: 500 },
      pendingJoins: 4,
      activeViewers: 7,
      apiKey: 'private-canary'
    });

    expect(result).toEqual({});
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('canary');
    for (const field of ['connected', 'muted', 'chatsPerMinute', 'totalGifts', 'totalFollows', 'activeViewers']) {
      expect(result).not.toHaveProperty(field);
    }
  });

  test('keeps the public status empty for invalid, missing, or ordinary status data', () => {
    expect(projectAnonymousOverlayStatus({
      avatar: { isConnected: 'true' },
      currentRates: { chatsPerMinute: -1 },
      session: { totalGifts: 1.9, totalFollows: Infinity },
      activeViewers: 'not-a-count'
    })).toEqual({});
    expect(projectAnonymousOverlayStatus({ avatar: { isConnected: true }, muted: false })).toEqual({});
  });

  test('projects only bounded chat and gift fields for the public event feed', () => {
    expect(projectPublicOverlayEvent({
      type: 'chat', ts: 100, uid: 'private-id', nickname: 'N'.repeat(100),
      payload: { comment: 'C'.repeat(150), private: 'canary' }
    })).toEqual({
      type: 'chat', ts: 100, nickname: 'N'.repeat(80),
      payload: { comment: 'C'.repeat(30), commentTruncated: true }
    });
    expect(projectPublicOverlayEvent({ type: 'follow', uid: 'private-id' })).toBeNull();
  });

  test('serves explicitly registered projected status and bounded events', () => {
    const routes = new Map();
    const api = {
      getSocketIO: () => ({ emit: jest.fn(), to: () => ({ emit: jest.fn() }) }),
      getDatabase: () => ({}),
      registerRoute: jest.fn((method, path, handler) => {
        routes.set(`${method.toUpperCase()} ${path}`, handler);
      })
    };
    const plugin = new SidekickPlugin(api);
    plugin._getStatus = jest.fn(() => ({
      avatar: { isConnected: true, uri: 'private' },
      currentRates: { chatsPerMinute: 2 },
      session: { totalGifts: 1, totalFollows: 3 },
      activeViewers: 4
    }));
    plugin._registerRoutes();

    const handler = routes.get('GET /api/sidekick/public-status');
    const res = { json: jest.fn() };
    handler({}, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      status: {}
    });
    expect(isHttpAllowed({
      method: 'GET',
      pathname: '/api/sidekick/public-status'
    })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/sidekick/public-events?limit=999999' })).toBe(true);
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/sidekick/public-status' })).toBe(false);
  });
});
