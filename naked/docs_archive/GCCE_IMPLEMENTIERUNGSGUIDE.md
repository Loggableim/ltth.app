# GCCE Implementierungs-Guide
## Praktischer Leitfaden für die Umsetzung der Massivanalyse

---

## 🎯 Übersicht

Dieses Dokument ist der **praktische Begleiter** zur GCCE Massivanalyse und bietet:
- ✅ **Code-Beispiele** für alle Top-Prioritäts-Features
- ✅ **Step-by-Step Anleitungen**
- ✅ **Testing-Strategien**
- ✅ **Migration-Guides**
- ✅ **Best Practices**

---

## 🚀 QUICK START: Top 5 Implementierungen

### 1️⃣ P1: Command Registry Caching (2h)

#### Implementierung

**Datei:** `app/plugins/gcce/commandRegistry.js`

```javascript
/**
 * LRU Cache für Command Registry
 * Reduziert Lookup-Zeit um 60-80%
 */
class CommandRegistry {
    constructor(logger) {
        this.logger = logger;
        
        // Existing
        this.commands = new Map();
        this.pluginCommands = new Map();
        this.stats = { /* ... */ };
        
        // ✨ NEU: LRU Cache
        this.cache = new LRUCache(50); // Max 50 Einträge
        this.cacheStats = {
            hits: 0,
            misses: 0,
            hitRate: 0
        };
    }

    /**
     * Get Command mit Caching
     */
    getCommand(commandName) {
        // Cache Lookup
        const cached = this.cache.get(commandName);
        if (cached) {
            this.cacheStats.hits++;
            this.updateHitRate();
            return cached;
        }
        
        // Cache Miss - hole aus Map
        this.cacheStats.misses++;
        const command = this.commands.get(commandName);
        
        if (command) {
            this.cache.set(commandName, command);
        }
        
        this.updateHitRate();
        return command || null;
    }

    /**
     * Update Hit Rate Statistik
     */
    updateHitRate() {
        const total = this.cacheStats.hits + this.cacheStats.misses;
        this.cacheStats.hitRate = total > 0 
            ? (this.cacheStats.hits / total * 100).toFixed(2)
            : 0;
    }

    /**
     * Get Cache Stats (für Monitoring)
     */
    getCacheStats() {
        return {
            ...this.cacheStats,
            size: this.cache.size,
            maxSize: this.cache.maxSize
        };
    }

    /**
     * Clear Cache (bei Command Updates)
     */
    invalidateCache(commandName = null) {
        if (commandName) {
            this.cache.delete(commandName);
        } else {
            this.cache.clear();
        }
    }
}

/**
 * Simple LRU Cache Implementation
 */
class LRUCache {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        
        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        
        return value;
    }

    set(key, value) {
        // Delete if exists (to reorder)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        // Add to end
        this.cache.set(key, value);
        
        // Evict oldest if over capacity
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }
}

module.exports = CommandRegistry;
```

#### Testing

**Datei:** `app/plugins/gcce/test/commandRegistry.test.js`

```javascript
const CommandRegistry = require('../commandRegistry');

describe('Command Registry Caching', () => {
    let registry;
    
    beforeEach(() => {
        const logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };
        registry = new CommandRegistry(logger);
    });

    test('Cache Hit erhöht Hit Counter', () => {
        // Arrange
        registry.registerCommand({
            pluginId: 'test',
            name: 'testcmd',
            handler: async () => {}
        });
        
        // Act
        registry.getCommand('testcmd'); // Cache Miss
        registry.getCommand('testcmd'); // Cache Hit
        registry.getCommand('testcmd'); // Cache Hit
        
        // Assert
        const stats = registry.getCacheStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe('66.67');
    });

    test('LRU eviction bei Overflow', () => {
        // Arrange - Fill cache to capacity
        for (let i = 0; i < 50; i++) {
            registry.registerCommand({
                pluginId: 'test',
                name: `cmd${i}`,
                handler: async () => {}
            });
            registry.getCommand(`cmd${i}`);
        }
        
        // Act - Add one more (should evict cmd0)
        registry.registerCommand({
            pluginId: 'test',
            name: 'cmd50',
            handler: async () => {}
        });
        registry.getCommand('cmd50');
        
        // Access cmd0 - should be cache miss
        registry.getCommand('cmd0');
        
        // Assert
        const stats = registry.getCacheStats();
        expect(stats.size).toBe(50); // Max size maintained
    });
});
```

#### Performance Benchmark

```javascript
// benchmark.js
const CommandRegistry = require('./commandRegistry');

async function benchmark() {
    const registry = new CommandRegistry({ info: () => {}, warn: () => {}, error: () => {} });
    
    // Setup 100 commands
    for (let i = 0; i < 100; i++) {
        registry.registerCommand({
            pluginId: 'test',
            name: `cmd${i}`,
            handler: async () => {}
        });
    }
    
    // Benchmark ohne Cache
    console.time('Without Cache');
    for (let i = 0; i < 10000; i++) {
        const cmd = `cmd${i % 100}`;
        registry.commands.get(cmd); // Direct access
    }
    console.timeEnd('Without Cache');
    
    // Benchmark mit Cache
    console.time('With Cache');
    for (let i = 0; i < 10000; i++) {
        const cmd = `cmd${i % 100}`;
        registry.getCommand(cmd); // Cached access
    }
    console.timeEnd('With Cache');
    
    console.log('Cache Stats:', registry.getCacheStats());
}

benchmark();
```

