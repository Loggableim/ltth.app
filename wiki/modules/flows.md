# Automation Flows System

## Overview

The Flows system allows you to create powerful "if-then" automations without writing any code. Flows are event-driven automations that react to TikTok LIVE events and execute custom actions.

## What are Flows?

Flows consist of three components:

1. **Trigger** - The event that starts the flow (Gift, Chat, Follow, etc.)
2. **Conditions** - Optional checks that must pass (e.g., gift value > 100 coins)
3. **Actions** - What happens when triggered (TTS, Alert, OBS scene change, etc.)

## Use Cases

- Play special sound when specific gift is received
- Change OBS scene based on gift value
- Send OSC command to VRChat avatar
- Trigger custom TTS message
- Show custom alert
- Execute HTTP requests to external services
- Chain multiple actions together

## Creating a Flow

Navigate to **Dashboard** → **Flows** → **New Flow**

### Step 1: Choose a Trigger

Available triggers:
- **Gift** - When a viewer sends a gift
- **Chat** - When a message is sent
- **Follow** - When someone follows
- **Share** - When someone shares the stream
- **Subscribe** - When someone subscribes
- **Like** - When likes are received (threshold-based)

### Step 2: Set Conditions (Optional)

Add conditions to make flows more specific:

**Operators:**
- `==` - Equals
- `!=` - Not equals
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal
- `contains` - Text contains substring
- `startsWith` - Text starts with
- `endsWith` - Text ends with

**Example Conditions:**
```
giftName == "Rose"
coins >= 100
username != "SpamBot123"
message contains "hello"
```

### Step 3: Add Actions

Add one or more actions to execute:

**Available Actions:**

1. **Text-to-Speech (TTS)**
   - Say custom message with variables
   - Example: `Thanks {username} for the {giftName}!`

2. **Show Alert**
   - Display custom alert on overlay
   - Set text, sound, duration

3. **Play Sound**
   - Play sound from soundboard
   - Support for MyInstants sounds

4. **OBS Scene**
   - Switch to specific OBS scene
   - Requires OBS WebSocket connection

5. **OBS Source**
   - Show/hide OBS sources
   - Toggle source visibility

6. **VRChat OSC**
   - Send OSC commands to VRChat
   - Control avatar parameters
   - Trigger animations/gestures

7. **HTTP Request**
   - Send GET/POST to external URL
   - Integrate with third-party services

8. **Delay**
   - Wait X seconds before next action
   - Useful for action sequences

9. **Goal Increment**
   - Add to goal counter
   - Progress tracking

## Flow Examples

### Example 1: Rose Gift → TTS + Scene Change
```
Trigger: Gift
Condition: giftName == "Rose"
Actions:
  1. TTS: "Thank you {username} for the beautiful rose!"
  2. OBS Scene: Switch to "Cam2"
  3. Delay: 5 seconds
  4. OBS Scene: Switch back to "Main"
```

### Example 2: High Value Gift → Special Alert + OSC
```
Trigger: Gift
Condition: coins >= 1000
Actions:
  1. Alert: "🎉 WOW! {username} sent {giftName}!"
  2. Sound: celebration.mp3
  3. VRChat OSC: Celebrate animation
```

### Example 3: Chat Command → Action
```
Trigger: Chat
Condition: message == "!dance"
Actions:
  1. VRChat OSC: Dance animation
  2. TTS: "Let's dance!"
```

### Example 4: Follow → Welcome Message
```
Trigger: Follow
Actions:
  1. TTS: "Welcome to the community, {username}!"
  2. Alert: "New follower: {username}"
  3. Goal Increment: Followers goal +1
```

### Example 5: Like Milestone → Celebration
```
Trigger: Like
Condition: likeCount % 1000 == 0
Actions:
  1. TTS: "We reached {likeCount} likes! Thank you everyone!"
  2. Sound: applause.mp3
  3. Alert: "🎊 {likeCount} LIKES! 🎊"
```

## Advanced Features

### Variable Support

