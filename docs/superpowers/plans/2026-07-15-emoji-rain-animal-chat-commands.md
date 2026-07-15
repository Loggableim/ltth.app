# EmojiRain Animal Chat Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make !beans drop paw prints and add cat, dinosaur, and dog EmojiRain chat commands with the agreed GCCE cooldowns.

**Architecture:** The classic emoji-rain plugin remains the only integration point. It adds four GCCE definitions and sends them through a small shared handler that retains the existing enabled and anti-spam checks before calling triggerEmojiRain. The overlay keeps consuming the normal emoji-rain:spawn socket event.

**Tech Stack:** Node.js, CommonJS, Jest, GCCE, Socket.IO.

## Global Constraints

- Work only in app/plugins/emoji-rain/; do not touch the WebGPU EmojiRain plugin, the plugin store, the database schema, or the overlay renderer.
- Preserve !beans: subscriber permission, 30-second user cooldown, 5-second global cooldown.
- !miau, !rawr, !woof, and !wuff: all-user permission, 60-second user cooldown, 15-second global cooldown.
- Every command spawns 30 emojis at intensity 1.5 with burst: true.
- Follow CommonJS and 2-space JavaScript indentation.

---

### Task 1: Add a regression test for registered command behavior

**Files:**
- Create: app/plugins/emoji-rain/test/chat-commands.test.js

**Interfaces:**
- Consumes: EmojiRainPlugin.integrateWithGCCE() and its registered command handler(args, context) functions.
- Produces: tests that describe the expected command metadata and outgoing emoji-rain:spawn payloads.

- [ ] **Step 1: Create a mock API that captures GCCE registration and socket output**

~~~js
class MockAPI {
  constructor(config = {}) {
    this.emissions = [];
    this.commands = [];
    this.config = {
      enabled: true,
      emoji_set: ['💙'],
      max_count_per_event: 100,
      max_intensity: 3,
      ...config
    };
    this.db = { getEmojiRainConfig: () => this.config };
    this.pluginLoader = {
      loadedPlugins: new Map([['gcce', {
        instance: {
          registerCommandsForPlugin: (_pluginId, commands) => {
            this.commands = commands;
            return { registered: commands.map(command => command.name), failed: [] };
          }
        }
      }]])
    };
  }

  log() {}
  emit(event, data) { this.emissions.push({ event, data }); }
  getSocketIO() { return { emit: this.emit.bind(this) }; }
  getDatabase() { return this.db; }
  getPluginDataDir() { return '/tmp/emoji-rain-chat-command-test'; }
  ensurePluginDataDir() {}
  getConfigPathManager() {
    return { getUserConfigsDir: () => '/tmp/emoji-rain-chat-command-config' };
  }
  registerRoute() {}
  registerTikTokEvent() {}
  registerFlowAction() {}
}
~~~

- [ ] **Step 2: Define the five exact expectations and execute actual handlers**

~~~js
const commandCases = [
  ['beans', '🐾', '/beans', 'subscriber', 30000, 5000],
  ['miau', '🐱', '/miau', 'all', 60000, 15000],
  ['rawr', '🦖', '/rawr', 'all', 60000, 15000],
  ['woof', '🐶', '/woof', 'all', 60000, 15000],
  ['wuff', '🐶', '/wuff', 'all', 60000, 15000]
];

test.each(commandCases)('%s registers and emits the expected burst', async (
  name, emoji, source, permission, userCooldown, globalCooldown
) => {
  const api = new MockAPI();
  const plugin = new EmojiRainPlugin(api);
  await plugin.integrateWithGCCE();

  const command = api.commands.find(candidate => candidate.name === name);
  expect(command).toMatchObject({
    name,
    permission,
    enabled: true,
    minArgs: 0,
    maxArgs: 0,
    cooldown: { user: userCooldown, global: globalCooldown }
  });

  const response = await command.handler([], { username: 'viewer-one' });

  expect(response).toEqual(expect.objectContaining({ success: true, displayOverlay: true }));
  expect(api.emissions).toEqual([expect.objectContaining({
    event: 'emoji-rain:spawn',
    data: expect.objectContaining({
      emoji,
      source,
      username: 'viewer-one',
      count: 30,
      intensity: 1.5,
      burst: true,
      reason: 'command'
    })
  })]);
});
~~~

- [ ] **Step 3: Add the disabled-state regression case**

~~~js
test('miau does not emit while EmojiRain is disabled', async () => {
  const api = new MockAPI({ enabled: false });
  const plugin = new EmojiRainPlugin(api);
  await plugin.integrateWithGCCE();

  const miau = api.commands.find(command => command.name === 'miau');
  const response = await miau.handler([], { username: 'viewer-one' });

  expect(response).toEqual(expect.objectContaining({ success: false }));
  expect(api.emissions).toEqual([]);
});
~~~

- [ ] **Step 4: Verify the test is red before changing production code**

Run:

~~~powershell
cd app
npm test -- --runInBand --silent plugins/emoji-rain/test/chat-commands.test.js
~~~

Expected: the beans assertion receives ⭐ instead of 🐾; the four animal command cases fail because their registrations are missing.

### Task 2: Implement the command registrations and shared animal handler

**Files:**
- Modify: app/plugins/emoji-rain/main.js lines 319-363
- Modify: app/plugins/emoji-rain/main.js lines 542-581

**Interfaces:**
- Consumes: the existing checkAntiSpam(username) and triggerEmojiRain(params) methods.
- Produces: handleAnimalCommand({ emoji, source, label }, context), called by four GCCE commands.

- [ ] **Step 1: Add the four command definitions after the beans definition**

~~~js
        ...[
          { name: 'miau', emoji: '🐱', label: 'cat', description: 'Trigger cat emoji burst' },
          { name: 'rawr', emoji: '🦖', label: 'dinosaur', description: 'Trigger dinosaur emoji burst' },
          { name: 'woof', emoji: '🐶', label: 'dog', description: 'Trigger dog emoji burst' },
          { name: 'wuff', emoji: '🐶', label: 'dog', description: 'Trigger dog emoji burst' }
        ].map(({ name, emoji, label, description }) => ({
          name,
          description,
          syntax: '/' + name,
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 0,
          category: 'Effects',
          cooldown: { user: 60000, global: 15000 },
          handler: async (args, context) => await this.handleAnimalCommand({
            emoji,
            source: '/' + name,
            label
          }, context)
        })),
~~~

- [ ] **Step 2: Correct the beans payload and response copy**

~~~js
      emoji: '🐾',
~~~

~~~js
      message: context.username + ' triggered a SuperFan paw burst! 🐾',
~~~

- [ ] **Step 3: Add the shared handler after handleBeansCommand**

~~~js
  async handleAnimalCommand({ emoji, source, label }, context) {
    const config = this.api.getDatabase().getEmojiRainConfig();

    if (!config.enabled) {
      return {
        success: false,
        message: 'Emoji rain is currently disabled',
        displayOverlay: true
      };
    }

    if (!this.checkAntiSpam(context.username)) {
      this.metrics.droppedEvents++;
      return {
        success: false,
        message: 'Please wait before using this command again',
        displayOverlay: true
      };
    }

    this.triggerEmojiRain({
      emoji,
      count: 30,
      intensity: 1.5,
      duration: 0,
      burst: true,
      username: context.username,
      reason: 'command',
      source
    });

    this.metrics.commandTriggers++;

    return {
      success: true,
      message: context.username + ' triggered a ' + label + ' burst! ' + emoji,
      displayOverlay: true
    };
  }
~~~

- [ ] **Step 4: Re-run the focused test and verify green**

Run:

~~~powershell
cd app
npm test -- --runInBand --silent plugins/emoji-rain/test/chat-commands.test.js
~~~

Expected: one passing suite with six passing tests and no Jest open-handle warning.

### Task 3: Update command documentation and validate the plugin

**Files:**
- Modify: app/plugins/emoji-rain/README.md lines 104-149
- Modify: app/plugins/emoji-rain/README.md lines 371-378

**Interfaces:**
- Consumes: the exact command metadata in Task 2.
- Produces: user-facing command documentation that matches GCCE registration.

- [ ] **Step 1: Update the existing beans entry**

Replace its description and example with:

~~~markdown
**Beschreibung**: SuperFan-Burst-Effekt mit 30 Pfötchen.

**Beispiel:**
/beans → 🐾🐾🐾 SuperFan Pfötchen-Burst!
~~~

- [ ] **Step 2: Add compact entries for the four new commands after beans**

~~~markdown
#### /miau, /rawr, /woof, /wuff
**Permission**: all
**Cooldown**: 60s per user, 15s global
**Beschreibung**: Löst einen 30er-Burst aus: 🐱, 🦖, beziehungsweise 🐶.
~~~

Add the four names and exact cooldown values to the command-specific cooldown list.

- [ ] **Step 3: Run focused and nearby checks**

~~~powershell
cd app
npm test -- --runInBand --silent plugins/emoji-rain/test/chat-commands.test.js
npm test -- --runInBand --silent plugins/emoji-rain/test
npm run lint -- --quiet
~~~

Then, from the repository root, run:

~~~powershell
git diff --check
~~~

Expected: every command test and nearby EmojiRain suite passes, ESLint exits with code 0, and the diff check reports no whitespace errors.

- [ ] **Step 4: Commit only the feature files**

~~~powershell
git add -- app/plugins/emoji-rain/main.js app/plugins/emoji-rain/README.md app/plugins/emoji-rain/test/chat-commands.test.js
git commit -m "feat(emoji-rain): add animal chat commands"
~~~

Expected: the commit contains only the EmojiRain implementation, its focused test, and updated user documentation. Do not stage unrelated worktree changes.
