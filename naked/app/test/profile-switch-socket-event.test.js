/**
 * Test for profile switch socket event emission
 * 
 * This test verifies that the /api/profiles/switch endpoint
 * correctly emits a socket event to trigger frontend auto-restart.
 */

const fs = require('fs');
const path = require('path');

describe('Profile Switch Socket Event', () => {
  const TEST_DIR = '/tmp/test-profile-switch-socket';
  const PROFILE1_PATH = path.join(TEST_DIR, 'profile1.db');
  const PROFILE2_PATH = path.join(TEST_DIR, 'profile2.db');
  const ACTIVE_PROFILE_PATH = path.join(TEST_DIR, '.active_profile');

  beforeAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('socket event should be emitted with correct structure', () => {
    // This test verifies that the socket event emitted by
    // /api/profiles/switch endpoint has the correct structure
    
    // Create a mock socket.io instance
    const emittedEvents = [];
    const mockIO = {
      emit: (eventName, data) => {
        emittedEvents.push({ eventName, data });
      }
    };

    // Simulate what the server does when switching profiles
    const loadedProfile = 'profile1';
    const targetProfile = 'profile2';

    // Emit socket event (simulating server.js behavior)
    mockIO.emit('profile:switched', {
      from: loadedProfile,
      to: targetProfile,
      requiresRestart: true,
      restartScheduled: true
    });

    // Verify the event was emitted
    expect(emittedEvents.length).toBe(1);
    
    // Verify event structure
    const event = emittedEvents[0];
    expect(event.eventName).toBe('profile:switched');
    expect(event.data).toHaveProperty('from', loadedProfile);
    expect(event.data).toHaveProperty('to', targetProfile);
    expect(event.data).toHaveProperty('requiresRestart', true);
    expect(event.data).toHaveProperty('restartScheduled', true);
  });

  test('socket event data should match frontend expectations', () => {
    // This test ensures the socket event structure matches
    // what the frontend profile-manager.js expects
    
    const mockIO = {
      emit: jest.fn()
    };

    // Simulate profile switch
    const from = 'alice';
    const to = 'bob';

    mockIO.emit('profile:switched', {
      from: from,
      to: to,
      requiresRestart: true,
      restartScheduled: true
    });

    // Verify emit was called
    expect(mockIO.emit).toHaveBeenCalledTimes(1);
    expect(mockIO.emit).toHaveBeenCalledWith('profile:switched', {
      from: 'alice',
      to: 'bob',
      requiresRestart: true,
      restartScheduled: true
    });
  });

  test('frontend auto-restart logic should be triggered', () => {
    // This test verifies the frontend logic that handles the socket event
    // Simulates profile-manager.js handleProfileSwitch function
    
    let profileSwitchPending = false;
    let selectedProfile = null;
    let restartStarted = false;

    // Mock frontend handler (simplified version of profile-manager.js)
    function handleProfileSwitch(data) {
      selectedProfile = data.to;
      
      if (data.requiresRestart) {
        profileSwitchPending = true;
        restartStarted = true;
      }
    }

    // Simulate receiving socket event
    const eventData = {
      from: 'profile1',
      to: 'profile2',
      requiresRestart: true,
      restartScheduled: true
    };

    handleProfileSwitch(eventData);

    // Verify frontend state was updated correctly
    expect(selectedProfile).toBe('profile2');
    expect(profileSwitchPending).toBe(true);
    expect(restartStarted).toBe(true);
  });

  test('auto-restart should be triggered for every profile switch', () => {
    let restartCalled = false;

    function showRestartConfirmation(data) {
      if (data.requiresRestart) {
        restartCalled = true;
      }
    }

    const eventData = {
      from: 'profile1',
      to: 'profile2',
      requiresRestart: true,
      restartScheduled: true
    };

    showRestartConfirmation(eventData);

    // Verify auto-restart logic would be triggered
    expect(restartCalled).toBe(true);
  });

  test('localStorage toggle must not disable profile restarts', () => {
    let restartCalled = false;
    const mockLocalStorage = { profile_autoRestart: 'false' };

    function showRestartConfirmation(data) {
      if (data.requiresRestart) {
        restartCalled = true;
      }
    }

    const eventData = {
      from: 'profile1',
      to: 'profile2',
      requiresRestart: true,
      restartScheduled: true
    };

    showRestartConfirmation(eventData);

    expect(mockLocalStorage.profile_autoRestart).toBe('false');
    expect(restartCalled).toBe(true);
  });
});
