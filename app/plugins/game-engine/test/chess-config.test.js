const GameEnginePlugin = require('../main');

function createPlugin() {
  return new GameEnginePlugin({
    log: jest.fn(),
    getSocketIO: () => ({ emit: jest.fn(), on: jest.fn() })
  });
}

describe('Chess configuration safety', () => {
  test('rejects invalid default and available time controls', () => {
    const plugin = createPlugin();

    expect(plugin._isValidChessConfig({ defaultTimeControl: 'bad' })).toBe(false);
    expect(plugin._isValidChessConfig({ defaultTimeControl: '0+0' })).toBe(false);
    expect(plugin._isValidChessConfig({ timeControls: ['5+0', '181+0'] })).toBe(false);
    expect(plugin._isValidChessConfig({ defaultTimeControl: '5+0', timeControls: ['3+2', '10+5'] })).toBe(true);
  });

  test('repairs an invalid stored chess default before a game starts', () => {
    const plugin = createPlugin();

    expect(plugin._getConfigWithDefaults('chess', {
      defaultTimeControl: 'bad'
    }).defaultTimeControl).toBe('5+0');
  });

  test('uses a disabled, bounded autoplay configuration and rejects malformed values', () => {
    const plugin = createPlugin();

    expect(plugin._getConfigWithDefaults('chess', {}).autoplay).toEqual({
      enabled: false,
      eloOffset: 0,
      moveDelayMs: 750
    });
    expect(plugin._isValidChessConfig({
      autoplay: { enabled: true, eloOffset: -400, moveDelayMs: 250 }
    })).toBe(true);
    expect(plugin._isValidChessConfig({
      autoplay: { enabled: true, eloOffset: 401, moveDelayMs: 250 }
    })).toBe(false);
    expect(plugin._isValidChessConfig({
      autoplay: { enabled: true, eloOffset: 0, moveDelayMs: 249 }
    })).toBe(false);
    expect(plugin._isValidChessConfig({
      autoplay: { enabled: false, extra: 'not-accepted' }
    })).toBe(false);

    expect(plugin._getConfigWithDefaults('chess', {
      autoplay: { enabled: 'yes', eloOffset: 1000, moveDelayMs: 1 }
    }).autoplay).toEqual({
      enabled: false,
      eloOffset: 0,
      moveDelayMs: 750
    });
    expect(plugin._getConfigWithDefaults('chess', { eloStartRating: 5 }).eloStartRating).toBe(1000);
    expect(plugin._getConfigWithDefaults('chess', { eloStartRating: 1250 }).eloStartRating).toBe(1250);
  });
});
