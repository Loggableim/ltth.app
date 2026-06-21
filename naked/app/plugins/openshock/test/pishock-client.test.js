/**
 * PiShockClient Unit Tests
 *
 * Tests für den PiShock API Client und die ShockClientFactory.
 */

const PiShockClient = require('../helpers/piShockClient');
const ShockClientFactory = require('../helpers/shockClientFactory');

// ====================================================================
// PiShockClient – Konstruktor und isConfigured
// ====================================================================

describe('PiShockClient - Constructor & isConfigured', () => {
    test('should be unconfigured when no credentials', () => {
        const client = new PiShockClient({}, console);
        expect(client.isConfigured).toBe(false);
    });

    test('should be unconfigured with only username', () => {
        const client = new PiShockClient({ username: 'testuser' }, console);
        expect(client.isConfigured).toBe(false);
    });

    test('should be unconfigured with only apiKey', () => {
        const client = new PiShockClient({ apiKey: 'test-key' }, console);
        expect(client.isConfigured).toBe(false);
    });

    test('should be configured with username and apiKey', () => {
        const client = new PiShockClient({ username: 'testuser', apiKey: 'test-key' }, console);
        expect(client.isConfigured).toBe(true);
    });

    test('should initialize with empty shareCodes if not provided', () => {
        const client = new PiShockClient({ username: 'testuser', apiKey: 'test-key' }, console);
        expect(client.shareCodes).toEqual([]);
    });

    test('should set shareCodes from config', () => {
        const shareCodes = [{ code: 'ABC123', name: 'Test Collar' }];
        const client = new PiShockClient({ username: 'testuser', apiKey: 'test-key', shareCodes }, console);
        expect(client.shareCodes).toEqual(shareCodes);
    });
});

// ====================================================================
// PiShockClient – updateConfig
// ====================================================================

describe('PiShockClient - updateConfig', () => {
    test('should update username', () => {
        const client = new PiShockClient({}, console);
        client.updateConfig({ username: 'newuser' });
        expect(client.username).toBe('newuser');
    });

    test('should update apiKey and reconfigure', () => {
        const client = new PiShockClient({ username: 'testuser' }, console);
        expect(client.isConfigured).toBe(false);
        client.updateConfig({ apiKey: 'new-key' });
        expect(client.apiKey).toBe('new-key');
        expect(client.isConfigured).toBe(true);
    });

    test('should update shareCodes', () => {
        const client = new PiShockClient({}, console);
        client.updateConfig({ shareCodes: [{ code: 'NEWCODE', name: 'New Device' }] });
        expect(client.shareCodes).toEqual([{ code: 'NEWCODE', name: 'New Device' }]);
    });

    test('should set isConfigured to false when clearing apiKey', () => {
        const client = new PiShockClient({ username: 'testuser', apiKey: 'test-key' }, console);
        expect(client.isConfigured).toBe(true);
        client.updateConfig({ apiKey: '' });
        expect(client.isConfigured).toBe(false);
    });
});

// ====================================================================
// PiShockClient – getDevices
// ====================================================================

describe('PiShockClient - getDevices', () => {
    test('should return empty array when not configured', async () => {
        const client = new PiShockClient({}, console);
        const result = await client.getDevices();
        expect(result).toEqual([]);
    });

    test('should return shareCodes as devices', async () => {
        const shareCodes = [
            { code: 'CODE1', name: 'Device 1' },
            { code: 'CODE2', name: 'Device 2' }
        ];
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes
        }, console);

        const devices = await client.getDevices();
        expect(devices).toHaveLength(2);
        expect(devices[0].id).toBe('CODE1');
        expect(devices[0].name).toBe('Device 1');
        expect(devices[0].provider).toBe('pishock');
        expect(devices[1].id).toBe('CODE2');
    });

    test('should return empty array when configured but no shareCodes', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: []
        }, console);

        const devices = await client.getDevices();
        expect(devices).toHaveLength(0);
    });
});