---

### 2️⃣ F1: Command Aliases (3h)

#### Implementierung

**Datei:** `app/plugins/gcce/commandRegistry.js`

```javascript
class CommandRegistry {
    constructor(logger) {
        // ... existing code ...
        
        // ✨ NEU: Alias Mapping
        this.aliases = new Map(); // alias -> commandName
    }

    /**
     * Register Command mit Alias-Support
     */
    registerCommand(commandDef) {
        // ... existing validation ...
        
        // ✨ NEU: Register aliases
        if (commandDef.aliases && Array.isArray(commandDef.aliases)) {
            for (const alias of commandDef.aliases) {
                this.registerAlias(alias, commandDef.name);
            }
        }
        
        // ... rest of existing code ...
    }

    /**
     * Register ein Alias für einen Command
     */
    registerAlias(alias, commandName) {
        const normalizedAlias = alias.toLowerCase().trim();
        
        // Check for conflicts
        if (this.aliases.has(normalizedAlias)) {
            this.logger.warn(`[GCCE] Alias conflict: ${alias} already mapped to ${this.aliases.get(normalizedAlias)}`);
            return false;
        }
        
        if (this.commands.has(normalizedAlias)) {
            this.logger.warn(`[GCCE] Alias conflict: ${alias} is already a command name`);
            return false;
        }
        
        this.aliases.set(normalizedAlias, commandName);
        this.logger.info(`[GCCE] Registered alias: ${alias} -> ${commandName}`);
        return true;
    }

    /**
     * Get Command - Jetzt mit Alias-Support
     */
    getCommand(commandName) {
        const normalized = commandName.toLowerCase();
        
        // Try cache first
        const cached = this.cache.get(normalized);
        if (cached) {
            this.cacheStats.hits++;
            return cached;
        }
        
        // Try direct command name
        let command = this.commands.get(normalized);
        
        // ✨ NEU: Try alias resolution
        if (!command) {
            const resolvedName = this.aliases.get(normalized);
            if (resolvedName) {
                command = this.commands.get(resolvedName);
            }
        }
        
        if (command) {
            this.cache.set(normalized, command);
        }
        
        this.cacheStats.misses++;
        return command || null;
    }

    /**
     * Unregister Command - Cleanup Aliases
     */
    unregisterCommand(commandName, pluginId) {
        const command = this.commands.get(commandName);
        
        if (command) {
            // ✨ NEU: Remove all aliases for this command
            for (const [alias, targetCmd] of this.aliases.entries()) {
                if (targetCmd === commandName) {
                    this.aliases.delete(alias);
                }
            }
            
            // Invalidate cache
            this.invalidateCache(commandName);
        }
        
        // ... existing unregister logic ...
    }

    /**
     * Get all aliases for a command
     */
    getAliases(commandName) {
        const aliases = [];
        for (const [alias, targetCmd] of this.aliases.entries()) {
            if (targetCmd === commandName) {
                aliases.push(alias);
            }
        }
        return aliases;
    }
}
```

#### Plugin Integration Beispiel

```javascript
// In StreamAlchemy Plugin
async init() {
    const gcce = this.api.pluginLoader?.loadedPlugins?.get('gcce')?.instance;
    
    if (gcce) {
        const commands = [
            {
                name: 'inventory',
                aliases: ['inv', 'bag', 'items'], // ✨ NEU!
                description: 'View your alchemy inventory',
                syntax: '/inventory or /inv',
                permission: 'all',
                handler: async (args, context) => {
                    return await this.handleInventoryCommand(args, context);
                }
            },
            {
                name: 'inspect',
                aliases: ['check', 'view'], // ✨ NEU!
                description: 'Inspect an item',
                syntax: '/inspect <item> or /check <item>',
                permission: 'all',
                handler: async (args, context) => {
                    return await this.handleInspectCommand(args, context);
                }
            }
        ];
        
        gcce.registerCommandsForPlugin('streamalchemy', commands);
    }
}
```

#### UI Update

**Datei:** `app/plugins/gcce/ui.html`

