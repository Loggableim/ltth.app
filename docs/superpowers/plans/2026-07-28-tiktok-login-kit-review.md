# TikTok Login Kit Review Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the LTTH Login Kit app and public support pages as a saved TikTok review draft without final submission.

**Architecture:** Static legal pages give TikTok stable public URLs. A self-contained MP4 demonstrates only the Login Kit journey. The portal receives the icon, restricted metadata, review explanation, and video, while final submission remains untouched.

**Tech Stack:** Static HTML, existing LTTH assets, Node/Jest, FFmpeg where locally available, TikTok Developer Portal in the in-app browser.

## Global Constraints

- Use TikTok Login Kit only; do not add products, scopes, or other TikTok APIs.
- Use the existing LTTH square icon and accurate Login Kit-only copy.
- Public URLs must resolve over HTTPS at `https://ltth.app`.
- The MP4 shows launch, login selection, authorization, return to LTTH, and authenticated account state.
- Never click TikTok **Submit for review**.
- Confirm immediately before the first portal save or file upload.

---

### Task 1: Public Login-Kit legal pages

**Files:**
- Create: `terms-of-service.html`
- Create: `privacy-policy.html`
- Modify: `_partials/footer.html`
- Test: `app/test/tiktok-login-kit-legal-pages.test.js`

**Interfaces:**
- Consumes: root static website layout and active policy copy in `app/public/`.
- Produces: public `/terms-of-service.html` and `/privacy-policy.html` routes linked by the shared footer.

- [ ] Step 1: Write a Jest contract test that reads both root pages, asserts `ltth.app` and `TikTok Login Kit`, and asserts the footer contains both root URLs.
- [ ] Step 2: Run `cd app && ..\\runtime\\node\\node.exe .\\node_modules\\jest\\bin\\jest.js test/tiktok-login-kit-legal-pages.test.js --runInBand`; verify it fails because the root pages are absent.
- [ ] Step 3: Create accessible legal pages using existing contact information. State that Login Kit authenticates the LTTH user and provides only the basic TikTok account identity needed for that session. Include data/deletion contact and effective date `2026-07-28`; do not invent legal-entity information.
- [ ] Step 4: Update the shared footer with both links and re-run the focused Jest test to a passing result.
- [ ] Step 5: Commit only Task 1 files with `docs: add Login Kit legal pages`.

### Task 2: Review demo video

**Files:**
- Create: `assets/tiktok-login-kit-review-demo.mp4`
- Create: `assets/tiktok-login-kit-review-demo.md`
- Test: `app/test/tiktok-login-kit-review-demo.test.js`

**Interfaces:**
- Consumes: LTTH screenshots/assets and the Login Kit-only workflow.
- Produces: an upload-ready MP4 under 50 MB plus a storyboard identifying every displayed step.

- [ ] Step 1: Write a Jest test asserting that the MP4 is larger than 1 KiB and smaller than 50 MiB, while the storyboard mentions `TikTok Login Kit` and `return to LTTH`.
- [ ] Step 2: Run `cd app && ..\\runtime\\node\\node.exe .\\node_modules\\jest\\bin\\jest.js test/tiktok-login-kit-review-demo.test.js --runInBand`; verify it fails because the two assets are absent.
- [ ] Step 3: Create an H.264/AAC MP4 with real LTTH screenshots for LTTH launch and authenticated-account frames. Add readable English captions for launch, Sign in with TikTok, authorization, return to LTTH, and account state. If live authorization cannot be shown, label that frame illustrative and do not claim a completed authorization.
- [ ] Step 4: Run `ffprobe -v error -show_entries format=format_name,size -of default=noprint_wrappers=1 assets/tiktok-login-kit-review-demo.mp4` and the focused Jest test; require MP4-compatible output, below 52,428,800 bytes, and a passing test.
- [ ] Step 5: Commit only Task 2 files with `docs: add TikTok Login Kit review demo`.

### Task 3: TikTok Developer Portal saved draft

**Files:**
- Uses: `assets/icon-512x512.png`
- Uses: `assets/tiktok-login-kit-review-demo.mp4`

**Interfaces:**
- Consumes: verified public URLs/assets and the logged-in TikTok Developer Portal draft.
- Produces: a saved complete draft with no final submission.

- [ ] Step 1: Open `https://ltth.app/terms-of-service.html` and `https://ltth.app/privacy-policy.html` in the selected browser and confirm their headings render. Confirm icon dimensions and MP4 size.
- [ ] Step 2: Populate but do not save: closest tools/utility category; Web and Desktop; description `LTTH is a local TikTok LIVE creator tool. TikTok Login Kit lets users securely sign in to their LTTH account; no other TikTok APIs are used.`; both public URLs; review explanation `LTTH uses TikTok Login Kit only. A user chooses Sign in with TikTok, authorizes the login, and returns to LTTH with the authenticated account associated to the current LTTH session. LTTH does not use Display, Content Posting, or other TikTok APIs or scopes.`
- [ ] Step 3: Immediately before any portal save/upload, request confirmation for saving the draft and uploading the icon plus MP4 to TikTok.
- [ ] Step 4: After confirmation, upload both assets, save, and inspect visible state to confirm all required basic fields/uploads persist. Do not click Submit for review.
- [ ] Step 5: Record the visible portal result in the task report only; do not commit client credentials, browser state, or temporary upload files.
