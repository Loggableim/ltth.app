# Talking Heads Three-Pack Randomizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every automatic Talking Heads avatar draw choose fairly among the bundled Boba, Kenney, and RGS character packs while keeping first-TTS assignment, gift rerolls, slot reels, and the Stream Director presentation correct.

**Architecture:** `AssetSpriteLibrary` becomes the sole source of canonical, fresh per-pack lottery pools. Each draw filters exact excluded selections, chooses one non-empty pack uniformly, then chooses a selection uniformly within that pack; the existing first-assignment, reroll, and preview callers retain their current APIs. The UI and OBS overlay only consume the unchanged `{ packId, characterId, options }` selection payload, but render a pack-aware label and generic avatar copy.

**Tech Stack:** Node.js CommonJS, Jest 29, JSDOM, Playwright/Chrome manual smoke script, Socket.IO overlay contract, existing bundled PNG/SVG assets, PowerShell on Windows.

## Global Constraints

- Work directly on the current local `main` checkout; preserve all unrelated dirty files and do not create a worktree during the live stream.
- Do not import, extract, copy, delete, or redistribute the two supplied archives: their CC0 assets are already bundled in `app/plugins/talking-heads/assets/asset-packs/kenney` and `app/plugins/talking-heads/assets/asset-packs/rgs`.
- Every normal lottery draw gives `boba`, `kenney`, and `rgs` an equal one-third probability when all are eligible; selection probabilities inside a chosen pack remain uniform.
- Canonical pool sizes are exactly Boba `90`, Kenney `540`, and RGS `504` selections; a flat 1,134-selection draw is forbidden because it would bias away from Boba.
- Preserve the persisted selection schema `{ packId, characterId, options }`, all current socket event names/payload boundaries, the three-reel slot contract, and existing legacy avatar assignments; no database migration is allowed.
- A reroll must exclude the exact existing selection including options, while a three-card reel must contain no duplicate full selection.
- No app restart, TikTok test event, TTS test audio, or public tunnel change is allowed. After all local checks pass, reload only `talking-heads` through `POST /api/plugins/talking-heads/reload`.
- Do not push to GitHub unless the user gives a separate explicit push instruction. Commit only the scoped files listed by each task to local `main`.

---

## File Structure

- `app/plugins/talking-heads/engines/asset-sprite-library.js` owns canonical Boba/Kenney/RGS pools and the fair, no-repeat draw primitive.
- `app/plugins/talking-heads/main.js` remains the integration point for first assignment, gift rerolls, and the safe preview route; it must keep full pack selection data intact and remove Boba-only operator messages.
- `app/plugins/talking-heads/assets/ui.js`, `ui.html`, `assets/overlay.js`, `overlay.html`, and `obs-hud.html` render generic avatar language while retaining existing DOM ids/classes and socket contracts.
- `app/plugins/talking-heads/locales/{de,en,es,fr}.json` provides the same generic UI/overlay keys in every supported locale.
- `app/test/talking-heads-avatar-lottery-manager.test.js` locks pool construction, fair pack choice, exclusion, uniqueness, and all-frame asset validity.
- `app/test/talking-heads-avatar-assignment.test.js` and `app/test/talking-heads-gift-lottery.test.js` lock cross-pack persistence through existing first-assignment and reroll paths.
- `app/test/talking-heads-stream-director-ui.test.js`, `app/test/talking-heads-overlay-slot.test.js`, and `app/test/talking-heads-lottery-overlay.test.js` lock generic presentation and pack-aware reel labels.
- `app/test/talking-heads-browser-smoke.manual.js` remains the real Chrome/loopback release smoke and exercises all three packs without touching the live server.

### Task 1: Build a fair, canonical three-pack lottery engine

**Files:**
- Modify: `app/plugins/talking-heads/engines/asset-sprite-library.js:81-127`
- Modify: `app/test/talking-heads-avatar-lottery-manager.test.js:67-106`

