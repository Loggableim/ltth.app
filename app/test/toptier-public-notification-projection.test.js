'use strict';

const ScoreEngine = require('../plugins/toptier/backend/score-engine');
const DecayScheduler = require('../plugins/toptier/backend/decay-scheduler');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { createOverlayFixture } = require('../plugins/toptier/test/helpers/obs-toptier-renderer-fixture');

function createSocketPair() {
  const local = [];
  const publicPackets = [];
  const publicSocket = {
    handshake: { headers: { host: 'fixture-overlay.trycloudflare.com' } },
    join: jest.fn(),
    use: jest.fn(),
    emit(eventName, payload) { publicPackets.push({ eventName, payload }); }
  };
  protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
  const localSocket = { emit(eventName, payload) { local.push({ eventName, payload }); } };
  const emit = (eventName, payload) => {
    localSocket.emit(eventName, payload);
    publicSocket.emit(eventName, payload);
  };
  return { local, publicPackets, emit };
}

describe('TopTier public notification projections', () => {
  test('projects the actual score-engine notifications to only original overlay fields', async () => {
    const sockets = createSocketPair();
    const engine = new ScoreEngine({ emit: sockets.emit }, {}, {});
    engine.previousLikesRanks.set('fixture-viewer', 2);
    engine.previousLikesLeader = 'fixture-old-leader';

    engine._detectAndEmitChanges('likes', [{
      username: 'fixture-viewer', nickname: 'Fixture Nickname', rank: 1, score: 42,
      internalUserId: 'private-user-id', sessionId: 'private-session'
    }]);

    expect(sockets.local).toEqual([
      { eventName: 'toptier:rank-change', payload: {
        board: 'likes', username: 'fixture-viewer', nickname: 'Fixture Nickname', oldRank: 2, newRank: 1, score: 42
      } },
      { eventName: 'toptier:new-leader', payload: {
        board: 'likes', username: 'fixture-viewer', nickname: 'Fixture Nickname', score: 42
      } }
    ]);
    expect(sockets.publicPackets).toEqual([
      { eventName: 'toptier:rank-change', payload: { username: 'fixture-viewer', oldRank: 2, newRank: 1 } },
      { eventName: 'toptier:new-leader', payload: { username: 'fixture-viewer' } }
    ]);

    const fixture = await createOverlayFixture({ locale: 'en', board: 'likes', variant: 'classic-list' });
    fixture.window.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
    fixture.fire('toptier:update', { board: 'likes', entries: [{ username: 'fixture-viewer', nickname: 'Fixture Nickname', score: 42, rank: 1 }] });
    for (const packet of sockets.publicPackets) fixture.fire(packet.eventName, packet.payload);
    expect(fixture.root.querySelector('[data-username="fixture-viewer"]').classList.contains('tt-flash-up')).toBe(true);
    expect(fixture.root.querySelector('[data-username="fixture-viewer"] .tt-rank-badge').classList.contains('tt-badge-pulse')).toBe(true);
    expect(JSON.stringify(sockets.publicPackets)).not.toMatch(/private-user-id|private-session|Fixture Nickname|"score"|"board"/);
    fixture.close();
  });

  test('keeps the decay overlay animation contract but bounds and sanitizes the producer list', async () => {
    const sockets = createSocketPair();
    const initialBoard = Array.from({ length: 12 }, (_, index) => ({
      username: `fixture-viewer-${index + 1}`, nickname: `Fixture ${index + 1}`, score: 120 - index * 5,
      rank: index + 1, last_event_at: 0
    }));
    const updatedBoard = initialBoard.slice(0, 10).map((entry, index) => ({ ...entry, score: entry.score - 5, rank: index + 1 }));
    let likesReads = 0;
    const db = {
      getBoard: jest.fn(board => {
        if (board !== 'likes') return [];
        likesReads += 1;
        return likesReads === 1 ? initialBoard : updatedBoard;
      }),
      updateScoreAfterDecay: jest.fn(),
      logDecay: jest.fn(),
      updateRanks: jest.fn()
    };
    const scheduler = new DecayScheduler({ emit: sockets.emit, log: jest.fn() }, db, {
      getCurrentSessionId: () => 'fixture-session'
    });
    scheduler._tick({ decay: { enabled: true, type: 'linear', decayAmount: 5, scoreFloor: 0 } });

    const localDecay = sockets.local.find(packet => packet.eventName === 'toptier:decay');
    const publicDecay = sockets.publicPackets.find(packet => packet.eventName === 'toptier:decay');
    expect(localDecay.payload).toEqual({ board: 'likes', affectedUsers: initialBoard.map(entry => entry.username) });
    expect(publicDecay.payload).toEqual({ affectedUsers: initialBoard.slice(0, 10).map(entry => entry.username) });
    expect(sockets.local.filter(packet => packet.eventName === 'toptier:update')).toHaveLength(1);
    expect(db.updateScoreAfterDecay).toHaveBeenCalledTimes(12);

    const fixture = await createOverlayFixture({ locale: 'en', board: 'likes', variant: 'classic-list' });
    fixture.window.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
    fixture.fire('toptier:update', { board: 'likes', entries: updatedBoard });
    fixture.fire(publicDecay.eventName, publicDecay.payload);
    expect(fixture.root.querySelector('[data-username="fixture-viewer-1"] .tt-score').classList.contains('tt-decay-pulse')).toBe(true);
    expect(fixture.root.querySelector('[data-username="fixture-viewer-5"] .tt-score').classList.contains('tt-decay-pulse')).toBe(true);
    expect(fixture.root.querySelector('[data-username="fixture-viewer-11"]')).toBeNull();
    expect(JSON.stringify(publicDecay.payload)).not.toContain('fixture-viewer-11');
    fixture.close();
  });

  test.each([
    ['toptier:rank-change', { username: 'fixture-viewer', oldRank: 2, newRank: 0, score: 1 }],
    ['toptier:new-leader', { username: '', nickname: 'Fixture', board: 'likes' }],
    ['toptier:decay', { board: 'likes', affectedUsers: ['fixture-viewer', 42] }]
  ])('fails closed on malformed %s payloads', (eventName, payload) => {
    expect(projectPublicOverlayPayload(eventName, payload)).toBeNull();
    const sockets = createSocketPair();
    sockets.emit(eventName, payload);
    expect(sockets.local).toHaveLength(1);
    expect(sockets.publicPackets).toHaveLength(0);
  });

  test('deduplicates and bounds decay names without accepting malformed entries', () => {
    expect(projectPublicOverlayPayload('toptier:decay', {
      board: 'likes', affectedUsers: ['fixture-a', 'fixture-a', ...Array.from({ length: 10 }, (_, index) => `fixture-${index + 1}`)],
      sessionId: 'private-session'
    })).toEqual({ affectedUsers: ['fixture-a', ...Array.from({ length: 9 }, (_, index) => `fixture-${index + 1}`)] });
    expect(projectPublicOverlayPayload('toptier:rank-change', {
      username: 'fixture-viewer', oldRank: 2, newRank: 1, board: 'likes', nickname: 'Fixture', score: 99, internal: true
    })).toEqual({ username: 'fixture-viewer', oldRank: 2, newRank: 1 });
    expect(projectPublicOverlayPayload('toptier:new-leader', {
      username: 'fixture-viewer', board: 'gifts', nickname: 'Fixture', score: 99, internal: true
    })).toEqual({ username: 'fixture-viewer' });
  });
});
