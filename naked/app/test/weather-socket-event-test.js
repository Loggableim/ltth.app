/**
 * Test: Weather Control Plugin - Socket Event Emission
 * 
 * This test verifies that the /api/weather/trigger route correctly emits
 * a socket.io event when triggered, which should be received by overlay clients.
 */

const request = require('supertest');

describe('Weather Control - Socket Event Emission', () => {
    let app, server, io, weatherPlugin;
    let socketEvents = [];

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

        // Capture emitted events
        const originalEmit = io.emit.bind(io);
        io.emit = function(event, data) {
            socketEvents.push({ event, data });
            return originalEmit(event, data);
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
                    sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: false },
                    glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false }
                }
            })),
            setConfig: jest.fn(async () => true),
            getDatabase: () => mockDb,
            emit: (event, data) => io.emit(event, data),
            registerRoute: (method, path, ...handlers) => {
                const handler = handlers[handlers.length - 1];
                app[method.toLowerCase()](path, ...handlers.slice(0, -1), handler);
            },
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            pluginLoader: {
                loadedPlugins: new Map()
            }
        };

        weatherPlugin = new WeatherControlPlugin(mockApi);
        await weatherPlugin.init();
    });

    afterAll(() => {
        if (server) {
            server.close();
        }
    });

    beforeEach(() => {
        socketEvents = [];
    });

    test('POST /api/weather/trigger should emit weather:trigger socket event', async () => {
        const response = await request(app)
            .post('/api/weather/trigger')
            .send({
                action: 'rain',
                intensity: 0.7,
                duration: 5000
            })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.event).toBeDefined();
        expect(response.body.event.action).toBe('rain');
        expect(response.body.event.intensity).toBe(0.7);
        expect(response.body.event.duration).toBe(5000);

        // Verify socket event was emitted
        expect(socketEvents.length).toBeGreaterThan(0);
        const weatherEvent = socketEvents.find(e => e.event === 'weather:trigger');
        expect(weatherEvent).toBeDefined();
        expect(weatherEvent.data.action).toBe('rain');
        expect(weatherEvent.data.intensity).toBe(0.7);
        expect(weatherEvent.data.duration).toBe(5000);
    });

    test('POST /api/weather/trigger should fail with invalid action', async () => {
        const response = await request(app)
            .post('/api/weather/trigger')
            .send({
                action: 'invalid_effect',
                intensity: 0.5,
                duration: 5000
            })
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Invalid action');

        // Verify NO socket event was emitted for invalid action
        const weatherEvent = socketEvents.find(e => e.event === 'weather:trigger');
        expect(weatherEvent).toBeUndefined();
    });

    test('POST /api/weather/trigger should fail with disabled effect', async () => {
        // Override config to disable rain
        weatherPlugin.config.effects.rain.enabled = false;

        const response = await request(app)
            .post('/api/weather/trigger')
            .send({
                action: 'rain',
                intensity: 0.5,
                duration: 5000
            })
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('disabled');

        // Re-enable for other tests
        weatherPlugin.config.effects.rain.enabled = true;

        // Verify NO socket event was emitted for disabled effect
        const weatherEvent = socketEvents.find(e => e.event === 'weather:trigger');
        expect(weatherEvent).toBeUndefined();
    });

    test('POST /api/weather/trigger should emit event and return success when useGlobalAuth is true', async () => {
        // Simulate the exact request the admin UI sends
        const response = await request(app)
            .post('/api/weather/trigger')
            .send({
                action: 'snow',
                intensity: 0.5,
                duration: 10000
            })
            .expect(200);

        expect(response.body.success).toBe(true);

        // Verify socket event was emitted
        const weatherEvent = socketEvents.find(e => e.event === 'weather:trigger');
        expect(weatherEvent).toBeDefined();
        expect(weatherEvent.data.action).toBe('snow');
    });
});
