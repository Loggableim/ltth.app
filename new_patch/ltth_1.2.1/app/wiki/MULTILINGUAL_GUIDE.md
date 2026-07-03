# Multilingual Wiki Documentation Guide

## Overview

The Little TikTool Helper wiki now supports 4 languages:
- 🇬🇧 **English** (en)
- 🇩🇪 **Deutsch** (de)
- 🇪🇸 **Español** (es)
- 🇫🇷 **Français** (fr)

## Architecture

We use **Option 2: Multilingual Markdown with Sections** as recommended in the implementation plan. This approach keeps all language versions in a single file with clear section markers.

### Benefits
- ✅ Easier maintenance - single file per topic
- ✅ Consistent structure across languages
- ✅ Single-file viewing for comparisons
- ✅ Simpler navigation and linking

## File Structure

### Multilingual Files (Phase 5A - Completed)
- `Home.md` - Welcome page (4 languages) ✅
- `Getting-Started.md` - Quick start guide (4 languages) ✅
- `FAQ-&-Troubleshooting.md` - FAQ and troubleshooting (4 languages) ✅

### Remaining Files (To be translated)
- `Installation-&-Setup.md` - Installation guide
- `Plugin-Dokumentation.md` - Plugin documentation
- `Plugin-Liste.md` - Plugin list
- `Overlays-&-Alerts.md` - Overlay setup
- `Konfiguration.md` - Configuration guide
- `API-Reference.md` - API documentation
- `Advanced-Features.md` - Advanced features
- `Architektur.md` - Architecture
- `Entwickler-Leitfaden.md` - Developer guide

## Creating Multilingual Pages

### Template Structure

```markdown
# Title / Titel / Título / Titre

[← Previous](Link) | [→ Next](Link)

---

## Language Selection / Sprachauswahl / Selección de idioma / Sélection de la langue

- [🇬🇧 English](#english)
- [🇩🇪 Deutsch](#deutsch)
- [🇪🇸 Español](#español)
- [🇫🇷 Français](#français)

---

## 🇬🇧 English

### 📑 Table of Contents

[English content here...]

---

*Last updated: 2025-12-11*  
*Version: 1.2.1*

---

## 🇩🇪 Deutsch

### 📑 Inhaltsverzeichnis

[German content here...]

---

*Letzte Aktualisierung: 2025-12-11*  
*Version: 1.2.1*

---

## 🇪🇸 Español

### 📑 Tabla de Contenidos

[Spanish content here...]

---

*Última actualización: 2025-12-11*  
*Versión: 1.2.1*

---

## 🇫🇷 Français

### 📑 Table des Matières

[French content here...]

---

*Dernière mise à jour : 2025-12-11*  
*Version : 1.2.1*
```

### Guidelines

1. **Start with language selection** - Always include the 4-language menu at the top
2. **Use language flags** - Emojis help visual identification (🇬🇧 🇩🇪 🇪🇸 🇫🇷)
3. **ID anchors** - Use `#english`, `#deutsch`, `#español`, `#français` for main sections
4. **Consistent structure** - Keep the same structure across all language sections
5. **Sub-section anchors** - Use language suffix for sub-sections (e.g., `#overview-english`)
6. **Internal links** - Point to language-specific anchors: `[Link](Page.md#english)`
7. **Code examples** - Keep code in English but translate comments
8. **Technical terms** - Maintain consistency (use glossary if needed)

### Anchor Format

Main language sections:
```markdown
## 🇬🇧 English {#english}
## 🇩🇪 Deutsch {#deutsch}
## 🇪🇸 Español {#español}
## 🇫🇷 Français {#français}
```

Sub-sections (include language suffix):
```markdown
### Overview {#overview-english}
### Installation {#installation-english}
```

### Internal Links

When linking to other wiki pages, include the language anchor:

```markdown
[Getting Started](Getting-Started.md#english)
[Installation](Installation-&-Setup.md#deutsch)
[FAQ](FAQ-&-Troubleshooting.md#español)
```

## Technical Implementation

### Language Detection

