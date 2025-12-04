# OpenShock Gift Event Debugging Guide

## Overview

This guide helps you diagnose and fix issues with TikTok gift events not triggering OpenShock actions.

## Event Pipeline Architecture

```
TikTok Live Stream
    ↓
Eulerstream WebSocket API
    ↓
TikTok Module (app/modules/tiktok.js)
    ├─ Extract gift data
    ├─ Filter: Only emit if NOT streaking OR streak ended
    ├─ Create eventData object
    └─ emit('gift', eventData)
    ↓
Plugin Loader (app/modules/plugin-loader.js)
    ├─ Forward to registered plugins
    └─ Call plugin.handleTikTokEvent('gift', data)
    ↓
OpenShock Plugin (app/plugins/openshock/main.js)
    ├─ Log gift event details
    └─ mappingEngine.evaluateEvent()
    ↓
Mapping Engine (helpers/mappingEngine.js)
    ├─ Check enabled mappings for 'gift' events
    ├─ Evaluate conditions (gift name, coin range, user filters)
    ├─ Check cooldowns
    ├─ Apply safety limits
    └─ Return matching actions
    ↓
OpenShock Plugin executeAction()
    ├─ Emergency stop check
    ├─ Queue command/pattern
    └─ Process via QueueManager
    ↓
OpenShock API
```

## Common Issues & Solutions

### Issue 1: No Events Received (Streakable Gifts)

**Symptoms:**
- Logs show "STREAK RUNNING" but no events emitted to plugins
- OpenShock doesn't trigger during gift streaks
- Only triggers when streak ends

**Root Cause:**
TikTok Module filters out streakable gift events until the streak ends. This is **intentional behavior** to prevent spam.

**Logged As:**
```
⏳ [STREAK RUNNING] Rose x5 (5 coins)
⚠️  EVENT NOT EMITTED - Waiting for streak to end (isStreakEnd: false)
ℹ️  Plugins will NOT receive this gift event until the streak ends
```

**Solution:**
This is by design. If you want immediate reactions:
1. Configure mappings for non-streakable gifts (e.g., "TikTok", "Finger Heart")
2. Accept that streakable gifts only trigger when complete
3. Consider the final coin value when setting up mappings

### Issue 2: Gift Name Doesn't Match

**Symptoms:**
- Event is emitted but no mappings match
- Logs show "No mappings matched for gift: XYZ"

**Debugging Steps:**

1. **Check the exact gift name** in logs:
```
🎁 [OpenShock Gift Event] Received from TikTok
   Gift Name: Rose
```

2. **Verify mapping configuration**:
```bash
GET /api/openshock/debug/mappings
```

Check the `giftName` condition matches exactly (case-insensitive).

3. **Common gift name variations**:
- "Rose" not "rose" (case is normalized automatically)
- "TikTok" not "Tik Tok" 
- Check for extra spaces

**Solution:**
- Update mapping to match exact gift name
- Use wildcard (`*` or empty string) to match ANY gift
- Check TikTok gift catalog: `GET /api/openshock/gift-catalog`

### Issue 3: Coin Range Filter

**Symptoms:**
- Gift is received but mapping doesn't trigger
- Logs show "Coins X below minimum Y"

**Logged As:**
```
🐛 [MappingEngine] ❌ "My Mapping": Coins 5 below minimum 100
```

**Solution:**
1. Check your mapping's `minCoins` and `maxCoins` conditions
2. Verify the gift's actual coin value in logs
3. Adjust mapping coin range or create separate mappings for different value tiers

### Issue 4: Cooldown Blocking

**Symptoms:**
- First gift triggers, subsequent gifts don't
- Logs show "Cooldown active"

**Logged As:**
```
ℹ️  [MappingEngine]    ⏳ Cooldown active for mapping "My Mapping"
```

**Solution:**
Check your mapping's cooldown settings:
- `global`: Affects all users/devices
- `perDevice`: Per OpenShock device
- `perUser`: Per TikTok user

Reduce or remove cooldowns for testing.

### Issue 5: User Filters (Whitelist/Blacklist)

**Symptoms:**
- Gifts from some users work, others don't
- No clear pattern in logs

**Debugging:**
Check mapping conditions:
```json
{
  "whitelist": ["user1", "user2"],  // Only these users
  "blacklist": ["banneduser"],      // Exclude these users
  "teamLevelMin": 5                 // Minimum subscriber level
}
```

**Solution:**
- Remove user filters for testing
- Check exact username/userId in logs
- Verify team level requirements

### Issue 6: Emergency Stop Active

**Symptoms:**
- No actions execute despite events matching
- Logs show "Emergency Stop is active"

**Logged As:**
```
Action blocked: Emergency Stop is active
```

**Solution:**
```bash
POST /api/openshock/emergency-clear
```

## Diagnostic Tools

### 1. Test Gift Event Simulator

Simulate a gift event without needing a live TikTok stream:

```bash
POST /api/openshock/test/simulate-gift
Content-Type: application/json

{
  "giftName": "Rose",
  "giftId": 5655,
  "coins": 1,
  "username": "TestUser"
}
```

### 2. Mapping Debug Endpoint

Inspect all gift mappings and their conditions:

```bash
GET /api/openshock/debug/mappings
```

