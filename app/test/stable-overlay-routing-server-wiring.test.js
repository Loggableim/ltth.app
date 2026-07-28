'use strict';

const fs = require('fs');
const path = require('path');

describe('stable overlay routing server wiring', () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, '..', 'server.js'),
    'utf8'
  );

  test('derives Clerk claim parties only from trusted Clerk configuration', () => {
    expect(serverSource).not.toContain(
      'getStableOverlayAuthorizedParties = () => networkManager'
    );
    expect(serverSource).not.toMatch(
      /getClerkAuthorizedParties:[\s\S]{0,200}getAllowedOrigins/
    );
    expect(serverSource).toContain(
      'getClerkAuthorizedParties: getStableOverlayClerkAuthorizedParties'
    );
    expect(serverSource).toContain(
      'buildStableOverlayClerkAuthorizedParties('
    );
    expect(serverSource).toContain(
      'lifecycle: stableOverlayRoutingLifecycle'
    );
  });

  test('stops stable routing before potentially slow plugin cleanup', () => {
    const shutdownStart = serverSource.indexOf(
      'async function gracefulShutdown(signal)'
    );
    const stableShutdown = serverSource.indexOf(
      'await stableOverlayRoutingLifecycle.shutdown()',
      shutdownStart
    );
    const pluginCleanup = serverSource.indexOf(
      'const loadedPluginIds =',
      shutdownStart
    );

    expect(shutdownStart).toBeGreaterThan(-1);
    expect(stableShutdown).toBeGreaterThan(shutdownStart);
    expect(pluginCleanup).toBeGreaterThan(stableShutdown);
  });

  test('routes manual and profile restarts through the bounded stable lifecycle coordinator', () => {
    expect(serverSource).toContain(
      'createServerRestartCoordinator({'
    );
    expect(serverSource).toContain(
      'stableLifecycle: stableOverlayRoutingLifecycle'
    );
    expect(serverSource).toContain(
      'serverRestartCoordinator.schedule(reason)'
    );
    expect(serverSource).toContain(
      "scheduleServerRestartAfterResponse(res, 'manual restart API')"
    );
    expect(serverSource).toContain(
      'scheduleServerRestartAfterResponse(res, `profile switch to ${username}`)'
    );
  });
});
