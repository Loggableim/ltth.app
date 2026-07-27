'use strict';

const fs = require('fs');
const path = require('path');

describe('stable overlay routing server wiring', () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, '..', 'server.js'),
    'utf8'
  );

  test('derives authorized parties from NetworkManager instead of request headers', () => {
    expect(serverSource).toContain(
      '.getAllowedOrigins(PORT || 3000)'
    );
    expect(serverSource).toContain(
      'getAuthorizedParties: getStableOverlayAuthorizedParties'
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
});
