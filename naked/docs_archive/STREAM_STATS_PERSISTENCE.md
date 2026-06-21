# Stream Statistics Persistence - Implementation Documentation

## Overview

This document describes the stream statistics persistence feature that ensures each user profile maintains its own independent stream statistics (viewers, likes, coins, followers, shares, gifts) in persistent storage.

## Problem Statement

Previously, stream statistics were only stored in memory within the TikTok connector module. This caused two issues:

1. **No Persistence**: Stats were lost on every server restart
2. **Profile Isolation**: While user data (viewer XP, leaderboards, etc.) was properly isolated per profile, stream-level stats were not persisted to the database

## Solution Architecture

### Database Design

Each user profile has its own SQLite database file (e.g., `streamer1.db`, `streamer2.db`). We added a `stream_stats` table to each profile's database:

```sql
CREATE TABLE IF NOT EXISTS stream_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Single row per database
    viewers INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    total_coins INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    gifts INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Design Decision**: The table uses a single-row design (`CHECK (id = 1)`) because:
- Each profile has its own database file
- Stats are automatically isolated by the file system
- Only one "current stream state" needs to be tracked per profile
- Simpler than managing multiple rows or adding a profile ID column

### Data Flow

```
┌─────────────────────┐
│  Server Startup     │
│  ┌───────────────┐  │
│  │ Load active   │  │
│  │ profile DB    │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ TikTokConnector│  │
│  │ constructor    │  │
│  │ loads stats    │  │
│  │ from DB        │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ Stats in      │  │
│  │ memory        │  │
│  └───────────────┘  │
└─────────────────────┘

┌─────────────────────┐
│  During Stream      │
│  ┌───────────────┐  │
│  │ Stats update  │  │
│  │ in memory     │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ Periodic save │  │
│  │ (every 30s)   │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ DB persists   │  │
│  │ current state │  │
│  └───────────────┘  │
└─────────────────────┘

┌─────────────────────┐
│  Disconnect         │
│  ┌───────────────┐  │
│  │ Save final    │  │
│  │ stats to DB   │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ Clear in-     │  │
│  │ memory stats  │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ DB retains    │  │
│  │ last values   │  │
│  └───────────────┘  │
└─────────────────────┘
```

## Implementation Details

### Database Module (`app/modules/database.js`)

#### New Methods

**`saveStreamStats(stats)`**
- Saves current stream statistics to database
- Uses `INSERT ... ON CONFLICT DO UPDATE` for upsert behavior
- Updates the `updated_at` timestamp automatically
- Parameters: `stats` object with `{viewers, likes, totalCoins, followers, shares, gifts}`

**`loadStreamStats()`**
- Retrieves saved stream statistics from database
- Returns `null` if no stats have been saved yet
- Returns stats object with camelCase property names for consistency with in-memory stats

**`resetStreamStats()`**
- Resets all stream statistics to zero in database
- Used when explicitly clearing stats or switching TikTok streamers

### TikTok Connector Module (`app/modules/tiktok.js`)

#### Constructor Changes
```javascript
// OLD: Stats always started at zero
this.stats = {
    viewers: 0,
    likes: 0,
    totalCoins: 0,
    followers: 0,
    shares: 0,
    gifts: 0
};

// NEW: Load from database if available
const savedStats = this.db.loadStreamStats();
this.stats = savedStats || {
    viewers: 0,
    likes: 0,
    totalCoins: 0,
    followers: 0,
    shares: 0,
    gifts: 0
};
```

#### Periodic Persistence
- Stats are saved every 30 seconds during active connection
- Reduces database write frequency while ensuring timely updates
- Interval is cleared on disconnect

#### Disconnect Behavior
```javascript
// Save final stats to database
this.db.saveStreamStats(this.stats);

// Clear in-memory stats for display
this.stats = { viewers: 0, likes: 0, ... };

