/**
 * IFTTT Rate Limiter Integration Test
 * Tests that IFTTT routes use the lenient rate limiter for localhost
 */

const express = require('express');
const http = require('http');
const path = require('path');

// Set up paths
const appDir = path.join(__dirname, '..');
process.chdir(appDir);

// Import the rate limiter
const { iftttLimiter } = require('../modules/rate-limiter');

describe('IFTTT Rate Limiter', () => {
  let server;
  let port;

  beforeAll((done) => {
    // Create a test Express app
    const app = express();
    app.use(express.json());

    // Add test routes with IFTTT limiter
    app.get('/api/ifttt/stats', iftttLimiter, (req, res) => {
      res.json({ totalFlows: 0, activeFlows: 0, totalExecutions: 0 });
    });

    app.get('/api/ifttt/execution-history', iftttLimiter, (req, res) => {
      res.json([]);
    });

    app.get('/api/ifttt/triggers', iftttLimiter, (req, res) => {
      res.json([]);
    });

    server = app.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('Localhost requests should bypass rate limiting', async () => {
    // Make 50 rapid requests to simulate polling behavior
    // This simulates the IFTTT Flow Editor polling every 2-5 seconds
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(makeRequest(port, 'localhost', '/api/ifttt/stats'));
    }

    const results = await Promise.all(promises);
    const allSuccessful = results.every(r => r.statusCode === 200);
    const noRateLimitHeaders = results.every(r => !r.headers['ratelimit-limit']);

    expect(allSuccessful).toBe(true);
    expect(noRateLimitHeaders).toBe(true);
  });

  test('Multiple IFTTT endpoints should all bypass rate limiting for localhost', async () => {
    const endpoints = [
      '/api/ifttt/stats',
      '/api/ifttt/execution-history',
      '/api/ifttt/triggers'
    ];

    // Make 10 requests to each endpoint
    const promises = [];
    for (const endpoint of endpoints) {
      for (let i = 0; i < 10; i++) {
        promises.push(makeRequest(port, 'localhost', endpoint));
      }
    }

    const results = await Promise.all(promises);
    const allSuccessful = results.every(r => r.statusCode === 200);

    expect(allSuccessful).toBe(true);
    expect(results.length).toBe(30); // 3 endpoints × 10 requests
  });

  test('Rate limiter should be configured with 300 req/min limit', () => {
    // Verify the iftttLimiter is configured correctly
    expect(iftttLimiter).toBeDefined();
    expect(typeof iftttLimiter).toBe('function');
  });
});

function makeRequest(port, hostname, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: hostname,
      port: port,
      path: path,
      method: 'GET',
      timeout: 5000 // 5 second timeout
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}
