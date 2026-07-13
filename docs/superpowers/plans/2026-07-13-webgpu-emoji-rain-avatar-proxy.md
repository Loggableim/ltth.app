# WebGPU EmojiRain Avatar Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load TikTok profile pictures through a safe same-origin route so WebGPU EmojiRain can rasterize them into its atlas.

**Architecture:** A plugin-local proxy helper validates and retrieves avatar images. The plugin route returns validated image bytes, while the overlay rewrites only profile-picture assets to this route before the existing atlas loader fetches them.

**Tech Stack:** Node.js CommonJS, native `fetch`/`AbortController`, Jest, browser WebGPU overlay JavaScript.

## Global Constraints

- Keep all changes within `app/plugins/webgpu-emoji-rain` and its focused tests.
- Allow only TikTok-owned avatar CDN host suffixes and revalidate every redirect.
- Preserve current non-profile asset loading and existing fallback behavior.

---

### Task 1: Define the secure avatar retrieval contract

**Files:**
- Create: `app/plugins/webgpu-emoji-rain/lib/avatar-proxy.js`
- Test: `app/plugins/webgpu-emoji-rain/test/avatar-proxy.test.js`

- [ ] Write failing tests for an allowed TikTok URL, a blocked host, and a redirect to a blocked host.
- [ ] Run `npm test -- plugins/webgpu-emoji-rain/test/avatar-proxy.test.js` and confirm the missing helper fails.
- [ ] Implement URL validation, manual redirect handling, a five-second abort timeout, and a three-redirect maximum.
- [ ] Re-run the focused helper test and confirm it passes.

### Task 2: Serve and consume same-origin avatar bytes

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/main.js`
- Modify: `app/plugins/webgpu-emoji-rain/gpu/engine.js`
- Modify: `app/plugins/webgpu-emoji-rain/test/avatar-proxy.test.js`
- Modify: `app/test/webgpu-emoji-rain-renderer-parity.test.js`

- [ ] Write failing tests for route registration/image response and a profile particle using `/api/webgpu-emoji-rain/avatar?url=...`.
- [ ] Run the two focused Jest files and confirm the assertions fail.
- [ ] Register the image-only route and add the profile-only URL rewrite.
- [ ] Re-run the focused Jest files and confirm they pass.

### Task 3: Verify scope and regressions

**Files:**
- Verify: `app/plugins/webgpu-emoji-rain/test/*.test.js`
- Verify: `app/test/webgpu-emoji-rain-*.test.js`

- [ ] Run the focused plugin and renderer test suites.
- [ ] Run `npm run lint -- plugins/webgpu-emoji-rain/main.js plugins/webgpu-emoji-rain/lib/avatar-proxy.js`.
- [ ] Run `git diff --check` and inspect the diff to ensure unrelated STT files are excluded.
