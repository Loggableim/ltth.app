# OpenShock Plugin - New Features Documentation

## Feature 1: OpenShock Gift Overlay - Rotating Gift Menu

### Overview
A read-only OBS overlay that displays all active OpenShock gift mappings in a rotating carousel format. Perfect for showcasing to viewers which gifts trigger which OpenShock patterns during a stream.

### Features
- **Automatic Rotation**: Cycles through all active gift mappings every 7 seconds
- **Gift Information Display**: 
  - Gift name and icon (from TikTok gift catalog)
  - Associated OpenShock pattern name
  - Pattern duration in seconds
  - Intensity percentage with visual indicator
- **Real-time Updates**: Automatically refreshes when gift mappings are added, removed, or modified
- **Beautiful UI**: Gradient background with smooth animations and modern design

### Setup Instructions

1. **Configure Gift Mappings**:
   - Open the OpenShock plugin UI
   - Go to the "Event Mapper" tab
   - Create mappings for TikTok gifts to OpenShock patterns
   - Enable the mappings you want to display

2. **Add to OBS**:
   - Add a Browser Source in OBS
   - Set the URL to: `http://localhost:3000/openshock/overlay/openshock-rotating-gifts.html`
   - Recommended dimensions: 500x400 or adjust to your preference
   - Check "Refresh browser when scene becomes active" for best results

3. **Customization**:
   - Modify rotation interval by editing `ROTATION_INTERVAL` in the overlay HTML (default: 7000ms)
   - Adjust transition duration with `TRANSITION_DURATION` (default: 500ms)

### Technical Details

**API Endpoint**: `GET /api/openshock/gifts/active`
- Returns array of active gift mappings with gift info and pattern details

**Socket.io Events**:
- `openshock:request:gifts` - Client requests initial gift data
- `openshock:gifts:active_list` - Server sends gift list
- `openshock:gifts:updated` - Server notifies of gift mapping changes

---

## Feature 2: ZappieHell - Goal-based Event Chain System

### Overview
ZappieHell is a powerful goal-based system that tracks TikTok gift coins and triggers programmable event chains when coin targets are reached. Event chains can execute complex sequences including OpenShock actions, delays, TTS, webhooks, and overlay effects - with support for durations exceeding 30 seconds.

### Key Concepts

**Goals**:
- Track accumulated coins from TikTok gifts
- Can be stream-specific (reset after each stream) or global (persistent)
- Each goal has a target coin amount and optional linked event chain
- Progress is displayed in real-time on overlay

**Event Chains**:
- Sequences of actions executed when a goal is completed
- Support multiple step types with precise timing control
- Can run for extended periods (>30 seconds)
- Fully configurable through admin UI

### Supported Event Chain Steps

1. **OpenShock Actions**
   - Execute existing patterns or direct commands
   - Configurable intensity and duration
   - Device selection (specific device or first available)

2. **Delays**
   - Pause execution between steps
   - Range: 100ms to 60 seconds
   - Perfect for creating timed sequences

3. **Audio/TTS**
   - Play audio files or text-to-speech
   - Integrates with LTTH's TTS system
   - Configurable voice and text

4. **Webhooks**
   - Send HTTP requests to external services
   - Support for GET and POST methods
   - Custom JSON body with goal context
   - Useful for third-party integrations

5. **Overlay Animations**
   - Trigger custom overlay effects
   - Configurable animation type and duration
   - Emits Socket.io events for overlay listening

### Setup Instructions

#### 1. Creating Goals

1. Open OpenShock plugin UI
2. Navigate to the "⚡ ZappieHell" tab
3. Click "➕ Add Goal"
4. Configure:
   - **Name**: Descriptive name (e.g., "ZappieHell Level 1")
   - **Target Coins**: Number of coins needed to complete
   - **Type**: 
     - Stream: Resets when stream ends
     - Global: Persists across streams
   - **Event Chain**: Select a chain to execute (optional)
   - **Active**: Enable/disable the goal

#### 2. Creating Event Chains

1. In ZappieHell tab, click "➕ Add Event Chain"
2. Enter chain name and description
3. Click "➕ Add Step" to build your sequence
4. For each step:
   - Select step type
   - Configure type-specific options
   - Save step
5. Reorder steps if needed (displayed in execution order)
6. Save event chain

#### 3. Example Event Chain

**"ZappieHell Level 1" Chain**:
```
Step 1: OpenShock - Pattern "Pulse Wave" - 80% intensity - 3s
Step 2: Delay - 2 seconds
Step 3: Audio - TTS "Level one completed!"
Step 4: Delay - 1 second
Step 5: Webhook - POST to Discord webhook with completion notification
Step 6: Overlay - Flash animation for 2 seconds
```

Total duration: ~8 seconds

