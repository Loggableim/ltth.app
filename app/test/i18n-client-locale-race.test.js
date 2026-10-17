'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n-client.js'), 'utf8');
const classEnd = source.indexOf('// Create global instance');
if (classEnd < 0) throw new Error('Could not locate I18nClient class');

describe('dashboard locale selection race', () => {
  test('a late translation response cannot replace the most recently selected locale', async () => {
    const dom = new JSDOM(`<!doctype html><html lang="de"><body>
      <select id="language-selector"><option value="en">EN</option><option value="de">DE</option><option value="fr">FR</option></select>
      <select id="topbar-language-selector"><option value="en">EN</option><option value="de">DE</option><option value="fr">FR</option></select>
      <span data-i18n="test.label">Deutsch</span>
    </body></html>`, {
      url: 'http://localhost:3000/dashboard.html',
      runScripts: 'outside-only'
    });
    const { window } = dom;
    const pending = new Map();
    const languageChanges = [];
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.fetch = jest.fn(url => new Promise(resolve => {
      pending.set(String(url).split('/').pop(), resolve);
    }));
    window.localStorage.setItem('app_locale', 'de');
    window.eval(`${source.slice(0, classEnd)}\nwindow.__I18nClient = I18nClient;`);

    try {
      const i18n = new window.__I18nClient();
      i18n.initialized = true;
      i18n.currentLocale = 'de';
      i18n.translations = { de: { test: { label: 'Deutsch' } } };
      i18n.onLanguageChange(locale => languageChanges.push(locale));
      window.i18n = i18n;
      i18n.setupLanguageSwitcher(window.document.getElementById('language-selector'));
      i18n.setupLanguageSwitcher(window.document.getElementById('topbar-language-selector'));

      const topbar = window.document.getElementById('topbar-language-selector');
      topbar.value = 'en';
      topbar.dispatchEvent(new window.Event('change', { bubbles: true }));
      const settings = window.document.getElementById('language-selector');
      settings.value = 'fr';
      settings.dispatchEvent(new window.Event('change', { bubbles: true }));

      pending.get('fr')({ ok: true, statusText: 'OK', json: async () => ({ test: { label: 'Français' } }) });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(i18n.getLocale()).toBe('fr');
      expect(window.document.querySelector('[data-i18n="test.label"]').textContent).toBe('Français');

      pending.get('en')({ ok: true, statusText: 'OK', json: async () => ({ test: { label: 'English' } }) });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(i18n.getLocale()).toBe('fr');
      expect(window.document.documentElement.lang).toBe('fr');
      expect(window.localStorage.getItem('app_locale')).toBe('fr');
      expect(window.document.querySelector('[data-i18n="test.label"]').textContent).toBe('Français');
      expect(topbar.value).toBe('fr');
      expect(settings.value).toBe('fr');
      expect(languageChanges).toEqual(['fr']);

      i18n.translations = { fr: { test: { label: 'Français' } } };
      pending.clear();
      const localeChanges = [];
      i18n.onChange(locale => localeChanges.push(locale));
      const olderSetLocale = i18n.setLocale('en');
      const latestSetLocale = i18n.setLocale('de');
      pending.get('de')({ ok: true, statusText: 'OK', json: async () => ({ test: { label: 'Deutsch' } }) });
      await latestSetLocale;
      pending.get('en')({ ok: true, statusText: 'OK', json: async () => ({ test: { label: 'English' } }) });
      await expect(olderSetLocale).resolves.toBe(false);
      expect(i18n.getLocale()).toBe('de');
      expect(window.document.documentElement.lang).toBe('de');
      expect(window.localStorage.getItem('app_locale')).toBe('de');
      expect(localeChanges).toEqual(['de']);
    } finally {
      window.close();
    }
  });

  test('a stale response for the same locale cannot overwrite the latest cached translations', async () => {
    const dom = new JSDOM(`<!doctype html><html lang="de"><body>
      <select id="language-selector"><option value="en">EN</option><option value="de">DE</option><option value="fr">FR</option></select>
      <select id="topbar-language-selector"><option value="en">EN</option><option value="de">DE</option><option value="fr">FR</option></select>
      <span data-i18n="test.label">Deutsch</span>
    </body></html>`, {
      url: 'http://localhost:3000/dashboard.html',
      runScripts: 'outside-only'
    });
    const { window } = dom;
    const pending = [];
    const languageChanges = [];
    const localeChanges = [];
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.fetch = jest.fn(() => new Promise(resolve => pending.push(resolve)));
    window.localStorage.setItem('app_locale', 'de');
    window.eval(`${source.slice(0, classEnd)}\nwindow.__I18nClient = I18nClient;`);

    try {
      const i18n = new window.__I18nClient();
      i18n.initialized = true;
      i18n.currentLocale = 'de';
      i18n.translations = { de: { test: { label: 'Deutsch' } } };
      i18n.onLanguageChange(locale => languageChanges.push(locale));
      i18n.onChange(locale => localeChanges.push(locale));
      window.i18n = i18n;
      i18n.setupLanguageSwitcher(window.document.getElementById('language-selector'));
      i18n.setupLanguageSwitcher(window.document.getElementById('topbar-language-selector'));

      const topbar = window.document.getElementById('topbar-language-selector');
      const settings = window.document.getElementById('language-selector');
      topbar.value = 'fr';
      topbar.dispatchEvent(new window.Event('change', { bubbles: true }));
      settings.value = 'fr';
      settings.dispatchEvent(new window.Event('change', { bubbles: true }));
      pending[1]({ ok: true, statusText: 'OK', json: async () => ({ test: { label: 'Français récent' } }) });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(i18n.translations.fr.test.label).toBe('Français récent');
      expect(i18n.t('test.label')).toBe('Français récent');
      expect(window.document.querySelector('[data-i18n="test.label"]').textContent).toBe('Français récent');
      expect(window.document.documentElement.lang).toBe('fr');
      expect(window.localStorage.getItem('app_locale')).toBe('fr');

      pending[0]({ ok: true, statusText: 'OK', json: async () => ({ test: { label: 'Français obsolète' } }) });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(i18n.translations.fr.test.label).toBe('Français récent');
      expect(i18n.t('test.label')).toBe('Français récent');
      expect(window.document.querySelector('[data-i18n="test.label"]').textContent).toBe('Français récent');
      i18n.updateDOM();
      expect(window.document.querySelector('[data-i18n="test.label"]').textContent).toBe('Français récent');
      expect(i18n.getLocale()).toBe('fr');
      expect(window.document.documentElement.lang).toBe('fr');
      expect(window.localStorage.getItem('app_locale')).toBe('fr');
      expect(topbar.value).toBe('fr');
      expect(settings.value).toBe('fr');
      expect(languageChanges).toEqual(['fr']);
      expect(localeChanges).toEqual([]);
    } finally {
      window.close();
    }
  });
});
