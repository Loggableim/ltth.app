# GitHub Copilot Instructions for Pup Cid's Little TikTok Helper

This file provides custom instructions to GitHub Copilot for working with this repository.

## 📋 Project Overview

**Name:** Pup Cid's Little TikTok Helper (LTTH)  
**Stack:** Node.js + Express.js + Socket.io + SQLite + TikTok LIVE Connector  
**Architecture:** Plugin-based system with modular core modules  
**License:** CC-BY-NC-4.0

Professional TikTok LIVE streaming tool with overlays, alerts, TTS, automation, and an extensive plugin ecosystem.

## 🎯 Essential Reading

Before making any changes, always consult these files:
- `/infos/llm_start_here.md` - Comprehensive technical guide (READ THIS FIRST!)
- `/infos/CONTRIBUTING.md` - Contribution guidelines and coding standards
- `/ARCHITECTURE_SPEC.md` - Electron desktop app architecture
- `/.github/copilot-setup-steps.yml` - Setup and project structure guide

## 💻 Code Style & Standards

### General Rules

- **Language:** Code and comments in English, documentation in German (except README)
- **Indentation:** 2 spaces (NO tabs)
- **Quotes:** Single quotes for strings in JavaScript
- **Line Length:** No strict limit, but keep lines readable
- **Semicolons:** Use semicolons consistently
- **ES6+:** Use modern JavaScript features (const/let, arrow functions, async/await, destructuring)

### Logging

- **ALWAYS** use Winston logger, NEVER use `console.log` in production code
- Logger is available via `require('./modules/logger')` or `this.api.log()` in plugins
- Log levels: `error`, `warn`, `info`, `debug`
- Example: `logger.info('Server started on port 3000');`

### Error Handling

- **ALWAYS** wrap async operations in try-catch blocks
- Provide meaningful error messages with context
- Log errors before re-throwing or handling
- Example:
  ```javascript
  try {
    await someAsyncOperation();
  } catch (error) {
    logger.error('Failed to perform operation:', error);
    throw error;
  }
  ```

### Database

- Use `better-sqlite3` for synchronous SQLite operations
- Database runs in WAL mode for better concurrency
- Store plugin configs in the `settings` table
- Example: `const db = require('./modules/database');`

### Configuration

- **ALWAYS** set default values when configuration is missing
- Validate configuration before use
- Never assume config exists without checking
- Example:
  ```javascript
  const config = this.api.getConfig('myKey') || { enabled: false };
  ```

## 🔌 Plugin Development

### Plugin Structure

All plugins must follow this exact structure:

```
plugins/<plugin-id>/
├── plugin.json       # Metadata (id, name, version, entry, author, description)
├── main.js           # Plugin class with init() and destroy()
├── ui.html           # Optional: Admin UI panel
├── overlay.html      # Optional: OBS overlay
├── assets/           # Optional: CSS, JS, images
├── README.md         # Plugin documentation
└── test/             # Optional: Plugin tests
```

### Plugin Class Template

```javascript
class MyPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
  }

  async init() {
    // Register routes
    this.api.registerRoute('get', '/api/myplugin/status', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Register socket events
    this.api.registerSocket('myplugin:action', (data) => {
      this.handleAction(data);
    });

    // Register TikTok events
    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGift(data);
    });

    this.api.log('MyPlugin initialized', 'info');
  }

  async destroy() {
    // Cleanup: close connections, clear timers, remove listeners
    this.api.log('MyPlugin destroyed', 'info');
  }
}

module.exports = MyPlugin;
```

### Plugin API Methods

- `registerRoute(method, path, handler)` - Register Express route
- `registerSocket(event, callback)` - Register Socket.io event
- `registerTikTokEvent(event, callback)` - Subscribe to TikTok events (gift, chat, follow, share, like, subscribe)
- `getConfig(key)` - Load plugin config from database
- `setConfig(key, value)` - Save plugin config to database
- `emit(event, data)` - Emit Socket.io event to all clients
- `log(message, level)` - Logger wrapper
- `getSocketIO()` - Get Socket.io instance
- `getDatabase()` - Get database instance

### Plugin Events

When plugin state changes, emit `plugins:changed` socket event:
```javascript
io.emit('plugins:changed', { action: 'reload', pluginId: 'my-plugin' });
```

## 🔒 Security Requirements

### Critical Rules

