/**
 * Unit Tests for OSCQuery Client
 * Tests parameter discovery, parsing, and WebSocket subscriptions
 */

const OSCQueryClient = require('../modules/OSCQueryClient');

describe('OSCQueryClient', () => {
    let client;
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
    };

    beforeEach(() => {
        client = new OSCQueryClient('127.0.0.1', 9001, mockLogger);
    });

    afterEach(() => {
        if (client) {
            client.destroy();
        }
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should initialize with default values', () => {
            expect(client.host).toBe('127.0.0.1');
            expect(client.port).toBe(9001);
            expect(client.baseUrl).toBe('http://127.0.0.1:9001');
            expect(client.parameters.size).toBe(0);
        });

        test('should initialize with custom host and port', () => {
            const customClient = new OSCQueryClient('192.168.1.100', 8080, mockLogger);
            expect(customClient.host).toBe('192.168.1.100');
            expect(customClient.port).toBe(8080);
            expect(customClient.baseUrl).toBe('http://192.168.1.100:8080');
            customClient.destroy();
        });
    });

    describe('Parameter Management', () => {
        test('should add and retrieve parameters', () => {
            client._addParameter('/test/param1', {
                TYPE: 'f',
                ACCESS: 3,
                VALUE: 0.5,
                RANGE: [0, 1]
            });

            const param = client.getParameter('/test/param1');
            expect(param).toBeDefined();
            expect(param.type).toBe('float');
            expect(param.access).toBe('readwrite');
            expect(param.value).toBe(0.5);
        });

        test('should parse OSC types correctly', () => {
            expect(client._parseType('i')).toBe('int');
            expect(client._parseType('f')).toBe('float');
            expect(client._parseType('s')).toBe('string');
            expect(client._parseType('T')).toBe('bool');
            expect(client._parseType('F')).toBe('bool');
            expect(client._parseType('unknown')).toBe('unknown');
        });

        test('should parse access values correctly', () => {
            expect(client._parseAccess(0)).toBe('none');
            expect(client._parseAccess(1)).toBe('read');
            expect(client._parseAccess(2)).toBe('write');
            expect(client._parseAccess(3)).toBe('readwrite');
            expect(client._parseAccess(99)).toBe('unknown');
        });

        test('should filter parameters by pattern', () => {
            client._addParameter('/avatar/parameters/Test1', { TYPE: 'f', ACCESS: 3 });
            client._addParameter('/avatar/parameters/Test2', { TYPE: 'i', ACCESS: 3 });
            client._addParameter('/world/param', { TYPE: 's', ACCESS: 1 });

            const avatarParams = client.getParametersByPattern('/avatar/.*');
            expect(avatarParams.length).toBe(2);
            
            const worldParams = client.getParametersByPattern('/world/.*');
            expect(worldParams.length).toBe(1);
        });
    });

    describe('Parameter Tree', () => {
        test('should build parameter tree structure', () => {
            client._addParameter('/avatar/parameters/Wave', { TYPE: 'f', ACCESS: 3, VALUE: 0 });
            client._addParameter('/avatar/parameters/Celebrate', { TYPE: 'f', ACCESS: 3, VALUE: 0 });
            client._addParameter('/avatar/physbones/Tail/Angle', { TYPE: 'f', ACCESS: 3, VALUE: 0 });

            const tree = client.getParameterTree();
            
            expect(tree.avatar).toBeDefined();
            expect(tree.avatar.parameters).toBeDefined();
            expect(tree.avatar.parameters.Wave).toBeDefined();
            expect(tree.avatar.parameters.Celebrate).toBeDefined();
            expect(tree.avatar.physbones).toBeDefined();
            expect(tree.avatar.physbones.Tail).toBeDefined();
            expect(tree.avatar.physbones.Tail.Angle).toBeDefined();
        });

        test('should handle deeply nested paths', () => {
            client._addParameter('/a/b/c/d/e', { TYPE: 'f', ACCESS: 3 });
            
            const tree = client.getParameterTree();
            expect(tree.a.b.c.d.e).toBeDefined();
            expect(tree.a.b.c.d.e.type).toBe('float');
        });
    });

    describe('Event Listeners', () => {
        test('should add and remove event listeners', () => {
            const callback = jest.fn();
            
            const unsubscribe = client.on('test_event', callback);
            expect(client.listeners.has('test_event')).toBe(true);
            expect(client.listeners.get('test_event').size).toBe(1);
            
            unsubscribe();
            expect(client.listeners.get('test_event').size).toBe(0);
        });

        test('should emit events to listeners', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            
            client.on('test_event', callback1);
            client.on('test_event', callback2);
            
            client._emit('test_event', { data: 'test' });
            
            expect(callback1).toHaveBeenCalledWith({ data: 'test' });
            expect(callback2).toHaveBeenCalledWith({ data: 'test' });
        });

        test('should handle parameter updates', () => {
            client._addParameter('/test/param', { TYPE: 'f', ACCESS: 3, VALUE: 0 });
            
            const update = {
                path: '/test/param',
                value: 0.5
            };
            
            client._handleUpdate(update);
            
            const param = client.getParameter('/test/param');
            expect(param.value).toBe(0.5);
        });
    });

    describe('Status', () => {
        test('should return correct status', () => {
            const status = client.getStatus();
            
            expect(status).toHaveProperty('isConnected');
            expect(status).toHaveProperty('host');
            expect(status).toHaveProperty('port');
            expect(status).toHaveProperty('parameterCount');
            expect(status).toHaveProperty('lastDiscovery');
            expect(status).toHaveProperty('currentAvatar');
            
            expect(status.host).toBe('127.0.0.1');
            expect(status.port).toBe(9001);
            expect(status.isConnected).toBe(false);
        });
    });

    describe('Cleanup', () => {
        test('should clean up resources on destroy', () => {
            client._addParameter('/test1', { TYPE: 'f', ACCESS: 3 });
            client._addParameter('/test2', { TYPE: 'f', ACCESS: 3 });
            client.on('test', jest.fn());
            
            expect(client.parameters.size).toBe(2);
            expect(client.listeners.size).toBe(1);
            
            client.destroy();
            
            expect(client.parameters.size).toBe(0);
            expect(client.listeners.size).toBe(0);
        });
    });
});

// Export for use in other test files if needed
module.exports = { OSCQueryClient };
