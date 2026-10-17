'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const locales = Object.fromEntries(['en', 'de', 'es', 'fr'].map(locale => [
  locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'))
]));

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
const start = source.indexOf('let profileFilter = \'all\';');
const end = source.indexOf('// Initialize profile search and filter functionality', start);
if (start < 0 || end < 0) throw new Error('Could not locate profile list loading functions');
const profileListSource = source.slice(start, end);

function createHarness(fetch, locale = 'en') {
  const dom = new JSDOM('<!doctype html><div id="profile-list"><article id="existing-card">Existing profile</article></div>', {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.fetch = fetch;
  window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const languageChangeCallbacks = [];
  let selectedLocale = locale;
  window.i18n = { t: key => {
    const value = key.split('.').reduce((current, part) => current && current[part], locales[selectedLocale]);
    return typeof value === 'string' ? value : key;
  }, getLocale: () => selectedLocale, onLanguageChange: callback => languageChangeCallbacks.push(callback) };
  window.__changeLocale = nextLocale => {
    selectedLocale = nextLocale;
    window.document.documentElement.lang = nextLocale;
    languageChangeCallbacks.forEach(callback => callback(nextLocale));
  };
  window.escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  window.switchProfile = jest.fn();
  window.backupProfile = jest.fn();
  window.deleteProfile = jest.fn();
  window.eval(`${profileListSource}\nwindow.__setProfileSearchQuery = value => { profileSearchQuery = value; };`);
  return { dom, window };
}

const profile = { username: 'creatorB', modified: '2026-10-08T10:00:00Z', size: 2048, isActive: false };

describe('dashboard profile list loading states', () => {
  test('loads profiles when the settings view is opened from navigation', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profiles: [{ ...profile, username: 'pupcid' }] })
    });
    const { dom, window } = createHarness(fetch);
    try {
      window.dispatchEvent(new window.CustomEvent('ltth:view-changed', { detail: { view: 'settings' } }));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(window.document.querySelector('#profile-list').textContent).toContain('pupcid');
      expect(window.document.querySelector('#profile-list').textContent).toContain(locales.en.profile.switch_action);
    } finally { dom.window.close(); }
  });

  test('keeps the newest profile response when an older request finishes last', async () => {
    const pending = [];
    const fetch = jest.fn(() => new Promise(resolve => pending.push(resolve)));
    const { dom, window } = createHarness(fetch);
    try {
      const olderRequest = window.loadProfiles();
      const newerRequest = window.loadProfiles();
      pending[1]({ ok: true, json: async () => ({ profiles: [{ ...profile, username: 'newerCreator' }] }) });
      await expect(newerRequest).resolves.toBe(true);
      expect(window.document.querySelector('#profile-list').textContent).toContain('newerCreator');

      pending[0]({ ok: true, json: async () => ({ profiles: [{ ...profile, username: 'olderCreator' }] }) });
      await expect(olderRequest).resolves.toBe(false);
      expect(window.document.querySelector('#profile-list').textContent).toContain('newerCreator');
      expect(window.document.querySelector('#profile-list').textContent).not.toContain('olderCreator');
      expect(window.document.getElementById('profile-list-status')).toBeNull();
    } finally { window.close(); }
  });

  test('shows a visible loading state while the profile request is pending', async () => {
    let resolveRequest;
    const fetch = jest.fn(() => new Promise(resolve => { resolveRequest = resolve; }));
    const { dom, window } = createHarness(fetch);
    try {
      const loading = window.loadProfiles();
      expect(window.document.getElementById('profile-list-status').textContent).toBe(locales.en.common.loading);
      expect(window.document.getElementById('existing-card')).not.toBeNull();
      resolveRequest({ ok: true, json: async () => ({ profiles: [profile] }) });
      await expect(loading).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledWith('/api/profiles', { cache: 'no-store' });
      expect(window.document.getElementById('profile-list-status')).toBeNull();
      expect(window.document.querySelector('#profile-list').textContent).toContain('creatorB');
    } finally { window.close(); }
  });

  test('shows retry after an HTTP failure and preserves the previous profile cards', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ success: false, error: 'internal detail' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profiles: [profile] }) });
    const { dom, window } = createHarness(fetch);
    try {
      await expect(window.loadProfiles()).resolves.toBe(false);
      const status = window.document.getElementById('profile-list-status');
      expect(status.getAttribute('role')).toBe('alert');
      expect(status.textContent).toBe(locales.en.profile.list_load_error + locales.en.profile.retry);
      expect(status.textContent).not.toContain('internal detail');
      expect(window.document.getElementById('existing-card')).not.toBeNull();

      status.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(window.document.getElementById('profile-list-status')).toBeNull();
      expect(window.document.getElementById('existing-card')).toBeNull();
      expect(window.document.querySelector('#profile-list').textContent).toContain('creatorB');
    } finally { window.close(); }
  });

  test('network and malformed payload errors expose the same safe retry path', async () => {
    const fetch = jest.fn()
      .mockRejectedValueOnce(new Error('socket closed'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    const { dom, window } = createHarness(fetch);
    try {
      await expect(window.loadProfiles()).resolves.toBe(false);
      expect(window.document.querySelector('#profile-list-status button').textContent).toBe(locales.en.profile.retry);
      await expect(window.loadProfiles()).resolves.toBe(false);
      expect(window.document.querySelector('#profile-list-status').textContent).toContain('Could not load profiles');
      expect(window.document.querySelector('#profile-list-status').textContent).not.toContain('socket closed');
      expect(window.document.getElementById('existing-card')).not.toBeNull();
    } finally { window.close(); }
  });

  test.each(['en', 'de', 'es', 'fr'])('uses localized failure and retry labels for %s', async locale => {
    const { dom, window } = createHarness(jest.fn().mockResolvedValue({ ok: false, status: 503 }), locale);
    try {
      await expect(window.loadProfiles()).resolves.toBe(false);
      expect(window.document.querySelector('#profile-list-status span').textContent)
        .toBe(locales[locale].profile.list_load_error);
      expect(window.document.querySelector('#profile-list-status button').textContent)
        .toBe(locales[locale].profile.retry);
    } finally { window.close(); }
  });

  test.each(['en', 'de', 'es', 'fr'])('rerenders existing profile cards in %s without another request', async locale => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profiles: [
      profile,
      { ...profile, username: 'activeCreator', isActive: true }
    ] }) });
    const { dom, window } = createHarness(fetch);
    try {
      await expect(window.loadProfiles()).resolves.toBe(true);
      const cardsBefore = window.document.querySelectorAll('#profile-list > div').length;
      expect(cardsBefore).toBe(2);

      window.__changeLocale(locale);

      const list = window.document.querySelector('#profile-list');
      const text = list.textContent;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(list.querySelectorAll(':scope > div').length).toBe(2);
      expect(text).toContain(locales[locale].profile.active_badge);
      expect(text).toContain(locales[locale].profile.modified);
      expect(text).toContain(locales[locale].profile.size);
      expect(text).toContain(locales[locale].profile.switch_action);
      expect(list.textContent).toContain(new Date(profile.modified).toLocaleString(locale));
      expect(list.querySelector('button[title]')?.title).toBe(locales[locale].profile.backup_action);
      expect(Array.from(list.querySelectorAll('button[title]')).map(button => button.title))
        .toContain(locales[locale].profile.delete_action);
    } finally { window.close(); }
  });

  test.each(['en', 'de', 'es', 'fr'])('updates empty and search-empty messages for %s', async locale => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profiles: [] }) });
    const { dom, window } = createHarness(fetch);
    try {
      await expect(window.loadProfiles()).resolves.toBe(true);
      expect(window.document.querySelector('#profile-list').textContent).toBe(locales.en.profile.no_profiles);
      window.__changeLocale(locale);
      expect(window.document.querySelector('#profile-list').textContent).toBe(locales[locale].profile.no_profiles);

      await expect(window.loadProfiles()).resolves.toBe(true);
      // Exercise the same rendered search-empty branch through the existing UI state.
      window.__setProfileSearchQuery('missing');
      await expect(window.loadProfiles()).resolves.toBe(true);
      expect(window.document.querySelector('#profile-list').textContent).toBe(locales[locale].profile.no_profiles_matching_search);
    } finally { window.close(); }
  });

  test.each(['en', 'de', 'es', 'fr'])('updates a pending loading or error status for %s', async locale => {
    let rejectRequest;
    const fetch = jest.fn(() => new Promise((resolve, reject) => { rejectRequest = reject; }));
    const { dom, window } = createHarness(fetch);
    try {
      const loading = window.loadProfiles();
      window.__changeLocale(locale);
      expect(window.document.querySelector('#profile-list-status').textContent).toBe(locales[locale].common.loading);
      rejectRequest(new Error('private test detail'));
      await expect(loading).resolves.toBe(false);
      window.__changeLocale(locale === 'en' ? 'fr' : 'en');
      const targetLocale = locale === 'en' ? 'fr' : 'en';
      expect(window.document.querySelector('#profile-list-status span').textContent).toBe(locales[targetLocale].profile.list_load_error);
      expect(window.document.querySelector('#profile-list-status button').textContent).toBe(locales[targetLocale].profile.retry);
    } finally { window.close(); }
  });
});
