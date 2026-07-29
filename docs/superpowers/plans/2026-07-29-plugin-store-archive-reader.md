# Plugin Store Archive Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Plugin Store archive integrity tests finish reliably on Windows/Node 24 while retaining their byte-for-byte package verification.

**Architecture:** `test/plugin-store-registry.test.js` will continue to use `yauzl` for central-directory metadata, because it enumerates entries reliably. It will read each entry's compressed bytes directly from the ZIP file and decompress deflated entries with Node's built-in `zlib`, bypassing the `fd-slicer` stream path that stalls after the first compressed entry. The test will preserve entry-name, byte-length, canonical text-byte, and SHA-256 assertions against Git-index source data for current packages and against the release-map-pinned Git tree for versioned Stream Monsters archives.

**Tech Stack:** Node.js CommonJS, Jest, `yauzl`, Node `fs` and `zlib`, Git CLI.

## Global Constraints

- Keep all package integrity assertions and compare every package to either its Git-index source or its explicit release-map Git tree.
- Do not add a runtime dependency; this is a test-only reader repair.
- Support ZIP entries using stored (`0`) and deflated (`8`) compression methods and fail explicitly for any other method.
- Keep the Connect4 timeout-lockout commits separate from this test-repair commit.

---

### Task 1: Capture the archive-reader regression

**Files:**
- Modify: `app/test/plugin-store-registry.test.js`
- Test: `app/test/plugin-store-registry.test.js`

**Interfaces:**
- Consumes: `readAllZipFiles(zipPath): Promise<Map<string, Buffer>>`.
- Produces: A regression assertion that reads two consecutive compressed Stream Monsters cue files from one ZIP session in less than the Jest test timeout.

- [x] **Step 1: Write the failing test**

```js
it('reads consecutive compressed Stream Monsters entries without stalling', async () => {
  const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.11.1.zip');
  const files = await readAllZipFiles(packagePath);
  const first = files.get('assets/audio/cues/arena-heal-1.wav');
  const second = files.get('assets/audio/cues/arena-hit-1.wav');

  assert(first);
  assert(second);
  assert.strictEqual(first.length, 11592);
  assert.strictEqual(second.length, 41410);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand test/plugin-store-registry.test.js --testNamePattern "reads consecutive compressed"`

Expected: The existing stream-based reader does not complete the second compressed entry before the test timeout.

- [x] **Step 3: Commit the failing-test checkpoint only if the repository workflow requires it**

Do not commit an intentionally failing tree. Keep the failing result as terminal evidence before continuing to Task 2.

### Task 2: Replace the stalled streaming reader

**Files:**
- Modify: `app/test/plugin-store-registry.test.js:1-130`
- Test: `app/test/plugin-store-registry.test.js`

**Interfaces:**
- Consumes: Yauzl entry metadata (`relativeOffsetOfLocalHeader`, `compressedSize`, `uncompressedSize`, `compressionMethod`).
- Produces: `readZipEntry()` and `readAllZipFiles()` that return exact uncompressed `Buffer` values without `ZipFile.openReadStream()`.

- [x] **Step 1: Add the Node zlib import**

```js
const zlib = require('zlib');
```

- [x] **Step 2: Add a helper that validates the local file header and reads exactly one entry**

```js
function readZipEntryBytes(zipPath, entry) {
  const descriptor = fs.openSync(zipPath, 'r');
  try {
    const header = Buffer.alloc(30);
    fs.readSync(descriptor, header, 0, header.length, entry.relativeOffsetOfLocalHeader);
    assert.strictEqual(header.readUInt32LE(0), 0x04034b50, `${entry.fileName} must have a local ZIP header`);
    const dataStart = entry.relativeOffsetOfLocalHeader + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const compressed = Buffer.alloc(entry.compressedSize);
    fs.readSync(descriptor, compressed, 0, compressed.length, dataStart);
    const bytes = entry.compressionMethod === 0 ? compressed : zlib.inflateRawSync(compressed);
    assert.strictEqual(bytes.length, entry.uncompressedSize, `${entry.fileName} must match its declared ZIP size`);
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}
```

- [x] **Step 3: Enumerate metadata with `lazyEntries` and route both readers through the direct helper**

Replace `ZipFile.openReadStream()` use in `readZipEntry()` and `readAllZipFiles()` with a shared metadata enumeration promise and `readZipEntryBytes()` calls. Reject unsupported compression methods before returning a package buffer.

- [x] **Step 4: Bind Stream Monsters 1.11.1 to its release-map source tree**

```js
const release = releaseMap.releases['1.11.1'];
const sourceFiles = listGitTreeFiles(release.sourceTree).sort();
await assertPackagedFilesMatchGitSource(packagePath, { sourceTree: release.sourceTree }, sourceFiles);
```

Verify that `git rev-parse ${release.sourceCommit}:app/plugins/streamalchemy` equals `release.sourceTree`, and verify both the plugin-store registry and release map SHA-256 values against the archive. Do not rebuild the already-published 1.11.1 archive from later source changes under the same version.

- [x] **Step 5: Run the new regression and the complete registry suite**

Run:

```powershell
node .\\node_modules\\jest\\bin\\jest.js --runInBand test/plugin-store-registry.test.js --testNamePattern "reads consecutive compressed"
node .\\node_modules\\jest\\bin\\jest.js --runInBand test/plugin-store-registry.test.js
```

Expected: Both commands exit 0 without test timeouts.

- [x] **Step 6: Commit the test-reader repair**

```powershell
git add app/test/plugin-store-registry.test.js docs/superpowers/plans/2026-07-29-plugin-store-archive-reader.md
git commit -m "test(plugin-store): read package entries without stream stalls"
```

### Task 3: Share the direct ZIP reader across historical Stream Monsters release tests

**Files:**
- Create: `app/test/helpers/zip-reader.js`
- Create: `app/test/helpers/zip-reader.test.js`
- Modify: `app/test/streammonsters-release-v18.test.js`
- Modify: `app/test/streammonsters-release-v19.test.js`
- Modify: `app/test/streammonsters-release-v110.test.js`
- Modify: `app/test/streammonsters-release-v111.test.js`

**Interfaces:**
- Consumes: a ZIP file path and `yauzl` central-directory metadata.
- Produces: `readZipEntries(zipPath): Promise<Map<string, Buffer>>`, with normalized slash-separated entry names and exact uncompressed entry bytes.

- [x] **Step 1: Write the failing shared-helper regression**

```js
const { readZipEntries } = require('./zip-reader');

it('reads two consecutive compressed entries from Stream Monsters 1.11.1', async () => {
  const entries = await readZipEntries(packagePath);
  expect(entries.get('assets/audio/cues/arena-heal-1.wav')).toHaveLength(11592);
  expect(entries.get('assets/audio/cues/arena-hit-1.wav')).toHaveLength(41410);
});
```

- [x] **Step 2: Run the helper test to verify it fails before the helper exists**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand test/helpers/zip-reader.test.js`

Expected: FAIL because `./zip-reader` has not been created.

- [x] **Step 3: Implement the shared direct ZIP reader**

Implement metadata enumeration through `yauzl` and direct `fs.readSync` reads from each local file header. For methods `0` and `8`, return stored bytes or `zlib.inflateRawSync` output; validate the local signature, complete compressed-data read, and final uncompressed size. Reject every unsupported compression method.

- [x] **Step 4: Replace only the duplicated `readZip()` functions that consume archive contents**

```js
const { readZipEntries: readZip } = require('./helpers/zip-reader');
```

Remove their local `yauzl` imports and `openReadStream()` readers in the four historical Stream Monsters release suites. Preserve all existing manifest, SHA-256, Git-provenance, and rebuild assertions.

- [x] **Step 5: Run the helper and all affected release suites**

```powershell
node .\\node_modules\\jest\\bin\\jest.js --runInBand test/helpers/zip-reader.test.js test/streammonsters-release-v18.test.js test/streammonsters-release-v19.test.js test/streammonsters-release-v110.test.js test/streammonsters-release-v111.test.js
```

Expected: No ZIP-reader timeout. If a post-timeout assertion fails, diagnose it independently before changing test or production behavior.

- [x] **Step 6: Commit the shared ZIP-reader migration**

```powershell
git add app/test/helpers/zip-reader.js app/test/helpers/zip-reader.test.js app/test/streammonsters-release-v18.test.js app/test/streammonsters-release-v19.test.js app/test/streammonsters-release-v110.test.js app/test/streammonsters-release-v111.test.js docs/superpowers/plans/2026-07-29-plugin-store-archive-reader.md
git commit -m "test(releases): share robust ZIP entry reader"
```

### Task 4: Verify the integration and publish

**Files:**
- Verify: `app/test/plugin-store-registry.test.js`, `app/plugins/game-engine/test/`
- Integrate: local `main` and `origin/main`

**Interfaces:**
- Consumes: the clean feature branch containing the archive-reader repair and the Connect4 timeout-lockout commits.
- Produces: a locally merged and GitHub-pushed `main` only after the complete Jest suite is green.

- [ ] **Step 1: Run focused feature and quality gates**

```powershell
node .\\node_modules\\jest\\bin\\jest.js --runInBand --silent plugins/game-engine/test/interactive-database.test.js plugins/game-engine/test/interactive-plugin-integration.test.js plugins/game-engine/test/interactive-ui-contract.test.js plugins/game-engine/test/ui-i18n.test.js plugins/game-engine/test/interactive-controller.test.js
npm run lint -- --quiet
npm run build:css
```

- [ ] **Step 2: Run the full Jest suite**

```powershell
npm test -- --silent --maxWorkers=50% --no-cache
```

Expected: Exit 0 with no failed suites or tests.

- [ ] **Step 3: Synchronize and merge into `main`**

```powershell
git -C C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main pull --ff-only origin main
git -C C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main merge --no-ff codex/connect4-timeout-lockout-admin -m "merge: configure Connect4 timeout lockouts"
```

- [ ] **Step 4: Verify the merged tree and push without force**

```powershell
git -C C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main push origin main
git -C C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main rev-parse HEAD
git -C C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main ls-remote origin refs/heads/main
```

Expected: The local `main` and `origin/main` hashes are identical.