```javascript
// Display aliases in command table
function displayCommands(commandsList) {
    const container = document.getElementById('commands-container');
    
    const table = document.createElement('table');
    table.className = 'commands-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Command</th>
                <th>Aliases</th> <!-- ✨ NEU -->
                <th>Description</th>
                <th>Plugin</th>
                <th>Permission</th>
                <th>Enabled</th>
            </tr>
        </thead>
        <tbody>
            ${commandsList.map(cmd => {
                const aliases = cmd.aliases || [];
                const aliasText = aliases.length > 0 
                    ? aliases.map(a => `/${a}`).join(', ')
                    : '-';
                
                return `
                    <tr>
                        <td><span class="command-name">/${cmd.name}</span></td>
                        <td><span class="command-aliases">${aliasText}</span></td>
                        <td>${cmd.description || '-'}</td>
                        <td><span class="command-plugin">${cmd.plugin || 'built-in'}</span></td>
                        <td><span class="permission-badge permission-${cmd.permission}">${cmd.permission}</span></td>
                        <td>
                            <label class="toggle-switch">
                                <input type="checkbox" ${cmd.enabled ? 'checked' : ''} data-command-name="${cmd.name}">
                                <span class="toggle-slider"></span>
                            </label>
                        </td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    `;
    
    container.innerHTML = '';
    container.appendChild(table);
}
```

---

### 3️⃣ F2: Command Cooldowns (4h)

#### Implementierung

**Datei:** `app/plugins/gcce/cooldownManager.js` (NEU)

```javascript
/**
 * Cooldown Manager für GCCE
 * Unterstützt:
 * - Global Cooldowns
 * - Per-User Cooldowns
 * - Per-Role Cooldowns
 */
class CooldownManager {
    constructor(logger) {
        this.logger = logger;
        
        // Map<commandName, Map<userId, expiresAt>>
        this.userCooldowns = new Map();
        
        // Map<commandName, expiresAt>
        this.globalCooldowns = new Map();
    }

    /**
     * Check if command is on cooldown for user
     * @returns {Object} { onCooldown: boolean, remaining?: number }
     */
    checkCooldown(commandDef, userId, userRole) {
        if (!commandDef.cooldown) {
            return { onCooldown: false };
        }

        const now = Date.now();
        const cooldownConfig = commandDef.cooldown;

        // Check global cooldown
        if (cooldownConfig.global) {
            const globalExpiry = this.globalCooldowns.get(commandDef.name);
            if (globalExpiry && now < globalExpiry) {
                return {
                    onCooldown: true,
                    remaining: Math.ceil((globalExpiry - now) / 1000),
                    type: 'global'
                };
            }
        }

        // Check per-role cooldown
        if (cooldownConfig.perRole && cooldownConfig.perRole[userRole]) {
            const roleCooldown = cooldownConfig.perRole[userRole];
            
            // Role cooldown of 0 = bypass
            if (roleCooldown === 0) {
                return { onCooldown: false };
            }

            const userCooldownMap = this.userCooldowns.get(commandDef.name);
            if (userCooldownMap) {
                const userExpiry = userCooldownMap.get(userId);
                if (userExpiry && now < userExpiry) {
                    return {
                        onCooldown: true,
                        remaining: Math.ceil((userExpiry - now) / 1000),
                        type: 'role'
                    };
                }
            }
        }

        // Check per-user cooldown
        if (cooldownConfig.perUser) {
            const userCooldownMap = this.userCooldowns.get(commandDef.name);
            if (userCooldownMap) {
                const userExpiry = userCooldownMap.get(userId);
                if (userExpiry && now < userExpiry) {
                    return {
                        onCooldown: true,
                        remaining: Math.ceil((userExpiry - now) / 1000),
                        type: 'user'
                    };
                }
            }
        }

        return { onCooldown: false };
    }

    /**
     * Set cooldown after command execution
     */
    setCooldown(commandDef, userId, userRole) {
        if (!commandDef.cooldown) return;

        const now = Date.now();
        const cooldownConfig = commandDef.cooldown;

        // Set global cooldown
        if (cooldownConfig.global) {
            this.globalCooldowns.set(
                commandDef.name,
                now + cooldownConfig.global
            );
        }

        // Set per-role cooldown
        if (cooldownConfig.perRole && cooldownConfig.perRole[userRole]) {
            const roleCooldown = cooldownConfig.perRole[userRole];
            if (roleCooldown > 0) {
                this.setUserCooldown(commandDef.name, userId, now + roleCooldown);
            }
        }
        // Set per-user cooldown
        else if (cooldownConfig.perUser) {
            this.setUserCooldown(commandDef.name, userId, now + cooldownConfig.perUser);
        }
    }

    /**
     * Helper: Set user-specific cooldown
     */
    setUserCooldown(commandName, userId, expiresAt) {
        if (!this.userCooldowns.has(commandName)) {
            this.userCooldowns.set(commandName, new Map());
        }
        
        this.userCooldowns.get(commandName).set(userId, expiresAt);
    }

    /**
     * Cleanup expired cooldowns
     */
    cleanup() {
        const now = Date.now();

        // Cleanup global cooldowns
        for (const [commandName, expiresAt] of this.globalCooldowns.entries()) {
            if (now >= expiresAt) {
                this.globalCooldowns.delete(commandName);
            }
        }

        // Cleanup user cooldowns
        for (const [commandName, userMap] of this.userCooldowns.entries()) {
            for (const [userId, expiresAt] of userMap.entries()) {
                if (now >= expiresAt) {
                    userMap.delete(userId);
                }
            }
            
            // Remove empty maps
            if (userMap.size === 0) {
                this.userCooldowns.delete(commandName);
            }
        }
    }

    /**
     * Get cooldown stats
     */
    getStats() {
        return {
            globalCooldowns: this.globalCooldowns.size,
            userCooldowns: Array.from(this.userCooldowns.values())
                .reduce((sum, map) => sum + map.size, 0)
        };
    }
}

module.exports = CooldownManager;
```

