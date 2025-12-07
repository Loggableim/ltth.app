# Minecraft Connect Plugin

Bidirectional real-time integration between TikTok Live events and Minecraft (Java Edition).

## Overview

The Minecraft Connect plugin enables streamers to create interactive experiences by mapping TikTok Live events (gifts, follows, likes, etc.) to Minecraft actions. When viewers interact with your TikTok stream, actions happen in your Minecraft world in real-time!

### Examples

- Viewer sends a "Rose" gift → Spawn 5 sheep near player
- Someone follows → Give the player a diamond
- 100 likes milestone → Change weather to thunder
- Specific chat message → Execute a custom command

## Architecture

The plugin consists of three components:

1. **Dashboard Plugin** (Node.js/Express) - Configuration UI in the TikTool Helper dashboard
2. **WebSocket Bridge** (Node.js) - Secure communication bridge running in the TikTool Helper
3. **Minecraft Mod** (Java/Fabric) - Fabric mod that receives and executes actions in-game

```
TikTok Live Event
    ↓
TikTool Helper (Dashboard + Bridge)
    ↓ (WebSocket)
Minecraft Fabric Mod
    ↓
Minecraft Game Actions
```

## Features

### Dashboard Features
- ✅ Visual connection status indicator
- ✅ Action mapping editor with drag-and-drop interface
- ✅ Support for conditions (e.g., "only if gift is Rose")
- ✅ Dynamic parameter substitution using placeholders
- ✅ Live event log
- ✅ Statistics and monitoring
- ✅ Configurable rate limits and safety settings

### Bridge Features
- ✅ WebSocket server for Minecraft mod connection
- ✅ Command queue with priority system
- ✅ Rate limiting (actions per minute)
- ✅ Automatic reconnection
- ✅ Heartbeat monitoring
- ✅ Error handling and logging

### Minecraft Mod Features
- ✅ Spawn entities near player
- ✅ Give items to player
- ✅ Change world time
- ✅ Apply potion effects
- ✅ Post chat messages
- ✅ Change weather
- ✅ Execute custom commands

### Stream Overlay
- ✅ Beautiful animated notifications
- ✅ Shows triggered actions in real-time
- ✅ Customizable appearance
- ✅ OBS BrowserSource compatible

## Installation

### 1. Plugin Installation (Already Installed)

This plugin is automatically loaded by the TikTool Helper when the server starts.

### 2. Minecraft Mod Installation

See [Minecraft Mod Documentation](docs/MINECRAFT_MOD.md) for detailed instructions.

**Quick Start:**

1. Install Fabric Loader for Minecraft 1.20.4
2. Install Fabric API
3. Build or download the TikStreamLink mod
4. Copy JAR to `.minecraft/mods/` folder
5. Launch Minecraft

## Configuration

### Dashboard Configuration

1. Open the TikTool Helper dashboard
2. Navigate to the "Minecraft Connect" plugin
3. Go to the "Settings" tab
4. Configure:
   - WebSocket port (default: 25560)
   - Rate limits
   - Overlay settings

### Creating Action Mappings

1. Click "Add Mapping" in the "Action Mappings" tab
2. Select a TikTok event trigger (Gift, Follow, Like, etc.)
3. (Optional) Add conditions (e.g., gift name equals "Rose")
4. Select a Minecraft action
5. Configure action parameters
6. Save the mapping

#### Example Mapping

**Trigger:** Gift  
**Condition:** giftName equals "Rose"  
**Action:** spawn_entity  
**Parameters:**
- entityId: `minecraft:sheep`
- count: `{giftCount}` (uses actual gift count from event)

### Parameter Placeholders

Use these placeholders in action parameters to insert data from TikTok events:

- `{uniqueId}` - Username
- `{nickname}` - Display name
- `{giftName}` - Name of the gift
- `{giftCount}` - Number of gifts
- `{likeCount}` - Number of likes
- `{comment}` - Chat message text
- `{followRole}` - Follower role

## Available Actions

### spawn_entity
Spawns entities near the player.

**Parameters:**
- `entityId` - Minecraft entity ID (e.g., "minecraft:sheep")
- `count` - Number of entities to spawn

### give_item
Gives items to the player.