// ====================================================================
// PiShockClient – Duration conversion
// ====================================================================

describe('PiShockClient - Duration conversion', () => {
    test('_convertDuration should convert ms to seconds', () => {
        const client = new PiShockClient({}, console);
        expect(client._convertDuration(1000)).toBe(1);
        expect(client._convertDuration(5000)).toBe(5);
        expect(client._convertDuration(15000)).toBe(15);
    });

    test('_convertDuration should clamp to minimum 1 second', () => {
        const client = new PiShockClient({}, console);
        expect(client._convertDuration(0)).toBe(1);
        expect(client._convertDuration(100)).toBe(1);
        expect(client._convertDuration(499)).toBe(1);
        expect(client._convertDuration(500)).toBe(1);
    });

    test('_convertDuration should clamp to maximum 15 seconds', () => {
        const client = new PiShockClient({}, console);
        expect(client._convertDuration(16000)).toBe(15);
        expect(client._convertDuration(30000)).toBe(15);
        expect(client._convertDuration(100000)).toBe(15);
    });

    test('_convertDuration should round correctly', () => {
        const client = new PiShockClient({}, console);
        expect(client._convertDuration(1499)).toBe(1); // 1.499 → rounds to 1
        expect(client._convertDuration(1500)).toBe(2); // 1.5 → rounds to 2
        expect(client._convertDuration(2600)).toBe(3); // 2.6 → rounds to 3
    });
});

// ====================================================================
// PiShockClient – Intensity clamping
// ====================================================================

describe('PiShockClient - Intensity clamping', () => {
    test('_clampIntensity should clamp to 0-100', () => {
        const client = new PiShockClient({}, console);
        expect(client._clampIntensity(50)).toBe(50);
        expect(client._clampIntensity(0)).toBe(0);
        expect(client._clampIntensity(100)).toBe(100);
        expect(client._clampIntensity(-5)).toBe(0);
        expect(client._clampIntensity(120)).toBe(100);
    });

    test('_clampIntensity should round to integer', () => {
        const client = new PiShockClient({}, console);
        expect(client._clampIntensity(50.7)).toBe(51);
        expect(client._clampIntensity(49.2)).toBe(49);
    });
});

// ====================================================================
// PiShockClient – ShareCode resolution
// ====================================================================

describe('PiShockClient - ShareCode resolution', () => {
    test('_resolveShareCode should find code from shareCodes config', () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'MYCODE', name: 'My Collar' }]
        }, console);

        const resolved = client._resolveShareCode('MYCODE');
        expect(resolved).toBe('MYCODE');
    });

    test('_resolveShareCode should throw for unknown code when shareCodes are set', () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'KNOWNCODE', name: 'Known Device' }]
        }, console);

        expect(() => client._resolveShareCode('UNKNOWNCODE')).toThrow(/not found/i);
    });

    test('_resolveShareCode should use deviceId directly when no shareCodes configured', () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: []
        }, console);

        const resolved = client._resolveShareCode('DIRECTCODE');
        expect(resolved).toBe('DIRECTCODE');
    });

    test('_resolveShareCode should throw for empty deviceId', () => {
        const client = new PiShockClient({}, console);
        expect(() => client._resolveShareCode('')).toThrow();
        expect(() => client._resolveShareCode(null)).toThrow();
    });
});

// ====================================================================
// PiShockClient – _buildPayload
// ====================================================================

describe('PiShockClient - _buildPayload', () => {
    test('should build correct payload with strings for Intensity and Duration', () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-api-key'
        }, console);

        const payload = client._buildPayload('TESTCODE', 1, 50, 3);

        expect(payload).toEqual({
            Username: 'testuser',
            Name: 'TikTokHelper',
            Code: 'TESTCODE',
            Intensity: '50',    // Must be string
            Duration: '3',       // Must be string (seconds)
            Apikey: 'test-api-key',
            Op: 1
        });
    });

    test('should use correct Op codes', () => {
        const client = new PiShockClient({ username: 'u', apiKey: 'k' }, console);

        expect(client._buildPayload('CODE', 0, 50, 3).Op).toBe(0); // Shock
        expect(client._buildPayload('CODE', 1, 50, 3).Op).toBe(1); // Vibrate
        expect(client._buildPayload('CODE', 2, 50, 3).Op).toBe(2); // Beep
    });
});