**Interfaces:**
- Consumes: the existing constants `BOBA_ANIMALS`, `BOBA_MOUTH_PROFILES`, `BOBA_EXPRESSIONS`, `KENNEY_BODIES`, `KENNEY_EYES`, `RGS_HEADS`, `RGS_HAIRS`, `RGS_EYES`, and `RGS_MOUTHS`; existing `_selectionKey()` and `_randomUnit()` helpers.
- Produces: `getLotterySelectionPools(): { boba: AvatarSelection[], kenney: AvatarSelection[], rgs: AvatarSelection[] }`, `getRandomSelection(random, excludedSelection): AvatarSelection | undefined`, and `getLotteryCandidates(count, random, excludedSelections): AvatarSelection[]`, where `AvatarSelection` is `{ packId: 'boba'|'kenney'|'rgs', characterId: string, options: Record<string, string> }`.

- [ ] **Step 1: Write the failing lottery-pool and deterministic-pack-choice tests**

  Replace the Boba-only test at `app/test/talking-heads-avatar-lottery-manager.test.js:67` with this local helper and assertions. Keep the existing manager persistence tests above it unchanged.

  ```js
  function randomSequence(...values) {
    let index = 0;
    return () => values[index++] ?? 0;
  }

  test('builds canonical three-pack pools and chooses each eligible pack uniformly', () => {
    const library = new AssetSpriteLibrary({ dataDir: '/tmp/talking-heads-lottery-test' });
    const pools = library.getLotterySelectionPools();
    const boba = { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Default' } };
    const kenney = { packId: 'kenney', characterId: 'blueA', options: { eye: 'angry_blue' } };
    const rgs = { packId: 'rgs', characterId: 'head1', options: { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' } };

    expect(Object.fromEntries(Object.entries(pools).map(([packId, selections]) => [packId, selections.length])))
      .toEqual({ boba: 90, kenney: 540, rgs: 504 });
    expect(library.getRandomSelection(randomSequence(0, 0))).toEqual(boba);
    expect(library.getRandomSelection(randomSequence(0.34, 0))).toEqual(kenney);
    expect(library.getRandomSelection(randomSequence(0.67, 0))).toEqual(rgs);
  });

  test('keeps reel candidates unique and excludes the exact current selection across packs', () => {
    const library = new AssetSpriteLibrary({ dataDir: '/tmp/talking-heads-lottery-test' });
    const current = { packId: 'boba', characterId: 'Axolotl', options: { expression: 'Default' } };
    const candidates = library.getLotteryCandidates(3, randomSequence(0, 0, 0.34, 0, 0.67, 0));
    const reroll = library.getRandomSelection(randomSequence(0.34, 0), current);

    expect(candidates.map(selection => selection.packId)).toEqual(['boba', 'kenney', 'rgs']);
    expect(new Set(candidates.map(selection => JSON.stringify(selection))).size).toBe(3);
    expect(reroll).toEqual({ packId: 'kenney', characterId: 'blueA', options: { eye: 'angry_blue' } });
    expect(reroll).not.toEqual(current);
  });
  ```

- [ ] **Step 2: Run the focused test to verify the current Boba-only implementation fails**

  Run from `app`:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test/talking-heads-avatar-lottery-manager.test.js --runInBand
  ```

  Expected: FAIL because `getLotterySelectionPools` does not exist and the current random draw always returns Boba.

- [ ] **Step 3: Implement fresh pools and the shared fair draw primitive**

  Replace `_getLotterySelectionPool()` with the methods below and route both public draw methods through `_drawLotterySelection()`. Do not alter `normalizeSelection()`, frame generation, or the persisted selection shape.

  ```js
  getLotterySelectionPools() {
    return {
      boba: BOBA_ANIMALS
        .filter(characterId => BOBA_MOUTH_PROFILES[characterId])
        .flatMap(characterId => BOBA_EXPRESSIONS.map(expression => ({
          packId: 'boba', characterId, options: { expression }
        }))),
      kenney: KENNEY_BODIES.flatMap(characterId => KENNEY_EYES.map(eye => ({
        packId: 'kenney', characterId, options: { eye }
      }))),
      rgs: RGS_HEADS.flatMap(characterId => RGS_HAIRS.flatMap(hair =>
        RGS_EYES.flatMap(eyes => RGS_MOUTHS.map(mouth => ({
          packId: 'rgs', characterId, options: { hair, eyes, mouth }
        }))))
      )
    };
  }

  _getEligibleLotterySelectionPools(exclusions) {
    return Object.fromEntries(Object.entries(this.getLotterySelectionPools()).map(([packId, selections]) => [
      packId,
      selections.filter(selection => !exclusions.has(this._selectionKey(selection)))
    ]));
  }

  _drawLotterySelection(pools, random) {
    const packIds = Object.keys(pools).filter(packId => pools[packId].length > 0);
    if (!packIds.length) return undefined;
    const packId = packIds[Math.min(packIds.length - 1, Math.floor(this._randomUnit(random) * packIds.length))];
    const selections = pools[packId];
    const index = Math.min(selections.length - 1, Math.floor(this._randomUnit(random) * selections.length));
    return selections.splice(index, 1)[0];
  }
  ```

  Implement `getRandomSelection()` by creating a `Set` with the one normalized exclusion key and returning `_drawLotterySelection(this._getEligibleLotterySelectionPools(exclusions), random)`. Implement `getLotteryCandidates()` by creating its normalized exclusion `Set`, requesting at most the summed remaining pool lengths, then repeatedly calling `_drawLotterySelection(pools, random)` until the requested count is reached. The splice makes every reel selection unique without changing pack fairness for the next draw.

- [ ] **Step 4: Run the focused library suite and inspect the exact result**

  Run:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test\talking-heads-avatar-lottery-manager.test.js test\talking-heads-local-assets.test.js --runInBand
  ```

  Expected: PASS; the output includes the canonical pool test, no duplicate candidate failure, and the existing asset-library composition tests.

