# Global Chat Command Engine (GCCE)

Universal chat command interpreter and framework for "Pup Cid's Little TikTool Helper".

## Overview

GCCE is a standalone plugin that provides a centralized system for managing all chat commands across the entire application. It eliminates the need for individual plugins to implement their own command parsing, validation, and permission systems.

## Features

- **Centralized Command Registry**: Single source of truth for all chat commands
- **Permission System**: Hierarchical role-based access control
- **Syntax Validation**: Automatic argument validation and error messaging
- **Rate Limiting**: Per-user and global rate limiting to prevent spam
- **Overlay Integration**: Unified overlay system for command feedback
- **Plugin API**: Simple registration API for plugins to add commands
- **Statistics Tracking**: Command usage statistics and analytics
- **Help System**: Auto-generated help menus and command documentation
- **Dynamic Configuration**: Per-plugin command settings

## Architecture

### Core Components

1. **Command Registry** (`commandRegistry.js`): Stores and manages all registered commands
2. **Command Parser** (`commandParser.js`): Parses chat messages and routes to handlers
3. **Permission Checker** (`permissionChecker.js`): Validates user permissions
4. **Main Plugin** (`index.js`): Orchestrates all components and provides public API

### Permission Hierarchy

```
broadcaster > moderator > vip > subscriber > all
```

Any user with a higher permission level can execute commands requiring lower levels.

## Plugin Integration

### Registering Commands

Plugins can register commands by accessing the GCCE instance:

```javascript
// In your plugin's init() method
const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');

if (gccePlugin?.instance) {
    const gcce = gccePlugin.instance;
    
    const commands = [
        {
            name: 'mycommand',
            description: 'Description of my command',
            syntax: '/mycommand <arg1> [arg2]',
            permission: 'all',          // all, subscriber, vip, moderator, broadcaster
            enabled: true,
            minArgs: 1,
            maxArgs: 2,
            category: 'My Category',
            handler: async (args, context) => {
                // Your command logic
                return {
                    success: true,
                    message: 'Command executed successfully!',
                    displayOverlay: true
                };
            }
        }
    ];
    
    gcce.registerCommandsForPlugin('myplugin', commands);
}
```

### Command Handler Context

Each command handler receives:

```javascript
{
    userId: string,        // User's unique ID
    username: string,      // User's display name
    userRole: string,      // User's permission level
    timestamp: number,     // Command timestamp
    rawData: object        // Original TikTok event data
}
```

### Command Handler Response

Handlers should return:

```javascript
{
    success: boolean,      // Whether command succeeded
    message: string,       // Message to display (optional)
    error: string,         // Error message if failed (optional)
    displayOverlay: boolean, // Show in overlay (optional)
    data: object          // Additional data (optional)
}
```

## StreamAlchemy Integration

GCCE includes full integration with the StreamAlchemy plugin:

### Available Commands

- `/inventory` - View your alchemy inventory
- `/inspect <item>` - Inspect a specific item
- `/merge <item1> <item2>` - Manually merge two items (moderator only)
- `/alchemy [help]` - View alchemy stats or help

### Example Usage

```
User: /inventory
Response: "username, you have 12 unique items! Check the overlay."

User: /inspect rose
Response: "Inspecting Essence of Rose (Common) - Check the overlay!"

Moderator: /merge rose lion
Response: "Successfully merged Essence of Rose + Essence of Lion into Enhanced Rose-Lion Talisman!"
```

## Built-in Commands

### /help [command]

Shows available commands or detailed help for a specific command.

**Examples:**
```
/help                  → Shows all commands grouped by category
/help inventory        → Shows detailed help for /inventory command
```

### /commands

Lists all available commands.

**Example:**
```
/commands → "Available commands (15): /help, /commands, /inventory, /inspect, ..."
```

## API Endpoints

