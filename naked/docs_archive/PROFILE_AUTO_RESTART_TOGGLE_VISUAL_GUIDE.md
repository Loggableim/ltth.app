# Profile Auto-Restart Toggle - Visual Guide

## UI Location

The auto-restart toggle is located in: **Settings → User Profiles**

```
┌─────────────────────────────────────────────────────────────────┐
│ Settings                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Other Settings Sections...]                                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 👥 User Profiles                                           │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │                                                             │ │
│  │ Switch between different configurations for different       │ │
│  │ streaming setups.                                          │ │
│  │                                                             │ │
│  │ ┌──────────────────────────────────────────────────────┐  │ │
│  │ │ Active Profile: default                              │  │ │
│  │ │ ⚠️ Profile changes require application restart       │  │ │
│  │ └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │ ┌──────────────────────────────────────────────────────┐  │ │
│  │ │ 🔄 Auto-Restart on Profile Switch                    │  │ │
│  │ │                                                       │  │ │
│  │ │ ☑ Enable automatic restart after profile switch     │  │ │
│  │ │                                                       │  │ │
│  │ │ When enabled, the application will automatically     │  │ │
│  │ │ restart 5 seconds after switching profiles. You can  │  │ │
│  │ │ cancel the countdown if needed.                      │  │ │
│  │ └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │ [Profile Search and Filter]                                │ │
│  │ [Profile List]                                              │ │
│  │ [Create New Profile]                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## User Interaction Flow

### Scenario 1: Enabling Auto-Restart

```
1. User clicks checkbox
   ┌─────────────────────────────────────────┐
   │ ☑ Enable automatic restart after...    │
   └─────────────────────────────────────────┘
                    ↓
2. Notification appears
   ┌─────────────────────────────────────────┐
   │ ✅ Auto-Restart Enabled                 │
   │                                          │
   │ The app will restart automatically 5     │
   │ seconds after switching profiles.        │
   │                                          │
   │              [ OK ]                      │
   └─────────────────────────────────────────┘
                    ↓
3. localStorage updated
   profile_autoRestart = "true"
```

### Scenario 2: Switching Profiles (Auto-Restart ON)

```
1. User switches profile
   ┌─────────────────────────────────────────┐
   │ Profile: shadesteryt  [Switch]          │
   └─────────────────────────────────────────┘
                    ↓
2. Countdown notification
   ┌─────────────────────────────────────────┐
   │ ℹ️ Profile switched to "shadesteryt"     │
   │                                          │
   │ Auto-restart in 5 seconds...            │
   └─────────────────────────────────────────┘
                    ↓
3. Countdown continues (4... 3... 2... 1...)
                    ↓
4. App reloads automatically
   ┌─────────────────────────────────────────┐
   │      🔄 Reloading application...        │
   └─────────────────────────────────────────┘
                    ↓
5. New profile active
   ┌─────────────────────────────────────────┐
   │ Active Profile: shadesteryt             │
   └─────────────────────────────────────────┘
```

### Scenario 3: Switching Profiles (Auto-Restart OFF)

```
1. User switches profile
   ┌─────────────────────────────────────────┐
   │ Profile: shadesteryt  [Switch]          │
   └─────────────────────────────────────────┘
                    ↓
2. Warning banner appears
   ┌─────────────────────────────────────────┐
   │ ⚠️ Profile Switch Pending                │
   │                                          │
   │ You switched to profile "shadesteryt"    │
   │ but the application is still using       │
   │ "default". Restart required to activate  │
   │ the new profile.                         │
   │                                          │
   │           [ Restart Now ]                │
   └─────────────────────────────────────────┘
                    ↓
3. User clicks "Restart Now" when ready
                    ↓
4. App reloads
                    ↓
5. New profile active
```

## Browser DevTools View

### LocalStorage (Chrome DevTools → Application → Local Storage)

**When Enabled:**
```
┌─────────────────────────────────────────────┐
│ Key                    │ Value              │
├────────────────────────┼────────────────────┤
│ profile_autoRestart    │ true               │
│ selectedProfile        │ shadesteryt        │
└────────────────────────┴────────────────────┘
```

**When Disabled:**
```
┌─────────────────────────────────────────────┐
│ Key                    │ Value              │
├────────────────────────┼────────────────────┤
│ profile_autoRestart    │ (not set)          │
│ selectedProfile        │ shadesteryt        │
└────────────────────────┴────────────────────┘
```

### Console Output

**Enabling:**
```
✅ Auto-restart on profile switch: ENABLED
```

**Disabling:**
```
❌ Auto-restart on profile switch: DISABLED
```

**During Profile Switch (enabled):**
```
🔄 Profile switched: {from: "default", to: "shadesteryt", requiresRestart: true}
♻️ Restarting application to activate new profile...
```

## FAQ Update

### Before

❓ **Can I enable auto-restart after profile switch?**

> Yes! Open your browser console (F12) and run:
> ```javascript
> localStorage.setItem('profile_autoRestart', 'true')
> ```
> After switching profiles, the application will automatically restart after a 5-second countdown.

### After

❓ **Can I enable auto-restart after profile switch?**

> Yes! In the **User Profiles** section above, you can enable the **"Auto-Restart on Profile Switch"** checkbox. When enabled, the application will automatically restart 5 seconds after switching profiles, with a countdown you can cancel if needed.

## Testing Checklist

Use this checklist when testing the feature:

- [ ] Toggle is visible in Settings → User Profiles
- [ ] Toggle is unchecked by default (for new users)
- [ ] Checking toggle shows success notification
- [ ] Unchecking toggle shows info notification
- [ ] localStorage is set to "true" when checked
- [ ] localStorage is removed when unchecked
- [ ] Toggle state persists after page refresh
- [ ] Switching profiles with toggle ON shows countdown
- [ ] App reloads automatically after countdown
- [ ] Switching profiles with toggle OFF shows warning banner
- [ ] Manual "Restart Now" button works
- [ ] FAQ mentions the checkbox (not console command)

## Implementation Notes

### Design Decisions

1. **Placement**: Directly in User Profiles section (not in a separate section)
   - Reason: Contextually relevant, users see it when managing profiles

2. **Default State**: Disabled (unchecked)
   - Reason: Preserves existing behavior, users opt-in to automation

3. **Countdown Duration**: Fixed at 5 seconds
   - Reason: Balances user control with convenience
   - Future: Make this configurable

4. **Notification Type**: Alert dialog
   - Reason: Uses existing notification system
   - Future: Upgrade to toast notifications

### Compatibility

- ✅ Works with existing profile-manager.js
- ✅ Works with old console command method
- ✅ No breaking changes to profile system
- ✅ Backward compatible with all versions

---

**Last Updated**: January 2026
**Status**: Production Ready
**Screenshot Needed**: Yes - capture Settings → User Profiles section
