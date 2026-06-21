# Audio Animations Export/Import Feature

## Overview
This feature allows users to export and import audio animation configurations for gift sounds in the soundboard plugin. This is useful for backing up configurations, sharing setups with other users, or migrating settings between installations.

## User Interface

The export/import functionality is located in the **Gift Sounds** section of the Soundboard Configuration page, just above the gift sounds table.

### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│ 🔽 Audio-Animationen Verwaltung                             │
│                                    [Exportieren] [Importieren]│
└─────────────────────────────────────────────────────────────┘
```

- **Exportieren Button**: Downloads all gift sounds with animations as a JSON file
- **Importieren Button**: Opens file picker to select a JSON file to import

## Export Format

The exported JSON file contains the following structure:

```json
{
  "version": "1.0",
  "exportDate": "2026-01-07T20:49:16.819Z",
  "animationsCount": 2,
  "animations": [
    {
      "giftId": 5655,
      "label": "Rose",
      "mp3Url": "https://example.com/sound.mp3",
      "volume": 1.0,
      "animationUrl": "https://example.com/animation.gif",
      "animationType": "gif",
      "animationVolume": 0.8
    }
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Format version (currently "1.0") |
| `exportDate` | string | ISO 8601 timestamp of export |
| `animationsCount` | number | Total number of animations exported |
| `animations` | array | Array of animation configurations |
| `animations[].giftId` | number | TikTok gift ID |
| `animations[].label` | string | Gift label/name |
| `animations[].mp3Url` | string | Sound effect URL |
| `animations[].volume` | number | Sound volume (0.0 to 1.0) |
| `animations[].animationUrl` | string | Animation media URL (video/image/gif) |
| `animations[].animationType` | string | Animation type: "none", "image", "video", "gif" |
| `animations[].animationVolume` | number | Animation audio volume (0.0 to 1.0) |

## Usage

### Exporting Audio Animations

1. Navigate to **Soundboard Configuration** (`/soundboard/ui`)
2. Scroll to the **Gift Sounds List** section
3. Click the **Exportieren** button
4. A JSON file will be downloaded with the filename pattern: `soundboard-animations-{timestamp}.json`

**Note**: Only gift sounds that have animations configured (animationType ≠ "none" and animationUrl exists) will be included in the export.

### Importing Audio Animations

1. Navigate to **Soundboard Configuration** (`/soundboard/ui`)
2. Scroll to the **Gift Sounds List** section
3. Click the **Importieren** button
4. Select a valid JSON file (previously exported)
5. The import process will:
   - Validate the file format
   - Check for required fields
   - Update existing gift sounds
   - Add new gift sounds
   - Report any errors

### Import Results

After import, an alert will show:
```
✅ Import abgeschlossen: {X} neue, {Y} aktualisiert, {Z} fehlgeschlagen
```

- **neue (new)**: Number of new gift sounds added
- **aktualisiert (updated)**: Number of existing gift sounds updated
- **fehlgeschlagen (failed)**: Number of items that failed to import

If there are errors, the first 5 error messages will be displayed.

## API Endpoints

### GET `/api/soundboard/export-animations`

Exports all gift sounds with animations as JSON.

**Response:**
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename="soundboard-animations-{timestamp}.json"`
- Body: JSON with structure described above

### POST `/api/soundboard/import-animations`

Imports audio animation configurations from JSON.

**Request Body:**
```json
{
  "version": "1.0",
  "animations": [...]
}
```

**Response:**
```json
{
  "success": true,
  "imported": 5,
  "updated": 3,
  "failed": 0,
  "total": 8,
  "errors": []
}
```

## Error Handling

### Export Errors
- Network errors
- Server errors (500)
- Permission errors

### Import Errors
- Invalid file format (not JSON)
- Missing required fields (giftId, label, mp3Url)
- Invalid data types
- Database write errors

All errors are logged and shown to the user via alert dialogs.

## Localization

The feature is fully localized in 4 languages:

| Language | Export | Import |
|----------|--------|--------|
| German (de) | Exportieren | Importieren |
| English (en) | Export Audio Animations | Import Audio Animations |
| French (fr) | Exporter les animations audio | Importer les animations audio |
| Spanish (es) | Exportar animaciones de audio | Importar animaciones de audio |

## Technical Details

### Backend Implementation
- **File**: `app/plugins/soundboard/main.js`
- **Export Endpoint**: Lines 809-839
- **Import Endpoint**: Lines 845-925

### Frontend Implementation
- **File**: `app/public/js/dashboard-soundboard.js`
- **Export Function**: `exportAudioAnimations()` (lines 1272-1300)
- **Import Function**: `importAudioAnimations(file)` (lines 1302-1368)
- **Event Handlers**: Lines 2133-2148

### UI Implementation
- **File**: `app/plugins/soundboard/ui/index.html`
- **Location**: Lines 650-667
- **Section**: "Audio-Animationen Verwaltung"

## Security Considerations

- File upload only accepts `.json` files
- Import validates all data before processing
- Malformed JSON is rejected
- Missing required fields are reported
- Database operations are wrapped in try-catch blocks

## Testing

A comprehensive test suite is available:
- **File**: `app/test/soundboard-export-import.test.js`
- **Coverage**: Backend endpoints, frontend functions, UI elements, localization
- **Run tests**: `npm test soundboard-export-import.test.js`

## Future Enhancements

Possible improvements for future versions:
- Bulk export/import for all soundboard settings
- Import preview before applying changes
- Selective import (choose which items to import)
- Export to different formats (CSV, XML)
- Cloud sync integration
- Version migration tools

## Support

For issues or questions, please refer to:
- Main documentation: `/app/plugins/soundboard/README.md`
- Plugin documentation: `/app/wiki/Plugin-Dokumentation.md`
- GitHub Issues: https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop/issues
