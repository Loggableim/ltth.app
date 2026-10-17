'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dashboardHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'dashboard.html'),
  'utf8'
);
const dashboardScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);

describe('embedded profile switch flow', () => {
  test('continues after a successful switch when the legacy profile modal is absent', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost/dashboard.html'
    });
    const { window } = dom;
    const beginProfileRestart = jest.fn();
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.i18n = { t: key => key };
    window.profileManager = { beginProfileRestart };
    window.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        activeProfile: 'DEMO-A-local',
        newProfile: 'DEMO-B-local',
        requiresRestart: true,
        restartScheduled: true
      })
    });
    const documentAddEventListener = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = (type, listener, ...options) => {
      if (type === 'DOMContentLoaded') return;
      return documentAddEventListener(type, listener, ...options);
    };

    try {
      window.eval(`${dashboardScript}\nwindow.__switchDemoProfile = switchProfile;`);
      await window.__switchDemoProfile('DEMO-B-local');

      expect(window.document.getElementById('profile-modal')).toBeNull();
      expect(window.fetch).toHaveBeenCalledWith('/api/profiles/switch', expect.objectContaining({ method: 'POST' }));
      expect(window.localStorage.getItem('selectedProfile')).toBe('DEMO-B-local');
      expect(beginProfileRestart).toHaveBeenCalledWith({
        from: 'DEMO-A-local',
        to: 'DEMO-B-local',
        requiresRestart: true,
        restartScheduled: true
      });
      expect(window.alert).not.toHaveBeenCalled();
    } finally {
      dom.window.close();
    }
  });

  test('event and active-profile retry buttons respect hidden even when button styles set display:flex', async () => {
    const dom = new JSDOM(dashboardHtml, {
      runScripts: 'outside-only',
      url: 'http://localhost/dashboard.html'
    });
    const { window } = dom;
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.i18n = { t: key => ({
      'events.history_load_error': 'History error',
      'events.history_retry': 'Retry history',
      'events.no_events': 'No history',
      'profile.active_profile_loading': 'Loading profile',
      'profile.active_profile_load_error': 'Profile error',
      'profile.retry': 'Retry profile'
    })[key] || key };
    const documentAddEventListener = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = (type, listener, ...options) => {
      if (type === 'DOMContentLoaded') return;
      return documentAddEventListener(type, listener, ...options);
    };

    try {
      window.eval(`${dashboardScript}\nwindow.__setEventLogStatus = setEventLogStatus; window.__loadActiveProfile = loadActiveProfile;`);
      const eventRetry = window.document.getElementById('event-log-retry-btn');
      const profileRetry = window.document.getElementById('active-profile-retry-btn');

      expect(dashboardHtml).toMatch(/#event-log-retry-btn\[hidden\][\s\S]*?#active-profile-retry-btn\[hidden\][\s\S]*?display:\s*none\s*!important/);
      expect(eventRetry.hidden).toBe(true);
      expect(profileRetry.hidden).toBe(true);

      window.__setEventLogStatus('history_load_error', { showRetry: true });
      expect(eventRetry.hidden).toBe(false);
      window.__setEventLogStatus('no_events');
      expect(eventRetry.hidden).toBe(true);

      window.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
      await window.__loadActiveProfile();
      expect(profileRetry.hidden).toBe(false);
      expect(window.document.getElementById('active-profile-status').textContent).toBe('Profile error');

      window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, activeProfile: 'DEMO-A-local' })
      });
      await window.__loadActiveProfile();
      expect(profileRetry.hidden).toBe(true);
    } finally {
      dom.window.close();
    }
  });
});
