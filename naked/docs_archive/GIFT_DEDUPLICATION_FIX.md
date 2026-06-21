# Gift Deduplication Fix - Documentation

## Problem
Some gifts (e.g., "teamherz") were being recognized and displayed twice in:
- Last Events Spotlight overlays
- ClarityHUD Full overlay

This caused confusion and made the overlays appear buggy.

## Root Cause
The TikTok event deduplication system was using a hash function that was too simple for gift events. The hash only included:
- `giftId`
- `giftName`  
- `repeatCount`

This meant that if TikTok sent the same gift event twice (or if a streakable gift emitted intermediate and final events with the same repeatCount), both events would pass through the deduplication filter.

## Solution
Enhanced the gift event hash generation in `/app/modules/tiktok.js` to include:

1. **Coins value** (`diamondCount * repeatCount`): Provides better uniqueness than just repeatCount
2. **Timestamp** (rounded to seconds): Catches near-duplicate events that arrive within the same second

### Code Changes

**File: `/app/modules/tiktok.js`**

```javascript
case 'gift':
    if (data.giftId) components.push(data.giftId.toString());
    if (data.giftName) components.push(data.giftName);
    // For gift events, use coins instead of repeatCount to better handle streak updates
    // Coins = diamondCount * repeatCount, so it's more unique
    if (data.coins) components.push(data.coins.toString());
    // Also include repeatCount as fallback if coins is not available
    else if (data.repeatCount) components.push(data.repeatCount.toString());
    // Include timestamp rounded to nearest second to catch near-duplicate events
    // but allow legitimate streak updates
    if (data.timestamp) {
        try {
            const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
            if (!isNaN(roundedTime)) {
                components.push(roundedTime.toString());
            }
        } catch (error) {
            // Ignore invalid timestamps - hash will work without timestamp component
            this.logger.debug(`[HASH] Invalid timestamp in gift event: ${data.timestamp}`);
        }
    }
    break;
```

Also added debug logging to help diagnose gift processing:

```javascript
// Determine if this gift event should be emitted
const shouldEmitGift = !isStreakable || (isStreakable && isStreakEnd);
this.logger.debug(`[GIFT FILTER] ${giftData.giftName}: streakable=${isStreakable}, streakEnd=${isStreakEnd}, willEmit=${shouldEmitGift}`);
```

## Testing
Created comprehensive test suite in `/app/test/gift-deduplication.test.js` that verifies:

✓ Different gifts generate different hashes  
✓ Identical gifts at same timestamp generate same hash (will be deduplicated)  
✓ Same gift with different coins generates different hashes  
✓ Same gift at different timestamps generates different hashes  
✓ Streakable gift streak progression generates different hashes  
✓ Near-duplicate gifts within same second generate same hash (will be deduplicated)  
✓ Same gift from different users generates different hashes  
✓ Invalid timestamps are handled gracefully

All tests pass (8/8).

## How It Works

### Normal (Non-Streakable) Gifts
1. User sends gift (e.g., "Rose")
2. TikTok sends gift event with `giftType: 0` (not streakable)
3. Event is immediately emitted to plugins
4. Hash includes: username + giftId + giftName + coins + timestamp
5. If same gift arrives again within same second with same coins, it's deduplicated

### Streakable Gifts
1. User starts sending gift streak (e.g., "Teamherz")
2. TikTok sends intermediate events with `giftType: 1, repeatEnd: false`
3. These are NOT emitted (logged as "STREAK RUNNING")
4. User finishes streak
5. TikTok sends final event with `giftType: 1, repeatEnd: true`
6. This IS emitted to plugins
7. Hash includes: username + giftId + giftName + totalCoins + timestamp
8. If duplicate final event arrives, it's deduplicated

### Near-Duplicate Detection
If the same gift from the same user with the same coin value arrives twice within the same second:
- Both generate the same hash (username + giftId + giftName + coins + roundedTimestamp)
- Second one is caught by deduplication and blocked
- Log message: "🔄 [DUPLICATE BLOCKED] gift event already processed"

## How to Verify the Fix

### Method 1: Check Server Logs
When gifts are received, you should see these log messages:

```
🎁 [GIFT] Teamherz: diamondCount=50, repeatCount=2, coins=100, giftType=1, repeatEnd=false
⏳ [STREAK RUNNING] Teamherz x2 (100 coins, not counted yet)
```

