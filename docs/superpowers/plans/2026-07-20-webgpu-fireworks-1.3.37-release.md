# WebGPU Fireworks 1.3.37 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the verified WebGPU Fireworks rocket-alignment fix and current main-branch improvements as LTTH 1.3.37 with WebGPU Fireworks 3.1.1.

**Architecture:** Keep the hardened runtime contracts unchanged and update stale tests to consume the authoritative config and telemetry contracts. Then advance every active release surface together, verify the complete repository, integrate the focused commits into local `main`, and push `main` directly to `Loggableim/ltth.app`.

**Tech Stack:** CommonJS, Jest, JSDOM, Node.js, WebGPU, HTML/JSON release metadata, Git/GitHub.

## Global Constraints

- Preserve the shared rocket/explosion correlation manifest introduced by commit `dc76395e`.
- Release LTTH as `1.3.37` and WebGPU Fireworks as `3.1.1` on `2026-07-20`.
- Do not rewrite historical archived plans or old changelog entries.
- Push only after tests, lint, CSS build, clean Git state, and remote-main ancestry checks succeed.

---

### Task 1: Reconcile Current Runtime Contracts With Their Tests

**Files:**
- Modify: `app/test/webgpu-fireworks-show-style-options.test.js`
- Modify: `app/test/webgpu-fireworks-show-preview.test.js`
- Modify: `app/test/webgpu-fireworks-benchmark-isolation.test.js`
- Modify: `app/test/webgpu-fireworks-crackle-settings.test.js`

**Interfaces:**
- Consumes: `CONFIG_ENUMS.finaleStyle`, authenticated telemetry field `statusUpdatedAt`, `FireworksPlugin.createConfigPayload()`, and `WebGpuFireworksSettingsContract.RANGE_CONTROLS`.
- Produces: Tests that exercise the current fail-closed UI and renderer contracts without weakening production validation.

- [ ] **Step 1: Preserve the current failing evidence**

```powershell
cd app
npm test -- --runInBand --silent --onlyFailures --testPathPattern=webgpu-fireworks
```

Expected: the five previously reported suites fail, including the four contract-drift suites.

- [ ] **Step 2: Install the finale-style contract in the selector harness**

```js
const { CONFIG_ENUMS } = require('../plugins/webgpu-fireworks/lib/config-schema');
api.setCustomStyleContract(CONFIG_ENUMS.finaleStyle);
```

- [ ] **Step 3: Use authenticated renderer timestamps in preview fixtures**

```js
statusUpdatedAt: Date.now()
```

- [ ] **Step 4: Expect the complete benchmark config payload**

```js
expect(response.body).toEqual({
  success: true,
  sessionId,
  message: 'Preset applied for benchmark',
  ...plugin.createConfigPayload(expectedConfig)
});
```

- [ ] **Step 5: Assert crackle controls through the settings contract**

```js
expect(settingsContract.RANGE_CONTROLS).toMatchObject({
  'crackle-frequency': 'crackleFrequency',
  'crackle-volume': 'crackleVolume'
});
```

- [ ] **Step 6: Run the four suites**

```powershell
npm test -- --runInBand --silent test/webgpu-fireworks-show-style-options.test.js test/webgpu-fireworks-show-preview.test.js test/webgpu-fireworks-benchmark-isolation.test.js test/webgpu-fireworks-crackle-settings.test.js
```

Expected: all four suites pass.

### Task 2: Advance the Release Contract

**Files:**
- Modify: `app/test/webgpu-fireworks-release-alignment.test.js`
- Modify: `app/test/webgpu-fireworks-3d-release.test.js`
- Modify: active package, release, website, locale, documentation, and plugin cache-key surfaces that currently expose 1.3.36 or 3.1.0.

**Interfaces:**
- Consumes: canonical repository identity `Loggableim/ltth.app`, active release date `2026-07-20`.
- Produces: coherent LTTH `1.3.37` / WebGPU Fireworks `3.1.1` metadata.

- [ ] **Step 1: Change release tests first**

```js
const APP_VERSION = '1.3.37';
const PLUGIN_VERSION = '3.1.1';
const RELEASE_DATE = '2026-07-20';
```

- [ ] **Step 2: Verify the release test is red**

```powershell
cd app
npm test -- --runInBand --silent test/webgpu-fireworks-release-alignment.test.js
```

Expected: failures report 1.3.36/3.1.0 release surfaces.

- [ ] **Step 3: Update active metadata and documentation**

```text
package.json, app/package.json, app/package-lock.json
app/CURRENT_VERSION.txt, app/CURRENT_RELEASE.json, version.json
README.md, app/plugins/webgpu-fireworks/README.md
CHANGELOG.md, app/CHANGELOG.md
downloads/index.html, _partials/header.html, _partials/footer.html
locales/{de,en,es,fr}.json, docs/plugins/webgpu-fireworks.html
app/plugins/webgpu-fireworks/plugin.json and active WebGPU asset cache keys
```

- [ ] **Step 4: Run release and plugin suites**

```powershell
cd app
npm test -- --runInBand --silent --testPathPattern=webgpu-fireworks
```

Expected: all WebGPU Fireworks suites pass.

### Task 3: Verify, Integrate, And Publish Main

**Files:**
- Verify all changed files from Tasks 1 and 2.

**Interfaces:**
- Consumes: clean verified commits on `codex/runtime-main` and current `origin/main`.
- Produces: local `main` equal to pushed `origin/main` at the new release commit.

- [ ] **Step 1: Run repository verification**

```powershell
cd app
npm test -- --runInBand --silent
npm run lint -- --quiet
npm run build:css
```

- [ ] **Step 2: Verify release files and Git diff**

```powershell
git diff --check
git status --short
```

- [ ] **Step 3: Commit the contract and release changes**

```powershell
git add -- <exact verified paths>
git commit -m "chore(release): publish version 1.3.37"
```

- [ ] **Step 4: Integrate into local main and push directly**

```powershell
git switch main
git merge --ff-only codex/runtime-main
git push origin main
```

- [ ] **Step 5: Verify GitHub truth**

```powershell
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git merge-base --is-ancestor HEAD origin/main
```

Expected: local `main` and `origin/main` resolve to the same release commit.
