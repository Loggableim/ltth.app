# EmojiRain Command Asset Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every dynamic EmojiRain command renders its assigned emoji or image even when global custom images are enabled.

**Architecture:** Dynamic command handlers attach `assetLocked: true` to their centralized spawn request. Classic, OBS-HUD, and WebGPU preserve that explicit boundary signal and skip renderer-level asset substitution only for locked spawns; ordinary unlocked rain retains the current custom-image behavior.

**Tech Stack:** CommonJS Node.js, Jest, JSDOM, browser-side JavaScript, Matter.js Classic renderer, native WebGPU adapter.

## Global Constraints

- Dynamic commands always render exactly their assigned emoji or image.
- Global custom images continue to replace assets for ordinary, non-command EmojiRain events.
- Locked command assets take priority over renderer user mappings and the global custom-image pool.
- Command count, access, cooldowns, despawn duration, collisions, and all non-command events remain unchanged.
- Classic, OBS-HUD, and WebGPU behavior remain equivalent.
- No server restart and no synthetic chat command during live verification.

---

### Task 1: Mark dynamic command spawn assets as locked

**Files:**
- Modify: `app/test/helpers/emoji-rain-command-plugin-contract.js`
- Modify: `app/plugins/emoji-rain/main.js`
- Modify: `app/plugins/webgpu-emoji-rain/main.js`
- Test: `app/plugins/emoji-rain/test/chat-commands.test.js`
- Test: `app/plugins/webgpu-emoji-rain/test/chat-commands.test.js`

**Interfaces:**
- Consumes: existing `triggerEmojiRain(params)` payload.
- Produces: dynamic command spawn events with `assetLocked: true`.
- Preserves: built-in and event-driven spawn payloads without an `assetLocked` property.

- [ ] **Step 1: Write the failing shared command contract**

Extend the successful image-command assertion:

```js
expect(api.emissions[0].data).toMatchObject({
  emoji: imageRendererMode === 'profile-picture' ? '{{profilePicture}}' : imagePath,
  ...(imageRendererMode === 'profile-picture' ? { profilePictureUrl: imagePath } : {}),
  count: 4,
  burst: false,
  lifetimeMs: 12000,
  assetLocked: true
});
```

Extend the built-in command assertion:

```js
expect(api.emissions[2].data).not.toHaveProperty('lifetimeMs');
expect(api.emissions[2].data).not.toHaveProperty('assetLocked');
```

- [ ] **Step 2: Run both command suites and verify RED**

Run from `app/`:

```powershell
node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath plugins/emoji-rain/test/chat-commands.test.js plugins/webgpu-emoji-rain/test/chat-commands.test.js
```

Expected: both suites fail because dynamic command emissions omit `assetLocked`.

- [ ] **Step 3: Attach and preserve the explicit lock**

Add this property only inside both `handleConfiguredAnimalCommand` spawn requests:

```js
assetLocked: true,
```

Add this conditional field to both centralized `spawnData` objects:

```js
...(params.assetLocked === true ? { assetLocked: true } : {}),
```

Do not add the field to `/rain`, `/emoji`, `/storm`, gifts, likes, follows, shares, subscriptions, stickers, or SuperFan bursts.

- [ ] **Step 4: Run both command suites and verify GREEN**

Run the Step 2 command again. Expected: both suites pass, including the built-in negative assertion.

- [ ] **Step 5: Commit Task 1**

```powershell
git add app/test/helpers/emoji-rain-command-plugin-contract.js app/plugins/emoji-rain/main.js app/plugins/webgpu-emoji-rain/main.js
git commit -m "fix(emojirain): lock configured command assets"
```

### Task 2: Preserve the lock through Classic and OBS-HUD queues

**Files:**
- Modify: `app/test/emoji-rain-engine-coordinate-regression.test.js`
- Modify: `app/public/js/emoji-rain-engine.js`
- Modify: `app/public/js/emoji-rain-obs-hud.js`

**Interfaces:**
- Consumes: spawn-event property `data.assetLocked === true`.
- Produces: `spawnEmoji(..., lifetimeMs, assetLocked)` with a boolean final argument.
- Preserves: unlocked custom-image replacement.

- [ ] **Step 1: Write failing functional renderer tests**

Add a helper inside the test file:

```js
function enableCustomImages(context, imageUrl = '/global-custom.webp') {
  vm.runInContext(`
    config.use_custom_images = true;
    config.image_urls = [${JSON.stringify(imageUrl)}];
  `, context);
}
```

Add a parameterized locked-command test:

```js
test.each(scripts)('$name keeps a locked command emoji when custom images are enabled', ({ path: scriptPath }) => {
  const { context } = loadOverlayScript(scriptPath);
  context.initPhysics();
  enableCustomImages(context);

  const rendered = context.spawnEmoji(
    '🐶', 0.5, 0.5, 60, null, null, null, 'command', false, 12000, true
  );

  expect(rendered.element.querySelector('img')).toBeNull();
  expect(rendered.element.textContent).toBe('🐶');
});
```

Add the unlocked control:

```js
test.each(scripts)('$name still uses a global custom image for unlocked rain', ({ path: scriptPath }) => {
  const { context } = loadOverlayScript(scriptPath);
  context.initPhysics();
  enableCustomImages(context);

  const rendered = context.spawnEmoji('🐶', 0.5, 0.5, 60);

expect(rendered.element.querySelector('img')?.src).toContain('/global-custom.webp');
});
```

Add an explicit command-image control for both Classic renderers:

```js
test.each(scripts)('$name keeps a locked command image when custom images are enabled', ({ path: scriptPath }) => {
  const { context } = loadOverlayScript(scriptPath);
  context.initPhysics();
  enableCustomImages(context);

  const rendered = context.spawnEmoji(
    '{{profilePicture}}', 0.5, 0.5, 60, null, '/command.webp',
    null, 'command', false, 12000, true
  );

  expect(rendered.element.querySelector('img')?.src).toContain('/command.webp');
  expect(rendered.element.querySelector('img')?.src).not.toContain('/global-custom.webp');
});
```

Extend the existing queue source-contract assertions so the standard spawn queue and both rate-limit queues contain `assetLocked`, and drained calls contain `emojiData.assetLocked`.

- [ ] **Step 2: Run the Classic renderer regression and verify RED**

```powershell
node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath test/emoji-rain-engine-coordinate-regression.test.js
```

Expected: locked command tests render `/global-custom.webp`, and queue assertions report the missing field.

- [ ] **Step 3: Thread the lock through both Classic renderers**

Extend both spawn signatures:

```js
function spawnEmoji(
  emoji, x, y, size, username = null, profilePictureUrl = null,
  color = null, spawnKind = 'default', isBurst = false,
  lifetimeMs = null, assetLocked = false
) {
```

Guard the global custom-image branch in both files:

```js
} else if (assetLocked !== true
    && config.use_custom_images
    && config.image_urls
    && config.image_urls.length > 0) {
```

In both `handleSpawnEvent` implementations normalize once:

```js
const assetLocked = data.assetLocked === true;
```

Carry `assetLocked` through the standard spawn queue:

```js
spawnQueue.push({
  emoji, x, y, actualCount, username, profilePictureUrl, color,
  isBurst, spawnKind, lifetimeMs, assetLocked
});

function processSpawn(
  emoji, x, y, actualCount, username, profilePictureUrl, color,
  isBurst, spawnKind = 'default', lifetimeMs = null, assetLocked = false
) {
```

Every immediate and drained call uses the same final argument:

```js
spawnEmoji(
  emoji, offsetX, offsetY, size, username, profilePictureUrl,
  color, spawnKind, isBurst, lifetimeMs, assetLocked
);
```

Both rate-limit queue entries include `assetLocked`, and both drainers call:

```js
spawnEmoji(
  emojiData.emoji,
  emojiData.x,
  emojiData.y,
  emojiData.size,
  emojiData.username,
  emojiData.profilePictureUrl,
  emojiData.color,
  emojiData.spawnKind,
  emojiData.isBurst,
  emojiData.lifetimeMs,
  emojiData.assetLocked
);
```

- [ ] **Step 4: Run the Classic renderer regression and verify GREEN**

Run the Step 2 command again. Expected: both functional locked tests, both unlocked controls, and all existing coordinate/lifetime regressions pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add app/test/emoji-rain-engine-coordinate-regression.test.js app/public/js/emoji-rain-engine.js app/public/js/emoji-rain-obs-hud.js
git commit -m "fix(emojirain): preserve locked assets in classic renderers"
```

### Task 3: Make WebGPU honor the exact-asset contract

**Files:**
- Modify: `app/test/webgpu-emoji-rain-renderer-parity.test.js`
- Modify: `app/plugins/webgpu-emoji-rain/gpu/engine.js`

**Interfaces:**
- Consumes: spawn-event property `data.assetLocked === true`.
- Produces: the explicit command asset before user mapping or custom-image substitution.
- Preserves: existing profile-token resolution and unlocked custom-image behavior.

- [ ] **Step 1: Make the adapter harness accept config overrides**

Change the helper signature and config payload:

```js
async function loadAdapter({ mappings = {}, config = {} } = {}) {
  // ...
  config: {
    enabled: true,
    obs_hud_enabled: true,
    emoji_lifetime_ms: 7600,
    heart_balloon_profile_every: 5,
    heart_balloon_pop_y: 0.5,
    heart_balloon_wind_strength: 0.45,
    ...config
  }
}
```

- [ ] **Step 2: Write failing locked and unlocked WebGPU tests**

```js
test.each([
  ['emoji', '🦖'],
  ['image', '/command.webp']
])('locked command %s wins over user mappings and global custom images', async (_type, asset) => {
  const { renderer, socketHandlers } = await loadAdapter({
    mappings: { alice: '/mapped-user.webp' },
    config: { use_custom_images: true, image_urls: ['/global-custom.webp'] }
  });

  socketHandlers['webgpu-emoji-rain:spawn']({
    emoji: asset, username: 'alice', reason: 'command',
    source: '/rawr', count: 1, assetLocked: true
  });
  await flushAsyncWork();

  expect(renderer.spawn).toHaveBeenCalledWith(expect.objectContaining({ asset }));
});

