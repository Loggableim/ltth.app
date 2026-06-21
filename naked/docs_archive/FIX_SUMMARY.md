# OpenShock Plugin Gift Event Routing Fix

## Problem Statement

**Original Issue:** "Geschenke werden im Events Log erkannt, aber nicht an das OpenShock Plugin weitergeleitet" (Gifts are recognized in events log but not forwarded to OpenShock plugin)

Users reported that when they enabled the OpenShock plugin after the server had already started, TikTok gift events would appear in the events log but would not trigger OpenShock actions. This meant the plugin appeared to be working, but gift-based mappings would not execute.

## Root Cause Analysis

The issue was in the plugin lifecycle and event registration flow:

### Expected Flow
1. Server starts
2. TikTok module initializes
3. PluginLoader initializes
4. Plugins load and call `api.registerTikTokEvent('gift', handler)`
5. Plugin handlers stored in `plugin.api.registeredTikTokEvents`
6. `pluginLoader.registerPluginTikTokEvents(tiktok)` connects handlers to TikTok EventEmitter
7. TikTok events trigger plugin handlers ✅

### Actual Flow (Bug)
1. Server starts with OpenShock disabled
2. TikTok module initializes
3. PluginLoader initializes
4. `pluginLoader.registerPluginTikTokEvents(tiktok)` called (no plugins to register)
5. User enables OpenShock plugin via UI
6. Plugin loads and calls `api.registerTikTokEvent('gift', handler)`
7. Handlers stored in `plugin.api.registeredTikTokEvents`
8. **BUG**: Handlers are NEVER connected to TikTok EventEmitter
9. TikTok events don't reach the plugin ❌

The critical issue was that `registerPluginTikTokEvents()` was only called once during server startup. When plugins were enabled dynamically, there was no mechanism to connect their event handlers to the TikTok module.

## Solution

The fix adds support for dynamic TikTok event registration:

### 1. Store TikTok Reference in PluginLoader
```javascript
// plugin-loader.js
constructor(pluginsDir, app, io, db, logger, configPathManager) {
    // ... existing code ...
    
    // TikTok module reference (set after TikTok module is initialized)
    // This allows dynamic registration of TikTok events when plugins are enabled at runtime
    this.tiktok = null;
}
```

### 2. Add Setter Method
```javascript
// plugin-loader.js
setTikTokModule(tiktok) {
    this.tiktok = tiktok;
    this.logger.info('🎯 TikTok module reference set in PluginLoader - plugins can now register events dynamically');
}
```

### 3. Register Events After Plugin Load
```javascript
// plugin-loader.js - in loadPlugin()
// Register TikTok events if TikTok module is available
// This ensures events are registered even when plugins are loaded dynamically
if (this.tiktok && pluginAPI.registeredTikTokEvents.length > 0) {
    this.logger.info(`Registering ${pluginAPI.registeredTikTokEvents.length} TikTok event(s) for plugin ${manifest.id}`);
    for (const { event, callback } of pluginAPI.registeredTikTokEvents) {
        this.tiktok.on(event, callback);
        this.logger.debug(`  ✓ Registered TikTok event: ${event}`);
    }
}
```

### 4. Initialize in Server Startup
```javascript
// server.js
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger, configPathManager);
logger.info('🔌 Plugin Loader initialized');

// Set TikTok module reference for dynamic event registration
pluginLoader.setTikTokModule(tiktok);
```

## Implementation Details

### Files Modified

1. **app/modules/plugin-loader.js**
   - Added `this.tiktok` property to constructor
   - Added `setTikTokModule(tiktok)` method
   - Modified `loadPlugin()` to register TikTok events after plugin initialization
   - Updated `registerPluginTikTokEvents()` to support individual plugin registration

2. **app/server.js**
   - Added call to `pluginLoader.setTikTokModule(tiktok)` after PluginLoader initialization

3. **app/test/openshock-dynamic-event-registration.test.js**
   - Comprehensive unit tests for dynamic event registration
   - Tests plugin loading at startup and runtime
   - Verifies TikTok module reference management

4. **app/test/openshock-e2e-gift-routing.test.cjs**
   - End-to-end integration test
   - Simulates complete user workflow
   - Validates fix resolves the reported issue

## Testing

### Test Coverage

1. **Unit Tests** (`openshock-dynamic-event-registration.test.js`)
   - ✅ Plugin loaded at startup receives TikTok events
   - ✅ Plugin enabled dynamically receives TikTok events
   - ✅ TikTok module reference management works correctly

2. **Integration Tests** (`openshock-integration.test.js`)
   - ✅ Gift event field mapping works correctly
   - ✅ Whitelist/blacklist functionality works
   - ✅ Event matching engine works as expected

3. **End-to-End Test** (`openshock-e2e-gift-routing.test.cjs`)
   - ✅ Server starts and initializes TikTok connector
   - ✅ TikTok events are logged
   - ✅ Plugin can be enabled after server start
   - ✅ Plugin receives events sent after it was enabled
   - ✅ Complete flow works end-to-end

### Manual Testing Checklist

To manually verify the fix:

1. Start the server
2. Connect to a TikTok LIVE stream
3. Verify gifts appear in the events log
4. Enable the OpenShock plugin via the UI
5. Configure a gift mapping (e.g., Rose → Vibrate)
6. Send a Rose gift on TikTok
7. Verify the OpenShock action executes

**Expected Result:** The OpenShock plugin should receive and process the gift event, triggering the configured action.

## Security Review

- ✅ Code review: No issues found
- ✅ CodeQL security scan: No alerts
- ✅ No new vulnerabilities introduced
- ✅ No sensitive data exposure
- ✅ Follows existing security patterns

## Backwards Compatibility

This fix is **100% backwards compatible**:

- Existing plugins continue to work as before
- No changes to plugin API
- No changes to configuration format
- Server startup sequence unchanged
- Only adds new capability for dynamic event registration

## Performance Impact

**Negligible** - The fix adds:
- One additional property to PluginLoader instance (`this.tiktok`)
- One additional method call during server startup (`setTikTokModule()`)
- Event registration happens immediately after plugin load (no additional overhead)

## Related Issues

This fix may also resolve similar issues with other plugins that:
- Register TikTok event handlers
- Are enabled after server startup
- Expect to receive TikTok events

Examples: ClarityHUD, Viewer XP, any custom plugins listening to TikTok events.

## Future Improvements

While this fix resolves the immediate issue, potential enhancements could include:

1. **Automatic event re-registration**: Automatically re-register all plugin events when TikTok reconnects
2. **Event debugging UI**: Show which plugins are listening to which TikTok events
3. **Plugin health monitoring**: Alert when a plugin registers events but they never fire
4. **Event metrics**: Track how many events each plugin processes

## Conclusion

This fix resolves the critical issue where dynamically enabled plugins would not receive TikTok events. The solution is minimal, backwards compatible, and well-tested. All existing functionality is preserved while enabling proper event routing for plugins enabled at runtime.

**Status:** ✅ Complete and ready for production
