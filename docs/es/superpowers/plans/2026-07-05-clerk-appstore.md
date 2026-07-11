# Clerk Appstore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk authentication gating to the LTTH plugin store while keeping the rest of the dashboard local.

**Architecture:** Add a focused backend auth adapter for Clerk, wire it into store routes, and add a static frontend auth helper consumed by the existing plugin manager. Remove community source UI and return explicit disabled responses for community source mutations.

**Tech Stack:** Express 4, `@clerk/express`, static browser JavaScript, Jest, Supertest.

---

### Task 1: Backend Store Auth Adapter

**Files:**
- Create: `app/modules/clerk-store-auth.js`
- Test: `app/test/clerk-store-auth.test.js`

- [x] Write tests for safe public config, missing config failures, unauthenticated `401`, and authenticated account attachment.
- [ ] Implement the Clerk adapter with CommonJS exports.
- [ ] Run the focused auth adapter test.

### Task 2: Store Routes

**Files:**
- Modify: `app/routes/plugin-routes.js`
- Modify: `app/server.js`
- Test: `app/test/plugin-store-routes.test.js`

- [x] Update route tests for closed community sources and optional injected auth middleware.
- [ ] Add `/api/plugin-store/config` and `/api/plugin-store/account`.
- [ ] Protect store listing/install routes with the injected store auth middleware.
- [ ] Wire Clerk middleware and store auth middleware in `server.js`.
- [ ] Run the focused route tests.

### Task 3: Frontend Store Gate

**Files:**
- Create: `app/public/js/clerk-store-auth.js`
- Modify: `app/public/js/plugin-manager.js`
- Modify: `app/public/dashboard.html`
- Test: `app/test/plugin-manager-listing.test.js`

- [x] Update static frontend contract tests for Clerk splash/account UI and no Sources tab.
- [ ] Add the static Clerk store auth helper.
- [ ] Add auth token headers to plugin store listing/install requests.
- [ ] Remove visible community source controls from the dashboard.
- [ ] Run the focused frontend listing test.

### Task 4: Dependencies And Verification

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`

- [ ] Install `@clerk/express`.
- [ ] Run `node --check` for changed JavaScript files.
- [ ] Run focused Jest suites.
- [ ] Run lint if focused tests pass.
