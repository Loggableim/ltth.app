const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function loadI18nClient(window) {
  const scriptPath = path.join(__dirname, '..', 'public', 'js', 'i18n-client.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  const cutoff = source.indexOf('// Create global instance');
  const trimmedSource = cutoff >= 0 ? source.slice(0, cutoff) : source;

  window.eval(`${trimmedSource}\nwindow.__I18nClient = I18nClient;`);
}

describe('i18n client fallback rendering', () => {
  test('keeps existing fallback text when updateDOM runs before initialization', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <span id="spotlight-label" data-i18n="navigation.spotlight">Spotlight</span>
        <button id="wiki-button" data-i18n-title="wiki.open_new_tab" title="Open in New Tab">Open in New Tab</button>
      </body></html>`,
      { url: 'https://ltth.app/', runScripts: 'outside-only' }
    );

    const { window } = dom;
    loadI18nClient(window);

    const i18n = new window.__I18nClient();
    window.i18n = i18n;

    i18n.updateDOM();

    expect(window.document.getElementById('spotlight-label').textContent).toBe('Spotlight');
    expect(window.document.getElementById('wiki-button').title).toBe('Open in New Tab');
  });

  test('still applies translated content once initialized', () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <span id="custom-label" data-i18n="custom.title">Fallback Title</span>
      </body></html>`,
      { url: 'https://ltth.app/', runScripts: 'outside-only' }
    );

    const { window } = dom;
    loadI18nClient(window);

    const i18n = new window.__I18nClient();
    window.i18n = i18n;
    i18n.initialized = true;
    i18n.currentLocale = 'en';
    i18n.defaultLocale = 'en';
    i18n.translations = {
      en: {
        custom: {
          title: 'Translated Title'
        }
      }
    };

    i18n.updateDOM();

    expect(window.document.getElementById('custom-label').textContent).toBe('Translated Title');
  });

  test('does not silently replace a supported locale when its request fails', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://ltth.app/?lang=en',
      runScripts: 'outside-only'
    });
    const { window } = dom;
    loadI18nClient(window);
    window.fetch = jest.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' });

    const i18n = new window.__I18nClient();
    i18n.initialized = true;
    i18n.currentLocale = 'en';
    i18n.defaultLocale = 'en';

    await expect(i18n.loadTranslations('de')).resolves.toBe(false);
    expect(i18n.currentLocale).toBe('en');
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });
});