- [ ] **Step 5: Commit the independently testable lottery engine**

  ```powershell
  git add app/plugins/talking-heads/engines/asset-sprite-library.js app/test/talking-heads-avatar-lottery-manager.test.js
  git diff --cached --check
  git commit -m "feat(talking-heads): randomize avatars across local packs"
  ```

### Task 2: Prove first assignment and Go Popular rerolls persist cross-pack winners

**Files:**
- Modify: `app/plugins/talking-heads/main.js:373-375,955-966`
- Modify: `app/test/talking-heads-avatar-assignment.test.js:34-38,90-150`
- Modify: `app/test/talking-heads-gift-lottery.test.js:40-130`
- Modify: `app/test/talking-heads-stream-director.test.js:95-121`

**Interfaces:**
- Consumes: `AssetSpriteLibrary.getRandomSelection(random, excludedSelection)`, `AssetSpriteLibrary.getLotteryCandidates(count, random, excludedSelections)`, and `AvatarLotteryManager.assign/reroll(userId, username, selection)`.
- Produces: existing first-TTS assignment and `Go Popular` reroll call paths persist and emit cross-pack `AvatarSelection` objects unchanged; preview route labels/errors are avatar-generic.

- [ ] **Step 1: Write failing integration assertions with Kenney and RGS selections**

  Define reusable fixtures near the existing `fox`, `bear`, and `dog` fixtures:

  ```js
  const kenney = { packId: 'kenney', characterId: 'blueA', options: { eye: 'human' } };
  const rgs = { packId: 'rgs', characterId: 'head1', options: { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' } };
  ```

  In the first-assignment test, make `plugin.assetSpriteLibrary.getRandomSelection` return `kenney` and assert both the manager assignment and prepared winner preserve it exactly:

  ```js
  expect(plugin.avatarLotteryManager.assign).toHaveBeenCalledWith('voice-user', 'Voice User', kenney);
  expect(result.selection).toEqual(kenney);
  ```

  In the configured `Go Popular` reroll test, make `getRandomSelection` return `rgs` for an existing Boba assignment and assert:

  ```js
  expect(plugin.assetSpriteLibrary.getRandomSelection).toHaveBeenCalledWith(expect.any(Function), fox);
  expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledWith('viewer_handle', 'viewer_handle', rgs);
  expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.objectContaining({
    reason: 'gift-reroll',
    winner: expect.objectContaining({ selection: rgs })
  }));
  ```

  In `talking-heads-stream-director.test.js`, rename the preview test to `emits a preview-only avatar test spin without assigning an avatar or invoking TTS`, replace its Boba-only winner assertion with `packId: expect.stringMatching(/^(boba|kenney|rgs)$/)`, and add the following route-error regression:

  ```js
  test('reports an avatar-generic error when the preview spin is unavailable', async () => {
    const { plugin, api } = createPlugin();
    plugin._emitAvatarSpin = jest.fn(async () => null);
    plugin._registerRoutes();
    const testSpinRoute = findRoute(api, 'post', '/api/talkingheads/test-spin');
    const res = responseRecorder();

    await testSpinRoute({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Avatar preview is unavailable' });
  });
  ```

