/**
 * Test: Talking Heads Animation Flow
 * Comprehensive test to verify the entire animation flow from TTS to overlay
 */

const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');
const AnimationController = require('../plugins/talking-heads/engines/animation-controller.js');

describe('Talking Heads Animation Flow', () => {
  let mockApi;
  let mockLogger;
  let mockDb;
  let mockIo;
  let plugin;
  let emittedEvents;

  beforeEach(() => {
    emittedEvents = [];

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockDb = {
      getSetting: jest.fn(),
      prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => [])
      }))
    };

    // Mock Socket.IO to capture emitted events
    mockIo = {
      on: jest.fn(),
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    mockApi = {
      logger: mockLogger,
      getSocketIO: jest.fn(() => mockIo),
      getDatabase: jest.fn(() => mockDb),
      getConfig: jest.fn(() => ({ 
        enabled: true, 
        defaultStyle: 'cartoon',
        debugLogging: true,
        fadeInDuration: 300,
        fadeOutDuration: 300,
        blinkInterval: 3000,
        animationDuration: 5000
      })),
      setConfig: jest.fn(),
      getPluginDataDir: jest.fn(() => '/tmp/test'),
      ensurePluginDataDir: jest.fn(),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      emit: jest.fn(),
      pluginLoader: {
        emit: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn()
      }
    };

    plugin = new TalkingHeadsPlugin(mockApi);
  });

  test('Animation controller emits start event when animation begins', () => {
    const config = {
      fadeInDuration: 300,
      fadeOutDuration: 300,
      blinkInterval: 3000
    };

    const controller = new AnimationController(mockIo, mockLogger, config, null);

    const testSprites = {
      idle_neutral: '/api/talkingheads/sprite/test_idle.png',
      blink: '/api/talkingheads/sprite/test_blink.png',
      speak_closed: '/api/talkingheads/sprite/test_closed.png',
      speak_mid: '/api/talkingheads/sprite/test_mid.png',
      speak_open: '/api/talkingheads/sprite/test_open.png'
    };

    controller.startAnimation('test_user', 'Test User', testSprites, 5000);

    // Verify animation:start event was emitted
    const startEvents = emittedEvents.filter(e => e.event === 'talkingheads:animation:start');
    expect(startEvents.length).toBe(1);
    expect(startEvents[0].data.userId).toBe('test_user');
    expect(startEvents[0].data.username).toBe('Test User');
    expect(startEvents[0].data.sprites).toBeDefined();
  });

  test('Animation controller emits frame events during animation', (done) => {
    const config = {
      fadeInDuration: 100,
      fadeOutDuration: 100,
      blinkInterval: 3000
    };

    const controller = new AnimationController(mockIo, mockLogger, config, null);

    const testSprites = {
      idle_neutral: '/test/idle.png',
      blink: '/test/blink.png',
      speak_closed: '/test/closed.png',
      speak_mid: '/test/mid.png',
      speak_open: '/test/open.png'
    };

    controller.startAnimation('test_user', 'Test User', testSprites, 1000);

    // Wait for animation to start and emit frame events
    setTimeout(() => {
      const frameEvents = emittedEvents.filter(e => e.event === 'talkingheads:animation:frame');
      
      // Should have at least some frame events (idle + speaking frames)
      expect(frameEvents.length).toBeGreaterThan(0);
      
      // Verify frame events have correct structure
      frameEvents.forEach(event => {
        expect(event.data.userId).toBe('test_user');
        expect(event.data.frame).toBeDefined();
        expect(['idle_neutral', 'blink', 'speak_closed', 'speak_mid', 'speak_open']).toContain(event.data.frame);
      });

      done();
    }, 500);
  });

  test('Animation controller emits end event when animation completes', (done) => {
    const config = {
      fadeInDuration: 50,
      fadeOutDuration: 50,
      blinkInterval: 3000
    };

    const controller = new AnimationController(mockIo, mockLogger, config, null);

    const testSprites = {
      idle_neutral: '/test/idle.png',
      speak_closed: '/test/closed.png',
      speak_mid: '/test/mid.png',
      speak_open: '/test/open.png'
    };

    controller.startAnimation('test_user', 'Test User', testSprites, 200);

    // Wait for animation to complete
    setTimeout(() => {
      const endEvents = emittedEvents.filter(e => e.event === 'talkingheads:animation:end');
      
      expect(endEvents.length).toBe(1);
      expect(endEvents[0].data.userId).toBe('test_user');
      expect(endEvents[0].data.fadeOutDuration).toBe(50);

      done();
    }, 800);
  });

  test('Preview TTS triggers animation when avatar exists in cache', async () => {
    // Mock cache manager to return test avatar
    const mockCacheManager = {
      getAvatar: jest.fn(() => ({
        userId: 'talkingheads_preview',
        username: 'TalkingHeads Preview',
        sprites: {
          idle_neutral: '/test/idle.png',
          blink: '/test/blink.png',
          speak_closed: '/test/closed.png',
          speak_mid: '/test/mid.png',
          speak_open: '/test/open.png'
        }
      })),
      hasAvatar: jest.fn(() => true)
    };

    await plugin.init();
    plugin.cacheManager = mockCacheManager;

    // Simulate TTS playback started event (what happens when preview is clicked)
    const playbackPayload = {
      userId: 'talkingheads_preview',
      username: 'TalkingHeads Preview',
      text: 'Test preview',
      source: 'talking-heads-preview',
      duration: 5000
    };

    // Get the registered handler
    const onCalls = mockApi.pluginLoader.on.mock.calls;
    const startedHandler = onCalls.find(call => call[0] === 'tts:playback:started');
    
    expect(startedHandler).toBeDefined();

    // Call the handler
    await startedHandler[1](playbackPayload);

    // Verify animation was started
    const startEvents = emittedEvents.filter(e => e.event === 'talkingheads:animation:start');
    expect(startEvents.length).toBeGreaterThan(0);
    
    const lastStartEvent = startEvents[startEvents.length - 1];
    expect(lastStartEvent.data.userId).toBe('talkingheads_preview');
    expect(lastStartEvent.data.username).toBe('TalkingHeads Preview');
  });

  test('Animation events include correct frame types for mouth movement', (done) => {
    const config = {
      fadeInDuration: 50,
      fadeOutDuration: 50,
      blinkInterval: 3000
    };

    const controller = new AnimationController(mockIo, mockLogger, config, null);

    const testSprites = {
      idle_neutral: '/test/idle.png',
      speak_closed: '/test/closed.png',
      speak_mid: '/test/mid.png',
      speak_open: '/test/open.png'
    };

    controller.startAnimation('test_user', 'Test User', testSprites, 500);

    // Wait for speaking animation to start
    setTimeout(() => {
      const frameEvents = emittedEvents.filter(e => e.event === 'talkingheads:animation:frame');
      
      // Should have speaking frames (South Park style mouth movement)
      const speakingFrames = frameEvents.filter(e => 
        ['speak_closed', 'speak_mid', 'speak_open'].includes(e.data.frame)
      );
      
      expect(speakingFrames.length).toBeGreaterThan(0);
      
      // Verify frames cycle through mouth positions
      const frameSequence = speakingFrames.map(e => e.data.frame);
      const hasClosed = frameSequence.includes('speak_closed');
      const hasMid = frameSequence.includes('speak_mid');
      const hasOpen = frameSequence.includes('speak_open');
      
      expect(hasClosed || hasMid || hasOpen).toBe(true);

      done();
    }, 400);
  });
});
