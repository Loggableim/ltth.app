const Database = require('better-sqlite3');
const GameEngineDatabase = require('../backend/database');

function createDatabase(sqlite = new Database(':memory:')) {
  const api = {
    getDatabase: () => ({ db: sqlite }),
    log: jest.fn()
  };
  const database = new GameEngineDatabase(api, {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  });
  database.initialize();
  return { database, sqlite };
}

function session(overrides = {}) {
  return {
    sessionId: 41,
    gameType: 'connect4',
    viewerId: 'viewer-41',
    viewerDisplayName: 'Viewer 41',
    hostDisplayName: 'Host',
    state: { board: [[0]], currentPlayer: 1 },
    sessionRevision: 1,
    displayRevision: 0,
    turnRole: 'viewer',
    viewerDeadlineMs: 123456,
    viewerTimeRemainingMs: 5000,
    hostTimeRemainingMs: null,
    timeControl: null,
    lastMoveIdentity: null,
    lastActivityAt: 1000,
    ...overrides
  };
}

describe('GameEngineDatabase interactive persistence', () => {
  let database;
  let sqlite;

  beforeEach(() => {
    ({ database, sqlite } = createDatabase());
  });

  afterEach(() => {
    sqlite.close();
  });

  test('stores per-event audio enable state with an enabled default', () => {
    database.saveGameMedia('connect4', 'piece_drop', '/tmp/piece-drop.mp3', 'audio/mpeg');

    expect(database.isGameAudioEnabled('connect4', 'default', 'piece_drop')).toBe(true);
    expect(database.setGameAudioEnabled('connect4', 'default', 'piece_drop', false)).toBe(true);
    expect(database.getGameAudioStates('connect4', 'default')).toMatchObject({ piece_drop: false });
    expect(database.isGameAudioEnabled('connect4', 'default', 'piece_drop')).toBe(false);
    expect(database.isGameAudioEnabled('wheel', '1', 'piece_drop')).toBe(true);
    expect(database.getGameMedia('connect4', 'piece_drop')).toMatchObject({
      file_path: '/tmp/piece-drop.mp3',
      enabled: 1
    });
  });

  test('stores a 24 hour game lockout and clears it after expiry', () => {
    const created = database.setGamePlayerLockout('slow-viewer', 'viewer_timeout', 24 * 60 * 60 * 1000, 1000);

    expect(created).toMatchObject({
      username: 'slow-viewer',
      reason: 'viewer_timeout',
      expiresAt: 86401000,
      remainingMs: 86400000
    });
    expect(database.getActiveGamePlayerLockout('slow-viewer', 2000)).toMatchObject({
      username: 'slow-viewer',
      reason: 'viewer_timeout',
      expiresAt: 86401000,
      remainingMs: 86399000
    });
    expect(database.getActiveGamePlayerLockout('slow-viewer', 86401001)).toBeNull();
    expect(database.getActiveGamePlayerLockout('slow-viewer', 86402000)).toBeNull();
  });

  test('creates and reads active interactive state with parsed game data', () => {
    database.createInteractiveState(session());

    expect(database.getInteractiveState(41)).toMatchObject({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      hostDisplayName: 'Host',
      state: { board: [[0]], currentPlayer: 1 },
      sessionRevision: 1,
      turnRole: 'viewer',
      viewerDeadlineMs: 123456,
      viewerTimeRemainingMs: 5000,
      status: 'active'
    });
    expect(database.getActiveInteractiveStates()).toHaveLength(1);
  });

  test('adds viewer remaining time to an existing interactive session table', () => {
    sqlite.close();
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE game_interactive_sessions (
        session_id INTEGER PRIMARY KEY,
        game_type TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        viewer_display_name TEXT NOT NULL,
        host_display_name TEXT NOT NULL,
        state_json TEXT NOT NULL,
        session_revision INTEGER NOT NULL DEFAULT 1,
        display_revision INTEGER NOT NULL DEFAULT 0,
        turn_role TEXT NOT NULL,
        viewer_deadline_ms INTEGER,
        host_time_remaining_ms INTEGER,
        time_control TEXT,
        last_move_identity TEXT,
        last_activity_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        terminal_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    ({ database } = createDatabase(sqlite));

    expect(sqlite.prepare(`PRAGMA table_info(game_interactive_sessions)`).all()
      .map(column => column.name)).toContain('viewer_time_remaining_ms');
  });

  test('does not suppress a real viewer remaining-time migration failure', () => {
    sqlite.close();
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE game_interactive_sessions (
        session_id INTEGER PRIMARY KEY,
        game_type TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        viewer_display_name TEXT NOT NULL,
        host_display_name TEXT NOT NULL,
        state_json TEXT NOT NULL,
        session_revision INTEGER NOT NULL DEFAULT 1,
        display_revision INTEGER NOT NULL DEFAULT 0,
        turn_role TEXT NOT NULL,
        viewer_deadline_ms INTEGER,
        host_time_remaining_ms INTEGER,
        time_control TEXT,
        last_move_identity TEXT,
        last_activity_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        terminal_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    const originalExec = sqlite.exec.bind(sqlite);
    const execSpy = jest.spyOn(sqlite, 'exec').mockImplementation(sql => {
      if (/ALTER TABLE game_interactive_sessions/.test(sql)) throw new Error('migration denied');
      return originalExec(sql);
    });

    try {
      expect(() => createDatabase(sqlite)).toThrow('migration denied');
    } finally {
      execSpy.mockRestore();
    }
  });

  test('persists viewer deadline and remaining time together across timer states', () => {
    database.createInteractiveState(session());

    database.updateInteractiveState(41, {
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 3210
    });

    expect(database.getInteractiveState(41)).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: 3210
    });

    database.completeInteractiveState(41, 'cancelled');
    expect(database.getInteractiveState(41)).toMatchObject({
      viewerDeadlineMs: null,
      viewerTimeRemainingMs: null
    });
  });

  test('allows only one active interactive session per viewer', () => {
    database.createInteractiveState(session());

    expect(() => database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess'
    }))).toThrow(/unique/i);

    database.completeInteractiveState(41, 'cancelled');
    expect(() => database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess'
    }))).not.toThrow();
  });

  test('persists mixed FIFO order and does not duplicate a queued session', () => {
    database.createInteractiveState(session());
    database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42'
    }));

    const first = database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 2,
      enqueuedAt: 2000
    });
    const second = database.enqueueInteractiveTurn({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42',
      sessionRevision: 3,
      enqueuedAt: 3000
    });
    const duplicate = database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 99,
      enqueuedAt: 4000
    });

    expect(first).toMatchObject({ inserted: true, sequence: 1 });
    expect(second).toMatchObject({ inserted: true, sequence: 2 });
    expect(duplicate).toMatchObject({ inserted: false, sequence: 1 });
    expect(database.getInteractiveQueue().map(row => [row.sessionId, row.gameType, row.sequence])).toEqual([
      [41, 'connect4', 1],
      [42, 'chess', 2]
    ]);
  });

  test('rotates a persisted FIFO head to the tail without mutating its session revision', () => {
    database.createInteractiveState(session({ turnRole: 'host', sessionRevision: 7 }));
    database.createInteractiveState(session({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42',
      turnRole: 'host',
      sessionRevision: 8
    }));
    database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 7
    });
    database.enqueueInteractiveTurn({
      sessionId: 42,
      gameType: 'chess',
      viewerId: 'viewer-42',
      viewerDisplayName: 'Viewer 42',
      sessionRevision: 8
    });

    expect(database.rotateInteractiveTurnToTail(41)).toMatchObject({ moved: true });
    expect(database.getInteractiveQueue().map(row => [row.sessionId, row.sessionRevision])).toEqual([
      [42, 8],
      [41, 7]
    ]);
    expect(database.getInteractiveState(41).sessionRevision).toBe(7);
  });

  test('persists viewer move identities as a session-scoped deduplication ledger', () => {
    database.createInteractiveState(session());

    expect(database.hasInteractiveMoveIdentity(41, 'chat-1')).toBe(false);
    expect(database.recordInteractiveMoveIdentity(41, 'chat-1')).toBe(true);
    expect(database.recordInteractiveMoveIdentity(41, 'chat-1')).toBe(false);
    expect(database.hasInteractiveMoveIdentity(41, 'chat-1')).toBe(true);
    expect(database.hasInteractiveMoveIdentity(41, 'chat-2')).toBe(false);
  });

  test('returns a recoverable sentinel for corrupt state JSON and can close it without parsing', () => {
    sqlite.prepare(`
      INSERT INTO game_sessions (
        id, game_type, player1_username, player1_role, status
      ) VALUES (?, 'connect4', 'viewer-41', 'viewer', 'active')
    `).run(41);
    database.createInteractiveState(session());
    sqlite.prepare(`UPDATE game_interactive_sessions SET state_json = ? WHERE session_id = ?`)
      .run('{not-json', 41);

    expect(database.getActiveInteractiveStates()).toEqual([
      expect.objectContaining({ sessionId: 41, recoveryError: expect.any(String) })
    ]);
    expect(() => database.failInteractiveRecovery(41)).not.toThrow();
    expect(sqlite.prepare(`
      SELECT status, terminal_reason FROM game_interactive_sessions WHERE session_id = ?
    `).get(41)).toEqual({ status: 'completed', terminal_reason: 'recovery_failed' });
    expect(sqlite.prepare(`
      SELECT status, win_reason, ended_at IS NOT NULL AS has_ended
      FROM game_sessions WHERE id = ?
    `).get(41)).toEqual({ status: 'completed', win_reason: 'recovery_failed', has_ended: 1 });
  });

  test('rolls state and queue changes back atomically', () => {
    database.createInteractiveState(session());

    expect(() => database.transaction(() => {
      database.updateInteractiveState(41, {
        sessionRevision: 2,
        turnRole: 'host',
        state: { board: [[1]], currentPlayer: 2 }
      });
      database.enqueueInteractiveTurn({
        sessionId: 41,
        gameType: 'connect4',
        viewerId: 'viewer-41',
        viewerDisplayName: 'Viewer 41',
        sessionRevision: 2,
        enqueuedAt: 2000
      });
      throw new Error('rollback');
    })).toThrow('rollback');

    expect(database.getInteractiveState(41)).toMatchObject({
      sessionRevision: 1,
      turnRole: 'viewer',
      state: { board: [[0]], currentPlayer: 1 }
    });
    expect(database.getInteractiveQueue()).toEqual([]);
  });

  test('stores display metadata and removes queue membership on completion', () => {
    database.createInteractiveState(session());
    database.enqueueInteractiveTurn({
      sessionId: 41,
      gameType: 'connect4',
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      sessionRevision: 2,
      enqueuedAt: 2000
    });

    database.setInteractiveMeta('displayRevision', '7');
    database.completeInteractiveState(41, 'viewer_timeout');

    expect(database.getInteractiveMeta('displayRevision')).toBe('7');
    expect(database.getInteractiveQueue()).toEqual([]);
    expect(database.getInteractiveState(41)).toMatchObject({
      status: 'completed',
      terminalReason: 'viewer_timeout'
    });
    expect(database.getActiveInteractiveStates()).toEqual([]);
  });

  test('reconciles only persisted interactive orphans and preserves generic active-game accounting', () => {
    const completed = database.createSession('connect4', 'winner', 'viewer', 'command', '/c4start');
    database.addPlayer2(completed, 'streamer', 'streamer');
    database.endSession(completed, 'winner', { board: [[1]] }, 'win');

    const cancelled = database.createSession('connect4', 'cancelled', 'viewer', 'command', '/c4start');
    database.addPlayer2(cancelled, 'streamer', 'streamer');
    database.endSession(cancelled, null, { board: [[0]] }, 'cancelled');

    const recoverable = database.createSession('connect4', 'recoverable', 'viewer', 'command', '/c4start');
    database.addPlayer2(recoverable, 'streamer', 'streamer');
    database.createInteractiveState(session({
      sessionId: recoverable,
      viewerId: 'recoverable',
      viewerDisplayName: 'Recoverable',
      turnRole: 'host'
    }));

    const orphan = database.createSession('connect4', 'orphan', 'viewer', 'command', '/c4start');
    database.addPlayer2(orphan, 'streamer', 'streamer');
    database.createInteractiveState(session({
      sessionId: orphan,
      viewerId: 'orphan',
      viewerDisplayName: 'Orphan'
    }));
    sqlite.prepare(`
      UPDATE game_interactive_sessions
      SET status = 'completed', terminal_reason = 'interrupted'
      WHERE session_id = ?
    `).run(orphan);

    const manualConnect4 = database.createSession('connect4', 'manual-viewer', 'viewer', 'command', '/c4start');
    database.addPlayer2(manualConnect4, 'streamer', 'streamer');

    const nonInteractive = database.createSession('wheel', 'wheel-viewer', 'viewer', 'command', '/wheel');
    database.addPlayer2(nonInteractive, 'streamer', 'streamer');

    expect(database.reconcileOrphanedInteractiveSessions()).toBe(1);
    expect(database.getSession(orphan)).toMatchObject({ status: 'completed', win_reason: 'recovery_failed' });
    expect(database.getGameStats('connect4')).toMatchObject({
      total_games: 5,
      completed_games: 1,
      aborted_games: 2,
      active_games: 2
    });
    expect(database.getSession(manualConnect4)).toMatchObject({ status: 'active' });
    expect(database.getGameStats('wheel')).toMatchObject({
      total_games: 1,
      active_games: 1
    });
    expect(database.getPlayerStats('cancelled')).toEqual([]);
    expect(database.getDailyLeaderboard('connect4')).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ username: 'cancelled' })
    ]));
  });

  test('presents a historical viewer display name while keeping every leaderboard keyed by stable player ID', () => {
    const playerId = '7446102145268843553';
    const completedSession = database.createSession('connect4', playerId, 'viewer', 'command', '/c4start');
    database.addPlayer2(completedSession, 'streamer', 'streamer');
    database.endSession(completedSession, playerId, { board: [[1]] }, 'win');
    database.createInteractiveState(session({
      sessionId: 42,
      viewerId: playerId,
      viewerDisplayName: 'Former Sam',
      lastActivityAt: 1000
    }));
    database.completeInteractiveState(42, 'cancelled');
    sqlite.prepare(`UPDATE game_interactive_sessions SET updated_at = ? WHERE session_id = ?`)
      .run(1000, 42);
    database.createInteractiveState(session({
      sessionId: completedSession,
      viewerId: playerId,
      viewerDisplayName: 'Sam',
      lastActivityAt: 2000
    }));
    database.updatePlayerStats(playerId, 'connect4', true, false, false, 10);
    database.updatePlayerStats(playerId, 'connect4', true, false, false, 10);
    database.updatePlayerELO(playerId, 'connect4', 240);

    const leaderboardRows = [
      database.getDailyLeaderboard('connect4', 10)[0],
      database.getSeasonLeaderboard('connect4', 10)[0],
      database.getLifetimeLeaderboard('connect4', 10)[0],
      database.getELOLeaderboard('connect4', 10)[0],
      database.getStreakLeaderboard('connect4', 10)[0]
    ];

    for (const row of leaderboardRows) {
      expect(row).toMatchObject({ playerId, username: 'Sam' });
    }
    expect(sqlite.prepare(`
      SELECT username FROM game_player_stats WHERE game_type = ?
    `).all('connect4')).toEqual([expect.objectContaining({ username: playerId })]);
    expect(database.getSession(completedSession).player1_username).toBe(playerId);
  });

  test('ignores a newer whitespace-only identity in every leaderboard presentation', () => {
    const playerId = '7446102145268843555';
    const completedSession = database.createSession('connect4', playerId, 'viewer', 'command', '/c4start');
    database.addPlayer2(completedSession, 'streamer', 'streamer');
    database.endSession(completedSession, playerId, { board: [[1]] }, 'win');

    database.createInteractiveState(session({
      sessionId: 42,
      viewerId: playerId,
      viewerDisplayName: 'Sam',
      lastActivityAt: 1000
    }));
    database.completeInteractiveState(42, 'cancelled');
    sqlite.prepare(`UPDATE game_interactive_sessions SET updated_at = ? WHERE session_id = ?`)
      .run(1000, 42);

    database.createInteractiveState(session({
      sessionId: 43,
      viewerId: playerId,
      viewerDisplayName: '\t\n\u00a0',
      lastActivityAt: 2000
    }));
    database.completeInteractiveState(43, 'cancelled');
    sqlite.prepare(`UPDATE game_interactive_sessions SET updated_at = ? WHERE session_id = ?`)
      .run(2000, 43);

    database.updatePlayerStats(playerId, 'connect4', true, false, false, 10);
    database.updatePlayerELO(playerId, 'connect4', 240);

    expect(database.resolveLeaderboardIdentity(playerId)).toEqual({ playerId, username: 'Sam' });
    const leaderboardRows = [
      database.getDailyLeaderboard('connect4', 10)[0],
      database.getSeasonLeaderboard('connect4', 10)[0],
      database.getLifetimeLeaderboard('connect4', 10)[0],
      database.getELOLeaderboard('connect4', 10)[0],
      database.getStreakLeaderboard('connect4', 10)[0]
    ];
    for (const row of leaderboardRows) {
      expect(row).toMatchObject({ playerId, username: 'Sam' });
    }
  });

  test('preserves meaningful leading and trailing whitespace in every leaderboard presentation', () => {
    const playerId = '7446102145268843556';
    const displayName = '\u00a0 Sam Streamer \u2003';
    const completedSession = database.createSession('connect4', playerId, 'viewer', 'command', '/c4start');
    database.addPlayer2(completedSession, 'streamer', 'streamer');
    database.endSession(completedSession, playerId, { board: [[1]] }, 'win');
    database.createInteractiveState(session({
      sessionId: completedSession,
      viewerId: playerId,
      viewerDisplayName: displayName,
      lastActivityAt: 2000
    }));
    database.updatePlayerStats(playerId, 'connect4', true, false, false, 10);
    database.updatePlayerELO(playerId, 'connect4', 240);

    expect(database.resolveLeaderboardIdentity(playerId)).toEqual({ playerId, username: displayName });
    const leaderboardRows = [
      database.getDailyLeaderboard('connect4', 10)[0],
      database.getSeasonLeaderboard('connect4', 10)[0],
      database.getLifetimeLeaderboard('connect4', 10)[0],
      database.getELOLeaderboard('connect4', 10)[0],
      database.getStreakLeaderboard('connect4', 10)[0]
    ];
    for (const row of leaderboardRows) {
      expect(row).toMatchObject({ playerId, username: displayName });
    }
  });

  test('keeps a nonnumeric player name as both leaderboard ID and display name', () => {
    const username = 'sam_the_viewer';
    database.updatePlayerStats(username, 'connect4', true, false, false, 10);

    expect(database.resolveLeaderboardIdentity(username)).toEqual({ playerId: username, username });
    expect(database.getLifetimeLeaderboard('connect4', 10)[0]).toMatchObject({ playerId: username, username });
  });

  test('falls back to an unresolved numeric player ID as the display name', () => {
    const playerId = '7446102145268843554';
    database.updatePlayerStats(playerId, 'connect4', true, false, false, 10);

    expect(database.resolveLeaderboardIdentity(playerId)).toEqual({ playerId, username: playerId });
    expect(database.getELOLeaderboard('connect4', 10)[0]).toMatchObject({ playerId, username: playerId });
  });

  test('persists one open Connect4 challenge and atomically records its eligible claimant', () => {
    const opened = database.createInteractiveChallenge({
      gameType: 'connect4',
      openerId: 'opener-1',
      openerDisplayName: 'Opener One',
      openerAvatarSource: '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fopener.png',
      expiresAtMs: 103000,
      createdAt: 100000
    });

    expect(opened).toMatchObject({
      gameType: 'connect4',
      openerId: 'opener-1',
      openerDisplayName: 'Opener One',
      openerAvatarSource: '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Fopener.png',
      expiresAtMs: 103000,
      status: 'open'
    });
    expect(database.getOpenInteractiveChallenge(101000)).toMatchObject({ challengeId: opened.challengeId });
    expect(() => database.createInteractiveChallenge({
      gameType: 'connect4',
      openerId: 'other',
      openerDisplayName: 'Other',
      openerAvatarSource: '',
      expiresAtMs: 104000,
      createdAt: 100001
    })).toThrow(/open/i);

    expect(database.claimInteractiveChallenge(opened.challengeId, {
      participantId: 'acceptor-2',
      participantDisplayName: 'Acceptor Two',
      participantAvatarSource: '/api/game-engine/avatar?url=https%3A%2F%2Fexample.com%2Facceptor.png'
    }, 102000)).toMatchObject({
      status: 'claimed',
      claimedById: 'acceptor-2',
      claimedByDisplayName: 'Acceptor Two'
    });
    expect(database.getOpenInteractiveChallenge(102000)).toBeNull();
  });

  test('expires an unclaimed interactive challenge without allowing recovery to revive it', () => {
    const opened = database.createInteractiveChallenge({
      gameType: 'connect4',
      openerId: 'slow-opener',
      openerDisplayName: 'Slow Opener',
      openerAvatarSource: '',
      expiresAtMs: 101000,
      createdAt: 100000
    });

    expect(database.expireInteractiveChallenge(opened.challengeId, 101000)).toMatchObject({
      challengeId: opened.challengeId,
      status: 'expired'
    });
    expect(database.getOpenInteractiveChallenge(101001)).toBeNull();
    expect(database.claimInteractiveChallenge(opened.challengeId, {
      participantId: 'late-viewer',
      participantDisplayName: 'Late Viewer'
    }, 101001)).toBeNull();
  });

  test('persists participant identities and the active turn alongside legacy viewer fields', () => {
    database.createInteractiveState(session({
      participantIds: ['viewer-41', 'viewer-42'],
      participants: [
        { id: 'viewer-41', displayName: 'Viewer 41', avatarSource: '/api/game-engine/avatar?url=one' },
        { id: 'viewer-42', displayName: 'Viewer 42', avatarSource: '' }
      ],
      turnPlayerId: 'viewer-42'
    }));

    expect(database.getInteractiveState(41)).toMatchObject({
      viewerId: 'viewer-41',
      viewerDisplayName: 'Viewer 41',
      participantIds: ['viewer-41', 'viewer-42'],
      participants: [
        expect.objectContaining({ id: 'viewer-41', displayName: 'Viewer 41' }),
        expect.objectContaining({ id: 'viewer-42', displayName: 'Viewer 42' })
      ],
      turnPlayerId: 'viewer-42'
    });
  });

  test('resolves a challenger display name from persisted interactive participants', () => {
    const challengerId = '7446102145268843555';
    const sessionId = database.createSession('connect4', 'opener-1', 'viewer', 'command', 'connect4');
    database.addPlayer2(sessionId, challengerId, 'viewer');
    database.endSession(sessionId, challengerId, { board: [[2]] }, 'win');
    database.createInteractiveState(session({
      sessionId,
      viewerId: 'opener-1',
      viewerDisplayName: 'Opener One',
      participantIds: ['opener-1', challengerId],
      participants: [
        { id: 'opener-1', displayName: 'Opener One', role: 'viewer', avatarSource: '' },
        { id: challengerId, displayName: 'Challenger Two', role: 'viewer', avatarSource: '' }
      ],
      turnPlayerId: challengerId
    }));
    database.updatePlayerStats(challengerId, 'connect4', true, false, false, 10);

    expect(database.resolveLeaderboardIdentity(challengerId)).toEqual({
      playerId: challengerId,
      username: 'Challenger Two'
    });
  });

  test('derives the streamer as active player when a host turn has no stored turn-player identity', () => {
    database.createInteractiveState(session({
      turnRole: 'host',
      participantIds: ['viewer-41', 'streamer'],
      participants: [
        { id: 'viewer-41', displayName: 'Viewer 41', role: 'viewer', avatarSource: '' },
        { id: 'streamer', displayName: 'Host', role: 'host', avatarSource: '' }
      ],
      turnPlayerId: null,
      state: {
        currentPlayer: 1,
        player1: { username: 'streamer', role: 'streamer' },
        player2: { username: 'viewer-41', role: 'viewer' }
      }
    }));

    expect(database.getInteractiveState(41)).toMatchObject({
      turnRole: 'host',
      turnPlayerId: 'streamer'
    });
  });
});
