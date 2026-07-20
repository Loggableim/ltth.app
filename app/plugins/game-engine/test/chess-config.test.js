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
});
