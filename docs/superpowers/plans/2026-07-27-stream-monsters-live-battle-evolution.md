# Stream Monsters Rules v7 Live Battle & Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Specials charge at 5 percent per second during skill windows, explain both monsters' skills in the portrait overlay, explain Elemental Hour, and turn evolution into balanced, visible combat progression.

**Architecture:** Rules v7 adds a durable action-window timestamp and derives passive charge server-side without periodic database writes. A stage-aware catalog resolver and idempotent evolution-grant ledger feed immutable match snapshots; public projections carry only safe skill presentation. The overlay renders those projections with localized choice cards and a dedicated evolution-stat animation.

**Tech Stack:** Node.js 22, CommonJS, better-sqlite3, Jest/jsdom, static HTML/CSS/JavaScript, Socket.IO, existing Stream Monsters arena/effects runtime.

## Global Constraints

- Work only in `C:\Users\logga\Documents\ltth_codex\wt_streammonsters_live_polish` on `codex/streammonsters-live-battle-polish`.
- Do not edit or reload the running `main` checkout or port-3000 runtime while TikTok is connected.
- New matches use Rules v7; stored Rules v5/v6 matches and replays remain compatible.
- Passive charge is exactly 5 points per completed second of an active choice window and supplements all current charge gains.
- A premature `C` does not lock the fighter and can be retried.
- Never reveal a sealed choice until both fighters have locked.
- Evolution Stage II and III each grant exactly three deterministic persistent stat points.
- Evolution never receives a direct gift-only combat bonus; matchmaking includes effective combat power.
- All new visible copy exists in German, English, Spanish, and French with matching placeholders.
- Use the bundled `runtime\node\node.exe` for focused Jest runs.
- Follow red-green-refactor: every production behavior starts with a failing test that is run and observed.

---

### Task 1: Server-authoritative passive Special charge

**Files:**
- Create: `app/plugins/streamalchemy/backend/streammonsters/battle-charge.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-rules-v5.js`
- Test: `app/test/streammonsters-battle-match-v5.test.js`
- Test: `app/test/streammonsters-battle-rules-v6.test.js`
- Test: `app/test/streammonsters-sealed-battle-hints-v6.test.js`

**Interfaces:**
- Produces: `PASSIVE_CHARGE_PER_SECOND = 5`.
- Produces: `projectPassiveCharge({ baseCharge, openedAtMs, deadlineMs, asOfMs, ratePerSecond? }) -> number`.
- Produces: Rules-v7 decisions with nullable `charge_at_choice` and matches with nullable `action_opened_at_ms`.
- Produces: choice-open public metadata `chargeWindow: { openedAtMs, deadlineMs, passivePerSecond }`.
- Consumes: existing participant `combat_state_json`, `action_deadline_ms`, decision uniqueness, and Rules-v5/v6 resolver.

- [ ] **Step 1: Write pure charge projection tests**

```js
const {
  PASSIVE_CHARGE_PER_SECOND,
  projectPassiveCharge
} = require('../plugins/streamalchemy/backend/streammonsters/battle-charge');

test('adds five charge per completed active-window second and caps at 100', () => {
  expect(PASSIVE_CHARGE_PER_SECOND).toBe(5);
  expect(projectPassiveCharge({
    baseCharge: 70,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 1_999
  })).toBe(70);
  expect(projectPassiveCharge({
    baseCharge: 70,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 4_100
  })).toBe(85);
  expect(projectPassiveCharge({
    baseCharge: 95,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 9_000
  })).toBe(100);
});
```

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

Run:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-battle-match-v5.test.js --runInBand
```

Expected: FAIL because `battle-charge.js` does not exist.

- [ ] **Step 3: Implement the pure projector without wall-clock access**

```js
const PASSIVE_CHARGE_PER_SECOND = 5;

