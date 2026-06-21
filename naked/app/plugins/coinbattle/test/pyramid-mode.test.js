const PyramidMode = require('../engine/pyramid-mode');

const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

const createMockIO = () => ({
  emit: jest.fn()
});

const createMockDB = () => {
  const storage = new Map();
  return {
    prepare: (sql) => ({
      run: (...params) => {
        // Simple mock - just store in memory
        if (sql.includes('INSERT') || sql.includes('UPDATE')) {
          storage.set('pyramid_config', params);
        }
        return { changes: 1 };
      },
      get: () => {
        const params = storage.get('pyramid_config');
        if (!params) return null;
        // Return mock config
        return {
          enabled: params[0],
          auto_start: params[1],
          row_count: params[2],
          round_duration: params[3],
          extension_per_coin: params[4],
          max_extension: params[5],
          coins_per_point: params[6],
          likes_per_point: params[7],
          min_coins_to_join: params[8]
        };
      },
      all: () => []
    })
  };
};

describe('PyramidMode avatar normalization', () => {
  test('adds profile_picture_url for overlay consumers', () => {
    const io = createMockIO();
    const pyramid = new PyramidMode({}, io, createMockLogger());
    pyramid.active = true;
    pyramid.roundDuration = pyramid.config.roundDuration;
    pyramid.remainingTime = pyramid.config.roundDuration;
    pyramid.roundStartTime = Date.now();
    pyramid.config.minCoinsToJoin = 0;

    const user = {
      userId: 'user-1',
      uniqueId: 'user_one',
      nickname: 'User One',
      profilePictureUrl: 'https://cdn.example.com/avatar.png'
    };

    pyramid.addPoints(user, 100, 'gift', 100);

    const player = pyramid.players.get('user-1');
    expect(player.profilePictureUrl).toBe(user.profilePictureUrl);
    expect(player.profile_picture_url).toBe(user.profilePictureUrl);

    const leaderboardEmit = io.emit.mock.calls.find((call) => call[0] === 'pyramid:leaderboard-update');
    expect(leaderboardEmit).toBeTruthy();
    expect(leaderboardEmit[1].leaderboard[0].profile_picture_url).toBe(user.profilePictureUrl);
  });
});

describe('PyramidMode row count configuration', () => {
  test('updates row sizes when row count changes', () => {
    const db = createMockDB();
    const io = createMockIO();
    const pyramid = new PyramidMode(db, io, createMockLogger());
    pyramid.initializeTables();

    // Initial state: 4 rows
    expect(pyramid.config.rowCount).toBe(4);
    expect(pyramid.rowSizes).toEqual([1, 2, 4, 6]);

    // Update to 2 rows
    const result2 = pyramid.updateConfig({ rowCount: 2 });
    expect(result2.success).toBe(true);
    expect(pyramid.config.rowCount).toBe(2);
    expect(pyramid.rowSizes).toEqual([1, 2]);

    // Check that config-updated event was emitted
    const configEmit2 = io.emit.mock.calls.find((call) => call[0] === 'pyramid:config-updated');
    expect(configEmit2).toBeTruthy();
    expect(configEmit2[1].rowSizes).toEqual([1, 2]);

    // Clear mock
    io.emit.mockClear();

    // Update to 6 rows
    const result6 = pyramid.updateConfig({ rowCount: 6 });
    expect(result6.success).toBe(true);
    expect(pyramid.config.rowCount).toBe(6);
    expect(pyramid.rowSizes).toEqual([1, 2, 4, 6, 8, 10]);

    // Check that config-updated event was emitted again
    const configEmit6 = io.emit.mock.calls.find((call) => call[0] === 'pyramid:config-updated');
    expect(configEmit6).toBeTruthy();
    expect(configEmit6[1].rowSizes).toEqual([1, 2, 4, 6, 8, 10]);
  });

  test('calculates total slots correctly for different row counts', () => {
    const db = createMockDB();
    const io = createMockIO();
    const pyramid = new PyramidMode(db, io, createMockLogger());
    pyramid.initializeTables();

    // 2 rows: 1 + 2 = 3 slots
    pyramid.updateConfig({ rowCount: 2 });
    expect(pyramid.getTotalSlots()).toBe(3);

    // 3 rows: 1 + 2 + 4 = 7 slots
    pyramid.updateConfig({ rowCount: 3 });
    expect(pyramid.getTotalSlots()).toBe(7);

    // 4 rows: 1 + 2 + 4 + 6 = 13 slots
    pyramid.updateConfig({ rowCount: 4 });
    expect(pyramid.getTotalSlots()).toBe(13);

    // 5 rows: 1 + 2 + 4 + 6 + 8 = 21 slots
    pyramid.updateConfig({ rowCount: 5 });
    expect(pyramid.getTotalSlots()).toBe(21);

    // 6 rows: 1 + 2 + 4 + 6 + 8 + 10 = 31 slots
    pyramid.updateConfig({ rowCount: 6 });
    expect(pyramid.getTotalSlots()).toBe(31);
  });
});