- **NEVER** commit secrets, API keys, or passwords to the repository
- **ALWAYS** use `.env` files for sensitive configuration
- **ALWAYS** sanitize user inputs before processing
- **ALWAYS** validate data from external sources (API responses, user input)
- **ALWAYS** use rate limiting for public APIs
- **ALWAYS** check permissions before executing sensitive operations

### Input Sanitization

- Validate all inputs from TikTok events (chat messages, usernames, gift data)
- Escape HTML in user-generated content
- Validate file paths to prevent directory traversal
- Use parameterized queries for database operations (better-sqlite3 handles this)

### API Security

- Rate limit all API endpoints (use `express-rate-limit`)
- Validate request payloads
- Return appropriate HTTP status codes
- Example:
  ```javascript
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10
  });
  this.api.registerRoute('post', '/api/action', limiter, handler);
  ```

## 🧪 Testing

### Test Location

- Core tests: `app/test/*.test.js`
- Plugin tests: `plugins/<plugin-id>/test/*.test.js`

### Running Tests

```bash
cd app
npm test                # Run all tests with Jest
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
node test/specific.test.js  # Run individual test
```

### Writing Tests

- Follow existing test patterns in `app/test/`
- Use descriptive test names
- Test edge cases and error conditions
- Mock external dependencies (TikTok API, database)
- Keep tests focused and independent

## 🏗️ Architecture Patterns

### Module Structure

Core modules are in `app/modules/`:
- `database.js` - SQLite database (WAL mode)
- `tiktok.js` - TikTok LIVE Connector integration
- `tts.js` - Text-to-Speech engine
- `alerts.js` - Alert manager
- `flows.js` - Event-based automation engine
- `obs-websocket.js` - OBS WebSocket v5 integration
- `plugin-loader.js` - Plugin system with lifecycle management
- `logger.js` - Winston logger with daily rotation

### Socket.io Events

Standard event naming convention: `<namespace>:<action>`

Examples:
- `tiktok:connected`
- `tiktok:gift`
- `plugins:changed`
- `osc:status`
- `alert:show`

### API Endpoints

REST API naming convention: `/api/<module>/<action>`

Examples:
- `GET /api/plugins/list`
- `POST /api/plugins/enable/:id`
- `GET /api/tiktok/status`
- `POST /api/tts/speak`

## 🚫 Critical Don'ts

### Never Remove Features

- **DO NOT** remove or delete existing functionality
- **DO NOT** break backward compatibility
- **DO NOT** modify plugin APIs without migration path
- Only add features or fix bugs with surgical changes

### Never Break Plugin System

- **DO NOT** change plugin lifecycle (init/destroy)
- **DO NOT** modify PluginAPI interface without updating all plugins
- **DO NOT** break existing plugin routes or events
- Document all API changes in CHANGELOG.txt

### Never Use Placeholders

- **DO NOT** leave TODOs or unimplemented functions
- **DO NOT** commit commented-out code without explanation
- **DO NOT** use placeholder values in production code
- All code must be production-ready and fully functional

## 📝 Documentation Requirements

### Code Comments

- Add JSDoc comments for all public functions and classes
- Document complex logic and non-obvious decisions
- Keep comments up-to-date with code changes
- Example:
  ```javascript
  /**
   * Sends an OSC message to VRChat
   * @param {string} address - OSC address (e.g., '/avatar/parameters/Wave')
   * @param {any} value - Value to send (number, string, boolean)
   * @returns {Promise<boolean>} Success status
   */
  async sendOSC(address, value) {
    // Implementation
  }
  ```

### Changelog Updates

After every change, update `/app/CHANGELOG.txt`:
- Date and time
- Files modified
- Brief description of changes
- Bug fixes and new features

### README Updates

If adding a new plugin, create a comprehensive README.md:
- Plugin purpose and features
- Configuration options
- API endpoints
- Socket events
- Usage examples

## 🔧 Build & Development

### Commands

```bash
# Development
npm run dev           # Start with nodemon (auto-reload)
npm run build:css     # Compile Tailwind CSS
npm run watch:css     # Watch Tailwind CSS changes

# Production
npm start             # Start server

# Quality
npm run lint          # Run ESLint
npm run audit:fix     # Fix dependency vulnerabilities
```

### Environment

- Node.js: 18.x, 20.x, or 22.x (required)
- Database: SQLite 3 with WAL mode
- Port: 3000 (default) or 3210 (Electron)

## 🎨 Frontend Guidelines

