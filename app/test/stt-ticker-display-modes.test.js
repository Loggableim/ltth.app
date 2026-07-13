const { ConfigManager } = require('../plugins/stt-ticker/backend/config');
const fs = require('fs');
const path = require('path');

function createConfigApi(storedConfig) {
  return {
    getConfig: jest.fn(() => storedConfig),
    setConfig: jest.fn(),
    log: jest.fn()
  };
}

describe('STT Ticker display-mode configuration', () => {
  test('uses Classic as the default subtitle style', () => {
    const config = new ConfigManager(createConfigApi(null)).load();

    expect(config.overlay.design).toBe('classic');
  });

  test.each(['dual-language', 'scrolling', 'fliessend', 'starwars', 'ticker3', 'karaoke'])(
    'migrates the retired %s style to Classic',
    design => {
      const api = createConfigApi({ overlay: { design } });

      const config = new ConfigManager(api).load();

      expect(config.overlay.design).toBe('classic');
      expect(api.setConfig).toHaveBeenCalledWith('config', expect.objectContaining({
        overlay: expect.objectContaining({ design: 'classic' })
      }));
    }
  );

  test('migrates the legacy translation model and retired style together', () => {
    const api = createConfigApi({
      overlay: { design: 'dual-language' },
      translation: { model: 'nemotron-3-nano' }
    });

    const config = new ConfigManager(api).load();

    expect(config.overlay.design).toBe('classic');
    expect(config.translation.model).toBe('deepseek-v4-flash');
    expect(api.setConfig).toHaveBeenCalledTimes(1);
  });

  test('offers only retained subtitle styles in the Admin UI', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../plugins/stt-ticker/ui.html'), 'utf8');

    ['classic', 'modern', 'minimal', 'neon', 'glass', 'compact', 'cinematic'].forEach(style => {
      expect(ui).toContain(`<option value="${style}"`);
    });
    ['dual-language', 'scrolling', 'fliessend', 'starwars', 'ticker3', 'karaoke'].forEach(style => {
      expect(ui).not.toContain(`<option value="${style}"`);
    });
  });
});
