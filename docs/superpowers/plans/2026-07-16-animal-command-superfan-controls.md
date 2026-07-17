# Animal Command SuperFan Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the five animal chat commands as plain emoji rain and gate them behind a persisted SuperFan-only switch.

**Architecture:** `burst: true` assigns the WebGPU commands to shader kind `burst`, which adds the circular ring. The command handlers will emit `burst: false` while retaining their current counts and cooldowns. Both EmojiRain variants will use `animal_commands_superfans_only`, enabled by default; the handler accepts a command only when GCCE provides `context.userData.teamMemberLevel >= 1`.

**Tech Stack:** Node.js CommonJS plugins, Jest, Socket.IO, plugin configuration UI.

## Global Constraints

- Keep `!beans`, `!miau`, `!rawr`, `!woof`, and `!wuff` cooldowns unchanged.
- Set the SuperFan-only switch to enabled by default and make it visible in the active WebGPU UI.
- Reload only `webgpu-emoji-rain` in the live runtime after focused verification.

---

### Task 1: Specify command eligibility and plain-rain payloads

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/test/chat-commands.test.js`
- Modify: `app/plugins/emoji-rain/test/chat-commands.test.js`

**Interfaces:**
- Consumes: GCCE contexts with `userData.teamMemberLevel`.
- Produces: Tests requiring `burst: false`, SuperFan acceptance, rejection of regular viewers, and opt-out behavior.

- [ ] **Step 1: Write the failing tests**

```js
const response = await command.handler([], {
  username: 'superfan-one',
  userData: { teamMemberLevel: 1 }
});

expect(api.emissions[0].data).toEqual(expect.objectContaining({ burst: false }));
```

```js
const response = await miau.handler([], {
  username: 'viewer-one',
  userData: { teamMemberLevel: 0 }
});

expect(response).toEqual(expect.objectContaining({ success: false }));
expect(api.emissions).toEqual([]);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `cd app && npx jest plugins/webgpu-emoji-rain/test/chat-commands.test.js plugins/emoji-rain/test/chat-commands.test.js --runInBand`

Expected: failure because the current handlers emit `burst: true` and do not inspect SuperFan status.

- [ ] **Step 3: Implement the minimum command changes**

```js
isAnimalCommandSuperFan(context = {}) {
  return Number(context?.userData?.teamMemberLevel) >= 1;
}

if (config.animal_commands_superfans_only !== false && !this.isAnimalCommandSuperFan(context)) {
  return { success: false, message: 'This animal command is only available to SuperFans', displayOverlay: true };
}
```

Set the five command payloads to `burst: false`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `cd app && npx jest plugins/webgpu-emoji-rain/test/chat-commands.test.js plugins/emoji-rain/test/chat-commands.test.js --runInBand`

Expected: all animal command tests pass.

### Task 2: Persist and expose the WebGPU switch

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/lib/webgpu-config.js`
- Modify: `app/plugins/webgpu-emoji-rain/ui.html`
- Modify: `app/public/js/webgpu-emoji-rain-ui.js`
- Modify: `app/modules/database.js`
- Modify: `app/plugins/emoji-rain/ui.html`
- Modify: `app/public/js/emoji-rain-ui.js`

**Interfaces:**
- Produces: persisted Boolean `animal_commands_superfans_only`, defaulting to `true`, and a checkbox labelled `Tier-Befehle nur für SuperFans`.

- [ ] **Step 1: Add the setting to both configuration defaults and WebGPU normalization**

```js
animal_commands_superfans_only: true
```

Include it in the WebGPU Boolean normalization list.

- [ ] **Step 2: Add the checkbox and configuration bindings**

```html
<input type="checkbox" id="animal_commands_superfans_only">
Tier-Befehle nur für SuperFans
```

Bind the control in each UI's configuration load and save code.

- [ ] **Step 3: Verify configuration wiring through the focused suites and lint**

Run: `cd app && npx jest plugins/webgpu-emoji-rain/test/chat-commands.test.js plugins/emoji-rain/test/chat-commands.test.js --runInBand && npm run lint -- --quiet`

Expected: focused suites and lint pass.

### Task 3: Live-safe rollout

**Files:**
- Runtime only: active `webgpu-emoji-rain` plugin.

- [ ] **Step 1: Reload only the WebGPU plugin**

Run: `Invoke-RestMethod -Method Post http://localhost:3000/api/plugins/webgpu-emoji-rain/reload`

- [ ] **Step 2: Verify the runtime and persisted active setting**

Run: `Invoke-RestMethod http://localhost:3000/api/webgpu-emoji-rain/config` and `Invoke-RestMethod http://localhost:3000/api/webgpu-emoji-rain/status`

Expected: the plugin reports enabled and `animal_commands_superfans_only: true`.

- [ ] **Step 3: Inspect the live UI control without triggering chat drops**

Run: open `/webgpu-emoji-rain/ui` and confirm that the checkbox is visible and checked.

### Task 4: Make the `!beans` opt-out reachable through GCCE

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/main.js`
- Modify: `app/plugins/emoji-rain/main.js`
- Modify: `app/plugins/webgpu-emoji-rain/test/chat-commands.test.js`
- Modify: `app/plugins/emoji-rain/test/chat-commands.test.js`

**Interfaces:**
- GCCE checks a command's static `permission` before invoking its handler.
- The animal-command handler already performs the dynamic SuperFan-only check.

- [ ] **Step 1: Write the failing registration assertion**

```js
expect(command).toMatchObject({
  name: 'beans',
  permission: 'all'
});
```

- [ ] **Step 2: Run the focused suites to verify the assertion fails**

Run: `cd app && npx jest plugins/webgpu-emoji-rain/test/chat-commands.test.js plugins/emoji-rain/test/chat-commands.test.js --runInBand`

Expected: failure because `beans` is still registered with `permission: 'subscriber'`.

- [ ] **Step 3: Register `!beans` with `permission: 'all'` in both variants**

Keep its `30s/user` and `5s/global` cooldowns. The existing handler continues to enforce the configurable SuperFan-only restriction.

- [ ] **Step 4: Run the focused suites to verify they pass**

Run: `cd app && npx jest plugins/webgpu-emoji-rain/test/chat-commands.test.js plugins/emoji-rain/test/chat-commands.test.js --runInBand`

Expected: all command tests pass and the opt-out can reach `!beans` for ordinary viewers.

- [ ] **Step 5: Reload only the active WebGPU plugin and verify its command registration**

Run: `POST /api/plugins/webgpu-emoji-rain/reload`, then verify the plugin remains enabled and the renderer returns to `ready`.
