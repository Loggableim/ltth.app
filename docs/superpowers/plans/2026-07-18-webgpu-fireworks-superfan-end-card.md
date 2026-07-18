# WebGPU Fireworks Superfan End Card Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a personalized, configurable three-second thank-you card after the true visual/audio completion of each paid-Superfan finale, while keeping the next queued finale blocked until the card has finished.

**Architecture:** The backend will attach one validated `completionNotification` descriptor only to Superfan finale requests. The browser engine will keep that descriptor on the existing finale queue entry, turn the existing `finale-complete` event into an `end-card` phase when applicable, and release the queue only on a new `finale-end-card-complete` event. The existing follower-notification DOM renderer remains the single visual implementation, with a separate username line override for the closing copy.

**Tech Stack:** CommonJS JavaScript, Jest, JSDOM, Socket.IO plugin events, existing WebGPU fireworks timeline/queue, HTML/CSS settings UI, JSON locale files.

---

## Constraints to preserve

- A Superfan is an explicitly paid subscriber; `teamMemberLevel` must never qualify a user.
- The opening message remains unchanged.
- Goal, manual, API, legacy, and ordinary follower finales receive no end card unless an explicit validated descriptor is present.
- The end card begins only after the planner/legacy visual and audio tail represented by `finale-complete`.
- A failed, rejected, aborted, or torn-down finale displays no end card.
- The existing unrelated `app/locales/validation-report.json` worktree change must not be staged or modified.
- Live verification must use a plugin-only reload. Do not restart the server or fire a visible finale while the user is streaming unless the user explicitly confirms it is safe.

### Task 1: Normalize the four end-card settings

**Files:**

- Modify: `app/plugins/webgpu-fireworks/lib/config-schema.js`
- Test: `app/test/webgpu-fireworks-superfan-finale.test.js`

**Step 1: Write the failing config tests**

Extend the existing defaults/normalization test with the four settings and boundary cases:

```js
expect(DEFAULT_FIREWORKS_CONFIG).toMatchObject({
  superfanEndCardDuration: 3000,
  superfanEndCardPosition: 'center',
  superfanEndCardSize: 'medium',
  superfanEndCardScale: 1
});

expect(normalizeConfig({
  superfanEndCardDuration: 250,
  superfanEndCardPosition: 'invalid',
  superfanEndCardSize: 'giant',
  superfanEndCardScale: 9
})).toMatchObject({
  superfanEndCardDuration: 1000,
  superfanEndCardPosition: 'center',
  superfanEndCardSize: 'medium',
  superfanEndCardScale: 2
});
```

Also assert the upper duration clamp and all accepted positions/sizes used by the UI.

**Step 2: Run the test to verify RED**

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
```

Expected: failures because the four fields do not exist yet.

**Step 3: Add defaults and normalization**

Add the defaults next to the existing Superfan settings:

```js
superfanEndCardDuration: 3000,
superfanEndCardPosition: 'center',
superfanEndCardSize: 'medium',
superfanEndCardScale: 1,
```

Normalize with the existing helpers and option lists:

```js
superfanEndCardDuration: clampInteger(source.superfanEndCardDuration, 1000, 10000, defaults.superfanEndCardDuration),
superfanEndCardPosition: VALID_FOLLOWER_POSITIONS.includes(source.superfanEndCardPosition)
  ? source.superfanEndCardPosition
  : defaults.superfanEndCardPosition,
superfanEndCardSize: ['small', 'medium', 'large', 'custom'].includes(source.superfanEndCardSize)
  ? source.superfanEndCardSize
  : defaults.superfanEndCardSize,
superfanEndCardScale: clampNumber(source.superfanEndCardScale, 0.5, 2, defaults.superfanEndCardScale),
```

Mirror the defaults in the plugin's in-class fallback configuration in `main.js` during Task 2 so both startup paths remain consistent.

**Step 4: Run the focused test to verify GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
```

Expected: all existing and new config assertions pass.

**Step 5: Commit**

```powershell
git add app/plugins/webgpu-fireworks/lib/config-schema.js app/test/webgpu-fireworks-superfan-finale.test.js
git commit -m "feat(webgpu-fireworks): configure superfan end card"
```

### Task 2: Carry a validated completion descriptor only on Superfan finales

