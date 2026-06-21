/**
 * Test: Talking Heads Avatar Generation Socket Events
 * Verifies that socket events are emitted when avatars are generated
 */

const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

describe('Talking Heads Avatar Generation Socket Events', () => {
  let mockApi;
  let mockLogger;
  let mockDb;
  let mockIo;
  let routeHandlers;

  beforeEach(() => {
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

    mockIo = {
      on: jest.fn(),
      emit: jest.fn()
    };

    routeHandlers = {};

    mockApi = {
      logger: mockLogger,
      getSocketIO: jest.fn(() => mockIo),
      getDatabase: jest.fn(() => mockDb),
      getConfig: jest.fn(() => ({ enabled: true, defaultStyle: 'cartoon' })),
      setConfig: jest.fn(),
      getPluginDataDir: jest.fn(() => '/tmp/test'),
      ensurePluginDataDir: jest.fn(),
      registerRoute: jest.fn((method, path, handler) => {
        routeHandlers[`${method}:${path}`] = handler;
      }),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      emit: jest.fn(),
      pluginLoader: {
        emit: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn()
      }
    };
  });

  test('emits socket event after manual avatar generation', async () => {
    const plugin = new TalkingHeadsPlugin(mockApi);
    await plugin.init();

    // Mock _generateAvatarAndSprites to simulate successful generation
    plugin._generateAvatarAndSprites = jest.fn().mockResolvedValue({
      userId: 'test_user',
      username: 'TestUser',
      styleKey: 'cartoon',
      avatarPath: '/tmp/test/avatars/test_user_cartoon_avatar.png',
      sprites: {
        idle_neutral: '/tmp/test/avatars/test_user_cartoon_idle_neutral.png',
        blink: '/tmp/test/avatars/test_user_cartoon_blink.png',
        speak_closed: '/tmp/test/avatars/test_user_cartoon_speak_closed.png',
        speak_mid: '/tmp/test/avatars/test_user_cartoon_speak_mid.png',
        speak_open: '/tmp/test/avatars/test_user_cartoon_speak_open.png'
      }
    });

    // Get the route handler for /api/talkingheads/generate
    const generateHandler = routeHandlers['post:/api/talkingheads/generate'];
    expect(generateHandler).toBeDefined();

    // Mock request and response
    const req = {
      body: {
        userId: 'test_user',
        username: 'TestUser',
        styleKey: 'cartoon'
      }
    };

    const res = {
      json: jest.fn(),
      status: jest.fn(() => res)
    };

    // Call the handler
    await generateHandler(req, res);

    // Verify socket event was emitted
    expect(mockIo.emit).toHaveBeenCalledWith(
      'talkingheads:avatar:generated',
      expect.objectContaining({
        userId: 'test_user',
        username: 'TestUser',
        styleKey: 'cartoon',
        sprites: expect.any(Object)
      })
    );

    // Verify response was successful
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true
      })
    );
  });

  test('emits socket event after avatar assignment', async () => {
    const plugin = new TalkingHeadsPlugin(mockApi);
    await plugin.init();

    // Mock _generateAvatarAndSprites
    plugin._generateAvatarAndSprites = jest.fn().mockResolvedValue({
      userId: 'assigned_user',
      username: 'AssignedUser',
      styleKey: 'cartoon',
      avatarPath: '/tmp/test/avatars/assigned_user_cartoon_avatar.png',
      sprites: {
        idle_neutral: '/tmp/test/avatars/assigned_user_cartoon_idle_neutral.png',
        blink: '/tmp/test/avatars/assigned_user_cartoon_blink.png',
        speak_closed: '/tmp/test/avatars/assigned_user_cartoon_speak_closed.png',
        speak_mid: '/tmp/test/avatars/assigned_user_cartoon_speak_mid.png',
        speak_open: '/tmp/test/avatars/assigned_user_cartoon_speak_open.png'
      }
    });

    // Get the route handler for /api/talkingheads/assign
    const assignHandler = routeHandlers['post:/api/talkingheads/assign'];
    expect(assignHandler).toBeDefined();

    // Mock request and response
    const req = {
      body: {
        userId: 'assigned_user',
        username: 'AssignedUser',
        styleKey: 'cartoon',
        profileImageUrl: 'https://example.com/profile.jpg'
      }
    };

    const res = {
      json: jest.fn(),
      status: jest.fn(() => res)
    };

    // Call the handler
    await assignHandler(req, res);

    // Verify socket event was emitted
    expect(mockIo.emit).toHaveBeenCalledWith(
      'talkingheads:avatar:generated',
      expect.objectContaining({
        userId: 'assigned_user',
        username: 'AssignedUser',
        styleKey: 'cartoon',
        sprites: expect.any(Object)
      })
    );

    // Verify response was successful
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true
      })
    );
  });

  test('does not emit socket event when generation fails', async () => {
    const plugin = new TalkingHeadsPlugin(mockApi);
    await plugin.init();

    // Mock _generateAvatarAndSprites to simulate failure
    plugin._generateAvatarAndSprites = jest.fn().mockRejectedValue(
      new Error('API key not configured')
    );

    // Get the route handler
    const generateHandler = routeHandlers['post:/api/talkingheads/generate'];

    // Mock request and response
    const req = {
      body: {
        userId: 'test_user',
        username: 'TestUser'
      }
    };

    const res = {
      json: jest.fn(),
      status: jest.fn(() => res)
    };

    // Call the handler
    await generateHandler(req, res);

    // Verify socket event was NOT emitted
    expect(mockIo.emit).not.toHaveBeenCalledWith(
      'talkingheads:avatar:generated',
      expect.anything()
    );

    // Verify error response
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.any(String)
      })
    );
  });
});
