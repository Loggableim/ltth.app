const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('profile switch Socket.IO client flow', () => {
  test('the real profile manager listener starts the scheduled restart UI from a local fixture', async () => {
    const dom = new JSDOM(
      '<!doctype html><html><body><div class="topbar"></div><span id="current-profile-name"></span><button id="profile-btn"></button></body></html>',
      { url: 'http://127.0.0.1:3000/dashboard.html', runScripts: 'outside-only' }
    );
    const { window } = dom;
    const socketHandlers = new Map();
    let resolveSocketRegistration;
    const socketRegistration = new Promise(resolve => {
      resolveSocketRegistration = resolve;
    });

    window.socket = {
      on: jest.fn((eventName, handler) => {
        socketHandlers.set(eventName, handler);
        if (eventName === 'profile:switched') resolveSocketRegistration();
      })
    };
    window.i18n = { t: key => key };
    window.showToast = jest.fn();
    window.fetch = jest.fn(url => {
      if (url === '/api/profiles/active') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ activeProfile: 'alice', pendingProfile: null })
        });
      }
      if (String(url).startsWith('/api/profiles/active?restartPoll=')) {
        // Keep the scheduled-restart wait pending; this fixture has no server.
        return new Promise(() => {});
      }
      throw new Error(`Unexpected profile fixture request: ${url}`);
    });

    const profileManagerPath = path.join(__dirname, '..', 'public', 'js', 'profile-manager.js');
    window.eval(fs.readFileSync(profileManagerPath, 'utf8'));

    try {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      await socketRegistration;

      const eventData = {
        from: 'alice',
        to: 'bob',
        requiresRestart: true,
        restartScheduled: true
      };
      socketHandlers.get('profile:switched')(eventData);

      expect(window.profileManager.selectedProfile).toBe('bob');
      expect(window.profileManager.profileSwitchPending).toBe(true);
      expect(window.localStorage.getItem('selectedProfile')).toBe('bob');
      expect(window.document.getElementById('server-restart-overlay').textContent).toContain('bob');
      expect(window.showToast).toHaveBeenCalledWith(
        'profile.switched_notification',
        'info',
        3000
      );
      expect(window.fetch).not.toHaveBeenCalledWith(
        '/api/server/restart',
        expect.objectContaining({ method: 'POST' })
      );
      expect(window.fetch.mock.calls.every(([url]) =>
        url === '/api/profiles/active' || String(url).startsWith('/api/profiles/active?restartPoll=')
      )).toBe(true);
    } finally {
      window.close();
    }
  });
});