**Files:**

- Modify: `app/plugins/webgpu-fireworks/lib/config-schema.js`
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Test: `app/test/webgpu-fireworks-superfan-finale.test.js`

**Step 1: Write failing backend contract tests**

Add tests that assert:

1. A paid subscriber accepted by `handleSuperfanEntry()` calls `triggerFinale()` with a closing descriptor containing the expected name, avatar, fixed copy, duration, position, size, scale, inherited style, and inherited entrance.
2. Missing usernames fall back to `Superfan`.
3. `triggerFinale()` includes the normalized descriptor in the emitted socket payload.
4. Generic object, legacy numeric, goal, and manual finale calls omit `completionNotification`.
5. Invalid external descriptor values are clamped or omitted; event strings are length-bounded and remain plain data.
6. `SUPERFAN_FINALE_TEST_CONFIG_KEYS` accepts the four visible override settings without mutating the saved plugin config.

Representative assertion:

```js
expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
  completionNotification: {
    username: 'Alpha',
    usernameText: 'Thank you for being a Superfan, Alpha!',
    thankYouText: 'This firework was for you!',
    profilePictureUrl: 'https://example.test/alpha.png',
    duration: 3000,
    position: 'center',
    size: 'medium',
    scale: 1,
    style: 'gradient-purple',
    entrance: 'scale'
  }
}));
```

**Step 2: Run the backend suite to verify RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
```

Expected: descriptor, allowlist, and payload assertions fail.

**Step 3: Implement one shared descriptor normalizer**

In `config-schema.js`, add and export a small pure helper. It must return `null` unless given a plain object, bound all strings, validate the same position/style/entrance lists, and clamp duration/scale:

```js
function normalizeCompletionNotification(value) {
  if (!isPlainObject(value)) return null;
  const username = normalizeDisplayText(value.username, 'Superfan', 80);
  return {
    username,
    usernameText: normalizeDisplayText(
      value.usernameText,
      `Thank you for being a Superfan, ${username}!`,
      180
    ),
    thankYouText: normalizeDisplayText(value.thankYouText, 'This firework was for you!', 180),
    profilePictureUrl: normalizeOptionalUrl(value.profilePictureUrl),
    duration: clampInteger(value.duration, 1000, 10000, 3000),
    position: VALID_FOLLOWER_POSITIONS.includes(value.position) ? value.position : 'center',
    size: ['small', 'medium', 'large', 'custom'].includes(value.size) ? value.size : 'medium',
    scale: clampNumber(value.scale, 0.5, 2, 1),
    style: VALID_FOLLOWER_STYLES.includes(value.style) ? value.style : 'gradient-purple',
    entrance: VALID_FOLLOWER_ENTRANCES.includes(value.entrance) ? value.entrance : 'scale'
  };
}
```

Use existing string/URL helpers where available; if none exactly match, add narrow pure helpers rather than accepting arbitrary object content. In `normalizeFinaleRequest()`, add the key only when normalization returns a descriptor:

```js
const completionNotification = normalizeCompletionNotification(source.completionNotification);
const normalized = { /* existing finale fields */ };
if (completionNotification) normalized.completionNotification = completionNotification;
return normalized;
```

**Step 4: Build the descriptor at the paid-Superfan boundary**

In `main.js`:

- add the four fields to the in-class defaults;
- add the four fields to `SUPERFAN_FINALE_TEST_CONFIG_KEYS`;
- construct the descriptor in `handleSuperfanEntry()` from `effectiveConfig` and the event data;
- pass it to `triggerFinale()`;
- copy `finale.completionNotification` to the outgoing socket payload only when present.

```js
completionNotification: {
  username,
  usernameText: `Thank you for being a Superfan, ${username}!`,
  thankYouText: 'This firework was for you!',
  profilePictureUrl: data.profilePictureUrl || data.userProfilePictureUrl || null,
  duration: effectiveConfig.superfanEndCardDuration,
  position: effectiveConfig.superfanEndCardPosition,
  size: effectiveConfig.superfanEndCardSize,
  scale: effectiveConfig.superfanEndCardScale,
  style: effectiveConfig.followerAnimationStyle,
  entrance: effectiveConfig.followerAnimationEntrance
}
```

Keep the descriptor attached before renderer acknowledgement. A negative acknowledgement still prevents browser playback and must not mark history accepted.

**Step 5: Run the focused backend tests to verify GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
```

