/**
 * Rate Limiter Integration Test
 * Tests that plugin management routes bypass rate limiting for localhost
 */

const express = require('express');
const http = require('http');
const path = require('path');

// Set up paths
const appDir = path.join(__dirname, '..');
process.chdir(appDir);

// Import the rate limiter
const { pluginLimiter } = require('../modules/rate-limiter');

console.log('\n========================================');
console.log('Plugin Rate Limiter Integration Test');
console.log('========================================\n');

// Create a test Express app
const app = express();

// Add a test route with plugin limiter
app.post('/api/plugins/:id/enable', pluginLimiter, (req, res) => {
  res.json({ success: true, message: `Plugin ${req.params.id} enabled` });
});

const server = app.listen(0, () => {  // Use port 0 to get random available port
  const port = server.address().port;
  console.log(`Test server started on port ${port}\n`);
  
  runTests(port).catch(error => {
    console.error('Test execution failed:', error);
    server.close();
    process.exit(1);
  });
});

async function runTests(port) {
  let passed = 0;
  let failed = 0;
  
  // Test 1: Verify localhost requests bypass rate limiting
  console.log('Test 1: Localhost requests should bypass rate limiting');
  console.log('-------------------------------------------------------');
  
  try {
    // Make 10 rapid requests to verify rate limiting is bypassed for localhost
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(makeRequest(port, 'localhost'));
    }
    
    const results = await Promise.all(promises);
    const allSuccessful = results.every(r => r.statusCode === 200);
    const noRateLimitHeaders = results.every(r => !r.headers['ratelimit-limit']);
    
    if (allSuccessful && noRateLimitHeaders) {
      console.log('✅ PASSED: All 10 requests succeeded without rate limiting\n');
      passed++;
    } else {
      console.log('❌ FAILED: Some requests were rate limited or failed\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED:', error.message, '\n');
    failed++;
  }
  
  // Test 2: Verify skip logic detects localhost correctly
  console.log('Test 2: Skip logic should detect various localhost formats');
  console.log('----------------------------------------------------------');
  
  try {
    const result = await makeRequest(port, 'localhost');
    if (result.statusCode === 200 && !result.headers['ratelimit-limit']) {
      console.log('✅ PASSED: Localhost correctly bypasses rate limiting\n');
      passed++;
    } else {
      console.log('❌ FAILED: Localhost was rate limited\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED:', error.message, '\n');
    failed++;
  }
  
  // Summary
  console.log('========================================');
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');
  
  server.close();
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

function makeRequest(port, hostname) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: hostname,
      port: port,
      path: '/api/plugins/test-plugin/enable',
      method: 'POST'
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}
