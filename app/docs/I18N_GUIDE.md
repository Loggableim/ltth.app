# Internationalization (i18n) Guide

## Overview

This project implements a comprehensive internationalization (i18n) system that allows the entire application to be displayed in multiple languages. The system supports:

- **Client-side and server-side** translation
- **Real-time language switching** without page reload
- **Persistent language preferences** via localStorage
- **Fallback mechanism** to default language (English)
- **Interpolation** for dynamic values
- **OBS overlay support** for multilingual streaming

## Supported Languages

Currently supported languages:

- 🇬🇧 **English** (`en`) - Default
- 🇩🇪 **German** (`de`)
- 🇪🇸 **Spanish** (`es`)
- 🇫🇷 **French** (`fr`)

## How to Add a New Language

### Step 1: Create Translation File

1. Create a new JSON file in the `locales/` directory:
   ```bash
   cp locales/en.json locales/[language-code].json
   ```

2. Replace `[language-code]` with the ISO 639-1 language code:
   - Italian: `it`
   - Portuguese: `pt`
   - Russian: `ru`
   - Japanese: `ja`
   - Chinese: `zh`
   - Korean: `ko`
   - etc.

### Step 2: Translate All Strings

Open your new translation file and translate all values while keeping the keys unchanged:

```json
{
  "app": {
    "name": "Pup Cid's Little TikTool Helper",
    "tagline": "Your translated tagline here"
  },
  "dashboard": {
    "title": "Your translation",
    "connect": "Your translation",
    ...
  }
}
```

**Important:**
- ✅ Keep all JSON keys in English
- ✅ Translate only the values
- ✅ Maintain the exact same structure
- ✅ Keep placeholders like `{username}`, `{coins}`, etc. unchanged
- ✅ Test special characters and Unicode support

### Step 3: Register the Language

1. **Update `modules/i18n.js`:**
   ```javascript
   const locales = ['en', 'de', 'es', 'fr', 'it']; // Add your language code
   ```

2. **Update Language Selector in `dashboard.html`:**
   ```html
   <select id="language-selector" class="form-input">
       <option value="en">English</option>
       <option value="de">Deutsch</option>
       <option value="es">Español</option>
       <option value="fr">Français</option>
       <option value="it">Italiano</option> <!-- Add your language -->
   </select>
   ```

3. **Restart the server** to load the new translations:
   ```bash
   npm start
   ```

### Step 4: Test Your Translation

1. Open the application
2. Navigate to **Settings** → **Language**
3. Select your newly added language
4. Verify all UI elements display correctly
5. Test dynamic text interpolation (e.g., usernames, counts)
6. Test OBS overlays if applicable

## Translation Key Naming Conventions

### Namespace Organization

Translations are organized by feature/component:

```
app.*              - Application-level strings
navigation.*       - Sidebar navigation items
dashboard.*        - Dashboard view
plugins.*          - Plugin Manager
soundboard.*       - Soundboard feature
flows.*            - Automation flows
goals.*            - Goals/objectives
overlay.*          - OBS overlays
obs.*              - OBS integration
settings.*         - Settings panel
profile.*          - User profiles
theme.*            - Theme/appearance
common.*           - Reusable UI elements
errors.*           - Error messages
notifications.*    - Success/info messages
permissions.*      - Permission requests
effects.*          - Interactive effects
```

### Key Naming Rules

1. **Use snake_case** for keys: `connection_status` not `connectionStatus`
2. **Be descriptive**: `dashboard.stats.viewers` not `dashboard.v`
3. **Group related items**: `dashboard.quick_action.tts`
4. **Use consistent prefixes** for actions:
   - Actions: `create_`, `edit_`, `delete_`, `save_`
   - States: `enabled`, `disabled`, `active`, `inactive`
   - Statuses: `success`, `error`, `loading`, `connected`

## Using Translations in Code

### In HTML (Recommended)

Use `data-i18n` attributes for automatic translation:

```html
<!-- Text content -->
<span data-i18n="dashboard.connect">Connect</span>

<!-- Placeholder -->
<input data-i18n-placeholder="dashboard.username_placeholder" placeholder="Username">

<!-- Title/Tooltip -->
<button data-i18n-title="settings.save" title="Save">
    <i data-lucide="save"></i>
</button>

<!-- Aria labels for accessibility -->
<button data-i18n-aria="common.close" aria-label="Close">×</button>
```

### In JavaScript

Use the global `i18n` object:

```javascript
// Simple translation
const title = i18n.t('dashboard.title');

// With interpolation
const message = i18n.t('events.gift', {
    username: 'JohnDoe',
    giftName: 'Rose',
    repeatCount: 5,
    coins: 100
});
// Output: "JohnDoe sent Rose x5 (100 coins)"

// Check current language
const currentLang = i18n.getLocale(); // 'en', 'de', etc.

// Change language programmatically
await i18n.changeLanguage('de');
i18n.updateDOM(); // Update all data-i18n elements
```