function projectPassiveCharge({
  baseCharge,
  openedAtMs,
  deadlineMs,
  asOfMs,
  ratePerSecond = PASSIVE_CHARGE_PER_SECOND
}) {
  const opened = Number(openedAtMs) || 0;
  const deadline = Math.max(opened, Number(deadlineMs) || opened);
  const observed = Math.max(opened, Math.min(deadline, Number(asOfMs) || opened));
  const seconds = Math.floor((observed - opened) / 1_000);
  return Math.min(100, Math.max(0, Number(baseCharge) || 0) +
    (seconds * Math.max(0, Number(ratePerSecond) || 0)));
}

module.exports = { PASSIVE_CHARGE_PER_SECOND, projectPassiveCharge };
```

- [ ] **Step 4: Add failing database and match-boundary tests**

Cover:

```js
test('Rules v7 rejects early C without a lock and accepts it at the first full tick', () => {
  const { service, advance, decisions } = createReservedRulesV7Match({
    chargeA: 95,
    openedAtMs: 10_000
  });
  advance(999);
  expect(service.submitChoice({ userId: 'viewer-a', choice: 'C' }))
    .toEqual(expect.objectContaining({ handled: false, reason: 'special_not_charged' }));
  expect(decisions()).toHaveLength(0);
  advance(1);
  expect(service.submitChoice({ userId: 'viewer-a', choice: 'C' }))
    .toEqual(expect.objectContaining({ handled: true }));
  expect(decisions()).toHaveLength(1);
});
```

Also prove: both fighters materialize charge at the second-lock timestamp; a
late sweep uses the stored deadline; recreating `BattleMatchService` mid-window
does not double charge; v5/v6 fixture output remains unchanged.

- [ ] **Step 5: Run the focused suites and observe expected assertion failures**

Run:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-battle-match-v5.test.js test\streammonsters-battle-rules-v6.test.js test\streammonsters-sealed-battle-hints-v6.test.js --runInBand
```

Expected: FAIL on missing Rules-v7 timestamp, early-C rejection, and persisted
charge audit fields.

- [ ] **Step 6: Add additive schema and Rules-v7 materialization**

Add:

```sql
ALTER-compatible columns through ensureColumn:
streammonsters_matches.action_opened_at_ms INTEGER
streammonsters_match_decisions.charge_at_choice INTEGER
```

Update `BattleMatchService` so `rulesVersion` preserves 7, both action-window
entry paths persist `action_opened_at_ms`, choice validation projects current
charge before inserting, timeout selection projects deadline charge, and
round resolution materializes both states exactly once. Store
`chargeWindow` in each Rules-v7 action. Keep `battle-rules-v5.js` free of
`Date.now()` and preserve the input Rules version in its result.

- [ ] **Step 7: Verify green and commit**

Run the three suites from Step 5, then:

```powershell
git diff --check
git add app/plugins/streamalchemy/backend/streammonsters/battle-charge.js app/plugins/streamalchemy/backend/streammonsters/database.js app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js app/plugins/streamalchemy/backend/streammonsters/battle-rules-v5.js app/test/streammonsters-battle-match-v5.test.js app/test/streammonsters-battle-rules-v6.test.js app/test/streammonsters-sealed-battle-hints-v6.test.js
git commit -m "feat(streammonsters): add passive special charge"
```

### Task 2: Combat evolution, staged skills, and power matchmaking

**Files:**
- Create: `app/plugins/streamalchemy/backend/streammonsters/evolution-rules.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/catalog.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/collection-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-rules-v5.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-simulator.js`
- Test: `app/test/streammonsters-collection-v15.test.js`
- Test: `app/test/streammonsters-battle-rules-v6.test.js`
- Test: `app/test/streammonsters-battle-match-v5.test.js`
- Test: `app/test/streammonsters-battle-simulator.test.js`

**Interfaces:**
- Produces: `evolutionStatGrant(element, stage) -> { vitality, might, guard, agility }`.
- Produces: `applyEvolutionGrant(stats, element, stage) -> stats`.
- Produces: `effectiveCombatPower(monster) -> integer`.
- Produces: `resolveStageSkill(templateId, choice, stage, rulesVersion) -> frozen skill`.
- Produces: `streammonsters_evolution_grants(monster_id, stage, stats_json, created_at_ms)`.
- Consumes: Task 1 Rules-v7 match creation/snapshots and existing V6 skill catalog.

