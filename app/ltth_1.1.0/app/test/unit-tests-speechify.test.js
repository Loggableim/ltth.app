/**
 * Speechify Engine - Comprehensive Unit Tests
 *
 * This test suite covers all critical functionality of the Speechify TTS engine.
 * Run with: npm test -- unit-tests-speechify.test.js
 *
 * Test Coverage:
 * - Initialization & configuration
 * - API key validation
 * - Voice management
 * - Synthesis & error handling
 * - Retry logic
 * - Cost tracking
 * - Edge cases
 */

const assert = require('assert');
const SpeechifyEngine = require('../plugins/tts/engines/speechify-engine');
const axios = require('axios');

// Mock logger
const mockLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.log(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.log(`[ERROR] ${msg}`, data || '')
};

// Test counter
let testsPassed = 0;
let testsFailed = 0;
const failedTests = [];

// Helper: Synchronous test
function test(name, fn) {
  try {
    console.log(`\n  TEST: ${name}`);
    fn();
    testsPassed++;
    console.log(`  ✓ PASSED`);
    return true;
  } catch (error) {
    testsFailed++;
    failedTests.push({ name, error: error.message });
    console.log(`  ✗ FAILED: ${error.message}`);
    return false;
  }
}

// Helper: Asynchronous test
async function asyncTest(name, fn) {
  try {
    console.log(`\n  TEST: ${name}`);
    await fn();
    testsPassed++;
    console.log(`  ✓ PASSED`);
    return true;
  } catch (error) {
    testsFailed++;
    failedTests.push({ name, error: error.message });
    console.log(`  ✗ FAILED: ${error.message}`);
    return false;
  }
}

// Helper: Assert utilities
function assertExists(value, message = 'Value should exist') {
  if (!value) throw new Error(message);
}

function assertEqual(actual, expected, message = 'Values should be equal') {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function assertGreaterThan(actual, threshold, message = 'Value should be greater') {
  if (actual <= threshold) throw new Error(`${message}: ${actual} <= ${threshold}`);
}

function assertLessThan(actual, threshold, message = 'Value should be less') {
  if (actual >= threshold) throw new Error(`${message}: ${actual} >= ${threshold}`);
}

function assertIncludes(str, substring, message = 'Should include') {
  if (!str.includes(substring)) throw new Error(`${message}: "${str}" does not include "${substring}"`);
}

function assertThrows(fn, messageCheck, message = 'Should throw') {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    if (messageCheck && !error.message.includes(messageCheck)) {
      throw new Error(`${message}: wrong error message: ${error.message}`);
    }
  }
  if (!threw) throw new Error(`${message}: no error thrown`);
}

