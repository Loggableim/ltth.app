/**
 * Global Chat Command Engine (GCCE) - Configuration
 * 
 * Defines constants and configuration for the universal chat command system.
 */

module.exports = {
    // Command prefix
    COMMAND_PREFIX: '/',
    
    // Default permissions
    DEFAULT_PERMISSIONS: {
        ALL: 'all',              // Everyone can use
        BROADCASTER: 'broadcaster', // Only broadcaster
        MODERATOR: 'moderator',     // Moderators and above
        VIP: 'vip',                 // VIPs and above
        SUBSCRIBER: 'subscriber'    // Subscribers and above
    },
    
    // Permission hierarchy (higher index = more permissions)
    PERMISSION_HIERARCHY: [
        'all',
        'subscriber',
        'vip',
        'moderator',
        'broadcaster'
    ],
    
    // Overlay display settings
    OVERLAY: {
        MESSAGE_DURATION: 5000,     // How long messages stay visible
        ERROR_DURATION: 3000,       // How long errors stay visible
        HELP_PANEL_DURATION: 10000, // How long help panel stays visible
        MAX_RECENT_COMMANDS: 50     // Number of recent commands to track
    },
    
    // Rate limiting
    RATE_LIMIT: {
        COMMANDS_PER_USER_PER_MINUTE: 10,
        GLOBAL_COMMANDS_PER_MINUTE: 100
    },
    
    // Error messages
    ERRORS: {
        COMMAND_NOT_FOUND: 'Command not found. Type /help for available commands.',
        PERMISSION_DENIED: 'You do not have permission to use this command.',
        INVALID_SYNTAX: 'Invalid command syntax. Use /help <command> for correct usage.',
        COMMAND_DISABLED: 'This command is currently disabled.',
        RATE_LIMIT_EXCEEDED: 'You are sending commands too quickly. Please slow down.',
        MISSING_ARGUMENTS: 'Missing required arguments. Use /help <command> for syntax.',
        PLUGIN_NOT_LOADED: 'The plugin for this command is not currently loaded.'
    }
};
