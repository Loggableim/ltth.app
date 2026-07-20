# Viewer Profiles Dashboard Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the stale Viewer Profiles navigation surface while keeping the consolidated Viewer Profiles UI and analytics route available as a hidden direct URL.

**Architecture:** The dashboard will stop declaring a Viewer Profiles sidebar item and iframe view. The consolidated `milestone-leaderboard` plugin remains the owner of the Viewer Profiles database, APIs, UI document, and route; no backend route or data migration code is changed.

**Tech Stack:** Static dashboard HTML, CommonJS/Jest tests, JSON locale files, generated translation inventory, Node.js app runtime.

## Global Constraints

- Keep changes scoped to the requested feature or bug.
- Preserve unrelated dirty-worktree changes.
- Keep `/viewer-profiles/ui`, `/viewer-profiles/assets/:file`, and `/api/viewer-profiles/*` available.
- Do not remove Viewer Profiles tables, event integration, analytics APIs, consolidated UI, or legacy state migration.
- Use 2-space indentation in JavaScript; use existing JSON/HTML formatting.

---

### Task 1: Add failing dashboard regression coverage

**Files:**
- Modify: `app/test/viewer-profiles-sidebar.test.js`
- Modify: `app/test/viewer-profiles-analytics.test.js`

**Interfaces:**
- Consumes: `app/public/dashboard.html`, the existing `ViewerProfilesPlugin` route-registration test fixture, and `findRoute()`/`createResponse()` helpers.
- Produces: focused regression coverage that rejects stale dashboard markup while requiring the hidden UI route to remain registered.

- [x] **Step 1: Replace the old sidebar-presence assertions with absence assertions.**

  The dashboard regression must assert that `dashboardHtml` does not contain `data-view="viewer-profiles"`, `id="view-viewer-profiles"`, or `/viewer-profiles/ui`. Remove only the assertions that require the retired sidebar/view and keep the locale test structure until the locale keys are removed.

- [x] **Step 2: Update locale assertions to require removal of the stale root navigation key.**

  For all four loaded root locales, assert that `navigation.viewer_profiles` is `undefined`. Keep the test focused on the root navigation namespace; the consolidated plugin's own `plugins.milestone-leaderboard.labels.viewer_profiles` keys are not part of this cleanup.

- [x] **Step 3: Add a direct-route preservation test.**

  In `app/test/viewer-profiles-analytics.test.js`, add this behavior to the existing analytics dashboard suite:

  ```js
  test('keeps the viewer profiles UI available as a hidden direct route', () => {
    const route = findRoute(api, 'GET', '/viewer-profiles/ui');
    expect(route).toBeDefined();

    const res = createResponse();
    route.handler({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.sentFile).toContain(path.join('viewer-leaderboard', 'viewer-profiles-ui.html'));
  });
  ```

- [x] **Step 4: Run the focused tests and verify the new dashboard assertions fail for the expected reason.**

  Run from `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app`:

  ```powershell
  npm test -- --runInBand --runTestsByPath test/viewer-profiles-sidebar.test.js test/viewer-profiles-analytics.test.js --silent
  ```

  Expected result before production edits: the route-preservation assertion passes, while the dashboard absence/locale-removal assertions fail because the old markup and keys still exist.

### Task 2: Remove stale dashboard and root-locale references

**Files:**
- Modify: `app/public/dashboard.html`
- Modify: `app/public/js/navigation.js`
- Modify: `app/locales/de.json`
- Modify: `app/locales/en.json`
- Modify: `app/locales/es.json`
- Modify: `app/locales/fr.json`
- Modify: `app/locales/translation-inventory.json`

**Interfaces:**
- Consumes: The failing assertions from Task 1 and the existing consolidated plugin route.
- Produces: A dashboard with no Viewer Profiles sidebar/view declaration and no unused root `navigation.viewer_profiles` key, while the plugin-owned route remains untouched.

- [x] **Step 1: Remove the Viewer Profiles sidebar anchor from `app/public/dashboard.html`.**

  Delete only the anchor whose attributes are `data-view="viewer-profiles" data-plugin="milestone-leaderboard"` between the Viewer XP and Gift Milestone entries.

- [x] **Step 2: Remove the embedded Viewer Profiles content view from `app/public/dashboard.html`.**

  Delete only the `div#view-viewer-profiles` section containing the `/viewer-profiles/ui` external link and iframe. Keep the surrounding Viewer XP and other plugin sections unchanged.

- [x] **Step 3: Remove the unused Viewer Profiles icon accent entry.**

  Delete the `'viewer-profiles': '#14b8a6'` property from `SIDEBAR_ICON_ACCENTS` in `app/public/js/navigation.js`. Keep Viewer XP and all other accent mappings unchanged.

- [x] **Step 4: Remove the unused `navigation.viewer_profiles` key from all four root app locale files.**

  Delete only the key/value pair from the `navigation` object in `app/locales/de.json`, `en.json`, `es.json`, and `fr.json`. Keep the plugin-specific Viewer Profiles labels under `plugins.milestone-leaderboard` intact.

- [x] **Step 5: Remove the two generated `navigation.viewer_profiles` inventory entries.**

  Delete only the exact string entries from `app/locales/translation-inventory.json`; do not regenerate or reformat unrelated inventory data.

- [x] **Step 6: Run the focused tests and verify the red-green transition.**

  Run:

  ```powershell
  npm test -- --runInBand --runTestsByPath test/viewer-profiles-sidebar.test.js test/viewer-profiles-analytics.test.js --silent
  ```

  Expected result: both suites pass, including the absence assertions and the direct-route preservation assertion.

### Task 3: Verify scope, runtime route, and app checks

**Files:**
- Read-only verification of the modified files and live app route.

**Interfaces:**
- Consumes: Task 2's dashboard/locale changes and the unchanged `milestone-leaderboard` analytics route.
- Produces: Evidence that the visible stale surface is gone, the hidden route still serves, and no unrelated files were modified by this task.

- [x] **Step 1: Check the diff and whitespace.**

  Run:

  ```powershell
  git diff --check
  git diff -- app/public/dashboard.html app/public/js/navigation.js app/locales/de.json app/locales/en.json app/locales/es.json app/locales/fr.json app/locales/translation-inventory.json app/test/viewer-profiles-sidebar.test.js app/test/viewer-profiles-analytics.test.js
  ```

  Confirm the diff contains only the requested dashboard, stale root translation, and focused test changes; do not stage unrelated existing modifications.

- [x] **Step 2: Verify the live hidden route.**

  Run:

  ```powershell
  try { $r = Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/viewer-profiles/ui' -TimeoutSec 5; "STATUS $($r.StatusCode)`nTITLE " + ([regex]::Match($r.Content, '<title[^>]*>(.*?)</title>', 'IgnoreCase').Groups[1].Value) } catch { "ERROR $($_.Exception.Message)"; exit 1 }
  ```

  Expected result: `STATUS 200` and title `Viewer Profiles`.

- [x] **Step 3: Run app quality checks.**

  From `app` run:

  ```powershell
  npm run lint -- --quiet
  npm run build:css
  ```

  Run the full Jest suite only if the focused checks remain green and the installed dependency state is available.

  The full Jest suite was attempted with the bundled Node runtime but timed out after 124 seconds without producing a result; the timed-out Jest process was stopped. The focused Viewer Profiles suites completed successfully.

- [x] **Step 4: Review final status.**

  Run `git status --short` and verify only the intended files from this plan are newly modified; leave all pre-existing unrelated changes untouched.