#### Integration in CommandParser

**Datei:** `app/plugins/gcce/commandParser.js`

```javascript
const CooldownManager = require('./cooldownManager');

class CommandParser {
    constructor(registry, permissionChecker, logger) {
        this.registry = registry;
        this.permissionChecker = permissionChecker;
        this.logger = logger;
        
        // Rate limiting (existing)
        this.userRateLimits = new Map();
        this.globalRateLimit = { count: 0, resetTime: Date.now() + 60000 };
        
        // ✨ NEU: Cooldown Manager
        this.cooldownManager = new CooldownManager(logger);
    }

    async parse(message, context) {
        try {
            // ... existing code ...

            // ✨ NEU: Check cooldown
            const cooldownCheck = this.cooldownManager.checkCooldown(
                commandDef,
                context.userId,
                context.userRole
            );
            
            if (cooldownCheck.onCooldown) {
                return {
                    success: false,
                    error: `Command is on cooldown. Please wait ${cooldownCheck.remaining}s.`,
                    displayOverlay: true,
                    data: {
                        cooldownType: cooldownCheck.type,
                        remaining: cooldownCheck.remaining
                    }
                };
            }

            // Execute command
            const result = await this.executeCommand(commandDef, parsed.args, context);
            
            // ✨ NEU: Set cooldown if successful
            if (result.success) {
                this.cooldownManager.setCooldown(
                    commandDef,
                    context.userId,
                    context.userRole
                );
            }
            
            // Record execution
            this.registry.recordExecution(parsed.command, result.success);
            
            return result;

        } catch (error) {
            this.logger.error(`[GCCE Parser] Error parsing command: ${error.message}`);
            return {
                success: false,
                error: 'An error occurred while processing your command.',
                displayOverlay: true
            };
        }
    }

    /**
     * Cleanup - jetzt auch Cooldowns
     */
    cleanupRateLimits() {
        // ... existing rate limit cleanup ...
        
        // ✨ NEU: Cleanup cooldowns
        this.cooldownManager.cleanup();
    }
}
```

#### Plugin Usage Example

```javascript
// In OSC-Bridge Plugin
const commands = [
    {
        name: 'wave',
        description: 'Trigger wave animation',
        syntax: '/wave',
        permission: 'all',
        cooldown: {
            perUser: 5000,      // 5s per user
            global: 1000,       // 1s global (prevent spam)
            perRole: {
                all: 10000,     // 10s for viewers
                subscriber: 5000, // 5s for subs
                moderator: 0    // No cooldown for mods
            }
        },
        handler: async (args, context) => {
            await this.sendOSCMessage('/avatar/parameters/Wave', true);
            return { success: true, message: '👋 Wave!' };
        }
    }
];
```

---

### 4️⃣ V2: Enhanced Error Handling (4h)

#### Implementierung

**Datei:** `app/plugins/gcce/errors.js` (NEU)

