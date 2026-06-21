# TTS API Keys Migration Summary

## Overview
Successfully migrated TTS API key management from the TTS plugin admin panel to the global Settings panel for centralized configuration.

## What Changed

### 1. Dashboard Settings Panel (`app/public/dashboard.html`)
**Added:** New "TTS Engine API Keys" section after the EulerStream API Key section

Features:
- Google Cloud TTS API Key input field
- Speechify API Key input field
- ElevenLabs API Key input field
- OpenAI TTS API Key input field
- Toggle visibility buttons for each field (show/hide password)
- Help text with links to get API keys
- Save TTS API Keys button

Location: Between EulerStream API Key section and OpenAI API Configuration section

### 2. Dashboard JavaScript (`app/public/js/dashboard.js`)
**Added:**
- `saveTTSAPIKeys()` function to save API keys to global settings via `/api/settings` endpoint
- Event listener for "Save TTS API Keys" button
- Toggle visibility button handlers for each API key field
- Loading logic for TTS API keys in `loadSettings()` function
  - Keys are displayed as masked placeholders (e.g., `***HIDDEN***`, `***REDACTED***`)
  - Placeholder text indicates when a key is configured

**Key Features:**
- Only saves non-empty keys that aren't placeholders
- Updates local settings cache after successful save
- Shows user-friendly alerts for success/error
- Reloads settings after save to display masked keys

### 3. TTS Plugin Admin Panel (`app/plugins/tts/ui/admin-panel.html`)
**Removed:** Entire "API Keys Section" with all input fields

**Added:** Informational notice directing users to the global Settings panel

The notice includes:
- Clear explanation that API keys are now managed globally
- Step-by-step instructions to configure keys
- Rationale for the centralized approach

### 4. TTS Admin JavaScript (`app/plugins/tts/ui/tts-admin-production.js`)
**Removed:**
- API key loading code in `loadConfig()` function
- API key saving code in `saveConfig()` function
- Toggle visibility button event handlers for all API key fields

**Added:** Comments indicating API keys are now managed in global Settings panel

## Backend Integration

### No Backend Changes Required ✅
The TTS plugin's `main.js` already supports loading API keys from global settings:

```javascript
// Lines 403-406 in app/plugins/tts/main.js
config.googleApiKey = db.getSetting('tts_google_api_key') || config.googleApiKey;
config.speechifyApiKey = db.getSetting('tts_speechify_api_key') || config.speechifyApiKey;
config.elevenlabsApiKey = db.getSetting('tts_elevenlabs_api_key') || config.elevenlabsApiKey;
config.openaiApiKey = db.getSetting('tts_openai_api_key') || config.openaiApiKey;
```

The plugin also saves keys to global settings when updated:
```javascript
// Lines 567, 585, 603, 621 in app/plugins/tts/main.js
db.setSetting('tts_google_api_key', updates.googleApiKey);
db.setSetting('tts_speechify_api_key', updates.speechifyApiKey);
db.setSetting('tts_elevenlabs_api_key', updates.elevenlabsApiKey);
db.setSetting('tts_openai_api_key', updates.openaiApiKey);
```

## Benefits

1. **Centralized Management**: All API keys (EulerStream, OpenAI, TTS engines) are now in one location
2. **Better UX**: Users don't need to navigate to plugin-specific panels to configure API keys
3. **Consistency**: API key management follows the same pattern across all services
4. **Security**: Keys are displayed as masked placeholders in the UI
5. **No Data Loss**: Existing API keys stored in the database are preserved and automatically loaded from global settings

## Migration Path for Users

### For New Users
1. Go to Settings panel
2. Scroll to "TTS Engine API Keys" section
3. Enter API keys and click "Save TTS API Keys"

### For Existing Users with API Keys
**No action required!** 

Existing API keys are:
- Already stored in global settings (`tts_*_api_key`)
- Automatically loaded by the TTS plugin
- Will appear as masked placeholders in the new Settings UI

Users can:
- Update existing keys by entering new values and saving
- Leave fields as-is to keep existing keys
- Clear a key by removing it from the settings database

## Testing Checklist

- [x] JavaScript syntax validation (both files pass `node -c` check)
- [x] HTML structure verified (new sections added correctly)
- [ ] Manual UI test: Open Settings panel and verify TTS API Keys section appears
- [ ] Manual UI test: Toggle visibility buttons work correctly
- [ ] Manual UI test: Save button stores keys in database
- [ ] Manual UI test: Keys load as masked placeholders on page refresh
- [ ] Manual UI test: TTS plugin still initializes engines with stored keys
- [ ] Manual UI test: TTS admin panel shows informational notice
- [ ] Manual UI test: Verify updating a key in Settings updates the TTS plugin

## Files Modified

1. `app/public/dashboard.html` - Added TTS API Keys section
2. `app/public/js/dashboard.js` - Added save/load logic and toggle handlers
3. `app/plugins/tts/ui/admin-panel.html` - Replaced API Keys section with notice
4. `app/plugins/tts/ui/tts-admin-production.js` - Removed API key handling code

## Database Schema

No changes to database schema. Uses existing `settings` table:

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

Keys used:
- `tts_google_api_key`
- `tts_speechify_api_key`
- `tts_elevenlabs_api_key`
- `tts_openai_api_key`

## Implementation Date
2025-12-10

## Related Issue
🔑 API Keys - Configure API keys for each TTS engine. Only engines with valid API keys can be used.

German requirement: "dieser bereich soll aus dem tts plugin ausgelagert werden und global über das settings panel gespeichert werden wo auch der eulerstream key gespeichert ist"

Translation: "This area should be outsourced from the TTS plugin and stored globally via the settings panel where the EulerStream key is also stored"
