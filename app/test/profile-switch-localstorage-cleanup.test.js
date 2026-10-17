/**
 * Test for localStorage cleanup after successful profile switch
 * 
 * This test verifies that localStorage is properly cleared when
 * the active profile matches the selected profile, preventing
 * false positive warnings after a successful restart.
 */

describe('Profile Switch localStorage Cleanup', () => {
  // Mock localStorage
  let mockLocalStorage = {};

  beforeEach(() => {
    // Reset mock localStorage before each test
    mockLocalStorage = {};
  });

  // Helper to simulate localStorage
  const localStorage = {
    getItem: (key) => Object.prototype.hasOwnProperty.call(mockLocalStorage, key) ? mockLocalStorage[key] : null,
    setItem: (key, value) => { mockLocalStorage[key] = value; },
    removeItem: (key) => { delete mockLocalStorage[key]; }
  };

  const profilesMatch = (a, b) =>
    typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

  test('should clear localStorage when profiles match after load', () => {
    // Simulate scenario:
    // 1. User switched to 'shadesteryt'
    // 2. App restarted
    // 3. Server now running with 'shadesteryt' as activeProfile
    // 4. localStorage still has 'shadesteryt' stored

    // Set up initial state (after restart)
    localStorage.setItem('selectedProfile', 'shadesteryt');
    
    const activeProfile = 'shadesteryt'; // From server
    const selectedProfile = localStorage.getItem('selectedProfile'); // From localStorage

    // Simulate loadProfileStatus logic
    if (selectedProfile && selectedProfile === activeProfile) {
      // Profiles match - clear localStorage
      localStorage.removeItem('selectedProfile');
    }

    // Verify localStorage was cleared
    expect(localStorage.getItem('selectedProfile')).toBeNull();
  });

  test('should NOT clear localStorage when profiles differ', () => {
    // Simulate scenario:
    // 1. User switched to 'shadesteryt' but hasn't restarted yet
    // 2. Server still running with 'pupcid' as activeProfile
    // 3. localStorage has 'shadesteryt' stored
    
    localStorage.setItem('selectedProfile', 'shadesteryt');
    
    const activeProfile = 'pupcid'; // From server (still old profile)
    const selectedProfile = localStorage.getItem('selectedProfile'); // From localStorage

    // Simulate loadProfileStatus logic
    if (selectedProfile && selectedProfile === activeProfile) {
      localStorage.removeItem('selectedProfile');
    }

    // Verify localStorage was NOT cleared (profiles don't match)
    expect(localStorage.getItem('selectedProfile')).toBe('shadesteryt');
  });

  test('should clear localStorage on page load when profiles match', () => {
    // Simulate checkPendingProfileSwitch scenario
    localStorage.setItem('selectedProfile', 'myprofile');
    
    const activeProfile = 'myprofile'; // From server
    const storedSelected = localStorage.getItem('selectedProfile');

    // Simulate checkPendingProfileSwitch logic
    if (storedSelected && storedSelected !== activeProfile) {
      // Would show warning
    } else if (storedSelected && storedSelected === activeProfile) {
      // Profiles match - clear localStorage
      localStorage.removeItem('selectedProfile');
    }

    // Verify localStorage was cleared
    expect(localStorage.getItem('selectedProfile')).toBeNull();
  });

  test('should treat profile names as equal regardless of case', () => {
    localStorage.setItem('selectedProfile', 'Pupcid');

    const activeProfile = 'pupcid';
    const selectedProfile = localStorage.getItem('selectedProfile');

    let profileSwitchPending = false;

    if (selectedProfile && !profilesMatch(selectedProfile, activeProfile)) {
      profileSwitchPending = true;
    } else if (profilesMatch(selectedProfile, activeProfile)) {
      localStorage.removeItem('selectedProfile');
    }

    expect(profileSwitchPending).toBe(false);
    expect(localStorage.getItem('selectedProfile')).toBeNull();
  });

  test('should handle missing localStorage gracefully', () => {
    // Simulate scenario where localStorage has no selectedProfile
    const activeProfile = 'default';
    const selectedProfile = localStorage.getItem('selectedProfile'); // Returns null

    // Should not throw error
    expect(() => {
      if (selectedProfile && selectedProfile === activeProfile) {
        localStorage.removeItem('selectedProfile');
      }
    }).not.toThrow();

    // Verify no changes
    expect(localStorage.getItem('selectedProfile')).toBeNull();
  });

  test('should handle empty string in localStorage', () => {
    // Edge case: empty string stored
    localStorage.setItem('selectedProfile', '');
    
    const activeProfile = 'default';
    const selectedProfile = localStorage.getItem('selectedProfile');

    // Empty string should not match
    if (selectedProfile && selectedProfile === activeProfile) {
      localStorage.removeItem('selectedProfile');
    }

    // Verify localStorage still has empty string (not cleared)
    expect(localStorage.getItem('selectedProfile')).toBe('');
  });

  test('full profile switch lifecycle', () => {
    // Test complete flow from switch to restart to cleanup

    // Step 1: User switches profile
    const initialProfile = 'pupcid';
    const targetProfile = 'shadesteryt';
    
    // Frontend stores the selection
    localStorage.setItem('selectedProfile', targetProfile);
    expect(localStorage.getItem('selectedProfile')).toBe('shadesteryt');

    // Step 2: User restarts application (simulation)
    // Server now loads with targetProfile as activeProfile
    const activeProfileAfterRestart = targetProfile;

    // Step 3: Frontend checks on load
    const storedSelected = localStorage.getItem('selectedProfile');
    
    // Step 4: Cleanup logic
    if (storedSelected && storedSelected === activeProfileAfterRestart) {
      localStorage.removeItem('selectedProfile');
    }

    // Step 5: Verify cleanup
    expect(localStorage.getItem('selectedProfile')).toBeNull();
  });

  test('should not show warning when localStorage cleared', () => {
    // Verify that after cleanup, warning won't show
    localStorage.setItem('selectedProfile', 'testprofile');
    
    const activeProfile = 'testprofile';
    const selectedProfile = localStorage.getItem('selectedProfile');
    
    let profileSwitchPending = false;

    // Cleanup logic
    if (selectedProfile && selectedProfile === activeProfile) {
      localStorage.removeItem('selectedProfile');
    } else if (selectedProfile && selectedProfile !== activeProfile) {
      profileSwitchPending = true;
    }

    // Verify warning flag is NOT set
    expect(profileSwitchPending).toBe(false);
    expect(localStorage.getItem('selectedProfile')).toBeNull();
  });

  test('should show warning only when profiles actually differ', () => {
    // Verify warning is shown when restart is actually needed
    localStorage.setItem('selectedProfile', 'newprofile');
    
    const activeProfile = 'oldprofile';
    const selectedProfile = localStorage.getItem('selectedProfile');
    
    let profileSwitchPending = false;

    // Check logic
    if (selectedProfile && selectedProfile !== activeProfile) {
      profileSwitchPending = true;
    } else if (selectedProfile && selectedProfile === activeProfile) {
      localStorage.removeItem('selectedProfile');
    }

    // Verify warning IS shown and localStorage NOT cleared
    expect(profileSwitchPending).toBe(true);
    expect(localStorage.getItem('selectedProfile')).toBe('newprofile');
  });

  test('real profile manager clears stale selectedProfile when server has no pending switch', async () => {
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');

    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
      'utf8'
    );

    const dom = new JSDOM(`<!doctype html>
      <html>
        <body>
          <div class="topbar"></div>
          <button id="profile-btn"><span id="current-profile-name"></span></button>
        </body>
      </html>`, {
      url: 'http://localhost:3000/dashboard.html',
      runScripts: 'outside-only'
    });

    const { window } = dom;
    let restartRequests = 0;
    window.console = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    window.fetch = jest.fn(async (url, options = {}) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith('/api/profiles/active')) {
        return {
          ok: true,
          json: async () => ({
            activeProfile: 'currentProfile',
            requiresRestart: false,
            port: 3000
          })
        };
      }
      if (requestUrl === '/api/server/restart' && options.method === 'POST') {
        restartRequests++;
        return {
          ok: true,
          json: async () => ({ success: true, restartScheduled: true })
        };
      }
      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    window.localStorage.setItem('selectedProfile', 'staleTarget');
    window.eval(source);
    await window.profileManager.loadProfileStatus();

    try {
      expect(window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(restartRequests).toBe(0);
      expect(window.document.getElementById('profile-switch-warning')).toBeNull();
      expect(window.document.getElementById('server-restart-overlay')).toBeNull();
    } finally {
      window.close();
    }
  });

  test('real profile manager stops and stays blocked after plugin cleanup failure', async () => {
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'js', 'profile-manager.js'),
      'utf8'
    );
    const activeStatus = {
      activeProfile: 'profileA',
      pendingProfile: 'profileB',
      requiresRestart: true,
      restartState: 'blocked-cleanup',
      restartFailure: {
        code: 'PLUGIN_CLEANUP_BLOCKED',
        message: 'Server restart is blocked because plugin cleanup did not complete.'
      }
    };
    const requests = [];
    const toast = jest.fn();

    const createDom = () => {
      const dom = new JSDOM(`<!doctype html>
        <html><body>
          <header class="topbar"></header>
          <button id="profile-btn"><span id="current-profile-name"></span></button>
          <div id="server-restart-overlay">Waiting</div>
        </body></html>`, {
        url: 'http://localhost:3000/dashboard.html',
        runScripts: 'outside-only'
      });
      const { window } = dom;
      window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      window.showToast = toast;
      window.i18n = { t: key => key };
      window.fetch = jest.fn(async (url, options = {}) => {
        requests.push({ url: String(url), method: options.method || 'GET' });
        if (String(url).startsWith('/api/profiles/active')) {
          return { ok: true, json: async () => ({ ...activeStatus }) };
        }
        throw new Error(`Unexpected request: ${url}`);
      });
      window.eval(source);
      return dom;
    };

    const dispatchReadyAndFlush = async window => {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    };

    let firstDom;
    let reloadedDom;
    try {
      firstDom = createDom();
      firstDom.window.localStorage.setItem('selectedProfile', 'profileB');
      await dispatchReadyAndFlush(firstDom.window);

      expect(firstDom.window.document.getElementById('server-restart-overlay')).toBeNull();
      const warning = firstDom.window.document.getElementById('profile-switch-warning');
      expect(warning).not.toBeNull();
      expect(firstDom.window.profileManager.activeProfile).toBe('profileA');
      expect(firstDom.window.profileManager.selectedProfile).toBe('profileB');
      expect(firstDom.window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(warning.querySelector('.btn-restart-now')).toBeNull();
      expect(toast).toHaveBeenCalledWith(
        'profile.restart_failed: Server restart is blocked because plugin cleanup did not complete.',
        'error',
        10000
      );

      await dispatchReadyAndFlush(firstDom.window);
      expect(firstDom.window.document.getElementById('server-restart-overlay')).toBeNull();
      expect(firstDom.window.localStorage.getItem('selectedProfile')).toBeNull();
      expect(warning.querySelector('.btn-restart-now')).toBeNull();

      reloadedDom = createDom();
      await dispatchReadyAndFlush(reloadedDom.window);
      expect(reloadedDom.window.document.getElementById('server-restart-overlay')).toBeNull();
      expect(reloadedDom.window.document.getElementById('profile-switch-warning')).not.toBeNull();
      expect(reloadedDom.window.profileManager.activeProfile).toBe('profileA');
      expect(reloadedDom.window.profileManager.selectedProfile).toBe('profileB');
      expect(reloadedDom.window.document.querySelector('.btn-restart-now')).toBeNull();

      expect(requests.filter(request => request.method === 'POST')).toHaveLength(0);
      expect(requests.filter(request => request.url.includes('restartPoll='))).toHaveLength(0);
      expect(requests.every(request => request.url === '/api/profiles/active')).toBe(true);
      expect(toast).toHaveBeenCalledTimes(2);
    } finally {
      firstDom?.window.close();
      reloadedDom?.window.close();
    }
  });
});
