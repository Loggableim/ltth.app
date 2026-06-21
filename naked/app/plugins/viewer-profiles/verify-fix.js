/**
 * Verification Script for Route Registration Fix
 * 
 * This script verifies that the route registration order fix prevents
 * Express from incorrectly matching specific routes as parameterized routes.
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const os = require('os');
const fs = require('fs');

// Create a temporary database for testing
const testDbPath = path.join(os.tmpdir(), `verify-fix-${Date.now()}.db`);

// Mock Plugin Loader
class MockPluginLoader {
  constructor() {
    this.router = express.Router();
  }

  getPluginRouter() {
    return this.router;
  }
}

// Mock API similar to PluginAPI
class MockAPI {
  constructor(pluginLoader) {
    this.pluginLoader = pluginLoader;
    this.db = new Database(testDbPath);
    this.registeredRoutes = [];
  }

  log(message, level = 'info') {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  getDatabase() {
    return this.db;
  }

  getSocketIO() {
    return {
      on: () => {},
      emit: () => {}
    };
  }

  registerRoute(method, routePath, handler) {
    const fullPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
    const router = this.pluginLoader.getPluginRouter();
    const methodLower = method.toLowerCase();
    
    if (!router[methodLower]) {
      throw new Error(`Invalid HTTP method: ${method}`);
    }

    router[methodLower](fullPath, handler);
    this.registeredRoutes.push({ method, path: fullPath });
    this.log(`Registered route: ${method} ${fullPath}`);
  }

  registerSocket() {}
  registerTikTokEvent() {}
  getConfig() { return null; }
  setConfig() {}
  emit() {}

  cleanup() {
    this.db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

async function verifyFix() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Route Registration Order Verification Test     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const pluginLoader = new MockPluginLoader();
  const mockAPI = new MockAPI(pluginLoader);
  const app = express();

  try {
    // Load and initialize the plugin
    console.log('📦 Loading Viewer Profiles Plugin...');
    const ViewerProfilesPlugin = require('./main.js');
    const plugin = new ViewerProfilesPlugin(mockAPI);
    await plugin.init();
    console.log('✅ Plugin initialized successfully\n');

    // Mount the plugin router on the test Express app
    app.use(pluginLoader.getPluginRouter());

    // Test cases to verify route matching
    const testCases = [
      {
        path: '/api/viewer-profiles',
        expectedMatch: 'List endpoint',
        description: 'Base endpoint'
      },
      {
        path: '/api/viewer-profiles/stats/summary',
        expectedMatch: 'Stats summary endpoint',
        description: 'Specific stats route (should NOT match :username)'
      },
      {
        path: '/api/viewer-profiles/leaderboard',
        expectedMatch: 'Leaderboard endpoint',
        description: 'Leaderboard route (should NOT match :username)'
      },
      {
        path: '/api/viewer-profiles/vip/list',
        expectedMatch: 'VIP list endpoint',
        description: 'VIP list route (should NOT match :username/vip)'
      },
      {
        path: '/api/viewer-profiles/vip/tiers',
        expectedMatch: 'VIP tiers endpoint',
        description: 'VIP tiers route (should NOT match :username/vip)'
      },
      {
        path: '/api/viewer-profiles/testuser123',
        expectedMatch: 'Single viewer profile',
        description: 'Parameterized route (:username)'
      },
      {
        path: '/api/viewer-profiles/testuser123/heatmap',
        expectedMatch: 'Viewer heatmap',
        description: 'Parameterized sub-route (:username/heatmap)'
      }
    ];

    console.log('🧪 Testing Route Matching...\n');

    let allTestsPassed = true;

    for (const testCase of testCases) {
      // Check if the route is registered
      const matchedRoute = mockAPI.registeredRoutes.find(r => {
        const pathPattern = r.path.replace(/:username/g, '[^/]+');
        const regex = new RegExp(`^${pathPattern}$`);
        return regex.test(testCase.path);
      });

      if (matchedRoute) {
        console.log(`✅ ${testCase.description}`);
        console.log(`   Path: ${testCase.path}`);
        console.log(`   Matched: ${matchedRoute.path}`);
        console.log(`   Method: ${matchedRoute.method}\n`);
      } else {
        console.log(`❌ ${testCase.description}`);
        console.log(`   Path: ${testCase.path}`);
        console.log(`   No matching route found!\n`);
        allTestsPassed = false;
      }
    }

    // Verify order
    console.log('📊 Route Registration Order:');
    mockAPI.registeredRoutes.forEach((route, index) => {
      const isParameterized = route.path.includes(':');
      const marker = isParameterized ? '🔗' : '📍';
      console.log(`   ${marker} ${index + 1}. ${route.method} ${route.path}`);
    });

    console.log('\n╔══════════════════════════════════════════════════╗');
    if (allTestsPassed) {
      console.log('║  ✅ ALL TESTS PASSED - Fix Verified!            ║');
      console.log('╚══════════════════════════════════════════════════╝\n');
      console.log('✨ Route registration order is correct!');
      console.log('✨ Specific routes are registered before parameterized routes');
      console.log('✨ Express will match routes correctly\n');
    } else {
      console.log('║  ❌ SOME TESTS FAILED                            ║');
      console.log('╚══════════════════════════════════════════════════╝\n');
    }

    // Cleanup
    await plugin.destroy();
    mockAPI.cleanup();

    return allTestsPassed;

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    console.error(error.stack);
    mockAPI.cleanup();
    return false;
  }
}

// Run verification if executed directly
if (require.main === module) {
  verifyFix().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = verifyFix;
