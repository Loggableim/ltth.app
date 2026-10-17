'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const blockedFailure = Object.freeze({
  code: 'PLUGIN_CLEANUP_BLOCKED',
  message: 'Server restart is blocked because plugin cleanup did not complete.'
});
const failureMapperStart = serverSource.indexOf('const BLOCKED_PLUGIN_CLEANUP_FAILURE');
const failureMapperEnd = serverSource.indexOf('const serverRestartCoordinator', failureMapperStart);
const normalizeServerRestartFailure = vm.runInNewContext(
  `${serverSource.slice(failureMapperStart, failureMapperEnd)}; normalizeServerRestartFailure`
);

function extractRouteHandler({ method, route, endMarker, context }) {
  const startMarker = `app.${method}('${route}'`;
  const start = serverSource.indexOf(startMarker);
  const end = serverSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate ${method.toUpperCase()} ${route} in server.js`);
  }

  let handler;
  const app = {
    [method]: (_route, _limiter, registeredHandler) => {
      handler = registeredHandler;
    }
  };
  vm.runInNewContext(serverSource.slice(start, end), {
    app,
    apiLimiter: {},
    ...context
  });
  return handler;
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

describe('blocked restart cleanup API contract', () => {
  test('reports loaded and pending profiles separately with sanitized restart state', () => {
    const handler = extractRouteHandler({
      method: 'get',
      route: '/api/profiles/active',
      endMarker: '// Neues Profil erstellen',
      context: {
        profileManager: { getActiveProfile: () => 'pending_creator' },
        loadedProfile: 'loaded_creator',
        PORT: 4242,
        serverRestartFailure: blockedFailure,
        BLOCKED_PLUGIN_CLEANUP_FAILURE: blockedFailure,
        logger: { error: jest.fn() }
      }
    });
    const response = createResponse();

    handler({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      activeProfile: 'loaded_creator',
      pendingProfile: 'pending_creator',
      requiresRestart: true,
      restartState: 'blocked-cleanup',
      restartFailure: blockedFailure,
      port: 4242
    });
    expect(JSON.stringify(response.payload)).not.toContain('private-plugin-details');
    expect(JSON.stringify(response.payload)).not.toContain('internal stack details');
  });

  test('allows an explicit retry for retained plugin cleanup owners', () => {
    const scheduleServerRestartAfterResponse = jest.fn();
    const context = {
      serverRestartFailure: blockedFailure,
      serverRestartScheduled: false,
      BLOCKED_PLUGIN_CLEANUP_FAILURE: blockedFailure,
      scheduleServerRestartAfterResponse,
      logger: { info: jest.fn(), error: jest.fn() }
    };
    const handler = extractRouteHandler({
      method: 'post',
      route: '/api/server/restart',
      endMarker: '// Profil-Backup erstellen',
      context
    });
    const response = createResponse();

    handler({}, response);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      success: true,
      message: 'Server is restarting...',
      restartFailure: null,
      restartScheduled: true
    });
    expect(scheduleServerRestartAfterResponse).toHaveBeenCalledWith(response, 'manual restart API');
  });

  test('preserves the existing plugin cleanup failure payload', () => {
    expect(normalizeServerRestartFailure({
      stage: 'plugin cleanup',
      error: { code: 'INTERNAL_PLUGIN_ERROR', message: 'private plugin details' }
    })).toEqual(blockedFailure);
  });

  test.each([
    [
      'database-event-flush',
      'Server restart is blocked because pending database events could not be flushed.',
      'SQLITE_FLUSH_FAILED'
    ],
    [
      'database-close',
      'Server restart is blocked because the database could not be closed cleanly.',
      'SQLITE_CLOSE_FAILED'
    ]
  ])('maps %s to a truthful sanitized status and restart response', (stage, message, failureCode) => {
    const privateDetail = 'C:\\private\\database.sqlite SECRET=hidden';
    const restartFailure = normalizeServerRestartFailure({
      stage,
      error: { name: 'Error', code: failureCode, message: privateDetail, stack: privateDetail }
    });
    const expected = {
      code: 'RESTART_CLEANUP_BLOCKED',
      message,
      stage,
      failureCode
    };
    expect(restartFailure).toEqual(expected);
    expect(JSON.stringify(restartFailure)).not.toContain(privateDetail);
    expect(JSON.stringify(restartFailure)).not.toContain('SECRET');

    const profileHandler = extractRouteHandler({
      method: 'get',
      route: '/api/profiles/active',
      endMarker: '// Neues Profil erstellen',
      context: {
        profileManager: { getActiveProfile: () => 'active_creator' },
        loadedProfile: 'active_creator',
        PORT: 4242,
        serverRestartFailure: restartFailure,
        BLOCKED_PLUGIN_CLEANUP_FAILURE: blockedFailure,
        logger: { error: jest.fn() }
      }
    });
    const profileResponse = createResponse();
    profileHandler({}, profileResponse);
    expect(profileResponse.payload).toEqual({
      activeProfile: 'active_creator',
      pendingProfile: undefined,
      requiresRestart: false,
      restartState: 'blocked-cleanup',
      restartFailure: expected,
      port: 4242
    });

    const restartHandler = extractRouteHandler({
      method: 'post',
      route: '/api/server/restart',
      endMarker: '// Profil-Backup erstellen',
      context: {
        serverRestartFailure: restartFailure,
        serverRestartScheduled: true,
        BLOCKED_PLUGIN_CLEANUP_FAILURE: blockedFailure,
        scheduleServerRestartAfterResponse: jest.fn(),
        logger: { info: jest.fn(), error: jest.fn() }
      }
    });
    const restartResponse = createResponse();
    restartHandler({}, restartResponse);
    expect(restartResponse.statusCode).toBe(503);
    expect(restartResponse.payload).toEqual({
      success: false,
      message,
      errorCode: 'RESTART_CLEANUP_BLOCKED',
      restartFailure: expected,
      restartScheduled: false
    });
    expect(JSON.stringify(restartResponse.payload)).not.toContain('private\\\\database');
  });

  test('does not expose unrecognized stages or invalid failure codes', () => {
    expect(normalizeServerRestartFailure({
      stage: 'private-user-path',
      error: { code: 'SQLITE_CLOSE_FAILED', message: 'hidden' }
    })).toEqual({
      code: 'RESTART_CLEANUP_BLOCKED',
      message: 'Server restart cleanup did not complete.'
    });
  });
});
