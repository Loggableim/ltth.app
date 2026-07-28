# Stream Monsters KO Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Stream Monsters duel unambiguously readable: it continues until K.O., shows the current leader and action consequences, and ends with a player-first winner board containing the applied Arena Rating change.

**Architecture:** The backend resolver remains the sole authority for K.O., winner, final HP, and Elo. The match service removes its live three-round tie-break, carries a bounded terminal snapshot through the existing public completion event, and keeps legacy event fields intact. The arena view renders only public state: a non-authoritative lead strip, an action explainer, and a portrait-safe result board.

**Tech Stack:** CommonJS, bundled Node 22 / ABI 127, SQLite-backed Stream Monsters services, Jest, DOM arena-view tests, CSS/WebGPU-capable OBS browser overlay.

## Global Constraints

- A live fight ends only on the resolver's K.O. or explicit forfeit; visible HP, shield, animation timing, and the lead strip never select a winner.
- Remove only the live `roundNumber >= 3` tie-break path; retain historical replay behavior and the simulator's separate balance harness.
- Preserve stable plugin ID `streamalchemy`, existing socket names, old payload compatibility, and private data boundaries.
- Public events may contain a display-safe viewer name and redacted monster fields, never raw participant objects, numeric platform IDs, or private viewer fields.
- Place explanatory/result cards inside the upper 74 percent gameplay area in 9:16; keep the lower 26 percent TikTok chat safe zone clear.
- Canvas2D/CSS, WebGPU, and reduced-motion rendering consume the same public event timeline.
- Run native tests with `runtime\\node\\node.exe`; the main worktree's known JSDOM ESM bootstrap failure is environment evidence, not a product pass or failure.
- Do not reload or restart the running application while implementing or verifying this scope.

---

## File Map

- `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js` — live K.O. termination, public completion projection, and privacy boundary.
- `app/test/streammonsters-battle-match-v5.test.js` — live round progression, terminal snapshot, Elo, and privacy regressions.
- `app/plugins/streamalchemy/streammonsters-arena-view.js` — public state rendering, action explanation, and terminal result formatting.
- `app/plugins/streamalchemy/streammonsters-overlay.html` — arena DOM, locale mapping, and portrait/landscape-safe typography.
- `app/test/streammonsters-arena-view-v15.test.js` — deterministic DOM tests for leader, action card, and K.O. board.

### Task 1: End live matches only on K.O. and project its terminal snapshot

**Files:**

- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js` in `resolveRound`, `finalize`, and `projectPublicEvent`.
- Modify: `app/test/streammonsters-battle-match-v5.test.js` beside its match-resolution and `battle_completed` cases.

**Interfaces:**

- Consumes: `resolveInteractiveRound({ fighters, choices, seed, round, state, rulesVersion })`, which returns `{ terminal, winnerId, state }`.
- Produces this additive public completion shape while preserving existing fields:
  ```js
  {
    matchId: '...',
    winnerSlot: 1 | 2,
    winner: { slot, viewerName, name, element, templateId, evolutionStage },
    knockout: { round, remainingHp, maxHp } | null,
    terminalReason: 'knockout' | 'forfeit',
    completion: 'battle' | 'forfeit',
    ratingChanges: [{ slot, before, after, delta }]
  }
  ```

- [ ] **Step 1: Write the failing K.O.-only and terminal-payload tests**

  Add a round-three fixture whose two living monsters choose defense, then assert it advances to round four rather than emits a winner. Add a deterministic K.O. fixture with known ratings and assert the public event is display-safe:

  ```js
  await chooseRound(service, matchId, 3, 'B', 'B');
  expect(service.getMatch(matchId)).toEqual(expect.objectContaining({
    state: 'action',
    roundNumber: 4
  }));
  expect(publicEvents('streammonsters:battle_completed')).toHaveLength(0);

  expect(completedPublic).toEqual(expect.objectContaining({
    winnerSlot: 1,
    winner: expect.objectContaining({
      viewerName: '@arenaalpha',
      name: 'Ashfang',
      element: 'Ember'
    }),
    knockout: expect.objectContaining({
      round: expect.any(Number),
      remainingHp: 12,
      maxHp: 45
    }),
    terminalReason: 'knockout',
    completion: 'battle'
  }));
  expect(JSON.stringify(completedPublic)).not.toContain('1234567890123456789');
  ```

- [ ] **Step 2: Run the focused tests and confirm the current failures**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-battle-match-v5.test.js -t "continues live matches past round three|publishes a privacy-safe KO terminal snapshot"
  ```

  Expected: FAIL because `resolveRound` currently calls `tieBreakWinner` at round three and the public payload has neither `knockout` nor `terminalReason`.

