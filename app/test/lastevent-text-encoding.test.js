const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('LastEvent text encoding regressions', () => {
  test('template renderer emits readable Unicode gift metadata', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="test-container"></div></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;
    global.Image = dom.window.Image;

    const rendererPath = path.join(__dirname, '../plugins/spotlight/lib/template-renderer.js');
    delete require.cache[require.resolve(rendererPath)];
    const TemplateRenderer = require(rendererPath);

    const container = dom.window.document.getElementById('test-container');
    const renderer = new TemplateRenderer(container, {
      showProfilePicture: false,
      showUsername: true,
      preloadImages: false
    });

    await renderer.render({
      uniqueId: 'gifter-1',
      nickname: 'Gift User',
      eventType: 'gifter',
      label: 'New Gift',
      metadata: {
        giftName: 'Rose',
        giftCount: 3,
        coins: 120
      }
    });

    const metadataText = container.querySelector('.gift-metadata')?.textContent || '';
    expect(metadataText).toContain('×3');
    expect(metadataText).toContain('120 coins');
    expect(metadataText).not.toMatch(/(?:\uFFFD|Ã|Â|ï¿½)/);

    delete global.document;
    delete global.window;
    delete global.Image;
  });

  test('plugin static assets and locales stay free of mojibake markers', () => {
    const root = path.join(__dirname, '../plugins/spotlight');
    const files = [
      path.join(root, 'ui/main.js'),
      path.join(root, 'ui/main.html'),
      path.join(root, 'locales/de.json'),
      path.join(root, 'locales/es.json'),
      path.join(root, 'locales/fr.json')
    ];

    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/(?:\uFFFD|Ã|Â|ï¿½)/);
    });
  });

  test('localized labels keep their intended accented characters', () => {
    const root = path.join(__dirname, '../plugins/spotlight/locales');
    const de = JSON.parse(fs.readFileSync(path.join(root, 'de.json'), 'utf8'));
    const es = JSON.parse(fs.readFileSync(path.join(root, 'es.json'), 'utf8'));
    const fr = JSON.parse(fs.readFileSync(path.join(root, 'fr.json'), 'utf8'));

    // Plugin locale files are intentionally isolated below plugins.<id>.
    de.spotlight = de.plugins.spotlight.spotlight;
    es.spotlight = es.plugins.spotlight.spotlight;
    fr.spotlight = fr.plugins.spotlight.spotlight;

    expect(de.spotlight.overlays.open).toBe('Overlay öffnen');
    expect(de.spotlight.appearance.font_size).toBe('Schriftgröße');
    expect(es.spotlight.config.title).toBe('Configuración');
    expect(es.spotlight.config.save).toBe('Guardar configuración');
    expect(fr.spotlight.config.save).toBe('Enregistrer les réglages');
  });

  test('STT Ticker UI has no malformed UTF-8 sequences', () => {
    const content = fs.readFileSync(path.join(__dirname, '../plugins/stt-ticker/ui.html'), 'utf8');
    expect(content).not.toMatch(/(?:\uFFFD|\u00C3(?:\u0192|[\u0080-\u00BF])|\u00C2[\u0080-\u00BF]|\u00E2[\u0080-\u00BF]{1,2})/);
  });
});
