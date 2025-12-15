/**
 * Global Chat Command Engine (GCCE) - Main Plugin
 * 
 * Universal chat command interpreter and framework.
 * Provides command registration, parsing, validation, permission checking,
 * and execution routing for all plugins.
 */

const path = require('path');
const CommandRegistry = require('./commandRegistry');
const CommandParser = require('./commandParser');
const PermissionChecker = require('./permissionChecker');
const UserDataCache = require('./utils/UserDataCache');
const CommandMacroManager = require('./utils/CommandMacroManager');
const CommandHistoryManager = require('./utils/CommandHistoryManager');
const CommandScheduler = require('./utils/CommandScheduler');
const AdvancedPermissionSystem = require('./utils/AdvancedPermissionSystem');
const CommandCategoryManager = require('./utils/CommandCategoryManager');
const CommandAutoCompleteEngine = require('./utils/CommandAutoCompleteEngine');
const SocketEventBatcher = require('./utils/SocketEventBatcher');
const CommandTemplateManager = require('./utils/CommandTemplateManager');
const CommandPipelineManager = require('./utils/CommandPipelineManager');
const CommandAuditLog = require('./utils/CommandAuditLog');
const CommandParameterTypes = require('./utils/CommandParameterTypes');
const DashboardWidgets = require('./utils/DashboardWidgets');
const CommandHelpers = require('./utils/CommandHelpers');
const HUDManager = require('./utils/HUDManager');
const config = require('./config');

class GlobalChatCommandEngine {
    constructor(api) {
        this.api = api;
        this.pluginDir = api.pluginDir;
        
        // Core components
        this.registry = null;
        this.parser = null;
        this.permissionChecker = null;
        
        // P5: User Data Cache (80-90% fewer DB queries)
        this.userDataCache = null;
        
        // F5: Command Macro Manager
        this.macroManager = null;
        
        // F3: Command History Manager
        this.historyManager = null;
        
        // F7: Command Scheduler
        this.scheduler = null;
        
        // V1: Advanced Permission System
        this.advancedPermissions = null;
        
        // V3: Command Category Manager
        this.categoryManager = null;
        
        // F11: Auto-Complete Engine
        this.autoComplete = null;
        
        // Phase 3: Advanced Features
        // P4: Socket Event Batcher
        this.socketBatcher = null;
        
        // F6: Template Manager
        this.templateManager = null;
        
        // F9: Pipeline Manager
        this.pipelineManager = null;
        
        // V4: Audit Log
        this.auditLog = null;
        
        // F4: Parameter Types
        this.parameterTypes = null;
        
        // Phase 4: GUI & Useful Features
        // Dashboard Widgets
        this.dashboardWidgets = null;
        
        // Command Helpers
        this.commandHelpers = null;
        
        // HUD Manager (integrated from gcce-hud plugin)
        this.hudManager = null;
        
        // Plugin configuration
        this.pluginConfig = null;
        
        // Built-in commands
        this.builtInCommands = [];
    }

