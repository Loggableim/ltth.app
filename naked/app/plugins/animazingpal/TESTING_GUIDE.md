# AnimazingPal Enhanced Features - Manual Testing Guide

This document provides a comprehensive manual test plan for the new AnimazingPal standalone host capabilities.

## Prerequisites

- PupCid's Little TikTool Helper running
- Animaze Desktop installed and running (listening on ws://localhost:9000)
- AnimazingPal plugin enabled
- Access to TikTok LIVE events (or ability to simulate them)

## Test Plan

### 1. Standalone Mode Testing

#### 1.1 Enable Standalone Mode
**Steps:**
1. Open AnimazingPal UI (`/animazingpal/ui`)
2. Navigate to "Einstellungen" tab
3. Find "Brain Einstellungen" section
4. Check "Standalone Mode" checkbox
5. Click "Einstellungen speichern"

**Expected Result:**
- Configuration saves successfully
- No GPT calls are made for subsequent events
- TTS messages use -echo prefix

#### 1.2 Test Standalone Gift Response
**Steps:**
1. Ensure standalone mode is enabled
2. Trigger a gift event (or simulate via API)
3. Observe chat message sent to ChatPal

**Expected Result:**
- Template-based message generated (e.g., "Thank you {username} for the {giftName}!")
- Message sent with -echo prefix
- No GPT API calls logged
- Memory still logged in database for future use

#### 1.3 Test Standalone Follow Response
**Steps:**
1. Trigger a follow event
2. Check AnimazingPal logs

**Expected Result:**
- Template response sent (e.g., "Welcome {username}!")
- Uses -echo for TTS-only
- No GPT errors

### 2. Force TTS-Only on Actions

#### 2.1 Enable Force TTS
**Steps:**
1. In "Einstellungen" tab → "Brain Einstellungen"
2. Check "Force TTS-Only on Actions"
3. Save settings
4. Configure an event action with a chatMessage
5. Trigger that event

**Expected Result:**
- All event-driven messages use -echo prefix
- Applies to all events globally

### 3. Per-Event Echo Override Testing

#### 3.1 Configure Echo Override
**Steps:**
1. Navigate to "Event Aktionen" tab
2. Find "Follow Event" section
3. Set "Echo Override" dropdown to "Echo erzwingen"
4. Save configuration
5. Trigger a follow event

**Expected Result:**
- Follow event uses echo regardless of global settings
- Other events follow global settings

#### 3.2 Test Override Priority
**Test Matrix:**

| Global Setting | forceTtsOnly | Event Override | Expected Result |
|----------------|--------------|----------------|-----------------|
| false | false | null | No echo |
| true | false | null | Echo |
| false | true | null | Echo |
| false | false | true | Echo |
| true | true | false | No echo |

**Steps:**
1. Configure each combination
2. Trigger test event
3. Verify echo behavior

### 4. Logic Matrix Testing

#### 4.1 Create High-Value Gift Rule
**Steps:**
1. Navigate to "Logic Matrix" tab
2. Create a rule via API or config:
```json
{
  "id": "test-high-gift",
  "name": "High Value Gift",
  "priority": 10,
  "stopOnMatch": true,
  "conditions": {
    "eventType": "gift",
    "giftValueTier": "high"
  },
  "actions": {
    "emote": "Excited",
    "chatMessage": "WOW! Thanks {username}!"
  }
}
```
3. Save logic matrix configuration

**Expected Result:**
- Rule saved successfully
- Shows in logic matrix list

#### 4.2 Test Logic Matrix with High-Value Gift
**Steps:**
1. Simulate or trigger a gift with value >= 100 diamonds
2. Observe emote and chat response

**Expected Result:**
- "Excited" emote triggered
- "WOW! Thanks {username}!" message sent
- stopOnMatch prevents further rule processing

#### 4.3 Test Logic Matrix Priority
**Steps:**
1. Create two rules for same event type with different priorities
2. Ensure conditions overlap
3. Trigger matching event

**Expected Result:**
- Higher priority rule (higher number) executes first
- If stopOnMatch=true, second rule doesn't execute

#### 4.4 Test Logic Matrix API Endpoint
**Steps:**
1. Open Logic Matrix tab
2. Select event type: "gift"
3. Enter test data:
```json
{
  "giftValue": 150,
  "username": "testuser"
}
```
4. Click "Testen"

**Expected Result:**
- Shows matched rule
- Displays actions that would be executed
- No actual execution (test mode only)

### 5. Memory System Testing

#### 5.1 Memory Decay Verification
**Steps:**
1. View existing memories (via API or Memories tab)
2. Note creation dates and importance scores
3. Configure `memoryDecayHalfLife: 7` days
4. Query memories and check scoring

**Expected Result:**
- Older memories have lower decay scores
- Recent memories rank higher in combined score

#### 5.2 Combined Scoring Test
**Steps:**
1. Create test memories with varying:
   - Importance (0.3, 0.5, 0.8)
   - Ages (fresh, 3 days old, 10 days old)
   - Access counts (0, 5, 20)
2. Search for a query
3. Observe retrieved memories

**Expected Result:**
- Memories ranked by combined score
- High importance + recent + frequently accessed = top results
- Old low-importance rarely accessed = bottom results

#### 5.3 Access Count Tracking
**Steps:**
1. Select a specific memory
2. Note its access_count
3. Trigger events that would retrieve this memory
4. Check access_count again

**Expected Result:**
- access_count increments on each retrieval
- last_accessed timestamp updated

### 6. Persona Management Testing

#### 6.1 List Personas
**Steps:**
1. Navigate to "Persönlichkeiten" tab
2. View "Persona Verwaltung" section
3. Check dropdown

**Expected Result:**
- All available personas listed
- Current active persona selected

#### 6.2 Create Persona (API Test)
**Steps:**
1. POST to `/api/animazingpal/brain/personality/create`:
```json
{
  "name": "test_persona",
  "display_name": "Test Persona",
  "system_prompt": "You are a friendly test bot",
  "catchphrases": [
    "Hello there!",
    "Thanks {username}!",
    "Welcome to the stream!"
  ]
}
```

**Expected Result:**
- Persona created successfully
- Shows in persona list
- Can be selected as active

#### 6.3 Update Persona
**Steps:**
1. PUT to `/api/animazingpal/persona/test_persona`:
```json
{
  "display_name": "Updated Test",
  "system_prompt": "Updated prompt"
}
```

**Expected Result:**
- Persona updated
- If active, hot-reloads immediately

#### 6.4 Delete Persona
**Steps:**
1. Ensure persona is NOT active
2. Click delete button or DELETE `/api/animazingpal/persona/test_persona`

**Expected Result:**
- Persona deleted
- Removed from list
- Cannot delete active persona (error)

### 7. Event Handler Integration

#### 7.1 Test All Event Types in Standalone Mode
**Event Types to Test:**
- Gift
- Follow
- Share
- Subscribe
- Like
- Chat

**For Each Event:**
1. Enable standalone mode
2. Configure event action with chatMessage
3. Trigger event
4. Verify:
   - Template response generated
   - Echo prefix applied
   - Memory logged
   - No GPT calls

#### 7.2 Test All Event Types in GPT Mode
**Steps:**
1. Disable standalone mode
2. Configure OpenAI API key
3. Select a persona
4. Trigger same events

**Expected Result:**
- GPT generates intelligent responses
- Logic matrix still applies for emote selection
- Memory system active

### 8. Switch Between Modes

#### 8.1 Standalone → GPT Mode
**Steps:**
1. Start with standalone mode enabled
2. Trigger test events
3. Disable standalone mode
4. Configure GPT settings
5. Trigger same events

**Expected Result:**
- Seamless transition
- Previous memories available for GPT context
- No data loss

#### 8.2 GPT → Standalone Mode
**Steps:**
1. Start with GPT mode
2. Generate some interactions
3. Enable standalone mode
4. Trigger events

**Expected Result:**
- GPT calls stop
- Template responses used
- Memories continue logging

### 9. UI Functionality

#### 9.1 Settings Persistence
**Steps:**
1. Configure all new settings (standalone, forceTtsOnly, echo overrides)
2. Save
3. Refresh page
4. Check settings

**Expected Result:**
- All settings persist across page reload
- Config stored in database

#### 9.2 Logic Matrix Tab
**Steps:**
1. Navigate to Logic Matrix tab
2. View rules list
3. Test interface

**Expected Result:**
- Tab loads without errors
- Rules display properly
- Test interface functional

### 10. Error Handling

#### 10.1 Missing Persona in Standalone Mode
**Steps:**
1. Enable standalone mode
2. Ensure no persona selected
3. Trigger events

**Expected Result:**
- Falls back to default templates
- No errors thrown
- Graceful degradation

#### 10.2 Invalid Logic Matrix Rule
**Steps:**
1. POST invalid rule (missing required fields)
2. Check response

**Expected Result:**
- Validation error returned
- Helpful error message
- No server crash

#### 10.3 Persona Update While Active
**Steps:**
1. Select a persona as active
2. Update that persona
3. Verify hot-reload

**Expected Result:**
- Changes apply immediately
- No need to restart
- Log message confirms hot-reload

## Test Results Template

```markdown
## Test Session: [Date]
**Tester:** [Name]
**Version:** 1.2.0
**Environment:** [Development/Production]

### Test Results

| Test ID | Test Name | Status | Notes |
|---------|-----------|--------|-------|
| 1.1 | Enable Standalone Mode | ✅/❌ | |
| 1.2 | Standalone Gift Response | ✅/❌ | |
| 1.3 | Standalone Follow Response | ✅/❌ | |
| 2.1 | Force TTS | ✅/❌ | |
| 3.1 | Echo Override | ✅/❌ | |
| 3.2 | Override Priority | ✅/❌ | |
| 4.1 | Create Logic Rule | ✅/❌ | |
| 4.2 | Test High Value Gift | ✅/❌ | |
| 4.3 | Logic Priority | ✅/❌ | |
| 4.4 | Logic Test Endpoint | ✅/❌ | |
| 5.1 | Memory Decay | ✅/❌ | |
| 5.2 | Combined Scoring | ✅/❌ | |
| 5.3 | Access Tracking | ✅/❌ | |
| 6.1 | List Personas | ✅/❌ | |
| 6.2 | Create Persona | ✅/❌ | |
| 6.3 | Update Persona | ✅/❌ | |
| 6.4 | Delete Persona | ✅/❌ | |
| 7.1 | All Events Standalone | ✅/❌ | |
| 7.2 | All Events GPT | ✅/❌ | |
| 8.1 | Standalone → GPT | ✅/❌ | |
| 8.2 | GPT → Standalone | ✅/❌ | |
| 9.1 | Settings Persistence | ✅/❌ | |
| 9.2 | Logic Matrix Tab | ✅/❌ | |
| 10.1 | Missing Persona | ✅/❌ | |
| 10.2 | Invalid Rule | ✅/❌ | |
| 10.3 | Hot Reload | ✅/❌ | |

### Issues Found
- [Issue #1] Description
- [Issue #2] Description

### Notes
- Additional observations
- Performance notes
- Recommendations
```

## Automated Testing Considerations

For future automated testing, consider:
- Mock TikTok events
- Mock Animaze WebSocket responses
- Test memory database queries
- Test logic matrix evaluation in isolation
- Mock OpenAI API responses

## Performance Testing

Monitor:
- Memory usage with large memory databases
- Logic matrix evaluation speed with many rules
- Response time in standalone vs GPT mode
- WebSocket message throughput
