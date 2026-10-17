const PermissionChecker = require('../plugins/gcce/permissionChecker');
const CommandParser = require('../plugins/music-bot/lib/command-parser');
const ScoreEngine = require('../plugins/toptier/backend/score-engine');
const ViewerXP = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl');
const FriendChallenges = require('../plugins/coinbattle/engine/friend-challenges');
const GlobalChatCommandEngine = require('../plugins/gcce');

describe('role and normalized event regressions', () => {
  test('GCCE distinguishes moderators from team members and subscribers', () => {
    const checker = new PermissionChecker({ warn: jest.fn() });
    expect(checker.getUserRole({ teamMemberLevel: 1, isSubscriber: false })).toBe('all');
    expect(checker.getUserRole({ teamMemberLevel: 1, isSubscriber: true })).toBe('subscriber');
    expect(checker.getUserRole({ teamMemberLevel: 1, isModerator: true })).toBe('moderator');
  });

  test('GCCE chat dispatch enriches roles from normalized event fields', async () => {
    const checker = new PermissionChecker({ warn: jest.fn() });
    const received = [];
    const engine = Object.create(GlobalChatCommandEngine.prototype);
    engine.pluginConfig = { enabled: true, enableOverlayMessages: false };
    engine.permissionChecker = checker;
    engine.userDataCache = { get: () => null, set: jest.fn() };
    engine.api = { log: jest.fn() };
    engine.recordChatConsumption = jest.fn();
    engine.parser = {
      isCommand: () => true,
      parse: async (_message, context) => {
        received.push({
          role: context.userRole,
          subscriber: context.userData.isSubscriber,
          moderator: context.userData.isModerator,
          admitted: checker.checkPermission(context.userRole, 'moderator', context.userId)
        });
        return { isCommand: false };
      }
    };

    await engine.handleChatMessage({ comment: '/audit', uniqueId: 'viewer', nickname: 'Viewer', teamMemberLevel: 1 });
    await engine.handleChatMessage({ comment: '/audit', uniqueId: 'subscriber', nickname: 'Subscriber', isSubscriber: true, teamMemberLevel: 1 });
    await engine.handleChatMessage({ comment: '/audit', uniqueId: 'moderator', nickname: 'Moderator', isModerator: true });

    expect(received).toEqual([
      { role: 'all', subscriber: false, moderator: false, admitted: false },
      { role: 'subscriber', subscriber: true, moderator: false, admitted: false },
      { role: 'moderator', subscriber: false, moderator: true, admitted: true }
    ]);
  });

  test('GCCE permission memoization keys include current role', () => {
    const checker = new PermissionChecker({ warn: jest.fn() });
    expect(checker.checkPermission('moderator', 'moderator', 'audit-user')).toBe(true);
    expect(checker.checkPermission('all', 'moderator', 'audit-user')).toBe(false);
  });

  test('Music Bot permissions require explicit role flags and deny unknown levels', async () => {
    const parser = new CommandParser({ permissions: { pause: 'mod' } }, null, null, null, {
      getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
      log: jest.fn()
    }, null, null, null);
    const admitted = await parser._hasPermission('viewer', 'mod', { isModerator: false, teamMemberLevel: 1 });
    expect(admitted).toBe(false);
    const subscriber = await parser._hasPermission('viewer', 'subscriber', { isSubscriber: false, teamMemberLevel: 1 });
    expect(subscriber).toBe(false);
    const unknownLevel = await parser._hasPermission('viewer', 'owner', {
      isModerator: true,
      isSubscriber: true,
      isFollower: true,
      teamMemberLevel: 100
    });
    expect(unknownLevel).toBe(false);
  });

  test('Music Bot admits an actual moderator force-skip and rejects team member skip', async () => {
    const parser = new CommandParser({
      commandPrefix: '!',
      commands: { skip: 'skip' },
      commandAliases: { skip: [] },
      permissions: { skip: 'mod' }
    }, null, null, null, {
      getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
      log: jest.fn()
    }, null, null);
    const teamCommands = [];
    const moderatorCommands = [];

    await parser.parse({ message: '!skip', username: 'team', isModerator: false, teamMemberLevel: 1 }, command => teamCommands.push(command));
    await parser.parse({ message: '!skip', username: 'moderator', isModerator: true, teamMemberLevel: 0 }, command => moderatorCommands.push(command));

    expect(teamCommands).toEqual([]);
    expect(moderatorCommands).toEqual([{ type: 'skip', force: true }]);
  });

  test('Top Tier treats normalized coins as the series total and supports raw fallback', () => {
    const deltas = [];
    const db = {
      upsertScore: jest.fn((board, session, user, nickname, avatar, delta) => deltas.push(delta)),
      updateRanks: jest.fn(),
      getBoard: jest.fn(() => []),
      getRankChanges: jest.fn(() => ({ changes: [], newLeader: null }))
    };
    const api = { getConfig: () => ({ giftsBoard: { enabled: true, displayCount: 5 } }), emit: jest.fn(), log: jest.fn() };
    const engine = new ScoreEngine(api, db, { getCurrentSessionId: () => 'audit' });
    engine.handleGiftEvent({ uniqueId: 'audit', coins: 15, diamondCount: 5, repeatCount: 3 });
    engine.handleGiftEvent({ uniqueId: 'audit', diamondCount: 5, repeatCount: 3 });
    expect(deltas).toEqual([15, 15]);
  });

  test('Viewer XP counts bundled likes and series coins once in shared stats and gifter boards', () => {
    const calls = [];
    const stats = {
      updateUserStatistics: jest.fn((id, name, delta) => calls.push(['likes', delta.likes])),
      getUserStatistics: jest.fn(() => null),
      getAllUserStatistics: jest.fn(() => []),
      addCoinsToUserStats: jest.fn((id, name, unique, avatar, coins) => calls.push(['coins', coins]))
    };
    const plugin = Object.create(ViewerXP.prototype);
    plugin.db = {
      updateLastSeen: jest.fn(),
      addGifterCoins: jest.fn((id, name, unique, avatar, coins) => calls.push(['allTimeGifter', coins]))
    };
    plugin.api = { getDatabase: () => stats, log: jest.fn() };
    plugin.awardXP = jest.fn();
    plugin.emitIFTTTEvent = jest.fn();
    plugin.updateGifterSessionData = jest.fn((id, name, unique, avatar, coins) => calls.push(['sessionGifter', coins]));
    plugin.emitGifterLeaderboardUpdate = jest.fn();
    plugin.handleLike({ uniqueId: 'audit', likeCount: 23 });
    plugin.handleGift({ uniqueId: 'audit', userId: 'audit-id', coins: 15, diamondCount: 5, repeatCount: 3 });
    expect(calls).toEqual([
      ['likes', 23], ['coins', 15], ['sessionGifter', 15], ['allTimeGifter', 15]
    ]);
  });

  test('CoinBattle failed match start refunds both stakes and accepts GCCE top-level identity', async () => {
    const balances = new Map([['challenger', 200], ['accepter', 200]]);
    const db = {
      getPlayerCoins: (id) => balances.get(id),
      deductPlayerCoins: jest.fn((id, amount) => {
        balances.set(id, balances.get(id) - amount);
        return { success: true };
      }),
      addPlayerCoins: (id, amount) => balances.set(id, balances.get(id) + amount)
    };
    const engine = { currentMatch: { id: 'existing' }, startMatch: jest.fn(() => { throw new Error('match already active'); }) };
    const challenges = new FriendChallenges(db, { emit: jest.fn() }, engine, { info: jest.fn(), error: jest.fn() });
    challenges.pendingChallenges.set('audit-challenge', {
      challengerUserId: 'challenger', challengerNickname: 'Challenger', targetUsername: 'Accepter', stake: 10
    });

    const firstAttempt = await challenges.acceptChallenge('audit-challenge', 'accepter', 'Accepter');
    const retry = await challenges.acceptChallenge('audit-challenge', 'accepter', 'Accepter');
    const commandUser = challenges._getCommandUser({ userId: 'accepter-id', nickname: 'Accepter' });
    challenges.createChallenge = jest.fn(async (...args) => ({ success: true, args }));
    const commandResult = await challenges.handleChallengeCommand(['@Target'], {
      userId: 'challenger-id', nickname: 'Challenger'
    });

    expect(firstAttempt.success).toBe(false);
    expect(retry.success).toBe(false);
    expect(balances.get('challenger')).toBe(200);
    expect(balances.get('accepter')).toBe(200);
    expect(db.deductPlayerCoins).toHaveBeenCalledTimes(4);
    expect(commandUser).toEqual({ userId: 'accepter-id', nickname: 'Accepter' });
    expect(commandResult.success).toBe(true);
    expect(challenges.createChallenge).toHaveBeenCalledWith('challenger-id', 'Challenger', 'Target', 10);
    challenges.destroy();
  });
});