- [ ] **Step 2: Run the assignment and gift suites to confirm the mocks/tests expose the integration gap**

  Run:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test\talking-heads-avatar-assignment.test.js test\talking-heads-gift-lottery.test.js --runInBand
  ```

  Expected: the new cross-pack persistence assertions PASS because the current integration already treats a selection as opaque; the new preview-error assertion FAILS with the current `Boba preview is unavailable` text. Any failure involving an altered `options` object is a real schema-preservation regression.

- [ ] **Step 3: Keep full selections intact and remove Boba-only operator messages**

  Leave the draw and persistence calls in `main.js` structurally unchanged. Replace the log at line 375 and the preview strings at lines 959/966 with the following pack-safe text:

  ```js
  this._log(`Assigned ${selection.packId}/${selection.characterId} to ${username || userId}`, 'info');

  username: 'Character Lab',

  return res.status(503).json({ success: false, error: 'Avatar preview is unavailable' });
  ```

  Do not project a Kenney body into `options.body` or an RGS head into `options.head`: their `characterId` is already the body/head and the options must remain `{ eye }` or `{ hair, eyes, mouth }` exactly.

- [ ] **Step 4: Run the lifecycle-focused integration suite**

  Run:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test\talking-heads-avatar-assignment.test.js test\talking-heads-gift-lottery.test.js test\talking-heads-stream-director.test.js --runInBand
  ```

  Expected: PASS; first voice with an assigned voice persists the Kenney selection, `Go Popular` rerolls only an existing avatar to the RGS selection, and no TTS/slot event contract changes.

- [ ] **Step 5: Commit cross-pack lifecycle coverage and generic operator wording**

  ```powershell
  git add app/plugins/talking-heads/main.js app/test/talking-heads-avatar-assignment.test.js app/test/talking-heads-gift-lottery.test.js app/test/talking-heads-stream-director.test.js
  git diff --cached --check
  git commit -m "test(talking-heads): preserve cross-pack avatar assignments"
  ```

### Task 3: Make the Stream Director and OBS slot pack-aware

**Files:**
- Modify: `app/plugins/talking-heads/assets/overlay.js:1-58`
- Modify: `app/plugins/talking-heads/assets/ui.js:13-32,230-269`
- Modify: `app/plugins/talking-heads/ui.html:15-101`
- Modify: `app/plugins/talking-heads/overlay.html:31-34`
- Modify: `app/plugins/talking-heads/obs-hud.html:31-34`
- Modify: `app/plugins/talking-heads/locales/de.json`
- Modify: `app/plugins/talking-heads/locales/en.json`
- Modify: `app/plugins/talking-heads/locales/es.json`
- Modify: `app/plugins/talking-heads/locales/fr.json`
- Modify: `app/test/talking-heads-stream-director-ui.test.js:27-35,118-269`
- Modify: `app/test/talking-heads-overlay-slot.test.js:42-180`
- Modify: `app/test/talking-heads-lottery-overlay.test.js:7-20`
- Modify: `app/test/talking-heads-browser-smoke.manual.js:55-150,230-345`

**Interfaces:**
- Consumes: the unchanged socket spin payload `candidates: Array<{ selection: AvatarSelection, spriteUrl: string }>` and `winner: { selection: AvatarSelection, sprites: Record<string, string> }`.
- Produces: `selectionLabel(selection): string` with Boba `character · expression`, Kenney `Kenney · body · eye`, and RGS `RGS · head · hair · eyes · mouth`; a Character Lab that hides Boba-only thumbnails whenever another pack is selected.