- [ ] **Step 1: Write failing fixed-grant and idempotence tests**

```js
test('Stage II and III each grant exactly three element stats once', () => {
  const before = store.getMonster('monster-a').stats;
  const stageTwo = collection.evolveMonster('viewer-a', 'monster-a');
  expect(stageTwo.statChanges).toEqual({ vitality: 0, might: 2, guard: 0, agility: 1 });
  expect(sum(stageTwo.monster.stats) - sum(before)).toBe(3);

  expect(() => collection.evolveMonster('viewer-a', 'monster-a'))
    .toThrow('STREAM_MONSTERS_EVOLUTION_MASTERY_REQUIRED');
  expect(sum(store.getMonster('monster-a').stats) - sum(before)).toBe(3);
});
```

Add migration fixtures for pre-existing Stage-II/III rows and run database
initialization twice to prove exactly one grant per stage.

- [ ] **Step 2: Run the collection test and observe missing combat grants**

Run:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-collection-v15.test.js --runInBand
```

Expected: FAIL because evolution currently changes only visual/stage fields.

- [ ] **Step 3: Implement evolution rules and transactional ledger**

Use the exact profiles from the design. Create the grant table with primary key
`(monster_id, stage)`. Add a store method that inserts the ledger row and only
when inserted updates `stats_json`. Apply missing historical grants during
additive migration. Return `statsBefore`, `statsAfter`, `statChanges`, and the
unlocked stage skill from `evolveMonster()`.

- [ ] **Step 4: Write failing stage-skill and replay-compatibility tests**

```js
test.each(TEMPLATE_CATALOG.map(entry => [entry.templateId, entry.role]))(
  '%s receives only its role-appropriate Stage-II upgrade and Stage-III Special',
  (templateId, role) => {
    const base = ['A', 'B', 'C'].map(choice =>
      resolveStageSkill(templateId, choice, 1, 7));
    const stageTwo = ['A', 'B', 'C'].map(choice =>
      resolveStageSkill(templateId, choice, 2, 7));
    const stageThree = ['A', 'B', 'C'].map(choice =>
      resolveStageSkill(templateId, choice, 3, 7));
    const upgradedChoice = ['striker', 'trickster'].includes(role) ? 'A' : 'B';
    expect(stageTwo.find(skill => skill.choice === upgradedChoice).id)
      .not.toBe(base.find(skill => skill.choice === upgradedChoice).id);
    expect(stageThree.find(skill => skill.choice === 'C').id)
      .not.toBe(stageTwo.find(skill => skill.choice === 'C').id);
  }
);
```

Also assert that a stored Rules-v6 fixture resolves byte-for-byte as before and
that resolved skill objects do not mutate `V6_SKILL_CATALOG`.

- [ ] **Step 5: Implement stage-aware bounded skill resolution**

Build Rules-v7 skills as immutable overlays over V6:

- Striker/Trickster Stage II: Attack primary budget +1.
- Guardian Stage II: Defense shield budget +1.
- Sustain Stage II: Defense healing budget +1.
- Stage III: Special primary/secondary combined budget increase at most +2.
- Keep `choice`, element, VFX family, and `chargeRequired: 100`.
- Add stable stage IDs, localized-name/effect keys, and `evolutionStage`.

Route only Rules-v7 battles through `resolveStageSkill`.

- [ ] **Step 6: Write failing effective-power matchmaking tests**

Prove queue reservation and roster swapping use the same score:

```js
expect(effectiveCombatPower(stageThree)).toBeGreaterThan(effectiveCombatPower(stageOne));
expect(matchService.reserveBestMatch('stage-one-viewer')).toBeNull();
advance(30_000);
expect(matchService.reserveBestMatch('stage-one-viewer')).toEqual(
  expect.objectContaining({ rulesVersion: 7 })
);
expect(matchService.lockRoster({
  userId: 'stage-one-viewer',
  monsterId: 'stronger-unqueued-monster'
})).toEqual(expect.objectContaining({ accepted: false, reason: 'monster_out_of_power_range' }));
```

- [ ] **Step 7: Implement effective-power snapshot and widening**

Use `level`, the sum of four persistent stats, and a small fixed skill-tier
weight. Persist queued/locked power and the admitted gap using additive columns.
Keep Elo, the ten-ranked-battles daily cap, level checks, and rematch avoidance.

- [ ] **Step 8: Extend and run the balance simulator**

Cover all templates at Stages I/II/III, representative Levels 1/5/10/15/20,
mirrored seeds, and legal A/B/C sequences. Same-stage neutral matchups retain
the current target. Cross-stage win rates must increase monotonically without
exceeding the admitted effective-power window.

Run:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-collection-v15.test.js test\streammonsters-battle-rules-v6.test.js test\streammonsters-battle-match-v5.test.js test\streammonsters-battle-simulator.test.js --runInBand
```

