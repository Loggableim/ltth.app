const Database = require('../modules/database');
const fs = require('fs');
const path = require('path');

describe('Stream Stats Profile Isolation', () => {
  const testDir = path.join(__dirname, '../../tmp/test-profiles');
  const profile1Path = path.join(testDir, 'streamer1.db');
  const profile2Path = path.join(testDir, 'streamer2.db');

  let db1, db2;

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Close databases
    if (db1) db1.close();
    if (db2) db2.close();
    
    // Cleanup test files
    try {
      if (fs.existsSync(profile1Path)) fs.unlinkSync(profile1Path);
      if (fs.existsSync(profile2Path)) fs.unlinkSync(profile2Path);
      if (fs.existsSync(`${profile1Path}-wal`)) fs.unlinkSync(`${profile1Path}-wal`);
      if (fs.existsSync(`${profile1Path}-shm`)) fs.unlinkSync(`${profile1Path}-shm`);
      if (fs.existsSync(`${profile2Path}-wal`)) fs.unlinkSync(`${profile2Path}-wal`);
      if (fs.existsSync(`${profile2Path}-shm`)) fs.unlinkSync(`${profile2Path}-shm`);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir, { recursive: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  test('should isolate stream stats between different profiles', () => {
    // Create two separate databases for two different profiles
    db1 = new Database(profile1Path, 'streamer1');
    db2 = new Database(profile2Path, 'streamer2');

    // Set different stats for profile 1
    db1.saveStreamStats({
      viewers: 100,
      likes: 500,
      totalCoins: 10000,
      followers: 50,
      shares: 25,
      gifts: 100
    });

    // Set different stats for profile 2
    db2.saveStreamStats({
      viewers: 200,
      likes: 1000,
      totalCoins: 25000,
      followers: 75,
      shares: 40,
      gifts: 150
    });

    // Load stats from each profile
    const stats1 = db1.loadStreamStats();
    const stats2 = db2.loadStreamStats();

    // Verify profile 1 stats
    expect(stats1).toBeDefined();
    expect(stats1.viewers).toBe(100);
    expect(stats1.likes).toBe(500);
    expect(stats1.totalCoins).toBe(10000);
    expect(stats1.followers).toBe(50);
    expect(stats1.shares).toBe(25);
    expect(stats1.gifts).toBe(100);

    // Verify profile 2 stats
    expect(stats2).toBeDefined();
    expect(stats2.viewers).toBe(200);
    expect(stats2.likes).toBe(1000);
    expect(stats2.totalCoins).toBe(25000);
    expect(stats2.followers).toBe(75);
    expect(stats2.shares).toBe(40);
    expect(stats2.gifts).toBe(150);

    // Verify stats are completely independent
    expect(stats1.viewers).not.toBe(stats2.viewers);
    expect(stats1.likes).not.toBe(stats2.likes);
    expect(stats1.totalCoins).not.toBe(stats2.totalCoins);
  });

  test('should persist stream stats across database reopens', () => {
    // Create database and save stats
    db1 = new Database(profile1Path, 'streamer1');
    db1.saveStreamStats({
      viewers: 150,
      likes: 750,
      totalCoins: 15000,
      followers: 60,
      shares: 30,
      gifts: 120
    });
    
    const stats1 = db1.loadStreamStats();
    expect(stats1.viewers).toBe(150);
    
    // Close and reopen database
    db1.close();
    db1 = new Database(profile1Path, 'streamer1');
    
    // Load stats again - should be persisted
    const stats2 = db1.loadStreamStats();
    expect(stats2).toBeDefined();
    expect(stats2.viewers).toBe(150);
    expect(stats2.likes).toBe(750);
    expect(stats2.totalCoins).toBe(15000);
    expect(stats2.followers).toBe(60);
    expect(stats2.shares).toBe(30);
    expect(stats2.gifts).toBe(120);
  });

  test('should reset stream stats correctly', () => {
    db1 = new Database(profile1Path, 'streamer1');
    
    // Set some stats
    db1.saveStreamStats({
      viewers: 300,
      likes: 1500,
      totalCoins: 30000,
      followers: 100,
      shares: 50,
      gifts: 200
    });
    
    // Verify stats are set
    let stats = db1.loadStreamStats();
    expect(stats.viewers).toBe(300);
    
    // Reset stats
    db1.resetStreamStats();
    
    // Verify all stats are zero
    stats = db1.loadStreamStats();
    expect(stats.viewers).toBe(0);
    expect(stats.likes).toBe(0);
    expect(stats.totalCoins).toBe(0);
    expect(stats.followers).toBe(0);
    expect(stats.shares).toBe(0);
    expect(stats.gifts).toBe(0);
  });

  test('should return null for new database without stats', () => {
    // Create new database file
    const newDbPath = path.join(testDir, 'new-profile.db');
    const newDb = new Database(newDbPath, 'newprofile');
    
    // Initialize the database but don't save any stats
    // The table exists but has no data
    const stats = newDb.loadStreamStats();
    
    // Should return null because no stats have been saved yet
    expect(stats).toBeNull();
    
    // Cleanup
    newDb.close();
    if (fs.existsSync(newDbPath)) fs.unlinkSync(newDbPath);
    if (fs.existsSync(`${newDbPath}-wal`)) fs.unlinkSync(`${newDbPath}-wal`);
    if (fs.existsSync(`${newDbPath}-shm`)) fs.unlinkSync(`${newDbPath}-shm`);
  });

  test('should handle partial stats updates', () => {
    db1 = new Database(profile1Path, 'streamer1');
    
    // Save initial stats
    db1.saveStreamStats({
      viewers: 50,
      likes: 100,
      totalCoins: 500,
      followers: 10,
      shares: 5,
      gifts: 20
    });
    
    // Update with new stats (simulating incremental updates)
    db1.saveStreamStats({
      viewers: 75,
      likes: 200,
      totalCoins: 1000,
      followers: 15,
      shares: 10,
      gifts: 40
    });
    
    // Verify updated stats
    const stats = db1.loadStreamStats();
    expect(stats.viewers).toBe(75);
    expect(stats.likes).toBe(200);
    expect(stats.totalCoins).toBe(1000);
    expect(stats.followers).toBe(15);
    expect(stats.shares).toBe(10);
    expect(stats.gifts).toBe(40);
  });
});