    /**
     * Initialize the GCCE plugin
     */
    async init() {
        this.api.log('🎯 [GCCE] Initializing Global Chat Command Engine...', 'info');

        try {
            // Load configuration
            await this.loadConfiguration();

            // Create logger wrapper for compatibility
            const logger = {
                info: (msg) => this.api.log(msg, 'info'),
                warn: (msg) => this.api.log(msg, 'warn'),
                error: (msg) => this.api.log(msg, 'error'),
                debug: (msg) => this.api.log(msg, 'debug')
            };

            // Initialize core components
            this.permissionChecker = new PermissionChecker(this.api);
            this.registry = new CommandRegistry(logger);
            this.parser = new CommandParser(this.registry, this.permissionChecker, this.api);
            
            // P5: Initialize User Data Cache
            this.userDataCache = new UserDataCache(300000, 1000); // 5 min TTL, max 1000 users
            
            // Phase 2: Game Changers
            this.macroManager = new CommandMacroManager(this.registry, this.parser);
            this.historyManager = new CommandHistoryManager(100);
            this.scheduler = new CommandScheduler(this.parser);
            this.advancedPermissions = new AdvancedPermissionSystem();
            this.categoryManager = new CommandCategoryManager();
            this.autoComplete = new CommandAutoCompleteEngine(this.registry);
            
            // Phase 3: Advanced Features
            this.socketBatcher = new SocketEventBatcher(this.api.getSocketIO(), 50);
            this.templateManager = new CommandTemplateManager();
            this.pipelineManager = new CommandPipelineManager(this.parser);
            this.auditLog = new CommandAuditLog(10000);
            this.parameterTypes = new CommandParameterTypes();
            
            // Phase 4: GUI & Useful Features
            this.dashboardWidgets = new DashboardWidgets(this.api);
            this.commandHelpers = new CommandHelpers(this.api, this.registry, this.parser);
            
            // HUD Manager (integrated from gcce-hud plugin)
            this.hudManager = new HUDManager(
                this.api,
                this.parser.rateLimiter,
                this.advancedPermissions,
                this.auditLog,
                this.userDataCache,
                this.socketBatcher
            );
            await this.hudManager.init();
            
            // Register default dashboard widgets
            this.registerDefaultWidgets();

            // Register built-in commands
            this.registerBuiltInCommands();

            // Register TikTok event handlers
            this.registerTikTokEvents();

            // Register routes
            this.registerRoutes();

            // Register Socket.io events
            this.registerSocketEvents();
            
            // Register Flow actions
            this.registerFlowActions();

            // Start cleanup timer
            this.startCleanupTimer();

            // Try to integrate with StreamAlchemy if it exists
            this.integrateWithStreamAlchemy();
            
            // Emit ready event for plugins that may be waiting
            this.api.emit('gcce:ready', { timestamp: Date.now() });

            this.api.log('✅ [GCCE] Global Chat Command Engine initialized successfully', 'info');
        } catch (error) {
            this.api.log(`❌ [GCCE] Initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Load plugin configuration
     */
    async loadConfiguration() {
        try {
            this.pluginConfig = await this.api.getConfig('gcce_config') || {};
            
            // Apply defaults
            this.pluginConfig = {
                enabled: true,
                enableBuiltInCommands: true,
                enableOverlayMessages: true,
                enableHelpCommand: true,
                commandPrefix: config.COMMAND_PREFIX,
                ...this.pluginConfig
            };

            await this.api.setConfig('gcce_config', this.pluginConfig);
        } catch (error) {
            this.api.log(`[GCCE] Config load error: ${error.message}`, 'error');
            this.pluginConfig = { enabled: true };
        }
    }

    /**
     * Register default dashboard widgets
     */
    registerDefaultWidgets() {
        // Command stats widget
        this.dashboardWidgets.registerWidget({
            id: 'command-stats',
            name: 'Command Statistics',
            type: 'stat',
            dataSource: async () => {
                return this.registry.getStats();
            },
            refreshInterval: 2000
        });

        // Recent executions widget
        this.dashboardWidgets.registerWidget({
            id: 'recent-executions',
            name: 'Recent Command Executions',
            type: 'list',
            dataSource: async () => {
                return this.auditLog.getRecentLogs(20);
            },
            refreshInterval: 1000
        });

        // Performance metrics widget
        this.dashboardWidgets.registerWidget({
            id: 'performance-metrics',
            name: 'Performance Metrics',
            type: 'chart',
            dataSource: async () => {
                const stats = this.registry.getStats();
                const cacheStats = this.userDataCache.getStats();
                const rateLimiterStats = this.parser.getRateLimiterStats();
                
                return {
                    cacheHitRate: cacheStats.hitRate,
                    commandExecutions: stats.totalExecuted,
                    failureRate: stats.totalFailed / (stats.totalExecuted || 1) * 100,
                    activeUsers: cacheStats.size
                };
            },
            refreshInterval: 3000
        });

        // Top commands widget
        this.dashboardWidgets.registerWidget({
            id: 'top-commands',
            name: 'Top Commands',
            type: 'table',
            dataSource: async () => {
                const stats = this.registry.getStats();
                return stats.topCommands || [];
            },
            refreshInterval: 5000
        });

        // Start auto-refresh
        this.dashboardWidgets.startAutoRefresh();
        
        this.api.log('[GCCE] Default dashboard widgets registered', 'debug');
    }

    /**
     * Register built-in commands
     */
    registerBuiltInCommands() {
        if (!this.pluginConfig.enableBuiltInCommands) {
            return;
        }

        // Help command
        if (this.pluginConfig.enableHelpCommand) {
            this.registry.registerCommand({
                pluginId: 'gcce',
                name: 'help',
                description: 'Show available commands or help for a specific command',
                syntax: '/help [command]',
                permission: 'all',
                enabled: true,
                minArgs: 0,
                maxArgs: 1,
                category: 'System',
                handler: async (args, context) => await this.handleHelpCommand(args, context)
            });
        }

        // Commands command - list all commands
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'commands',
            description: 'List all available commands',
            syntax: '/commands',
            permission: 'all',
            enabled: true,
            minArgs: 0,
            maxArgs: 0,
            category: 'System',
            handler: async (args, context) => await this.handleCommandsCommand(args, context)
        });

        // Test command - for debugging
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'cmdtest',
            description: 'Test a command with mock data (for developers)',
            syntax: '/cmdtest <command> [args...]',
            permission: 'moderator',
            enabled: true,
            minArgs: 1,
            maxArgs: 10,
            category: 'System',
            handler: async (args, context) => {
                const [commandName, ...testArgs] = args;
                const result = await this.commandHelpers.testCommand(commandName, testArgs, context);
                
                return {
                    success: result.success,
                    message: result.success 
                        ? `Test completed in ${result.executionTime}ms` 
                        : `Test failed: ${result.error}`,
                    data: result
                };
            }
        });

        // Alias command - create command alias
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'alias',
            description: 'Create an alias for a command',
            syntax: '/alias <alias> <command>',
            permission: 'moderator',
            enabled: true,
            minArgs: 2,
            maxArgs: 2,
            category: 'System',
            handler: async (args, context) => {
                const [alias, commandName] = args;
                const success = this.registry.registerAlias(alias, commandName);
                
                return {
                    success,
                    message: success 
                        ? `Alias '/${alias}' created for '/${commandName}'` 
                        : `Failed to create alias (command may not exist or alias already taken)`
                };
            }
        });

        // Stats command - show GCCE statistics
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'stats',
            description: 'Show GCCE system statistics',
            syntax: '/stats',
            permission: 'all',
            enabled: true,
            minArgs: 0,
            maxArgs: 0,
            category: 'Information',
            handler: async (args, context) => {
                const stats = this.registry.getStats();
                const cacheStats = this.userDataCache.getStats();
                
                return {
                    success: true,
                    message: `📊 GCCE Stats: ${stats.registeredCommands} commands | ${stats.totalExecuted} executed | ${cacheStats.hitRate}% cache hit rate`,
                    data: { stats, cacheStats }
                };
            }
        });

        // Suggest command - find similar commands
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'suggest',
            description: 'Find commands similar to your input',
            syntax: '/suggest <search>',
            permission: 'all',
            enabled: true,
            minArgs: 1,
            maxArgs: 1,
            category: 'Information',
            handler: async (args, context) => {
                const [search] = args;
                const similar = this.commandHelpers.findSimilarCommands(search, 3);
                
                if (similar.length === 0) {
                    return {
                        success: false,
                        message: `No commands found similar to '${search}'`
                    };
                }

                const suggestions = similar.slice(0, 5).map(s => `/${s.command}`).join(', ');
                
                return {
                    success: true,
                    message: `Did you mean: ${suggestions}?`,
                    data: { similar }
                };
            }
        });

        // HUD Commands (integrated from gcce-hud plugin)
        
        // /hudtext command
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'hudtext',
            description: 'Display text on HUD overlay',
            syntax: '/hudtext [duration] <text>',
            permission: this.hudManager.config.permissions.text,
            enabled: this.hudManager.config.chatCommands.allowText,
            minArgs: 1,
            category: 'HUD',
            handler: async (args, context) => await this.hudManager.handleTextCommand(args, context)
        });

        // /hudimage command
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'hudimage',
            description: 'Display image on HUD overlay',
            syntax: '/hudimage [duration] <url>',
            permission: this.hudManager.config.permissions.image,
            enabled: this.hudManager.config.chatCommands.allowImages,
            minArgs: 1,
            category: 'HUD',
            handler: async (args, context) => await this.hudManager.handleImageCommand(args, context)
        });

        // /hudmedia command (gif/mp4)
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'hudmedia',
            description: 'Display custom GIF/MP4 on HUD overlay',
            syntax: '/hudmedia [duration] <name|url>',
            permission: this.hudManager.config.permissions.media || this.hudManager.config.permissions.image,
            enabled: this.hudManager.config.chatCommands.allowMedia,
            minArgs: 1,
            category: 'HUD',
            handler: async (args, context) => await this.hudManager.handleMediaCommand(args, context)
        });

        // /hudclear command
        this.registry.registerCommand({
            pluginId: 'gcce',
            name: 'hudclear',
            description: 'Clear all HUD overlay elements',
            syntax: '/hudclear',
            permission: this.hudManager.config.permissions.clear,
            enabled: true,
            minArgs: 0,
            maxArgs: 0,
            category: 'HUD',
            handler: async (args, context) => await this.hudManager.handleClearCommand(args, context)
        });

        this.api.log('[GCCE] Built-in commands registered', 'debug');
    }

    /**
     * Register TikTok event handlers
     */
    registerTikTokEvents() {
        // Handle chat messages
        this.api.registerTikTokEvent('chat', async (data) => {
            await this.handleChatMessage(data);
        });

        this.api.log('[GCCE] TikTok events registered', 'debug');
    }

    /**
     * Register Express routes
     */
    registerRoutes() {
        // Serve UI HTML
        this.api.registerRoute('GET', '/gcce/ui', (req, res) => {
            try {
                res.sendFile(path.join(this.pluginDir, 'ui.html'));
            } catch (error) {
                this.api.log(`[GCCE] Error serving UI: ${error.message}`, 'error');
                res.status(500).send('Error loading UI');
            }
        });

        // Serve overlay HTML
        this.api.registerRoute('GET', '/gcce/overlay', (req, res) => {
            res.sendFile(path.join(this.pluginDir, 'overlay.html'));
        });

        // Serve CSS
        this.api.registerRoute('GET', '/gcce/style.css', (req, res) => {
            res.sendFile(path.join(this.pluginDir, 'style.css'));
        });

        // API: Get all registered commands
        this.api.registerRoute('GET', '/api/gcce/commands', async (req, res) => {
            const commands = this.registry.getAllCommands();
            res.json({
                success: true,
                commands: commands.map(cmd => ({
                    name: cmd.name,
                    description: cmd.description,
                    syntax: cmd.syntax,
                    permission: cmd.permission,
                    enabled: cmd.enabled,
                    plugin: cmd.pluginId,
                    category: cmd.category
                }))
            });
        });

        // API: Get commands for specific plugin
        this.api.registerRoute('GET', '/api/gcce/commands/:pluginId', async (req, res) => {
            const commands = this.registry.getPluginCommands(req.params.pluginId);
            res.json({
                success: true,
                pluginId: req.params.pluginId,
                commands
            });
        });

        // API: Get statistics
        this.api.registerRoute('GET', '/api/gcce/stats', async (req, res) => {
            const stats = this.registry.getStats();
            res.json({
                success: true,
                stats
            });
        });

        // API: Get enhanced statistics (includes all subsystems)
        this.api.registerRoute('GET', '/api/gcce/stats/enhanced', async (req, res) => {
            const enhancedStats = {
                registry: this.registry.getStats(),
                rateLimiter: this.parser.getRateLimiterStats(),
                cooldowns: this.parser.getCooldownStats(),
                userDataCache: this.userDataCache.getStats(),
                permissionMemoization: this.permissionChecker.getMemoizationStats()
            };
            
            res.json({
                success: true,
                stats: enhancedStats
            });
        });

        // API: Get cache statistics
        this.api.registerRoute('GET', '/api/gcce/cache/stats', async (req, res) => {
            res.json({
                success: true,
                cacheStats: {
                    commandCache: this.registry.getCacheStats(),
                    userDataCache: this.userDataCache.getStats(),
                    permissionCache: this.permissionChecker.getMemoizationStats()
                }
            });
        });

        // API: Invalidate command cache
        this.api.registerRoute('POST', '/api/gcce/cache/invalidate', async (req, res) => {
            const { type, key } = req.body;
            
            try {
                if (type === 'command') {
                    this.registry.invalidateCache(key);
                } else if (type === 'user') {
                    this.userDataCache.delete(key);
                } else if (type === 'permission') {
                    this.permissionChecker.invalidateCache(key);
                } else if (type === 'all') {
                    this.registry.invalidateCache();
                    this.userDataCache.clear();
                    this.permissionChecker.clearCache();
                }
                
                res.json({ success: true, type, key });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Set command cooldown
        this.api.registerRoute('POST', '/api/gcce/commands/:commandName/cooldown', async (req, res) => {
            const { commandName } = req.params;
            const { userCooldown, globalCooldown } = req.body;
            
            try {
                this.parser.setCommandCooldown(
                    commandName,
                    userCooldown || 0,
                    globalCooldown || 0
                );
                
                res.json({
                    success: true,
                    commandName,
                    userCooldown,
                    globalCooldown
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Register command alias
        this.api.registerRoute('POST', '/api/gcce/commands/:commandName/alias', async (req, res) => {
            const { commandName } = req.params;
            const { alias } = req.body;
            
            try {
                const success = this.registry.registerAlias(alias, commandName);
                res.json({
                    success,
                    commandName,
                    alias
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get command aliases
        this.api.registerRoute('GET', '/api/gcce/commands/:commandName/aliases', async (req, res) => {
            const { commandName } = req.params;
            const aliases = this.registry.getCommandAliases(commandName);
            
            res.json({
                success: true,
                commandName,
                aliases
            });
        });

        // API: Update command enabled status
        this.api.registerRoute('POST', '/api/gcce/commands/:commandName/toggle', async (req, res) => {
            const { commandName } = req.params;
            const { enabled } = req.body;
            
            const success = this.registry.setCommandEnabled(commandName, enabled);
            res.json({
                success,
                commandName,
                enabled
            });
        });

        // API: Get configuration
        this.api.registerRoute('GET', '/api/gcce/config', async (req, res) => {
            res.json({
                success: true,
                config: this.pluginConfig
            });
        });

        // API: Update configuration
        this.api.registerRoute('POST', '/api/gcce/config', async (req, res) => {
            try {
                this.pluginConfig = { ...this.pluginConfig, ...req.body };
                await this.api.setConfig('gcce_config', this.pluginConfig);
                
                res.json({
                    success: true,
                    config: this.pluginConfig
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ===== Phase 2: Game Changers API Endpoints =====

        // API: Execute macro
        this.api.registerRoute('POST', '/api/gcce/macros/:macroName/execute', async (req, res) => {
            const { macroName } = req.params;
            const context = req.body.context || {};
            
            try {
                const result = await this.macroManager.executeMacro(macroName, context);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Register macro
        this.api.registerRoute('POST', '/api/gcce/macros', async (req, res) => {
            try {
                const success = this.macroManager.registerMacro(req.body);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get all macros
        this.api.registerRoute('GET', '/api/gcce/macros', async (req, res) => {
            const macros = this.macroManager.getAllMacros();
            res.json({ success: true, macros });
        });

        // API: Get user command history
        this.api.registerRoute('GET', '/api/gcce/history/:userId', async (req, res) => {
            const { userId } = req.params;
            const limit = parseInt(req.query.limit) || 10;
            const history = this.historyManager.getUserHistory(userId, limit);
            res.json({ success: true, history });
        });

        // API: Get global command history
        this.api.registerRoute('GET', '/api/gcce/history', async (req, res) => {
            const limit = parseInt(req.query.limit) || 50;
            const history = this.historyManager.getGlobalHistory(limit);
            res.json({ success: true, history });
        });

        // API: Undo command
        this.api.registerRoute('POST', '/api/gcce/history/:userId/undo', async (req, res) => {
            const { userId } = req.params;
            try {
                const result = await this.historyManager.undo(userId);
                res.json({ success: true, ...result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Schedule command
        this.api.registerRoute('POST', '/api/gcce/scheduler/schedule', async (req, res) => {
            try {
                const scheduleId = this.scheduler.scheduleCommand(req.body);
                res.json({ success: true, scheduleId });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Cancel scheduled command
        this.api.registerRoute('DELETE', '/api/gcce/scheduler/:scheduleId', async (req, res) => {
            const { scheduleId } = req.params;
            const success = this.scheduler.cancelSchedule(parseInt(scheduleId));
            res.json({ success });
        });

        // API: Get all schedules
        this.api.registerRoute('GET', '/api/gcce/scheduler', async (req, res) => {
            const schedules = this.scheduler.getAllSchedules();
            res.json({ success: true, schedules });
        });

        // API: Define custom role
        this.api.registerRoute('POST', '/api/gcce/roles', async (req, res) => {
            try {
                const success = this.advancedPermissions.defineRole(req.body);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Assign role to user
        this.api.registerRoute('POST', '/api/gcce/roles/:roleName/assign', async (req, res) => {
            const { roleName } = req.params;
            const { userId } = req.body;
            const success = this.advancedPermissions.assignRole(userId, roleName);
            res.json({ success });
        });

        // API: Get all roles
        this.api.registerRoute('GET', '/api/gcce/roles', async (req, res) => {
            const roles = this.advancedPermissions.getAllRoles();
            res.json({ success: true, roles });
        });

        // API: Get command categories
        this.api.registerRoute('GET', '/api/gcce/categories', async (req, res) => {
            const categories = this.categoryManager.getAllCategories(true);
            res.json({ success: true, categories });
        });

        // API: Get commands by category
        this.api.registerRoute('GET', '/api/gcce/categories/:categoryId/commands', async (req, res) => {
            const { categoryId } = req.params;
            const allCommands = this.registry.getAllCommands();
            const commands = this.categoryManager.getCommandsByCategory(categoryId, allCommands);
            res.json({ success: true, commands });
        });

        // API: Get grouped commands
        this.api.registerRoute('GET', '/api/gcce/commands/grouped', async (req, res) => {
            const allCommands = this.registry.getAllCommands();
            const grouped = this.categoryManager.groupCommandsByCategory(allCommands);
            res.json({ success: true, grouped });
        });

        // API: Auto-complete suggestions
        this.api.registerRoute('POST', '/api/gcce/autocomplete', async (req, res) => {
            const { input, context, maxSuggestions } = req.body;
            const suggestions = this.autoComplete.getSuggestions(input, context, maxSuggestions);
            res.json({ success: true, suggestions });
        });

        // ===== Phase 3: Advanced Features API Endpoints =====

        // API: Apply command template
        this.api.registerRoute('POST', '/api/gcce/templates/:templateId/apply', async (req, res) => {
            const { templateId } = req.params;
            const { values } = req.body;
            const result = this.templateManager.applyTemplate(templateId, values);
            res.json(result);
        });

        // API: Create template
        this.api.registerRoute('POST', '/api/gcce/templates', async (req, res) => {
            try {
                const success = this.templateManager.createTemplate(req.body);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get all templates
        this.api.registerRoute('GET', '/api/gcce/templates', async (req, res) => {
            const category = req.query.category;
            const templates = this.templateManager.getAllTemplates(category);
            res.json({ success: true, templates });
        });

        // API: Execute pipeline
        this.api.registerRoute('POST', '/api/gcce/pipelines/execute', async (req, res) => {
            const { pipeline, context, initialData } = req.body;
            try {
                const result = await this.pipelineManager.executePipeline(pipeline, context, initialData);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Register pipeline
        this.api.registerRoute('POST', '/api/gcce/pipelines', async (req, res) => {
            try {
                const success = this.pipelineManager.registerPipeline(req.body);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get all pipelines
        this.api.registerRoute('GET', '/api/gcce/pipelines', async (req, res) => {
            const pipelines = this.pipelineManager.getAllPipelines();
            res.json({ success: true, pipelines });
        });

        // API: Query audit log
        this.api.registerRoute('POST', '/api/gcce/audit/query', async (req, res) => {
            const logs = this.auditLog.query(req.body);
            res.json({ success: true, logs });
        });

        // API: Get audit log for user
        this.api.registerRoute('GET', '/api/gcce/audit/user/:userId', async (req, res) => {
            const { userId } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            const logs = this.auditLog.getUserLogs(userId, limit);
            res.json({ success: true, logs });
        });

        // API: Get recent audit logs
        this.api.registerRoute('GET', '/api/gcce/audit/recent', async (req, res) => {
            const limit = parseInt(req.query.limit) || 100;
            const logs = this.auditLog.getRecentLogs(limit);
            res.json({ success: true, logs });
        });

        // API: Export audit log
        this.api.registerRoute('POST', '/api/gcce/audit/export', async (req, res) => {
            const data = this.auditLog.export(req.body);
            res.json({ success: true, data });
        });

        // API: Get socket batcher stats
        this.api.registerRoute('GET', '/api/gcce/socket/stats', async (req, res) => {
            const stats = this.socketBatcher.getStats();
            res.json({ success: true, stats });
        });

        // API: Validate parameter types
        this.api.registerRoute('POST', '/api/gcce/parameters/validate', async (req, res) => {
            const { args, paramDefs } = req.body;
            const result = this.parameterTypes.validateAndParse(args, paramDefs);
            res.json(result);
        });

        // API: Get parameter types
        this.api.registerRoute('GET', '/api/gcce/parameters/types', async (req, res) => {
            const types = this.parameterTypes.getAllTypes();
            res.json({ success: true, types });
        });

        // ===== Phase 4: GUI & Useful Features API Endpoints =====

        // API: Get all dashboard widgets
        this.api.registerRoute('GET', '/api/gcce/dashboard/widgets', async (req, res) => {
            const widgets = this.dashboardWidgets.getAllWidgets();
            res.json({ success: true, widgets });
        });

        // API: Get widget data
        this.api.registerRoute('GET', '/api/gcce/dashboard/widgets/:widgetId', async (req, res) => {
            const { widgetId } = req.params;
            const data = this.dashboardWidgets.getWidgetData(widgetId);
            
            if (data === null) {
                res.status(404).json({ success: false, error: 'Widget not found' });
            } else {
                res.json({ success: true, data });
            }
        });

        // API: Update widget data manually
        this.api.registerRoute('POST', '/api/gcce/dashboard/widgets/:widgetId/refresh', async (req, res) => {
            const { widgetId } = req.params;
            try {
                const data = await this.dashboardWidgets.updateWidget(widgetId);
                res.json({ success: true, data });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Test command
        this.api.registerRoute('POST', '/api/gcce/helpers/test', async (req, res) => {
            const { commandName, args, mockContext } = req.body;
            try {
                const result = await this.commandHelpers.testCommand(commandName, args, mockContext);
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Generate command documentation
        this.api.registerRoute('GET', '/api/gcce/helpers/docs/:commandName', async (req, res) => {
            const { commandName } = req.params;
            const docs = this.commandHelpers.generateDocs(commandName);
            
            if (docs === null) {
                res.status(404).json({ success: false, error: 'Command not found' });
            } else {
                res.json({ success: true, docs });
            }
        });

        // API: Find similar commands
        this.api.registerRoute('GET', '/api/gcce/helpers/similar/:input', async (req, res) => {
            const { input } = req.params;
            const maxDistance = parseInt(req.query.maxDistance) || 3;
            const similar = this.commandHelpers.findSimilarCommands(input, maxDistance);
            res.json({ success: true, similar });
        });

        // API: Validate command definition
        this.api.registerRoute('POST', '/api/gcce/helpers/validate', async (req, res) => {
            const validation = this.commandHelpers.validateCommandDefinition(req.body);
            res.json(validation);
        });

        // API: Bulk import commands
        this.api.registerRoute('POST', '/api/gcce/helpers/import', async (req, res) => {
            const { commands } = req.body;
            try {
                const result = this.commandHelpers.bulkImportCommands(commands);
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Export commands
        this.api.registerRoute('GET', '/api/gcce/helpers/export', async (req, res) => {
            const pluginId = req.query.pluginId || null;
            const commands = this.commandHelpers.exportCommands(pluginId);
            res.json({ success: true, commands, count: commands.length });
        });

        // API: Get command statistics
        this.api.registerRoute('GET', '/api/gcce/helpers/stats/:commandName', async (req, res) => {
            const { commandName } = req.params;
            const stats = this.commandHelpers.getCommandStats(commandName);
            
            if (stats === null) {
                res.status(404).json({ success: false, error: 'Command not found' });
            } else {
                res.json({ success: true, stats });
            }
        });

        // ===================
        // HUD Routes (integrated from gcce-hud plugin)
        // ===================
        
        // Serve HUD overlay
        this.api.registerRoute('get', '/plugins/gcce/overlay-hud', (req, res) => {
            const overlayPath = path.join(this.pluginDir, 'overlay-hud.html');
            res.sendFile(overlayPath);
        });

        // Get HUD configuration
        this.api.registerRoute('GET', '/api/gcce/hud/config', async (req, res) => {
            try {
                res.json({ success: true, config: this.hudManager.getConfig() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update HUD configuration
        this.api.registerRoute('POST', '/api/gcce/hud/config', async (req, res) => {
            try {
                const updatedConfig = await this.hudManager.updateConfig(req.body);
                res.json({ success: true, config: updatedConfig });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get active HUD elements
        this.api.registerRoute('GET', '/api/gcce/hud/elements', async (req, res) => {
            try {
                res.json({
                    success: true,
                    elements: this.hudManager.getActiveElements()
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Remove specific HUD element
        this.api.registerRoute('DELETE', '/api/gcce/hud/elements/:elementId', async (req, res) => {
            try {
                const { elementId } = req.params;
                const removed = this.hudManager.removeElement(elementId);
                res.json({ success: removed });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear all HUD elements
        this.api.registerRoute('POST', '/api/gcce/hud/clear', async (req, res) => {
            try {
                this.hudManager.clearAllElements();
                res.json({ success: true, message: 'All HUD elements cleared' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test text display
        this.api.registerRoute('POST', '/api/gcce/hud/test/text', async (req, res) => {
            try {
                const { text, duration } = req.body;
                const context = { userId: 'test-user', username: 'Test User' };
                const result = await this.hudManager.handleTextCommand(
                    [duration || '5', text || 'Test Text'],
                    context
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test image display
        this.api.registerRoute('POST', '/api/gcce/hud/test/image', async (req, res) => {
            try {
                const { url, duration } = req.body;
                const context = { userId: 'test-user', username: 'Test User' };
                const result = await this.hudManager.handleImageCommand(
                    [duration || '5', url || ''],
                    context
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test media display
        this.api.registerRoute('POST', '/api/gcce/hud/test/media', async (req, res) => {
            try {
                const { url, duration } = req.body;
                const context = { userId: 'test-user', username: 'Test User' };
                const result = await this.hudManager.handleMediaCommand(
                    [duration || '8', url || ''],
                    context
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Media library
        this.api.registerRoute('GET', '/api/gcce/hud/media', async (req, res) => {
            try {
                res.json({ success: true, media: this.hudManager.getMediaLibrary() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('POST', '/api/gcce/hud/media', async (req, res) => {
            try {
                const media = await this.hudManager.updateMediaLibrary(req.body.media || []);
                res.json({ success: true, media });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Gift rotator config
        this.api.registerRoute('GET', '/api/gcce/hud/rotator', async (req, res) => {
            try {
                res.json({ success: true, rotator: this.hudManager.getGiftRotator() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('POST', '/api/gcce/hud/rotator', async (req, res) => {
            try {
                const rotator = await this.hudManager.updateGiftRotator(req.body.rotator || req.body || {});
                const emitter = this.socketBatcher || this.api.getSocketIO();
                if (emitter && emitter.emit) {
                    emitter.emit('gcce:hud:rotator:update', rotator);
                }
                res.json({ success: true, rotator });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get HUD statistics
        this.api.registerRoute('GET', '/api/gcce/hud/stats', async (req, res) => {
            try {
                res.json({ success: true, stats: this.hudManager.getStats() });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('[GCCE] Routes registered', 'debug');
    }

    /**
     * Register Socket.io events
     */
    registerSocketEvents() {
        // Client can request command list
        this.api.registerSocket('gcce:get_commands', async (socket, data) => {
            try {
                const commands = this.registry.getAllCommands(data.filters || {});
                socket.emit('gcce:commands', { commands });
            } catch (error) {
                socket.emit('gcce:error', { error: error.message });
            }
        });

        this.api.log('[GCCE] Socket events registered', 'debug');
    }

    /**
     * Handle incoming chat messages
     * @param {Object} data - Chat message data from TikTok
     */
    async handleChatMessage(data) {
        try {
            if (!this.pluginConfig.enabled) return;

            const message = data.comment || data.message;
            if (!message) return;

            // Check if it's a command
            if (!this.parser.isCommand(message)) return;

            // Build enriched context with user data
            const context = {
                userId: data.uniqueId || data.userId,
                username: data.nickname || data.username || data.uniqueId,
                userRole: this.permissionChecker.getUserRole(data),
                timestamp: Date.now(),
                rawData: data,
                // Enriched user data (extracted once, reused by all plugins)
                userData: {
                    isFollower: data.isFollower || false,
                    isSubscriber: data.isSubscriber || data.teamMemberLevel > 0 || false,
                    isModerator: data.isModerator || false,
                    isBroadcaster: data.isBroadcaster || data.isHost || false,
                    teamMemberLevel: data.teamMemberLevel || 0,
                    giftsSent: data.giftsSent || 0,
                    coinsSent: data.coinsSent || 0,
                    // Database lookup will be cached
                    dbUser: null
                }
            };

            // P5: Check user data cache first
            let cachedUserData = this.userDataCache.get(context.username);
            
            if (cachedUserData) {
                // Use cached data
                context.userData.dbUser = cachedUserData.dbUser;
                context.userData.isFollower = cachedUserData.isFollower || context.userData.isFollower;
                context.userData.teamMemberLevel = cachedUserData.teamMemberLevel || context.userData.teamMemberLevel;
                context.userData.giftsSent = cachedUserData.giftsSent || context.userData.giftsSent;
                context.userData.coinsSent = cachedUserData.coinsSent || context.userData.coinsSent;
            } else {
                // Optional: Fetch user from database (cached to avoid repeated queries)
                if (this.api.getDatabase) {
                    try {
                        const db = this.api.getDatabase();
                        const dbUser = db.prepare('SELECT * FROM users WHERE username = ?').get(context.username);
                        if (dbUser) {
                            context.userData.dbUser = dbUser;
                            // Override with database values if available
                            context.userData.isFollower = dbUser.is_follower || context.userData.isFollower;
                            context.userData.teamMemberLevel = dbUser.team_member_level || context.userData.teamMemberLevel;
                            context.userData.giftsSent = dbUser.gifts_sent || context.userData.giftsSent;
                            context.userData.coinsSent = dbUser.coins_sent || context.userData.coinsSent;
                        }
                        
                        // Cache the user data
                        this.userDataCache.set(context.username, context.userData);
                    } catch (dbError) {
                        this.api.log(`[GCCE] Database lookup error: ${dbError.message}`, 'debug');
                        // Continue without DB data - not critical
                    }
                }
            }

            // Broadcast command input to overlay
            if (this.pluginConfig.enableOverlayMessages) {
                this.broadcastCommandInput(message, context);
            }

            // Parse and execute
            const startTime = Date.now();
            const result = await this.parser.parse(message, context);
            const executionTime = Date.now() - startTime;

            // Handle result
            if (result.isCommand === false) return;

            // V4: Log to audit log
            this.auditLog.log({
                userId: context.userId,
                username: context.username,
                command: result.commandName || 'unknown',
                args: result.args || [],
                success: result.success,
                error: result.error || null,
                result: result.data || null,
                executionTime,
                metadata: {
                    userRole: context.userRole,
                    timestamp: context.timestamp
                }
            });

            // F3: Record command in history (if successful)
            if (result.success && result.commandName) {
                this.historyManager.recordCommand(
                    {
                        name: result.commandName,
                        args: result.args || [],
                        undoable: false // Can be set per command
                    },
                    context,
                    result
                );

                // F11: Track usage for autocomplete
                this.autoComplete.recordUsage(result.commandName, context.userId);
            }

            // Broadcast result to overlay if needed (using batch)
            if (result.displayOverlay && this.pluginConfig.enableOverlayMessages) {
                this.socketBatcher.emit('gcce:command_result', {
                    success: result.success,
                    error: result.error,
                    message: result.message,
                    data: result.data,
                    username: context.username,
                    timestamp: context.timestamp
                });
            }

            this.api.log(`[GCCE] Command executed: ${message} by ${context.username} - ${result.success ? 'SUCCESS' : 'FAILED'}`, 'debug');

        } catch (error) {
            this.api.log(`[GCCE] Error handling chat message: ${error.message}`, 'error');
        }
    }

    /**
     * Broadcast command input to overlay
     * @param {string} command - The command that was typed
     * @param {Object} context - Execution context
     */
    broadcastCommandInput(command, context) {
        this.api.emit('gcce:command_input', {
            command: command,
            username: context.username,
            timestamp: context.timestamp
        });
    }

    /**
     * Broadcast command result to overlay
     * @param {Object} result - Command execution result
     * @param {Object} context - Execution context
     */
    broadcastCommandResult(result, context) {
        this.api.emit('gcce:command_result', {
            success: result.success,
            error: result.error,
            message: result.message,
            data: result.data,
            username: context.username,
            timestamp: context.timestamp
        });
    }

    /**
     * Handle /help command
     * @param {Array} args - Command arguments
     * @param {Object} context - Execution context
     * @returns {Object} Command result
     */
    async handleHelpCommand(args, context) {
        if (args.length === 0) {
            // Show general help
            const commands = this.registry.getAllCommands({ enabled: true });
            
            // Group by category
            const categories = {};
            for (const cmd of commands) {
                if (!categories[cmd.category]) {
                    categories[cmd.category] = [];
                }
                categories[cmd.category].push(cmd);
            }

            return {
                success: true,
                displayOverlay: true,
                data: {
                    type: 'help_list',
                    categories,
                    totalCommands: commands.length
                },
                message: `Available commands: ${commands.length}. Use /help <command> for details.`
            };
        } else {
            // Show help for specific command
            const commandName = args[0].toLowerCase();
            const command = this.registry.getCommand(commandName);

            if (!command) {
                return {
                    success: false,
                    error: `Command '/${commandName}' not found.`,
                    displayOverlay: true
                };
            }

            return {
                success: true,
                displayOverlay: true,
                data: {
                    type: 'help_detail',
                    command
                },
                message: `Help for /${command.name}: ${command.description}\nSyntax: ${command.syntax}`
            };
        }
    }

    /**
     * Handle /commands command
     * @param {Array} args - Command arguments
     * @param {Object} context - Execution context
     * @returns {Object} Command result
     */
    async handleCommandsCommand(args, context) {
        const commands = this.registry.getAllCommands({ enabled: true });
        
        const commandList = commands.map(cmd => `/${cmd.name}`).join(', ');

        return {
            success: true,
            displayOverlay: true,
            data: {
                type: 'command_list',
                commands
            },
            message: `Available commands (${commands.length}): ${commandList}`
        };
    }

    /**
     * Register Flow actions for automation
     */
    registerFlowActions() {
        // Execute command action
        this.api.registerFlowAction('gcce.execute_command', async (params) => {
            const { command, username = 'system', userId = 'flow-system' } = params;
            
            if (!command) {
                return { success: false, error: 'Command is required' };
            }
            
            const context = {
                username,
                userId,
                uniqueId: userId,
                profilePictureUrl: '',
                timestamp: new Date().toISOString(),
                isGift: false,
                isModerator: true,
                source: 'flow'
            };
            
            const result = await this.parser.parseAndExecute(command, context);
            return { success: result.success, message: result.message, data: result.data };
        });
        
        // Register macro action
        this.api.registerFlowAction('gcce.execute_macro', async (params) => {
            const { macroName, username = 'system', userId = 'flow-system' } = params;
            
            if (!macroName) {
                return { success: false, error: 'Macro name is required' };
            }
            
            const context = {
                username,
                userId,
                uniqueId: userId,
                timestamp: new Date().toISOString(),
                source: 'flow'
            };
            
            const result = await this.macroManager.executeMacro(macroName, context);
            return { success: result.success, message: result.message };
        });
        
        // Enable/disable command action
        this.api.registerFlowAction('gcce.toggle_command', async (params) => {
            const { commandName, enabled } = params;
            
            if (!commandName) {
                return { success: false, error: 'Command name is required' };
            }
            
            const command = this.registry.getCommand(commandName);
            if (!command) {
                return { success: false, error: 'Command not found' };
            }
            
            command.enabled = enabled !== undefined ? enabled : !command.enabled;
            return { success: true, commandName, enabled: command.enabled };
        });

        this.api.log('✅ [GCCE] Flow actions registered', 'info');

        // Register IFTTT actions for visual flow editor (if IFTTT engine is available)
        if (this.api.iftttEngine) {
            this.registerIFTTTActions();
        } else {
            this.api.log('[GCCE] IFTTT engine not available, skipping IFTTT action registration', 'debug');
        }
    }

    /**
     * Register IFTTT actions for the visual flow editor
     */
    registerIFTTTActions() {
        // Execute Command Action
        this.api.registerIFTTTAction('gcce:execute_command', {
            name: 'Execute GCCE Command',
            description: 'Execute a chat command programmatically',
            category: 'gcce',
            icon: 'terminal',
            fields: [
                { name: 'command', label: 'Command', type: 'text', required: true, placeholder: '/help' },
                { name: 'username', label: 'Username (optional)', type: 'text', required: false, placeholder: 'system' },
                { name: 'userId', label: 'User ID (optional)', type: 'text', required: false, placeholder: 'flow-system' }
            ],
            executor: async (action, context, services) => {
                const command = action.command;
                const username = action.username || 'system';
                const userId = action.userId || 'flow-system';
                
                if (!command) {
                    throw new Error('Command is required');
                }
                
                const cmdContext = {
                    username,
                    userId,
                    uniqueId: userId,
                    profilePictureUrl: '',
                    timestamp: new Date().toISOString(),
                    isGift: false,
                    isModerator: true,
                    source: 'ifttt'
                };
                
                const result = await this.parser.parseAndExecute(command, cmdContext);
                services.logger?.info(`🎯 GCCE: Executed command: ${command}`);
                
                return { success: result.success, message: result.message, data: result.data };
            }
        });

        // Execute Macro Action
        this.api.registerIFTTTAction('gcce:execute_macro', {
            name: 'Execute GCCE Macro',
            description: 'Execute a pre-defined command macro',
            category: 'gcce',
            icon: 'list',
            fields: [
                { name: 'macroName', label: 'Macro Name', type: 'text', required: true },
                { name: 'username', label: 'Username (optional)', type: 'text', required: false, placeholder: 'system' },
                { name: 'userId', label: 'User ID (optional)', type: 'text', required: false, placeholder: 'flow-system' }
            ],
            executor: async (action, context, services) => {
                const macroName = action.macroName;
                const username = action.username || 'system';
                const userId = action.userId || 'flow-system';
                
                if (!macroName) {
                    throw new Error('Macro name is required');
                }
                
                const cmdContext = {
                    username,
                    userId,
                    uniqueId: userId,
                    timestamp: new Date().toISOString(),
                    source: 'ifttt'
                };
                
                const result = await this.macroManager.executeMacro(macroName, cmdContext);
                services.logger?.info(`🎯 GCCE: Executed macro: ${macroName}`);
                
                return { success: result.success, message: result.message };
            }
        });

        // Toggle Command Action
        this.api.registerIFTTTAction('gcce:toggle_command', {
            name: 'Enable/Disable Command',
            description: 'Enable or disable a specific command',
            category: 'gcce',
            icon: 'toggle-on',
            fields: [
                { name: 'commandName', label: 'Command Name', type: 'text', required: true },
                { name: 'enabled', label: 'Enabled', type: 'boolean', required: true, default: true }
            ],
            executor: async (action, context, services) => {
                const commandName = action.commandName;
                const enabled = action.enabled;
                
                if (!commandName) {
                    throw new Error('Command name is required');
                }
                
                const command = this.registry.getCommand(commandName);
                if (!command) {
                    throw new Error('Command not found');
                }
                
                command.enabled = enabled;
                services.logger?.info(`🎯 GCCE: ${enabled ? 'Enabled' : 'Disabled'} command: ${commandName}`);
                
                return { success: true, commandName, enabled };
            }
        });

        // Show HUD Text Action
        this.api.registerIFTTTAction('gcce:show_hud_text', {
            name: 'Show HUD Text',
            description: 'Display text on the HUD overlay',
            category: 'gcce',
            icon: 'font',
            fields: [
                { name: 'text', label: 'Text', type: 'text', required: true },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', required: false, default: 10, min: 3, max: 60 },
                { name: 'username', label: 'Username (optional)', type: 'text', required: false, placeholder: 'system' }
            ],
            executor: async (action, context, services) => {
                const text = action.text;
                const duration = action.duration || 10;
                const username = action.username || 'system';
                
                if (!text) {
                    throw new Error('Text is required');
                }
                
                this.hudManager.showText(username, text, duration);
                services.logger?.info(`🎯 GCCE: Displayed HUD text: ${text}`);
                
                return { success: true, text, duration };
            }
        });

        // Show HUD Image Action
        this.api.registerIFTTTAction('gcce:show_hud_image', {
            name: 'Show HUD Image',
            description: 'Display an image on the HUD overlay',
            category: 'gcce',
            icon: 'image',
            fields: [
                { name: 'imageUrl', label: 'Image URL', type: 'text', required: true },
                { name: 'duration', label: 'Duration (seconds)', type: 'number', required: false, default: 10, min: 3, max: 60 },
                { name: 'username', label: 'Username (optional)', type: 'text', required: false, placeholder: 'system' }
            ],
            executor: async (action, context, services) => {
                const imageUrl = action.imageUrl;
                const duration = action.duration || 10;
                const username = action.username || 'system';
                
                if (!imageUrl) {
                    throw new Error('Image URL is required');
                }
                
                this.hudManager.showImage(username, imageUrl, duration);
                services.logger?.info(`🎯 GCCE: Displayed HUD image: ${imageUrl}`);
                
                return { success: true, imageUrl, duration };
            }
        });

        this.api.log('✅ [GCCE] IFTTT actions registered', 'info');
    }

    /**
     * Integrate with StreamAlchemy plugin
     */
    integrateWithStreamAlchemy() {
        // This is called during init - StreamAlchemy will register its own commands
        // when it initializes via the public API method registerCommandsForPlugin
        this.api.log('[GCCE] Ready to integrate with StreamAlchemy and other plugins', 'debug');
    }

    /**
     * Public API: Register commands for a plugin
     * This method is called by other plugins to register their commands
     * @param {string} pluginId - Plugin ID
     * @param {Array} commands - Array of command definitions
     * @returns {Object} Registration result
     */
    registerCommandsForPlugin(pluginId, commands) {
        const results = {
            pluginId,
            registered: [],
            failed: []
        };

        for (const commandDef of commands) {
            const success = this.registry.registerCommand({
                ...commandDef,
                pluginId
            });

            if (success) {
                results.registered.push(commandDef.name);
            } else {
                results.failed.push(commandDef.name);
            }
        }

        this.api.log(`[GCCE] Plugin ${pluginId} registered ${results.registered.length} commands`, 'info');
        return results;
    }

    /**
     * Public API: Unregister commands for a plugin
     * @param {string} pluginId - Plugin ID
     */
    unregisterCommandsForPlugin(pluginId) {
        this.registry.unregisterPluginCommands(pluginId);
    }

    /**
     * Start periodic cleanup timer
     */
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.parser.cleanupRateLimits();
        }, 60000); // Every minute

        this.api.log('[GCCE] Cleanup timer started', 'debug');
    }

    /**
     * Clean up plugin resources
     */
    async destroy() {
        this.api.log('[GCCE] Shutting down Global Chat Command Engine...', 'info');

        // Stop cleanup timer
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Cleanup HUD Manager
        if (this.hudManager) {
            await this.hudManager.destroy();
        }

        // Stop dashboard widgets
        if (this.dashboardWidgets) {
            this.dashboardWidgets.stopAutoRefresh();
        }

        // Clear registry
        if (this.registry) {
            this.registry.clear();
        }

        this.api.log('[GCCE] Global Chat Command Engine shut down successfully', 'info');
    }
}

module.exports = GlobalChatCommandEngine;