Expected: all paid-detection, cooldown, endpoint, and descriptor tests pass.

**Step 6: Commit**

```powershell
git add app/plugins/webgpu-fireworks/lib/config-schema.js app/plugins/webgpu-fireworks/main.js app/test/webgpu-fireworks-superfan-finale.test.js
git commit -m "feat(webgpu-fireworks): attach superfan completion card"
```

### Task 3: Add the browser-owned end-card phase and FIFO hold

**Files:**

- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Test: `app/test/webgpu-fireworks-finale-runtime.test.js`

**Step 1: Write failing runtime tests**

Use the existing `makeRuntime()` and deterministic `tinyPlan()` helpers. Add tests for:

- a queued descriptor stays attached and does not appear while waiting;
- `finale-complete` calls the notification renderer exactly once, sets phase `end-card`, keeps `currentFinale`, and leaves the next finale queued;
- the new end-card completion event releases the ID and starts the next FIFO item at the event due time;
- a non-Superfan finale follows the original immediate completion path;
- duplicate/stale `finale-complete` events cannot show a second card;
- `failFinale()` before normal completion removes control events and shows no card;
- malformed descriptors are discarded when the queue entry is created.

Representative queue assertion:

```js
runtime.handleFinale(firstSuperfanPayload);
runtime.handleFinale(secondPayload);

runtime.processTimeline(showCompleteAt);

expect(runtime.showFollowerAnimation).toHaveBeenCalledTimes(1);
expect(runtime.currentFinale).toMatchObject({ id: firstId, phase: 'end-card' });
expect(runtime.finaleQueue).toHaveLength(1);

runtime.processTimeline(showCompleteAt + 2999);
expect(runtime.currentFinale.id).toBe(firstId);

runtime.processTimeline(showCompleteAt + 3000);
expect(runtime.currentFinale.id).toBe(secondId);
```

**Step 2: Run the runtime suite to verify RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-finale-runtime.test.js
```

Expected: no `end-card` phase/event exists and the next finale starts too early.

**Step 3: Validate and copy the browser descriptor**

Because `engine.js` is loaded directly by the browser, add a narrow local validator rather than importing the CommonJS backend module. It should enforce the same field limits/defaults and return `null` for non-objects. Store the result on the immutable queue entry:

```js
const completionNotification = this.normalizeCompletionNotification(data.completionNotification);
const entry = {
  id,
  data: { ...data, id },
  showPlan,
  legacy: !showPlan,
  completionNotification
};
```

Copy it into `currentFinale` in `startFinaleEntry()` together with a `completionNotificationShown: false` guard.

**Step 4: Split visual completion from queue completion**

Route the existing timeline event through a new method:

```js
} else if (event.type === 'finale-complete') {
  this.finishFinaleVisuals(event.finaleId, now);
} else if (event.type === 'finale-end-card-complete') {
  this.completeFinale(event.finaleId, now);
}
```

Implement the transition:

```js
finishFinaleVisuals(finaleId, now = this.getRuntimeNow()) {
  const finale = this.currentFinale;
  if (!finale || finale.id !== finaleId) return false;
  if (!finale.completionNotification || finale.completionNotificationShown) {
    return finale.completionNotificationShown ? false : this.completeFinale(finaleId, now);
  }

  finale.completionNotificationShown = true;
  this.setFinalePhase(finaleId, 'end-card');
  this.showFollowerAnimation(finale.completionNotification);
  this.scheduleTimeline({
    type: 'finale-end-card-complete',
    due: now + finale.completionNotification.duration,
    order: 110,
    finaleId
  });
  return true;
}
```

Add `finale-end-card-complete` to the `completeFinale()` control-event set. Existing `failFinale()` filtering by `finaleId` must also remove this event; assert that behavior rather than adding an independent timer.

**Step 5: Support separate closing-card lines safely**

Change only the username assignment in `showFollowerAnimation()`:

```js
document.getElementById('follower-username').textContent = data.usernameText || data.username || '';
```

The existing opening payload does not have `usernameText`, so its visual copy remains unchanged. Continue assigning both lines via `textContent`.

**Step 6: Run the runtime tests to verify GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-finale-runtime.test.js
```

