# Stream Monsters Egg Owner Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the sanitized owner name alongside the existing action on each compact rotating portrait egg card.

**Architecture:** `streammonsters-egg-stage-view.js` already owns the compact card metadata and receives a safe display name in every egg-stage item. Extend only that projected command text; preserve the timer as its separate element and leave game state, rotation, and desktop presentation untouched.

**Tech Stack:** CommonJS, Jest, JSDOM, vanilla DOM.

## Global Constraints

- Use the existing `safeViewerName` output; do not add an identity data source.
- Keep the action command and countdown visible in the compact portrait card.
- Do not change adoption, steal, hatch, or egg-rotation behavior.

---

### Task 1: Render owner-qualified compact actions

**Files:**
- Modify: `app/test/streammonsters-egg-shelf-portrait-reliability.test.js`
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js`

**Interfaces:**
- Consumes: egg stages with `displayName`, ownership state, and command-reference providers.
- Produces: `[data-egg-command]` text in the form `@Owner · !command` for ready, stealable, and reserved compact cards.

- [ ] **Step 1: Write the failing test**

Add a JSDOM test that renders ready, stealable, and reserved eggs at portrait width and expects the compact command line to contain, respectively, `@Ready Owner · !hatch`, `@Original Owner · !steal`, and `@Mira · !adopt`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js test/streammonsters-egg-shelf-portrait-reliability.test.js --runInBand`

Expected: FAIL because the compact command line currently contains only `!hatch`, `!steal`, or `!adopt`.

- [ ] **Step 3: Write minimal implementation**

In `updateEggCardMetadata`, derive a one-line compact command label from the current safe owner and the existing selected action. For egg cards that have a viewer-facing action, set the command text to `@${owner-without-leading-at} · ${action}`. Keep timer and status generation unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js test/streammonsters-egg-shelf-portrait-reliability.test.js --runInBand`

Expected: PASS with the action, owner, and timer all present.

- [ ] **Step 5: Run focused regression checks**

Run: `cd app && ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js test/streammonsters-egg-shelf-portrait-reliability.test.js test/streammonsters-egg-stage-animation-v111.test.js --runInBand && npx eslint plugins/streamalchemy/streammonsters-egg-stage-view.js test/streammonsters-egg-shelf-portrait-reliability.test.js`

Expected: all selected tests and lint pass.
