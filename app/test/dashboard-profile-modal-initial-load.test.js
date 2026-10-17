'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);
const profileListStart = dashboardSource.indexOf('let profileFilter = \'all\';');
const profileListEnd = dashboardSource.indexOf('// Initialize profile search and filter functionality', profileListStart);
const profileModalStart = dashboardSource.indexOf('async function showProfileModal() {');
const profileModalEnd = dashboardSource.indexOf('// Versteckt das Profile Modal', profileModalStart);
if ([profileListStart, profileListEnd, profileModalStart, profileModalEnd].some(index => index < 0)) {
  throw new Error('Could not locate dashboard profile-loading functions');
}

const profileListSource = dashboardSource.slice(profileListStart, profileListEnd);
const profileModalSource = dashboardSource.slice(profileModalStart, profileModalEnd);

describe('dashboard profile modal initial load', () => {
  test('loads profiles on first open and shows loading until the API responds', async () => {
    let resolveProfiles;
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="profile-list"><article id="existing-profile">Existing profile</article></div>
    </body></html>`, {
      url: 'http://localhost:3000/dashboard.html',
      runScripts: 'outside-only'
    });
    const { window } = dom;
    const switchView = jest.fn();
    const loadAliases = jest.fn().mockResolvedValue(undefined);
    window.fetch = jest.fn(() => new Promise(resolve => { resolveProfiles = resolve; }));
    window.NavigationManager = { switchView };
    window.loadUsernameAliases = loadAliases;
    window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    window.i18n = { t: key => key === 'common.loading' ? 'Loading...' : key };
    window.escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);

    window.eval(`
      ${profileListSource}
      ${profileModalSource}
      window.showProfileModal = showProfileModal;
    `);

    try {
      const opening = window.showProfileModal();
      const status = window.document.getElementById('profile-list-status');

      expect(switchView).toHaveBeenCalledWith('settings');
      expect(window.fetch).toHaveBeenCalledWith('/api/profiles', { cache: 'no-store' });
      expect(status.textContent).toBe('Loading...');
      expect(status.getAttribute('role')).toBe('status');
      expect(window.document.getElementById('existing-profile')).not.toBeNull();
      expect(loadAliases).toHaveBeenCalledTimes(1);
      await opening;

      resolveProfiles({
        ok: true,
        json: async () => ({ profiles: [{
          username: 'creatorB',
          modified: '2026-10-08T10:00:00Z',
          size: 2048,
          isActive: false
        }] })
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(window.document.getElementById('profile-list-status')).toBeNull();
      expect(window.document.getElementById('existing-profile')).toBeNull();
      expect(window.document.querySelector('#profile-list').textContent).toContain('creatorB');
    } finally {
      window.close();
    }
  });
});