- [ ] **Step 9: Verify green and commit**

```powershell
git diff --check
git add app/plugins/streamalchemy/backend/streammonsters/evolution-rules.js app/plugins/streamalchemy/backend/streammonsters/catalog.js app/plugins/streamalchemy/backend/streammonsters/database.js app/plugins/streamalchemy/backend/streammonsters/collection-service.js app/plugins/streamalchemy/backend/streammonsters/battle-rules-v5.js app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js app/plugins/streamalchemy/backend/streammonsters/battle-simulator.js app/test/streammonsters-collection-v15.test.js app/test/streammonsters-battle-rules-v6.test.js app/test/streammonsters-battle-match-v5.test.js app/test/streammonsters-battle-simulator.test.js
git commit -m "feat(streammonsters): make evolution combat-ready"
```

### Task 3: Public skill contract and portrait choice board

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/public-event-projector.js`
- Modify: `app/plugins/streamalchemy/streammonsters-arena-view.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Test: `app/test/streammonsters-battle-match-v5.test.js`
- Test: `app/test/streammonsters-sealed-battle-hints-v6.test.js`
- Test: `app/test/streammonsters-arena-view-v15.test.js`
- Test: `app/test/streammonsters-arcade-overlay-v6.test.js`

**Interfaces:**
- Consumes: Task 1 `chargeWindow` and Task 2 `resolveStageSkill`.
- Produces: safe fighter `skills` arrays and charge projection fields in live,
  reconnect, and replay projections.
- Produces: portrait/landscape skill-board DOM with simultaneous reveal.

- [ ] **Step 1: Write a failing safe public-payload test**

```js
expect(choiceOpened.publicPayload.fighters[0]).toEqual(expect.objectContaining({
  skills: expect.arrayContaining([
    expect.objectContaining({
      choice: 'A',
      icon: expect.any(String),
      nameKey: expect.any(String),
      shortTextKey: expect.any(String),
      available: true
    }),
    expect.objectContaining({
      choice: 'C',
      chargeRequired: 100,
      readyAtMs: expect.any(Number)
    })
  ])
}));
expect(JSON.stringify(choiceOpened.publicPayload)).not.toMatch(
  /participantId|viewerId|providerEventId|requestedChoice|charge_at_choice/
);
```

- [ ] **Step 2: Run match/sealed suites and observe missing skill metadata**

Run:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-battle-match-v5.test.js test\streammonsters-sealed-battle-hints-v6.test.js --runInBand
```

- [ ] **Step 3: Add one safe projection path**

Project catalog presentation from the immutable roster snapshot. Reuse it for
choice-open events, public state, stored-event sanitization, and replay. Do not
put a selected choice into `battle_choice_locked`; emit only slot, locked,
source, round, and deadline until `battle_choices_revealed`.

- [ ] **Step 4: Write failing arena-view tests**

Create DOM fixtures for both fighter skill decks and assert:

```js
view.openChoice(choiceOpened);
expect(document.querySelector('[data-slot="1"] [data-skill="A"] .skill-name').textContent)
  .toContain('Ashfang');
expect(document.querySelector('[data-slot="1"] [data-skill="C"]').classList)
  .toContain('charging');