```javascript
/**
 * GCCE Error System
 * Structured errors mit Error Codes und i18n Support
 */

class GCCEError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'GCCEError';
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
    }

    /**
     * Get user-friendly error message (localized)
     */
    getUserMessage(locale = 'de') {
        return ERROR_MESSAGES[locale]?.[this.code] 
            || ERROR_MESSAGES['en'][this.code]
            || this.message;
    }

    /**
     * Format error with details
     */
    getFormattedMessage(locale = 'de') {
        let msg = this.getUserMessage(locale);
        
        // Replace placeholders with details
        for (const [key, value] of Object.entries(this.details)) {
            msg = msg.replace(`{{${key}}}`, value);
        }
        
        return msg;
    }

    /**
     * Get error object for API response
     */
    toJSON() {
        return {
            error: true,
            code: this.code,
            message: this.message,
            userMessage: this.getUserMessage(),
            details: this.details,
            timestamp: this.timestamp
        };
    }
}

/**
 * Error Codes
 */
const ERROR_CODES = {
    // Permission Errors (1xxx)
    ERR_PERMISSION_DENIED: 1001,
    ERR_CUSTOM_PERMISSION_FAILED: 1002,
    
    // Command Errors (2xxx)
    ERR_COMMAND_NOT_FOUND: 2001,
    ERR_COMMAND_DISABLED: 2002,
    ERR_COMMAND_CONFLICT: 2003,
    
    // Argument Errors (3xxx)
    ERR_MISSING_ARGS: 3001,
    ERR_TOO_MANY_ARGS: 3002,
    ERR_INVALID_ARG_TYPE: 3003,
    ERR_INVALID_ARG_VALUE: 3004,
    
    // Rate Limiting (4xxx)
    ERR_RATE_LIMIT_USER: 4001,
    ERR_RATE_LIMIT_GLOBAL: 4002,
    ERR_COOLDOWN_ACTIVE: 4003,
    
    // Execution Errors (5xxx)
    ERR_HANDLER_FAILED: 5001,
    ERR_HANDLER_TIMEOUT: 5002,
    ERR_HANDLER_NOT_FUNCTION: 5003,
    
    // System Errors (9xxx)
    ERR_INTERNAL: 9001,
    ERR_PLUGIN_NOT_LOADED: 9002,
    ERR_DATABASE: 9003
};

/**
 * Localized Error Messages
 */
const ERROR_MESSAGES = {
    de: {
        // Permission
        1001: 'Du hast keine Berechtigung für diesen Befehl.',
        1002: 'Spezielle Berechtigungsprüfung fehlgeschlagen.',
        
        // Command
        2001: 'Befehl nicht gefunden. Nutze /help für verfügbare Befehle.',
        2002: 'Dieser Befehl ist aktuell deaktiviert.',
        2003: 'Befehlskonflikt: {{conflict}}',
        
        // Arguments
        3001: 'Fehlende Argumente. Syntax: {{syntax}}',
        3002: 'Zu viele Argumente. Syntax: {{syntax}}',
        3003: 'Ungültiger Argumenttyp für {{arg}}. Erwartet: {{expected}}',
        3004: 'Ungültiger Wert für {{arg}}: {{value}}',
        
        // Rate Limiting
        4001: 'Du sendest Befehle zu schnell. Bitte warte {{remaining}}s.',
        4002: 'Globales Rate Limit erreicht. Bitte warte {{remaining}}s.',
        4003: 'Befehl ist im Cooldown. Warte noch {{remaining}}s.',
        
        // Execution
        5001: 'Fehler beim Ausführen des Befehls: {{error}}',
        5002: 'Befehl hat zu lange gedauert (Timeout: {{timeout}}s)',
        5003: 'Befehl-Handler ist keine Funktion.',
        
        // System
        9001: 'Interner Fehler beim Verarbeiten des Befehls.',
        9002: 'Plugin für diesen Befehl ist nicht geladen: {{plugin}}',
        9003: 'Datenbankfehler: {{error}}'
    },
    
    en: {
        // Permission
        1001: 'You do not have permission to use this command.',
        1002: 'Custom permission check failed.',
        
        // Command
        2001: 'Command not found. Use /help for available commands.',
        2002: 'This command is currently disabled.',
        2003: 'Command conflict: {{conflict}}',
        
        // Arguments
        3001: 'Missing arguments. Syntax: {{syntax}}',
        3002: 'Too many arguments. Syntax: {{syntax}}',
        3003: 'Invalid argument type for {{arg}}. Expected: {{expected}}',
        3004: 'Invalid value for {{arg}}: {{value}}',
        
        // Rate Limiting
        4001: 'You are sending commands too quickly. Please wait {{remaining}}s.',
        4002: 'Global rate limit reached. Please wait {{remaining}}s.',
        4003: 'Command is on cooldown. Wait {{remaining}}s.',
        
        // Execution
        5001: 'Error executing command: {{error}}',
        5002: 'Command execution timeout ({{timeout}}s)',
        5003: 'Command handler is not a function.',
        
        // System
        9001: 'Internal error processing command.',
        9002: 'Plugin for this command is not loaded: {{plugin}}',
        9003: 'Database error: {{error}}'
    }
};

/**
 * Error Factory Functions
 */
const ErrorFactory = {
    permissionDenied: () => new GCCEError(
        ERROR_CODES.ERR_PERMISSION_DENIED,
        'Permission denied'
    ),
    
    commandNotFound: () => new GCCEError(
        ERROR_CODES.ERR_COMMAND_NOT_FOUND,
        'Command not found'
    ),
    
    missingArgs: (syntax) => new GCCEError(
        ERROR_CODES.ERR_MISSING_ARGS,
        'Missing arguments',
        { syntax }
    ),
    
    cooldownActive: (remaining, type) => new GCCEError(
        ERROR_CODES.ERR_COOLDOWN_ACTIVE,
        'Command on cooldown',
        { remaining, type }
    ),
    
    rateLimitExceeded: (remaining, type = 'user') => new GCCEError(
        type === 'global' ? ERROR_CODES.ERR_RATE_LIMIT_GLOBAL : ERROR_CODES.ERR_RATE_LIMIT_USER,
        'Rate limit exceeded',
        { remaining, type }
    ),
    
    handlerFailed: (error) => new GCCEError(
        ERROR_CODES.ERR_HANDLER_FAILED,
        'Handler execution failed',
        { error: error.message }
    )
};

module.exports = {
    GCCEError,
    ERROR_CODES,
    ERROR_MESSAGES,
    ErrorFactory
};
```

#### Integration in CommandParser

