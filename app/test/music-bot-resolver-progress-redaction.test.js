'use strict';

const MusicBotPlugin = require('../plugins/music-bot/main');

test('redacts signed direct URLs from resolver progress socket payloads', () => {
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    registerRoute: jest.fn(),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin._emitRuntimeHealth = jest.fn();
  const rawUrl = 'https://www.youtube.com/watch?v=synthetic-video&sig=SIGNED_CANARY&token=TOKEN_CANARY';
  plugin._handleResolverProgress({ state: 'queued', key: rawUrl, timestamp: 123 });

  const resolverEvent = api.emit.mock.calls.find(([event]) => event === 'musicbot:resolver');
  expect(resolverEvent).toBeDefined();
  const payload = resolverEvent[1];
  expect(payload.progress.key).toBe('[redacted]');
  expect(JSON.stringify(payload)).not.toContain(rawUrl);
  expect(JSON.stringify(payload)).not.toContain('SIGNED_CANARY');
  expect(JSON.stringify(payload)).not.toContain('TOKEN_CANARY');
});

test('keeps ordinary text resolver keys useful in the progress payload', () => {
  const api = { getSocketIO: jest.fn(() => ({ emit: jest.fn() })), getDatabase: jest.fn(() => ({})), registerRoute: jest.fn(), emit: jest.fn(), log: jest.fn() };
  const plugin = new MusicBotPlugin(api);
  plugin._emitRuntimeHealth = jest.fn();
  plugin._handleResolverProgress({ state: 'searching-youtube', key: 'offline artist title', timestamp: 123 });

  const resolverEvent = api.emit.mock.calls.find(([event]) => event === 'musicbot:resolver');
  expect(resolverEvent[1].progress.key).toBe('offline artist title');
});
