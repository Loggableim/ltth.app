'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const clientSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n-client.js'), 'utf8');
const switcherSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'init-language-switchers.js'), 'utf8');
const classEnd = clientSource.indexOf('// Create global instance');
if (classEnd < 0) throw new Error('Could not locate I18nClient class');
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

describe('dashboard language switching and reload persistence', () => {
  test('switches both selectors and translated DOM immediately across all supported languages', async () => {
    const dom = new JSDOM(`<!doctype html><html lang="de"><body>
      <select id="language-selector"><option value="en">EN</option><option value="de">DE</option><option value="es">ES</option><option value="fr">FR</option></select>
      <select id="topbar-language-selector"><option value="en">EN</option><option value="de">DE</option><option value="es">ES</option><option value="fr">FR</option></select>
      <h1 data-i18n="profile.title">Benutzerprofile</h1>
      <span data-i18n="common.loading">Laden...</span>
    </body></html>`, { url: 'http://localhost:3000/dashboard.html', runScripts: 'outside-only' });
    const { window } = dom;
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    window.fetch = jest.fn(async url => {
      const locale = String(url).split('/').pop();
      return { ok: true, statusText: 'OK', json: async () => locales[locale] };
    });
    window.eval(`${clientSource.slice(0, classEnd)}\nwindow.__I18nClient = I18nClient;`);
    window.localStorage.setItem('app_locale', 'de');
    window.localStorage.setItem('unrelated-setting', 'keep-me');

    try {
      const i18n = new window.__I18nClient();
      window.i18n = i18n;
      await i18n.init();
      window.eval(switcherSource);
      await Promise.resolve();
      await Promise.resolve();
      i18n.updateDOM();

      for (const locale of ['en', 'es', 'fr', 'de']) {
        const topbar = window.document.getElementById('topbar-language-selector');
        topbar.value = locale;
        topbar.dispatchEvent(new window.Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(i18n.getLocale()).toBe(locale);
        expect(window.document.documentElement.lang).toBe(locale);
        expect(window.document.getElementById('language-selector').value).toBe(locale);
        expect(window.document.querySelector('h1').textContent).toBe(locales[locale].profile.title);
        expect(window.document.querySelector('span').textContent).toBe(locales[locale].common.loading);
        expect(window.localStorage.getItem('app_locale')).toBe(locale);
        expect(window.localStorage.getItem('unrelated-setting')).toBe('keep-me');
      }

      const afterReload = new window.__I18nClient();
      await afterReload.init();
      afterReload.updateDOM();
      expect(afterReload.getLocale()).toBe('de');
      expect(window.document.documentElement.lang).toBe('de');
      expect(window.document.querySelector('h1').textContent).toBe(locales.de.profile.title);
      expect(window.localStorage.getItem('app_locale')).toBe('de');
      expect(window.localStorage.getItem('unrelated-setting')).toBe('keep-me');
    } finally {
      window.close();
    }
  });
});
