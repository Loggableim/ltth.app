const Database = require('better-sqlite3');
const CoinBattleDatabase = require('../backend/database');
const CoinBattleEngine = require('../engine/game-engine');
const PyramidMode = require('../engine/pyramid-mode');
const FriendChallengeSystem = require('../engine/friend-challenges');
const CoinBattlePlugin = require('../main');

const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

const createIO = () => ({
  emit: jest.fn()
});

describe('CoinBattle database coin helpers', () => {
  let rawDb;
  let db;

  beforeEach(() => {
    rawDb = new Database(':memory:');
    db = new CoinBattleDatabase(rawDb, createLogger());
    db.initializeTables();
    db.getOrCreatePlayer({
      userId: 'user-1',
      uniqueId: 'user_one',
      nickname: 'User One',
      profilePictureUrl: null
    });
  });

  afterEach(() => {
    rawDb.close();
  });

  test('adds, reads, and deducts player coins atomically', () => {
    expect(db.getPlayerCoins('user-1')).toBe(0);

    expect(db.addPlayerCoins('user-1', 100)).toBe(true);
    expect(db.getPlayerCoins('user-1')).toBe(100);

    expect(db.deductPlayerCoins('user-1', 35)).toEqual({ success: true, remaining: 65 });
    expect(db.getPlayerCoins('user-1')).toBe(65);

    expect(db.deductPlayerCoins('user-1', 100)).toEqual({
      success: false,
      error: 'Insufficient coins',
      remaining: 65
    });
    expect(db.getPlayerCoins('user-1')).toBe(65);
  });

  test('marks participant ranks and winners when a match ends', () => {
    db.getOrCreatePlayer({
      userId: 'user-2',
      uniqueId: 'user_two',
      nickname: 'User Two',
      profilePictureUrl: null
    });

    const matchId = db.createMatch({ match_uuid: 'match-1', mode: 'solo' });
    const playerOne = rawDb.prepare('SELECT id FROM coinbattle_players WHERE user_id = ?').get('user-1');
    const playerTwo = rawDb.prepare('SELECT id FROM coinbattle_players WHERE user_id = ?').get('user-2');

    db.addMatchParticipant(matchId, playerOne.id, 'user-1');
    db.addMatchParticipant(matchId, playerTwo.id, 'user-2');

    rawDb.prepare(`
      UPDATE coinbattle_match_participants
      SET coins = ?
      WHERE match_id = ? AND user_id = ?
    `).run(50, matchId, 'user-1');
    rawDb.prepare(`
      UPDATE coinbattle_match_participants
      SET coins = ?
      WHERE match_id = ? AND user_id = ?
    `).run(75, matchId, 'user-2');

    db.endMatch(matchId, {
      winner_player_id: 'user-2',
      total_coins: 125
    });

    const participants = rawDb.prepare(`
      SELECT user_id, rank, is_winner
      FROM coinbattle_match_participants
      WHERE match_id = ?
      ORDER BY rank ASC
    `).all(matchId);

    expect(participants).toEqual([
      { user_id: 'user-2', rank: 1, is_winner: 1 },
      { user_id: 'user-1', rank: 2, is_winner: 0 }
    ]);
  });
});

