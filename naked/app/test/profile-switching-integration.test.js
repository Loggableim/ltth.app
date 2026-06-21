/**
 * Integration test for profile switching with scoped user data
 */

const fs = require('fs');
const path = require('path');
const Database = require('../modules/database');
const Leaderboard = require('../modules/leaderboard');

const TEST_DB_DIR = '/tmp/test-profiles';
const PROFILE1_PATH = path.join(TEST_DB_DIR, 'streamer1.db');
const PROFILE2_PATH = path.join(TEST_DB_DIR, 'streamer2.db');

describe('Profile Switching Integration', () => {
  beforeAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  test('should maintain separate viewer data when switching profiles', () => {
    // Scenario: A viewer "MaxMustermann" interacts with two different streamers
    // Each streamer should see separate statistics for this viewer
    
    // ===== Profile 1: Streamer "Alice" =====
    const db1 = new Database(PROFILE1_PATH, 'alice');
    const leaderboard1 = new Leaderboard(db1, null, 'alice');
    
    // MaxMustermann sends 100 coins to Alice
    db1.updateUserStatistics('max123', 'MaxMustermann', { 
      coins: 100, 
      gifts: 1,
      comments: 5
    });
    leaderboard1.updateStats('MaxMustermann', 'gift', { coins: 100 });
    leaderboard1.updateStats('MaxMustermann', 'chat', {});
    leaderboard1.updateStats('MaxMustermann', 'chat', {});
    
    // Verify Alice's view of MaxMustermann
    const aliceViewOfMax = db1.getUserStatistics('max123', 'alice');
    expect(aliceViewOfMax.total_coins_sent).toBe(100);
    expect(aliceViewOfMax.total_gifts_sent).toBe(1);
    expect(aliceViewOfMax.total_comments).toBe(5);
    
    const aliceLeaderboard = leaderboard1.getTopGifters(10);
    expect(aliceLeaderboard.length).toBe(1);
    expect(aliceLeaderboard[0].username).toBe('MaxMustermann');
    expect(aliceLeaderboard[0].coins).toBe(100);
    
    const aliceTopChatters = leaderboard1.getTopChatters(10);
    expect(aliceTopChatters.length).toBe(1);
    expect(aliceTopChatters[0].message_count).toBe(2);
    
    db1.close();
    
    // ===== Profile 2: Streamer "Bob" =====
    const db2 = new Database(PROFILE2_PATH, 'bob');
    const leaderboard2 = new Leaderboard(db2, null, 'bob');
    
    // The SAME viewer MaxMustermann sends 500 coins to Bob
    db2.updateUserStatistics('max123', 'MaxMustermann', { 
      coins: 500, 
      gifts: 5,
      comments: 10
    });
    leaderboard2.updateStats('MaxMustermann', 'gift', { coins: 500 });
    for (let i = 0; i < 7; i++) {
      leaderboard2.updateStats('MaxMustermann', 'chat', {});
    }
    
    // Verify Bob's view of MaxMustermann (should be different from Alice's)
    const bobViewOfMax = db2.getUserStatistics('max123', 'bob');
    expect(bobViewOfMax.total_coins_sent).toBe(500);
    expect(bobViewOfMax.total_gifts_sent).toBe(5);
    expect(bobViewOfMax.total_comments).toBe(10);
    
    const bobLeaderboard = leaderboard2.getTopGifters(10);
    expect(bobLeaderboard.length).toBe(1);
    expect(bobLeaderboard[0].username).toBe('MaxMustermann');
    expect(bobLeaderboard[0].coins).toBe(500);
    
    const bobTopChatters = leaderboard2.getTopChatters(10);
    expect(bobTopChatters.length).toBe(1);
    expect(bobTopChatters[0].message_count).toBe(7);
    
    db2.close();
    
    // ===== Verify isolation by reopening Profile 1 =====
    const db1Reopen = new Database(PROFILE1_PATH, 'alice');
    
    // Alice's view should still be the same (100 coins, not 500)
    const aliceViewAgain = db1Reopen.getUserStatistics('max123', 'alice');
    expect(aliceViewAgain.total_coins_sent).toBe(100);
    expect(aliceViewAgain.total_gifts_sent).toBe(1);
    
    db1Reopen.close();
  });

  test('should handle multiple viewers across profiles correctly', () => {
    const db1 = new Database(PROFILE1_PATH, 'streamer1');
    const db2 = new Database(PROFILE2_PATH, 'streamer2');
    
    // Streamer1 gets gifts from Alice, Bob, Charlie
    db1.updateUserStatistics('alice', 'Alice', { coins: 100, gifts: 1 });
    db1.updateUserStatistics('bob', 'Bob', { coins: 200, gifts: 2 });
    db1.updateUserStatistics('charlie', 'Charlie', { coins: 50, gifts: 1 });
    
    // Streamer2 gets gifts from Alice and David (Alice is on both lists!)
    db2.updateUserStatistics('alice', 'Alice', { coins: 300, gifts: 3 });
    db2.updateUserStatistics('david', 'David', { coins: 150, gifts: 2 });
    
    // Verify streamer1 sees 3 users
    const users1 = db1.getAllUserStatistics(100, 0, 'streamer1');
    expect(users1.length).toBe(3);
    expect(users1.map(u => u.user_id).sort()).toEqual(['alice', 'bob', 'charlie']);
    
    // Alice sent 100 coins to streamer1
    const alice1 = users1.find(u => u.user_id === 'alice');
    expect(alice1.total_coins_sent).toBe(100);
    
    // Verify streamer2 sees 2 users
    const users2 = db2.getAllUserStatistics(100, 0, 'streamer2');
    expect(users2.length).toBe(2);
    expect(users2.map(u => u.user_id).sort()).toEqual(['alice', 'david']);
    
    // Alice sent 300 coins to streamer2 (different from streamer1)
    const alice2 = users2.find(u => u.user_id === 'alice');
    expect(alice2.total_coins_sent).toBe(300);
    
    db1.close();
    db2.close();
  });
});
