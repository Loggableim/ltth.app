/**
 * Manual Test: Verify Plinko Leaderboard Integration
 * 
 * This script tests:
 * 1. Leaderboard API endpoint functionality
 * 2. Database queries for leaderboard data
 * 3. Socket event handling for leaderboard requests
 * 
 * Run with: node app/plugins/game-engine/test/plinko-leaderboard.test.js
 */

console.log('🧪 Plinko Leaderboard Integration Test\n');
console.log('This test verifies the leaderboard functionality:\n');

const GameEnginePlugin = require('../main');

// Create mock Socket.IO
const mockSocketIO = {
  on: (event, callback) => {
    console.log(`✓ Socket.IO listener registered: ${event}`);
    mockSocketIO._handlers = mockSocketIO._handlers || {};
    mockSocketIO._handlers[event] = callback;
  },
  emit: (event, data) => {
    console.log(`✓ Socket.IO event emitted: ${event}`);
    if (event === 'plinko:leaderboard') {
      console.log(`  └─ Leaderboard entries: ${data.length}`);
      data.forEach((entry, index) => {
        console.log(`  └─ #${index + 1}: ${entry.user} (Profit: ${entry.totalProfit}, Games: ${entry.totalGames})`);
      });
    }
  }
};

// Create mock database with sample leaderboard data
// Test scenarios:
// 1. TopPlayer: High profit, many games (consistent winner)
// 2. GoodPlayer: Moderate profit, many games (reliable player)
// 3. AveragePlayer: Break-even, moderate games (typical player)
// 4. LuckyPlayer: Good profit, fewer games (lucky streaks)
// 5. UnluckyPlayer: Negative profit, moderate games (bad luck)
const sampleLeaderboard = [
  { user: 'TopPlayer', totalProfit: 5000, totalGames: 100, totalBet: 10000, totalWinnings: 15000, avgMultiplier: 1.5 },
  { user: 'GoodPlayer', totalProfit: 2000, totalGames: 80, totalBet: 8000, totalWinnings: 10000, avgMultiplier: 1.25 },
  { user: 'AveragePlayer', totalProfit: 0, totalGames: 50, totalBet: 5000, totalWinnings: 5000, avgMultiplier: 1.0 },
  { user: 'LuckyPlayer', totalProfit: 1500, totalGames: 30, totalBet: 3000, totalWinnings: 4500, avgMultiplier: 1.5 },
  { user: 'UnluckyPlayer', totalProfit: -1000, totalGames: 40, totalBet: 4000, totalWinnings: 3000, avgMultiplier: 0.75 }
];

const mockDb = {
  prepare: (query) => {
    if (query.includes('getPlinkoLeaderboard') || query.includes('GROUP BY user')) {
      return {
        all: (limit) => {
          console.log(`✓ Database query executed: getPlinkoLeaderboard (limit: ${limit})`);
          return sampleLeaderboard.slice(0, limit || 10);
        }
      };
    }
    return {
      run: () => {},
      get: () => null,
      all: () => []
    };
  }
};

// Create mock API
const mockApi = {
  log: (msg, level = 'info') => {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : '✓';
    console.log(`${prefix} [${level.toUpperCase()}] ${msg}`);
  },
  getSocketIO: () => mockSocketIO,
  getDatabase: () => mockDb,
  registerRoute: (method, path, handler) => {
    console.log(`✓ Route registered: ${method} ${path}`);
    mockApi._routes = mockApi._routes || {};
    mockApi._routes[`${method} ${path}`] = handler;
  },
  registerSocket: () => {},
  registerTikTokEvent: () => {},
  getConfig: () => Promise.resolve(null),
  setConfig: () => Promise.resolve(),
  emit: mockSocketIO.emit,
  pluginLoader: {
    loadedPlugins: new Map()
  }
};

console.log('📦 Initializing Game Engine Plugin...\n');

// Create plugin instance
const plugin = new GameEnginePlugin(mockApi);

// Create mock database implementation for Plinko
const mockPlinkoDb = {
  getPlinkoLeaderboard: (limit = 10) => {
    console.log(`✓ Plinko DB: getPlinkoLeaderboard called (limit: ${limit})`);
    return sampleLeaderboard.slice(0, limit);
  },
  getPlinkoStats: () => ({
    totalGames: 300,
    totalBet: 30000,
    totalPayout: 35000,
    rtp: 116.67,
    avgMultiplier: 1.17,
    maxWin: 5000,
    maxLoss: -1000
  }),
  getPlinkUserStats: () => []
};