The wiki system automatically detects language preference:
1. **localStorage** - Saved preference (highest priority)
2. **Browser language** - Detected from `navigator.language`
3. **Default** - English (fallback)

### Language Selector

Located in the wiki header (top-right):
```html
<select id="wiki-language-selector">
  <option value="en">🇬🇧 English</option>
  <option value="de">🇩🇪 Deutsch</option>
  <option value="es">🇪🇸 Español</option>
  <option value="fr">🇫🇷 Français</option>
</select>
```

### Auto-Scroll

When a page loads, it automatically scrolls to the preferred language section:
- English → scrolls to `#english`
- Deutsch → scrolls to `#deutsch`
- Español → scrolls to `#español`
- Français → scrolls to `#français`

### Caching

Wiki pages are cached per language:
```javascript
const cacheKey = `${pageId}-${currentLanguage}`;
// Examples: "home-en", "home-de", "home-es", "home-fr"
```

### API Route

The wiki API route accepts a `lang` query parameter:
```javascript
GET /api/wiki/page/home?lang=de
```

Response includes:
```json
{
  "id": "home",
  "title": "Home",
  "html": "...",
  "toc": [...],
  "breadcrumb": [...],
  "lastUpdated": "2025-12-11T...",
  "preferredLanguage": "de",
  "languageAnchor": "deutsch"
}
```

## Translation Workflow

### Step 1: Backup Original
```bash
cp Original.md Original-Old.md
```

### Step 2: Create Multilingual Version
- Use template structure above
- Copy German content to `Deutsch` section
- Translate to English, Spanish, French
- Keep technical terms consistent

### Step 3: Test
1. Start server: `npm start`
2. Open wiki: `http://localhost:3000/wiki.html`
3. Test language selector
4. Verify auto-scroll works
5. Check internal links

### Step 4: Replace Original
```bash
mv Original.md Original-Old.md
mv Original-Multilingual.md Original.md
```

## Testing

Run multilingual wiki tests:
```bash
cd app
npm test test/multilingual-wiki.test.js
```

Tests cover:
- Language anchor generation
- Multilingual file existence
- Language section markers
- Language preference detection
- Cache key generation

## Best Practices

### DO ✅
- Maintain consistent structure across all languages
- Use language-specific anchors for deep linking
- Test all internal links after translation
- Keep code examples in English (translate comments)
- Use native speakers for review when possible

### DON'T ❌
- Mix languages within a section
- Forget to update "Last updated" dates
- Use machine translation without review
- Change technical terminology across languages
- Remove language selection menu

## Future Enhancements

Potential improvements for Phase 5B and 5C:

1. **Translation Helper Tool**
   - Script to validate structure consistency
   - Automated anchor checking
   - Missing translation detection

2. **Language Switcher Persistence**
   - Remember last viewed language per page
   - Sync across browser tabs

3. **Search with Language Filtering**
   - Search only in preferred language
   - Cross-language search option

4. **Translation Progress Tracker**
   - Dashboard showing translation completeness
   - Missing sections highlighted

5. **Community Translations**
   - Contribution guidelines for translators
   - Translation review process

## Files Modified

### Backend
- `app/routes/wiki-routes.js` - Added language query parameter support
- `app/public/js/wiki.js` - Added language detection and auto-scroll

### Frontend
- `app/public/wiki.html` - Added language selector UI

### Documentation
- `app/wiki/Home.md` - Multilingual (EN/DE/ES/FR)
- `app/wiki/Getting-Started.md` - Multilingual (EN/DE/ES/FR)
- `app/wiki/FAQ-&-Troubleshooting.md` - Multilingual (EN/DE/ES/FR)

### Tests
- `app/test/multilingual-wiki.test.js` - Comprehensive tests

## Support

For questions or issues with multilingual wiki:
- 📧 Email: loggableim@gmail.com
- 🐛 GitHub Issues: [Report issues](https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop/issues)

---

**Created:** 2025-12-11  
**Phase:** 5A Complete (3/4 high-priority pages)  
**Status:** ✅ Core infrastructure complete
