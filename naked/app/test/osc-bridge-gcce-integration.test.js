/**
 * Test for OSC-Bridge GCCE Integration
 * 
 * Tests the integration between OSC-Bridge plugin and GCCE
 */

const OSCBridgePlugin = require('../plugins/osc-bridge/main.js');

describe('OSC-Bridge GCCE Integration', () => {
    let oscBridgePlugin;
    let mockApi;
    let mockGcceInstance;
    let mockLogger;

    beforeEach(() => {
        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        // Mock API
        mockApi = {
            logger: mockLogger,
            log: jest.fn(),
            emit: jest.fn(),
            getConfig: jest.fn().mockResolvedValue(null),
            setConfig: jest.fn().mockResolvedValue(true),
            registerRoute: jest.fn(),
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            getPluginDir: jest.fn().mockReturnValue('/path/to/plugin'),
            getDatabase: jest.fn().mockReturnValue({
                prepare: jest.fn().mockReturnValue({
                    get: jest.fn(),
                    all: jest.fn()
                })
            }),
            pluginLoader: {
                loadedPlugins: new Map()
            }
        };

        // Mock GCCE instance
        mockGcceInstance = {
            registerCommandsForPlugin: jest.fn().mockReturnValue({
                registered: ['wave', 'celebrate', 'dance', 'hearts', 'confetti', 'emote'],
                failed: []
            }),
            unregisterCommandsForPlugin: jest.fn()
        };
    });

    describe('GCCE Command Registration', () => {
        test('should register commands when GCCE is available and chat commands enabled', async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin

            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            // Mock config with chat commands enabled
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();

            // Verify GCCE commands were registered
            expect(mockGcceInstance.registerCommandsForPlugin).toHaveBeenCalledWith(
                'osc-bridge',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'wave', permission: 'all' }),
                    expect.objectContaining({ name: 'celebrate', permission: 'all' }),
                    expect.objectContaining({ name: 'dance', permission: 'subscriber' }),
                    expect.objectContaining({ name: 'hearts', permission: 'all' }),
                    expect.objectContaining({ name: 'confetti', permission: 'all' }),
                    expect.objectContaining({ name: 'emote', permission: 'subscriber', minArgs: 1, maxArgs: 1 })
                ])
            );

            // Verify all commands have category 'VRChat'
            const registerCall = mockGcceInstance.registerCommandsForPlugin.mock.calls[0];
            const commands = registerCall[1];
            commands.forEach(cmd => {
                expect(cmd.category).toBe('VRChat');
            });
        });

        test('should not register commands when chat commands disabled', async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin

            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            // Mock config with chat commands disabled
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: false }
            });

            await oscBridgePlugin.init();

            // Verify GCCE commands were NOT registered
            expect(mockGcceInstance.registerCommandsForPlugin).not.toHaveBeenCalled();
        });

        test('should not register commands when GCCE not available', async () => {
            // Don't set up GCCE plugin (not available)
            
            // Load plugin

            oscBridgePlugin = new OSCBridgePlugin(mockApi);

            // Mock config with chat commands enabled
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();

            // Should not throw error, just log debug message
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('GCCE plugin not available')
            );
        });
    });

    describe('Command Handlers', () => {
        beforeEach(async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin

            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            // Mock config with chat commands enabled
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { 
                    enabled: true,
                    requireOSCConnection: true 
                }
            });

            await oscBridgePlugin.init();

            // Mock OSC methods
            oscBridgePlugin.wave = jest.fn();
            oscBridgePlugin.celebrate = jest.fn();
            oscBridgePlugin.dance = jest.fn();
            oscBridgePlugin.hearts = jest.fn();
            oscBridgePlugin.confetti = jest.fn();
            oscBridgePlugin.triggerEmote = jest.fn();
        });

        test('handleWaveCommand should trigger wave when OSC is running', async () => {
            oscBridgePlugin.isRunning = true;
            
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleWaveCommand(context);

            expect(oscBridgePlugin.wave).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.message).toContain('Wave');
        });

        test('handleWaveCommand should fail when OSC is not running and connection required', async () => {
            oscBridgePlugin.isRunning = false;
            
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleWaveCommand(context);

            expect(oscBridgePlugin.wave).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.error).toBe('OSC-Bridge is not connected');
        });

        test('handleCelebrateCommand should trigger celebrate when OSC is running', async () => {
            oscBridgePlugin.isRunning = true;
            
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleCelebrateCommand(context);

            expect(oscBridgePlugin.celebrate).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.message).toContain('Celebrate');
        });

        test('handleDanceCommand should trigger dance when OSC is running', async () => {
            oscBridgePlugin.isRunning = true;
            
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleDanceCommand(context);

            expect(oscBridgePlugin.dance).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.message).toContain('Dance');
        });

        test('handleHeartsCommand should trigger hearts when OSC is running', async () => {
            oscBridgePlugin.isRunning = true;
            
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleHeartsCommand(context);

            expect(oscBridgePlugin.hearts).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.message).toContain('Hearts');
        });

        test('handleConfettiCommand should trigger confetti when OSC is running', async () => {
            oscBridgePlugin.isRunning = true;
            
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleConfettiCommand(context);

            expect(oscBridgePlugin.confetti).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.message).toContain('Confetti');
        });

        test('handleEmoteCommand should trigger emote with valid slot', async () => {
            oscBridgePlugin.isRunning = true;
            
            const args = ['3'];
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleEmoteCommand(args, context);

            expect(oscBridgePlugin.triggerEmote).toHaveBeenCalledWith(3);
            expect(result.success).toBe(true);
            expect(result.message).toContain('Emote slot 3');
        });

        test('handleEmoteCommand should fail with invalid slot number', async () => {
            oscBridgePlugin.isRunning = true;
            
            const args = ['10']; // Invalid slot (0-7 only)
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleEmoteCommand(args, context);

            expect(oscBridgePlugin.triggerEmote).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid emote slot');
        });

        test('handleEmoteCommand should fail with non-numeric slot', async () => {
            oscBridgePlugin.isRunning = true;
            
            const args = ['abc']; // Non-numeric
            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleEmoteCommand(args, context);

            expect(oscBridgePlugin.triggerEmote).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid emote slot');
        });
    });

    describe('Permission and Rate Limiting', () => {
        test('wave command should have "all" permission', async () => {
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });


            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();

            const registerCall = mockGcceInstance.registerCommandsForPlugin.mock.calls[0];
            const commands = registerCall[1];
            const waveCommand = commands.find(cmd => cmd.name === 'wave');
            
            expect(waveCommand.permission).toBe('all');
        });

        test('dance command should have "subscriber" permission', async () => {
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });


            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();

            const registerCall = mockGcceInstance.registerCommandsForPlugin.mock.calls[0];
            const commands = registerCall[1];
            const danceCommand = commands.find(cmd => cmd.name === 'dance');
            
            expect(danceCommand.permission).toBe('subscriber');
        });

        test('emote command should have "subscriber" permission', async () => {
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });


            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();

            const registerCall = mockGcceInstance.registerCommandsForPlugin.mock.calls[0];
            const commands = registerCall[1];
            const emoteCommand = commands.find(cmd => cmd.name === 'emote');
            
            expect(emoteCommand.permission).toBe('subscriber');
        });
    });

    describe('Plugin Cleanup', () => {
        test('should unregister commands on destroy when GCCE available', async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin

            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();
            
            // Mock stop method
            oscBridgePlugin.stop = jest.fn().mockResolvedValue(true);
            oscBridgePlugin.isRunning = false;

            // Destroy plugin
            await oscBridgePlugin.destroy();

            // Verify commands were unregistered
            expect(mockGcceInstance.unregisterCommandsForPlugin).toHaveBeenCalledWith('osc-bridge');
        });

        test('should handle destroy gracefully when GCCE not available', async () => {
            // Don't set up GCCE plugin
            

            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { enabled: true }
            });

            await oscBridgePlugin.init();

            // Mock stop method
            oscBridgePlugin.stop = jest.fn().mockResolvedValue(true);
            oscBridgePlugin.isRunning = false;

            // Should not throw error when GCCE not available
            await expect(oscBridgePlugin.destroy()).resolves.not.toThrow();
        });
    });

    describe('Configuration', () => {
        test('should use default chat commands config', async () => {

            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            const defaultConfig = oscBridgePlugin.getDefaultConfig();
            
            expect(defaultConfig.chatCommands).toBeDefined();
            expect(defaultConfig.chatCommands.enabled).toBe(true);
            expect(defaultConfig.chatCommands.requireOSCConnection).toBe(true);
            expect(defaultConfig.chatCommands.cooldownSeconds).toBe(3);
            expect(defaultConfig.chatCommands.rateLimitPerMinute).toBe(10);
        });

        test('should allow OSC actions when requireOSCConnection is false', async () => {
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });


            oscBridgePlugin = new OSCBridgePlugin(mockApi);
            
            mockApi.getConfig.mockResolvedValueOnce({
                enabled: true,
                chatCommands: { 
                    enabled: true,
                    requireOSCConnection: false 
                }
            });

            await oscBridgePlugin.init();

            // Mock OSC methods
            oscBridgePlugin.wave = jest.fn();
            oscBridgePlugin.isRunning = false; // OSC not running

            const context = { username: 'testuser' };
            const result = await oscBridgePlugin.handleWaveCommand(context);

            // Should succeed even when OSC is not running
            expect(oscBridgePlugin.wave).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });
});