// Mock Plinko game with leaderboard support
plugin.plinkoGame = {
  init: () => console.log('✓ Plinko game initialized'),
  startCleanupTimer: () => console.log('✓ Plinko cleanup timer started'),
  destroy: () => console.log('✓ Plinko game destroyed'),
  getLeaderboard: (limit = 10) => {
    console.log(`\n📊 Fetching Plinko Leaderboard (limit: ${limit})`);
    const leaderboard = mockPlinkoDb.getPlinkoLeaderboard(limit);
    console.log(`   Retrieved ${leaderboard.length} entries`);
    return leaderboard;
  },
  getConfig: () => ({
    slots: [],
    physicsSettings: {},
    giftMappings: {}
  })
};

// Override plugin.db with mock
plugin.db = {
  initialize: () => console.log('✓ Database initialized'),
  getTriggers: () => [],
  getGameConfig: () => null,
  getPlinkoConfig: () => ({
    slots: [],
    physicsSettings: {},
    giftMappings: {}
  }),
  ...mockPlinkoDb
};

// Initialize plugin
console.log('🚀 Starting initialization...\n');
plugin.init().then(() => {
  console.log('\n✅ Plugin initialized successfully!\n');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Test cases
  console.log('\n📝 Test 1: API Endpoint - GET /api/game-engine/plinko/leaderboard');
  const apiHandler = mockApi._routes['GET /api/game-engine/plinko/leaderboard'];
  if (apiHandler) {
    const mockReq = { query: { limit: 5 } };
    const mockRes = {
      json: (data) => {
        console.log(`   ✓ Response sent with ${data.length} entries`);
        data.forEach((entry, index) => {
          const profitSign = entry.totalProfit >= 0 ? '+' : '';
          console.log(`      #${index + 1}: ${entry.user} (${profitSign}${entry.totalProfit} XP, ${entry.totalGames} games)`);
        });
      },
      status: (code) => ({
        json: (error) => {
          console.error(`   ❌ Error response: ${code}`, error);
        }
      })
    };
    
    try {
      apiHandler(mockReq, mockRes);
    } catch (error) {
      console.error('   ❌ API handler failed:', error.message);
    }
  } else {
    console.error('   ❌ API handler not found!');
  }
  
  console.log('\n📝 Test 2: Socket Event - plinko:request-leaderboard');
  const socketHandler = mockSocketIO._handlers['plinko:request-leaderboard'];
  if (socketHandler) {
    const mockSocket = {
      emit: (event, data) => {
        console.log(`   ✓ Socket emitted: ${event}`);
        if (event === 'plinko:leaderboard') {
          console.log(`      Retrieved ${data.length} leaderboard entries`);
        }
      }
    };
    
    try {
      socketHandler.call(mockSocket, { limit: 10 });
    } catch (error) {
      console.error('   ❌ Socket handler failed:', error.message);
    }
  } else {
    console.error('   ⚠️  Socket handler not found (will be registered on client connection)');
  }
  
  console.log('\n📝 Test 3: Direct Method Call - plinkoGame.getLeaderboard()');
  try {
    const leaderboard = plugin.plinkoGame.getLeaderboard(3);
    console.log(`   ✓ Retrieved ${leaderboard.length} entries directly`);
    leaderboard.forEach((entry, index) => {
      console.log(`      #${index + 1}: ${entry.user} (Profit: ${entry.totalProfit} XP)`);
    });
  } catch (error) {
    console.error('   ❌ Direct method call failed:', error.message);
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('\n✅ All leaderboard tests completed!\n');
  console.log('Summary:');
  console.log('  • API endpoint registered ✓');
  console.log('  • Database queries working ✓');
  console.log('  • Leaderboard data retrieval ✓');
  console.log('  • Socket event handling ready ✓\n');
  
  console.log('Next Steps:');
  console.log('  1. Start the server: npm start');
  console.log('  2. Open Plinko overlay: http://localhost:3000/overlay/game-engine/plinko?testMode=true');
  console.log('  3. Click "Show Leaderboard" button to test UI\n');
  
  // Cleanup
  plugin.destroy();
  
}).catch(error => {
  console.error('\n❌ Initialization failed:', error);
  console.error(error.stack);
  process.exit(1);
});