### Technologies

- Bootstrap 5 for layout and components
- Tailwind CSS for utility classes
- jQuery for DOM manipulation
- Socket.io-client for real-time updates

### OBS Overlays

- Overlays must be transparent (CSS: `background: transparent`)
- Support 1920x1080 resolution (Full HD)
- Use Canvas 2D or DOM rendering (GPU-accelerated)
- Minimize CPU/GPU usage
- Test in OBS Browser Source

## 🌐 Internationalization (i18n)

### Language Support

- German (de) - Primary language for UI
- English (en) - Secondary language

### i18n Usage

```javascript
const i18n = require('./modules/i18n');
const message = i18n.t('key.path');
```

## 📦 Dependencies

### Adding New Dependencies

- Check for security vulnerabilities with `npm audit`
- Verify license compatibility (prefer MIT, Apache 2.0)
- Consider bundle size and performance impact
- Use exact versions in package.json for critical dependencies
- Test on all supported Node.js versions (18, 20, 22)

### Updating Dependencies

- Test thoroughly after updates
- Check for breaking changes in changelogs
- Update documentation if APIs changed
- Run full test suite

## 🎯 Performance Best Practices

### Database

- Use prepared statements for repeated queries
- Index frequently queried columns
- Batch inserts when possible
- Close database connections in plugin destroy()

### Socket.io

- Emit events only when necessary
- Use rooms for targeted broadcasting
- Debounce high-frequency events
- Limit payload size

### Memory Management

- Clear timers in plugin destroy()
- Remove event listeners on cleanup
- Avoid memory leaks in long-running processes
- Monitor resource usage in production

## 🔍 Code Review Checklist

Before submitting code:

- ✅ Winston logger used (no console.log)
- ✅ Error handling with try-catch
- ✅ Input validation and sanitization
- ✅ Configuration defaults set
- ✅ JSDoc comments added
- ✅ Tests written and passing
- ✅ CHANGELOG.txt updated
- ✅ No secrets or API keys committed
- ✅ Code follows style guidelines (2 spaces, single quotes)
- ✅ No breaking changes to plugin API
- ✅ Documentation updated

## 📚 Additional Resources

- TikTok LIVE Connector: https://github.com/zerodytrash/TikTok-Live-Connector
- Socket.io Documentation: https://socket.io/docs/
- OBS WebSocket: https://github.com/obsproject/obs-websocket
- Better SQLite3: https://github.com/WiseLibs/better-sqlite3

## 🎓 Example Patterns

### TikTok Event Handler

```javascript
this.api.registerTikTokEvent('gift', (data) => {
  const { giftName, userId, coins, uniqueId } = data;
  logger.info(`Gift received: ${giftName} from ${uniqueId} (${coins} coins)`);
  
  // Process gift logic
  this.processGift(data);
  
  // Emit to frontend
  this.api.emit('gift:received', {
    giftName,
    userId,
    coins,
    timestamp: Date.now()
  });
});
```

### Database Query

```javascript
const db = this.api.getDatabase();
const stmt = db.prepare('SELECT * FROM users WHERE userId = ?');
const user = stmt.get(userId);

if (!user) {
  const insert = db.prepare('INSERT INTO users (userId, username) VALUES (?, ?)');
  insert.run(userId, username);
}
```

### Config Management

```javascript
async init() {
  // Load config with defaults
  const defaultConfig = {
    enabled: true,
    threshold: 100,
    sounds: []
  };
  
  let config = this.api.getConfig('myPluginConfig');
  if (!config) {
    config = defaultConfig;
    this.api.setConfig('myPluginConfig', config);
  }
  
  this.config = { ...defaultConfig, ...config };
}
```

## 🚀 Summary

When working on this repository:

1. **Read documentation first** - Especially `/infos/llm_start_here.md`
2. **Follow the plugin pattern** - Use PluginAPI, not direct imports
3. **Use Winston logger** - Never use console.log
4. **Handle errors properly** - Try-catch all async operations
5. **Validate everything** - Config, user input, API responses
6. **Never break compatibility** - Add, don't remove
7. **Test your code** - Write tests, run existing tests
8. **Document changes** - Update CHANGELOG.txt and comments
9. **Think security** - Sanitize, validate, rate-limit
10. **Keep it simple** - Follow existing patterns and conventions

---

*This instructions file helps GitHub Copilot provide better suggestions aligned with the project's conventions and standards.*
