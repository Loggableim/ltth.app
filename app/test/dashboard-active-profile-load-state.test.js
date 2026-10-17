'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
const start = source.indexOf('function initializeActiveProfileRetry() {');
const end = source.indexOf('// Initialize profile auto-restart toggle', start);
if (start < 0 || end < 0) throw new Error('Could not locate active profile loading functions');
const activeProfileSource = source.slice(start, end);
const locales = ['de', 'en', 'es', 'fr'];
const messages = Object.fromEntries(locales.map(locale => [locale,
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8')).profile
]));

function createHarness(fetch, locale = 'en') {
  const strings = messages[locale];
  const dom = new JSDOM(`<!doctype html><div>
    <span id="current-profile-name" data-i18n="profile.active_profile_loading">${strings.active_profile_loading}</span>
    <span id="active-profile-display" data-i18n="profile.active_profile_loading">${strings.active_profile_loading}</span>
    <div id="active-profile-status" role="status" aria-live="polite" hidden></div>
    <button id="active-profile-retry-btn" type="button" data-i18n="profile.retry" hidden>${strings.retry}</button>
  </div>`, {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.fetch = fetch;
  window.i18n = { t: key => {
    const [namespace, name] = key.split('.');
    return namespace === 'profile' && strings[name] ? strings[name] : key;
  } };
  window.console = { error: jest.fn() };
  window.eval(activeProfileSource);
  window.initializeActiveProfileRetry();
  return { dom, window };
}

describe('dashboard active profile loading states', () => {
  test.each(locales)('shows localized loading from cold open through response (%s)', async locale => {
    let resolveFetch;
    const fetch = jest.fn(() => new Promise(resolve => { resolveFetch = resolve; }));
    const { dom, window } = createHarness(fetch, locale);
    try {
      const strings = messages[locale];
      expect(window.document.getElementById('active-profile-display').textContent).toBe(strings.active_profile_loading);
      const loading = window.loadActiveProfile();
      expect(window.document.getElementById('active-profile-status').textContent).toBe(strings.active_profile_loading);
      expect(window.document.getElementById('active-profile-status').hidden).toBe(false);
      expect(window.document.getElementById('active-profile-retry-btn').disabled).toBe(true);
      resolveFetch({ ok: true, json: async () => ({ success: true, activeProfile: 'synthetic-profile' }) });
      await expect(loading).resolves.toBe(true);
      expect(window.document.getElementById('active-profile-display').textContent).toBe('synthetic-profile');
      expect(window.document.getElementById('current-profile-name').textContent).toBe('synthetic-profile');
      expect(window.document.getElementById('active-profile-display').hasAttribute('data-i18n')).toBe(false);
      expect(window.document.getElementById('active-profile-status').hidden).toBe(true);
    } finally { window.close(); }
  });

  const failures = [
    ['HTTP failure', () => jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ success: false, error: 'private server detail' }) }), /private server detail/],
    ['network failure', () => jest.fn().mockRejectedValue(new Error('private socket detail')), /private socket detail/],
    ['malformed payload', () => jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, pendingProfile: 'wrong shape' }) }), /wrong shape/]
  ];

  test.each(failures.flatMap(([name, factory, privateDetail]) => locales.map(locale => [name, locale, factory, privateDetail])))
    ('preserves prior profile and shows localized safe retry after %s (%s)', async (_name, locale, fetchFactory, privateDetail) => {
      const fetch = fetchFactory();
      const { dom, window } = createHarness(fetch, locale);
      try {
        const strings = messages[locale];
        window.document.getElementById('current-profile-name').textContent = 'existing-current';
        window.document.getElementById('active-profile-display').textContent = 'existing-active';
        await expect(window.loadActiveProfile()).resolves.toBe(false);
        expect(window.document.getElementById('current-profile-name').textContent).toBe('existing-current');
        expect(window.document.getElementById('active-profile-display').textContent).toBe('existing-active');
        expect(window.document.getElementById('active-profile-status').textContent).toBe(strings.active_profile_load_error);
        expect(window.document.getElementById('active-profile-status').hidden).toBe(false);
        expect(window.document.getElementById('active-profile-retry-btn').textContent).toBe(strings.retry);
        expect(window.document.getElementById('active-profile-retry-btn').hidden).toBe(false);
        expect(window.document.body.textContent).not.toMatch(privateDetail);
        expect(window.console.error).toHaveBeenCalledWith('Failed to load active profile status.');
      } finally { window.close(); }
    });

  test.each(locales)('retry replaces preserved values only on valid response (%s)', async locale => {
    const fetch = jest.fn()
      .mockRejectedValueOnce(new Error('private network detail'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, activeProfile: 'synthetic-profile' }) });
    const { dom, window } = createHarness(fetch, locale);
    try {
      window.document.getElementById('current-profile-name').textContent = 'existing-current';
      window.document.getElementById('active-profile-display').textContent = 'existing-active';
      await expect(window.loadActiveProfile()).resolves.toBe(false);
      window.document.getElementById('active-profile-retry-btn').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(window.document.getElementById('current-profile-name').textContent).toBe('synthetic-profile');
      expect(window.document.getElementById('active-profile-display').textContent).toBe('synthetic-profile');
      expect(window.document.getElementById('active-profile-status').hidden).toBe(true);
      expect(window.document.getElementById('active-profile-retry-btn').hidden).toBe(true);
    } finally { window.close(); }
  });
});
