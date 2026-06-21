# Multilingual Plugin Descriptions - Usage Guide

## Overview

All 30 plugins now support multilingual descriptions in 4 languages:
- **English (en)** - Default
- **German (de)** - Deutsch
- **Spanish (es)** - Español
- **French (fr)** - Français

## Plugin.json Structure

Each plugin.json now contains both a backward-compatible `description` field and a new `descriptions` object:

```json
{
  "id": "example-plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "Default English description for backward compatibility",
  "descriptions": {
    "en": "Full English description with comprehensive details",
    "de": "Vollständige deutsche Beschreibung mit umfassenden Details",
    "es": "Descripción completa en español con detalles integrales",
    "fr": "Description complète en français avec détails complets"
  }
}
```

## API Usage

### Get All Plugins with Localized Descriptions

```javascript
// Default (English)
GET /api/plugins

// German descriptions
GET /api/plugins?locale=de

// Spanish descriptions
GET /api/plugins?locale=es

// French descriptions
GET /api/plugins?locale=fr
```

**Response Format:**
```json
{
  "success": true,
  "plugins": [
    {
      "id": "advanced-timer",
      "name": "Advanced Timer",
      "description": "Professional multi-timer system with event triggers...",
      "descriptions": {
        "en": "Professional multi-timer system with event triggers...",
        "de": "Professionelles Multi-Timer-System mit Event-Triggern...",
        "es": "Sistema profesional de múltiples temporizadores...",
        "fr": "Système professionnel de minuteries multiples..."
      },
      "version": "1.0.0",
      "author": "Pup Cid",
      "enabled": true
    }
  ]
}
```

### Get Single Plugin Details

```javascript
// Default (English)
GET /api/plugins/advanced-timer

// German description
GET /api/plugins/advanced-timer?locale=de

// Spanish description
GET /api/plugins/advanced-timer?locale=es

// French description
GET /api/plugins/advanced-timer?locale=fr
```

## Client-Side Implementation Example

### Vanilla JavaScript

```javascript
// Detect user's browser language
const userLocale = navigator.language.split('-')[0]; // e.g., 'en', 'de', 'es', 'fr'
const supportedLocales = ['en', 'de', 'es', 'fr'];
const locale = supportedLocales.includes(userLocale) ? userLocale : 'en';

// Fetch plugins with localized descriptions
fetch(`/api/plugins?locale=${locale}`)
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      data.plugins.forEach(plugin => {
        console.log(`${plugin.name}: ${plugin.description}`);
      });
    }
  });
```

### React Example

```jsx
import { useState, useEffect } from 'react';

function PluginList() {
  const [plugins, setPlugins] = useState([]);
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    fetch(`/api/plugins?locale=${locale}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPlugins(data.plugins);
        }
      });
  }, [locale]);

  return (
    <div>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="es">Español</option>
        <option value="fr">Français</option>
      </select>

      <div className="plugin-list">
        {plugins.map(plugin => (
          <div key={plugin.id} className="plugin-card">
            <h3>{plugin.name}</h3>
            <p>{plugin.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Vue.js Example

```vue
<template>
  <div>
    <select v-model="locale">
      <option value="en">English</option>
      <option value="de">Deutsch</option>
      <option value="es">Español</option>
      <option value="fr">Français</option>
    </select>

    <div class="plugin-list">
      <div v-for="plugin in plugins" :key="plugin.id" class="plugin-card">
        <h3>{{ plugin.name }}</h3>
        <p>{{ plugin.description }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      plugins: [],
      locale: 'en'
    };
  },
  watch: {
    locale() {
      this.fetchPlugins();
    }
  },
  mounted() {
    this.fetchPlugins();
  },
  methods: {
    async fetchPlugins() {
      const response = await fetch(`/api/plugins?locale=${this.locale}`);
      const data = await response.json();
      if (data.success) {
        this.plugins = data.plugins;
      }
    }
  }
};
</script>
```

## Backend Plugin Development

When creating new plugins, follow this structure:

```json
{
  "id": "my-new-plugin",
  "name": "My New Plugin",
  "version": "1.0.0",
  "description": "Short English description (required for backward compatibility)",
  "descriptions": {
    "en": "Full English description with all features and details",
    "de": "Vollständige deutsche Beschreibung mit allen Funktionen und Details",
    "es": "Descripción completa en español con todas las características y detalles",
    "fr": "Description complète en français avec toutes les fonctionnalités et détails"
  },
  "author": "Your Name",
  "entry": "main.js"
}
```

### Description Guidelines

**Short Description (description field):**
- 60-100 characters
- Focus on primary function
- Include key technology if relevant

**Full Descriptions (descriptions object):**
- 150-250 characters per language
- Mention 3-5 key features
- Highlight integration points (TikTok, OBS, VRChat, etc.)
- Professional and concise tone
- Consistent across all languages

## Backward Compatibility

The system maintains full backward compatibility:

1. **Legacy plugins** without `descriptions` object will use the `description` field
2. **API fallback**: If requested locale is not available, falls back to `description` field
3. **Existing code** continues to work without modifications

### Plugin Loader Logic

```javascript
function getLocalizedDescription(manifest, locale = 'en') {
  // Try to get localized description
  if (manifest.descriptions && manifest.descriptions[locale]) {
    return manifest.descriptions[locale];
  }
  
  // Fallback to default description
  return manifest.description || '';
}
```

## Testing

Run the validation script to ensure all plugins have correct descriptions:

```bash
node test-plugin-loading.js
```

This will validate:
- ✅ All plugin.json files are valid JSON
- ✅ All plugins have the `description` field (backward compatibility)
- ✅ All plugins have the `descriptions` object with 4 languages
- ✅ Localization logic works correctly
- ✅ Fallback mechanism works for legacy plugins

## Supported Plugins

All 30 plugins now have multilingual descriptions:

1. advanced-timer
2. api-bridge
3. chatango
4. clarityhud
5. coinbattle
6. config-import
7. emoji-rain
8. fireworks-webgpu
9. fireworks
10. flame-overlay
11. gcce-hud
12. gcce
13. gift-milestone
14. goals
15. hybridshock
16. lastevent-spotlight
17. leaderboard
18. minecraft-connect
19. multicam
20. openshock
21. osc-bridge
22. quiz-show
23. soundboard
24. streamalchemy
25. thermal-printer
26. tts
27. vdoninja
28. viewer-xp
29. weather-control
30. webgpu-emoji-rain

## Future Enhancements

Potential improvements for future releases:

- Add more languages (IT, PT, RU, JP, etc.)
- UI language switcher in admin panel
- Auto-detection of user's browser language
- Localized plugin names and author fields
- Translation management system for easier updates

