# Plugin Development Guide

This guide documents the active plugin contract in the current snapshot.

## Plugin Layout

```text
app/plugins/<plugin-id>/
  plugin.json
  main.js or another manifest entry file
  ui.html or ui/
  overlay.html or overlay/
  assets/
  locales/
  test/
  README.md
```

Only `plugin.json` and an entry file are required.

## Manifest

Typical `plugin.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Short description",
  "entry": "main.js",
  "enabled": false,
  "author": "LTTH"
}
```

The loader also handles localized descriptions and richer metadata when present.

## Backend Class

```javascript
class MyPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
  }

  async init() {
    this.api.registerRoute('get', '/status', async (req, res) => {
      res.json({ success: true });
    });

    this.api.registerSocket('my-plugin:action', async (socket, data) => {
      await this.handleAction(socket, data);
    });

    this.api.registerTikTokEvent('gift', async (data) => {
      await this.handleGift(data);
    });

    this.api.log('Initialized');
  }

  async destroy() {
    this.api.log('Destroyed');
  }
}

module.exports = MyPlugin;
```

## PluginAPI Essentials

- `registerRoute(method, path, handler)`
- `registerSocket(event, callback)`
- `registerTikTokEvent(event, callback)`
- `registerIFTTTTrigger(id, config)`
- `registerIFTTTCondition(id, config)`
- `registerIFTTTAction(id, config)`
- `getConfig(key)`
- `setConfig(key, value)`
- `getPluginDataDir()`
- `ensurePluginDataDir()`
- `getConfigPathManager()`
- `getSocketIO()`
- `getDatabase()`
- `emit(event, data)`
- `log(message, level)`

Plugin routes are mounted through the plugin router. Use paths relative to the plugin route namespace unless the surrounding plugin code shows a specific established pattern.

## TikTok Events

Common normalized events:

- `gift`
- `chat`
- `follow`
- `like`
- `share`
- `subscribe`
- `join`
- `emote`
- `connected`
- `disconnected`
- `error`
- `viewerChange`
- `streamChanged`

The loader performs centralized registration and cleanup. Do not directly attach duplicate listeners to the TikTok connector unless there is a clear reason.

## Storage

Persistent data:

```javascript
const dataDir = this.api.getPluginDataDir();
await this.api.ensurePluginDataDir();
```

Configuration:

```javascript
const config = this.api.getConfig('config') || { enabled: false };
this.api.setConfig('config', config);
```

Do not store runtime uploads, generated files, user secrets, or long-lived cache files inside the plugin source directory.

## Cleanup

In `destroy()`:

- clear intervals/timeouts
- close WebSocket/HTTP/OSC clients
- stop workers
- flush queues when needed
- release file handles
- remove custom listeners not registered through PluginAPI

## IFTTT Integration

Plugins can register automation components either in `init()` through PluginAPI methods or through a `registerIFTTTComponents(registries)` method if the plugin already follows that pattern.

Keep IDs namespaced:

```text
my-plugin:trigger-name
my-plugin:condition-name
my-plugin:action-name
```

## Tests

Place plugin-specific tests in either:

- `app/test/<plugin-or-feature>.test.js`
- `app/plugins/<plugin-id>/test/`

Run targeted tests after dependencies are installed:

```bash
cd app
npx jest test/plugin-state-persistence.test.js
```

## Review Checklist

- Manifest parses.
- Plugin loads when enabled.
- Plugin does nothing when disabled.
- Routes validate input.
- Socket handlers catch errors.
- TikTok handlers do not double-fire after reload.
- `destroy()` cleans runtime resources.
- Config survives restart.
- Persistent files use plugin data dir.
- UI/overlay paths work through `/plugins/...`.
