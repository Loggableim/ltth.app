/**
 * Test: Weather Control Plugin - Permanent Effects Race Condition Fix
 * 
 * This test verifies that the client-ready handshake and config-change
 * notifications correctly fix the race condition for permanent effects.
 */

const request = require('supertest');
const { EventEmitter } = require('events');

describe('Weather Control - Permanent Effects Race Condition Fix', () => {
    let app, server, io, weatherPlugin;
    let socketEvents = [];
    let mockSocket;

    beforeAll(async () => {
        // Mock dependencies
        const mockDb = {
            prepare: jest.fn(() => ({
                get: jest.fn(() => null),
                all: jest.fn(() => []),
                run: jest.fn()
            })),
            getAllGiftWeatherMappings: jest.fn(() => [])
        };

        const mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        // Create Express app
        const express = require('express');
        app = express();
        app.use(express.json());

        // Create HTTP server
        const http = require('http');
        server = http.createServer(app);

        // Create Socket.IO instance
        io = require('socket.io')(server);

        // Create mock socket that extends EventEmitter
        class MockSocket extends EventEmitter {
            constructor() {
                super();
                this.emittedEvents = [];
            }
            emit(event, data) {
                this.emittedEvents.push({ event, data });
                super.emit(event, data);
            }
        }
        mockSocket = new MockSocket();

        // Capture emitted events from io
        const originalIoEmit = io.emit.bind(io);
        io.emit = function(event, data) {
            socketEvents.push({ event, data });
            return originalIoEmit(event, data);
        };

        // Load plugin
        const WeatherControlPlugin = require('../plugins/weather-control/main');
        
        // Create mock API
        const mockApi = {
            log: (msg, level) => mockLogger[level] ? mockLogger[level](msg) : console.log(msg),
            getConfig: jest.fn(async () => ({
                enabled: true,
                useGlobalAuth: true,
                rateLimitPerMinute: 10,
                chatCommands: {
                    enabled: true,
                    requirePermission: true,
                    allowIntensityControl: false,
                    allowDurationControl: false,
                    commandNames: {
                        weather: 'weather',
                        weatherlist: 'weatherlist',
                        weatherstop: 'weatherstop'
                    }
                },
                permissions: {
                    enabled: false,
                    allowAll: true,
                    allowedGroups: {
                        followers: true,
                        superfans: true,
                        subscribers: true,
                        teamMembers: true,
                        minTeamLevel: 1
                    },
                    allowedUsers: [],
                    topGifterThreshold: 10,
                    minPoints: 0
                },
                effects: {
                    rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false },
                    snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false },
                    storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false },
                    fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000, permanent: false },
                    thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000, permanent: false },
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: true },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false }
                }
            })),
            setConfig: jest.fn(async (key, config) => {
                // Update the mock to return the new config
                mockApi.getConfig.mockResolvedValue(config);
                return true;
            }),
            getDatabase: () => mockDb,
            emit: (event, data) => io.emit(event, data),
            getSocketIO: () => io,
            registerRoute: (method, path, ...handlers) => {
                const handler = handlers[handlers.length - 1];
                if (method === 'get') {
                    app.get(path, handler);
                } else if (method === 'post') {
                    app.post(path, handler);
                }
            },
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            registerFlowAction: jest.fn()
        };

        // Initialize plugin
        weatherPlugin = new WeatherControlPlugin(mockApi);
        await weatherPlugin.init();

        // Start server
        await new Promise((resolve) => {
            server.listen(0, resolve);
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => {
                server.close(resolve);
            });
        }
    });

    beforeEach(() => {
        socketEvents = [];
        if (mockSocket) {
            mockSocket.emittedEvents = [];
        }
    });

    test('Client-ready handshake is registered on socket connection', async () => {
        // Simulate a new client connection
        const connectionHandler = io._events.connection || io.listeners('connection')[0];
        expect(connectionHandler).toBeDefined();
        
        // Call the connection handler with mock socket
        if (Array.isArray(connectionHandler)) {
            connectionHandler.forEach(handler => handler(mockSocket));
        } else {
            connectionHandler(mockSocket);
        }

        // Verify that weather:client-ready event listener is registered
        const clientReadyListeners = mockSocket.listeners('weather:client-ready');
        expect(clientReadyListeners.length).toBeGreaterThan(0);

        // Verify that weather:request-permanent-effects event listener is registered
        const requestEffectsListeners = mockSocket.listeners('weather:request-permanent-effects');
        expect(requestEffectsListeners.length).toBeGreaterThan(0);
    });

    test('Permanent effects are synced when client sends ready signal', async () => {
        // Reset socket events
        mockSocket.emittedEvents = [];

        // Simulate connection
        const connectionHandler = io._events.connection || io.listeners('connection')[0];
        if (Array.isArray(connectionHandler)) {
            connectionHandler.forEach(handler => handler(mockSocket));
        } else {
            connectionHandler(mockSocket);
        }

        // Client sends ready signal
        mockSocket.emit('weather:client-ready');

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that permanent effects were sent to the socket
        const weatherTriggers = mockSocket.emittedEvents.filter(e => e.event === 'weather:trigger');
        expect(weatherTriggers.length).toBeGreaterThan(0);
        
        // Verify sunbeam was sent (it's marked as permanent in the config)
        const sunbeamTrigger = weatherTriggers.find(e => e.data.action === 'sunbeam');
        expect(sunbeamTrigger).toBeDefined();
        expect(sunbeamTrigger.data.permanent).toBe(true);
    });

    test('Client can request permanent effects explicitly', async () => {
        // Reset socket events
        mockSocket.emittedEvents = [];

        // Simulate connection
        const connectionHandler = io._events.connection || io.listeners('connection')[0];
        if (Array.isArray(connectionHandler)) {
            connectionHandler.forEach(handler => handler(mockSocket));
        } else {
            connectionHandler(mockSocket);
        }

        // Client requests permanent effects
        mockSocket.emit('weather:request-permanent-effects');

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that permanent effects were sent to the socket
        const weatherTriggers = mockSocket.emittedEvents.filter(e => e.event === 'weather:trigger');
        expect(weatherTriggers.length).toBeGreaterThan(0);
        
        // Verify sunbeam was sent
        const sunbeamTrigger = weatherTriggers.find(e => e.data.action === 'sunbeam');
        expect(sunbeamTrigger).toBeDefined();
    });

    test('Config change emits weather:config-changed event', async () => {
        // Reset events
        socketEvents = [];

        // Update config to enable rain as permanent
        const response = await request(app)
            .post('/api/weather/config')
            .send({
                effects: {
                    rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: true },
                    snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false },
                    storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false },
                    fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000, permanent: false },
                    thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000, permanent: false },
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: true },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false }
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify weather:config-changed event was emitted
        const configChangedEvents = socketEvents.filter(e => e.event === 'weather:config-changed');
        expect(configChangedEvents.length).toBeGreaterThan(0);

        // Verify the event contains the permanent effects list
        const configEvent = configChangedEvents[0];
        expect(configEvent.data.permanentEffects).toBeDefined();
        expect(Array.isArray(configEvent.data.permanentEffects)).toBe(true);
        expect(configEvent.data.permanentEffects).toContain('rain');
        expect(configEvent.data.permanentEffects).toContain('sunbeam');
        expect(configEvent.data.timestamp).toBeDefined();
    });

    test('activePermanentEffects is updated during socket sync', async () => {
        // Initial state should have sunbeam as permanent
        expect(weatherPlugin.activePermanentEffects.has('sunbeam')).toBe(true);

        // Create new mock socket
        const newSocket = new EventEmitter();
        newSocket.emittedEvents = [];
        newSocket.emit = function(event, data) {
            this.emittedEvents.push({ event, data });
        };

        // Sync permanent effects for this socket
        weatherPlugin.syncPermanentEffects(newSocket);

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify activePermanentEffects is still updated
        expect(weatherPlugin.activePermanentEffects.has('sunbeam')).toBe(true);
    });

    test('Permanent effects are re-synced when config changes', async () => {
        // Reset events
        socketEvents = [];

        // Update config to disable sunbeam permanent and enable rain permanent
        const response = await request(app)
            .post('/api/weather/config')
            .send({
                effects: {
                    rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: true },
                    snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false },
                    storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false },
                    fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000, permanent: false },
                    thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000, permanent: false },
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: false },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false }
                }
            });

        expect(response.status).toBe(200);

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify stop event for sunbeam
        const stopEvents = socketEvents.filter(e => e.event === 'weather:stop-effect');
        const sunbeamStop = stopEvents.find(e => e.data.action === 'sunbeam');
        expect(sunbeamStop).toBeDefined();

        // Verify trigger event for rain
        const triggerEvents = socketEvents.filter(e => e.event === 'weather:trigger');
        const rainTrigger = triggerEvents.find(e => e.data.action === 'rain');
        expect(rainTrigger).toBeDefined();
        expect(rainTrigger.data.permanent).toBe(true);
    });
});
