/**
 * Tests for TikTok TTS Session auto-loading via Eulerstream
 */

const TikTokEngine = require('../plugins/tts/engines/tiktok-engine');

const mockExtract = jest.fn().mockResolvedValue({
  success: true,
  sessionId: 'session_from_euler'
});

// Mock SessionExtractor to avoid real network calls
jest.mock('../modules/session-extractor', () => jest.fn(() => ({
  extractSessionId: mockExtract
})));

const SessionExtractor = require('../modules/session-extractor');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockDb = {
  getSetting: jest.fn().mockReturnValue(null),
  setSetting: jest.fn()
};

describe('TikTokEngine Session handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getSetting.mockReturnValue(null);
  });

  test('uses custom sessionIdLoader before Eulerstream extraction', async () => {
    const loader = jest.fn().mockResolvedValue('loader_session_value');
    const engine = new TikTokEngine(mockLogger, { db: mockDb, sessionIdLoader: loader });

    const sessionId = await engine._ensureSessionId();

    expect(sessionId).toBe('loader_session_value');
    expect(engine.sessionId).toBe('loader_session_value');
    expect(loader).toHaveBeenCalled();
    expect(SessionExtractor).not.toHaveBeenCalled();
  });

  test('falls back to Eulerstream extraction when no session is present', async () => {
    const engine = new TikTokEngine(mockLogger, { db: mockDb });

    const sessionId = await engine._ensureSessionId();

    expect(SessionExtractor).toHaveBeenCalled();
    expect(mockExtract).toHaveBeenCalled();
    expect(sessionId).toBe('session_from_euler');
    expect(engine.sessionId).toBe('session_from_euler');
  });
});
