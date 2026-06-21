# Chatango Integration Plugin

Integrates Chatango chat rooms into your TikTok streaming tool. This plugin provides configurable chat widgets, theme synchronization, and exposes settings for customization.

## Features

- **Configurable Chat Room**: Set your Chatango room handle to connect to your community
- **Theme Support**: Automatically syncs with the application's theme (day/night/high contrast)
- **Dashboard Integration**: Embed chat directly in the dashboard shoutbox area via iframe
- **Floating Widget**: Optional collapsible widget that can be positioned on any corner
- **Embed Code Generation**: Get ready-to-use embed codes for OBS browser sources or external pages
- **Full Customization**: Control font size, private messages, ticker display, and widget dimensions
- **CSP Compliant**: Uses iframe-based embedding to avoid Content Security Policy issues

## How It Works

The plugin uses an **iframe-based approach** to embed Chatango chat. Instead of injecting script tags dynamically (which can cause CSP violations), the plugin:

1. Generates complete HTML pages with Chatango embed scripts server-side
2. Loads these HTML pages in iframes for dashboard and widget displays
3. This ensures proper script loading context and avoids CSP errors

### Embed Routes

- `/chatango/embed/dashboard?theme=night` - Full HTML page for dashboard embedding
- `/chatango/embed/widget?theme=day` - Full HTML page for widget embedding

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
- Ensure the plugin is enabled in settings
- Check browser console for errors
- Verify iframe can connect to `https://st.chatango.com`

### CSP errors
- The plugin now uses iframe-based embedding which is CSP-compliant
- If you see CSP errors, ensure `frame-src https://*.chatango.com` is in your CSP policy
- Check that iframes are not being blocked by browser extensions

### Theme not syncing
- The Chatango embed loads with a fixed theme at startup
- To change themes, save the new configuration and refresh the page
- Theme is applied when the iframe loads the embed HTML

### Widget not appearing
- Check that Widget Enabled is turned on in settings
- Verify the widget position doesn't overlap with other UI elements
- Check browser console for JavaScript errors

### Blank iframe or white screen
- Ensure `https://st.chatango.com` is accessible from your network
- Check if ad blockers or privacy extensions are blocking Chatango
- Try disabling browser extensions temporarily to test

## Author

Pup Cid

## Version

1.0.0