clock.advance(1_000);
view.renderCountdown();
expect(document.querySelector('[data-slot="1"] [data-skill="C"] .skill-charge').textContent)
  .toContain('100%');
view.lockChoice({ decision: { slot: 1, locked: true } });
expect(document.querySelector('#arena-fighter-1').dataset.choice).toBeUndefined();
```

- [ ] **Step 5: Implement the portrait-first choice board**

Add two skill-deck containers with three rows each. Localize `nameKey` and
`shortTextKey`, animate charge from server timestamps in the existing 250-ms
countdown loop, mark C ready at 100, show sealed lock without storing the
choice in DOM, and highlight both choices only in `revealChoices()`. Keep all
cards above the 26-percent TikTok chat safe zone and add responsive landscape
CSS plus Reduced Motion behavior.

- [ ] **Step 6: Run overlay suites and commit**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-battle-match-v5.test.js test\streammonsters-sealed-battle-hints-v6.test.js test\streammonsters-arena-view-v15.test.js test\streammonsters-arcade-overlay-v6.test.js --runInBand
git diff --check
git add app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js app/plugins/streamalchemy/backend/streammonsters/public-event-projector.js app/plugins/streamalchemy/streammonsters-arena-view.js app/plugins/streamalchemy/streammonsters-overlay.html app/test/streammonsters-battle-match-v5.test.js app/test/streammonsters-sealed-battle-hints-v6.test.js app/test/streammonsters-arena-view-v15.test.js app/test/streammonsters-arcade-overlay-v6.test.js
git commit -m "feat(streammonsters): explain live battle skills"
```

### Task 4: Elemental Hour explanation and animated evolution stats

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/public-event-projector.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/plugins/streamalchemy/streammonsters-arena-director.js`
- Test: `app/test/streammonsters-overlay-chat-v15.test.js`
- Test: `app/test/streammonsters-arcade-overlay-v6.test.js`
- Test: `app/test/streammonsters-overlay-critical-queue-v15.test.js`

**Interfaces:**
- Consumes: Task 2 `monster_evolved` stats/skill payload.
- Produces: dedicated evolution presentation and readable Elemental Hour card.

- [ ] **Step 1: Write failing presentation tests**

Assert the Elemental Hour card includes the element, 30-second reduction,
`+10 Hype`, and no-stat-advantage copy. Assert `monster_evolved` renders the
monster image plus four rows with before/after values and the unlocked skill.

- [ ] **Step 2: Run overlay tests and observe current generic-card failures**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-overlay-chat-v15.test.js test\streammonsters-arcade-overlay-v6.test.js test\streammonsters-overlay-critical-queue-v15.test.js --runInBand
```

- [ ] **Step 3: Implement the Elemental Hour card**

Replace the short toast with a normal upper-gameplay card of at least eight
seconds. Keep it noncritical relative to battle/hatch sequences, name the
element, and explain the exact existing incubation/Hype effects.

- [ ] **Step 4: Implement evolution bars and skill reveal**

Extend the card markup with an evolution-only stats panel. Reset it for all
other card types. On `monster_evolved`, render Vitality/Strength/Defense/Agility
from `statsBefore` to `statsAfter`, set CSS custom properties for bar widths,
and trigger the transition after the monster reveal. Show `+N` beside changed
rows, then reveal the staged skill icon/name/effect. Reduced Motion renders
the final values immediately.

