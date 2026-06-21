# GCCE Gift HUD Rotator - Custom Media Support

## Overview

The GCCE Gift HUD Rotator now supports custom media entries (GIF, JPEG, PNG, MP4) alongside TikTok gift entries. This allows streamers to display their own images and videos in the HUD with the same templates, animations, and styling as gifts.

## Features

### Mixed Entry Types
- **Gift Entries**: Traditional TikTok gifts from the gift catalog
- **Media Entries**: Custom images (PNG, JPEG, GIF) and videos (MP4)
- Both types can be mixed in the same rotator

### Media Upload Options
1. **File Upload**: Upload files directly (max 10MB)
2. **External URL**: Link to media hosted elsewhere

### Supported Formats
- **Images**: PNG, JPEG, GIF
- **Videos**: MP4

### Customization
All media entries support the same customization options as gifts:
- Title (headline)
- Info text (subtitle)
- Template (card, banner, minimal, modern, neon, elegant, bold, compact, wide, gradient)
- Animation (fade, slide, zoom, flip, rotate, bounce, swing)
- Font family
- Colors (text, accent, background)

## Usage

### Admin UI

1. Navigate to GCCE plugin UI
2. Scroll to "Gift HUD Rotator" section
3. Toggle between "TikTok Gift" and "Custom Media" modes

#### Adding Custom Media

**Option 1: Upload File**
1. Click "Custom Media" button
2. Select a file (PNG, JPEG, GIF, or MP4)
3. Click "Upload"
4. Fill in Title and Info text
5. Customize template, animation, and colors
6. Click "Add to Rotator"

**Option 2: External URL**
1. Click "Custom Media" button
2. Enter the media URL in the text field
3. Click "Use URL"
4. Fill in Title and Info text
5. Customize template, animation, and colors
6. Click "Add to Rotator"

#### Managing Entries

- View all entries in the rotator list
- Each entry shows a type badge (🎁 gift or 📁 media)
- Remove entries with the "Remove" button
- Save the entire rotator configuration with "Save Rotator"

### Overlay Display

Media entries are displayed with the same visual style as gifts:
- Images render as `<img>` elements
- Videos render as `<video>` elements (autoplay, loop, muted)
- Same templates and animations apply
- Rotation interval applies to all entries

### API Usage

#### Upload Media

```http
POST /api/gcce/hud/media-upload
Content-Type: multipart/form-data

media: [file]
```

**Response:**
```json
{
  "success": true,
  "url": "/api/gcce/hud/media/media-1234567890.gif",
  "mimetype": "image/gif",
  "mediaKind": "image",
  "filename": "media-1234567890.gif",
  "size": 524288
}
```

#### Get Rotator Config

```http
GET /api/gcce/hud/rotator
```

**Response:**
```json
{
  "success": true,
  "rotator": {
    "enabled": true,
    "intervalSeconds": 10,
    "entries": [
      {
        "id": "gift-1234",
        "type": "gift",
        "giftId": "123",
        "giftName": "Rose",
        "giftImage": "https://...",
        "title": "Beautiful Rose",
        "info": "Thanks!",
        "template": "card",
        "animation": "fade",
        ...
      },
      {
        "id": "media-5678",
        "type": "media",
        "mediaUrl": "/api/gcce/hud/media/media-123.gif",
        "mediaKind": "image",
        "mimetype": "image/gif",
        "title": "Custom GIF",
        "info": "My animation",
        "template": "modern",
        "animation": "zoom",
        ...
      }
    ]
  }
}
```

#### Update Rotator Config

```http
POST /api/gcce/hud/rotator
Content-Type: application/json

{
  "rotator": {
    "enabled": true,
    "intervalSeconds": 12,
    "entries": [...]
  }
}
```

## Data Model

### Gift Entry
```javascript
{
  id: string,              // Unique identifier
  type: 'gift',            // Entry type
  giftId: string,          // TikTok gift ID
  giftName: string,        // Gift name
  giftImage: string,       // Gift image URL
  title: string,           // Custom title (max 120 chars)
  info: string,            // Custom info (max 160 chars)
  template: string,        // Template style
  animation: string,       // Animation effect
  fontFamily: string,      // Font family
  textColor: string,       // Text color (CSS)
  accentColor: string,     // Accent color (CSS)
  backgroundColor: string  // Background color (CSS)
}
```

### Media Entry
```javascript
{
  id: string,              // Unique identifier
  type: 'media',           // Entry type
  mediaUrl: string,        // Media URL
  mediaKind: string,       // 'image' or 'video'
  mimetype: string,        // MIME type
  durationMs: number,      // Optional: video duration
  poster: string,          // Optional: video poster
  title: string,           // Custom title (max 120 chars)
  info: string,            // Custom info (max 160 chars)
  template: string,        // Template style
  animation: string,       // Animation effect
  fontFamily: string,      // Font family
  textColor: string,       // Text color (CSS)
  accentColor: string,     // Accent color (CSS)
  backgroundColor: string  // Background color (CSS)
}
```

## Storage

- Uploaded media files are stored in the plugin data directory
- Path: `{user_profile}/plugins/gcce/media/`
- Files persist across application updates
- Configuration is stored in the database

## Security

- **MIME Type Validation**: Only PNG, JPEG, GIF, MP4 allowed
- **File Size Limit**: 10MB maximum
- **Path Traversal Protection**: Filename sanitization with `path.basename()` and regex validation
- **XSS Prevention**: HTML escaping for all user inputs
- **Text Length Limits**: Title (120 chars), Info (160 chars)
- **CSS Injection Prevention**: Color and font validation

## Backward Compatibility

- Existing gift entries continue to work without modification
- Entries without a `type` field default to `type: 'gift'`
- No breaking changes to API responses
- Old rotator configurations are automatically normalized

## Troubleshooting

### Media Not Displaying
1. Check that the file format is supported (PNG, JPEG, GIF, MP4)
2. Verify the file size is under 10MB
3. Ensure the media URL is accessible
4. Check browser console for errors

### Upload Failed
1. Verify the file format matches allowed MIME types
2. Check that the file size is under 10MB
3. Ensure the plugin data directory is writable

### Video Not Playing
1. Ensure the video is in MP4 format
2. Check that the video codec is supported by browsers
3. Verify the video file is not corrupted

## Examples

### Example 1: Simple Image Entry
```javascript
{
  type: 'media',
  mediaUrl: '/api/gcce/hud/media/logo.png',
  mediaKind: 'image',
  mimetype: 'image/png',
  title: 'My Channel Logo',
  info: 'Thanks for watching!',
  template: 'card',
  animation: 'fade'
}
```

### Example 2: Video Entry
```javascript
{
  type: 'media',
  mediaUrl: 'https://example.com/animation.mp4',
  mediaKind: 'video',
  mimetype: 'video/mp4',
  title: 'Custom Animation',
  info: 'New subscriber alert!',
  template: 'neon',
  animation: 'zoom'
}
```

### Example 3: Mixed Rotator
```javascript
{
  enabled: true,
  intervalSeconds: 15,
  entries: [
    {
      type: 'gift',
      giftId: '123',
      giftName: 'Rose',
      title: 'Top Gifter'
    },
    {
      type: 'media',
      mediaUrl: '/media/promo.gif',
      mediaKind: 'image',
      title: 'Follow on Instagram'
    },
    {
      type: 'gift',
      giftId: '456',
      giftName: 'Star',
      title: 'VIP Supporter'
    }
  ]
}
```

## Notes

- Media files in the plugin data directory persist across updates
- External URLs are not validated for availability
- Videos play automatically in the overlay (muted, looping)
- The same rotation interval applies to all entries
