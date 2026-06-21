/**
 * Test: Viewer Leaderboard Plugin Activation
 * Reproduces the issue where the plugin cannot be activated
 */

const path = require('path');
const fs = require('fs');

// Mock logger
const mockLogger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// Mock PluginAPI
class MockPluginAPI {
  static MAX_SQL_LOG_LENGTH = 100;
  
  constructor() {
    this.routes = [];
    this.socketEvents = [];
    this.tiktokEvents = [];
  }

  log(message, level = 'info') {
    mockLogger[level](message);
  }

  registerRoute(method, path, handler) {
    this.routes.push({ method, path, handler });
    this.log(`Registered route: ${method} ${path}`);
    return true;
  }

  registerSocket(event, callback) {
    this.socketEvents.push({ event, callback });
    this.log(`Registered socket event: ${event}`);
    return true;
  }

  registerTikTokEvent(event, callback) {
    this.tiktokEvents.push({ event, callback });
    this.log(`Registered TikTok event: ${event}`);
    return true;
  }

  getDatabase() {
    // Mock database with better-sqlite3-like API
    const mockDb = {
      exec: (sql) => {
        const maxLen = MockPluginAPI.MAX_SQL_LOG_LENGTH;
        const truncated = sql.length > maxLen 
          ? sql.substring(0, maxLen) + '...' 
          : sql;
        this.log(`Executing SQL: ${truncated}`, 'debug');
      },
      prepare: (sql) => {
        return {
          run: (...args) => ({ changes: 1 }),
          get: (...args) => null,
          all: (...args) => []
        };
      }
    };
    return { db: mockDb };
  }

  getSocketIO() {
    return {
      emit: (event, data) => {
        this.log(`Emitting socket event: ${event}`, 'debug');
      },
      on: (event, callback) => {
        this.log(`Registering socket event listener: ${event}`, 'debug');
      },
      to: (room) => {
        return {
          emit: (event, data) => {
            this.log(`Emitting to room ${room}: ${event}`, 'debug');
          }
        };
      }
    };
  }

  emit(event, data) {
    this.log(`Emitting event: ${event}`, 'debug');
  }

  getConfig(key) {
    return null;
  }

  setConfig(key, value) {
    return true;
  }

  registerFlowAction(name, handler) {
    this.log(`Registered flow action: ${name}`);
    return true;
  }

  registerIFTTTTrigger(name, handler) {
    this.log(`Registered IFTTT trigger: ${name}`);
    return true;
  }

  registerIFTTTCondition(name, handler) {
    this.log(`Registered IFTTT condition: ${name}`);
    return true;
  }

  registerIFTTTAction(name, handler) {
    this.log(`Registered IFTTT action: ${name}`);
    return true;
  }

  registerGCCECommand(name, handler) {
    this.log(`Registered GCCE command: ${name}`);
    return true;
  }
}

async function testPluginActivation() {
  console.log('Testing Viewer Leaderboard Plugin Activation');
  console.log('==============================================\n');

  const pluginDir = path.join(__dirname, '..', 'plugins', 'viewer-leaderboard');
  
  // Check plugin structure
  console.log('1. Checking plugin structure...');
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  const mainJsPath = path.join(pluginDir, 'main.js');
  const implJsPath = path.join(pluginDir, 'viewer-xp-impl.js');
  const dbJsPath = path.join(pluginDir, 'backend', 'database.js');

  if (!fs.existsSync(pluginJsonPath)) {
    throw new Error('plugin.json not found');
  }
  if (!fs.existsSync(mainJsPath)) {
    throw new Error('main.js not found');
  }
  if (!fs.existsSync(implJsPath)) {
    throw new Error('viewer-xp-impl.js not found');
  }
  if (!fs.existsSync(dbJsPath)) {
    throw new Error('backend/database.js not found');
  }
  console.log('✓ All required files exist\n');

  // Load plugin.json
  console.log('2. Loading plugin.json...');
  const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
  console.log(`   Plugin ID: ${manifest.id}`);
  console.log(`   Plugin Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  console.log(`   Entry: ${manifest.entry}`);
  console.log(`   Enabled (default): ${manifest.enabled}`);
  console.log('✓ Plugin manifest loaded\n');

  // Try to require the plugin
  console.log('3. Requiring plugin module...');
  try {
    const PluginClass = require(mainJsPath);
    console.log('✓ Plugin module required successfully\n');

    // Try to instantiate the plugin
    console.log('4. Instantiating plugin...');
    const mockAPI = new MockPluginAPI();
    const pluginInstance = new PluginClass(mockAPI);
    console.log('✓ Plugin instantiated successfully\n');

    // Try to initialize the plugin
    console.log('5. Initializing plugin...');
    await pluginInstance.init();
    console.log('✓ Plugin initialized successfully\n');

    console.log('SUCCESS: Plugin can be activated without errors!');
    return true;
  } catch (error) {
    console.error('\n❌ ERROR during plugin activation:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    return false;
  }
}

// Run the test
testPluginActivation()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
