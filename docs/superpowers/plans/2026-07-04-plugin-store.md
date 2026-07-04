# Plugin Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Plugin Manager into a Plugin Store with an official LTTH source and opt-in community sources.

**Architecture:** Keep local plugin lifecycle in `PluginLoader` and add a focused `PluginStore` service for registry sources, install status, ZIP validation, and installs. Expose store routes from `plugin-routes.js` and add Store/Installed tabs to the current Plugin Manager UI.

**Tech Stack:** Node.js CommonJS, Express routes, `zip-lib`, built-in `fetch`, `crypto`, existing plugin path guards, vanilla dashboard JavaScript.

---

### Task 1: Store Service

**Files:**
- Create: `app/modules/plugin-store.js`
- Test: `app/test/plugin-store.test.js`

- [x] Add a CommonJS `PluginStore` class that loads official and community registry sources, keeps community sources disabled until opt-in, merges registry entries with local installed plugins, and validates source URLs.
- [x] Add install support using a registry ZIP URL, SHA-256 verification when present, safe extraction, `plugin.json` validation, and existing plugin path guards.

### Task 2: Store Routes

**Files:**
- Modify: `app/routes/plugin-routes.js`
- Test: `app/test/plugin-store-routes.test.js`

- [x] Add `GET /api/plugin-store`, `GET /api/plugin-store/sources`, `POST /api/plugin-store/community/enable`, `POST /api/plugin-store/sources`, `DELETE /api/plugin-store/sources/:id`, and `POST /api/plugin-store/:sourceId/:pluginId/install`.
- [x] Emit `plugins:changed` after a successful install.

### Task 3: Plugin Manager UI

**Files:**
- Modify: `app/public/dashboard.html`
- Modify: `app/public/js/plugin-manager.js`

- [x] Add `Installed` and `Store` tabs.
- [x] Load store data from `/api/plugin-store`.
- [x] Hide community source controls until community is opted in.
- [x] Show Official, Community, Open Beta, Installed, Install, and Update states.

### Task 4: Verification

**Commands:**
- [x] `cd app && npm test -- --runInBand --silent plugin-store.test.js plugin-store-routes.test.js plugin-manager-listing.test.js`
- [x] `cd app && npm run lint -- --quiet`
