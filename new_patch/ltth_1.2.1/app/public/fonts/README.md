# CSP-Compliant Font Library

## Overview
This font library provides 35+ professional fonts that are fully compliant with Content Security Policy (CSP). All fonts use system fonts and web-safe alternatives, eliminating the need for external font services like Google Fonts.

## Features
- ✅ **CSP Compliant**: No external font loading - works with `font-src 'self'`
- ✅ **35+ Fonts**: Wide variety across multiple categories
- ✅ **OBS Compatible**: All fonts work perfectly in OBS Browser Sources
- ✅ **Cross-Platform**: Uses system fonts available on Windows, macOS, and Linux
- ✅ **Zero Dependencies**: No external services required
- ✅ **Accessibility**: Includes dyslexia-friendly fonts

## Font Categories

### Sans-Serif (15 fonts)
Modern, clean fonts perfect for UI and overlays:
- Arial
- Helvetica
- Segoe UI
- Roboto Alternative
- Open Sans Alternative
- Lato Alternative
- Ubuntu Alternative
- Calibri
- Tahoma
- Verdana
- Trebuchet MS
- Gill Sans Alternative
- Century Gothic
- Franklin Gothic Alternative
- Montserrat Alternative
- Poppins Alternative
- Raleway Alternative
- Oswald Alternative

**Best for**: Stream overlays, chat displays, UI elements, modern designs

### Serif (7 fonts)
Classic, elegant fonts for formal content:
- Times New Roman
- Georgia
- Palatino
- Garamond
- Cambria
- Book Antiqua
- Baskerville Alternative

**Best for**: Formal notifications, achievement displays, classic themes

### Monospace (4 fonts)
Fixed-width fonts for technical content:
- Courier New
- Consolas
- Monaco
- Lucida Console

**Best for**: Code displays, technical overlays, retro themes

### Display (4 fonts)
Decorative fonts for special effects:
- Impact
- Comic Sans MS
- Brush Script Alternative
- Papyrus

**Best for**: Headlines, meme text, special effects, casual streams

### Accessibility (1 font)
- OpenDyslexic Alternative

**Best for**: Viewers with dyslexia, maximum readability

## Usage

### Method 1: Include Full Library
Add to your HTML `<head>`:
```html
<link href="/fonts/font-library.css" rel="stylesheet">
```

Then use any font:
```css
body {
  font-family: 'Segoe UI', sans-serif;
}

.headline {
  font-family: 'Impact', sans-serif;
}

.code {
  font-family: 'Consolas', monospace;
}
```

### Method 2: Include Specific Fonts
For individual replacements (already in use):
```html
<link href="/fonts/exo-2.css" rel="stylesheet">
<link href="/fonts/open-sans.css" rel="stylesheet">
<link href="/fonts/opendyslexic.css" rel="stylesheet">
```

### Method 3: Programmatic Access
Load font metadata from JSON:
```javascript
fetch('/fonts/fonts.json')
  .then(response => response.json())
  .then(data => {
    // Access font information
    console.log(data.fonts); // All 35 fonts
    console.log(data.categories); // Font categories
    console.log(data.presets); // Curated presets
  });
```

## Font Presets

Pre-curated font combinations for common use cases:

### Streaming Overlays
- Exo 2 Alternative
- Impact
- Arial
- Segoe UI

### Professional
- Calibri
- Georgia
- Times New Roman
- Arial

### Modern
- Segoe UI
- Roboto Alternative
- Montserrat Alternative
- Poppins Alternative

### High Accessibility
- Verdana
- OpenDyslexic Alternative
- Comic Sans MS
- Arial

### Technical/Code
- Consolas
- Monaco
- Courier New
- Lucida Console

## How It Works

Instead of loading fonts from external services (which violates CSP), this library uses `@font-face` with `local()` sources to reference fonts already installed on the user's system.

**Example:**
```css
@font-face {
  font-family: 'Exo 2';
  src: local('Century Gothic'), local('Futura'), local('Arial');
}
```

This approach:
1. Tries to use the best matching system font
2. Falls back to alternatives if not available
3. Always provides a usable font
4. Requires zero network requests
5. Works perfectly with CSP `font-src 'self'`

## Integration with OBS

All fonts work perfectly in OBS Browser Sources because:
- No external requests required
- System fonts are always available
- No CORS issues
- No CSP violations
- Instant loading (no network delay)

## Browser Compatibility

✅ Chrome/Edge (Chromium 90+)
✅ Firefox (88+)
✅ Safari (14+)
✅ OBS Browser Source (CEF/Chromium 103+)

## Migration from Google Fonts

**Before (CSP violation):**
```html
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700&display=swap" rel="stylesheet">
```

**After (CSP compliant):**
```html
<link href="/fonts/exo-2.css" rel="stylesheet">
```

No JavaScript changes needed - the font-family remains the same!

## File Structure

```
/public/fonts/
├── font-library.css      # Complete library (35+ fonts)
├── exo-2.css            # Exo 2 replacement
├── open-sans.css        # Open Sans replacement
├── opendyslexic.css     # OpenDyslexic replacement
├── fonts.json           # Font metadata & configuration
└── README.md            # This file
```

## Performance

- **Zero Network Requests**: All fonts are system fonts
- **Instant Loading**: No download time
- **Zero Bandwidth**: No font files to transfer
- **CSP Compliant**: Works with strict security policies
- **Cache-Friendly**: Browser caches font references

## Adding New Fonts

To add a new system font:

1. Add `@font-face` declaration in `font-library.css`
2. Add metadata entry in `fonts.json`
3. Document in this README

Example:
```css
@font-face {
  font-family: 'New Font';
  src: local('System Font Name'), local('Fallback');
}
```

## Accessibility Features

### OpenDyslexic Alternative
- Higher letter spacing (0.05em)
- Increased line height (1.6)
- Better word spacing (0.1em)
- Uses fonts with distinct letter shapes

### High Contrast Support
All fonts work with high contrast mode and color themes.

### Screen Reader Compatible
Font choices don't affect screen reader functionality.

## Support

For issues or questions:
1. Check this README
2. Review `fonts.json` for font metadata
3. Test in OBS Browser Source
4. Verify CSP headers in server.js

## License

This library uses system fonts that are already installed on user devices. No font files are distributed, so no licensing issues apply.

## Version

**v1.0.0** - Initial release with 35 CSP-compliant fonts