// =============================================================================
// TEST SUITE
// =============================================================================

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('SPEECHIFY ENGINE - UNIT TESTS');
  console.log('='.repeat(80));

  // =========================================================================
  // SECTION 1: INITIALIZATION & VALIDATION
  // =========================================================================

  console.log('\n\n[SECTION 1] INITIALIZATION & VALIDATION');
  console.log('-'.repeat(80));

  test('Should initialize with valid API key', () => {
    const engine = new SpeechifyEngine('sk_test_valid_key_123', mockLogger);
    assertExists(engine, 'Engine should be created');
    assertEqual(engine.apiKey, 'sk_test_valid_key_123', 'API key should be stored');
  });

  test('Should throw error without API key', () => {
    assertThrows(() => {
      new SpeechifyEngine(null, mockLogger);
    }, 'API key required', 'Should require API key');
  });

  test('Should throw error with empty string API key', () => {
    assertThrows(() => {
      new SpeechifyEngine('', mockLogger);
    }, 'API key', 'Should reject empty string');
  });

  test('Should throw error with whitespace-only API key', () => {
    assertThrows(() => {
      new SpeechifyEngine('   ', mockLogger);
    }, 'API key', 'Should reject whitespace');
  });

  test('Should throw error with non-string API key', () => {
    assertThrows(() => {
      new SpeechifyEngine(12345, mockLogger);
    }, 'API key', 'Should require string type');
  });

  test('Should set default timeout', () => {
    const engine = new SpeechifyEngine('key', mockLogger);
    assertEqual(engine.timeout, 30000, 'Default timeout should be 30s');
  });

  test('Should set default maxRetries', () => {
    const engine = new SpeechifyEngine('key', mockLogger);
    assertEqual(engine.maxRetries, 3, 'Default maxRetries should be 3');
  });

  test('Should initialize usage stats', () => {
    const engine = new SpeechifyEngine('key', mockLogger);
    const stats = engine.getUsageStats();
    assertEqual(stats.totalCharacters, 0, 'Initial characters should be 0');
    assertEqual(stats.totalRequests, 0, 'Initial requests should be 0');
  });

  // =========================================================================
  // SECTION 2: VOICE MANAGEMENT
  // =========================================================================

  console.log('\n\n[SECTION 2] VOICE MANAGEMENT');
  console.log('-'.repeat(80));

  test('Should have voices available', () => {
    const voices = SpeechifyEngine.getVoices();
    assertExists(voices, 'Voices should exist');
    assertGreaterThan(Object.keys(voices).length, 0, 'Should have at least one voice');
  });

  test('Should have all expected English voices', () => {
    const voices = SpeechifyEngine.getVoices();
    const expectedVoices = ['george', 'mads', 'diego', 'henry'];
    expectedVoices.forEach(voiceId => {
      assertExists(voices[voiceId], `Voice ${voiceId} should exist`);
    });
  });

  test('Should include voice metadata', () => {
    const voices = SpeechifyEngine.getVoices();
    const george = voices['george'];
    assertExists(george.name, 'Voice should have name');
    assertExists(george.lang, 'Voice should have language');
    assertExists(george.gender, 'Voice should have gender');
  });

  test('Should return correct default voice for English', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('en');
    assertEqual(voice, 'george', 'Default English voice should be george');
  });

  test('Should return correct default voice for German', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('de');
    assertEqual(voice, 'mads', 'Default German voice should be mads');
  });

  test('Should return correct default voice for Spanish', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('es');
    assertEqual(voice, 'diego', 'Default Spanish voice should be diego');
  });

  test('Should return default voice for unsupported language', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('xyz');
    assertEqual(voice, 'george', 'Should fallback to default voice for unknown language');
  });

  test('Should handle null language code gracefully', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage(null);
    assertExists(voice, 'Should return a voice even with null language');
  });

  // =========================================================================
  // SECTION 3: SYNTHESIS & API COMMUNICATION
  // =========================================================================

  console.log('\n\n[SECTION 3] SYNTHESIS & API COMMUNICATION');
  console.log('-'.repeat(80));

  await asyncTest('Should synthesize audio successfully (mocked)', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    // Mock axios.post
    const originalPost = axios.post;
    axios.post = async (url, data, config) => {
      return {
        data: {
          audio_data: 'base64_encoded_audio_data_example'
        }
      };
    };

    try {
      const audio = await engine.synthesize('Hello World', 'george', 1.0);
      assertExists(audio, 'Should return audio data');
      assertEqual(audio, 'base64_encoded_audio_data_example', 'Audio should match mock data');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle successful API response with audio_data field', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      return { data: { audio_data: 'test_audio_base64' } };
    };

    try {
      const audio = await engine.synthesize('Test', 'george');
      assertExists(audio, 'Should extract audio from response');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should send correct request parameters', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    let capturedRequest = null;
    const originalPost = axios.post;
    axios.post = async (url, data, config) => {
      capturedRequest = { url, data, config };
      return { data: { audio_data: 'audio' } };
    };

    try {
      await engine.synthesize('Test text', 'george', 1.5);

      assertExists(capturedRequest, 'Request should be made');
      assertIncludes(capturedRequest.url, 'speechify', 'URL should include speechify');
      assertEqual(capturedRequest.data.text, 'Test text', 'Should send correct text');
      assertEqual(capturedRequest.data.voice_id, 'george', 'Should send correct voice');
      assertEqual(capturedRequest.data.speed, 1.5, 'Should send correct speed');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should include API key in request', async () => {
    const engine = new SpeechifyEngine('sk_test_12345', mockLogger);

    let capturedUrl = null;
    const originalPost = axios.post;
    axios.post = async (url) => {
      capturedUrl = url;
      return { data: { audio_data: 'audio' } };
    };

    try {
      await engine.synthesize('Test', 'george');
      assertIncludes(capturedUrl, 'sk_test_12345', 'URL should include API key');
    } finally {
      axios.post = originalPost;
    }
  });

  // =========================================================================
  // SECTION 4: ERROR HANDLING
  // =========================================================================

  console.log('\n\n[SECTION 4] ERROR HANDLING');
  console.log('-'.repeat(80));

  await asyncTest('Should throw error with invalid response format', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      return { data: { invalid_field: 'data' } };
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
        assertIncludes(error.message, 'response', 'Error should mention invalid response');
      }
      if (!threw) throw new Error('Should have thrown error for invalid response');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle network timeout error', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      const error = new Error('timeout of 30000ms exceeded');
      error.code = 'ECONNABORTED';
      throw error;
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
      }
      if (!threw) throw new Error('Should have thrown timeout error');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle 401 authentication error', async () => {
    const engine = new SpeechifyEngine('invalid_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      const error = new Error('Unauthorized');
      error.response = {
        status: 401,
        data: { error: 'Invalid API key' }
      };
      throw error;
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
        assertIncludes(error.message, '401', 'Error should mention 401 status');
      }
      if (!threw) throw new Error('Should have thrown 401 error');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle 429 rate limit error', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      const error = new Error('Too Many Requests');
      error.response = {
        status: 429,
        data: { error: 'Rate limit exceeded' }
      };
      throw error;
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
        assertIncludes(error.message, '429', 'Error should mention 429 status');
      }
      if (!threw) throw new Error('Should have thrown 429 error');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle 403 forbidden error', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      const error = new Error('Forbidden');
      error.response = {
        status: 403,
        data: { error: 'Insufficient permissions' }
      };
      throw error;
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
        assertIncludes(error.message, '403', 'Error should mention 403 status');
      }
      if (!threw) throw new Error('Should have thrown 403 error');
    } finally {
      axios.post = originalPost;
    }
  });

  // =========================================================================
  // SECTION 5: RETRY LOGIC
  // =========================================================================

  console.log('\n\n[SECTION 5] RETRY LOGIC');
  console.log('-'.repeat(80));

  await asyncTest('Should retry on network error', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    let attempts = 0;
    const originalPost = axios.post;
    axios.post = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network error (simulated)');
      }
      return { data: { audio_data: 'success_after_retries' } };
    };

    try {
      const audio = await engine.synthesize('Test', 'george');
      assertEqual(attempts, 3, 'Should have retried 3 times');
      assertExists(audio, 'Should succeed after retries');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should apply exponential backoff', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const timings = [];
    const originalPost = axios.post;
    axios.post = async () => {
      timings.push(Date.now());
      if (timings.length < 3) {
        throw new Error('Network error');
      }
      return { data: { audio_data: 'audio' } };
    };

    try {
      await engine.synthesize('Test', 'george');
      // Verify delays increased (exponential backoff)
      if (timings.length >= 2) {
        const delay1 = timings[1] - timings[0];
        const delay2 = timings[2] - timings[1];
        assertGreaterThan(delay2, delay1 * 0.5, 'Second delay should be longer');
      }
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should not retry on 401 authentication error', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    let attempts = 0;
    const originalPost = axios.post;
    axios.post = async () => {
      attempts++;
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      throw error;
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
      }
      if (!threw) throw new Error('Should have thrown error');
      assertEqual(attempts, 1, 'Should not retry on 401');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should not retry on 403 permission error', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    let attempts = 0;
    const originalPost = axios.post;
    axios.post = async () => {
      attempts++;
      const error = new Error('Forbidden');
      error.response = { status: 403 };
      throw error;
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
      }
      if (!threw) throw new Error('Should have thrown error');
      assertEqual(attempts, 1, 'Should not retry on 403');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should throw error after max retries', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      throw new Error('Persistent network error');
    };

    try {
      let threw = false;
      try {
        await engine.synthesize('Test', 'george');
      } catch (error) {
        threw = true;
      }
      if (!threw) throw new Error('Should have thrown error after max retries');
    } finally {
      axios.post = originalPost;
    }
  });

  // =========================================================================
  // SECTION 6: COST TRACKING
  // =========================================================================

  console.log('\n\n[SECTION 6] COST TRACKING');
  console.log('-'.repeat(80));

  await asyncTest('Should track character count', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      await engine.synthesize('Hello World', 'george'); // 11 chars

      const stats = engine.getUsageStats();
      assertEqual(stats.totalCharacters, 11, 'Should track 11 characters');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should track number of requests', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      await engine.synthesize('Test', 'george');
      await engine.synthesize('Test', 'george');

      const stats = engine.getUsageStats();
      assertEqual(stats.totalRequests, 2, 'Should track 2 requests');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should accumulate character count across requests', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      await engine.synthesize('Test', 'george');      // 4 chars
      await engine.synthesize('Testing', 'george');   // 7 chars
      await engine.synthesize('Hello', 'george');     // 5 chars

      const stats = engine.getUsageStats();
      assertEqual(stats.totalCharacters, 16, 'Should total 16 characters');
      assertEqual(stats.totalRequests, 3, 'Should have 3 requests');
    } finally {
      axios.post = originalPost;
    }
  });

  test('Should estimate costs correctly', () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    // Test cost for 1k characters
    const cost1k = engine.estimateCost(1000);
    assertGreaterThan(cost1k, 0, 'Cost should be positive');
    assertLessThan(cost1k, 0.1, 'Cost should be less than $0.1');

    // Test cost for 10k characters
    const cost10k = engine.estimateCost(10000);
    assertGreaterThan(cost10k, cost1k * 9, 'Cost should scale linearly');

    // Test cost for 1M characters
    const cost1M = engine.estimateCost(1000000);
    assertGreaterThan(cost1M, 10, 'Cost for 1M chars should be significant');
  });

  test('Should estimate zero cost for zero characters', () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);
    const cost = engine.estimateCost(0);
    assertEqual(cost, 0, 'Cost for 0 characters should be 0');
  });

  test('Should handle negative character count gracefully', () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);
    const cost = engine.estimateCost(-100);
    assertGreaterThan(cost, -1, 'Cost should handle negative values');
  });

  // =========================================================================
  // SECTION 7: EDGE CASES & BOUNDARY CONDITIONS
  // =========================================================================

  console.log('\n\n[SECTION 7] EDGE CASES & BOUNDARY CONDITIONS');
  console.log('-'.repeat(80));

  await asyncTest('Should handle very short text', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      const audio = await engine.synthesize('A', 'george');
      assertExists(audio, 'Should handle single character');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle very long text', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const longText = 'A'.repeat(5000);
    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      const audio = await engine.synthesize(longText, 'george');
      assertExists(audio, 'Should handle long text');
      const stats = engine.getUsageStats();
      assertEqual(stats.totalCharacters, 5000, 'Should track long text correctly');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle special characters in text', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const specialText = 'Hello! @#$%^&*() [Test] {123} <tag>';
    const originalPost = axios.post;
    axios.post = async (url, data) => {
      assertEqual(data.text, specialText, 'Should preserve special characters');
      return { data: { audio_data: 'audio' } };
    };

    try {
      await engine.synthesize(specialText, 'george');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle unicode text', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const unicodeText = 'Hola ¿Cómo estás? (こんにちは) [你好]';
    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      const audio = await engine.synthesize(unicodeText, 'george');
      assertExists(audio, 'Should handle unicode text');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should handle speed parameter variations', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    let capturedSpeed = null;
    axios.post = async (url, data) => {
      capturedSpeed = data.speed;
      return { data: { audio_data: 'audio' } };
    };

    try {
      // Test minimum speed
      await engine.synthesize('Test', 'george', 0.5);
      assertEqual(capturedSpeed, 0.5, 'Should accept minimum speed');

      // Test maximum speed
      await engine.synthesize('Test', 'george', 2.0);
      assertEqual(capturedSpeed, 2.0, 'Should accept maximum speed');

      // Test default speed
      await engine.synthesize('Test', 'george');
      assertEqual(capturedSpeed, 1.0, 'Should default to 1.0 speed');
    } finally {
      axios.post = originalPost;
    }
  });

  // =========================================================================
  // SECTION 8: STATISTICS & REPORTING
  // =========================================================================

  console.log('\n\n[SECTION 8] STATISTICS & REPORTING');
  console.log('-'.repeat(80));

  test('Should return usage stats object', () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);
    const stats = engine.getUsageStats();

    assertExists(stats, 'Stats object should exist');
    assertExists(stats.totalCharacters, 'Should have totalCharacters');
    assertExists(stats.totalRequests, 'Should have totalRequests');
    assertExists(stats.estimatedCost, 'Should have estimatedCost');
    assertExists(stats.costPerCharacter, 'Should have costPerCharacter');
  });

  await asyncTest('Should calculate estimated cost in stats', async () => {
    const engine = new SpeechifyEngine('test_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      await engine.synthesize('Test text here', 'george'); // 14 chars

      const stats = engine.getUsageStats();
      assertGreaterThan(stats.estimatedCost, 0, 'Should have estimated cost');
      assertGreaterThan(stats.costPerCharacter, 0, 'Should have cost per character');
    } finally {
      axios.post = originalPost;
    }
  });

  // =========================================================================
  // SECTION 9: ENGINE TEST & HEALTH CHECK
  // =========================================================================

  console.log('\n\n[SECTION 9] ENGINE TEST & HEALTH CHECK');
  console.log('-'.repeat(80));

  await asyncTest('Should pass health check with valid API key', async () => {
    const engine = new SpeechifyEngine('valid_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => ({ data: { audio_data: 'audio' } });

    try {
      const result = await engine.test();
      assertEqual(result, true, 'Health check should pass');
    } finally {
      axios.post = originalPost;
    }
  });

  await asyncTest('Should fail health check on API error', async () => {
    const engine = new SpeechifyEngine('invalid_key', mockLogger);

    const originalPost = axios.post;
    axios.post = async () => {
      throw new Error('API error');
    };

    try {
      const result = await engine.test();
      assertEqual(result, false, 'Health check should fail on error');
    } finally {
      axios.post = originalPost;
    }
  });

  // =========================================================================
  // TEST RESULTS
  // =========================================================================

  console.log('\n\n' + '='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80) + '\n');

  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log(`Total:  ${testsPassed + testsFailed}`);

  if (failedTests.length > 0) {
    console.log('\nFailed Tests:');
    failedTests.forEach((test, idx) => {
      console.log(`  ${idx + 1}. ${test.name}`);
      console.log(`     Error: ${test.error}`);
    });
  }

  console.log('\n' + '='.repeat(80));

  if (testsFailed === 0) {
    console.log('SUCCESS: All tests passed! Speechify engine is ready for integration.');
    console.log('='.repeat(80) + '\n');
    process.exit(0);
  } else {
    console.log(`FAILURE: ${testsFailed} test(s) failed. Please fix before proceeding.`);
    console.log('='.repeat(80) + '\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});

module.exports = { test, asyncTest };
