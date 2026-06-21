# API Key Masking Feature - Visual Guide

## Summary
This feature adds a clear indicator to all API key input fields showing when a key is already saved, improving user experience and security.

## Changes Overview

### 1. StreamAlchemy Plugin (`app/plugins/streamalchemy/ui.html`)

**Before:**
```
OpenAI API Key: [sk-abc123...]  (shows actual key or empty)
LightX API Key: [lx-xyz789...]   (shows actual key or empty)
Silicon Flow API Key: [sf-def456...] (shows actual key or empty)
```

**After:**
```
OpenAI API Key: [***SAVED***]
                 ↑ Placeholder: "API Key gespeichert (verborgen)"
LightX API Key: [***SAVED***]
                 ↑ Placeholder: "API Key gespeichert (verborgen)"
Silicon Flow API Key: [***SAVED***]
                       ↑ Placeholder: "API Key gespeichert (verborgen)"
```

### 2. OpenShock Plugin (`app/plugins/openshock/ui.js`)

**Before:**
```
API Key: [abc12345...jkl0] (shows first 8 + last 4 chars)
```

**After:**
```
API Key: [***SAVED***]
          ↑ Placeholder: "API Key gespeichert (verborgen)"
```

**User Message when trying to save without changing:**
```
"API key ist bereits gespeichert. Gib einen neuen Key ein, um ihn zu ändern."
(API key is already saved. Enter a new key to change it.)
```

### 3. Dashboard - OpenAI Configuration (`app/public/js/dashboard.js`)

**Before:**
```
API Key: [sk-abc123def456ghi789jkl012] (shows actual key or empty)
```

**After:**
```
API Key: [***REDACTED***]
          ↑ Placeholder: "API key configured (hidden)"
```

**User Alert when trying to save without changing:**
```
"ℹ️ API key is already saved. To update it, replace the ***REDACTED*** value with your new API key."
```

### 4. Dashboard - TikTok/Eulerstream Configuration (`app/public/js/dashboard.js`)

**Before:**
```
API Key: [abcdefghijklmnopqrstuvwxyz123456] (shows actual key or empty)
```

**After:**
```
API Key: [***REDACTED***]
          ↑ Placeholder: "API key configured (hidden)"
```

**User Alert when trying to save without changing:**
```
"ℹ️ API key is already saved. To update it, replace the ***REDACTED*** value with your new API key."
```

## User Workflow

### Scenario 1: Viewing Saved Keys
1. User opens settings panel
2. If API key is already saved:
   - Input field shows `***SAVED***` or `***REDACTED***`
   - Placeholder text indicates "API Key gespeichert (verborgen)" or "API key configured (hidden)"
   - User knows a key is configured without seeing the actual value

### Scenario 2: Adding a New Key
1. User opens settings panel
2. If no API key is saved:
   - Input field is empty
   - Placeholder shows default hint (e.g., "sk-...", "lx-...", "Enter your API key...")
3. User enters new key and saves
4. On next load, key is masked as `***SAVED***` or `***REDACTED***`

### Scenario 3: Updating an Existing Key
1. User sees masked value `***SAVED***` or `***REDACTED***`
2. User clears the field and enters new key
3. User clicks save
4. New key is saved and masked on next load

### Scenario 4: Accidentally Clicking Save Without Changes
1. User sees masked value `***SAVED***` or `***REDACTED***`
2. User clicks save without changing the value
3. System shows info message explaining the key is already saved
4. No unnecessary save operation is performed

## Security Benefits

1. **API keys are never displayed in plain text** once saved
2. **Users can still update keys** by replacing the masked value
3. **Consistent pattern** across all plugins and dashboard
4. **Clear feedback** when a key is already configured

## Language Consistency

- **German UIs** (StreamAlchemy, OpenShock): Use German text
  - `lang="de"` in HTML
  - Placeholders: "API Key gespeichert (verborgen)"
  - Messages: "API key ist bereits gespeichert..."

- **English UI** (Dashboard): Use English text
  - `lang="en"` in HTML
  - Placeholders: "API key configured (hidden)"
  - Messages: "API key is already saved..."

This follows the existing localization pattern in the application.

## Testing

All logic has been tested with 12 comprehensive unit tests covering:
- Masking when keys exist
- Empty values when keys don't exist
- Skipping masked values during save
- Handling new keys correctly

**Test Results:** ✅ All 12 tests passing
