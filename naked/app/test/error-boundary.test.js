/**
 * Regression tests for the Global Error Boundary & Safe Handler Foundation
 *
 * Covers:
 * - Typed operational error classes (statusCode, name, retryable flag)
 * - safeRoute: maps typed errors to structured JSON HTTP responses
 * - safeSocketHandler: emits plugin:error instead of crashing on thrown errors
 * - safeActionHandler: propagates errors while adding log context
 * - APIBridgePlugin.executeAction: ValidationError on missing params,
 *   NotFoundError on unknown actionId
 * - Goals IFTTT executors: ValidationError on missing goalId, NotFoundError on missing goal
 */

const assert = require('assert');

// ---------------------------------------------------------------------------
// Helpers for faking Express req/res and Socket.IO socket
// ---------------------------------------------------------------------------

function makeRes() {
    const res = {
        _statusCode: 200,
        _body: null,
        status(code) {
            this._statusCode = code;
            return this;
        },
        json(body) {
            this._body = body;
            return this;
        }
    };
    return res;
}

function makeReq(method = 'POST', path = '/test', body = {}) {
    return {
        method,
        path,
        body,
        app: { locals: {} }
    };
}

function makeSocket() {
    const socket = {
        _emitted: [],
        emit(event, data) {
            this._emitted.push({ event, data });
        }
    };
    return socket;
}

// ---------------------------------------------------------------------------
// Load modules
// ---------------------------------------------------------------------------

const {
    ValidationError,
    NotFoundError,
    ConflictError,
    ExternalServiceError,
    RetryableError,
    safeRoute,
    safeSocketHandler,
    safeActionHandler,
    handleError,
    formatError
} = require('../modules/error-handler');

// ---------------------------------------------------------------------------
// Typed error classes
// ---------------------------------------------------------------------------

describe('Typed operational error classes', () => {
    it('ValidationError has statusCode 400 and correct name', () => {
        const err = new ValidationError('bad input', 'myField');
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.name, 'ValidationError');
        assert.strictEqual(err.field, 'myField');
        assert.ok(err instanceof Error);
    });

    it('NotFoundError has statusCode 404 and correct name', () => {
        const err = new NotFoundError('not found');
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.name, 'NotFoundError');
        assert.ok(err instanceof Error);
    });

    it('ConflictError has statusCode 409 and correct name', () => {
        const err = new ConflictError('already exists');
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.name, 'ConflictError');
        assert.ok(err instanceof Error);
    });

    it('ExternalServiceError has statusCode 503 and correct name', () => {
        const err = new ExternalServiceError('upstream down');
        assert.strictEqual(err.statusCode, 503);
        assert.strictEqual(err.name, 'ExternalServiceError');
        assert.ok(err instanceof Error);
    });

    it('RetryableError has statusCode 503, retryable flag, and correct name', () => {
        const err = new RetryableError('transient failure');
        assert.strictEqual(err.statusCode, 503);
        assert.strictEqual(err.name, 'RetryableError');
        assert.strictEqual(err.retryable, true);
        assert.ok(err instanceof Error);
    });

    it('default messages are set when no message is provided', () => {
        // ValidationError comes from validators.js and has no default message
        assert.ok(new NotFoundError().message.length > 0);
        assert.ok(new ConflictError().message.length > 0);
        assert.ok(new ExternalServiceError().message.length > 0);
        assert.ok(new RetryableError().message.length > 0);
    });
});

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe('formatError', () => {
    it('returns success:false with error message', () => {
        const result = formatError(new Error('oops'));
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error, 'oops');
    });

    it('includes errorCode when error.code is set', () => {
        const err = new Error('coded');
        err.code = 'MY_CODE';
        const result = formatError(err);
        assert.strictEqual(result.errorCode, 'MY_CODE');
    });

    it('includes field when error.field is set', () => {
        const err = new ValidationError('bad', 'email');
        const result = formatError(err);
        assert.strictEqual(result.field, 'email');
    });

    it('falls back to generic message for empty error', () => {
        const err = new Error();
        err.message = '';
        const result = formatError(err);
        assert.ok(result.error.length > 0);
    });
});

// ---------------------------------------------------------------------------
// handleError
// ---------------------------------------------------------------------------