### Dynamic Content Updates

When language changes, the system automatically updates:
1. All elements with `data-i18n*` attributes
2. Page title
3. HTML lang attribute

To add custom behavior on language change:

```javascript
i18n.onLanguageChange((newLocale) => {
    console.log('Language changed to:', newLocale);
    // Your custom logic here
});
```

## Interpolation Syntax

Use curly braces for dynamic values. Both `{param}` and `{{param}}` are supported:

```json
{
  "events": {
    "gift": "{username} sent {giftName} x{repeatCount} ({coins} coins)",
    "follow": "{{username}} followed!",
    "goal_progress": "{current} / {target}"
  }
}
```

Usage:
```javascript
i18n.t('events.gift', {
    username: 'Alice',
    giftName: 'Diamond',
    repeatCount: 10,
    coins: 5000
});
```

## OBS Browser Source Integration

### Setup

OBS overlays automatically load translations:

```html
<!DOCTYPE html>
<html>
<head>
    <script src="/socket.io/socket.io.js"></script>
    <script src="/js/i18n-client.js"></script> <!-- Add this -->
</head>
<body>
    <div data-i18n="overlay.goals_hud">Goals HUD</div>
</body>
</html>
```

### Performance Considerations

- ✅ Translations are cached in localStorage
- ✅ Lazy loading prevents unnecessary network requests
- ✅ Minimal DOM updates (only changed elements)
- ✅ No impact on animation performance

## API Endpoints

The i18n system provides REST API endpoints:

### Get Translations
```http
GET /api/i18n/translations?locale=de
```

Response:
```json
{
  "success": true,
  "locale": "de",
  "translations": { /* full translation object */ }
}
```

### Get Available Locales
```http
GET /api/i18n/locales
```

Response:
```json
{
  "success": true,
  "locales": ["en", "de", "es", "fr"]
}
```

### Set Current Locale (Server-side)
```http
POST /api/i18n/locale
Content-Type: application/json

{
  "locale": "de"
}
```

## Testing Checklist

When adding a new language, verify:

- [ ] All UI text is translated correctly
- [ ] No missing translation keys (falls back to English if missing)
- [ ] Special characters display correctly (é, ñ, ü, etc.)
- [ ] Numbers and dates format appropriately for locale
- [ ] Dynamic text interpolation works (usernames, counts, etc.)
- [ ] Error messages display in new language
- [ ] Success notifications display in new language
- [ ] Settings panel shows language correctly
- [ ] Language switcher updates immediately
- [ ] OBS overlays display in new language
- [ ] Language preference persists after page reload
- [ ] No console errors when switching languages

## Translation Quality Tips

1. **Keep it concise** - UI space is limited
2. **Be consistent** - Use the same term for the same concept
3. **Consider context** - "Save" might be "Speichern" or "Sichern" in German depending on context
4. **Test with real users** - Native speakers can spot awkward phrasing
5. **Use gender-neutral language** when possible
6. **Respect cultural differences** - Colors, symbols, and metaphors vary
7. **Keep technical terms** - Brand names, API names stay in English
8. **Update README** - Add translation credits

## Common Issues and Solutions

### Translation Not Showing

1. **Check the key exists** in the translation file
2. **Verify JSON syntax** (use a JSON validator)
3. **Clear localStorage** and refresh
4. **Check browser console** for errors
5. **Restart the server** after adding new locales

### Interpolation Not Working

```javascript
// ❌ Wrong
i18n.t('events.gift', { user: 'John' }); // Wrong parameter name

// ✅ Correct
i18n.t('events.gift', { username: 'John' }); // Matches {username}
```

### Language Not Persisting

- Check if localStorage is enabled in browser
- Verify `i18n.changeLanguage()` is being called
- Check browser developer tools → Application → Local Storage

## Contributing Translations

We welcome translation contributions! To contribute:

1. Fork the repository
2. Create your translation file
3. Test thoroughly
4. Submit a Pull Request with:
   - Translation file (`locales/[code].json`)
   - Updated language selector in `dashboard.html`
   - Updated `locales` array in `modules/i18n.js`
   - Brief description of what you translated

## Translation Credits

- 🇬🇧 English: Original
- 🇩🇪 German: Copilot AI
- 🇪🇸 Spanish: *Needs native speaker review*
- 🇫🇷 French: *Needs native speaker review*

## Need Help?

- **Documentation**: Check `../infos/llm_start_here.md`
- **Issues**: Open a GitHub issue
- **Questions**: Check existing translations for examples

---

**Last Updated**: 2025-11-20
**i18n Version**: 1.0.0