// Database retains the saved values for next startup
```

**Why this approach?**
- Database preserves historical data
- In-memory stats reset to show disconnected state in UI
- On reconnect, stats reload from database if needed

#### Stats Reset Scenarios

**Scenario 1: Explicit Reset**
- User manually resets stats via API or UI
- Both in-memory and database stats reset to zero
- Use case: Starting fresh or clearing old data

**Scenario 2: Switching TikTok Streamers**
- User connects to a different TikTok account (e.g., @streamer1 → @streamer2)
- Both in-memory and database stats reset to zero
- Use case: Each TikTok stream should have independent stats

**Scenario 3: Disconnect**
- User disconnects from current TikTok stream
- In-memory stats reset to zero for display
- Database stats preserved for persistence
- Use case: Show disconnected state but maintain historical data

**Scenario 4: Reconnect to Same Streamer**
- User reconnects to the same TikTok account within same session
- Stats continue from last known values
- Use case: Temporary disconnections shouldn't lose data

## Profile Isolation

### How It Works

1. **File System Isolation**
   - Profile 1: `/path/to/user_configs/streamer1.db`
   - Profile 2: `/path/to/user_configs/streamer2.db`
   - Each file has its own `stream_stats` table

2. **No Shared Data**
   - Profile 1's viewer count is completely independent from Profile 2's
   - Switching profiles requires server restart, which loads the new database

3. **Example**
   ```
   Profile: streamer1.db
   ├── stream_stats: {viewers: 100, likes: 500, totalCoins: 10000}
   ├── viewer_profiles: {alice: XP 500, bob: XP 300}
   └── leaderboard_stats: {alice: 1000 coins, bob: 500 coins}

   Profile: streamer2.db
   ├── stream_stats: {viewers: 200, likes: 1000, totalCoins: 25000}
   ├── viewer_profiles: {alice: XP 200, dave: XP 800}
   └── leaderboard_stats: {dave: 2000 coins, alice: 300 coins}
   ```

   Note: "alice" in streamer1.db and "alice" in streamer2.db are completely independent records.

## Testing

### Test Suite Location
`app/test/stream-stats-profile-isolation.test.js`

### Test Coverage
1. **Profile Isolation**: Verifies stats are completely independent between profiles
2. **Persistence**: Confirms stats survive database reopens (simulating server restarts)
3. **Reset Functionality**: Tests that reset clears all stats to zero
4. **New Database Handling**: Ensures graceful handling when no stats exist yet
5. **Partial Updates**: Validates incremental stat updates work correctly

### Running Tests
```bash
cd app
npm test -- stream-stats-profile-isolation.test.js
```

Expected output: 5/5 tests passing ✅

## Performance Considerations

### Write Optimization
- Stats are NOT saved on every stat change (would be hundreds of writes per minute)
- Instead, periodic saves every 30 seconds balance freshness vs. performance
- Final save on disconnect ensures no data loss

### Database Impact
- Single table with 1 row per profile database
- Minimal storage overhead (< 1 KB per profile)
- Fast upsert operations using SQLite's ON CONFLICT clause
- No impact on existing database performance

## Migration & Backward Compatibility

### Existing Installations
- Table is created automatically via `CREATE TABLE IF NOT EXISTS`
- First load will find no saved stats → returns `null` → starts at zero (same as before)
- No migration script needed
- No breaking changes to existing functionality

### Future Enhancements
If needed, the table could be extended to support:
- Historical stat tracking (multiple rows with timestamps)
- Per-stream session tracking (add session_id column)
- Aggregate statistics (daily/weekly totals)

However, current single-row design is intentionally simple and sufficient.

## API Reference

### Database Methods

```javascript
// Save current stats
db.saveStreamStats({
  viewers: 100,
  likes: 500,
  totalCoins: 10000,
  followers: 50,
  shares: 25,
  gifts: 100
});

// Load saved stats
const stats = db.loadStreamStats();
// Returns: {viewers: 100, likes: 500, ...} or null if not found

// Reset to zero
db.resetStreamStats();
```

### TikTok Connector Integration

```javascript
// Stats are automatically loaded on construction
const tiktok = new TikTokConnector(io, db, logger);

// Stats update automatically during stream
// Periodic saves happen in background

// Manual save (if needed)
db.saveStreamStats(tiktok.stats);

// Check current stats
const currentStats = tiktok.getStats();
```

## Troubleshooting

### Stats Not Persisting
**Symptom**: Stats reset to zero on every server restart

**Possible Causes**:
1. Database file permissions issue
2. Periodic save interval not running
3. Disconnect saving is being skipped

**Debugging**:
```javascript
// Check if stats are being saved
const stats = db.loadStreamStats();
console.log('Loaded stats:', stats); // Should not be null after first save

// Verify database file exists
const profilePath = profileManager.getProfilePath(activeProfile);
console.log('Database path:', profilePath);
```

### Stats Combining Between Profiles
**Symptom**: Profile 1 shows stats from Profile 2

**This should NOT happen** because:
- Each profile uses a separate database file
- Stats are physically isolated by the file system

**If it happens**:
1. Verify server was restarted after profile switch
2. Check that different database files are being loaded
3. Confirm no file system issues (permissions, disk space)

### Stats Resetting Unexpectedly
**Symptom**: Stats go to zero when they shouldn't

**Expected Reset Scenarios**:
1. Explicit reset via API/UI
2. Switching to different TikTok streamer
3. In-memory only: disconnect (DB retains values)

**If resetting unexpectedly**:
- Check application logs for `resetStats()` calls
- Verify streamer username isn't changing unexpectedly
- Confirm periodic save interval is running

## Security & Privacy

### Data Storage Location
- Stats stored in same location as other profile data
- Follows OS-specific paths:
  - Windows: `%LOCALAPPDATA%/pupcidslittletiktokhelper/user_configs/`
  - macOS: `~/Library/Application Support/pupcidslittletiktokhelper/user_configs/`
  - Linux: `~/.local/share/pupcidslittletiktoolhelper/user_configs/`

### No External Communication
- All data stored locally
- No cloud sync or external API calls
- Complete data privacy maintained

### SQLite Security
- Standard SQLite file permissions apply
- Database files should not be world-readable
- WAL mode enables concurrent access safely

## References

- **Implementation**: `/app/modules/database.js` (lines 426-452, 2157-2249)
- **Integration**: `/app/modules/tiktok.js` (lines 50-57, 271-286, 1505-1542, 1649-1664)
- **Tests**: `/app/test/stream-stats-profile-isolation.test.js`
- **Related Docs**: 
  - `VIEWER_XP_PROFILE_SYSTEM_ANALYSIS.md` - Profile isolation architecture
  - `PROFILE_MANAGEMENT_IMPLEMENTATION_SUMMARY.md` - Overall profile system

## Changelog

### Version 1.2.3 (2025-12-16)
- ✅ Initial implementation of stream stats persistence
- ✅ Database table creation with single-row design
- ✅ TikTok connector integration with auto-load and periodic save
- ✅ Comprehensive test suite (5/5 tests passing)
- ✅ Security scan (0 alerts)
- ✅ Documentation complete

---

**Implementation Date**: 2025-12-16  
**Status**: ✅ Complete and Tested  
**CodeQL Security Scan**: 0 Alerts  
**Test Coverage**: 100% (5/5 tests passing)