describe('CoinBattle engine integration hooks', () => {
  let engine;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      createMatch: jest.fn(() => 42),
      endMatch: jest.fn(),
      updatePlayerLifetimeStats: jest.fn(),
      checkAndAwardBadges: jest.fn(() => []),
      updateMatchStats: jest.fn(),
      getOrCreatePlayer: jest.fn((user) => ({ id: `player-${user.userId}`, ...user })),
      addMatchParticipant: jest.fn(),
      getMatchLeaderboard: jest.fn(() => [
        { user_id: 'user-1', player_id: 'player-user-1', unique_id: 'u1', nickname: 'User One', coins: 20, gifts: 1 }
      ]),
      getTeamScores: jest.fn(() => ({ red: 0, blue: 0 })),
      cleanupEventCache: jest.fn()
    };

    engine = new CoinBattleEngine(mockDb, createIO(), createLogger());
  });

  afterEach(() => {
    engine.destroy();
  });

  test('can pre-register players for a 1v1 match', () => {
    engine.startMatch('1v1', 120);

    const player = engine.addPlayerToMatch('user-1', 'User One');

    expect(player.id).toBe('player-user-1');
    expect(mockDb.getOrCreatePlayer).toHaveBeenCalledWith({
      userId: 'user-1',
      uniqueId: 'User One',
      nickname: 'User One',
      profilePictureUrl: null
    });
    expect(mockDb.addMatchParticipant).toHaveBeenCalledWith(42, 'player-user-1', 'user-1', null);
  });

  test('notifies internal match-ended subscribers without relying on Socket.IO client broadcasts', () => {
    const onEnded = jest.fn();
    engine.onMatchEnded(onEnded);

    engine.startMatch('solo', 120);
    engine.endMatch();

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded.mock.calls[0][0]).toMatchObject({
      matchId: 42,
      winner: { winner_player_id: 'user-1' }
    });
  });
});

describe('Pyramid XP callbacks', () => {
  test('notifies internal XP subscribers when a round awards XP', () => {
    const io = createIO();
    const pyramid = new PyramidMode({
      prepare: () => ({
        run: jest.fn(),
        get: jest.fn(() => null),
        all: jest.fn(() => [])
      })
    }, io, createLogger());
    const onAwards = jest.fn();

    pyramid.onXPAwards(onAwards);
    pyramid.updateConfig({
      enabled: true,
      xpRewardsEnabled: true,
      xpDistributionMode: 'winner-takes-all',
      xpRewardedPlaces: 1
    });
    pyramid.startRound(7);
    pyramid.processGift({ userId: 'user-1', uniqueId: 'u1', nickname: 'User One' }, 5);
    pyramid.endRound();

    expect(onAwards).toHaveBeenCalledTimes(1);
    expect(onAwards.mock.calls[0][0].rewards[0]).toMatchObject({
      userId: 'user-1',
      username: 'u1',
      place: 1
    });
  });
});

describe('Friend challenges', () => {
  test('accepting a challenge starts a 1v1 match and locks both stakes', async () => {
    const db = {
      createMatch: jest.fn(() => 99),
      getPlayerCoins: jest.fn(() => 100),
      deductPlayerCoins: jest.fn(() => ({ success: true, remaining: 90 })),
      addPlayerCoins: jest.fn(() => true),
      getOrCreatePlayer: jest.fn((user) => ({ id: `player-${user.userId}`, ...user })),
      addMatchParticipant: jest.fn(),
      getMatchLeaderboard: jest.fn(() => []),
      getTeamScores: jest.fn(() => ({ red: 0, blue: 0 })),
      cleanupEventCache: jest.fn()
    };
    const engine = new CoinBattleEngine(db, createIO(), createLogger());
    const challenges = new FriendChallengeSystem(db, createIO(), engine, createLogger());

    const created = await challenges.createChallenge('user-1', 'User One', 'User Two', 10);
    const accepted = await challenges.acceptChallenge(created.challengeId, 'user-2', 'User Two');

    expect(accepted).toEqual({ success: true, matchId: 99 });
    expect(db.deductPlayerCoins).toHaveBeenCalledWith('user-1', 10);
    expect(db.deductPlayerCoins).toHaveBeenCalledWith('user-2', 10);
    expect(db.addMatchParticipant).toHaveBeenCalledTimes(2);

    engine.destroy();
    challenges.destroy();
  });
});

describe('CoinBattle plugin event id extraction', () => {
  test('prefers stable TikTok event identifiers before falling back to event content', () => {
    const plugin = new CoinBattlePlugin({
      getSocketIO: () => createIO(),
      log: jest.fn()
    });

    expect(plugin.extractTikTokEventId({ eventId: 'evt-1' })).toBe('evt-1');
    expect(plugin.extractTikTokEventId({ msgId: 'msg-1' })).toBe('msg-1');
    expect(plugin.extractTikTokEventId({
      userId: 'user-1',
      giftId: 5655,
      repeatCount: 2,
      timestamp: 123456
    })).toBe('gift_user-1_5655_2_123456');
  });
});
