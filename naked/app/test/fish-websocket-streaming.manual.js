/**
 * Test suite for Fish.audio WebSocket-based TTS Streaming
 * Tests the new WebSocket implementation for true low-latency streaming
 */

const assert = require('assert');

// Mock logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

console.log('🧪 Running Fish.audio WebSocket TTS Streaming Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    return new Promise((resolve) => {
        (async () => {
            try {
                await fn();
                console.log(`✓ ${name}`);
                passed++;
                resolve(true);
            } catch (error) {
                console.error(`✗ ${name}`);
                console.error(`  Error: ${error.message}`);
                if (error.stack) {
                    console.error(`  Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
                }
                failed++;
                resolve(false);
            }
        })();
    });
}

// Test 1: FishSpeechEngine should have synthesizeWebSocket method
runTest('FishSpeechEngine should have synthesizeWebSocket method', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    const engine = new FishSpeechEngine('test-api-key-12345678901234567890', mockLogger);
    
    assert.strictEqual(typeof engine.synthesizeWebSocket, 'function', 'synthesizeWebSocket method should exist');
}).then(() => {

// Test 2: synthesizeWebSocket should be an async function
return runTest('synthesizeWebSocket should be an async function', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    const engine = new FishSpeechEngine('test-api-key-12345678901234567890', mockLogger);
    
    const method = engine.synthesizeWebSocket;
    assert.strictEqual(typeof method, 'function', 'synthesizeWebSocket should be a function');
    
    // Verify it returns a promise (async function)
    const methodStr = method.toString();
    assert.ok(methodStr.includes('async') || methodStr.includes('Promise'), 'synthesizeWebSocket should be an async function');
});

}).then(() => {

// Test 3: Verify synthesizeWebSocket implementation has WebSocket support
return runTest('synthesizeWebSocket should use WebSocket', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check that WebSocket is used
    assert.ok(methodStr.includes('WebSocket') || methodStr.includes('ws'), 'synthesizeWebSocket should use WebSocket');
    assert.ok(methodStr.includes('wss://api.fish.audio'), 'Should connect to Fish.audio WebSocket endpoint');
});

}).then(() => {

// Test 4: Verify synthesizeWebSocket uses MessagePack
return runTest('synthesizeWebSocket should use MessagePack encoding', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check that MessagePack is used
    assert.ok(methodStr.includes('msgpack'), 'synthesizeWebSocket should use msgpack');
    assert.ok(methodStr.includes('encode') || methodStr.includes('decode'), 'Should encode/decode MessagePack messages');
});

}).then(() => {

// Test 5: Verify synthesizeWebSocket supports onChunk callback
return runTest('synthesizeWebSocket should support onChunk callback', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for callback support
    assert.ok(methodStr.includes('onChunk'), 'Should support onChunk callback');
    assert.ok(methodStr.includes('options.onChunk'), 'Should call options.onChunk callback');
});

}).then(() => {

// Test 6: Verify synthesizeWebSocket supports onEnd callback
return runTest('synthesizeWebSocket should support onEnd callback', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for callback support
    assert.ok(methodStr.includes('onEnd'), 'Should support onEnd callback');
    assert.ok(methodStr.includes('options.onEnd'), 'Should call options.onEnd callback');
});

}).then(() => {

// Test 7: Verify synthesizeWebSocket implements Fish.audio protocol
return runTest('synthesizeWebSocket should implement Fish.audio WebSocket protocol', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for protocol events
    assert.ok(methodStr.includes('StartEvent') || methodStr.includes("event: 'start'"), 'Should send StartEvent');
    assert.ok(methodStr.includes('TextChunk') || methodStr.includes("event: 'text'"), 'Should send TextChunk');
    assert.ok(methodStr.includes('FlushEvent') || methodStr.includes("event: 'flush'"), 'Should send FlushEvent');
    assert.ok(methodStr.includes('StopEvent') || methodStr.includes("event: 'stop'"), 'Should send StopEvent');
});

}).then(() => {

// Test 8: Verify synthesizeWebSocket handles audio chunks
return runTest('synthesizeWebSocket should handle AudioChunk events', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for audio event handling
    assert.ok(methodStr.includes("event === 'audio'") || methodStr.includes('AudioChunk'), 'Should handle audio events');
    assert.ok(methodStr.includes('base64'), 'Should convert audio to base64');
});

}).then(() => {

// Test 9: Verify synthesizeWebSocket handles finish event
return runTest('synthesizeWebSocket should handle FinishEvent', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for finish event handling
    assert.ok(methodStr.includes("event === 'finish'") || methodStr.includes('FinishEvent'), 'Should handle finish event');
});

}).then(() => {

// Test 10: Verify synthesizeWebSocket handles errors
return runTest('synthesizeWebSocket should handle error events', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for error handling
    assert.ok(methodStr.includes("event === 'error'") || methodStr.includes('ErrorEvent'), 'Should handle error event');
    assert.ok(methodStr.includes('timeout') || methodStr.includes('setTimeout'), 'Should implement timeout handling');
});

}).then(() => {

// Test 11: Verify synthesizeWebSocket supports emotion injection
return runTest('synthesizeWebSocket should support emotion injection', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check for emotion support
    assert.ok(methodStr.includes('emotion'), 'Should support emotion parameter');
    assert.ok(methodStr.includes('isValidEmotion'), 'Should validate emotions');
});

}).then(() => {

// Test 12: Verify synthesizeWebSocket returns correct result structure
return runTest('synthesizeWebSocket should return correct result structure', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check return structure
    assert.ok(methodStr.includes('chunks:'), 'Should return chunks array');
    assert.ok(methodStr.includes('format:'), 'Should return format');
    assert.ok(methodStr.includes('totalBytes:'), 'Should return totalBytes');
});

}).then(() => {

// Test 13: Verify main.js uses WebSocket for Fish.audio streaming
return runTest('main.js should use WebSocket streaming for Fish.audio', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check that WebSocket path is used for Fish.audio
    assert.ok(mainCode.includes('synthesizeWebSocket'), 'main.js should call synthesizeWebSocket');
    assert.ok(mainCode.includes('fishaudio'), 'Should check for fishaudio engine');
    assert.ok(mainCode.includes('useWebSocket'), 'Should have WebSocket flag');
});

}).then(() => {

// Test 14: Verify main.js passes callbacks to WebSocket method
return runTest('main.js should pass onChunk and onEnd callbacks', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check for callback passing
    assert.ok(mainCode.includes('onChunk:'), 'Should pass onChunk callback');
    assert.ok(mainCode.includes('onEnd:'), 'Should pass onEnd callback');
});

}).then(() => {

// Test 15: Verify main.js emits format with stream chunks
return runTest('main.js should emit format with stream chunks', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check that format is emitted in chunk event - look for the actual event emission
    assert.ok(mainCode.includes("'tts:stream:chunk'"), 'Should have tts:stream:chunk event');
    
    // More specific check: look for format field within the same emit call
    const hasFormatInChunk = mainCode.includes('format:') && 
                              mainCode.split("'tts:stream:chunk'").some(section => 
                                  section.includes('format:') && section.includes('id:')
                              );
    assert.ok(hasFormatInChunk, 'Stream chunk event should include format field in emit object');
});

}).then(() => {

// Test 16: Verify main.js emits format with stream end
return runTest('main.js should emit format with stream end', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check that format is emitted in end event
    assert.ok(mainCode.includes("'tts:stream:end'"), 'Should have tts:stream:end event');
    
    // More specific check: look for format field within the same emit call
    const hasFormatInEnd = mainCode.includes('format:') && 
                            mainCode.split("'tts:stream:end'").some(section => 
                                section.includes('format:') && section.includes('totalChunks')
                            );
    assert.ok(hasFormatInEnd, 'Stream end event should include format field in emit object');
});

}).then(() => {

// Test 17: Verify dashboard.js has getAudioMimeType function
return runTest('dashboard.js should have getAudioMimeType function', async () => {
    const fs = require('fs');
    const dashboardCode = fs.readFileSync(require.resolve('../public/js/dashboard'), 'utf-8');
    
    // Check for function
    assert.ok(dashboardCode.includes('getAudioMimeType'), 'Should have getAudioMimeType function');
    assert.ok(dashboardCode.includes('audio/mpeg'), 'Should map mp3 to audio/mpeg');
    assert.ok(dashboardCode.includes('audio/wav'), 'Should map wav to audio/wav');
});

}).then(() => {

// Test 18: Verify dashboard.js stores format in buffer
return runTest('dashboard.js should store format in streaming buffer', async () => {
    const fs = require('fs');
    const dashboardCode = fs.readFileSync(require.resolve('../public/js/dashboard'), 'utf-8');
    
    // Check that format is stored
    assert.ok(dashboardCode.includes('buffer.format'), 'Should store format in buffer');
    const formatInitRegex = /format:\s*null/;
    assert.ok(formatInitRegex.test(dashboardCode), 'Should initialize format field in buffer');
});

}).then(() => {

// Test 19: Verify dashboard.js uses format for MIME type
return runTest('dashboard.js should use format for MIME type', async () => {
    const fs = require('fs');
    const dashboardCode = fs.readFileSync(require.resolve('../public/js/dashboard'), 'utf-8');
    
    // Check that format is used to determine MIME type
    assert.ok(dashboardCode.includes('getAudioMimeType(buffer.format)'), 'Should use getAudioMimeType with buffer.format');
});

}).then(() => {

// Test 20: Verify dashboard.js sets properties before src
return runTest('dashboard.js should set playback properties before src', async () => {
    const fs = require('fs');
    const dashboardCode = fs.readFileSync(require.resolve('../public/js/dashboard'), 'utf-8');
    
    // Find the relevant section in playStreamingAudio function
    const playStreamingSection = dashboardCode.substring(
        dashboardCode.indexOf('function playStreamingAudio'),
        dashboardCode.indexOf('function playStreamingAudio') + 2000
    );
    
    // Check order: volume and playbackRate should come before src
    const volumePos = playStreamingSection.indexOf('audio.volume');
    const playbackRatePos = playStreamingSection.indexOf('audio.playbackRate');
    const srcPos = playStreamingSection.indexOf('audio.src');
    
    assert.ok(volumePos > 0, 'Should set audio.volume');
    assert.ok(playbackRatePos > 0, 'Should set audio.playbackRate');
    assert.ok(srcPos > 0, 'Should set audio.src');
    assert.ok(volumePos < srcPos, 'audio.volume should be set before audio.src');
    assert.ok(playbackRatePos < srcPos, 'audio.playbackRate should be set before audio.src');
});

}).then(() => {

// Test 21: Verify FishSpeechEngine has required dependencies imported
return runTest('FishSpeechEngine should import WebSocket and msgpack', async () => {
    const fs = require('fs');
    const engineCode = fs.readFileSync(require.resolve('../plugins/tts/engines/fishspeech-engine'), 'utf-8');
    
    // Check imports
    assert.ok(engineCode.includes("require('ws')"), 'Should import ws (WebSocket)');
    assert.ok(engineCode.includes("require('@msgpack/msgpack')"), 'Should import @msgpack/msgpack');
});

}).then(() => {

// Test 22: Verify synthesizeWebSocket uses balanced latency
return runTest('synthesizeWebSocket should use balanced latency mode', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check latency mode
    assert.ok(methodStr.includes("latency: 'balanced'") || methodStr.includes('balanced'), 'Should use balanced latency mode');
});

}).then(() => {

// Test 23: Verify WebSocket URL is correct
return runTest('synthesizeWebSocket should use correct WebSocket URL', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check URL
    assert.ok(methodStr.includes('wss://api.fish.audio/v1/tts/live'), 'Should use correct WebSocket URL');
});

}).then(() => {

// Test 24: Verify Authorization header is set
return runTest('synthesizeWebSocket should set Authorization header', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    const methodStr = FishSpeechEngine.prototype.synthesizeWebSocket.toString();
    
    // Check authorization
    assert.ok(methodStr.includes('Authorization'), 'Should set Authorization header');
    assert.ok(methodStr.includes('Bearer'), 'Should use Bearer token authentication');
});

}).then(() => {

// Test 25: Verify HTTP streaming fallback still exists
return runTest('HTTP streaming fallback should still exist for other engines', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check that HTTP streaming path still exists
    assert.ok(mainCode.includes('synthesizeStream'), 'Should still support synthesizeStream for fallback');
    assert.ok(mainCode.includes('HTTP streaming') || mainCode.includes('stream.on'), 'Should have HTTP streaming logic');
});

}).then(() => {

// Print results
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests completed: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}

});