- [ ] **Step 5: Verify green and commit**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-overlay-chat-v15.test.js test\streammonsters-arcade-overlay-v6.test.js test\streammonsters-overlay-critical-queue-v15.test.js --runInBand
git diff --check
git add app/plugins/streamalchemy/backend/streammonsters/public-event-projector.js app/plugins/streamalchemy/streammonsters-overlay.html app/plugins/streamalchemy/streammonsters-arena-director.js app/test/streammonsters-overlay-chat-v15.test.js app/test/streammonsters-arcade-overlay-v6.test.js app/test/streammonsters-overlay-critical-queue-v15.test.js
git commit -m "feat(streammonsters): animate evolution progress"
```

### Task 5: Complete four-language battle/evolution surface

**Files:**
- Modify: `app/plugins/streamalchemy/locales/de.json`
- Modify: `app/plugins/streamalchemy/locales/en.json`
- Modify: `app/plugins/streamalchemy/locales/es.json`
- Modify: `app/plugins/streamalchemy/locales/fr.json`
- Modify: `scripts/lib/plugin-i18n-audit.js`
- Test: `app/test/streammonsters-arena-view-v15.test.js`
- Test: `app/test/streamalchemy-ui-i18n.test.js`
- Test: `app/test/i18n-consistency.test.js`

**Interfaces:**
- Consumes: Task 2 skill keys and Tasks 3–4 visible strings.
- Produces: identical locale key and placeholder contracts for DE/EN/ES/FR.

- [ ] **Step 1: Write failing locale and placeholder tests**

Flatten all four locale namespaces and assert:

```js
expect(Object.keys(locale.de).sort()).toEqual(Object.keys(locale.en).sort());
expect(placeholders(locale.de[key])).toEqual(placeholders(locale.en[key]));
expect(placeholders(locale.es[key])).toEqual(placeholders(locale.en[key]));
expect(placeholders(locale.fr[key])).toEqual(placeholders(locale.en[key]));
```

Require every Rules-v7 `nameKey` and `shortTextKey` from every template/stage to
resolve to a nonempty value in every locale.

- [ ] **Step 2: Run i18n tests and observe missing Rules-v7 copy**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-arena-view-v15.test.js test\streamalchemy-ui-i18n.test.js test\i18n-consistency.test.js --runInBand
```

- [ ] **Step 3: Add complete translated copy**

Translate skill names/effects, `Special ready`, `Special ready in {seconds}`,
Elemental Hour explanation, stat labels/deltas, evolution-stage title, and
unlocked-skill text in German, English, Spanish, and French. Keep monster names
canonical and preserve identical placeholders.

- [ ] **Step 4: Extend the shared audit and verify green**

Add placeholder-set comparison to `plugin-i18n-audit.js`, then run:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test\streammonsters-arena-view-v15.test.js test\streamalchemy-ui-i18n.test.js test\i18n-consistency.test.js --runInBand
npm run i18n:check
```

- [ ] **Step 5: Commit**

```powershell
git diff --check
git add app/plugins/streamalchemy/locales/de.json app/plugins/streamalchemy/locales/en.json app/plugins/streamalchemy/locales/es.json app/plugins/streamalchemy/locales/fr.json scripts/lib/plugin-i18n-audit.js app/test/streammonsters-arena-view-v15.test.js app/test/streamalchemy-ui-i18n.test.js app/test/i18n-consistency.test.js
git commit -m "feat(streammonsters): localize Rules v7"
```

### Task 6: Integrated verification and branch handoff

**Files:**
- Modify only if a failing focused regression requires a test-first fix.

**Interfaces:**
- Consumes: Tasks 1–5 commits.
- Produces: review evidence and a clean feature branch; no live runtime mutation.

- [ ] **Step 1: Run the focused Stream Monsters/GCCE gate**

Discover the same focused suite list used by the current release gate and run
it with bundled Node 22 / ABI 127. Include every test modified by Tasks 1–5.

- [ ] **Step 2: Run static verification**

```powershell
npm run lint -- --quiet
npm run build:css
npm run i18n:check
git diff --check origin/main...HEAD
git status --short --branch
```

- [ ] **Step 3: Run a time-bounded broader Jest collection**

Use bundled Node 22 and report any unrelated baseline timeout/failure
separately. Do not convert a partial run into a full-green claim.

- [ ] **Step 4: Perform final code review**

Review every requirement from the design against `origin/main...HEAD`, with
special attention to sealed choice leakage, reload charge determinism,
evolution-grant idempotence, historical replay compatibility, public payload
privacy, portrait safe zones, and locale placeholder parity.

- [ ] **Step 5: Record the verified branch state**

```powershell
git status --short --branch
git log --oneline origin/main..HEAD
git rev-parse HEAD
```

Do not merge, push, reload, or restart. Hand the verified branch and remaining
manual OBS/live checks back to the root agent.