- `GET /gcce/overlay` - Overlay HTML page
- `GET /gcce/style.css` - Overlay CSS
- `GET /api/gcce/commands` - Get all registered commands
- `GET /api/gcce/commands/:pluginId` - Get commands for specific plugin
- `GET /api/gcce/stats` - Get command usage statistics
- `POST /api/gcce/commands/:commandName/toggle` - Enable/disable a command
- `GET /api/gcce/config` - Get GCCE configuration
- `POST /api/gcce/config` - Update GCCE configuration

## Socket.io Events

### Emitted by GCCE

- `gcce:command_input` - Command input notification (shows when user types a command)
  ```javascript
  {
      command: string,      // The command that was typed (e.g., "/help")
      username: string,     // Username who typed the command
      timestamp: number     // Timestamp of the command
  }
  ```

- `gcce:command_result` - Command execution result
  ```javascript
  {
      success: boolean,
      error: string,
      message: string,
      data: object,
      username: string,
      timestamp: number
  }
  ```

### Received by GCCE

- `gcce:get_commands` - Request command list
  ```javascript
  { filters: { pluginId: 'streamalchemy', enabled: true } }
  ```

## Overlay Setup

Add to OBS as Browser Source:

```
URL: http://localhost:3000/gcce/overlay
Width: 1920
Height: 1080
```

The overlay displays:
- Command input notifications (top right) - Shows when users type commands
- Command success/error messages (bottom center)
- Help panels with command lists (center)
- Error notifications (top center)
- Integration with plugin-specific overlays (e.g., StreamAlchemy)

## Configuration

Default configuration:

```javascript
{
    enabled: true,                      // Enable/disable GCCE
    enableBuiltInCommands: true,        // Enable /help and /commands
    enableOverlayMessages: true,        // Show messages in overlay
    enableHelpCommand: true,            // Enable /help command
    commandPrefix: '/'                  // Command prefix character
}
```

## Rate Limiting

**Per User**: 10 commands per minute
**Global**: 100 commands per minute

Users exceeding limits receive: "You are sending commands too quickly. Please slow down."

## Error Messages

- `Command not found` - Unknown command
- `Permission denied` - Insufficient permissions
- `Invalid syntax` - Wrong arguments
- `Command disabled` - Command is disabled
- `Rate limit exceeded` - Too many commands
- `Missing arguments` - Required arguments missing

## Statistics

Access via `/api/gcce/stats`:

```javascript
{
    totalRegistered: number,        // Total commands registered
    totalExecuted: number,          // Total successful executions
    totalFailed: number,            // Total failed executions
    registeredCommands: number,     // Current registered commands
    pluginsWithCommands: number,    // Plugins using GCCE
    topCommands: [                  // Most used commands
        { command: 'inventory', count: 142 },
        { command: 'help', count: 89 }
    ]
}
```

## Development

### Adding Custom Validation

```javascript
{
    name: 'mycommand',
    validateArgs: (args) => {
        if (args[0] !== 'expected') {
            return {
                valid: false,
                error: 'First argument must be "expected"'
            };
        }
        return { valid: true };
    },
    handler: async (args, context) => { ... }
}
```

### Unregistering Commands

```javascript
// In your plugin's destroy() method
const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
if (gccePlugin?.instance) {
    gccePlugin.instance.unregisterCommandsForPlugin('myplugin');
}
```

## Best Practices

1. **Keep handlers async**: Use async/await for all command handlers
2. **Return meaningful messages**: Provide clear success/error messages
3. **Use appropriate permissions**: Don't over-restrict commands
4. **Validate inputs**: Use minArgs/maxArgs or custom validation
5. **Handle errors gracefully**: Wrap handler logic in try-catch
6. **Use categories**: Organize commands by logical groups
7. **Document syntax clearly**: Include examples in description

## Troubleshooting

### Commands not working

1. Check GCCE is enabled: `GET /api/gcce/config`
2. Verify command is registered: `GET /api/gcce/commands`
3. Check console for error messages
4. Verify user has required permission

### Overlay not showing messages

1. Verify overlay URL in OBS is correct
2. Check browser console for errors
3. Ensure `enableOverlayMessages` is true
4. Verify Socket.io connection

## Version

1.0.0

## Author

Pup Cid

## License

CC BY-NC 4.0