describe('handleError', () => {
    it('sends 400 for ValidationError', () => {
        const res = makeRes();
        handleError(res, new ValidationError('bad'), null, 'ctx');
        assert.strictEqual(res._statusCode, 400);
        assert.strictEqual(res._body.success, false);
    });

    it('sends 404 for NotFoundError', () => {
        const res = makeRes();
        handleError(res, new NotFoundError('missing'), null, 'ctx');
        assert.strictEqual(res._statusCode, 404);
    });

    it('sends 409 for ConflictError', () => {
        const res = makeRes();
        handleError(res, new ConflictError('dupe'), null, 'ctx');
        assert.strictEqual(res._statusCode, 409);
    });

    it('sends 503 for ExternalServiceError', () => {
        const res = makeRes();
        handleError(res, new ExternalServiceError('down'), null, 'ctx');
        assert.strictEqual(res._statusCode, 503);
    });

    it('sends 500 for plain Error without statusCode', () => {
        const res = makeRes();
        handleError(res, new Error('unexpected'), null, 'ctx');
        assert.strictEqual(res._statusCode, 500);
    });

    it('calls logger.warn for client errors (4xx)', () => {
        const warnings = [];
        const logger = { warn: (m) => warnings.push(m), error: () => {} };
        const res = makeRes();
        handleError(res, new NotFoundError('gone'), logger, 'ctx');
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0].includes('gone'));
    });

    it('calls logger.error for server errors (5xx)', () => {
        const errors = [];
        const logger = { warn: () => {}, error: (m) => errors.push(m) };
        const res = makeRes();
        handleError(res, new Error('crash'), logger, 'ctx');
        assert.strictEqual(errors.length, 1);
    });
});

// ---------------------------------------------------------------------------
// safeRoute
// ---------------------------------------------------------------------------

describe('safeRoute', () => {
    it('passes through for successful handlers', async () => {
        const handler = safeRoute(async (req, res) => {
            res.json({ success: true, data: 'ok' });
        });
        const req = makeReq();
        const res = makeRes();
        await handler(req, res, () => {});
        assert.strictEqual(res._body.success, true);
        assert.strictEqual(res._body.data, 'ok');
    });

    it('maps ValidationError to 400 JSON response', async () => {
        const handler = safeRoute(async (req, res) => {
            throw new ValidationError('name required', 'name');
        });
        const req = makeReq();
        const res = makeRes();
        await handler(req, res, () => {});
        assert.strictEqual(res._statusCode, 400);
        assert.strictEqual(res._body.success, false);
        assert.ok(res._body.error.includes('name required'));
    });

    it('maps NotFoundError to 404 JSON response', async () => {
        const handler = safeRoute(async (req, res) => {
            throw new NotFoundError('item missing');
        });
        const req = makeReq();
        const res = makeRes();
        await handler(req, res, () => {});
        assert.strictEqual(res._statusCode, 404);
        assert.strictEqual(res._body.success, false);
    });

    it('maps plain Error to 500 JSON response', async () => {
        const handler = safeRoute(async () => {
            throw new Error('unexpected crash');
        });
        const req = makeReq();
        const res = makeRes();
        await handler(req, res, () => {});
        assert.strictEqual(res._statusCode, 500);
        assert.strictEqual(res._body.success, false);
    });

    it('handles async rejection without crashing', async () => {
        const handler = safeRoute(async () => {
            await Promise.reject(new ExternalServiceError('service down'));
        });
        const req = makeReq();
        const res = makeRes();
        // Must not throw
        await handler(req, res, () => {});
        assert.strictEqual(res._statusCode, 503);
    });

    it('logs errors when logger is provided', async () => {
        const logged = [];
        const logger = { warn: (m) => logged.push({ level: 'warn', m }), error: (m) => logged.push({ level: 'error', m }) };
        const handler = safeRoute(async () => {
            throw new ValidationError('bad');
        }, logger);
        const req = makeReq();
        const res = makeRes();
        await handler(req, res, () => {});
        assert.ok(logged.some(l => l.level === 'warn'));
    });
});

// ---------------------------------------------------------------------------
// safeSocketHandler
// ---------------------------------------------------------------------------

