# Music-Bot, Finale and Release 1.3.30 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate and repair the new Music-Bot implementation, publish all vetted Emoji/WebGPU finale/Music-Bot work to GitHub `main`, synchronize the project version, and restart the live app from the published state.

**Architecture:** Keep the user's dirty runtime preferences isolated from releasable source changes. Validate the Music-Bot's new playback-controller architecture with focused regression tests, then assemble the release in a clean worktree created from `origin/main`. Push only verified commits and use the version tag to start the normal GitHub release workflow.

**Tech Stack:** CommonJS JavaScript, Node.js test runner, ESLint, Git worktrees, PowerShell, LTTH plugin runtime, WebGPU browser overlay.

---

### Task 1: Audit the exact publication scope

**Files:**
- Inspect: Git history and working tree
- Inspect: `app/plugins/music-bot/**`
- Inspect: `docs/superpowers/plans/2026-07-16-animal-command-superfan-controls.md`
- Preserve: `runtime/launcher_settings.json`

1. Fetch `origin` and enumerate commits and files that are not yet reachable from `origin/main`.
2. Separate releasable source/docs from machine-local runtime preferences.
3. Confirm the next unused patch version and release tag.

### Task 2: Repair and validate Music-Bot

**Files:**
- Modify: `app/test/music-bot-runtime-ui-regression.test.js`
- Modify: `app/test/music-bot-overlay-theme-visualizer.test.js`
- Modify as required: `app/plugins/music-bot/**`
- Add as required: focused Music-Bot regression tests

1. Reproduce each failing Music-Bot test and map stale expectations to the new playback-controller and overlay architecture.
2. Add or update tests so intended controller recovery, playback sync, track identity, theme, and overlay behavior are covered.
3. Run the tests red before any necessary production fix.
4. Apply only production fixes demonstrated by failing tests.
5. Run all focused Music-Bot tests, syntax checks, locale parsing, and ESLint.
6. Commit only Music-Bot source and tests.

### Task 3: Synchronize version 1.3.30

**Files:**
- Modify: `package.json`
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/CURRENT_VERSION.txt`
- Modify: `app/CURRENT_RELEASE.json`
- Modify: `version.json`
- Modify: `CHANGELOG.md`
- Modify: `app/CHANGELOG.md`
- Modify: `_partials/header.html`
- Modify: `_partials/footer.html`
- Modify: `downloads/index.html`
- Modify: `locales/de.json`
- Modify: `locales/en.json`
- Modify: `locales/es.json`
- Modify: `locales/fr.json`

1. Verify `v1.3.30` is unused locally and remotely.
2. Update every active release/version surface to `1.3.30` with the current release date and concise Emoji/WebGPU finale/Music-Bot notes.
3. Validate JSON and exact version consistency.
4. Commit the version update separately.

### Task 4: Assemble and verify a clean release

**Files:**
- Create: clean Git worktree based on current `origin/main`

1. Create an isolated release branch/worktree from `origin/main`.
2. Cherry-pick the vetted Emoji, choreographed-finale, Music-Bot, documentation, and version commits in dependency order.
3. Run focused Emoji/WebGPU/Music-Bot suites, then the full app test suite, lint, and CSS build.
4. Confirm the release worktree is clean and its commit set contains no local runtime preferences.

### Task 5: Publish, restart, and perform live acceptance

1. Push the verified release head directly to `origin/main`.
2. Create and push annotated tag `v1.3.30`.
3. Verify remote branch and tag reachability and inspect the GitHub release workflow result.
4. Restart the LTTH app from the published release state.
5. In the real WebGPU overlay, verify the new finale controls, trigger a firework and a finale, and confirm renderer/show runtime state without browser errors.
6. Report the exact commits, remote state, runtime PID/state, test totals, and any intentionally excluded local-only file.