Expected: lifecycle, failure, duplicate, legacy, and FIFO tests pass.

**Step 7: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/engine.js app/test/webgpu-fireworks-finale-runtime.test.js
git commit -m "feat(webgpu-fireworks): hold finale queue for end card"
```

### Task 4: Add end-card controls and test-button overrides

**Files:**

- Modify: `app/plugins/webgpu-fireworks/ui/settings.html`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.js`
- Modify: `app/test/webgpu-fireworks-superfan-finale-settings.test.js`

**Step 1: Write failing JSDOM settings tests**

Extend the real settings-page fixture to assert:

- the duration, position, size, and custom scale controls exist in the Superfan card;
- `updateUI()` displays a server config correctly;
- changing and saving all four values sends them through the normal full-config path;
- choosing `custom` shows the scale control and switching away hides it;
- the test button sends current unsaved values in its `settings` override;
- loading an older config without the fields displays the documented defaults.

Use IDs:

```text
superfan-end-card-duration
superfan-end-card-duration-value
superfan-end-card-position
superfan-end-card-size
superfan-end-card-scale-container
superfan-end-card-scale
superfan-end-card-scale-value
```

**Step 2: Run the settings suite to verify RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale-settings.test.js
```

Expected: missing controls and missing request/config fields.

**Step 3: Add the controls using existing follower patterns**

In `settings.html`, place the four controls inside the existing Superfan Finale card before its test button:

- duration slider: 1–10 seconds, 0.5-second step; save milliseconds;
- position select: the existing seven positions;
- size select: small, medium, large, custom;
- custom scale slider: 0.5–2, hidden unless size is `custom`.

Reuse the follower control markup/classes so layout and accessibility stay consistent.

**Step 4: Wire load, save, visibility, and test payload**

In `settings.js`:

```js
document.getElementById('superfan-end-card-duration').value = String((config.superfanEndCardDuration ?? 3000) / 1000);
document.getElementById('superfan-end-card-position').value = config.superfanEndCardPosition ?? 'center';
document.getElementById('superfan-end-card-size').value = config.superfanEndCardSize ?? 'medium';
document.getElementById('superfan-end-card-scale').value = String(config.superfanEndCardScale ?? 1);
```

Add listeners that update `config`, visible value labels, and custom-scale visibility. Extend `testSuperfanFinale()`:

```js
superfanEndCardDuration: Math.round(Number(durationInput.value) * 1000),
superfanEndCardPosition: positionInput.value,
superfanEndCardSize: sizeInput.value,
superfanEndCardScale: Number(scaleInput.value),
```

Do not persist test overrides; the existing test endpoint remains responsible for scoped normalization.

**Step 5: Run the settings suite to verify GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale-settings.test.js
```

Expected: all settings lifecycle and endpoint-payload assertions pass.

**Step 6: Commit**

```powershell
git add app/plugins/webgpu-fireworks/ui/settings.html app/plugins/webgpu-fireworks/ui/settings.js app/test/webgpu-fireworks-superfan-finale-settings.test.js
git commit -m "feat(webgpu-fireworks): add superfan end card settings"
```

### Task 5: Localize and document the feature

**Files:**

- Modify: `app/plugins/webgpu-fireworks/locales/de.json`
- Modify: `app/plugins/webgpu-fireworks/locales/en.json`
- Modify: `app/plugins/webgpu-fireworks/locales/es.json`
- Modify: `app/plugins/webgpu-fireworks/locales/fr.json`
- Modify: `app/plugins/webgpu-fireworks/README.md`
- Test: `app/test/webgpu-fireworks-superfan-finale-settings.test.js`

**Step 1: Add a failing locale parity assertion**

Assert every locale contains the new labels and that the UI references only keys present in all four locale files:

```js
const keys = [
  'superfan_end_card_duration',
  'superfan_end_card_position',
  'superfan_end_card_size',
  'superfan_end_card_scale'
];
```

Reuse existing position and size option translations if their semantic labels match exactly; otherwise add dedicated option keys consistently to all locales.