Use variables in action text:
- `{username}` - User who triggered the event
- `{giftName}` - Gift name
- `{coins}` - Coin value
- `{count}` - Gift combo count
- `{message}` - Chat message text
- `{likeCount}` - Total likes
- `{followerCount}` - Total followers

### Multi-Step Actions

Chain actions with delays:
```
Action 1: TTS "Get ready..."
Action 2: Delay 2 seconds
Action 3: TTS "Go!"
Action 4: OBS Scene → Gaming
```

### Conditional Branching

Create multiple flows with different conditions:
```
Flow 1: coins >= 1000 → Big gift celebration
Flow 2: coins >= 100 → Medium gift thanks
Flow 3: coins >= 10 → Small gift acknowledgment
```

## Flow Management

### Enable/Disable Flows

Toggle flows on/off without deleting:
- Checkbox next to each flow
- Disable during setup/testing
- Enable when ready to use

### Flow Priority

Flows execute in order:
1. Newest flows first (by default)
2. Can reorder in flow list
3. All matching flows execute

### Testing Flows

Use **Test Flow** button:
1. Click test icon next to flow
2. Simulates the trigger event
3. Actions execute immediately
4. Check logs for results

## Integration with Other Features

### OBS Integration

Flows can control OBS:
- Switch scenes
- Show/hide sources
- Enable/disable filters
- Start/stop recording

**Requirements:**
- OBS WebSocket plugin installed
- WebSocket configured in settings
- OBS running on same PC

### VRChat OSC

Flows can control VRChat avatar:
- Play animations
- Trigger gestures  
- Set avatar parameters
- Spawn particles

**Requirements:**
- VRChat running with OSC enabled
- OSC port configured (default: 9000)
- Avatar with OSC parameters

### Goals Integration

Flows can update goals:
- Increment follower goal on follow
- Add coins to coin goal
- Update subscriber count
- Custom goal tracking

## Best Practices

### Do's ✅

- Test flows before going live
- Use descriptive flow names
- Keep conditions simple
- Add delays between OBS scene changes
- Use variables for dynamic text
- Organize flows by event type

### Don'ts ❌

- Don't create too many flows (performance)
- Don't chain too many actions (> 10)
- Don't use very short delays (< 0.5s)
- Don't forget to test HTTP requests
- Don't hardcode usernames (use variables)

## Performance Considerations

- Maximum 100 active flows recommended
- Each flow adds ~1ms processing time
- Heavy actions (HTTP, OBS) may delay queue
- Disable unused flows
- Use conditions to reduce unnecessary executions

## Troubleshooting

**Flow not triggering:**
- Check if flow is enabled (checkbox)
- Verify condition syntax
- Check event logs for errors
- Test with "Test Flow" button

**Actions not executing:**
- Check action configuration
- Verify OBS/OSC connection
- Check error logs in console
- Test individual actions

**Performance issues:**
- Too many active flows
- Reduce number of flows
- Disable heavy actions temporarily
- Check system resources

## API Access

Flows can be managed via REST API:

```javascript
// Get all flows
GET /api/flows

// Create flow
POST /api/flows
{
  "name": "Rose Gift Handler",
  "trigger": "gift",
  "condition": "giftName == 'Rose'",
  "actions": [...]
}

// Update flow
PUT /api/flows/:id

// Delete flow
DELETE /api/flows/:id
```

See [[API-Reference]] for complete API documentation.

## Export/Import Flows

Backup and share flows:

1. **Export Flows**
   - Click **Export** button
   - Download JSON file
   - Share with community

2. **Import Flows**
   - Click **Import** button
   - Select JSON file
   - Flows added to list

**Flow File Format:**
```json
{
  "flows": [
    {
      "name": "Rose Alert",
      "trigger": "gift",
      "condition": "giftName == 'Rose'",
      "actions": [
        {
          "type": "tts",
          "text": "Thanks {username}!"
        }
      ]
    }
  ]
}
```

---

*For more examples and advanced usage, see the [[API-Reference]] and [[Entwickler-Leitfaden]].*