// ====================================================================
// PiShockClient – sendControl routing
// ====================================================================

describe('PiShockClient - sendControl routing', () => {
    test('should throw when not configured', async () => {
        const client = new PiShockClient({}, console);
        await expect(client.sendControl('CODE', { type: 'vibrate', intensity: 50, duration: 1000 }))
            .rejects.toThrow(/not configured/i);
    });

    test('should throw for unknown command type', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'CODE', name: 'Test' }]
        }, console);

        // Mock the _sendCommand to prevent actual HTTP calls
        client._sendCommand = jest.fn().mockResolvedValue({ success: true });

        await expect(client.sendControl('CODE', { type: 'unknown', intensity: 50, duration: 1000 }))
            .rejects.toThrow(/unknown command type/i);
    });

    test('should route Shock type to sendShock', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'CODE', name: 'Test' }]
        }, console);

        client._sendCommand = jest.fn().mockResolvedValue({ success: true });

        await client.sendControl('CODE', { type: 'Shock', intensity: 50, duration: 1000 });
        expect(client._sendCommand).toHaveBeenCalledWith('CODE', 0, 50, 1000, {});
    });

    test('should route Vibrate type to sendVibrate', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'CODE', name: 'Test' }]
        }, console);

        client._sendCommand = jest.fn().mockResolvedValue({ success: true });

        await client.sendControl('CODE', { type: 'vibrate', intensity: 30, duration: 2000 });
        expect(client._sendCommand).toHaveBeenCalledWith('CODE', 1, 30, 2000, {});
    });

    test('should route Beep alias to sendSound (Op 2)', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'CODE', name: 'Test' }]
        }, console);

        client._sendCommand = jest.fn().mockResolvedValue({ success: true });

        await client.sendControl('CODE', { type: 'beep', intensity: 20, duration: 500 });
        expect(client._sendCommand).toHaveBeenCalledWith('CODE', 2, 20, 500, {});
    });
});

// ====================================================================
// PiShockClient – sendBatch
// ====================================================================

describe('PiShockClient - sendBatch', () => {
    test('should throw for empty commands array', async () => {
        const client = new PiShockClient({}, console);
        await expect(client.sendBatch([])).rejects.toThrow(/non-empty array/i);
    });

    test('should execute commands sequentially', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'CODE', name: 'Test' }]
        }, console);

        client._sendCommand = jest.fn().mockResolvedValue({ success: true });

        const commands = [
            { deviceId: 'CODE', type: 'vibrate', intensity: 50, duration: 1000 },
            { deviceId: 'CODE', type: 'shock', intensity: 30, duration: 2000 }
        ];

        const results = await client.sendBatch(commands);
        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
        expect(client._sendCommand).toHaveBeenCalledTimes(2);
    });
});

// ====================================================================
// PiShockClient – getRateLimitStatus
// ====================================================================

describe('PiShockClient - getRateLimitStatus', () => {
    test('should return rate limit info', () => {
        const client = new PiShockClient({}, console);
        const status = client.getRateLimitStatus();
        expect(status).toHaveProperty('used');
        expect(status).toHaveProperty('remaining');
        expect(status).toHaveProperty('queueLength');
        expect(status.remaining).toBe(30); // maxRequestsPerWindow
    });
});

// ====================================================================
// PiShockClient – testConnection
// ====================================================================

describe('PiShockClient - testConnection', () => {
    test('should return failure when not configured', async () => {
        const client = new PiShockClient({}, console);
        const result = await client.testConnection();
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not configured/i);
    });

    test('should return failure when no shareCodes', async () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: []
        }, console);
        const result = await client.testConnection();
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/sharecode/i);
    });
});