- [ ] **Step 3: Make the resolver path K.O.-only**

  Replace the current terminal branch in `resolveRound` with a branch that fires only for the resolver's K.O. result. It must carry final state into `finalize` before the next-round update:

  ```js
  if (outcome.terminal) {
    const winnerState = outcome.state[outcome.winnerId] || {};
    return this.finalize(matchId, expectedVersion, outcome.winnerId, {
      completion: 'battle',
      terminalReason: 'knockout',
      knockout: {
        round: Math.max(1, Number(match.roundNumber) || 1),
        remainingHp: Math.max(0, Number(winnerState.hp) || 0),
        maxHp: Math.max(1, Number(winnerState.maxHp) || 1)
      }
    });
  }
  ```

  Do not call `tieBreakWinner` from the live `BattleMatchService` path. If both players keep choosing non-lethal actions, ordinary rounds and input windows continue; no hidden HP decision is introduced.

- [ ] **Step 4: Validate and project terminal data inside `finalize`**

  Normalize `options.knockout` once in `finalize`, include it in persisted `result_json`, the direct public `battle_completed` payload, and `projectPublicEvent`. Keep the existing flat `projectPublicMonster` / `sanitizePublicMonster` shape:

  ```js
  const terminalReason = options.terminalReason === 'knockout'
    ? 'knockout'
    : 'forfeit';
  const knockout = terminalReason === 'knockout'
    ? {
        round: Math.max(1, Math.round(Number(options.knockout?.round) || 1)),
        remainingHp: Math.max(0, Math.round(Number(options.knockout?.remainingHp) || 0)),
        maxHp: Math.max(1, Math.round(Number(options.knockout?.maxHp) || 1))
      }
    : null;
  ```

  In the public projector, accept only `terminalReason === 'knockout'` or `'forfeit'`, project `knockout` with the same numeric bounds, and preserve the existing `completion` value for legacy consumers.

- [ ] **Step 5: Run the service suite and commit**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-battle-match-v5.test.js
  git add app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js app/test/streammonsters-battle-match-v5.test.js
  git commit -m "fix(streammonsters): end live arena fights by KO"
  ```

  Expected: PASS, including old replay/Elo compatibility cases and the new no-tie-break assertion.

### Task 2: Render a presentation-only lead strip and explicit action card

**Files:**

- Modify: `app/plugins/streamalchemy/streammonsters-arena-view.js` in `renderState`, `applyMatch`, `playAction`, and `resetFighters`.
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html` around battle HUD markup, locale assembly, and arena CSS.
- Modify: `app/test/streammonsters-arena-view-v15.test.js` in its mounted overlay fixture and action tests.

**Interfaces:**

- Consumes public fighter snapshots `{ slot: 1|2, viewerName, hp, maxHp, shield, charge }` and public actions with `{ actorSlot, choice, skill, hits, outcomes, statusEffects }`.
- Produces:
  ```js
  renderLeadState() // writes #arena-lead using hp + shield only
  renderActionExplanation(action) // writes #arena-action-explainer using public action fields
  ```
  and these DOM nodes:
  ```html
  <section id="arena-lead" aria-live="polite"></section>
  <section id="arena-action-explainer" aria-live="polite"></section>
  ```

- [ ] **Step 1: Write the failing leader/action DOM test**

  Add a fixture with two public fighters and one public skill action:

  ```js
  view.applyMatch(matchWithFighters([
    { slot: 1, viewerName: '@arenaalpha', hp: 31, maxHp: 50, shield: 4 },
    { slot: 2, viewerName: '@betapup', hp: 18, maxHp: 50, shield: 0 }
  ]));
  expect(document.querySelector('#arena-lead').textContent).toContain('@arenaalpha');

  await view.playAction(publicAction({
    actorSlot: 1,
    targetSlot: 2,
    choice: 'A',
    skill: { name: 'Flammenhieb', shortText: 'Schaden und Brand.' },
    hits: [{ hpDamage: 9, shieldAbsorbed: 0, evaded: false }]
  }));
  const card = document.querySelector('#arena-action-explainer').textContent;
  expect(card).toContain('@arenaalpha');
  expect(card).toContain('A');
  expect(card).toContain('Flammenhieb');
  expect(card).toContain('9');
  ```

