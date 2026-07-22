# Stream Monsters Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship generated Stream Monsters icon, logo and Store banner assets, rebrand every public surface while preserving compatibility identifiers, and merge the verified branch locally into `main`.

**Architecture:** Keep `streamalchemy` as the compatibility identifier and replace only public visual references. A square PNG provides the catalogue icon; a matching wide PNG provides the marketing hero. Both are emitted by the built-in image generator on a chroma-key field, converted to alpha PNGs, then checked into the asset tree.

**Tech Stack:** PNG assets, static HTML, Jest, Node.js package scripts, Git worktrees.

## Global Constraints

- Preserve the plugin ID, feature URL, data path and package name `streamalchemy`.
- Use no Pokemon names, visual assets, typography or other protected character likenesses.
- Use the built-in image generator and inspect generated output before selecting it.
- Preserve unrelated changes in existing worktrees; do not push to a remote.

---

### Task 1: Add a failing static branding contract

**Files:**
- Create: `app/test/streammonsters-brand-assets.test.js`
- Modify: `features/plugin-stream-alchemy.html:39,52`
- Modify: `plugins.html:501`

**Interfaces:**
- Consumes: static public paths `/assets/plugin-logos/stream-monsters-logo.png` and `/assets/plugin-logos/stream-monsters-icon.png`.
- Produces: an executable Jest contract that verifies the public pages use the matching brand assets and expose the Stream Monsters name.

- [x] **Step 1: Write the failing test**

```js
expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-logo.png');
expect(featurePage).toContain('/assets/plugin-logos/stream-monsters-icon.png');
expect(pluginPage).toContain("'streamalchemy': '/assets/plugin-logos/stream-monsters-icon.png'");
expect(fs.existsSync(iconPath)).toBe(true);
expect(fs.existsSync(logoPath)).toBe(true);
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -- --runInBand --silent test/streammonsters-brand-assets.test.js`

Expected: failure because the generated PNG files and public references do not yet exist.

- [x] **Step 3: Generate and install the matching PNG assets**

Generate one square icon, one wide wordmark and one opaque Store feature banner using the approved design. Inspect each source image, select the assets, remove the chroma key from icon and wordmark with the supplied helper, and validate the dimensions and alpha corners with Pillow.

- [x] **Step 4: Update public references**

Replace the hero image source with `/assets/plugin-logos/stream-monsters-logo.png`, the explanatory icon source with `/assets/plugin-logos/stream-monsters-icon.png`, and the `streamalchemy` plugin mapping in `plugins.html` with the icon path. Point the Open Graph image and Store screenshot metadata to `/screenshots/features/stream-monsters.png`.

- [x] **Step 5: Run the contract to verify it passes**

Run: `cd app && npm test -- --runInBand --silent test/streammonsters-brand-assets.test.js`

Expected: PASS.

### Task 2: Validate package and run focused verification

**Files:**
- Create: `plugin-store/packages/streamalchemy-1.1.2.zip`
- Modify: `plugin-store/registry.json`
- Modify: `plugin-store.json`
- Test: `app/test/streammonsters-brand-assets.test.js`
- Test: `app/test/streamalchemy-relaunch-*.test.js`

**Interfaces:**
- Consumes: branded static assets and the existing package-builder convention.
- Produces: a registry record whose archive hash matches the rebuilt Stream Monsters package.

- [x] **Step 1: Bump and rebuild the plugin archive after plugin-surface changes**

The public-site assets stay outside the archive, but the plugin UI, overlay and locales were rebranded. Bump `app/plugins/streamalchemy/plugin.json` and the Store record from `1.1.1` to `1.1.2`, archive the complete plugin source as `streamalchemy-1.1.2.zip`, and preserve the existing `1.1.1` archive for already-published installs.

- [x] **Step 2: Verify package contents and registry hash**

List the archive entries to confirm the updated plugin source is present, then calculate SHA-256 for `plugin-store/packages/streamalchemy-1.1.1.zip` and compare it to the registry record.

- [x] **Step 3: Run focused regression tests and static quality checks**

Run the new branding contract, the existing Stream Monsters relaunch suites, `npm run build:css`, and `npm run lint -- --quiet` from `app`.

- [x] **Step 4: Commit the branded feature work**

Stage only the assets, public references, test, archive and registry updates, plus this plan. Commit with `feat(streammonsters): add generated brand assets`.

### Task 3: Integrate locally into main without losing unrelated work

**Files:**
- No source files beyond the merge result.

**Interfaces:**
- Consumes: the verified `codex/stream-monsters` feature branch.
- Produces: a locally updated `main` that contains the Stream Monsters commits while existing unrelated worktree modifications remain intact.

- [ ] **Step 1: Inspect all registered worktrees and current `main` dirt**

Run: `git worktree list --porcelain` and `git -C <main-worktree> status --short`.

- [ ] **Step 2: Merge on `main` only when the dirty worktree can be preserved**

Use a clean integration checkout or a reversible stash only when the worktree owner has explicitly authorized it. Never overwrite or discard foreign changes.

- [ ] **Step 3: Verify merged state**

Run the static branding contract and compare `main` to the merged commit. Report the local merge commit and do not push.