// ====================================================================
// PiShockClient – destroy and clearQueue
// ====================================================================

describe('PiShockClient - cleanup', () => {
    test('clearQueue should be a no-op', () => {
        const client = new PiShockClient({}, console);
        expect(() => client.clearQueue()).not.toThrow();
    });

    test('destroy should clean up without throwing', () => {
        const client = new PiShockClient({
            username: 'testuser',
            apiKey: 'test-key',
            shareCodes: [{ code: 'CODE', name: 'Test' }]
        }, console);
        expect(() => client.destroy()).not.toThrow();
    });
});

// ====================================================================
// PiShockClient – _checkResponseForErrors
// ====================================================================

describe('PiShockClient - _checkResponseForErrors', () => {
    test('should not throw for success messages', () => {
        const client = new PiShockClient({}, console);
        expect(() => client._checkResponseForErrors('Operation Successful.')).not.toThrow();
        expect(() => client._checkResponseForErrors('')).not.toThrow();
        expect(() => client._checkResponseForErrors(null)).not.toThrow();
    });

    test('should throw for "This code doesn\'t exist"', () => {
        const client = new PiShockClient({}, console);
        expect(() => client._checkResponseForErrors("This code doesn't exist."))
            .toThrow(/invalid sharecode/i);
    });

    test('should throw for "Not Authorized" response', () => {
        const client = new PiShockClient({}, console);
        expect(() => client._checkResponseForErrors('Not Authorized'))
            .toThrow(/not authorized/i);
    });

    test('should throw for "Device is offline"', () => {
        const client = new PiShockClient({}, console);
        expect(() => client._checkResponseForErrors('Device is offline'))
            .toThrow(/offline/i);
    });
});

// ====================================================================
// ShockClientFactory
// ====================================================================

describe('ShockClientFactory', () => {
    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should create a client with isConfigured for provider "openshock"', () => {
        const client = ShockClientFactory.create({
            apiProvider: 'openshock',
            apiKey: 'test-key',
            baseUrl: 'https://api.openshock.app'
        }, mockLogger);
        // OpenShockClient has isConfigured property
        expect(client).toHaveProperty('isConfigured');
        // Should NOT be PiShockClient (provider check)
        expect(client).not.toBeInstanceOf(PiShockClient);
    });

    test('should create OpenShockClient as default when no provider specified', () => {
        const client = ShockClientFactory.create({
            apiKey: 'test-key'
        }, mockLogger);
        expect(client).not.toBeInstanceOf(PiShockClient);
        expect(client).toHaveProperty('isConfigured');
    });

    test('should create PiShockClient for provider "pishock"', () => {
        const client = ShockClientFactory.create({
            apiProvider: 'pishock',
            pishock: {
                username: 'testuser',
                apiKey: 'test-key',
                shareCodes: []
            }
        }, mockLogger);
        expect(client).toBeInstanceOf(PiShockClient);
    });

    test('getProviderInfo should return info for openshock', () => {
        const info = ShockClientFactory.getProviderInfo('openshock');
        expect(info.id).toBe('openshock');
        expect(info.deviceDiscovery).toBe(true);
        expect(info.maxDurationMs).toBe(30000);
    });

    test('getProviderInfo should return info for pishock', () => {
        const info = ShockClientFactory.getProviderInfo('pishock');
        expect(info.id).toBe('pishock');
        expect(info.deviceDiscovery).toBe(false);
        expect(info.maxDurationMs).toBe(15000);
    });

    test('getProviderInfo should default to openshock for unknown provider', () => {
        const info = ShockClientFactory.getProviderInfo('unknown');
        expect(info.id).toBe('openshock');
    });

    test('getSupportedProviders should return 2 providers', () => {
        const providers = ShockClientFactory.getSupportedProviders();
        expect(providers).toHaveLength(2);
        expect(providers.map(p => p.id)).toContain('openshock');
        expect(providers.map(p => p.id)).toContain('pishock');
    });
});
