'use strict';

const TopTierPlugin = require('../plugins/toptier/main');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { createOverlayFixture } = require('../plugins/toptier/test/helpers/obs-toptier-renderer-fixture');

jest.mock('../modules/public-overlay-release-event-policy', () => ({
  createPublicReleaseEventGuard: () => () => true
}));

describe('TopTier public session boundary', () => {
  test('projects the actual get-board producer without changing the original renderer leaderboard', async () => {
    const handlers = new Map();
    const api = {
      registerSocket: jest.fn((eventName, handler) => handlers.set(eventName, handler)),
      getConfig: jest.fn(() => ({ likesBoard: { displayCount: 5 }, giftsBoard: { displayCount: 5 } })),
      log: jest.fn()
    };
    const plugin = new TopTierPlugin(api);
    plugin.sessionManager = { getLiveSessionState: () => ({ active: true, sessionId: 'fixture-internal-session' }) };
    plugin.dbHandler = { getBoard: jest.fn(() => [{
      username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '', score: 9, rank: 1,
      internalRowData: 'private'
    }]) };
    plugin._registerSocketEvents();

    const localPackets = [];
    const publicPackets = [];
    const localSocket = { emit: (eventName, payload) => localPackets.push({ eventName, payload }) };
    const publicSocket = {
      handshake: { headers: { host: 'fixture-room.trycloudflare.com' } },
      join: jest.fn(),
      use: jest.fn(),
      emit: (eventName, payload) => publicPackets.push({ eventName, payload })
    };
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });

    handlers.get('toptier:get-board')(localSocket, { board: 'likes' });
    handlers.get('toptier:get-board')(publicSocket, { board: 'likes' });

    expect(localPackets[0]).toEqual({ eventName: 'toptier:update', payload: {
      board: 'likes',
      entries: [{ username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '', score: 9, rank: 1, internalRowData: 'private' }],
      sessionId: 'fixture-internal-session', active: true
    } });
    expect(publicPackets[0]).toEqual({ eventName: 'toptier:update', payload: {
      board: 'likes',
      entries: [{ username: 'fixture-viewer', nickname: 'Fixture Viewer', profile_picture_url: '', score: 9, rank: 1 }]
    } });
    expect(JSON.stringify(publicPackets)).not.toContain('fixture-internal-session');
    expect(publicSocket.emit('toptier:update', { board: 'unknown', entries: [] })).toBe(false);
    expect(publicSocket.emit('toptier:update', { board: 'likes', entries: [{ username: 'fixture', score: -1, rank: 1 }] })).toBe(false);
    expect(publicSocket.emit('toptier:unknown', { sessionId: 'fixture-internal-session' })).toBe(false);
    expect(publicPackets).toHaveLength(1);
    expect(plugin.dbHandler.getBoard).toHaveBeenCalledTimes(2);

    const localRenderer = await createOverlayFixture({ locale: 'en', board: 'likes', variant: 'spotlight' });
    const publicRenderer = await createOverlayFixture({ locale: 'en', board: 'likes', variant: 'spotlight' });
    localRenderer.fire(localPackets[0].eventName, localPackets[0].payload);
    publicRenderer.fire(publicPackets[0].eventName, publicPackets[0].payload);
    expect(publicRenderer.root.textContent).toBe(localRenderer.root.textContent);
    expect(publicRenderer.root.textContent).toContain('Fixture Viewer');
    expect(publicRenderer.root.textContent).toContain('9');
    localRenderer.close();
    publicRenderer.close();
  });
});