**Parameters:**
- `itemId` - Minecraft item ID (e.g., "minecraft:diamond")
- `count` - Number of items

### set_time
Changes the world time.

**Parameters:**
- `time` - Time value (0-24000)

### apply_potion_effect
Applies a potion effect to the player.

**Parameters:**
- `effectId` - Potion effect ID (e.g., "minecraft:speed")
- `duration` - Duration in seconds
- `amplifier` - Effect level (0 = level 1)

### post_chat_message
Posts a message in the game chat.

**Parameters:**
- `message` - Message to post

### change_weather
Changes the weather.

**Parameters:**
- `weatherType` - "clear", "rain", or "thunder"

### execute_command
Executes a Minecraft command.

**Parameters:**
- `command` - Command to execute (without slash)

## Stream Overlay Setup

1. In OBS, add a new "Browser" source
2. Use URL: `http://localhost:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html`
3. Set width: 1920, height: 1080
4. Check "Shutdown source when not visible"
5. Check "Refresh browser when scene becomes active"

## API Reference

### REST Endpoints

- `GET /api/minecraft-connect/status` - Get connection status
- `GET /api/minecraft-connect/mappings` - Get all mappings
- `POST /api/minecraft-connect/mappings` - Create mapping
- `PUT /api/minecraft-connect/mappings/:id` - Update mapping
- `DELETE /api/minecraft-connect/mappings/:id` - Delete mapping
- `POST /api/minecraft-connect/test-action` - Test an action
- `PUT /api/minecraft-connect/config` - Update configuration

### Socket.IO Events

**Server → Client:**
- `minecraft-connect:status-changed` - Connection status update
- `minecraft-connect:actions-updated` - Available actions changed
- `minecraft-connect:event-log` - New event logged
- `minecraft-connect:action-result` - Action execution result
- `minecraft-connect:overlay-show` - Show overlay notification

**Client → Server:**
- `minecraft-connect:get-status` - Request current status
- `minecraft-connect:get-mappings` - Request mappings

## Troubleshooting

### Plugin Not Loading

- Check server logs for errors
- Verify `plugin.json` is valid
- Ensure `main.js` exists and has no syntax errors

### Minecraft Mod Not Connecting

- Verify mod is installed correctly
- Check Minecraft logs for errors
- Ensure WebSocket port (25560) is not blocked
- Try restarting both Minecraft and TikTool Helper

### Actions Not Triggering

- Check connection status in dashboard
- Verify mappings are enabled
- Check event log for errors
- Verify TikTok events are being received
- Check rate limits aren't being exceeded

### Performance Issues

- Reduce max actions per minute
- Increase command cooldown
- Limit entity spawn counts
- Check queue status

## Development

### Building the Minecraft Mod

See [Build Instructions](docs/BUILD_INSTRUCTIONS.md) for detailed information.

### Testing

1. Start the TikTool Helper server
2. Launch Minecraft with the mod
3. Check connection status in dashboard
4. Use "Test Action" button to verify functionality
5. Create test mappings
6. Trigger TikTok events to test end-to-end

## Security

### Safety Features

- Rate limiting (max actions per minute)
- Command cooldown between actions
- Queue size limits
- localhost-only WebSocket connections
- Input validation
- Error handling

### Best Practices

- Don't share your WebSocket port externally
- Use rate limits to prevent abuse
- Test mappings before going live
- Monitor the event log during streams
- Keep Minecraft backup saves

## Contributing

Contributions are welcome! Please:

1. Follow existing code style
2. Test thoroughly
3. Update documentation
4. Submit pull requests

## License

CC BY-NC 4.0 License - See LICENSE file for details

## Support

For issues or questions:

- Check the documentation
- Review the troubleshooting section
- Create an issue on GitHub
- Join the Discord community

## Credits

- Built for the TikTool Helper streaming tool
- Uses Fabric for Minecraft modding
- WebSocket communication via ws library
- UI styling with custom CSS

## Changelog

### Version 1.0.0 (Initial Release)

- Dashboard plugin with mapping editor
- WebSocket bridge server
- Minecraft Fabric mod documentation and examples
- Stream overlay
- 7 core actions (spawn, give, time, weather, effects, chat, commands)
- Rate limiting and safety features
- Real-time event logging
- Connection monitoring
