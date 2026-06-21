/**
 * Test for Weather Control GCCE Integration
 * 
 * Tests the integration between Weather Control plugin and GCCE
 */

describe('Weather Control GCCE Integration', () => {
    let weatherPlugin;
    let mockApi;
    let mockGcceInstance;

    beforeEach(() => {
        // Mock API
        mockApi = {
            log: jest.fn(),
            emit: jest.fn(),
            getConfig: jest.fn().mockResolvedValue(null),
            setConfig: jest.fn().mockResolvedValue(true),
            registerRoute: jest.fn(),
            registerTikTokEvent: jest.fn(),
            registerFlowAction: jest.fn(),
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
                registered: ['weather', 'weatherlist', 'weatherstop'],
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
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);
            
            // Mock config with chat commands enabled
            mockApi.getConfig.mockResolvedValueOnce({
                chatCommands: { enabled: true }
            });

            await weatherPlugin.init();

            // Verify GCCE commands were registered
            expect(mockGcceInstance.registerCommandsForPlugin).toHaveBeenCalledWith(
                'weather-control',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'weather' }),
                    expect.objectContaining({ name: 'weatherlist' }),
                    expect.objectContaining({ name: 'weatherstop' })
                ])
            );
        });

        test('should not register commands when chat commands disabled', async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);
            
            // Mock config with chat commands disabled
            mockApi.getConfig.mockResolvedValueOnce({
                chatCommands: { enabled: false }
            });

            await weatherPlugin.init();

            // Verify GCCE commands were NOT registered
            expect(mockGcceInstance.registerCommandsForPlugin).not.toHaveBeenCalled();
        });

        test('should not register commands when GCCE not available', async () => {
            // Don't set up GCCE plugin (not available)
            
            // Load plugin
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);

            await weatherPlugin.init();

            // Verify no errors and GCCE registration not attempted
            expect(mockGcceInstance.registerCommandsForPlugin).not.toHaveBeenCalled();
        });
    });

    describe('Weather Command Handler', () => {
        beforeEach(async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);
            
            await weatherPlugin.init();
        });

        test('should trigger weather effect with valid effect name', async () => {
            // Mock permission check to allow
            weatherPlugin.checkUserPermission = jest.fn().mockResolvedValue(true);
            
            const context = {
                username: 'testuser',
                userId: '123',
                userRole: 'subscriber'
            };

            const result = await weatherPlugin.handleWeatherCommand(['rain'], context);

            expect(result.success).toBe(true);
            expect(result.message).toContain('rain');
            expect(mockApi.emit).toHaveBeenCalledWith(
                'weather:trigger',
                expect.objectContaining({
                    action: 'rain',
                    username: 'testuser'
                })
            );
        });

        test('should reject invalid effect name', async () => {
            const context = {
                username: 'testuser',
                userId: '123',
                userRole: 'subscriber'
            };

            const result = await weatherPlugin.handleWeatherCommand(['invalideffect'], context);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unknown weather effect');
        });

        test('should apply permission checks when enabled', async () => {
            // Mock checkUserPermission to deny
            weatherPlugin.checkUserPermission = jest.fn().mockResolvedValue(false);
            weatherPlugin.config.chatCommands.requirePermission = true;
            weatherPlugin.config.permissions.enabled = true;

            const context = {
                username: 'testuser',
                userId: '123',
                userRole: 'all'
            };

            const result = await weatherPlugin.handleWeatherCommand(['rain'], context);

            expect(result.success).toBe(false);
            expect(result.error).toContain('permission');
        });

        test('should apply rate limiting', async () => {
            // Mock permission check to allow
            weatherPlugin.checkUserPermission = jest.fn().mockResolvedValue(true);
            
            const context = {
                username: 'testuser',
                userId: '123',
                userRole: 'subscriber'
            };

            // Trigger multiple times to exceed rate limit
            weatherPlugin.rateLimitMax = 2;
            
            await weatherPlugin.handleWeatherCommand(['rain'], context);
            await weatherPlugin.handleWeatherCommand(['rain'], context);
            const result = await weatherPlugin.handleWeatherCommand(['rain'], context);

            expect(result.success).toBe(false);
            expect(result.error).toContain('too quickly');
        });
    });

    describe('WeatherList Command Handler', () => {
        beforeEach(async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);
            
            await weatherPlugin.init();
        });

        test('should list all enabled effects', async () => {
            const context = {
                username: 'testuser',
                userId: '123',
                userRole: 'all'
            };

            const result = await weatherPlugin.handleWeatherListCommand([], context);

            expect(result.success).toBe(true);
            expect(result.message).toContain('rain');
            expect(result.message).toContain('snow');
            expect(result.data.effects.length).toBeGreaterThan(0);
        });
    });

    describe('WeatherStop Command Handler', () => {
        beforeEach(async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);
            
            await weatherPlugin.init();
        });

        test('should emit stop event', async () => {
            const context = {
                username: 'testuser',
                userId: '123',
                userRole: 'subscriber'
            };

            const result = await weatherPlugin.handleWeatherStopCommand([], context);

            expect(result.success).toBe(true);
            expect(mockApi.emit).toHaveBeenCalledWith(
                'weather:stop',
                expect.objectContaining({
                    username: 'testuser'
                })
            );
        });
    });

    describe('Permanent effect synchronization', () => {
        test('should start and stop permanent effects based on config', async () => {
            mockApi.getConfig.mockResolvedValueOnce(null);

            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);

            await weatherPlugin.init();
            mockApi.emit.mockClear();

            weatherPlugin.config.effects.rain.permanent = true;
            weatherPlugin.syncPermanentEffects();

            expect(mockApi.emit).toHaveBeenCalledWith(
                'weather:trigger',
                expect.objectContaining({
                    action: 'rain',
                    permanent: true,
                    duration: 0
                })
            );

            mockApi.emit.mockClear();
            weatherPlugin.config.effects.rain.permanent = false;
            weatherPlugin.syncPermanentEffects();

            expect(mockApi.emit).toHaveBeenCalledWith(
                'weather:stop-effect',
                expect.objectContaining({ action: 'rain' })
            );
        });
    });

    describe('Plugin Cleanup', () => {
        test('should unregister commands on destroy', async () => {
            // Setup GCCE plugin
            mockApi.pluginLoader.loadedPlugins.set('gcce', {
                instance: mockGcceInstance
            });

            // Load plugin
            const WeatherControlPlugin = require('../plugins/weather-control/main.js');
            weatherPlugin = new WeatherControlPlugin(mockApi);
            
            await weatherPlugin.init();
            await weatherPlugin.destroy();

            // Verify commands were unregistered
            expect(mockGcceInstance.unregisterCommandsForPlugin).toHaveBeenCalledWith('weather-control');
        });
    });
});