```javascript
const { GCCEError, ErrorFactory } = require('./errors');

class CommandParser {
    async parse(message, context) {
        try {
            // ... existing code ...

            // Command not found - Use Error Factory
            if (!commandDef) {
                throw ErrorFactory.commandNotFound();
            }

            // Permission denied - Use Error Factory
            if (!hasPermission) {
                throw ErrorFactory.permissionDenied();
            }

            // Missing arguments - Use Error Factory
            if (args.length < commandDef.minArgs) {
                throw ErrorFactory.missingArgs(commandDef.syntax);
            }

            // Cooldown active - Use Error Factory
            const cooldownCheck = this.cooldownManager.checkCooldown(commandDef, context.userId, context.userRole);
            if (cooldownCheck.onCooldown) {
                throw ErrorFactory.cooldownActive(cooldownCheck.remaining, cooldownCheck.type);
            }

            // Execute command
            const result = await this.executeCommand(commandDef, parsed.args, context);
            return result;

        } catch (error) {
            // Handle GCCE Errors
            if (error instanceof GCCEError) {
                return {
                    success: false,
                    error: error.getFormattedMessage(context.locale || 'de'),
                    errorCode: error.code,
                    errorDetails: error.details,
                    displayOverlay: true
                };
            }
            
            // Handle unexpected errors
            this.logger.error(`[GCCE Parser] Unexpected error: ${error.message}`, error);
            return {
                success: false,
                error: 'An unexpected error occurred.',
                errorCode: ERROR_CODES.ERR_INTERNAL,
                displayOverlay: true
            };
        }
    }
}
```

---

### 5️⃣ P5: User Data Caching (3h)

#### Implementierung

**Datei:** `app/plugins/gcce/userDataCache.js` (NEU)

```javascript
/**
 * User Data Cache für GCCE
 * Reduziert DB-Queries um 80-90%
 */
class UserDataCache {
    constructor(options = {}) {
        this.ttl = options.ttl || 300000; // 5 min default
        this.maxSize = options.maxSize || 1000;
        
        // Map<userId, CacheEntry>
        this.cache = new Map();
        
        // Stats
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Get user data from cache
     */
    get(userId) {
        const entry = this.cache.get(userId);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        
        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(userId);
            this.stats.misses++;
            return null;
        }
        
        // Update access time (for LRU)
        entry.lastAccess = Date.now();
        this.stats.hits++;
        
        return entry.data;
    }

    /**
     * Set user data in cache
     */
    set(userId, data) {
        // Auto-cleanup if over size
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }
        
        this.cache.set(userId, {
            data,
            timestamp: Date.now(),
            lastAccess: Date.now()
        });
    }

    /**
     * Invalidate user data
     */
    invalidate(userId) {
        this.cache.delete(userId);
    }

    /**
     * Evict oldest entry (LRU)
     */
    evictOldest() {
        let oldestId = null;
        let oldestAccess = Infinity;
        
        for (const [userId, entry] of this.cache.entries()) {
            if (entry.lastAccess < oldestAccess) {
                oldestAccess = entry.lastAccess;
                oldestId = userId;
            }
        }
        
        if (oldestId) {
            this.cache.delete(oldestId);
            this.stats.evictions++;
        }
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        const expired = [];
        
        for (const [userId, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttl) {
                expired.push(userId);
            }
        }
        
        expired.forEach(id => this.cache.delete(id));
        this.stats.evictions += expired.length;
        
        return expired.length;
    }

    /**
     * Get cache stats
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 
            ? (this.stats.hits / total * 100).toFixed(2)
            : 0;
        
        return {
            ...this.stats,
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Clear cache
     */
    clear() {
        this.cache.clear();
    }
}

module.exports = UserDataCache;
```

#### Integration in GCCE Main

**Datei:** `app/plugins/gcce/index.js`

