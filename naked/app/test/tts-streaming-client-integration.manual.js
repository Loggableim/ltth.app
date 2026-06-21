/**
 * Integration test for TTS Streaming Client-Side Implementation
 * Tests the client-side chunk buffering and playback logic
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running TTS Streaming Client Integration Tests...\n');

let passed = 0;
let failed = 0;

// Path to dashboard.js
const dashboardPath = path.join(__dirname, '../public/js/dashboard.js');

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

// Test 1: Verify dashboard.js has streaming buffer
runTest('dashboard.js should have streamingBuffers Map', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes('streamingBuffers'), 'Should declare streamingBuffers');
    assert.ok(dashboardCode.includes('new Map()'), 'Should initialize as Map');
}).then(() => {

// Test 2: Verify tts:stream:chunk handler exists
return runTest('dashboard.js should have tts:stream:chunk handler', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes("socket.on('tts:stream:chunk'"), 'Should listen for tts:stream:chunk event');
    assert.ok(dashboardCode.includes('handleStreamChunk'), 'Should call handleStreamChunk function');
});

}).then(() => {

// Test 3: Verify tts:stream:end handler exists
return runTest('dashboard.js should have tts:stream:end handler', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes("socket.on('tts:stream:end'"), 'Should listen for tts:stream:end event');
    assert.ok(dashboardCode.includes('handleStreamEnd'), 'Should call handleStreamEnd function');
});

}).then(() => {

// Test 4: Verify handleStreamChunk function exists
return runTest('handleStreamChunk function should exist', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes('function handleStreamChunk(data)'), 'Should define handleStreamChunk function');
    assert.ok(dashboardCode.includes('streamingBuffers.set'), 'Should use Map.set to store chunks');
    assert.ok(dashboardCode.includes('atob(data.chunk)'), 'Should decode base64 chunks');
});

}).then(() => {

// Test 5: Verify handleStreamEnd function exists
return runTest('handleStreamEnd function should exist', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes('function handleStreamEnd(data)'), 'Should define handleStreamEnd function');
    assert.ok(dashboardCode.includes('streamingBuffers.get'), 'Should retrieve buffer from Map');
    assert.ok(dashboardCode.includes('playStreamingAudio'), 'Should call playStreamingAudio');
});

}).then(() => {

// Test 6: Verify playStreamingAudio function exists
return runTest('playStreamingAudio function should exist', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes('function playStreamingAudio(id)'), 'Should define playStreamingAudio function');
    assert.ok(dashboardCode.includes('new Uint8Array(totalLength)'), 'Should combine chunks into Uint8Array');
    assert.ok(dashboardCode.includes('new Blob'), 'Should create blob from combined chunks');
});

}).then(() => {

// Test 7: Verify audio unlock check in handleStreamChunk
return runTest('handleStreamChunk should check audio unlock', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    // Find handleStreamChunk function
    const handleStreamChunkMatch = dashboardCode.match(/function handleStreamChunk\(data\)[\s\S]{0,500}/);
    assert.ok(handleStreamChunkMatch, 'Should find handleStreamChunk function');
    
    const functionBody = handleStreamChunkMatch[0];
    assert.ok(functionBody.includes('audioUnlocked'), 'Should check audioUnlocked');
    assert.ok(functionBody.includes('return'), 'Should return early if not unlocked');
});

}).then(() => {

// Test 8: Verify chunk buffer initialization
return runTest('handleStreamChunk should initialize buffer for new streams', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    const handleStreamChunkMatch = dashboardCode.match(/function handleStreamChunk\(data\)[\s\S]{0,1000}/);
    assert.ok(handleStreamChunkMatch, 'Should find handleStreamChunk function');
    
    const functionBody = handleStreamChunkMatch[0];
    assert.ok(functionBody.includes('chunks: []'), 'Should initialize empty chunks array');
    assert.ok(functionBody.includes('volume: null'), 'Should initialize volume as null');
    assert.ok(functionBody.includes('speed: null'), 'Should initialize speed as null');
    assert.ok(functionBody.includes('playbackStarted: false'), 'Should initialize playbackStarted as false');
});

}).then(() => {

// Test 9: Verify metadata storage from first chunk
return runTest('handleStreamChunk should store metadata from first chunk', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    const handleStreamChunkMatch = dashboardCode.match(/function handleStreamChunk\(data\)[\s\S]{0,1500}/);
    assert.ok(handleStreamChunkMatch, 'Should find handleStreamChunk function');
    
    const functionBody = handleStreamChunkMatch[0];
    assert.ok(functionBody.includes('data.isFirst'), 'Should check isFirst flag');
    assert.ok(functionBody.includes('buffer.volume = data.volume'), 'Should store volume from first chunk');
    assert.ok(functionBody.includes('buffer.speed = data.speed'), 'Should store speed from first chunk');
});

}).then(() => {

// Test 10: Verify playStreamingAudio combines chunks correctly
return runTest('playStreamingAudio should combine chunks into single array', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    const playStreamingAudioMatch = dashboardCode.match(/function playStreamingAudio\(id\)[\s\S]{0,1500}/);
    assert.ok(playStreamingAudioMatch, 'Should find playStreamingAudio function');
    
    const functionBody = playStreamingAudioMatch[0];
    assert.ok(functionBody.includes('buffer.chunks.reduce'), 'Should calculate total length with reduce');
    assert.ok(functionBody.includes('combined.set(chunk, offset)'), 'Should set chunks at correct offsets');
    assert.ok(functionBody.includes('offset += chunk.length'), 'Should increment offset');
});

}).then(() => {

// Test 11: Verify audio element configuration
return runTest('playStreamingAudio should configure audio element correctly', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    const playStreamingAudioMatch = dashboardCode.match(/function playStreamingAudio\(id\)[\s\S]{0,2000}/);
    assert.ok(playStreamingAudioMatch, 'Should find playStreamingAudio function');
    
    const functionBody = playStreamingAudioMatch[0];
    assert.ok(functionBody.includes("getElementById('dashboard-tts-audio')"), 'Should get audio element');
    assert.ok(functionBody.includes('audio.volume'), 'Should set audio volume');
    assert.ok(functionBody.includes('audio.playbackRate'), 'Should set playback rate');
    assert.ok(functionBody.includes('audio.play()'), 'Should call play()');
});

}).then(() => {

// Test 12: Verify cleanup after playback
return runTest('playStreamingAudio should clean up after playback', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    const playStreamingAudioMatch = dashboardCode.match(/function playStreamingAudio\(id\)[\s\S]{0,2500}/);
    assert.ok(playStreamingAudioMatch, 'Should find playStreamingAudio function');
    
    const functionBody = playStreamingAudioMatch[0];
    assert.ok(functionBody.includes('URL.revokeObjectURL'), 'Should revoke object URL');
    assert.ok(functionBody.includes('streamingBuffers.delete'), 'Should delete buffer from Map');
    assert.ok(functionBody.includes('audio.onended'), 'Should handle onended event');
    assert.ok(functionBody.includes('audio.onerror'), 'Should handle onerror event');
});

}).then(() => {

// Test 13: Verify playback started flag prevents double playback
return runTest('handleStreamEnd should prevent double playback', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    const handleStreamEndMatch = dashboardCode.match(/function handleStreamEnd\(data\)[\s\S]{0,800}/);
    assert.ok(handleStreamEndMatch, 'Should find handleStreamEnd function');
    
    const functionBody = handleStreamEndMatch[0];
    assert.ok(functionBody.includes('buffer.playbackStarted'), 'Should check playbackStarted flag');
    assert.ok(functionBody.includes('buffer.playbackStarted = true'), 'Should set playbackStarted to true');
});

}).then(() => {

// Test 14: Verify console logging for debugging
return runTest('Streaming functions should have console logging', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    // Check that each function has logging within its body
    const handleStreamChunkMatch = dashboardCode.match(/function handleStreamChunk\(data\)[\s\S]{0,500}/);
    assert.ok(handleStreamChunkMatch && handleStreamChunkMatch[0].includes("console.log(`🎵 [Dashboard] Stream chunk"), 'handleStreamChunk should log');
    
    const handleStreamEndMatch = dashboardCode.match(/function handleStreamEnd\(data\)[\s\S]{0,500}/);
    assert.ok(handleStreamEndMatch && handleStreamEndMatch[0].includes("console.log(`🎵 [Dashboard] Stream ended"), 'handleStreamEnd should log');
    
    const playStreamingAudioMatch = dashboardCode.match(/function playStreamingAudio\(id\)[\s\S]{0,500}/);
    assert.ok(playStreamingAudioMatch && playStreamingAudioMatch[0].includes("console.log(`🎵 [Dashboard] Playing streaming audio"), 'playStreamingAudio should log');
});

}).then(() => {

// Test 15: Verify original tts:play handler still exists for backward compatibility
return runTest('dashboard.js should maintain backward compatibility with tts:play', async () => {
    const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8');
    
    assert.ok(dashboardCode.includes("socket.on('tts:play'"), 'Should still listen for tts:play event');
    assert.ok(dashboardCode.includes('playDashboardTTS'), 'Should still have playDashboardTTS function');
});

}).then(() => {

// Print results
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests completed: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    process.exit(1);
}

});
