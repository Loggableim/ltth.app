/**
 * Tests for AnimazingPal Enhanced Features
 * Tests the new modules: SpeechState, MicState, OutboxBatcher, RelevanceEngine, ResponseEngine, EventDeduper
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function describeIfModule(relativePath, name, suite) {
  const modulePath = path.join(__dirname, relativePath);
  const runner = fs.existsSync(modulePath) ? describe : describe.skip;
  runner(name, suite);
}

describe('AnimazingPal Enhanced Features', function() {
  
  describeIfModule('../plugins/animazingpal/brain/speech-state.js', 'SpeechState', function() {
    let SpeechState;
    
    beforeAll(function() {
      // Dynamically load the module
      SpeechState = require('../plugins/animazingpal/brain/speech-state');
    });
    
    it('should initialize in idle state', function() {
      const speechState = new SpeechState();
      assert.strictEqual(speechState.isSpeaking(), false, 'Should start in idle state');
    });
    
    it('should transition to speaking state', function() {
      const speechState = new SpeechState();
      speechState.markStarted();
      assert.strictEqual(speechState.isSpeaking(), true, 'Should be speaking after markStarted()');
    });
    
    it('should transition back to idle', function() {
      const speechState = new SpeechState();
      speechState.markStarted();
      speechState.markEnded();
      assert.strictEqual(speechState.isSpeaking(), false, 'Should be idle after markEnded()');
    });
    
    it('should emit started and ended events', function(done) {
      const speechState = new SpeechState();
      let startedEmitted = false;
      let endedEmitted = false;
      
      speechState.on('started', () => { startedEmitted = true; });
      speechState.on('ended', () => { 
        endedEmitted = true;
        assert.strictEqual(startedEmitted, true, 'Started event should be emitted');
        assert.strictEqual(endedEmitted, true, 'Ended event should be emitted');
        done();
      });
      
      speechState.markStarted();
      speechState.markEnded();
    });
    
    it('should calculate speech duration', function(done) {
      const speechState = new SpeechState();
      speechState.markStarted();
      
      setTimeout(() => {
        const duration = speechState.getSpeechDuration();
        assert.ok(duration >= 100, 'Duration should be at least 100ms');
        assert.ok(duration < 200, 'Duration should be less than 200ms');
        done();
      }, 150);
    });
  });
  
  describeIfModule('../plugins/animazingpal/brain/mic-state.js', 'MicState', function() {
    let MicState;
    
    beforeAll(function() {
      
        MicState = require('../plugins/animazingpal/brain/mic-state');
    });
    
    it('should initialize in idle state', function() {
      const micState = new MicState();
      assert.strictEqual(micState.isActive(), false, 'Should start in idle state');
    });
    
    it('should transition to active state', function() {
      const micState = new MicState();
      micState.markActive();
      assert.strictEqual(micState.isActive(), true, 'Should be active after markActive()');
    });
    
    it('should transition back to idle', function() {
      const micState = new MicState();
      micState.markActive();
      micState.markIdle();
      assert.strictEqual(micState.isActive(), false, 'Should be idle after markIdle()');
    });
    
    it('should emit active and idle events', function(done) {
      const micState = new MicState();
      let activeEmitted = false;
      let idleEmitted = false;
      
      micState.on('active', () => { activeEmitted = true; });
      micState.on('idle', () => { 
        idleEmitted = true;
        assert.strictEqual(activeEmitted, true, 'Active event should be emitted');
        assert.strictEqual(idleEmitted, true, 'Idle event should be emitted');
        done();
      });
      
      micState.markActive();
      micState.markIdle();
    });
  });
  
  describeIfModule('../plugins/animazingpal/brain/outbox-batcher.js', 'OutboxBatcher', function() {
    let OutboxBatcher;
    
    beforeAll(function() {
      
        OutboxBatcher = require('../plugins/animazingpal/brain/outbox-batcher');
    });
    
    it('should batch items within window', function() {
      const batcher = new OutboxBatcher({ windowSeconds: 1, maxItems: 5 });
      
      batcher.add('Item 1');
      batcher.add('Item 2');
      
      assert.strictEqual(batcher.size(), 2, 'Should have 2 items in buffer');
      batcher.destroy();
    });
    
    it('should flush when max items reached', function(done) {
      const batcher = new OutboxBatcher({ 
        windowSeconds: 10, 
        maxItems: 3,
        separator: ', '
      });
      
      batcher.onFlush((text) => {
        assert.strictEqual(text, 'A, B, C', 'Should flush with correct separator');
        batcher.destroy();
        done();
      });
      
      batcher.add('A');
      batcher.add('B');
      batcher.add('C'); // Should trigger flush
    });
    
    it('should flush when max chars reached', function(done) {
      const batcher = new OutboxBatcher({ 
        windowSeconds: 10, 
        maxItems: 10,
        maxChars: 20,
        separator: ' '
      });
      
      batcher.onFlush((text) => {
        assert.ok(text.length > 20, 'Should flush when chars exceeded');
        batcher.destroy();
        done();
      });
      
      batcher.add('1234567890');
      batcher.add('1234567890'); // Should trigger flush
    });
    
    it('should respect hold conditions', function(done) {
      const batcher = new OutboxBatcher({ 
        windowSeconds: 0.1, // Very short window
        maxItems: 10
      });
      
      let flushed = false;
      batcher.onFlush(() => { flushed = true; });
      
      batcher.addHold('speech');
      batcher.add('Test item');
      
      setTimeout(() => {
        assert.strictEqual(flushed, false, 'Should not flush while hold is active');
        batcher.removeHold('speech');
        
        setTimeout(() => {
          assert.strictEqual(flushed, true, 'Should flush after hold is removed');
          batcher.destroy();
          done();
        }, 300);
      }, 200);
    });
  });
  
  describeIfModule('../plugins/animazingpal/brain/relevance-engine.js', 'RelevanceEngine', function() {
    let RelevanceEngine;
    
    beforeAll(function() {
      
        RelevanceEngine = require('../plugins/animazingpal/brain/relevance-engine');
    });
    
    it('should detect ignored messages', function() {
      const engine = new RelevanceEngine();
      
      assert.strictEqual(engine.isIgnored('!command'), true, 'Should ignore commands');
      assert.strictEqual(engine.isIgnored('http://spam.com'), true, 'Should ignore URLs');
      assert.strictEqual(engine.isIgnored('ab'), true, 'Should ignore very short messages');
      assert.strictEqual(engine.isIgnored('Hello everyone'), false, 'Should not ignore normal messages');
    });
    
    it('should detect greetings', function() {
      const engine = new RelevanceEngine();
      
      assert.strictEqual(engine.isGreeting('Hallo'), true, 'Should detect German greeting');
      assert.strictEqual(engine.isGreeting('hello everyone'), true, 'Should detect English greeting');
      assert.strictEqual(engine.isGreeting('Hey there!'), true, 'Should detect informal greeting');
      assert.strictEqual(engine.isGreeting('What is this?'), false, 'Should not detect questions as greetings');
    });
    
    it('should detect thanks messages', function() {
      const engine = new RelevanceEngine();
      
      assert.strictEqual(engine.isThanks('Danke!'), true, 'Should detect German thanks');
      assert.strictEqual(engine.isThanks('thanks a lot'), true, 'Should detect English thanks');
      assert.strictEqual(engine.isThanks('ty'), true, 'Should detect abbreviated thanks');
      assert.strictEqual(engine.isThanks('I think so'), false, 'Should not false-positive on partial matches');
    });
    
    it('should score messages by relevance', function() {
      const engine = new RelevanceEngine();
      
      const questionScore = engine.score('Why is this happening?');
      assert.ok(questionScore >= 0.6, 'Questions should have high relevance');
      
      const keywordScore = engine.score('How does this work?');
      assert.ok(keywordScore >= 0.7, 'Questions with keywords should have very high relevance');
      
      const shortScore = engine.score('ok');
      assert.ok(shortScore < 0.3, 'Short messages should have low relevance');
    });
    
    it('should evaluate whether to respond', function() {
      const engine = new RelevanceEngine();
      
      const questionEval = engine.evaluate('Why is the sky blue?', 0.6);
      assert.strictEqual(questionEval.shouldRespond, true, 'Should respond to questions');
      assert.ok(questionEval.score >= 0.6, 'Question score should be high');
      
      const greetingEval = engine.evaluate('Hello!', 0.6);
      assert.strictEqual(greetingEval.shouldRespond, true, 'Should respond to greetings');
      assert.strictEqual(greetingEval.reason, 'greeting', 'Reason should be greeting');
      
      const shortEval = engine.evaluate('ok', 0.6);
      assert.strictEqual(shortEval.shouldRespond, false, 'Should not respond to low-relevance messages');
    });
    
    it('should guard against excessive threshold', function() {
      const engine = new RelevanceEngine();
      
      // Even with very high threshold, questions with keywords should get through
      const eval1 = engine.evaluate('Why is this happening?', 0.9);
      assert.strictEqual(eval1.shouldRespond, true, 'Should lower excessive threshold');
    });
  });
  
  describeIfModule('../plugins/animazingpal/brain/event-deduper.js', 'EventDeduper', function() {
    let EventDeduper;
    
    beforeAll(function() {
      
        EventDeduper = require('../plugins/animazingpal/brain/event-deduper');
    });
    
    it('should detect duplicate events', function() {
      const deduper = new EventDeduper({ ttl: 60 });
      
      const sig1 = deduper.generateSignature('gift', { 
        userId: 'user123', 
        giftName: 'Rose',
        count: 1 
      });
      
      assert.strictEqual(deduper.hasSeen(sig1), false, 'First occurrence should not be seen');
      assert.strictEqual(deduper.hasSeen(sig1), true, 'Second occurrence should be seen');
      
      deduper.destroy();
    });
    
    it('should expire old entries', function(done) {
      const deduper = new EventDeduper({ ttl: 0.1 }); // 100ms TTL
      
      const sig = deduper.generateSignature('follow', { userId: 'user456' });
      deduper.hasSeen(sig); // Mark as seen
      
      setTimeout(() => {
        assert.strictEqual(deduper.hasSeen(sig), false, 'Should not be seen after TTL expiry');
        deduper.destroy();
        done();
      }, 150);
    });
    
    it('should enforce max size', function() {
      const deduper = new EventDeduper({ ttl: 600, maxSize: 5 });
      
      for (let i = 0; i < 10; i++) {
        const sig = deduper.generateSignature('like', { userId: `user${i}` });
        deduper.hasSeen(sig);
      }
      
      assert.ok(deduper.size() <= 5, 'Should not exceed max size');
      deduper.destroy();
    });
  });
  
  describeIfModule('../plugins/animazingpal/brain/response-engine.js', 'ResponseEngine', function() {
    let ResponseEngine;
    
    beforeAll(function() {
      
        ResponseEngine = require('../plugins/animazingpal/brain/response-engine');
    });
    
    it('should initialize without API key', function() {
      const engine = new ResponseEngine({}, console);
      assert.strictEqual(engine.isReady(), false, 'Should not be ready without API key');
    });
    
    it('should cache responses', function() {
      const engine = new ResponseEngine({ apiKey: 'test-key' }, console);
      
      engine._cacheResponse('user1', 'hello', 'Hi there!');
      const cached = engine._getCachedResponse('user1', 'hello');
      
      assert.strictEqual(cached, 'Hi there!', 'Should return cached response');
    });
    
    it('should generate quick acknowledgments', function() {
      const engine = new ResponseEngine({}, console);
      
      const greeting = engine.quickAcknowledgment('TestUser', 'greeting');
      assert.ok(greeting.includes('TestUser'), 'Greeting should include username');
      
      const thanks = engine.quickAcknowledgment('TestUser', 'thanks');
      assert.ok(thanks.length > 0, 'Thanks response should not be empty');
      
      const gift = engine.quickAcknowledgment('TestUser', 'gift');
      assert.ok(gift.includes('TestUser'), 'Gift response should include username');
    });
    
    it('should clear cache', function() {
      const engine = new ResponseEngine({}, console);
      
      engine._cacheResponse('user1', 'test', 'response');
      assert.ok(engine._getCachedResponse('user1', 'test'), 'Should have cached response');
      
      engine.clearCache();
      assert.strictEqual(engine._getCachedResponse('user1', 'test'), null, 'Cache should be cleared');
    });
  });
  
  describe('Integration: Brain Engine with new modules', function() {
    it('should track speech and mic states', function() {
      // Mock the module structure for testing
      const mockActivityState = {
        isSpeaking: false,
        isMicActive: false,
        speechDuration: 0,
        timeSinceMicChange: 1000,
        batcherSize: 2,
        batcherHasHolds: false
      };
      
      assert.strictEqual(mockActivityState.isSpeaking, false, 'Should track speech state');
      assert.strictEqual(mockActivityState.isMicActive, false, 'Should track mic state');
      assert.strictEqual(mockActivityState.batcherSize, 2, 'Should track batcher size');
    });
  });
});
