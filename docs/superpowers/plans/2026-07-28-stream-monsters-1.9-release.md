# Stream Monsters 1.9 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the committed Rules-v7 Stream Monsters source as an immutable and reproducible `1.9.0` plugin package.

**Architecture:** A version-agnostic Git archive builder packages a recorded plugin tree. The release map is the immutable provenance ledger, while the store, manifest, changelog, and active documentation expose the newest release.

**Tech Stack:** CommonJS, Node.js 22, Jest, Git archives, deterministic ZIP output, JSON release metadata.

## Global Constraints

- Keep plugin ID `streamalchemy`.
- Keep LTTH at `1.4.1`.
- Do not modify any package archive from `1.0.0` through `1.8.0`.
- Package only committed files from the recorded source commit/tree.
- Use the bundled Node 22 runtime for verification.

---

### Task 1: Define the 1.9 release contract

**Files:**
- Create: `app/test/streammonsters-release-v19.test.js`
- Modify: `app/test/streammonsters-release-v18.test.js`

**Interfaces:**
- Consumes: `loadReleaseMap()` and `buildReleaseFromGit()`.
- Produces: executable assertions for immutable legacy archives, source-bound release trees, current version metadata, and deterministic 1.9 packaging.

- [ ] **Step 1: Write the failing 1.9 test**

```js
test('publishes Rules-v7 as Stream Monsters 1.9.0', () => {
  expect(readJson('app/plugins/streamalchemy/plugin.json').version).toBe('1.9.0');
  expect(loadReleaseMap().releases['1.9.0']).toEqual(expect.objectContaining({
    manifestVersion: '1.9.0',
    package: 'plugin-store/packages/streamalchemy-1.9.0.zip'
  }));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
runtime\node\node.exe app\node_modules\jest\bin\jest.js --runInBand --runTestsByPath app\test\streammonsters-release-v19.test.js
```

Expected: failure because the manifest and release map still stop at 1.8.0.

- [ ] **Step 3: Correct the historical integrity assertion**

Assert that each recorded `sourceTree` equals
`git rev-parse <sourceCommit>:app/plugins/streamalchemy`, never the mutable
`HEAD` tree.

- [ ] **Step 4: Rerun the historical test**

Run the v18 suite and confirm its provenance assertion passes independently of
later plugin releases.

### Task 2: Make the package builder version-agnostic

**Files:**
- Create: `app/scripts/build-streammonsters-release.js`
- Modify: `app/scripts/build-streammonsters-release-v18.js`
- Test: `app/test/streammonsters-release-v19.test.js`

**Interfaces:**
- Produces: `loadReleaseMap`, `buildReleaseFromGit`, `main`, and existing helper exports.
- Compatibility: requiring or invoking the v18 script delegates to the generic builder.

- [ ] **Step 1: Add a failing compatibility assertion**

```js
expect(require('../scripts/build-streammonsters-release-v18').buildReleaseFromGit)
  .toBe(require('../scripts/build-streammonsters-release').buildReleaseFromGit);
```

- [ ] **Step 2: Verify RED**

Expected: module-not-found for the generic builder.

- [ ] **Step 3: Move the generic implementation and add the wrapper**

The generic module exports `main`; the wrapper re-exports the module and calls
`main()` when executed directly.

- [ ] **Step 4: Verify GREEN**

Run the v18 and v19 release suites.

### Task 3: Commit the 1.9 source identity

**Files:**
- Modify: `app/plugins/streamalchemy/plugin.json`
- Modify: `app/plugins/streamalchemy/README.md`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`
- Modify: `app/CHANGELOG.md`
- Modify: active Stream Monsters documentation and translations containing the displayed version.

**Interfaces:**
- Produces: a committed plugin tree whose root manifest is exactly version `1.9.0`.

- [ ] **Step 1: Update visible and manifest version metadata**

Change only release identity and Rules-v7 release copy; do not alter runtime
mechanics.

- [ ] **Step 2: Run focused branding and locale tests**

Run the Stream Monsters branding, localization, Rules-v7, and creator UI
suites.

- [ ] **Step 3: Commit the source release**

```powershell
git add app/plugins/streamalchemy app/CHANGELOG.md README.md docs app/wiki
git commit -m "release(streammonsters): prepare Rules v7 version 1.9.0"
```

- [ ] **Step 4: Record immutable provenance**

Capture:

```powershell
git rev-parse HEAD
git rev-parse HEAD:app/plugins/streamalchemy
```

### Task 4: Build and register the immutable archive

**Files:**
- Modify: `app/scripts/streammonsters-release-map.json`
- Modify: `plugin-store.json`
- Modify: `app/CURRENT_RELEASE.json`
- Create: `plugin-store/packages/streamalchemy-1.9.0.zip`
- Test: `app/test/streammonsters-release-v19.test.js`

**Interfaces:**
- Release map entry records `sourceCommit`, `sourceTree`, `manifestVersion`,
  `package`, and `sha256`.
- Store entry references the exact package URL and SHA-256.

- [ ] **Step 1: Add the recorded source objects with a temporary valid hash**

Use 64 zeroes only during the local build cycle.

- [ ] **Step 2: Build the archive once**

```powershell
runtime\node\node.exe app\scripts\build-streammonsters-release.js 1.9.0
```

- [ ] **Step 3: Replace the temporary hash**

Write the emitted SHA-256 into both the release map and store entry.

- [ ] **Step 4: Rebuild into a temporary path and compare bytes**

Use `buildReleaseFromGit()` and assert the temporary archive hash equals the
committed package hash.

- [ ] **Step 5: Run release tests**

Expected: v18 and v19 suites pass, and every legacy archive retains its
recorded hash.

### Task 5: Complete verification

**Files:**
- Verify all files changed by Tasks 1-4.

**Interfaces:**
- Produces: a reviewable release commit, without merging or pushing it.

- [ ] **Step 1: Run focused Stream Monsters suites**

Run release, Rules-v7 battle, evolution, overlay, GCCE, and localization tests.

- [ ] **Step 2: Run project checks**

```powershell
npm run lint
npm run build:css
npm run i18n:check
git diff --check
```

- [ ] **Step 3: Inspect package contents and hashes**

Confirm `plugin.json` inside the ZIP is version `1.9.0`, required assets exist,
and the ZIP hash matches both release map and store.

- [ ] **Step 4: Commit release registration**

```powershell
git add app plugin-store.json plugin-store/packages/streamalchemy-1.9.0.zip README.md docs
git commit -m "release(streammonsters): publish version 1.9.0"
```

- [ ] **Step 5: Re-run the release suite from the committed tree**

No merge, GitHub push, tag, or live reload occurs until the integration choice
is explicitly made.