- [ ] **Step 1: Write failing presentation tests for all three label forms and non-Boba lab state**

  Add this spin winner assertion to `talking-heads-overlay-slot.test.js` after the current acknowledgement test:

  ```js
  test('labels Kenney and RGS reel winners with their full pack options', () => {
    const { dom, handlers } = bootOverlay();
    const startSpin = handlers.get('talkingheads:avatar:spin:start');
    startSpin(spinPayload({
      winner: {
        selection: { packId: 'rgs', characterId: 'head1', options: { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' } },
        sprites: { idle_neutral: '/api/talkingheads/sprite/rgs-head1.png' }
      }
    }));
    jest.advanceTimersByTime(240);
    expect(dom.window.document.getElementById('slotWinnerName').textContent)
      .toBe('RGS · head1 · hair1 · eyes1 · mouth1');
  });
  ```

  Extend the existing non-Boba Character Lab test after it changes `#assetPack` to `kenney`:

  ```js
  const grid = dom.window.document.getElementById('bobaThumbnailGrid');
  expect(grid.hidden).toBe(true);
  expect(grid.querySelectorAll('.boba-thumbnail')).toHaveLength(0);
  ```

  Change the fallback-copy expectations from `Boba avatar`/`Boba-Avatar` to `Avatar`/`Avatar` and update the translated fixture key to `overlay.avatar`.

- [ ] **Step 2: Run presentation tests to verify the Boba-specific UI fails**

  Run:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test\talking-heads-stream-director-ui.test.js test\talking-heads-overlay-slot.test.js test\talking-heads-lottery-overlay.test.js --runInBand
  ```

  Expected: FAIL because the current overlay only reads `options.expression`, Boba thumbnails remain visible for Kenney, and static copy still says Boba.

- [ ] **Step 3: Implement generic copy, label formatting, and Boba-thumbnail visibility**

  In `assets/overlay.js`, replace Boba fallback keys with `avatar: 'Avatar'` and `test_spin: 'Avatar test spin'`. Implement the label formatter exactly as follows:

  ```js
  function selectionLabel(selection = {}) {
    const packId = String(selection.packId || 'boba').toLowerCase();
    const character = String(selection.characterId || '').trim();
    const options = selection.options || {};
    const parts = packId === 'kenney'
      ? ['Kenney', character, options.eye]
      : packId === 'rgs'
        ? ['RGS', character, options.hair, options.eyes, options.mouth]
        : [character, options.expression];
    return parts.filter(Boolean).join(' · ') || overlayText('avatar');
  }
  ```

  In `assets/ui.js`, change Boba-only fallback messages to generic avatar wording and make `renderBobaThumbnails()` clear and hide the grid for every selected pack except `boba`:

  ```js
  const selectedPackId = el('assetPack')?.value || 'boba';
  grid.replaceChildren();
  grid.hidden = selectedPackId !== 'boba';
  if (selectedPackId !== 'boba' || !boba) return;
  ```

  Keep `id="bobaCharacterLab"` and `.boba-thumbnail` class names to avoid unrelated CSS/DOM churn. Change only user-visible headings and labels to `CHARACTER LAB`, `Avatar character`, `Selected avatar frame preview`, `First TTS assigns an avatar`, `YOUR AVATAR`, `Assigned avatar`, and `Avatar`.

  Rename locale keys consistently in all four JSON files:

  ```text
  kickers.boba_lab             -> kickers.character_lab
  labels.boba_character        -> labels.avatar_character
  messages.bobaAnimals         -> messages.avatarLibrary
  overlay.your_boba            -> overlay.your_avatar
  overlay.boba_avatar          -> overlay.avatar
  ```

  Use these exact locale values for the renamed/generic strings:

  | Key | de | en | es | fr |
  | --- | --- | --- | --- |
  | `kickers.character_lab` | `CHARACTER LAB` | `CHARACTER LAB` | `LABORATORIO DE PERSONAJES` | `LABORATOIRE DE PERSONNAGES` |
  | `labels.first_assignment` | `Erstes TTS weist einen Avatar zu` | `First TTS assigns an avatar` | `El primer TTS asigna un avatar` | `Le premier TTS attribue un avatar` |
  | `labels.selected_frame` | `Ausgewaehlte Avatar-Frame-Vorschau` | `Selected avatar frame preview` | `Vista previa del frame de avatar seleccionado` | `Apercu du frame d'avatar selectionne` |
  | `labels.avatar_character` | `Avatar-Charakter` | `Avatar character` | `Personaje de avatar` | `Personnage d'avatar` |
  | `messages.framesPrepared` | `Avatar-Frame-Vorschau vorbereitet.` | `Avatar frame preview prepared.` | `Vista previa de frame de avatar preparada.` | `Apercu de frame d'avatar prepare.` |
  | `messages.testSpinStarted` | `Sicherer Avatar-Testspin an das Overlay gesendet.` | `Safe avatar test spin sent to the overlay.` | `Giro de prueba de avatar enviado al overlay.` | `Tirage de test d'avatar envoye a l'overlay.` |
  | `messages.avatarLibrary` | `Avatar-Bibliothek` | `Avatar library` | `Biblioteca de avatares` | `Bibliotheque d'avatars` |
  | `messages.directorReady` | `Avatar-Bibliothek und Regie-Einstellungen sind bereit.` | `Avatar library and director settings are ready.` | `La biblioteca de avatares y los ajustes del director estan listos.` | `La bibliotheque d'avatars et les reglages de regie sont prets.` |
  | `messages.framePreviewUnavailable` | `Die ausgewaehlte Avatar-Frame-Vorschau ist nicht verfuegbar.` | `The selected avatar frame preview is unavailable.` | `La vista previa del frame de avatar seleccionado no esta disponible.` | `L'apercu du frame d'avatar selectionne est indisponible.` |
  | `overlay.test_spin` | `Avatar-Testspin` | `Avatar test spin` | `Giro de prueba de avatar` | `Tirage de test d'avatar` |
  | `overlay.assigned_avatar` | `Zugewiesener Avatar` | `Assigned avatar` | `Avatar asignado` | `Avatar attribue` |
  | `overlay.your_avatar` | `DEIN AVATAR` | `YOUR AVATAR` | `TU AVATAR` | `VOTRE AVATAR` |
  | `overlay.avatar` | `Avatar` | `Avatar` | `Avatar` | `Avatar` |

  Update the manual browser smoke fixture to include the three catalog packs, select `kenney` once in the Director assertion (expect a hidden/empty Boba grid), and emit a slot spin containing Boba, Kenney, and RGS selection metadata. It may reuse the safe local Boba image URL for the smoke fixture cards; the selection labels, renderer asset audit, and production library verify the real pack-specific assets separately.

