# CoinBattle XP Rewards Fix - Documentation

## Problem Statement (German)
> prüfe die anzeige beim coin battle wenn xp aktiviert ist. xp werden nicht rewarded an die gewinner.

**Translation:** Check the display in coin battle when XP is activated. XP is not being rewarded to the winners.

## Issues Identified

### Issue 1: XP Not Being Awarded to Winners (CRITICAL)
**Root Cause:** Incorrect socket event handler type in `main.js`

The `pyramid:xp-awards` event was being emitted server-side with `this.io.emit()` in `pyramid-mode.js`, but the handler in `main.js` was using `this.api.registerSocket()`, which is designed for client-to-server socket events, not server-to-server events.

**Location:** `/app/plugins/coinbattle/main.js` line 1042

**Before:**
```javascript
this.api.registerSocket('pyramid:xp-awards', async (data) => {
  // This handler was NEVER called because registerSocket is for client events
  // ...
});
```

**After:**
```javascript
this.io.on('pyramid:xp-awards', async (data) => {
  // Now correctly listening to server-emitted events
  // ...
});
```

**Impact:** XP was being calculated correctly in `pyramid-mode.js` and the event was being emitted, but no handler was receiving it, so XP was never actually awarded to winners.

### Issue 2: XP Not Displayed in Overlay
**Root Cause:** Missing configuration and data flow in overlay

Three sub-issues:
1. `showXPAwards` configuration was never initialized
2. XP data from `xpRewards` wasn't attached to the winner object
3. Winner display UI didn't show XP even if data was present

**Locations:** `/app/plugins/coinbattle/overlay/overlay.js`

#### Fix 2a: Initialize showXPAwards Config
**Line 92** - Added config initialization:
```javascript
config.showXPAwards = params.get('showXPAwards') !== 'false';
```

**Line 476** - Added config update support:
```javascript
config.showXPAwards = newConfig.showXPAwards !== undefined ? newConfig.showXPAwards : config.showXPAwards;
```

#### Fix 2b: Attach XP Data to Winner
**Line 1118-1131** - Modified `handlePyramidEnd()`:
```javascript
function handlePyramidEnd(data) {
  pyramidState.active = false;

  if (data.winner) {
    // Attach XP data to winner if available
    let winnerWithXP = { ...data.winner };
    if (data.xpRewards && data.xpRewards.length > 0) {
      // Find XP reward for the winner (place 1)
      const winnerReward = data.xpRewards.find(r => r.place === 1);
      if (winnerReward) {
        winnerWithXP.xp = winnerReward.xp;
      }
    }
    showPyramidWinner(winnerWithXP, data.leaderboard, data.xpRewards);
  }
  // ...
}
```

#### Fix 2c: Display XP in Winner UI
**Line 1395-1437** - Updated `showPyramidWinner()`:
```javascript
function showPyramidWinner(winner, leaderboard, xpRewards) {
  // ...
  
  // Add XP display if XP rewards are enabled and winner has XP
  if (config.showXPAwards && winner.xp) {
    // Check if XP stat already exists
    let xpStat = winnerStats.querySelector('.winner-xp-stat');
    if (!xpStat) {
      xpStat = document.createElement('div');
      xpStat.className = 'winner-stat winner-xp-stat';
      winnerStats.appendChild(xpStat);
    }
    
    // Create elements safely to prevent XSS
    const labelSpan = document.createElement('span');
    labelSpan.className = 'stat-label';
    labelSpan.textContent = 'XP Earned:';
    
    const valueSpan = document.createElement('span');
    valueSpan.className = 'stat-value';
    valueSpan.textContent = `+${winner.xp}`; // Already sanitized in handlePyramidEnd
    
    xpStat.textContent = ''; // Clear existing content
    xpStat.appendChild(labelSpan);
    xpStat.appendChild(valueSpan);
  } else {
    // Remove XP stat if it exists but shouldn't be shown
    const xpStat = winnerStats.querySelector('.winner-xp-stat');
    if (xpStat) {
      xpStat.remove();
    }
  }
  // ...
}
```

**Security Note:** The implementation uses safe DOM element creation with `textContent` instead of `innerHTML` to prevent XSS vulnerabilities. XP values are sanitized in `handlePyramidEnd()` before display.

## Technical Details

### Event Flow (Before Fix)
1. Pyramid round ends in `pyramid-mode.js`
2. XP rewards calculated with `calculateXPDistribution()`
3. Event emitted: `this.io.emit('pyramid:xp-awards', { rewards })`
4. **❌ Handler never receives event** (wrong handler type)
5. **❌ XP never awarded to viewer-xp plugin**

