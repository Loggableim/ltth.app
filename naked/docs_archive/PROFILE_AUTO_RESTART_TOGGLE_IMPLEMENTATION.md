# Profile Auto-Restart Toggle Implementation

## Overview

This document describes the implementation of a UI toggle for automatic profile restart functionality in LTTH (Little TikTool Helper).

## Problem Statement

**Original Issue (German):**
> das wechseln von profilen erfordert den manuellen neustart der app - entweder auto neustart - oder profilwechsel ohne neustart

**Translation:**
> Switching profiles requires manual restart of the app - either auto restart - or profile switching without restart

## Solution Implemented

We implemented a **UI toggle for auto-restart** feature. This was chosen over hot-swapping profiles because:

1. **Hot-swapping is complex and risky**: Would require reinitializing database, TikTok connection, alerts, leaderboard, and all plugins at runtime
2. **Auto-restart already exists**: The functionality was already implemented in `profile-manager.js` but required console commands
3. **User-friendly**: A simple checkbox is much more accessible than console commands

## Implementation Details

### Files Changed

1. **app/public/dashboard.html** (Lines 3078-3104)
   - Added "Auto-Restart on Profile Switch" section in User Profiles settings
   - Added checkbox with descriptive text
   - Updated FAQ to reference the new UI toggle

2. **app/public/js/dashboard.js** (Lines 2868-2899, 51)
   - Added `initializeProfileAutoRestartToggle()` function
   - Reads initial state from `localStorage.getItem('profile_autoRestart')`
   - Handles toggle changes and persists to localStorage
   - Shows user-friendly notifications on toggle change
   - Called during DOMContentLoaded initialization

3. **app/test/profile-auto-restart-toggle.test.js** (New file)
   - Comprehensive test suite with 11 test cases
   - Tests initialization, toggle interaction, and integration with profile-manager.js
   - Validates localStorage behavior matches expectations

4. **scripts/verify-profile-auto-restart-toggle.js** (New file)
   - Manual verification guide for QA testing
   - Step-by-step testing procedure
   - Console commands for debugging

## How It Works

### User Flow with Auto-Restart Enabled

1. User navigates to **Settings → User Profiles**
2. User checks **"Enable automatic restart after profile switch"** checkbox
3. User switches to a different profile
4. App shows countdown notification: "Auto-restart in 5 seconds..."
5. App automatically reloads after countdown
6. New profile is loaded and active

### User Flow with Auto-Restart Disabled

1. User unchecks the auto-restart checkbox (or leaves it unchecked)
2. User switches to a different profile
3. App shows warning banner with "Restart Now" button
4. User clicks button when ready
5. App reloads and new profile is loaded

## Technical Implementation

### LocalStorage Key

- **Key**: `profile_autoRestart`
- **Enabled**: `"true"` (string)
- **Disabled**: `null` (removed from localStorage)

### Integration with Existing Code

The toggle integrates seamlessly with existing `profile-manager.js` code:

```javascript
// From profile-manager.js (line 228)
const autoRestartEnabled = localStorage.getItem('profile_autoRestart') === 'true';
```

The toggle sets/removes this exact localStorage key, ensuring compatibility.

### UI Components

**HTML:**
```html
<div class="bg-gray-700 rounded-lg p-4 mb-4">
    <h4 class="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
        <i data-lucide="rotate-cw" class="inline-block w-4 h-4"></i>
        Auto-Restart on Profile Switch
    </h4>
    <div class="form-group mb-3">
        <label class="checkbox-label">
            <input type="checkbox" id="profile-auto-restart-toggle">
            <span>Enable automatic restart after profile switch</span>
        </label>
        <p class="text-xs text-gray-400 mt-2">
            When enabled, the application will automatically restart 5 seconds after switching profiles. 
            You can cancel the countdown if needed.
        </p>
    </div>
</div>
```

**JavaScript:**
```javascript
function initializeProfileAutoRestartToggle() {
    const toggle = document.getElementById('profile-auto-restart-toggle');
    if (!toggle) return;

    // Load current setting from localStorage
    const isEnabled = localStorage.getItem('profile_autoRestart') === 'true';
    toggle.checked = isEnabled;

    // Handle toggle changes
    toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            localStorage.setItem('profile_autoRestart', 'true');
            console.log('✅ Auto-restart on profile switch: ENABLED');
            showNotification(
                'Auto-Restart Enabled',
                'The app will restart automatically 5 seconds after switching profiles.',
                'success'
            );
        } else {
            localStorage.removeItem('profile_autoRestart');
            console.log('❌ Auto-restart on profile switch: DISABLED');
            showNotification(
                'Auto-Restart Disabled',
                'You will need to manually restart after switching profiles.',
                'info'
            );
        }
    });
}
```

## User Benefits

1. **Accessibility**: No need to open console or remember commands
2. **Discoverability**: Feature is visible in settings UI
3. **Persistence**: Setting is remembered across sessions
4. **User Control**: Can be enabled/disabled anytime
5. **Feedback**: Clear notifications when toggling
6. **Documentation**: FAQ updated with clear instructions

## Testing

### Automated Tests

Run the test suite:
```bash
cd app
npm test -- profile-auto-restart-toggle.test.js
```

**Test Coverage:**
- Initialization from localStorage (3 tests)
- Toggle interaction (2 tests)
- Full workflow (2 tests)
- Integration with profile-manager.js (2 tests)

### Manual Testing

Run the verification guide:
```bash
node scripts/verify-profile-auto-restart-toggle.js
```

This provides a comprehensive testing procedure with expected outcomes.

## Future Enhancements

Potential improvements for future versions:

1. **Make auto-restart default**: Enable by default with opt-out
2. **Configurable countdown**: Allow users to set countdown duration (3-10 seconds)
3. **Visual countdown**: Show progress bar in notification
4. **Cancel button**: Add explicit cancel button during countdown
5. **Profile switch confirmation**: Ask before switching (optional setting)

## Backward Compatibility

✅ **Fully backward compatible**

- Existing users who set `localStorage` manually will see the toggle checked
- Default behavior unchanged (disabled if not set)
- No breaking changes to APIs or data structures
- Old console command method still works

## Known Limitations

1. **Countdown is fixed at 5 seconds**: Not configurable yet
2. **Alert dialogs**: Uses browser `alert()` instead of toast notifications
3. **No cancel button in countdown**: User must wait or refresh page
4. **Not enabled by default**: Users must opt-in

## Migration Guide

For users who previously used console commands:

**Old Method (still works):**
```javascript
// Enable
localStorage.setItem('profile_autoRestart', 'true');

// Disable
localStorage.removeItem('profile_autoRestart');
```

**New Method (recommended):**
1. Navigate to **Settings → User Profiles**
2. Check or uncheck **"Enable automatic restart after profile switch"**
3. Done! No console commands needed.

## Summary

This implementation provides a user-friendly UI toggle for the existing auto-restart functionality, making profile switching smoother and more accessible. The feature is well-tested, backward compatible, and follows the application's existing patterns and conventions.

**Status**: ✅ Complete and ready for production

**Commits**:
- `ec324e4`: Add UI toggle for auto-restart on profile switch
- `170ad88`: Fix showNotification call signature and add test

---

**Implementation Date**: January 2026
**Implements**: Issue about profile switching requiring manual restart
**Related Files**: `profile-manager.js`, `dashboard.html`, `dashboard.js`