**Step 2: Run the settings suite to verify RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale-settings.test.js
```

Expected: locale parity fails.

**Step 3: Add DE/EN/ES/FR strings and README guidance**

Document:

- the end card appears only after a successful paid-Superfan finale;
- default duration is 3 seconds;
- position, size, and custom scale are configurable;
- style and entrance inherit the follower notification settings;
- the next finale waits until the card is finished;
- team-level hearts are not Superfan qualification.

**Step 4: Run the locale/settings suite to verify GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale-settings.test.js
```

Expected: locale keys, HTML references, and UI behavior pass.

**Step 5: Commit**

```powershell
git add app/plugins/webgpu-fireworks/locales/de.json app/plugins/webgpu-fireworks/locales/en.json app/plugins/webgpu-fireworks/locales/es.json app/plugins/webgpu-fireworks/locales/fr.json app/plugins/webgpu-fireworks/README.md app/test/webgpu-fireworks-superfan-finale-settings.test.js
git commit -m "docs(webgpu-fireworks): document superfan end card"
```

### Task 6: Full verification and stream-safe activation

**Files:**

- Verify all modified files
- Do not modify or stage `app/locales/validation-report.json`

**Step 1: Run the three focused suites together**

From `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-finale-runtime.test.js test/webgpu-fireworks-superfan-finale-settings.test.js
```

Expected: all tests pass with no open handles.

**Step 2: Run the broader fireworks regression tests**

```powershell
npm test -- --runInBand test/webgpu-fireworks-*.test.js
```

If PowerShell/Jest does not expand the glob as intended, enumerate the matching files with `rg --files test | rg 'webgpu-fireworks-.*\.test\.js$'` and pass those paths explicitly.

Expected: all WebGPU fireworks suites pass.

**Step 3: Run targeted lint and whitespace checks**

```powershell
npx eslint plugins/webgpu-fireworks/lib/config-schema.js plugins/webgpu-fireworks/main.js plugins/webgpu-fireworks/gpu/engine.js plugins/webgpu-fireworks/ui/settings.js test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-finale-runtime.test.js test/webgpu-fireworks-superfan-finale-settings.test.js
git diff --check
```

Expected: zero lint errors and zero whitespace errors.

**Step 4: Inspect exact Git scope**

From the repository root:

```powershell
git status --short --branch
git diff --stat HEAD
git diff --name-only HEAD
```

Expected: only intended Superfan end-card files plus the user's pre-existing unstaged `app/locales/validation-report.json`. Never stage that report.

**Step 5: Request code review before publication**

Use `superpowers:requesting-code-review` against the implementation range. Address only verified issues and rerun the affected tests after any correction.

**Step 6: Activate with the narrowest live-safe action**

First verify the active backend belongs to this workspace. Then use the existing plugin reload endpoint:

```text
POST /api/plugins/webgpu-fireworks/reload
```

Confirm from the server response/log that `webgpu-fireworks` reloaded. Do not restart the application. Do not press the test-finale button during a live stream without explicit permission.

**Step 7: Optional visible acceptance when the user says it is safe**

In the real WebGPU overlay:

1. choose a short Superfan test finale;
2. confirm the opening notification is unchanged;
3. confirm no closing card appears during rockets or their tail;
4. confirm the exact two-line closing copy appears afterward;
5. confirm it holds for the configured duration/position/size;
6. queue a second finale and confirm it starts only after the card disappears;
7. confirm an ordinary manual finale has no closing card.

**Step 8: Final commit if review fixes were needed, then publish only on request**

```powershell
git status --short --branch
git log -5 --oneline
```

Do not include `app/locales/validation-report.json`. Push the current `codex/release-1-3-31` branch only when the user requests publication.

## Plan self-review

- Spec coverage: personalized copy, avatar, duration, position, size, custom scale, inherited style/entrance, true-tail timing, FIFO hold, rejection/failure behavior, and Superfan-only scope are all assigned to implementation steps and tests.
- Lifecycle consistency: only the browser timeline owns the end-card deadline; no backend timer can race queue wait time.
- Backward compatibility: missing descriptors retain immediate completion, legacy finale calls remain accepted, and opening notifications retain their current payload and text.
- Security: event strings remain bounded plain text and the DOM continues to use `textContent`.
- Stream safety: plugin-only reload is the activation path; a visible test requires explicit permission.
- Git safety: the known unrelated `app/locales/validation-report.json` change is explicitly excluded from every staging command.
