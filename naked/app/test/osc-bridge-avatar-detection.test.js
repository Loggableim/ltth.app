/**
 * Test for OSC-Bridge Avatar Detection with Retry Logic
 */

const OSCBridgePlugin = require('../plugins/osc-bridge/main.js');
const axios = require('axios');

// Test constants
const EXPECTED_MIN_RETRY_DURATION = 90; // ms - minimum expected time for retries with variance

describe('OSC-Bridge Avatar Detection', () => {
    let oscBridgePlugin;
    let mockApi;
    let mockLogger;
    let mockOSCQueryClient;
    let axiosGetSpy;

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
            getConfig: jest.fn().mockResolvedValue({
                enabled: true,
                oscQuery: { enabled: true }
            }),
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
            },
            getConfigPathManager: jest.fn().mockReturnValue({
                getUserDataDir: jest.fn().mockReturnValue('/tmp/test'),
                getPluginDataDir: jest.fn().mockReturnValue('/tmp/test/plugins'),
                ensurePluginDataDir: jest.fn().mockResolvedValue('/tmp/test/plugins')
            }),
            getSocketIO: jest.fn().mockReturnValue({
                emit: jest.fn(),
                on: jest.fn()
            })
        };

        // Create plugin instance
        oscBridgePlugin = new OSCBridgePlugin(mockApi);

        // Mock OSCQuery client
        mockOSCQueryClient = {
            baseUrl: 'http://127.0.0.1:9001',
            parameters: new Map(),
            avatarInfo: null,
            discover: jest.fn().mockResolvedValue({
                parameters: [],
                timestamp: Date.now()
            })
        };

        // Mock axios in beforeEach to ensure consistent behavior across tests
        axiosGetSpy = jest.spyOn(axios, 'get').mockRejectedValue(new Error('Not found'));
    });

    afterEach(() => {
        // Restore axios mock after each test
        if (axiosGetSpy) {
            axiosGetSpy.mockRestore();
        }
    });

    describe('getCurrentAvatarId retry logic', () => {
        test('should return cached avatar ID immediately if available', async () => {
            oscBridgePlugin.oscQueryClient = mockOSCQueryClient;
            mockOSCQueryClient.avatarInfo = {
                id: 'avtr_test_cached',
                changedAt: Date.now()
            };

            const avatarId = await oscBridgePlugin.getCurrentAvatarId();

            expect(avatarId).toBe('avtr_test_cached');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Using cached avatar ID: avtr_test_cached'
            );
        });

        test('should return null immediately if no OSCQueryClient', async () => {
            oscBridgePlugin.oscQueryClient = null;

            const avatarId = await oscBridgePlugin.getCurrentAvatarId();

            expect(avatarId).toBeNull();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'OSCQuery client not initialized for avatar ID retrieval'
            );
        });

        test('should retry with delay when avatar not found initially', async () => {
            oscBridgePlugin.oscQueryClient = mockOSCQueryClient;

            // Use empty Map
            mockOSCQueryClient.parameters = new Map();

            const startTime = Date.now();
            const avatarId = await oscBridgePlugin.getCurrentAvatarId({ 
                retries: 2, 
                retryDelay: 50 
            });
            const duration = Date.now() - startTime;

            // Should have retried 2 times with 50ms delay each = ~100ms minimum
            expect(avatarId).toBeNull();
            expect(duration).toBeGreaterThanOrEqual(EXPECTED_MIN_RETRY_DURATION);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('No avatar found, retrying')
            );
            // Should have logged retry messages
            const retryCalls = mockLogger.debug.mock.calls.filter(call => 
                call[0].includes('retrying')
            );
            expect(retryCalls.length).toBeGreaterThan(0);
        });

        test('should return null after all retries exhausted', async () => {
            oscBridgePlugin.oscQueryClient = mockOSCQueryClient;

            // Mock parameters Map to always be empty
            mockOSCQueryClient.parameters = new Map(); // Empty map

            const avatarId = await oscBridgePlugin.getCurrentAvatarId({ 
                retries: 2, 
                retryDelay: 50 
            });

            expect(avatarId).toBeNull();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('No avatar ID found')
            );
        });

        test('should cache avatar ID when found in parameters', async () => {
            oscBridgePlugin.oscQueryClient = mockOSCQueryClient;

            // Mock parameters Map to have avatar - ensure size > 0
            mockOSCQueryClient.parameters = new Map();
            mockOSCQueryClient.parameters.set('/avatar/change', { value: 'avtr_test_cache' });

            const avatarId = await oscBridgePlugin.getCurrentAvatarId();

            expect(avatarId).toBe('avtr_test_cache');
            expect(mockOSCQueryClient.avatarInfo).toEqual({
                id: 'avtr_test_cache',
                changedAt: expect.any(Number)
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                '✅ Avatar ID from parameters: avtr_test_cache'
            );
        });

        test('should not retry by default when options not specified', async () => {
            oscBridgePlugin.oscQueryClient = mockOSCQueryClient;

            // Mock parameters Map to be empty
            mockOSCQueryClient.parameters = new Map(); // Empty map

            // Call without options - default retries = 0, so no retry attempts
            const avatarId = await oscBridgePlugin.getCurrentAvatarId();

            expect(avatarId).toBeNull();
            // Should not see retry messages since default behavior is no retries
            expect(mockLogger.debug).not.toHaveBeenCalledWith(
                expect.stringContaining('retrying')
            );
        });
    });
});
