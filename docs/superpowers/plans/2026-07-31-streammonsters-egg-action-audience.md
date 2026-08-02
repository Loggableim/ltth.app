# Stream Monsters Egg Action Audience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Label every compact egg-rail action with its eligible chat audience.

**Architecture:** `updateEggCardMetadata` is the only renderer that writes the compact card action line. It derives the audience from the existing egg state predicates, without changing any command or persistence logic. The existing shelf reliability test renders cards through the same view implementation.

**Tech Stack:** CommonJS, browser DOM test doubles, Jest.

## Global Constraints

- Change only StreamAlchemy egg-rail presentation.
- Private actions use `@<viewer>`; public actions use `@everyone`.
- Do not restart the LTTH app; reload only StreamAlchemy after verification.
- Do not commit or push unless the user requests publication.

---

### Task 1: Render the action audience

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js:833-857`
- Test: `app/test/streammonsters-egg-shelf-portrait-reliability.test.js`

**Interfaces:**
- Consumes: `isStealableEgg(egg)`, `isPublicFreeEgg(egg)`, `getHatchReference()`, `getAdoptReference()`, and `getStealReference()`.
- Produces: the `data-egg-command` compact-card line in `updateEggCardMetadata(item, egg)`.

- [ ] **Step 1: Write the failing test**

```js
expect(cardText).toContain('@Ready Owner \\u00b7 !hatch');
expect(cardText).toContain('@Mira \\u00b7 !adopt');
expect(cardText).toContain('@everyone \\u00b7 !adopt');
expect(cardText).toContain('@everyone \\u00b7 !steal');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app; npm test -- --runInBand test/streammonsters-egg-shelf-portrait-reliability.test.js`

Expected: the public egg assertions fail because the view currently interpolates the source owner's name.

- [ ] **Step 3: Write minimal implementation**

```js
const actionAudience = isPublicAdoptableEgg(egg)
  ? 'everyone'
  : owner.replace(/^@+/, '');
const command = action ? `@${actionAudience} \\u00b7 ${action}` : action;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app; npm test -- --runInBand test/streammonsters-egg-shelf-portrait-reliability.test.js`

Expected: all assertions in the suite pass.

- [ ] **Step 5: Lint and reload the single plugin**

Run: `cd app; npx eslint plugins/streamalchemy/streammonsters-egg-stage-view.js test/streammonsters-egg-shelf-portrait-reliability.test.js`

Then: `POST http://127.0.0.1:3000/api/plugins/streamalchemy/reload`

Expected: ESLint exits 0 and the reload response reports success.
