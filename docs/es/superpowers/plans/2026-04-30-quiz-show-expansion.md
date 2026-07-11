# Quiz Show Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved quiz-show expansion as one coordinated work block.

**Architecture:** Add small helper methods inside the existing plugin class and keep persistence in SQLite plus the plugin data directory. Extend the dashboard and overlay incrementally through existing route/socket/HUD patterns instead of replacing the plugin shell.

**Tech Stack:** Node.js CommonJS, Express-style plugin routes, Socket.IO events, better-sqlite3, vanilla browser JavaScript, CSS, Jest.

---

## File Structure

- Modify `app/plugins/quiz-show/main.js`: configuration, schema migrations, routes, chat handling, voting, playlists, duel mode, achievements, seasons, health, setup, sounds.
- Modify `app/plugins/quiz-show/quiz_show.html`: dashboard tabs/panels and controls for voting, shows, duel, sounds, achievements, seasons, health, setup.
- Modify `app/plugins/quiz-show/quiz_show.js`: client state, fetch helpers, event handlers, renderers, save actions.
- Modify `app/plugins/quiz-show/quiz_show_overlay.html`: voting, duel, achievement, and health/test overlay containers.
- Modify `app/plugins/quiz-show/quiz_show_overlay.js`: overlay socket handlers and renderers.
- Modify `app/plugins/quiz-show/quiz_show_overlay.css`: theme presets, accessibility, voting, duel, achievement, and avatar performance styles.
- Modify `app/plugins/quiz-show/quiz_show.css`: admin panels and form/table styles.
- Modify `app/plugins/quiz-show/plugin.json`: fix visible encoding and feature list.
- Add `app/test/quiz-show-expansion.test.js`: focused regression tests for new helper behavior.

## Tasks

### Task 1: Regression Tests

**Files:**
- Add: `app/test/quiz-show-expansion.test.js`

- [ ] **Step 1: Write failing tests**

Create tests that instantiate the plugin with a minimal API stub and exercise pure helper behavior:

```javascript
const QuizShowPlugin = require('../plugins/quiz-show/main');

function createPlugin() {
  const api = {
    log: jest.fn(),
    emit: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => ({ db: {}, getSetting: jest.fn() })),
    getPluginDataDir: jest.fn(() => __dirname)
  };
  return new QuizShowPlugin(api);
}

test('question cooldown window uses configured hours', () => {
  const plugin = createPlugin();
  plugin.config.questionCooldownHours = 3;
  expect(plugin.getQuestionCooldownMs()).toBe(3 * 60 * 60 * 1000);
});

test('category vote parser accepts command votes', () => {
  const plugin = createPlugin();
  plugin.startCategoryVote(['Sport', 'Musik'], 10);
  expect(plugin.recordCategoryVote({ userId: 'u1', username: 'Ana', message: '!vote sport' })).toBe(true);
  expect(plugin.gameState.categoryVote.votesByCategory.Sport).toBe(1);
});

test('duel scoring awards matching side and streak', () => {
  const plugin = createPlugin();
  plugin.startDuel({ leftLabel: 'Team A', rightLabel: 'Team B', leftUsers: ['u1'], rightUsers: ['u2'] });
  plugin.applyDuelAnswerResult('u1', true, 100);
  expect(plugin.gameState.duel.left.score).toBe(100);
  expect(plugin.gameState.duel.left.streak).toBe(1);
  expect(plugin.gameState.duel.right.score).toBe(0);
});

test('achievement rules award first correct answer', () => {
  const plugin = createPlugin();
  const awards = plugin.evaluateAchievements({
    userId: 'u1',
    username: 'Ana',
    isFirstCorrect: true,
    streak: 1,
    categoryCorrectCount: 1,
    duelWinner: false
  });
  expect(awards.map(a => a.id)).toContain('fastest-answer');
});

test('health payload exposes setup and inventory state', () => {
  const plugin = createPlugin();
  plugin.db = { prepare: jest.fn(() => ({ get: jest.fn(() => ({ count: 0 })), all: jest.fn(() => []) })) };
  const health = plugin.buildHealthPayload();
  expect(health.success).toBe(true);
  expect(health.checks.database.status).toBe('ok');
  expect(health.inventory.questions).toBe(0);
});
```

- [ ] **Step 2: Verify red**

Run: `cd app && npx jest test/quiz-show-expansion.test.js --runInBand`

Expected: tests fail because the new helpers do not exist.

### Task 2: Backend Schema And Helpers

**Files:**
- Modify: `app/plugins/quiz-show/main.js`

- [ ] **Step 1: Add config and state fields**