#### 4. Adding Overlay to OBS

1. Add Browser Source in OBS
2. URL: `http://localhost:3000/openshock/overlay/zappiehell-overlay.html`
3. Recommended dimensions: 600x300 (or adjust to preference)
4. The overlay shows:
   - All active goals
   - Progress bars with percentages
   - Remaining coins needed
   - Celebration effects when goals complete

### Technical Details

#### Database Schema

**zappiehell_goals**:
- `id`: Unique goal identifier
- `name`: Goal display name
- `target_coins`: Coin amount needed
- `current_coins`: Accumulated coins
- `type`: 'stream' or 'global'
- `active`: Boolean status
- `chain_id`: Linked event chain (nullable)

**zappiehell_chains**:
- `id`: Unique chain identifier
- `name`: Chain display name
- `description`: Optional description
- `steps`: JSON array of step objects

**zappiehell_executions**:
- Tracks chain execution history
- `status`: 'running', 'completed', or 'failed'
- Records start/completion times and errors

#### API Endpoints

**Goals**:
- `GET /api/openshock/zappiehell/goals` - List all goals
- `GET /api/openshock/zappiehell/goals/active` - List active goals
- `POST /api/openshock/zappiehell/goals` - Create goal
- `PUT /api/openshock/zappiehell/goals/:id` - Update goal
- `DELETE /api/openshock/zappiehell/goals/:id` - Delete goal
- `POST /api/openshock/zappiehell/goals/:id/reset` - Reset goal progress
- `POST /api/openshock/zappiehell/goals/reset-stream` - Reset all stream goals

**Event Chains**:
- `GET /api/openshock/zappiehell/chains` - List all chains
- `POST /api/openshock/zappiehell/chains` - Create chain
- `PUT /api/openshock/zappiehell/chains/:id` - Update chain
- `DELETE /api/openshock/zappiehell/chains/:id` - Delete chain
- `POST /api/openshock/zappiehell/chains/:id/execute` - Test execute chain

#### Socket.io Events

**Client to Server**:
- `zappiehell:request:state` - Request initial goals state

**Server to Client**:
- `zappiehell:goals:state` - Initial goals state
- `zappiehell:goals:update` - Goal progress updated
- `zappiehell:goals:completed` - Goal completed
- `zappiehell:audio:play` - Play audio/TTS
- `zappiehell:overlay:animate` - Trigger overlay animation

#### Coin Tracking

Coins are automatically tracked from TikTok gift events:
1. TikTok gift received with coin value
2. Coins added to all active goals
3. Progress checked against target
4. If target reached:
   - Goal marked as completed
   - Linked event chain executed (if configured)
   - Overlay notified with celebration effect

### Best Practices

1. **Test Chains First**: Use the "▶️ Test" button to verify chains work as expected
2. **Progressive Goals**: Create multiple goals with increasing coin targets
3. **Timing Matters**: Use delays to create dramatic pauses between actions
4. **Webhook Security**: Only use webhooks to trusted endpoints
5. **Monitor Executions**: Check execution history in database for debugging
6. **Reset Wisely**: Stream goals auto-reset; global goals require manual reset

### Troubleshooting

**Overlay not updating**:
- Check Socket.io connection in browser console
- Verify overlay URL is correct
- Refresh browser source in OBS

**Chain not executing**:
- Verify chain is linked to goal
- Check goal is active and target reached
- Review execution history in database
- Check logs for error messages

**Webhook failures**:
- Verify URL is accessible
- Check JSON body syntax
- Review network logs
- Ensure external service is responding

### Security Considerations

- Webhooks should only be used with trusted endpoints
- Webhook URLs may be visible in database - avoid sensitive data in URLs
- Chain execution can trigger external actions - review carefully before activation
- Consider rate limiting for webhook steps if chaining multiple goals

---

## Integration with Existing Features

Both features integrate seamlessly with the existing OpenShock plugin:

- **Uses existing gift mappings** from Event Mapper
- **Leverages pattern system** for OpenShock actions
- **Shares device management** with main plugin
- **Respects safety settings** (emergency stop, limits)
- **Uses common Socket.io infrastructure** for real-time updates

---

## File Structure

```
app/plugins/openshock/
├── main.js                                    # Updated with ZappieHell integration
├── ui.html                                    # Added ZappieHell admin tab + modals
├── ui.js                                      # Added ZappieHell management functions
├── helpers/
│   └── zappieHellManager.js                  # New: ZappieHell service class
└── overlay/
    ├── openshock-rotating-gifts.html         # New: Rotating gifts overlay
    └── zappiehell-overlay.html               # New: ZappieHell progress overlay
```

---

## License

This code is part of PupCidsLittleTikTokHelper and is licensed under CC-BY-NC-4.0.
