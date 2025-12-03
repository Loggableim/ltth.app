# Chatango Integration Plugin

Integrates Chatango chat rooms into your TikTok streaming tool. This plugin provides configurable chat widgets, theme synchronization, and exposes settings for customization.

## Features

- **Configurable Chat Room**: Set your Chatango room handle to connect to your community
- **Theme Support**: Automatically syncs with the application's theme (day/night/high contrast)
- **Dashboard Integration**: Embed chat directly in the dashboard shoutbox area
- **Floating Widget**: Optional collapsible widget that can be positioned on any corner
- **Embed Code Generation**: Get ready-to-use embed codes for OBS browser sources or external pages
- **Full Customization**: Control font size, private messages, ticker display, and widget dimensions

## Configuration

Access the plugin settings through the Plugins menu or navigate to `/chatango/ui`.

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Room Handle | Your Chatango room name | `pupcidsltth` |
| Theme | Color scheme (night/day/contrast) | `night` |
| Font Size | Chat text size | `10px` |
| Allow PM | Enable private messages | `false` |
| Show Ticker | Display message ticker | `true` |
| Dashboard Enabled | Show in dashboard | `true` |
| Widget Enabled | Show floating widget | `true` |
| Widget Position | Corner position (br/bl/tr/tl) | `br` |
| Widget Size | Width and height in pixels | `200x300` |
| Collapsed Size | Size when minimized | `75x30` |

## API Endpoints

### GET /api/chatango/config
Get the current plugin configuration.

### POST /api/chatango/config
Update the plugin configuration.

**Body:**
```json
{
  "enabled": true,
  "roomHandle": "your-room",
  "theme": "night",
  "fontSize": "10",
  "allowPM": false,
  "showTicker": true,
  "dashboardEnabled": true,
  "widgetEnabled": true,
  "widgetPosition": "br",
  "widgetWidth": 200,
  "widgetHeight": 300
}
```

### GET /api/chatango/embed
Get embed code for the specified type and theme.

**Query Parameters:**
- `type`: `dashboard` or `widget`
- `theme`: `night`, `day`, or `contrast`

### GET /api/chatango/themes
Get available theme configurations.

### GET /api/chatango/status
Get plugin status information.

## Socket Events

### chatango:get-config
Request current configuration. Server responds with `chatango:config` event.

### chatango:get-embed
Request embed code.

**Data:**
```json
{
  "type": "dashboard",
  "theme": "night"
}
```

Server responds with `chatango:embed` event containing the embed code.

## Theme Colors

The plugin uses the corporate branding color scheme:
- **Primary Color**: `#13A318` (Green)
- **Night Mode**: Dark backgrounds with green accents
- **Day Mode**: Light backgrounds with green accents
- **High Contrast**: Black/yellow for accessibility

## OBS Integration

To add Chatango to OBS:

1. Open the plugin settings UI
2. Copy the embed code for either dashboard or widget
3. In OBS, add a Browser Source
4. Paste the embed code into an HTML file or use a custom CSS/HTML approach

## Troubleshooting

### Chat not loading
- Verify your room handle is correct
- Check that the CSP headers allow Chatango domains
- Ensure the plugin is enabled in settings

### Theme not syncing
- The Chatango embed loads with a fixed theme at startup
- To change themes, save the new configuration and refresh the page

## Author

Pup Cid

## Version

1.0.0