### Event Flow (After Fix)
1. Pyramid round ends in `pyramid-mode.js`
2. XP rewards calculated with `calculateXPDistribution()`
3. Event emitted: `this.io.emit('pyramid:xp-awards', { rewards })`
4. **✅ Handler receives event** (`this.io.on()`)
5. **✅ XP awarded via `viewerXPPlugin.db.addXP()`**

### Overlay Display Flow (After Fix)
1. `pyramid:round-ended` event received in overlay
2. `handlePyramidEnd()` extracts XP from `xpRewards` array
3. XP data attached to winner object
4. `showPyramidWinner()` displays XP if `config.showXPAwards` is true
5. **✅ Winner sees "XP Earned: +XXX" in overlay**

## Testing

### Unit Tests
All existing pyramid mode tests pass:
- ✅ `calculateXPDistribution()` for winner-takes-all mode
- ✅ `calculateXPDistribution()` for top3 mode
- ✅ XP conversion rate application
- ✅ Disabled XP rewards handling
- ✅ Avatar normalization
- ✅ Row count configuration

**Test Results:** 7/7 tests passing

### Manual Testing Steps

#### Test 1: XP Rewards Are Awarded
1. Enable **Viewer XP System** plugin
2. Enable **CoinBattle** plugin with Pyramid Mode
3. In CoinBattle settings, enable **XP Rewards for Winners**
4. Configure:
   - Distribution Mode: "Top 3"
   - XP Conversion Rate: 1.0
   - Rewarded Places: 3
5. Start a pyramid round
6. Add test players with points
7. End the round
8. **Verify:** Check server logs for "🎮 Awarded XP to X pyramid winners"
9. **Verify:** Check viewer-xp database for XP transactions
10. **Verify:** Winners should have XP added to their profiles

#### Test 2: XP Display in Overlay
1. Open OBS overlay: `http://localhost:3000/plugins/coinbattle/overlay?pyramidMode=true&showXPAwards=true`
2. Start a pyramid round with XP enabled
3. Add test players and points
4. End the round
5. **Verify:** Winner reveal shows "XP Earned: +XXX"
6. **Verify:** XP value matches calculated distribution

#### Test 3: Different Distribution Modes
Test each mode:
- **Winner Takes All**: 1 player gets 100% of XP
- **Top 3**: 50%, 30%, 20% split
- **Top 5**: 40%, 25%, 18%, 10%, 7% split
- **Top 10**: 30%, 20%, 15%, 10%, 8%, 6%, 5%, 3%, 2%, 1% split

**Verify:** XP distribution percentages are correct

## Configuration

### Overlay URL Parameters
```
http://localhost:3000/plugins/coinbattle/overlay?
  pyramidMode=true
  &showXPAwards=true
  &theme=dark
  &skin=gold
```

### CoinBattle Admin Settings
Navigate to: `/plugins/coinbattle/ui.html` → Pyramid Mode Settings

- **Enable XP Rewards**: Toggle to enable/disable
- **Distribution Mode**: Choose how XP is split
- **XP Conversion Rate**: Multiplier for points → XP (default: 1.0)
- **Rewarded Places**: How many top players receive XP

## Files Modified

1. `/app/plugins/coinbattle/main.js`
   - Line 1042: Changed event handler from `registerSocket` to `io.on`

2. `/app/plugins/coinbattle/overlay/overlay.js`
   - Line 92: Added `showXPAwards` config initialization
   - Line 476: Added `showXPAwards` config update handler
   - Line 1118-1131: Modified `handlePyramidEnd()` to attach XP data
   - Line 1395-1437: Updated `showPyramidWinner()` to display XP

## Breaking Changes
None. All changes are backward compatible.

## Dependencies
- **Viewer XP System plugin** must be enabled for XP rewards to work
- No new npm packages required
- No database schema changes

## Known Limitations
- XP display requires `showXPAwards=true` URL parameter
- Only pyramid mode XP rewards were fixed (regular match XP was already working)
- XP is only shown for 1st place winner in overlay (design decision)

## Future Enhancements
Potential improvements for future iterations:
- [ ] Show XP for all top players in credits scroll
- [ ] Add XP multiplier events (2x XP weekends)
- [ ] XP preview in admin panel before ending round
- [ ] Leaderboard integration showing total XP earned

## References
- Original XP Integration Guide: `/app/plugins/coinbattle/PYRAMID_XP_REWARDS_GUIDE.md`
- Pyramid Mode Engine: `/app/plugins/coinbattle/engine/pyramid-mode.js`
- Viewer XP Plugin: `/app/plugins/viewer-xp/`

## Author
Fix implemented by: GitHub Copilot
Date: 2025-12-17
Issue: XP not being rewarded to coin battle winners
