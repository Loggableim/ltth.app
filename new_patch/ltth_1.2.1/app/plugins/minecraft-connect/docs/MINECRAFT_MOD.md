# TikStreamLink Fabric Mod Documentation

## Overview

TikStreamLink is a Minecraft Fabric mod that enables real-time interaction between TikTok Live streams and Minecraft gameplay. It provides a WebSocket server that receives commands from the TikTok streaming tool and executes them in-game.

## Requirements

- Minecraft Java Edition 1.20.4
- Fabric Loader 0.15.0 or newer
- Fabric API 0.96.0 or newer
- Java 17 or newer

## Installation

1. Install Fabric Loader for Minecraft 1.20.4
2. Download and install Fabric API
3. Copy the TikStreamLink JAR file to your `.minecraft/mods` folder
4. Launch Minecraft

## WebSocket Protocol

### Server Configuration

The mod starts a WebSocket server on `localhost:25560` by default. This can be configured in the mod's config file.

### Connection Flow

1. Client (TikTok tool) connects to `ws://localhost:25560`
2. Server sends `available_actions` message with list of supported actions
3. Client can send `execute_action` commands
4. Server responds with `action_result` messages

### Message Format

#### Available Actions (Server → Client)

Sent immediately upon connection:

```json
{
  "type": "available_actions",
  "actions": [
    {
      "name": "spawn_entity",
      "params": ["entityId", "count", "position"]
    },
    {
      "name": "give_item",
      "params": ["itemId", "count"]
    },
    {
      "name": "set_time",
      "params": ["time"]
    },
    {
      "name": "apply_potion_effect",
      "params": ["effectId", "duration", "amplifier"]
    },
    {
      "name": "post_chat_message",
      "params": ["message"]
    },
    {
      "name": "change_weather",
      "params": ["weatherType"]
    },
    {
      "name": "execute_command",
      "params": ["command"]
    }
  ]
}
```

#### Execute Action (Client → Server)

```json
{
  "type": "execute_action",
  "action": "spawn_entity",
  "params": {
    "entityId": "minecraft:sheep",
    "count": 5,
    "position": null
  },
  "timestamp": 1234567890
}
```

#### Action Result (Server → Client)

```json
{
  "type": "action_result",
  "success": true,
  "action": "spawn_entity",
  "message": "Spawned 5 minecraft:sheep",
  "timestamp": 1234567890
}
```

#### Error (Server → Client)

```json
{
  "type": "error",
  "error": "Invalid entity ID",
  "action": "spawn_entity"
}
```

## Available Actions

### spawn_entity

Spawns entities near the player.

**Parameters:**
- `entityId` (string): Minecraft entity ID (e.g., "minecraft:sheep")
- `count` (integer): Number of entities to spawn (default: 1)
- `position` (object, optional): {x, y, z} coordinates (defaults to player position)

**Example:**
```json
{
  "action": "spawn_entity",
  "params": {
    "entityId": "minecraft:sheep",
    "count": 3
  }
}
```

### give_item

Gives items to the player.

**Parameters:**
- `itemId` (string): Minecraft item ID (e.g., "minecraft:diamond")
- `count` (integer): Number of items (default: 1)

**Example:**
```json
{
  "action": "give_item",
  "params": {
    "itemId": "minecraft:diamond",
    "count": 10
  }
}
```

### set_time

Changes the world time.

**Parameters:**
- `time` (integer): Time value (0-24000, 0 = dawn, 6000 = noon, 12000 = dusk, 18000 = midnight)

**Example:**
```json
{
  "action": "set_time",
  "params": {
    "time": 18000
  }
}
```

### apply_potion_effect

Applies a potion effect to the player.

**Parameters:**
- `effectId` (string): Potion effect ID (e.g., "minecraft:speed")
- `duration` (integer): Duration in seconds (default: 30)
- `amplifier` (integer): Effect amplifier/level (default: 0)

**Example:**
```json
{
  "action": "apply_potion_effect",
  "params": {
    "effectId": "minecraft:speed",
    "duration": 60,
    "amplifier": 2
  }
}
```

### post_chat_message

Posts a message to the server chat.

**Parameters:**
- `message` (string): Message to post

**Example:**
```json
{
  "action": "post_chat_message",
  "params": {
    "message": "Thanks for the gift, viewer123!"
  }
}
```

### change_weather

Changes the weather.

**Parameters:**
- `weatherType` (string): "clear", "rain", or "thunder"

**Example:**
```json
{
  "action": "change_weather",
  "params": {
    "weatherType": "thunder"
  }
}
```

### execute_command

Executes a Minecraft command.

**Parameters:**
- `command` (string): Command to execute (without leading slash)

**Example:**
```json
{
  "action": "execute_command",
  "params": {
    "command": "gamemode creative"
  }
}
```

## Implementation Notes

### Thread Safety

All game modifications must be executed on the main server thread. Use `server.execute()` to queue operations:

```java
server.execute(() -> {
    // Game modification code here
});
```

### Error Handling

The mod should handle errors gracefully:
- Invalid entity/item IDs
- Invalid parameter values
- Permission issues
- Player not found

### Security Considerations

- Only allow connections from localhost
- Validate all incoming parameters
- Implement rate limiting
- Log all actions for debugging

## Building the Mod

See `BUILD_INSTRUCTIONS.md` for detailed build instructions, including:
- Setting up the development environment
- Project structure
- Dependencies
- Building the JAR file

## Troubleshooting

### Connection Issues

- Verify the WebSocket server is running (check logs)
- Ensure port 25560 is not blocked by firewall
- Check that Minecraft is running with the mod loaded

### Actions Not Working

- Check server logs for error messages
- Verify entity/item IDs are valid
- Ensure player is in a valid location
- Check permissions (if on a server)

## Support

For issues or questions, please refer to the main TikTok streaming tool documentation or create an issue on the GitHub repository.
