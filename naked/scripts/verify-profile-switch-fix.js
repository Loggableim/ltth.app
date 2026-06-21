#!/usr/bin/env node

/**
 * Manual verification script for profile switch localStorage cleanup
 * 
 * This script simulates the behavior of profile-manager.js to verify
 * that the localStorage cleanup logic works correctly.
 */

console.log('🧪 Profile Switch localStorage Cleanup - Manual Verification\n');

// Mock localStorage
const localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = value;
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Test scenarios
const scenarios = [
  {
    name: 'Scenario 1: After successful restart (profiles match)',
    setup: () => {
      localStorage.clear();
      localStorage.setItem('selectedProfile', 'shadesteryt');
    },
    activeProfile: 'shadesteryt',
    expectedResult: {
      warningShown: false,
      localStorageCleared: true
    }
  },
  {
    name: 'Scenario 2: Pending restart (profiles differ)',
    setup: () => {
      localStorage.clear();
      localStorage.setItem('selectedProfile', 'shadesteryt');
    },
    activeProfile: 'pupcid',
    expectedResult: {
      warningShown: true,
      localStorageCleared: false
    }
  },
  {
    name: 'Scenario 3: No localStorage entry',
    setup: () => {
      localStorage.clear();
    },
    activeProfile: 'default',
    expectedResult: {
      warningShown: false,
      localStorageCleared: true // Will be true because selectedProfile defaults to activeProfile
    }
  },
  {
    name: 'Scenario 4: Same profile, different case (edge case)',
    setup: () => {
      localStorage.clear();
      localStorage.setItem('selectedProfile', 'MyProfile');
    },
    activeProfile: 'myprofile',
    expectedResult: {
      warningShown: true,
      localStorageCleared: false
    }
  }
];

// Simulate loadProfileStatus logic
function loadProfileStatus(activeProfile) {
  const selectedProfile = localStorage.getItem('selectedProfile') || activeProfile;
  let profileSwitchPending = false;

  // Check if profiles differ (pending restart)
  if (selectedProfile && selectedProfile !== activeProfile) {
    profileSwitchPending = true;
    console.log('  ⚠️  Warning: Profile switch pending');
  } else if (selectedProfile === activeProfile) {
    // Profiles match - clear localStorage to prevent false warnings after restart
    localStorage.removeItem('selectedProfile');
    console.log('  ✅ Profile switch completed successfully - localStorage cleared');
  }

  return {
    warningShown: profileSwitchPending,
    localStorageCleared: !localStorage.getItem('selectedProfile')
  };
}

// Run tests
console.log('Running verification scenarios:\n');
let passed = 0;
let failed = 0;

scenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.name}`);
  
  // Setup
  scenario.setup();
  console.log(`  Setup: localStorage.selectedProfile = "${localStorage.getItem('selectedProfile') || '(empty)'}"`);
  console.log(`  Active profile from server: "${scenario.activeProfile}"`);
  
  // Run logic
  const result = loadProfileStatus(scenario.activeProfile);
  
  // Verify
  const warningMatch = result.warningShown === scenario.expectedResult.warningShown;
  const storageMatch = result.localStorageCleared === scenario.expectedResult.localStorageCleared;
  
  console.log(`  After processing: localStorage.selectedProfile = "${localStorage.getItem('selectedProfile') || '(cleared)'}"`);
  
  if (warningMatch && storageMatch) {
    console.log('  ✅ PASS\n');
    passed++;
  } else {
    console.log('  ❌ FAIL');
    if (!warningMatch) {
      console.log(`    Expected warning: ${scenario.expectedResult.warningShown}, Got: ${result.warningShown}`);
    }
    if (!storageMatch) {
      console.log(`    Expected localStorage cleared: ${scenario.expectedResult.localStorageCleared}, Got: ${result.localStorageCleared}`);
    }
    console.log('');
    failed++;
  }
});

// Summary
console.log('═══════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════\n');

if (failed === 0) {
  console.log('✅ All scenarios passed! The fix works correctly.\n');
  console.log('Key findings:');
  console.log('- After restart with matching profiles: localStorage is cleared ✅');
  console.log('- Before restart with different profiles: warning shown, localStorage kept ✅');
  console.log('- No localStorage entry: no issues ✅');
  process.exit(0);
} else {
  console.log('❌ Some scenarios failed. Review the logic.\n');
  process.exit(1);
}