Then when streak ends:
```
🎁 [GIFT] Teamherz: diamondCount=50, repeatCount=5, coins=250, giftType=1, repeatEnd=true
[GIFT FILTER] Teamherz: streakable=true, streakEnd=true, willEmit=true
✅ [GIFT COUNTED] Total coins now: 250
```

If a duplicate is blocked, you'll see:
```
🔄 [DUPLICATE BLOCKED] gift event already processed: gift|user123|1001|Teamherz|100|1704110400
⚠️  Duplicate gift event ignored
```

### Method 2: Test with Last Events Overlay
1. Open Last Events Spotlight overlay for "gifter" type
2. Have someone send a gift (preferably "Teamherz" or another streakable gift)
3. Verify gift appears only ONCE in the overlay
4. If it appeared twice before, it should now appear only once

### Method 3: Test with ClarityHUD
1. Open ClarityHUD Full overlay
2. Have someone send a gift
3. Verify gift appears only ONCE in the activity feed
4. Check that coin count is correct and not doubled

### Method 4: Run Automated Tests
```bash
cd app
node test/gift-deduplication.test.js
node test/gift-userid-field.test.js
node test/multicam-gift-recognition.test.js
```

All tests should pass.

## Technical Details

### Hash Components
The deduplication hash for gifts now includes:

| Component | Purpose | Example Value |
|-----------|---------|---------------|
| Event Type | Distinguish gift from other events | `"gift"` |
| User ID | Distinguish different users | `"987654321"` |
| Username | Additional user identification | `"testuser123"` |
| Gift ID | Unique gift identifier | `"1001"` |
| Gift Name | Gift name for clarity | `"Teamherz"` |
| Coins | Total value (diamondCount × repeatCount) | `"100"` |
| Timestamp | Rounded to seconds | `"1704110400"` |

Example hash: `gift|testuser123|987654321|1001|Teamherz|100|1704110400`

### Deduplication Cache
- Events are stored in a Map with hash as key and timestamp as value
- Cache is automatically cleaned of entries older than 60 seconds
- Maximum cache size: 1000 events (oldest removed if exceeded)
- Cache is cleared when connecting to a new stream

## Affected Plugins

This fix benefits all plugins that listen to gift events, including:

1. **lastevent-spotlight** - Last Events overlays (gifter, topgift, giftstreak)
2. **clarityhud** - ClarityHUD Full overlay
3. **goals** - Goal tracking
4. **gift-milestone** - Gift milestone overlays
5. **openshock** - TikTok gift integration
6. **flows** - IFTTT automation rules
7. Any custom plugins that use `registerTikTokEvent('gift', ...)`

## Backward Compatibility

This change is fully backward compatible:
- Existing plugins don't need any changes
- Gift event data structure remains the same
- Only the internal deduplication logic changed
- All existing tests continue to pass

## Performance Impact

Minimal performance impact:
- Hash generation is still O(1) - just a few string concatenations
- Map lookups remain O(1)
- Memory usage unchanged (cache still limited to 1000 entries)
- Timestamp rounding uses fast `Math.floor()` operation

## Future Improvements

If issues persist, consider:
1. Adding `isStreakEnd` flag to hash for even stricter deduplication
2. Implementing separate cache for streakable vs non-streakable gifts
3. Adding user-configurable deduplication window (currently 60 seconds)
4. Creating admin UI to view and clear deduplication cache

## Troubleshooting

### Gifts still appearing twice?
1. Check server logs for `[DUPLICATE BLOCKED]` messages
2. Verify `coins` value is being calculated correctly
3. Ensure system clock is accurate (timestamp-based deduplication)
4. Try clearing deduplication cache manually (if admin UI is available)

### Legitimate streak updates being blocked?
1. Check if coin values are changing between streak updates
2. Verify timestamps are more than 1 second apart
3. Review debug logs for `[GIFT FILTER]` messages

### Need more debugging info?
Enable debug logging by setting log level to 'debug' in the logger configuration.

## Related Files
- `/app/modules/tiktok.js` - Main TikTok connector with deduplication logic
- `/app/plugins/lastevent-spotlight/main.js` - Last Events plugin
- `/app/plugins/clarityhud/backend/api.js` - ClarityHUD backend
- `/app/test/gift-deduplication.test.js` - Test suite for this fix