- [ ] **Step 2: Run the test and confirm it fails before the rendering exists**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-arena-view-v15.test.js -t "renders the current lead and action consequence"
  ```

  Expected: FAIL because the new HUD nodes and render functions have not been added. If collection stops at the documented `@exodus/bytes` ESM bootstrap failure, capture that exact error and run the same test from the compatible isolated dependency worktree against these source files.

- [ ] **Step 3: Add deterministic public-state rendering**

  Use the existing closure-local `stateBySlot` and return no battle decision from the new functions:

  ```js
  const visibleTotal = fighter => Math.max(0, numeric(fighter?.hp)) +
    Math.max(0, numeric(fighter?.shield));
  const left = stateBySlot.get(1) || {};
  const right = stateBySlot.get(2) || {};
  const leader = visibleTotal(left) === visibleTotal(right)
    ? null
    : (visibleTotal(left) > visibleTotal(right) ? left : right);
  setText('arena-lead', leader
    ? formatLabel('leadAhead', { name: leader.viewerName || leader.name })
    : labels.leadEven);
  ```

  Call `renderLeadState()` after `renderState` updates and after `resetFighters`. Build the action line from `action.choice`, `action.skill.name`, `action.skill.shortText`, the sum of `hits[*].hpDamage`, non-zero shield/heal outcomes, and `evaded` flags. Write it with `textContent`; never interpolate viewer data into `innerHTML`.

- [ ] **Step 4: Add portrait-safe structure and typography**

  Put both nodes inside `#battle` before the fighter cards. Add CSS that keeps explanatory UI above the chat zone and permits full skill text:

  ```css
  #arena-lead { position:absolute; top:8%; left:50%; z-index:25; transform:translateX(-50%); font-size:clamp(20px,3.8vw,42px); }
  #arena-action-explainer { position:absolute; top:16%; left:50%; z-index:25; width:min(88%,900px); transform:translateX(-50%); font-size:clamp(18px,3.2vw,34px); }
  .arena-skill-card .skill-name, .arena-skill-card .skill-copy { overflow:visible; text-overflow:clip; white-space:normal; }
  ```

  Add locale keys `leadAhead`, `leadEven`, `actionDamage`, `actionShield`, `actionHeal`, and `actionEvaded` in German, English, Spanish, and French.

- [ ] **Step 5: Run the focused DOM suite and commit**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-arena-view-v15.test.js
  git add app/plugins/streamalchemy/streammonsters-arena-view.js app/plugins/streamalchemy/streammonsters-overlay.html app/test/streammonsters-arena-view-v15.test.js
  git commit -m "feat(streammonsters): explain arena lead and actions"
  ```

  Expected: PASS in a compatible JSDOM dependency environment; record the isolated-environment pass separately if the main worktree cannot collect JSDOM.

### Task 3: Display a decisive K.O. board with player, HP, and Elo

**Files:**

- Modify: `app/plugins/streamalchemy/streammonsters-arena-view.js` in `complete(payload)`.
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html` result markup, locale labels, and `#arena-result` CSS.
- Modify: `app/test/streammonsters-arena-view-v15.test.js` in terminal-event tests.

**Interfaces:**

- Consumes Task 1's `battle_completed` payload and existing `stateBySlot` only as a fallback for legacy payloads.
- Produces this result DOM without changing resolver state:
  ```html
  <section id="arena-result" aria-live="assertive">
    <strong id="arena-result-winner"></strong>
    <span id="arena-result-ko"></span>
    <span id="arena-result-hp"></span>
    <span id="arena-result-rating"></span>
  </section>
  ```

- [ ] **Step 1: Write failing K.O. board tests**

  Feed `complete` a terminal public payload and assert player-first, K.O.-only copy and signed before/after Elo. Add an ineligible fixture where both deltas are zero:

  ```js
  await view.complete({
    completion: 'battle', terminalReason: 'knockout', winnerSlot: 1,
    winner: { viewerName: '@arenaalpha', name: 'Ashfang' },
    knockout: { round: 4, remainingHp: 12, maxHp: 45 },
    ratingChanges: [
      { slot: 1, before: 900, after: 916, delta: 16 },
      { slot: 2, before: 900, after: 884, delta: -16 }
    ]
  });
  expect(resultText()).toContain('K.-O.');
  expect(resultText()).toContain('@arenaalpha gewinnt mit Ashfang');
  expect(resultText()).toContain('Runde 4');
  expect(resultText()).toContain('12 / 45 HP');
  expect(resultText()).toContain('900 → 916 (+16)');
  expect(resultText()).toContain('900 → 884 (-16)');
  expect(zeroDeltaResultText()).toContain('ELO unverändert');
  ```