describe('PyramidMode XP Rewards Integration', () => {
  test('calculates XP distribution for winner-takes-all mode', () => {
    const db = createMockDB();
    const io = createMockIO();
    const pyramid = new PyramidMode(db, io, createMockLogger());
    pyramid.initializeTables();

    // Enable XP rewards with winner-takes-all
    pyramid.updateConfig({
      xpRewardsEnabled: true,
      xpDistributionMode: 'winner-takes-all',
      xpConversionRate: 1.0,
      xpRewardedPlaces: 1
    });

    // Create mock leaderboard
    const leaderboard = [
      { userId: '1', uniqueId: 'user1', nickname: 'User 1', points: 1000 },
      { userId: '2', uniqueId: 'user2', nickname: 'User 2', points: 500 },
      { userId: '3', uniqueId: 'user3', nickname: 'User 3', points: 250 }
    ];

    const rewards = pyramid.calculateXPDistribution(leaderboard);

    expect(rewards.length).toBe(1);
    expect(rewards[0].username).toBe('user1');
    expect(rewards[0].xp).toBe(1750); // Total points from all players
    expect(rewards[0].place).toBe(1);
    expect(rewards[0].percentage).toBe(100);
  });

  test('calculates XP distribution for top3 mode', () => {
    const db = createMockDB();
    const io = createMockIO();
    const pyramid = new PyramidMode(db, io, createMockLogger());
    pyramid.initializeTables();

    // Enable XP rewards with top3 split
    pyramid.updateConfig({
      xpRewardsEnabled: true,
      xpDistributionMode: 'top3',
      xpConversionRate: 1.0,
      xpRewardedPlaces: 3
    });

    // Create mock leaderboard
    const leaderboard = [
      { userId: '1', uniqueId: 'user1', nickname: 'User 1', points: 1000 },
      { userId: '2', uniqueId: 'user2', nickname: 'User 2', points: 500 },
      { userId: '3', uniqueId: 'user3', nickname: 'User 3', points: 250 },
      { userId: '4', uniqueId: 'user4', nickname: 'User 4', points: 100 }
    ];

    const rewards = pyramid.calculateXPDistribution(leaderboard);

    expect(rewards.length).toBe(3);
    
    const totalXP = 1850; // Sum of all player points
    expect(rewards[0].username).toBe('user1');
    expect(rewards[0].xp).toBe(Math.floor(totalXP * 0.50)); // 50%
    expect(rewards[0].place).toBe(1);
    
    expect(rewards[1].username).toBe('user2');
    expect(rewards[1].xp).toBe(Math.floor(totalXP * 0.30)); // 30%
    expect(rewards[1].place).toBe(2);
    
    expect(rewards[2].username).toBe('user3');
    expect(rewards[2].xp).toBe(Math.floor(totalXP * 0.20)); // 20%
    expect(rewards[2].place).toBe(3);
  });

  test('applies XP conversion rate correctly', () => {
    const db = createMockDB();
    const io = createMockIO();
    const pyramid = new PyramidMode(db, io, createMockLogger());
    pyramid.initializeTables();

    // Enable XP rewards with 2x conversion
    pyramid.updateConfig({
      xpRewardsEnabled: true,
      xpDistributionMode: 'winner-takes-all',
      xpConversionRate: 2.0, // Double XP
      xpRewardedPlaces: 1
    });

    const leaderboard = [
      { userId: '1', uniqueId: 'user1', nickname: 'User 1', points: 1000 }
    ];

    const rewards = pyramid.calculateXPDistribution(leaderboard);

    expect(rewards[0].xp).toBe(2000); // 1000 points * 2.0 conversion rate
  });

  test('does not calculate XP when disabled', () => {
    const db = createMockDB();
    const io = createMockIO();
    const pyramid = new PyramidMode(db, io, createMockLogger());
    pyramid.initializeTables();

    // Disable XP rewards
    pyramid.updateConfig({ xpRewardsEnabled: false });

    const leaderboard = [
      { userId: '1', uniqueId: 'user1', nickname: 'User 1', points: 1000 }
    ];

    const rewards = pyramid.calculateXPDistribution(leaderboard);

    expect(rewards.length).toBe(0);
  });
});
