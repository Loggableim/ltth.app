# Security Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the critical unauthenticated mutation/RCE paths, restore practical startup behavior, stabilize the known failing tests, and reduce the highest-risk UI/CSP surfaces without removing existing features.

**Architecture:** Add a single admin-auth middleware that defaults to localhost-only access when no token is configured, then apply it to mutating core and plugin routes. Keep existing local workflows working while preventing remote unauthenticated state changes. Move expensive startup repair work out of the blocking boot path and harden file/plugin path handling with reusable containment checks.

**Tech Stack:** Node.js, CommonJS, Express, Socket.IO, Jest, better-sqlite3, multer.

---

### Task 1: Security Gate And Route Hardening

**Files:**
- Create: `app/modules/admin-auth.js`
- Modify: `app/server.js`
- Modify: `app/routes/plugin-routes.js`
- Test: `app/test/security-admin-auth.test.js`

- [ ] Add tests proving remote requests without an admin token are rejected for plugin upload, network config, and animation delete.
- [ ] Add tests proving localhost requests still work when no admin token is configured.
- [ ] Implement `createAdminAuth()` with loopback detection, token validation, and constant-time token comparison.
- [ ] Apply auth to mutating core routes and plugin management routes.
- [ ] Fix Socket.IO CORS to reject disallowed origins.

### Task 2: Plugin Upload And File Path Containment

**Files:**
- Modify: `app/routes/plugin-routes.js`
- Modify: `app/modules/plugin-loader.js`
- Test: `app/test/plugin-security.test.js`

- [ ] Add tests for invalid plugin IDs and path traversal attempts.
- [ ] Whitelist plugin IDs to `^[a-z0-9][a-z0-9_-]{0,63}$`.
- [ ] Resolve and verify every install/delete target stays under the plugin root.
- [ ] Reject uploaded plugins whose entry path escapes the extracted plugin folder.

### Task 3: Network Custom Tunnel Restriction

**Files:**
- Modify: `app/modules/network-manager.js`
- Test: `app/test/network-manager-security.test.js`

- [ ] Add tests proving `custom` tunnel commands are rejected unless explicitly allowed.
- [ ] Require `allowCustomTunnelCommand: true` plus auth-protected API before spawning a custom command.
- [ ] Keep built-in providers unchanged.

### Task 4: Startup Repair And Upload Serving

**Files:**
- Modify: `app/modules/config-repair.js`
- Modify: `app/server.js`
- Test: `app/test/config-repair-startup.test.js`
- Test: `app/test/animation-upload-path.test.js`

- [ ] Add tests proving startup repair can run in deferred mode without blocking callers.
- [ ] Add tests proving uploaded animations are served from the configured uploads directory.
- [ ] Add non-blocking startup repair scheduling.
- [ ] Serve `/uploads` from `configPathManager.getUploadsDir()`.

### Task 5: Existing Test Stabilization

**Files:**
- Modify focused failing tests under `app/test/`
- Modify production code only where tests expose a real product bug.

- [ ] Fix broken Jest hooks/parser issues.
- [ ] Close SQLite handles before deleting test DBs.
- [ ] Reset shared test state for viewer XP tests.
- [ ] Align stale expectations with current product behavior or fix the product regression.

### Task 6: Plugin Lifecycle And CSP/UI Hygiene

**Files:**
- Modify: `app/modules/plugin-loader.js`
- Modify: `app/public/js/dashboard.js`
- Modify: `app/routes/wiki-routes.js`

- [ ] Block disabled plugin routes at dispatch time or ensure plugin-owned routers are removable.
- [ ] Remove inline `onerror` handlers where practical.
- [ ] Sanitize rendered wiki HTML before returning it to the dashboard.

### Task 7: Verification And Dependency Audit

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`

- [ ] Update vulnerable direct dependencies.
- [ ] Run focused Jest tests after each fix.
- [ ] Run `npm run build:css`, `npm run lint`, `npm audit --json`, and the broad Jest suite.
- [ ] Start the app with a temporary clean config and verify it binds to a local port.
