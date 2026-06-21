# Soundboard Audio Animations Export/Import - UI Location

## Visual Guide

The export/import buttons are located in the **Soundboard Configuration** page, in the **Gift Sounds** section.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🎵 Soundboard Configuration                     [← Back to Dashboard]   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  ⚙️  Playback Settings                                                    │
│  [Play Mode ▼] [Max Queue: 10] [☑ Enable Soundboard]                    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  🔊 Event Sounds                                                          │
│  Follow: [URL input] [Volume: 100%] [🔊 Test]                           │
│  Subscribe: [URL input] [Volume: 100%] [🔊 Test]                        │
│  ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  🎁 Gift Sounds                                                           │
│                                                                           │
│  Available Gifts from Stream                    [🔄 Refresh Catalog]     │
│  [Grid of gift cards...]                                                 │
│                                                                           │
│  🔍 Search MyInstants                                                     │
│  [Search input] [Search]                                                 │
│  [Search results...]                                                     │
│                                                                           │
│  ➕ Add/Edit Gift Sound                                                   │
│  [Gift ID] [Label] [MP3 URL] [Volume]                                   │
│  [Animation URL] [Animation Type ▼] [Animation Volume]                  │
│  [➕ Add/Update Gift Sound] [Clear]                                      │
│                                                                           │
│  ╔═══════════════════════════════════════════════════════════════════╗  │
│  ║ 🔽 Audio-Animationen Verwaltung                                   ║  │
│  ║                                    [📥 Exportieren] [📤 Importieren]║  │
│  ╚═══════════════════════════════════════════════════════════════════╝  │
│  ◄─── NEW: Export/Import buttons added here                             │
│                                                                           │
│  Gift Sounds List                                                        │
│  ┌─────────┬────────┬─────────┬────────┬───────────┬───────────┬────────┐│
│  │ Gift ID │ Label  │ Sound   │ Volume │ Animation │ Anim. Vol.│ Actions││
│  ├─────────┼────────┼─────────┼────────┼───────────┼───────────┼────────┤│
│  │ 5655    │ Rose   │ [URL]   │ ██████│ gif       │ ████████  │ [✏️][🗑️]││
│  │ 5656    │ Heart  │ [URL]   │ ███████│ none      │ ██████████│ [✏️][🗑️]││
│  └─────────┴────────┴─────────┴────────┴───────────┴───────────┴────────┘│
└──────────────────────────────────────────────────────────────────────────┘

[💾 Save Soundboard Settings]
```

## Button Details

### Export Button
- **Label**: "Exportieren" (German) / "Export Audio Animations" (English)
- **Icon**: 📥 Download icon
- **Style**: Ghost button (outlined)
- **Action**: Downloads JSON file with all audio animations
- **Tooltip**: "Audio-Animationen als JSON-Datei exportieren"

### Import Button
- **Label**: "Importieren" (German) / "Import Audio Animations" (English)
- **Icon**: 📤 Upload icon
- **Style**: Primary button (filled)
- **Action**: Opens file picker for JSON file selection
- **Hidden**: File input `<input type="file">` (triggered by clicking the label)

## Workflow Diagrams

### Export Workflow
```
User clicks "Exportieren"
    ↓
JavaScript function exportAudioAnimations() called
    ↓
Fetch GET /api/soundboard/export-animations
    ↓
Server filters gift_sounds for animations
    ↓
Server returns JSON with:
  - version
  - exportDate
  - animationsCount
  - animations array
    ↓
Browser creates download link
    ↓
File downloaded: soundboard-animations-{timestamp}.json
    ↓
Success message logged
```

### Import Workflow
```
User clicks "Importieren"
    ↓
File picker opens (accepts only .json files)
    ↓
User selects JSON file
    ↓
JavaScript function importAudioAnimations(file) called
    ↓
File read and parsed as JSON
    ↓
Validation checks:
  - Is valid JSON?
  - Has 'animations' array?
  - All required fields present?
    ↓
POST to /api/soundboard/import-animations
    ↓
Server processes each animation:
  - Check if giftId exists → UPDATE
  - If not → INSERT
  - Track: imported, updated, failed
    ↓
Server returns result statistics
    ↓
Gift sounds list reloaded
    ↓
Success/error message shown to user
```

## Supported Animation Types

The export/import supports these animation types:
- **none**: No animation (not exported)
- **image**: Static image
- **video**: Video file (MP4, WebM)
- **gif**: Animated GIF

## File Naming Convention

Exported files use the pattern:
```
soundboard-animations-{unix_timestamp}.json
```

Example:
```
soundboard-animations-1704659356819.json
```

This ensures unique filenames and allows sorting by export date.

## Responsive Design

The buttons are styled to work on different screen sizes:
- Desktop: Full button labels visible
- Mobile: Icons + compact text
- Buttons stack vertically on small screens if needed

## Accessibility

- Buttons have proper `title` attributes for tooltips
- Icons use Lucide icon library (accessible)
- File input is keyboard accessible
- Alert messages provide screen reader feedback
