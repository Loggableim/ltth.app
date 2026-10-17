'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);
const switchStart = dashboardSource.indexOf('async function switchProfile(username) {');
const switchEnd = dashboardSource.indexOf('// Löscht ein Profil', switchStart);
if (switchStart < 0 || switchEnd < 0) throw new Error('Could not locate profile switch function');
const switchSource = dashboardSource.slice(switchStart, switchEnd);
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

function interpolate(value, params = {}) {
  return value.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

function createFixture() {
  const dom = new JSDOM('<!doctype html><html><body><div id="profile-modal"></div></body></html>', {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  let selectedLocale = 'en';
  window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  window.alert = jest.fn();
  window.hideProfileModal = jest.fn();
  window.i18n = {
    t(key, params) {
      const value = key.split('.').reduce((current, part) => current && current[part], locales[selectedLocale]);
      return typeof value === 'string' ? interpolate(value, params) : key;
    }
  };
  window.eval(`${switchSource}\nwindow.switchProfile = switchProfile;`);
  return {
    dom,
    window,
    selectLocale(locale) { selectedLocale = locale; }
  };
}

function createProfileStateFixture() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const activeStart = source.indexOf('function initializeActiveProfileRetry() {');
  const activeEnd = source.indexOf('// Initialize profile auto-restart toggle', activeStart);
  const listStart = source.indexOf('let profileFilter = \'all\';');
  const listEnd = source.indexOf('// Initialize profile search and filter functionality', listStart);
  if ([activeStart, activeEnd, listStart, listEnd].some(index => index < 0)) {
    throw new Error('Could not locate real profile state renderers');
  }
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="current-profile-name"></span><span id="active-profile-display"></span>
    <div id="active-profile-status"></div><button id="active-profile-retry-btn"></button>
    <div id="profile-list"><article id="previous-card">previous</article></div>
  </body></html>`, { url: 'http://localhost:3000/dashboard.html', runScripts: 'outside-only' });
  const { window } = dom;
  let selectedLocale = 'en';
  const localeCallbacks = [];
  window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  window.i18n = {
    t(key) {
      const value = key.split('.').reduce((current, part) => current && current[part], locales[selectedLocale]);
      return typeof value === 'string' ? value : key;
    },
    getLocale: () => selectedLocale,
    onLanguageChange: callback => localeCallbacks.push(callback)
  };
  window.__changeLocale = locale => {
    selectedLocale = locale;
    window.document.documentElement.lang = locale;
    localeCallbacks.forEach(callback => callback(locale));
  };
  window.eval(`${source.slice(activeStart, activeEnd)}\n${source.slice(listStart, listEnd)}\n` +
    'window.loadActiveProfile = loadActiveProfile; window.loadProfiles = loadProfiles;');
  return { dom, window };
}

describe('dashboard profile switch dialogs follow the selected locale', () => {
  test.each(['en', 'de', 'es', 'fr'])(
    'uses %s for confirmation and server error at dialog invocation time', async locale => {
      const { window, dom, selectLocale } = createFixture();
      try {
        window.confirm = jest.fn(() => false);
        window.fetch = jest.fn();

        // Simulate a language selection after the dashboard code has loaded.
        selectLocale(locale);
        await window.switchProfile('creatorB');
        const confirmation = [
          interpolate(locales[locale].profile.switch_confirm, { username: 'creatorB' }),
          locales[locale].profile.switch_restart_warning
        ].join('\n\n');
        expect(window.confirm).toHaveBeenCalledWith(confirmation);
        expect(window.fetch).not.toHaveBeenCalled();

        window.confirm.mockReturnValue(true);
        window.fetch.mockResolvedValue({
          ok: false,
          json: async () => ({ success: false, error: 'Profile not found' })
        });
        await window.switchProfile('creatorB');

        expect(window.alert).toHaveBeenCalledWith(
          interpolate(locales[locale].profile.switch_error, { error: 'Profile not found' })
        );
        expect(window.fetch).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem('selectedProfile')).toBeNull();
        expect(window.hideProfileModal).not.toHaveBeenCalled();
      } finally {
        dom.window.close();
      }
    }
  );

  test.each(['en', 'de', 'es', 'fr'])('uses %s for network errors', async locale => {
    const { window, dom, selectLocale } = createFixture();
    try {
      selectLocale(locale);
      window.confirm = jest.fn(() => true);
      window.fetch = jest.fn().mockRejectedValue(new Error('connection lost'));

      await window.switchProfile('creatorB');

      expect(window.alert).toHaveBeenCalledWith(
        interpolate(locales[locale].profile.switch_network_error, { error: 'connection lost' })
      );
      expect(window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(window.hideProfileModal).not.toHaveBeenCalled();
    } finally {
      dom.window.close();
    }
  });
});

describe('dashboard synthetic profile state across failure, loading, locale, and success', () => {
  test('shows loading and localized error, then updates active profile after confirmed switch and reload', async () => {
    const { dom, window } = createProfileStateFixture();
    let resolveProfiles;
    let retryPending = false;
    const activeName = { value: 'creatorA' };
    const profileList = [
      { username: 'creatorA', modified: '2026-10-08T10:00:00Z', size: 1024, isActive: true },
      { username: 'creatorB', modified: '2026-10-08T11:00:00Z', size: 2048, isActive: false }
    ];
    window.fetch = jest.fn(url => {
      if (url === '/api/profiles/active') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, activeProfile: activeName.value }) });
      }
      if (url === '/api/profiles' && !retryPending) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      if (url === '/api/profiles' && retryPending) {
        return new Promise(resolve => { resolveProfiles = () => resolve({ ok: true, json: async () => ({ profiles: profileList }) }); });
      }
      if (url === '/api/profiles/switch') {
        activeName.value = 'creatorB';
        return Promise.resolve({ ok: true, json: async () => ({ success: true, newProfile: 'creatorB', activeProfile: 'creatorA', requiresRestart: true, restartScheduled: true }) });
      }
      throw new Error(`Unexpected profile fixture request: ${url}`);
    });

    try {
      expect(await window.loadActiveProfile()).toBe(true);
      expect(window.document.getElementById('current-profile-name').textContent).toBe('creatorA');
      expect(await window.loadProfiles()).toBe(false);
      expect(window.document.querySelector('#profile-list-status span').textContent).toBe(locales.en.profile.list_load_error);

      window.__changeLocale('fr');
      expect(window.document.querySelector('#profile-list-status span').textContent).toBe(locales.fr.profile.list_load_error);
      retryPending = true;
      window.document.querySelector('#profile-list-status button').click();
      await Promise.resolve();
      expect(window.document.getElementById('profile-list-status').textContent).toBe(locales.fr.common.loading);
      resolveProfiles();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.document.querySelector('#profile-list').textContent).toContain(locales.fr.profile.switch_action);

      const switchStart = dashboardSource.indexOf('async function switchProfile(username) {');
      const switchEnd = dashboardSource.indexOf('// Löscht ein Profil', switchStart);
      window.eval(`${dashboardSource.slice(switchStart, switchEnd)}\nwindow.switchProfile = switchProfile;`);
      window.hideProfileModal = jest.fn();
      window.profileManager = { beginProfileRestart: jest.fn() };
      window.confirm = jest.fn(() => true);
      window.fetch = jest.fn(async (url, options = {}) => {
        if (url === '/api/profiles/switch') {
          activeName.value = 'creatorB';
          return { ok: true, json: async () => ({ success: true, newProfile: 'creatorB', activeProfile: 'creatorA', requiresRestart: true, restartScheduled: true }) };
        }
        if (url === '/api/profiles/active') return { ok: true, json: async () => ({ success: true, activeProfile: activeName.value }) };
        if (url === '/api/profiles' && options.cache === 'no-store') return { ok: true, json: async () => ({ profiles: profileList.map(profile => ({ ...profile, isActive: profile.username === activeName.value })) }) };
        throw new Error(`Unexpected profile fixture request: ${url}`);
      });
      await window.switchProfile('creatorB');
      expect(window.localStorage.getItem('selectedProfile')).toBe('creatorB');
      expect(window.profileManager.beginProfileRestart).toHaveBeenCalledWith(expect.objectContaining({ to: 'creatorB', requiresRestart: true }));

      await window.loadActiveProfile();
      await window.loadProfiles();
      expect(window.document.getElementById('current-profile-name').textContent).toBe('creatorB');
      expect(window.document.querySelector('#profile-list').textContent).toContain(locales.fr.profile.active_badge);
      expect(window.document.querySelector('#profile-list').textContent).toContain('creatorB');
    } finally {
      dom.window.close();
    }
  });
});