describe('safeSocketHandler', () => {
    it('passes through for successful handlers', async () => {
        const emitted = [];
        const socket = makeSocket();
        const handler = safeSocketHandler('test:event', async (sock, data) => {
            sock.emit('test:result', { ok: true });
        });
        await handler(socket, { foo: 'bar' });
        assert.ok(socket._emitted.some(e => e.event === 'test:result'));
    });

    it('emits plugin:error on thrown error', async () => {
        const socket = makeSocket();
        const handler = safeSocketHandler('test:fail', async () => {
            throw new ValidationError('socket bad input');
        });
        await handler(socket, {});
        const errEvent = socket._emitted.find(e => e.event === 'plugin:error');
        assert.ok(errEvent, 'plugin:error event should be emitted');
        assert.ok(errEvent.data.error.includes('socket bad input'));
        assert.strictEqual(errEvent.data.event, 'test:fail');
    });

    it('includes statusCode in plugin:error payload', async () => {
        const socket = makeSocket();
        const handler = safeSocketHandler('test:notfound', async () => {
            throw new NotFoundError('resource gone');
        });
        await handler(socket, {});
        const errEvent = socket._emitted.find(e => e.event === 'plugin:error');
        assert.strictEqual(errEvent.data.statusCode, 404);
    });

    it('handles async rejection without crashing the process', async () => {
        const socket = makeSocket();
        const handler = safeSocketHandler('test:async', async () => {
            await Promise.reject(new Error('async boom'));
        });
        // Must resolve without throwing
        await assert.doesNotReject(() => handler(socket, {}));
        assert.ok(socket._emitted.some(e => e.event === 'plugin:error'));
    });

    it('logs errors when logger is provided', async () => {
        const logged = [];
        const logger = { warn: (m) => logged.push(m), error: (m) => logged.push(m) };
        const socket = makeSocket();
        const handler = safeSocketHandler('test:logged', async () => {
            throw new Error('internal socket error');
        }, logger);
        await handler(socket, {});
        assert.ok(logged.length > 0);
    });
});

// ---------------------------------------------------------------------------
// safeActionHandler
// ---------------------------------------------------------------------------

describe('safeActionHandler', () => {
    it('returns result from successful function', async () => {
        const result = await safeActionHandler('my.action', async () => ({ value: 42 }));
        assert.strictEqual(result.value, 42);
    });

    it('re-throws typed errors unchanged', async () => {
        const err = new ValidationError('missing param', 'x');
        await assert.rejects(
            () => safeActionHandler('my.action', async () => { throw err; }),
            (e) => e === err
        );
    });

    it('re-throws plain errors unchanged', async () => {
        await assert.rejects(
            () => safeActionHandler('my.action', async () => { throw new Error('boom'); }),
            /boom/
        );
    });

    it('logs errors when logger is provided', async () => {
        const logged = [];
        const logger = { warn: (m) => logged.push({ level: 'warn', m }), error: (m) => logged.push({ level: 'error', m }) };
        await assert.rejects(
            () => safeActionHandler('my.action', async () => { throw new Error('log me'); }, logger)
        );
        assert.ok(logged.length > 0);
    });

    it('logs at warn level for client errors (4xx)', async () => {
        const logged = [];
        const logger = { warn: (m) => logged.push({ level: 'warn', m }), error: (m) => logged.push({ level: 'error', m }) };
        await assert.rejects(
            () => safeActionHandler('act', async () => { throw new ValidationError('bad'); }, logger)
        );
        assert.ok(logged.some(l => l.level === 'warn'));
    });
});

// ---------------------------------------------------------------------------
// APIBridgePlugin.executeAction integration
// ---------------------------------------------------------------------------

describe('APIBridgePlugin.executeAction', () => {
    // Minimal mock API for the plugin constructor
    function makePluginApi() {
        return {
            log: () => {},
            emit: () => {},
            registerRoute: () => {},
            registerSocket: () => {},
            registerTikTokEvent: () => {},
            getSocketIO: () => ({ emit: () => {} })
        };
    }

    let APIBridgePlugin;
    beforeAll(() => {
        APIBridgePlugin = require('../plugins/api-bridge/main.js');
    });

    it('throws NotFoundError for unknown actionId', async () => {
        const plugin = new APIBridgePlugin(makePluginApi());
        await assert.rejects(
            () => plugin.executeAction('nonexistent.action', {}),
            (err) => err.name === 'NotFoundError' && err.statusCode === 404
        );
    });

    it('throws ValidationError for missing required parameter', async () => {
        const plugin = new APIBridgePlugin(makePluginApi());
        // tts.speak requires 'text'
        await assert.rejects(
            () => plugin.executeAction('tts.speak', {}),
            (err) => err.name === 'ValidationError' && err.statusCode === 400
        );
    });

    it('throws ValidationError from within action handler', async () => {
        const plugin = new APIBridgePlugin(makePluginApi());
        // sound.play requires 'soundId' - it passes parameter validation (soundId missing triggers internal check too)
        await assert.rejects(
            () => plugin.executeAction('sound.play', {}),
            (err) => err.name === 'ValidationError'
        );
    });

    it('returns result for valid action execution', async () => {
        const plugin = new APIBridgePlugin(makePluginApi());
        const result = await plugin.executeAction('tts.skip', {});
        assert.ok(result && result.message);
    });
});