```javascript
const UserDataCache = require('./userDataCache');

class GlobalChatCommandEngine {
    async init() {
        // ... existing code ...

        // ✨ NEU: Initialize User Data Cache
        this.userCache = new UserDataCache({
            ttl: 300000,  // 5 minutes
            maxSize: 1000 // Max 1000 users
        });

        // ... existing code ...

        // Start cleanup timer (includes user cache now)
        this.startCleanupTimer();
    }

    /**
     * Handle chat message - Mit User Cache
     */
    async handleChatMessage(data) {
        try {
            if (!this.pluginConfig.enabled) return;

            const message = data.comment || data.message;
            if (!message || !this.parser.isCommand(message)) return;

            const userId = data.uniqueId || data.userId;
            const username = data.nickname || data.username || data.uniqueId;

            // ✨ NEU: Try to get user data from cache
            let userData = this.userCache.get(userId);
            
            if (!userData) {
                // Cache miss - fetch from DB
                userData = await this.fetchUserData(userId, username, data);
                
                // Cache for next time
                this.userCache.set(userId, userData);
            }

            // Build context with cached user data
            const context = {
                userId,
                username,
                userRole: this.permissionChecker.getUserRole(data),
                timestamp: Date.now(),
                rawData: data,
                userData // From cache!
            };

            // ... rest of existing code ...

        } catch (error) {
            this.api.log(`[GCCE] Error handling chat message: ${error.message}`, 'error');
        }
    }

    /**
     * Fetch user data from database
     */
    async fetchUserData(userId, username, tiktokData) {
        const userData = {
            isFollower: tiktokData.isFollower || false,
            isSubscriber: tiktokData.isSubscriber || tiktokData.teamMemberLevel > 0 || false,
            isModerator: tiktokData.isModerator || false,
            isBroadcaster: tiktokData.isBroadcaster || tiktokData.isHost || false,
            teamMemberLevel: tiktokData.teamMemberLevel || 0,
            giftsSent: tiktokData.giftsSent || 0,
            coinsSent: tiktokData.coinsSent || 0,
            dbUser: null
        };

        // Fetch from database if available
        if (this.api.getDatabase) {
            try {
                const db = this.api.getDatabase();
                const dbUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
                
                if (dbUser) {
                    userData.dbUser = dbUser;
                    userData.isFollower = dbUser.is_follower || userData.isFollower;
                    userData.teamMemberLevel = dbUser.team_member_level || userData.teamMemberLevel;
                    userData.giftsSent = dbUser.gifts_sent || userData.giftsSent;
                    userData.coinsSent = dbUser.coins_sent || userData.coinsSent;
                }
            } catch (dbError) {
                this.api.log(`[GCCE] Database lookup error: ${dbError.message}`, 'debug');
            }
        }

        return userData;
    }

    /**
     * Cleanup timer - jetzt mit User Cache
     */
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            // Cleanup rate limits
            this.parser.cleanupRateLimits();
            
            // ✨ NEU: Cleanup user cache
            const evicted = this.userCache.cleanup();
            if (evicted > 0) {
                this.api.log(`[GCCE] Cleaned up ${evicted} expired cache entries`, 'debug');
            }
        }, 60000); // Every minute
    }

    /**
     * API: Get cache stats
     */
    getCacheStats() {
        return {
            commandCache: this.registry.getCacheStats(),
            userCache: this.userCache.getStats()
        };
    }
}
```

#### Monitoring Route

Add to routes:

```javascript
// API: Get cache statistics
this.api.registerRoute('GET', '/api/gcce/cache-stats', async (req, res) => {
    res.json({
        success: true,
        stats: this.getCacheStats()
    });
});

// API: Clear caches
this.api.registerRoute('POST', '/api/gcce/cache-clear', async (req, res) => {
    this.registry.invalidateCache();
    this.userCache.clear();
    
    res.json({
        success: true,
        message: 'All caches cleared'
    });
});
```

---

## 🧪 TESTING STRATEGY

### Unit Tests

```javascript
// app/plugins/gcce/test/quick-wins.test.js
const CommandRegistry = require('../commandRegistry');
const CooldownManager = require('../cooldownManager');
const UserDataCache = require('../userDataCache');
const { GCCEError, ErrorFactory } = require('../errors');

describe('GCCE Quick Wins', () => {
    describe('Command Registry Caching', () => {
        // ... tests from P1 example ...
    });

    describe('Command Aliases', () => {
        test('Resolve alias to command', () => {
            const registry = new CommandRegistry(mockLogger);
            
            registry.registerCommand({
                pluginId: 'test',
                name: 'inventory',
                aliases: ['inv', 'bag'],
                handler: async () => {}
            });
            
            // Should resolve all variations
            expect(registry.getCommand('inventory')).toBeTruthy();
            expect(registry.getCommand('inv')).toBeTruthy();
            expect(registry.getCommand('bag')).toBeTruthy();
            
            // All should point to same command
            const cmd1 = registry.getCommand('inventory');
            const cmd2 = registry.getCommand('inv');
            expect(cmd1).toBe(cmd2);
        });
    });

    describe('Cooldown System', () => {
        test('Enforce per-user cooldown', async () => {
            const cooldownMgr = new CooldownManager(mockLogger);
            const commandDef = {
                name: 'test',
                cooldown: { perUser: 5000 }
            };
            
            // First execution - should pass
            let check = cooldownMgr.checkCooldown(commandDef, 'user1', 'all');
            expect(check.onCooldown).toBe(false);
            
            // Set cooldown
            cooldownMgr.setCooldown(commandDef, 'user1', 'all');
            
            // Second execution - should fail
            check = cooldownMgr.checkCooldown(commandDef, 'user1', 'all');
            expect(check.onCooldown).toBe(true);
            expect(check.remaining).toBeGreaterThan(0);
        });

        test('Role-based cooldown bypass', () => {
            const cooldownMgr = new CooldownManager(mockLogger);
            const commandDef = {
                name: 'test',
                cooldown: {
                    perRole: {
                        all: 10000,
                        moderator: 0 // No cooldown
                    }
                }
            };
            
            // Moderator should bypass
            cooldownMgr.setCooldown(commandDef, 'mod1', 'moderator');
            const check = cooldownMgr.checkCooldown(commandDef, 'mod1', 'moderator');
            expect(check.onCooldown).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('Localized error messages', () => {
            const error = ErrorFactory.permissionDenied();
            
            expect(error.getUserMessage('de')).toBe('Du hast keine Berechtigung für diesen Befehl.');
            expect(error.getUserMessage('en')).toBe('You do not have permission to use this command.');
        });

        test('Error with placeholder replacement', () => {
            const error = ErrorFactory.cooldownActive(15, 'user');
            
            const msg = error.getFormattedMessage('de');
            expect(msg).toContain('15');
        });
    });

    describe('User Data Caching', () => {
        test('Cache hit reduces DB queries', () => {
            const cache = new UserDataCache({ ttl: 60000 });
            const userData = { username: 'test', level: 5 };
            
            // Set in cache
            cache.set('user1', userData);
            
            // Get from cache
            const cached = cache.get('user1');
            expect(cached).toEqual(userData);
            
            // Check stats
            const stats = cache.getStats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(0);
        });

        test('LRU eviction when full', () => {
            const cache = new UserDataCache({ maxSize: 3 });
            
            cache.set('user1', { data: 1 });
            cache.set('user2', { data: 2 });
            cache.set('user3', { data: 3 });
            
            // This should evict user1 (oldest)
            cache.set('user4', { data: 4 });
            
            expect(cache.get('user1')).toBeNull();
            expect(cache.get('user4')).toBeTruthy();
        });
    });
});
```

