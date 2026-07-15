# WebGPU Fireworks Like-Goal Finale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger the configured WebGPU Fireworks finale when an enabled Like goal reaches its target.

**Architecture:** The Goals plugin owns the goal-reached transition and resolves a fireworks plugin through its Plugin API. Update that resolution to prefer `webgpu-fireworks` whenever it provides `triggerFinale`, retaining `fireworks` as the compatibility fallback. The goal state machine, enablement flag, intensity, duration, and duplicate-finales guard remain untouched.

**Tech Stack:** Node.js CommonJS, Jest, better-sqlite3 in-memory test database.

## Global Constraints

- Keep the change scoped to goal-to-fireworks plugin resolution.
- Prefer `webgpu-fireworks`; use the legacy `fireworks` plugin only when WebGPU Fireworks is unavailable.
- Preserve all goal-specific finale settings and the one-finale-per-goal-milestone guard.
- Do not modify existing unrelated working-tree changes.

---

### Task 1: Prefer WebGPU Fireworks for reached Like-goal finales

**Files:**
- Modify: `app/test/goals-fireworks-finale.test.js:125-179`
- Modify: `app/plugins/goals/main.js:374-380`

**Interfaces:**
- Consumes: `api.getPlugin(pluginId)` and a plugin instance with `triggerFinale(intensity, duration)`.
- Produces: `resolveFireworksPlugin()` returns `{ id: 'webgpu-fireworks', plugin }` when WebGPU Fireworks is loaded, otherwise `{ id: 'fireworks', plugin }` for the legacy fallback.

- [ ] **Step 1: Write the failing test**

Add this test immediately after the existing live Like-goal finale test:

```js
test('prefers the WebGPU Fireworks finale for a reached Like goal', () => {
  const sqlite = new Database(':memory:');
  const webgpuFireworks = { triggerFinale: jest.fn() };
  const legacyFireworks = { triggerFinale: jest.fn() };
  const api = createApi(sqlite, new Map([
    ['webgpu-fireworks', webgpuFireworks],
    ['fireworks', legacyFireworks]
  ]));
  const plugin = new GoalsPlugin(api);

  plugin.db.initialize();
  const goal = plugin.db.createGoal({
    id: 'goal_live_likes_webgpu_fireworks',
    name: 'WebGPU Like Finale',
    goal_type: 'likes',
    current_value: 0,
    target_value: 100,
    firework_enabled: 1,
    firework_intensity: 4,
    firework_duration: 7000
  });

  const machine = plugin.stateMachineManager.getMachine(goal.id);
  machine.initialize(goal);
  plugin.setupStateMachineListeners(machine);
  plugin.eventHandlers.setGoalValue(goal.id, 100);
  machine.onUpdateAnimationEnd();

  expect(webgpuFireworks.triggerFinale).toHaveBeenCalledWith(4, 7000);
  expect(webgpuFireworks.triggerFinale).toHaveBeenCalledTimes(1);
  expect(legacyFireworks.triggerFinale).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand --silent test/goals-fireworks-finale.test.js`

Expected: FAIL because the current resolver selects `fireworks`, leaving `webgpuFireworks.triggerFinale` uncalled.

- [ ] **Step 3: Write minimal implementation**

Replace `resolveFireworksPlugin()` with:

```js
resolveFireworksPlugin() {
    const webgpuPlugin = this.api.getPlugin ? this.api.getPlugin('webgpu-fireworks') : null;
    if (webgpuPlugin && typeof webgpuPlugin.triggerFinale === 'function') {
        return { id: 'webgpu-fireworks', plugin: webgpuPlugin };
    }

    const stablePlugin = this.api.getPlugin ? this.api.getPlugin('fireworks') : null;
    if (stablePlugin && typeof stablePlugin.triggerFinale === 'function') {
        return { id: 'fireworks', plugin: stablePlugin };
    }

    return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand --silent test/goals-fireworks-finale.test.js`

Expected: PASS with the new Like-goal WebGPU regression test and the legacy fallback tests green.

- [ ] **Step 5: Run focused quality checks**

Run: `npm run lint -- --quiet -- app/plugins/goals/main.js app/test/goals-fireworks-finale.test.js`

Expected: exit code `0`.

- [ ] **Step 6: Commit the scoped implementation**

```bash
git add app/plugins/goals/main.js app/test/goals-fireworks-finale.test.js docs/superpowers/plans/2026-07-14-webgpu-fireworks-like-goal-finale.md
git commit -m "fix(goals): trigger webgpu fireworks for reached goals"
```