Returns:
- Total mappings count
- Enabled vs disabled
- Each mapping's conditions and actions
- Cooldown settings

### 3. Gift Catalog Lookup

See all known gifts:

```bash
GET /api/openshock/gift-catalog
```

### 4. Standalone Test Script

Run the mapping engine test:

```bash
cd app/plugins/openshock
node test-gift-event-pipeline.js
```

## Log Analysis

### Key Log Patterns

**Gift Received by TikTok Module:**
```
🎁 [GIFT RECEIVED] Rose (ID: 5655)
   Diamonds: 1, Repeat: 1, Total Coins: 1
   Gift Type: NORMAL, Streak End: true
✅ [GIFT EVENT EMITTED] Total coins now: 150
```

**Gift Received by OpenShock Plugin:**
```
🎁 [OpenShock Gift Event] Received from TikTok
   Gift Name: Rose
   User: TestUser
   Coins: 1
```

**Mapping Evaluation:**
```
🔍 [MappingEngine] Evaluating gift event - 3 enabled mappings found
   Gift: Rose, Coins: 1
📋 Checking mapping "Rose Vibrate"
✅ "Rose Vibrate": Gift name matched
✅ Matched mapping "Rose Vibrate"
```

**Action Execution:**
```
[Action Execution] Executing action type: command
```

### Warning Signs

**🚨 Gift not reaching OpenShock:**
```
⏳ [STREAK RUNNING] Rose x5 (5 coins)
⚠️  EVENT NOT EMITTED - Waiting for streak to end
```

**🚨 No mappings configured:**
```
⚠️  [Gift Event] No mappings matched for gift: Rose
   Total gift mappings configured: 0
   Enabled gift mappings: 0
```

**🚨 Conditions failed:**
```
❌ "Rose Vibrate": Gift name mismatch - "TikTok" !== "Rose"
```

## Performance Considerations

### Streakable Gifts

**Problem:** User sends 100x Rose in a streak

**Current Behavior (CORRECT):**
- TikTok Module receives 100 individual events
- Filters out first 99 events
- Only emits 1 event when streak ends (with total coins = 100)
- OpenShock triggers once with full value

**Why this is good:**
- Prevents spam/overload
- Single reaction at full value is more impactful
- Respects OpenShock device limits
- Queue doesn't get flooded

**Alternative (NOT RECOMMENDED):**
Emit every gift event would cause:
- 100 separate OpenShock commands queued
- Device overload
- Safety limits triggered constantly
- Poor user experience

## Best Practices

### 1. Start Simple
```json
{
  "name": "Test - Any Gift",
  "eventType": "gift",
  "conditions": {
    "giftName": "",  // Wildcard
    "minCoins": 1
  },
  "action": {
    "type": "command",
    "commandType": "vibrate",
    "intensity": 30,
    "duration": 1000
  }
}
```

### 2. Add Specific Mappings
```json
{
  "name": "Rose - Gentle Vibrate",
  "conditions": {
    "giftName": "Rose",
    "minCoins": 0,
    "maxCoins": 10
  },
  "action": {
    "commandType": "vibrate",
    "intensity": 40
  }
}
```

### 3. Create Value Tiers
```json
[
  {
    "name": "Low Value (1-10 coins)",
    "conditions": { "minCoins": 1, "maxCoins": 10 },
    "action": { "intensity": 30, "duration": 1000 }
  },
  {
    "name": "Medium Value (11-100 coins)",
    "conditions": { "minCoins": 11, "maxCoins": 100 },
    "action": { "intensity": 50, "duration": 2000 }
  },
  {
    "name": "High Value (100+ coins)",
    "conditions": { "minCoins": 100 },
    "action": { "type": "pattern", "patternId": "epic-pattern" }
  }
]
```

### 4. Use Cooldowns Wisely
```json
{
  "cooldown": {
    "global": 3000,      // 3s between ANY gifts
    "perDevice": 1000,   // 1s per device
    "perUser": 5000      // 5s per user (prevents spam from one person)
  }
}
```

## Troubleshooting Checklist

- [ ] OpenShock plugin enabled?
- [ ] API Key configured?
- [ ] Device loaded successfully?
- [ ] TikTok connected to live stream?
- [ ] At least one gift mapping exists?
- [ ] Mapping is enabled?
- [ ] Gift name matches exactly (or using wildcard)?
- [ ] Coin value within min/max range?
- [ ] No cooldown active?
- [ ] No user filters blocking?
- [ ] Emergency stop cleared?
- [ ] Check logs for specific error messages

## Getting Help

If issue persists:

1. **Enable debug logging** (set logger level to `debug`)
2. **Collect logs** covering:
   - TikTok gift received
   - OpenShock event handler
   - Mapping evaluation
   - Action execution
3. **Export mapping configuration**: `GET /api/openshock/debug/mappings`
4. **Test with simulator**: `POST /api/openshock/test/simulate-gift`
5. **Share findings** with logs showing where the pipeline breaks

## Additional Resources

- **Mapping Engine**: `app/plugins/openshock/helpers/mappingEngine.js`
- **TikTok Module**: `app/modules/tiktok.js` (Line 634-725 for gift handling)
- **Test Script**: `app/plugins/openshock/test-gift-event-pipeline.js`
- **Plugin Main**: `app/plugins/openshock/main.js` (Line 1389+ for event handler)