test('unlocked rain still uses the global custom image', async () => {
  const { renderer, socketHandlers } = await loadAdapter({
    config: { use_custom_images: true, image_urls: ['/global-custom.webp'] }
  });

  socketHandlers['webgpu-emoji-rain:spawn']({ emoji: '🐶', reason: 'manual', count: 1 });
  await flushAsyncWork();

  expect(renderer.spawn).toHaveBeenCalledWith(expect.objectContaining({ asset: '/global-custom.webp' }));
});
```

- [ ] **Step 3: Run the WebGPU parity test and verify RED**

```powershell
node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath test/webgpu-emoji-rain-renderer-parity.test.js
```

Expected: both locked cases receive `/mapped-user.webp` instead of their assigned asset; the unlocked control already passes.

- [ ] **Step 4: Prioritize locked assets in `normalizeAsset`**

Immediately after reading `profilePictureUrl` and before `findUserMapping`, add:

```js
if (data.assetLocked === true) {
  if (data.emoji === PROFILE_PICTURE_TOKEN) {
    return { asset: profilePictureAsset(profilePictureUrl), fallback: '👤', isProfile: true };
  }
  return { asset: data.emoji || fallback, fallback, isProfile: false };
}
```

Do not alter mapping, sticker, live-event profile, gift, or custom-image priority for unlocked payloads.

- [ ] **Step 5: Run the WebGPU parity test and verify GREEN**

Run the Step 3 command again. Expected: both new tests and all existing renderer-parity tests pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add app/test/webgpu-emoji-rain-renderer-parity.test.js app/plugins/webgpu-emoji-rain/gpu/engine.js
git commit -m "fix(emojirain): honor locked assets in webgpu"
```

### Task 4: Integrated verification, local main merge, and live-safe handoff

**Files:**
- Verify all files changed in Tasks 1-3.
- Merge target: local `main`.

**Interfaces:**
- Consumes: committed `assetLocked` implementation.
- Produces: verified local `main` containing the fix.

- [ ] **Step 1: Run the focused regression set**

```powershell
node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath test/emoji-rain-animal-commands.test.js test/emoji-rain-engine-coordinate-regression.test.js test/webgpu-emoji-rain-renderer-parity.test.js test/webgpu-emoji-rain-native.test.js plugins/emoji-rain/test/chat-commands.test.js plugins/webgpu-emoji-rain/test/chat-commands.test.js
```

Expected: every suite passes with zero failures.

- [ ] **Step 2: Run static verification**

```powershell
git diff --check main...HEAD
$js = @(git diff --name-only --diff-filter=ACMR main...HEAD -- 'app/*.js' 'app/**/*.js')
foreach ($file in $js) { node --check $file }
Push-Location app
try {
  ..\app\node_modules\.bin\eslint.cmd @($js | ForEach-Object { $_ -replace '^app/', '' })
} finally {
  Pop-Location
}
```

Expected: all commands exit 0.

- [ ] **Step 3: Merge the verified branch locally into `main`**

Use a clean main worktree, preserve unrelated runtime changes, and merge without pushing:

```powershell
git switch main
git merge --no-edit codex/emojirain-command-asset-lock
```

- [ ] **Step 4: Re-run the focused regression set on merged `main`**

Run the Step 1 command from the merged main worktree. Expected: every suite passes with zero failures.

- [ ] **Step 5: Verify the active runtime without synthetic chat**

If an LTTH process still listens on port 3000, confirm its executable path, active EmojiRain variant, and current config. Copy only the validated runtime files if the running checkout differs from the merged worktree. Reload only the active EmojiRain plugin and refresh only its overlay; do not restart the server. Verify that the process ID is unchanged and that `/api/webgpu-emoji-rain/config` still reports the existing command configuration.

- [ ] **Step 6: Record final state**

Record the local main commit, focused suite/test counts, static-check results, active runtime PID, and whether a GitHub push remains pending.