// ---------------------------------------------------------------------------
// Goals IFTTT executor integration
// ---------------------------------------------------------------------------

describe('Goals IFTTT executors via registerIFTTTActions', () => {
    function makeGoalsApi() {
        const actions = new Map();
        return {
            _actions: actions,
            log: () => {},
            emit: () => {},
            registerRoute: () => {},
            registerSocket: () => {},
            registerTikTokEvent: () => {},
            registerFlowAction: () => {},
            registerIFTTTAction: (id, cfg) => { actions.set(id, cfg); },
            getSocketIO: () => ({ emit: () => {} }),
            iftttEngine: true
        };
    }

    function makeGoalsPlugin(api, dbGoal = null) {
        const GoalsPlugin = require('../plugins/goals/main.js');
        // Stub heavy sub-modules so we can test IFTTT executors in isolation
        const stub = Object.create(GoalsPlugin.prototype);
        stub.api = api;
        stub.db = {
            getAllGoals: () => [],
            getGoal: (id) => dbGoal,
            resetGoal: (id) => ({ id, current_value: 0 }),
            updateGoal: (id, data) => ({ id, ...data })
        };
        stub.stateMachineManager = {
            getMachine: () => ({ reset: () => {}, initialize: () => {}, listenerCount: () => 0 })
        };
        stub.eventHandlers = { setGoalValue: () => {}, incrementGoal: () => {} };
        stub.broadcastGoalReset = () => {};
        stub.broadcastGoalUpdated = () => {};
        stub.registerIFTTTActions.call(stub);
        return stub;
    }

    it('goals:set_value throws ValidationError when goalId is 0 or value is NaN', async () => {
        const api = makeGoalsApi();
        const plugin = makeGoalsPlugin(api);
        const action = api._actions.get('goals:set_value');
        assert.ok(action, 'goals:set_value action must be registered');
        await assert.rejects(
            () => action.executor({ goalId: 0, value: 'notanumber' }, {}, { logger: null }),
            (err) => err.name === 'ValidationError' && err.statusCode === 400
        );
    });

    it('goals:increment throws ValidationError when goalId is 0', async () => {
        const api = makeGoalsApi();
        const plugin = makeGoalsPlugin(api);
        const action = api._actions.get('goals:increment');
        await assert.rejects(
            () => action.executor({ goalId: 0, amount: 1 }, {}, { logger: null }),
            (err) => err.name === 'ValidationError'
        );
    });

    it('goals:reset throws ValidationError when goalId is 0', async () => {
        const api = makeGoalsApi();
        const plugin = makeGoalsPlugin(api);
        const action = api._actions.get('goals:reset');
        await assert.rejects(
            () => action.executor({ goalId: 0 }, {}, { logger: null }),
            (err) => err.name === 'ValidationError'
        );
    });

    it('goals:toggle throws ValidationError when goalId is 0', async () => {
        const api = makeGoalsApi();
        const plugin = makeGoalsPlugin(api, null);
        const action = api._actions.get('goals:toggle');
        await assert.rejects(
            () => action.executor({ goalId: 0 }, {}, { logger: null }),
            (err) => err.name === 'ValidationError'
        );
    });

    it('goals:toggle throws NotFoundError when goal does not exist', async () => {
        const api = makeGoalsApi();
        // dbGoal = null → goal not found
        const plugin = makeGoalsPlugin(api, null);
        const action = api._actions.get('goals:toggle');
        await assert.rejects(
            () => action.executor({ goalId: 5 }, {}, { logger: null }),
            (err) => err.name === 'NotFoundError' && err.statusCode === 404
        );
    });
});
