'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const profileManagerSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
  'utf8'
);
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

function interpolate(value, params = {}) {
  return value.replace(/\{\{(\w+)\}\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

describe('pending profile switch warning locale updates', () => {
  test.each(['en', 'de', 'es', 'fr'])(
    'updates the existing warning to %s immediately when the language changes', async locale => {
      const dom = new JSDOM(`<!doctype html><html><body>
        <header class="topbar"></header>
        <button id="profile-btn"><span id="current-profile-name"></span></button>
      </body></html>`, {
        url: 'http://localhost:3000/dashboard.html',
        runScripts: 'outside-only'
      });
      const { window } = dom;
      let selectedLocale = 'en';
      const localeCallbacks = [];
      const fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          activeProfile: 'synthetic-A',
          pendingProfile: 'synthetic-B',
          requiresRestart: true
        })
      }));
      window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      window.fetch = fetch;
      window.socket = { on: jest.fn() };
      window.document.addEventListener('DOMContentLoaded', event => event.stopImmediatePropagation(), true);
      window.i18n = {
        t(key, params) {
          const value = key.split('.').reduce((current, part) => current && current[part], locales[selectedLocale]);
          return typeof value === 'string' ? interpolate(value, params) : key;
        },
        onLanguageChange(callback) { localeCallbacks.push(callback); }
      };
      window.eval(profileManagerSource);

      try {
        await window.profileManager.loadProfileStatus();
        const warning = window.document.getElementById('profile-switch-warning');
        expect(warning).not.toBeNull();
        expect(warning.querySelector('.profile-switch-warning-text strong').textContent)
          .toBe(locales.en.profile.switch_pending_title);

        selectedLocale = locale;
        const requestsBeforeLanguageChange = fetch.mock.calls.length;
        localeCallbacks.forEach(callback => callback(locale));

        expect(window.document.getElementById('profile-switch-warning')).toBe(warning);
        expect(warning.querySelector('.profile-switch-warning-text strong').textContent)
          .toBe(locales[locale].profile.switch_pending_title);
        expect(warning.querySelector('.profile-switch-warning-text p').textContent).toBe(
          interpolate(locales[locale].profile.switch_pending_message, {
            current: 'synthetic-A',
            selected: 'synthetic-B'
          })
        );
        expect(warning.querySelector('.btn-restart-now-label').textContent)
          .toBe(locales[locale].profile.restart_now);
        expect(window.profileManager.activeProfile).toBe('synthetic-A');
        expect(window.profileManager.selectedProfile).toBe('synthetic-B');
        expect(fetch).toHaveBeenCalledTimes(requestsBeforeLanguageChange);
        expect(fetch).toHaveBeenCalledWith('/api/profiles/active');
      } finally {
        window.close();
      }
    }
  );
});