- [ ] **Step 4: Run presentation, i18n, and real-browser smoke checks**

  Run from `app`:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test\talking-heads-stream-director-ui.test.js test\talking-heads-overlay-slot.test.js test\talking-heads-lottery-overlay.test.js test\talking-heads-ui-i18n.test.js test\talking-heads-plugin-i18n.test.js --runInBand
  npm run i18n:check
  & ..\runtime\node\node.exe test\talking-heads-browser-smoke.manual.js
  ```

  Expected: PASS; Chrome writes only disposable loopback smoke screenshots under `app/output/playwright/talking-heads`, the director can switch to Kenney without Boba thumbnails, and the overlay reveals an RGS-formatted winner after exactly one acknowledgement.

- [ ] **Step 5: Commit pack-aware presentation and translated copy**

  ```powershell
  git add app/plugins/talking-heads/assets/overlay.js app/plugins/talking-heads/assets/ui.js app/plugins/talking-heads/ui.html app/plugins/talking-heads/overlay.html app/plugins/talking-heads/obs-hud.html app/plugins/talking-heads/locales app/test/talking-heads-stream-director-ui.test.js app/test/talking-heads-overlay-slot.test.js app/test/talking-heads-lottery-overlay.test.js app/test/talking-heads-browser-smoke.manual.js
  git diff --cached --check
  git commit -m "feat(talking-heads): show all avatar packs in director"
  ```

### Task 4: Keep canonical translation validation bounded in this multi-worktree checkout

**Files:**
- Create: `scripts/lib/translation-source-walker.js`
- Create: `app/test/translation-source-walker.test.js`
- Modify: `scripts/validate-translations.js:1-105`

**Interfaces:**
- Consumes: a source root path and the existing validator's HTML/JS source traversal requirement.
- Produces: `walkSource(directory, output = []) -> string[]`, which returns sorted `.html`/`.js` files but never descends into `node_modules`, `.git`, `docs_archive`, `.worktrees`, or `.superpowers` directories at any depth.

- [ ] **Step 1: Write a failing real filesystem traversal test**

  Create `app/test/translation-source-walker.test.js` using a disposable OS temporary directory. Build visible source files and deliberately ignored workspace trees, then assert only visible files are returned:

  ```js
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { walkSource } = require('../../scripts/lib/translation-source-walker');

  test('skips nested worktree and SDD directories while retaining active source files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-walk-'));
    try {
      fs.mkdirSync(path.join(root, 'app', 'nested'), { recursive: true });
      fs.mkdirSync(path.join(root, '.worktrees', 'clone'), { recursive: true });
      fs.mkdirSync(path.join(root, '.superpowers', 'sdd'), { recursive: true });
      fs.writeFileSync(path.join(root, 'app', 'visible.html'), '<div data-i18n="app.visible"></div>');
      fs.writeFileSync(path.join(root, 'app', 'nested', 'visible.js'), 'window.i18n.t("app.nested");');
      fs.writeFileSync(path.join(root, '.worktrees', 'clone', 'stale.js'), 'window.i18n.t("stale.worktree");');
      fs.writeFileSync(path.join(root, '.superpowers', 'sdd', 'scratch.js'), 'window.i18n.t("scratch");');

      expect(walkSource(root).map(file => path.relative(root, file).replace(/\\/g, '/')))
        .toEqual(['app/nested/visible.js', 'app/visible.html']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  ```

- [ ] **Step 2: Run the new test to prove the traversal helper does not exist yet**

  Run from `app`:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test/translation-source-walker.test.js --runInBand
  ```

  Expected: FAIL with `Cannot find module '../../scripts/lib/translation-source-walker'`.

- [ ] **Step 3: Extract the minimal bounded walker and wire it into the validator**

  Create `scripts/lib/translation-source-walker.js`:

  ```js
  'use strict';

  const fs = require('fs');
  const path = require('path');

  const SKIPPED_SOURCE_DIRECTORIES = new Set([
    'node_modules', '.git', 'docs_archive', '.worktrees', '.superpowers'
  ]);

  function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function walkSource(directory, output = []) {
    if (!fs.existsSync(directory)) return output;
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && SKIPPED_SOURCE_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walkSource(full, output);
      else if (/\.(html|js)$/i.test(entry.name)) output.push(full);
    }
    return output;
  }

  module.exports = { walkSource };
  ```

  In `scripts/validate-translations.js`, import that helper directly after the existing `fs`/`path` imports:

  ```js
  const { walkSource } = require('./lib/translation-source-walker');
  ```

  Remove only its local `walkSource()` definition. Do not change `checkReferencedKeys()`, locale parity rules, report shape, or validation findings.

- [ ] **Step 4: Verify the helper and the actual canonical validator**

  Run from `app`:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test/translation-source-walker.test.js test/talking-heads-ui-i18n.test.js test/talking-heads-plugin-i18n.test.js --runInBand
  npm run i18n:check
  ```

  Expected: the walker regression and Talking Heads i18n suites PASS; the canonical validator completes without scanning `.worktrees`/`.superpowers`, emits its JSON report, and exits `0` with no findings. If it emits real translation findings, fix only findings introduced by this release; report pre-existing unrelated findings instead of suppressing them.

- [ ] **Step 5: Commit the bounded validator regression and fix**

  ```powershell
  git add scripts/lib/translation-source-walker.js scripts/validate-translations.js app/test/translation-source-walker.test.js
  git diff --cached --check
  git commit -m "fix(i18n): skip worktree source trees in validation"
  ```

### Task 5: Audit every drawable selection and release only the live-safe plugin change

**Files:**
- Modify: `app/test/talking-heads-avatar-lottery-manager.test.js:94-106`
- Verify only: `app/plugins/talking-heads/assets/asset-packs/boba`
- Verify only: `app/plugins/talking-heads/assets/asset-packs/kenney`
- Verify only: `app/plugins/talking-heads/assets/asset-packs/rgs`

**Interfaces:**
- Consumes: `AssetSpriteLibrary.getLotterySelectionPools()` and private test-visible `_getFrameLayers(selection): Promise<Record<'idle_neutral'|'blink'|'speak_closed'|'speak_mid'|'speak_open', string[]>>`.
- Produces: a release gate proving all 1,134 normal lottery selections resolve five non-empty frames and three distinct speaking-frame signatures before a scoped plugin reload.

- [ ] **Step 1: Write the failing complete asset-pool frame audit**

  Replace the Boba-only automatic-frame test with this test in `app/test/talking-heads-avatar-lottery-manager.test.js`:

  ```js
  test('every three-pack automatic selection resolves usable idle, blink, and speaking frames', async () => {
    const library = new AssetSpriteLibrary();
    const selections = Object.values(library.getLotterySelectionPools()).flat();

    expect(selections).toHaveLength(1134);
    for (const selection of selections) {
      const frames = await library._getFrameLayers(selection);
      expect(['idle_neutral', 'blink', 'speak_closed', 'speak_mid', 'speak_open']
        .every(frameName => Array.isArray(frames[frameName]) && frames[frameName].length > 0)).toBe(true);
      const speakingSignatures = ['speak_closed', 'speak_mid', 'speak_open']
        .map(frameName => frames[frameName].filter(Boolean).join('|'));
      expect(new Set(speakingSignatures).size).toBe(3);
    }
  });
  ```

- [ ] **Step 2: Run the full-pool audit before any live reload**

  Run:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test\talking-heads-avatar-lottery-manager.test.js --runInBand
  ```

  Expected: PASS with 1,134 audited selections. A missing asset, an empty layer list, or two identical speaking signatures is a release blocker; repair the matching `AssetSpriteLibrary` mapping and repeat this task instead of weakening the assertion.

- [ ] **Step 3: Run the focused Talking Heads release suite and static gates**

  Run from `app`:

  ```powershell
  & ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js test/talking-heads-avatar-lottery-manager.test.js test/talking-heads-local-assets.test.js test/talking-heads-avatar-assignment.test.js test/talking-heads-gift-lottery.test.js test/talking-heads-stream-director.test.js test/talking-heads-stream-director-ui.test.js test/talking-heads-overlay-slot.test.js test/talking-heads-lottery-overlay.test.js test/talking-heads-renderer-lifecycle.test.js test/talking-heads-ui-i18n.test.js test/talking-heads-plugin-i18n.test.js --runInBand
  npm run lint -- --quiet
  npm run build:css
  npm run i18n:check
  ```

  Expected: all named suites PASS, CSS build succeeds, ESLint reports no errors, and translation validation reports no findings. Do not treat unrelated full-suite failures as a reason to change unrelated files.

- [ ] **Step 4: Commit the audit and establish live-reload readiness**

  From the repository root, commit only the audit test if it is not already included in Task 1:

  ```powershell
  git add app/test/talking-heads-avatar-lottery-manager.test.js
  git diff --cached --check
  git commit -m "test(talking-heads): audit every lottery avatar frame"
  ```

  Then prove the commit chain and the running service target. The controller performs the one scoped reload only after the final whole-branch review is clean:

  ```powershell
  git status --short
  git log --oneline -4
  Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3000 -State Listen | Select-Object -First 1
  ```

  Expected: all scoped source/test commits are present and port 3000 is listening. If port 3000 is not listening, do not start or restart the app; report the live-runtime blocker.

- [ ] **Step 5: After final whole-branch review, controller reloads only Talking Heads and performs the post-reload read-only smoke**

  The controller invokes the one approved plugin lifecycle endpoint, then uses only read-only endpoints and the existing OBS overlay source:

  ```powershell
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/plugins/talking-heads/reload'
  Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/talkingheads/config'
  Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/talkingheads/status'
  ```

  Confirm that the config endpoint advertises `boba`, `kenney`, and `rgs`, that `rerollGiftEnabled` is `true`, and that `rerollGiftNames` includes `Go Popular`; then confirm the status endpoint is healthy and the existing OBS source loads the generic overlay without a 404. Do not press the test-spin/TTS buttons during the live stream. There is no additional code commit in this step; the successful plugin-only reload is the release handoff.

## Plan Self-Review

1. **Spec coverage:** Task 1 implements 1/3-per-pack selection, 90/540/504 canonical pools, exact exclusion, and unique reels. Task 2 protects first-TTS and Go Popular persistence with the unchanged selection schema. Task 3 handles all generic labels, three-reel rendering, i18n, and browser UX. Task 4 keeps the canonical validator bounded despite local worktree artifacts. Task 5 audits every real asset frame, runs focused gates, commits scoped changes, and reloads only Talking Heads.
2. **Placeholder scan:** This plan contains no unfinished markers, no unspecified test instructions, and every code step names the exact file, assertion, method, or command needed.
3. **Type consistency:** Every task uses the same `AvatarSelection` shape and the same `getLotterySelectionPools`, `getRandomSelection`, and `getLotteryCandidates` method names. The UI/overlay consumes `selection.packId`, `selection.characterId`, and `selection.options` without adding a second schema.