- [ ] **Step 2: Run the terminal UI test and confirm it fails**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-arena-view-v15.test.js -t "shows a KO winner with remaining HP and applied Elo"
  ```

  Expected: FAIL because the current result board lacks K.O. round, remaining HP, before-and-after Elo, and the zero-delta label.

- [ ] **Step 3: Format only resolver-confirmed terminal facts**

  In `complete`, prefer `payload.winner.viewerName`, then the existing public fighter name, then monster name for old events. Use Task 1's K.O. data only when `payload.terminalReason === 'knockout'`:

  ```js
  const koText = payload.terminalReason === 'knockout' && payload.knockout
    ? `${labels.knockout} · ${labels.round} ${payload.knockout.round}`
    : labels.forfeit;
  const hpText = payload.terminalReason === 'knockout' && payload.knockout
    ? `${payload.knockout.remainingHp} / ${payload.knockout.maxHp} HP`
    : '';
  const ratingText = changes.length && changes.every(change => numeric(change.delta) === 0)
    ? labels.eloUnchanged
    : changes.map(formatRatingChange).join(' · ');
  ```

  `formatRatingChange` must display the player name, `before → after`, and a signed delta. Set the K.O. board content before the victory audio, freeze the arena after the actual terminal event, and hold it for at least 8,000 ms. Never calculate a winner from the two fighter HUD values.

- [ ] **Step 4: Make the board readable in both layouts**

  Add `arena-result-ko` and `arena-result-hp`, then style result layers in the upper half of portrait and away from the center fighters in landscape. Use a translucent high-contrast background, `pointer-events:none`, tabular figures for rating, and no text ellipsis. Add German, English, Spanish, and French keys for `knockout`, `round`, `eloUnchanged`, and `forfeit`.

- [ ] **Step 5: Run UI checks and commit**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-arena-view-v15.test.js
  & .\runtime\node\node.exe --check app/plugins/streamalchemy/streammonsters-arena-view.js
  git diff --check
  git add app/plugins/streamalchemy/streammonsters-arena-view.js app/plugins/streamalchemy/streammonsters-overlay.html app/test/streammonsters-arena-view-v15.test.js
  git commit -m "fix(streammonsters): make KO arena outcome explicit"
  ```

  Expected: focused DOM tests PASS in a compatible environment, syntax PASS, whitespace PASS.

### Task 4: Verify the event-to-overlay flow without touching the live runtime

**Files:**

- Modify: `docs/superpowers/plans/2026-07-28-stream-monsters-ko-clarity-plan.md` by checking completed boxes and recording command outcomes.

**Interfaces:**

- Consumes the public event contract from Task 1 and the arena DOM from Tasks 2–3.
- Produces an evidence record for K.O. termination, privacy, portrait/landscape readability, and known test-environment limits.

- [ ] **Step 1: Run both focused suites**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js --runInBand app/test/streammonsters-battle-match-v5.test.js app/test/streammonsters-arena-view-v15.test.js
  ```

  Expected: all collected tests PASS. If the documented main-worktree JSDOM ESM bootstrap failure prevents collection, record that exact error and run the arena suite from the compatible isolated dependency worktree against the same source checkout.

- [ ] **Step 2: Run static and CSS checks**

  Run:

  ```powershell
  & .\runtime\node\node.exe .\app\node_modules\eslint\bin\eslint.js app/plugins/streamalchemy/streammonsters-arena-view.js app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js
  Push-Location app; npm run build:css; Pop-Location
  git diff --check
  ```

  Expected: lint, CSS build, and whitespace checks PASS.

- [ ] **Step 3: Do a non-mutating browser/OBS acceptance pass**

  In a deterministic demo, inspect 1080×1920 and 1920×1080. Confirm: both monsters remain fully visible; the lead reads only as current status; an action card names player, input, skill, and result; a K.O. board names player and monster, round, HP, and signed Elo; a zero-delta fixture says `ELO unverändert`; no numeric viewer identifier appears; and no lower-chat-zone card overlaps TikTok chat.

- [ ] **Step 4: Commit verification evidence only**

  ```powershell
  git add docs/superpowers/plans/2026-07-28-stream-monsters-ko-clarity-plan.md
  git commit -m "docs(streammonsters): verify KO clarity arena"
  ```

  Expected: this commit contains only the checked plan/evidence record and no generated runtime data or unrelated working-tree files.