Add `questionCooldownHours`, `categoryVotingEnabled`, `categoryVoteDuration`, `activeShowId`, `achievementPopupsEnabled`, `seasonAutomationMode`, `seasonAutomationDay`, `setupWizardCompleted`, `avatarPerformanceMode`, `avatarCacheEnabled`, `reducedMotion`, and `highContrast`.

- [ ] **Step 2: Add database tables**

Create tables for `quiz_shows`, `category_vote_sessions`, `achievement_rules`, `user_achievements`, `sound_assets`, `season_automation_config`, and `setup_wizard_state` in `initDatabase()`.

- [ ] **Step 3: Implement helper methods**

Implement `getQuestionCooldownMs()`, `startCategoryVote()`, `recordCategoryVote()`, `finishCategoryVote()`, `startDuel()`, `applyDuelAnswerResult()`, `evaluateAchievements()`, `buildHealthPayload()`, `isAllowedSoundFileName()`, and `checkSeasonAutomation()`.

- [ ] **Step 4: Verify green for helper tests**

Run: `cd app && npx jest test/quiz-show-expansion.test.js --runInBand`

Expected: helper tests pass.

### Task 3: Backend Routes And Chat Flow

**Files:**
- Modify: `app/plugins/quiz-show/main.js`

- [ ] **Step 1: Add routes**

Add routes for:

```text
GET/POST /api/quiz-show/question-cooldown
GET/POST /api/quiz-show/shows
GET/PUT/DELETE /api/quiz-show/shows/:id
POST /api/quiz-show/category-vote/start
POST /api/quiz-show/category-vote/finish
GET /api/quiz-show/category-vote
POST /api/quiz-show/duel/start
POST /api/quiz-show/duel/stop
GET /api/quiz-show/achievements
POST /api/quiz-show/achievements/rules
GET/POST /api/quiz-show/season-automation
GET /api/quiz-show/health
GET/POST /api/quiz-show/setup-wizard
GET/POST/DELETE /api/quiz-show/sounds
POST /api/quiz-show/sounds/test
```

- [ ] **Step 2: Integrate chat voting**

In chat handling, process `!vote <category>` or numeric category votes before answer handling when a category vote is active.

- [ ] **Step 3: Integrate duel and achievements**

During answer result processing, update duel score and evaluate achievements for correct answers.

### Task 4: Admin UI

**Files:**
- Modify: `app/plugins/quiz-show/quiz_show.html`
- Modify: `app/plugins/quiz-show/quiz_show.js`
- Modify: `app/plugins/quiz-show/quiz_show.css`

- [ ] **Step 1: Add controls**

Add panels for cooldown, shows, voting, duel, sound upload, achievements, season automation, health, and setup wizard.

- [ ] **Step 2: Add client logic**

Add fetch/render/save functions and socket listeners for vote updates, duel updates, achievements, and health refresh.

- [ ] **Step 3: Add admin styling**

Style the new panels using the existing dark dashboard system, compact tables, and responsive grids.

### Task 5: Overlay UI

**Files:**
- Modify: `app/plugins/quiz-show/quiz_show_overlay.html`
- Modify: `app/plugins/quiz-show/quiz_show_overlay.js`
- Modify: `app/plugins/quiz-show/quiz_show_overlay.css`

- [ ] **Step 1: Add overlay containers**

Add category voting, duel status, achievement popup, and setup/health test containers.

- [ ] **Step 2: Add renderers**

Add socket handlers for `quiz-show:category-vote-update`, `quiz-show:category-vote-ended`, `quiz-show:duel-update`, and `quiz-show:achievement-unlocked`.

- [ ] **Step 3: Add themes and accessibility**

Map theme presets, `reducedMotion`, `highContrast`, and avatar performance classes to CSS.

### Task 6: Encoding, Manifest, And Docs

**Files:**
- Modify: `app/plugins/quiz-show/plugin.json`
- Modify: `app/plugins/quiz-show/README.md`

- [ ] **Step 1: Fix visible encoding**

Correct broken German characters in touched metadata and user-facing plugin docs.

- [ ] **Step 2: Document new commands**

Document `!vote`, duel mode, sound upload, setup wizard, health panel, and season automation.

### Task 7: Verification

**Files:**
- Existing test/build config only.

- [ ] **Step 1: Run focused tests**

Run: `cd app && npx jest test/quiz-show-expansion.test.js test/quiz-question-selection.test.js test/quiz-slot-machine-mode.test.js --runInBand`

- [ ] **Step 2: Run CSS build**

Run: `cd app && npm run build:css`

- [ ] **Step 3: Run lint**

Run: `cd app && npm run lint -- --quiet`

The known snapshot has unrelated Jest failures. Report exact focused test, CSS, and lint status.