### Integration Tests

```javascript
// app/plugins/gcce/test/integration.test.js
describe('GCCE Integration Tests', () => {
    let gcce;
    let mockApi;

    beforeEach(() => {
        mockApi = createMockAPI();
        gcce = new GlobalChatCommandEngine(mockApi);
        await gcce.init();
    });

    test('Full command execution flow with all features', async () => {
        // Register a command with all new features
        gcce.registerCommandsForPlugin('test', [{
            name: 'testcmd',
            aliases: ['tc', 'test'],
            cooldown: { perUser: 5000 },
            minArgs: 1,
            handler: async (args, context) => {
                return { success: true, message: 'OK' };
            }
        }]);

        // First execution via alias - should succeed
        const result1 = await gcce.parser.parse('/tc arg1', mockContext);
        expect(result1.success).toBe(true);

        // Second execution immediately - should fail (cooldown)
        const result2 = await gcce.parser.parse('/testcmd arg1', mockContext);
        expect(result2.success).toBe(false);
        expect(result2.errorCode).toBe(ERROR_CODES.ERR_COOLDOWN_ACTIVE);

        // Check cache was used
        const cacheStats = gcce.getCacheStats();
        expect(cacheStats.commandCache.hits).toBeGreaterThan(0);
    });
});
```

---

## 📈 PERFORMANCE BENCHMARKS

### Benchmark Suite

```javascript
// benchmark/gcce-performance.js
const Benchmark = require('benchmark');
const CommandRegistry = require('../app/plugins/gcce/commandRegistry');
const UserDataCache = require('../app/plugins/gcce/userDataCache');

const suite = new Benchmark.Suite;

// Setup
const registry = new CommandRegistry(mockLogger);
const cache = new UserDataCache();

for (let i = 0; i < 100; i++) {
    registry.registerCommand({
        pluginId: 'test',
        name: `cmd${i}`,
        handler: async () => {}
    });
}

// Benchmarks
suite
    .add('Command Lookup (with cache)', function() {
        registry.getCommand('cmd42');
    })
    .add('Command Lookup (without cache)', function() {
        registry.commands.get('cmd42');
    })
    .add('User Data Cache Hit', function() {
        cache.get('user123');
    })
    .add('User Data Cache Miss', function() {
        cache.get('unknown');
    })
    .on('cycle', function(event) {
        console.log(String(event.target));
    })
    .on('complete', function() {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
    .run({ 'async': true });
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Alle Tests grün
- [ ] Benchmarks durchgeführt
- [ ] Code Review abgeschlossen
- [ ] Dokumentation aktualisiert
- [ ] Changelog erstellt
- [ ] Migrations-Script vorbereitet (falls nötig)

### Deployment
- [ ] Feature Flag aktiviert (für gradual rollout)
- [ ] Monitoring Dashboards vorbereitet
- [ ] Rollback-Plan dokumentiert
- [ ] Backup der aktuellen Config

### Post-Deployment
- [ ] Monitoring auf Fehler
- [ ] Performance-Metriken checken
- [ ] User Feedback sammeln
- [ ] Bug-Reports triagen

---

## 📚 WEITERE RESSOURCEN

### Dokumentation
- [GCCE Massivanalyse](./GCCE_MASSIVANALYSE.md) - Vollständige Feature-Liste
- [GCCE README](./app/plugins/gcce/README.md) - Plugin-Dokumentation
- [Plugin API Guide](./app/docs/PLUGIN_API.md) - Plugin-Entwicklung

### Code-Beispiele
- [StreamAlchemy Integration](./app/plugins/streamalchemy/index.js)
- [Weather Control Integration](./app/plugins/weather-control/main.js)
- [Viewer XP Integration](./app/plugins/viewer-xp/main.js)

### Tools
- Jest für Testing
- Benchmark.js für Performance-Tests
- ESLint für Code-Qualität
- Winston für Logging

---

**Version:** 1.0  
**Erstellt am:** 2024-12-12  
**Status:** ✅ Bereit für Implementierung
