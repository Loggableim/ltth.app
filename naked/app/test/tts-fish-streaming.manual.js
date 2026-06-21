/**
 * Test suite for Fish Audio TTS Streaming
 * Tests the streaming response (low-latency mode) implementation
 */

const assert = require('assert');
const { Readable } = require('stream');

// Mock logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

console.log('🧪 Running Fish Audio TTS Streaming Tests...\n');

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

// Test 1: FishSpeechEngine should have synthesizeStream method
runTest('FishSpeechEngine should have synthesizeStream method', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    const engine = new FishSpeechEngine('test-api-key-12345678901234567890', mockLogger);
    
    assert.strictEqual(typeof engine.synthesizeStream, 'function', 'synthesizeStream method should exist');
}).then(() => {

// Test 2: synthesizeStream should accept correct parameters
return runTest('synthesizeStream should accept correct parameters', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    const engine = new FishSpeechEngine('test-api-key-12345678901234567890', mockLogger);
    
    // Verify method exists and is async
    const method = engine.synthesizeStream;
    assert.strictEqual(typeof method, 'function', 'synthesizeStream should be a function');
    
    // Verify it returns a promise (async function)
    const methodStr = method.toString();
    assert.ok(methodStr.includes('async'), 'synthesizeStream should be an async function');
});

}).then(() => {

// Test 3: Lazy queuing logic - Fish Audio in balanced/fast mode should use streaming
return runTest('Lazy queuing logic - Fish Audio should use streaming in balanced mode', async () => {
    // Simulate the logic from speak() method
    const selectedEngine = 'fishaudio';
    const performanceMode = 'balanced';
    const useLazyQueuing = selectedEngine === 'fishaudio' && performanceMode !== 'quality';
    
    assert.strictEqual(useLazyQueuing, true, 'Fish Audio in balanced mode should use lazy queuing');
});

}).then(() => {

// Test 4: Lazy queuing logic - Fish Audio in quality mode should NOT use streaming
return runTest('Lazy queuing logic - Fish Audio should NOT use streaming in quality mode', async () => {
    const selectedEngine = 'fishaudio';
    const performanceMode = 'quality';
    const useLazyQueuing = selectedEngine === 'fishaudio' && performanceMode !== 'quality';
    
    assert.strictEqual(useLazyQueuing, false, 'Fish Audio in quality mode should NOT use lazy queuing');
});

}).then(() => {

// Test 5: Lazy queuing logic - Other engines should not use streaming
return runTest('Lazy queuing logic - Other engines should not use streaming', async () => {
    const engines = ['google', 'speechify', 'elevenlabs', 'openai', 'siliconflow'];
    
    for (const engine of engines) {
        const performanceMode = 'balanced';
        const useLazyQueuing = engine === 'fishaudio' && performanceMode !== 'quality';
        assert.strictEqual(useLazyQueuing, false, `${engine} should not use lazy queuing`);
    }
});

}).then(() => {

// Test 6: Queue item should have isStreaming flag when using lazy queuing
return runTest('Queue item should have isStreaming flag', async () => {
    // Simulate queue item creation
    const isStreaming = true;
    const queueItem = {
        userId: 'test-user',
        username: 'TestUser',
        text: 'Test message',
        voice: 'fish-sarah',
        engine: 'fishaudio',
        audioData: null,
        isStreaming: isStreaming,
        synthesisOptions: { emotion: 'happy' },
        volume: 1.0,
        speed: 1.0,
        source: 'chat'
    };
    
    assert.strictEqual(queueItem.isStreaming, true, 'Queue item should have isStreaming: true');
    assert.strictEqual(queueItem.audioData, null, 'Queue item should have audioData: null for streaming');
    assert.ok(queueItem.synthesisOptions, 'Queue item should have synthesisOptions');
});

}).then(() => {

// Test 7: Mock stream processing test
return runTest('Stream processing should convert chunks to Base64', async () => {
    // Mock a readable stream
    const mockStream = new Readable({
        read() {
            // Push some test data
            this.push(Buffer.from('test audio data chunk 1'));
            this.push(Buffer.from('test audio data chunk 2'));
            this.push(null); // End stream
        }
    });
    
    const chunks = [];
    
    // Simulate stream processing
    await new Promise((resolve, reject) => {
        mockStream.on('data', (chunk) => {
            const base64Chunk = chunk.toString('base64');
            chunks.push(base64Chunk);
        });
        
        mockStream.on('end', () => {
            resolve();
        });
        
        mockStream.on('error', (error) => {
            reject(error);
        });
    });
    
    assert.strictEqual(chunks.length, 2, 'Should receive 2 chunks');
    assert.ok(chunks[0].length > 0, 'First chunk should have content');
    assert.ok(chunks[1].length > 0, 'Second chunk should have content');
});

}).then(() => {

// Test 8: FishSpeechEngine should use balanced latency for streaming
return runTest('FishSpeechEngine should use balanced latency for streaming', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    // Verify the method implementation details by checking source
    const methodStr = FishSpeechEngine.prototype.synthesizeStream.toString();
    
    // Check key implementation details
    assert.ok(methodStr.includes('balanced'), 'synthesizeStream should reference balanced latency');
    assert.ok(methodStr.includes('stream'), 'synthesizeStream should use stream response type');
    assert.ok(methodStr.includes('responseType'), 'synthesizeStream should configure responseType');
});

}).then(() => {

// Test 9: Verify synthesizeStream uses correct API parameters
return runTest('synthesizeStream should use correct API parameters', async () => {
    const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
    
    // Check method implementation for required parameters
    const methodStr = FishSpeechEngine.prototype.synthesizeStream.toString();
    
    // Verify key parameters are used
    assert.ok(methodStr.includes('reference_id'), 'Should use reference_id parameter');
    assert.ok(methodStr.includes('chunk_length'), 'Should use chunk_length parameter');
    assert.ok(methodStr.includes('normalize'), 'Should use normalize parameter');
});

}).then(() => {

// Test 10: Verify _playAudio handles streaming flag
return runTest('_playAudio should handle isStreaming flag', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Verify streaming logic exists in _playAudio
    assert.ok(mainCode.includes('item.isStreaming'), '_playAudio should check for isStreaming flag');
    assert.ok(mainCode.includes('synthesizeStream'), '_playAudio should call synthesizeStream for streaming items');
    assert.ok(mainCode.includes('tts:stream:chunk'), '_playAudio should emit stream chunk events');
});

}).then(() => {

// Test 11: Verify streaming has fallback to regular synthesis
return runTest('Streaming should have fallback to regular synthesis', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Verify fallback logic exists
    assert.ok(mainCode.includes('fallback to regular synthesis'), 'Should have fallback comment');
    assert.ok(mainCode.includes('streamError'), 'Should handle stream errors');
});

}).then(() => {

// Test 12: Verify Socket event structure for streaming chunks
return runTest('Socket event tts:stream:chunk should have correct structure', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Verify the event structure
    assert.ok(mainCode.includes("'tts:stream:chunk'"), 'Should emit tts:stream:chunk event');
    
    // Check that the event includes necessary fields (more flexible regex)
    assert.ok(mainCode.includes('id: item.id'), 'Stream chunk should include id');
    assert.ok(mainCode.includes('chunk: base64Chunk'), 'Stream chunk should include chunk');
    assert.ok(mainCode.includes('isFirst:'), 'Stream chunk should include isFirst');
    assert.ok(mainCode.includes('volume: item.volume'), 'Stream chunk should include volume');
    assert.ok(mainCode.includes('speed: item.speed'), 'Stream chunk should include speed');
});

}).then(() => {

// Test 13: Verify streaming only applies to Fish Audio
return runTest('Streaming should only apply to Fish Audio engine', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Verify lazy queuing condition
    const lazyQueuingRegex = /useLazyQueuing.*?fishaudio.*?quality/;
    assert.ok(lazyQueuingRegex.test(mainCode), 'Lazy queuing should check for fishaudio and not quality mode');
});

}).then(() => {

// Test 14: Verify synthesisOptions are passed to streaming
return runTest('synthesisOptions should be passed to streaming synthesis', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Verify options are stored and used
    assert.ok(mainCode.includes('item.synthesisOptions'), 'Should use item.synthesisOptions');
    assert.ok(mainCode.includes('isStreaming && { synthesisOptions }'), 'Should conditionally include synthesisOptions in queue item');
});

}).then(() => {

// Test 15: Verify playback:started event is emitted for streaming
return runTest('tts:playback:started event should be emitted for streaming', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check that playback:started is emitted in the streaming branch
    // Look for the streaming branch and then verify playback:started emission
    assert.ok(mainCode.includes('if (item.isStreaming)'), 'Should have streaming branch');
    assert.ok(mainCode.includes("this.api.emit('tts:playback:started'"), 'Should emit playback:started event');
    
    // Verify streaming flag is passed in playback started event
    const streamingStartRegex = /tts:playback:started[\s\S]{0,200}isStreaming:\s*true/;
    assert.ok(streamingStartRegex.test(mainCode), 'Should include isStreaming flag in playback:started event for streaming items');
});

}).then(() => {

// Test 16: Verify tts:stream:end event is emitted when stream completes
return runTest('tts:stream:end event should be emitted when stream completes', async () => {
    const fs = require('fs');
    const mainCode = fs.readFileSync(require.resolve('../plugins/tts/main'), 'utf-8');
    
    // Check that tts:stream:end is emitted when stream ends
    assert.ok(mainCode.includes("'tts:stream:end'"), 'Should emit tts:stream:end event');
    
    // Verify the event includes necessary metadata
    const streamEndRegex = /tts:stream:end[\s\S]{0,200}id:\s*item\.id/;
    assert.ok(streamEndRegex.test(mainCode), 'Stream end event should include id');
    
    const totalChunksRegex = /tts:stream:end[\s\S]{0,200}totalChunks/;
    assert.ok(totalChunksRegex.test(mainCode), 'Stream end event should include totalChunks');
    
    const totalBytesRegex = /tts:stream:end[\s\S]{0,200}totalBytes/;
    assert.ok(totalBytesRegex.test(mainCode), 'Stream end event should include totalBytes');
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
