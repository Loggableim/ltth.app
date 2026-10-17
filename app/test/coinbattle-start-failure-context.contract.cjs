'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const FriendChallengeSystem = require('../plugins/coinbattle/engine/friend-challenges');
const GlobalChatCommandEngine = require('../plugins/gcce');

function createInMemoryCoins(initialBalances) {
  const balances = new Map(Object.entries(initialBalances));
  return {
    balances,
    deductPlayerCoins(userId, amount) {
      const current = balances.get(userId) || 0;
      if (current < amount) return { success: false, error: 'Insufficient coins' };
      balances.set(userId, current - amount);
      return { success: true, remaining: current - amount };
    },
    addPlayerCoins(userId, amount) {
      balances.set(userId, (balances.get(userId) || 0) + amount);
      return true;
    },
    getPlayerCoins(userId) { return balances.get(userId) || 0; }
  };
}

test('failed match start refunds both stakes, preserves pending challenge, and retry has no net debit', async () => {
  const db = createInMemoryCoins({ challenger: 200, accepter: 200 });
  const engine = {
    currentMatch: { id: 'unrelated-active-match' },
    startMatch() { throw new Error('Match already in progress'); },
    addPlayerToMatch() { throw new Error('must not add players when start failed'); },
    endMatch() { throw new Error('must not close an unrelated existing match'); }
  };
  const challenges = new FriendChallengeSystem(db, { emit() {} }, engine, {
    info() {}, error() {}
  });
  const challenge = {
    challengeId: 'synthetic-retry-challenge',
    challengerUserId: 'challenger',
    challengerNickname: 'Synthetic Challenger',
    targetUsername: 'Synthetic Accepter',
    stake: 25,
    status: 'pending'
  };
  challenges.pendingChallenges.set(challenge.challengeId, challenge);

  try {
    const first = await challenges.acceptChallenge(challenge.challengeId, 'accepter', 'Synthetic Accepter');
    const retry = await challenges.acceptChallenge(challenge.challengeId, 'accepter', 'Synthetic Accepter');

    assert.deepEqual(first, { success: false, error: 'Failed to start match' });
    assert.deepEqual(retry, { success: false, error: 'Failed to start match' });
    assert.equal(db.balances.get('challenger'), 200);
    assert.equal(db.balances.get('accepter'), 200);
    assert.equal(challenges.pendingChallenges.get(challenge.challengeId), challenge);
    assert.equal(challenge.status, 'pending');
    assert.equal(challenges.activeChallenges.size, 0);
  } finally {
    challenges.destroy();
  }
});

test('actual GCCE top-level identity reaches the CoinBattle challenge handler', async () => {
  const receivedContexts = [];
  const gcce = Object.create(GlobalChatCommandEngine.prototype);
  gcce.pluginConfig = { enabled: true, enableOverlayMessages: false };
  gcce.permissionChecker = { getUserRole: () => 'all' };
  gcce.userDataCache = { get: () => null, set() {} };
  gcce.api = { log() {} };
  gcce.recordChatConsumption = () => {};
  gcce.parser = {
    isCommand: () => true,
    async parse(_message, context) {
      receivedContexts.push(context);
      return { isCommand: false };
    }
  };

  await gcce.handleChatMessage({
    comment: '/challenge @SyntheticTarget',
    uniqueId: 'synthetic-platform-user-id',
    nickname: 'Synthetic Challenger'
  });

  const db = createInMemoryCoins({ 'synthetic-platform-user-id': 100 });
  const challenges = new FriendChallengeSystem(db, { emit() {} }, {}, { info() {}, error() {} });
  try {
    const context = receivedContexts[0];
    assert.equal(context.userId, 'synthetic-platform-user-id');
    assert.equal(context.nickname, 'Synthetic Challenger');

    const result = await challenges.handleChallengeCommand(['@SyntheticTarget'], context);
    assert.equal(result.success, true);
    const created = [...challenges.pendingChallenges.values()][0];
    assert.equal(created.challengerUserId, 'synthetic-platform-user-id');
    assert.equal(created.challengerNickname, 'Synthetic Challenger');
  } finally {
    challenges.destroy();
  }
});
