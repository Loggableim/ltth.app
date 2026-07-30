# Furry Face Template Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local six-face TTS demo where mouth frames are source-swapped inside fixed canonical cells and cannot move left or right.

**Architecture:** The demo uses a manifest-defined layered canvas rig rather than pre-composed full-face PNG swaps. A pure state module owns template rotation and mouth state; a rig module owns fixed source and destination geometry. The browser layer only renders state and handles controls.

**Tech Stack:** CommonJS, Node test runner, browser canvas, ImageMagick asset preparation, built-in ImageGen reference-bound source art.

## Global Constraints

- Work only in `tools/furry-builder-lab/` within `codex/furry-builder-style-refresh-20260729`.
- Do not change, reload, or restart LTTH, Talking Heads, OBS, or the live stream.
- Use the saved `assets/style-reference.png` for all new art; all heads remain earless.
- Do not overwrite existing source/candidate assets; create the registered template pack beside them.
- The five mouth poses are exactly `rest`, `small`, `wide`, `round`, `teeth`.
- A mouth pose may change only its source cell. Its destination rectangle is fixed per template.

---

### Task 1: Build the pure six-template rig and state contracts

**Files:**
- Create: `tools/furry-builder-lab/template-rig.js`
- Create: `tools/furry-builder-lab/template-demo-state.js`
- Create: `tools/furry-builder-lab/assets/face-templates.json`
- Test: `tools/furry-builder-lab/test/template-rig.test.cjs`
- Test: `tools/furry-builder-lab/test/template-demo-state.test.cjs`

**Interfaces:**
- `resolveTemplatePlan(manifest, templateId, mouthFrame)` returns `{ template, operations }`, where `operations` is head, eyes, mouth in that order and each operation contains `atlasId`, `cell`, and `destination`.
- `createDemoState(templateId, mouthFrame)` returns `{ templateId, mouthFrame, audioLevel: 0, rotating: false }`.
- `rotateTemplate(state, templateIds, direction)` returns a new state and wraps `direction` `1` or `-1`.

- [ ] **Step 1: Write failing rig and rotation tests**

```js
test('keeps one template mouth destination identical for all five frames', () => {
  const destinations = FRAMES.map(frame => resolveTemplatePlan(manifest, 'raccoon-slate', frame)
    .operations.find(operation => operation.layer === 'mouth').destination);
  assert.ok(destinations.every(destination => deepEqual(destination, destinations[0])));
});

test('wraps face rotation without changing the active mouth frame', () => {
  const state = createDemoState('raccoon-slate', 'wide');
  assert.equal(rotateTemplate(state, templateIds, -1).templateId, 'fawn-cream');
  assert.equal(rotateTemplate(state, templateIds, -1).mouthFrame, 'wide');
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail because the modules do not exist**

Run: `node --test tools/furry-builder-lab/test/template-rig.test.cjs tools/furry-builder-lab/test/template-demo-state.test.cjs`

Expected: module-not-found failures for the two new modules.

- [ ] **Step 3: Add the manifest and minimal pure implementations**

```js
const FRAME_COLUMNS = Object.freeze({ rest: 0, small: 1, wide: 2, round: 3, teeth: 4 });

function mouthDestination(template) {
  return { x: template.mouthRect[0], y: template.mouthRect[1], width: template.mouthRect[2], height: template.mouthRect[3] };
}
```

Populate all six manifest records with unique IDs, labels, head/eye cells, mouth rows, and explicit normalized `eyesRect`/`mouthRect` values. Reject an unknown template or frame with a descriptive error. Keep the static data independent of browser globals.

- [ ] **Step 4: Re-run focused tests and verify green**

Run: `node --test tools/furry-builder-lab/test/template-rig.test.cjs tools/furry-builder-lab/test/template-demo-state.test.cjs`

Expected: all focused tests pass.

- [ ] **Step 5: Commit only the contract slice**

```powershell
git add tools/furry-builder-lab/template-rig.js tools/furry-builder-lab/template-demo-state.js tools/furry-builder-lab/assets/face-templates.json tools/furry-builder-lab/test/template-rig.test.cjs tools/furry-builder-lab/test/template-demo-state.test.cjs
git commit -m "feat(furry-builder): add fixed face template rig"
```

### Task 2: Generate and normalize the six canonical visual template families

**Files:**
- Create: `tools/furry-builder-lab/assets/templates/heads-raw.png`
- Create: `tools/furry-builder-lab/assets/templates/eyes-raw.png`
- Create: `tools/furry-builder-lab/assets/templates/mouths-raw-01.png` through `mouths-raw-06.png`
- Create: `tools/furry-builder-lab/assets/templates/heads.png`
- Create: `tools/furry-builder-lab/assets/templates/eyes.png`
- Create: `tools/furry-builder-lab/assets/templates/mouths.png`
- Test: `tools/furry-builder-lab/test/template-assets.test.cjs`

**Interfaces:**
- `heads.png` has 3 columns, 2 rows, 512 pixel cells.
- `eyes.png` has 3 columns, 2 rows, 512 pixel cells.
- `mouths.png` has 5 columns, 6 rows, 512 pixel cells; row order exactly follows `face-templates.json`.

- [ ] **Step 1: Write failing canonical-atlas tests**

```js
test('ships six transparent head and eye cells plus thirty transparent mouth cells', () => {
  assert.equal(readPng('assets/templates/heads.png').width, 1536);
  assert.equal(readPng('assets/templates/heads.png').height, 1024);
  assert.equal(readPng('assets/templates/mouths.png').width, 2560);
  assert.equal(readPng('assets/templates/mouths.png').height, 3072);
});
```

- [ ] **Step 2: Run the asset test and confirm it fails because the registered atlases do not exist**

Run: `node --test tools/furry-builder-lab/test/template-assets.test.cjs`

Expected: an ENOENT assertion for `heads.png`.

- [ ] **Step 3: Generate, alpha-normalize, and register the art**

Generate a 3 by 2 earless head-base sheet and a matching 3 by 2 eye-pair sheet using the saved style reference. Generate six separate five-frame muzzle strips, one per template. Preserve raw chroma-key source assets; use the chroma-key helper to make alpha output. Repack every component into the named 512 pixel canonical cells. During repacking, align each mouth frame to the declared mouth-family pivot before placing it in its cell; do not use frame-specific trim bounds at draw time.

- [ ] **Step 4: Inspect three templates across rest, wide, and round before adoption**

On light and dark backgrounds, inspect `raccoon-slate`, `wolf-fog`, and `fawn-cream`. Confirm no ears, no eyes/nose/mouth baked into heads, matching line/shading style, and stable mouth registration.

- [ ] **Step 5: Re-run the canonical-atlas test and commit assets**

Run: `node --test tools/furry-builder-lab/test/template-assets.test.cjs`

Expected: all asset geometry and alpha checks pass.

```powershell
git add tools/furry-builder-lab/assets/templates tools/furry-builder-lab/test/template-assets.test.cjs
git commit -m "feat(furry-builder): add six registered face template assets"
```

### Task 3: Render the canvas demo and add testable template rotation

**Files:**
- Modify: `tools/furry-builder-lab/tts-demo.html`
- Modify: `tools/furry-builder-lab/tts-demo.css`
- Modify: `tools/furry-builder-lab/tts-demo.js`
- Create: `tools/furry-builder-lab/template-canvas-renderer.js`
- Modify: `tools/furry-builder-lab/test/tts-demo-page.test.cjs`
- Test: `tools/furry-builder-lab/test/template-canvas-renderer.test.cjs`

**Interfaces:**
- `drawTemplate(canvas, manifest, state)` calls the three fixed operations from `resolveTemplatePlan` and draws them in order.
- `tts-demo.html` contains a 1024 by 1024 canvas, exactly six template chips, Previous/Next controls, and a rotation toggle.
- Changing a template retains `state.mouthFrame` and `state.audioLevel`.

- [ ] **Step 1: Write failing renderer and page tests**

```js
test('changes a wide mouth source but keeps its canvas destination registered', async () => {
  const rest = await drawTemplate(canvas, manifest, createDemoState('fox-ember', 'rest'));
  const wide = await drawTemplate(canvas, manifest, createDemoState('fox-ember', 'wide'));
  assert.notDeepEqual(rest.mouth.source, wide.mouth.source);
  assert.deepEqual(rest.mouth.destination, wide.mouth.destination);
});

test('renders six template buttons without a pre-composed full-face image', () => {
  assert.match(page, /data-template="raccoon-slate"/);
  assert.equal(page.includes('full-tts-'), false);
});
```

- [ ] **Step 2: Run the tests and confirm the old image-swap demo fails the new contract**

Run: `node --test tools/furry-builder-lab/test/template-canvas-renderer.test.cjs tools/furry-builder-lab/test/tts-demo-page.test.cjs`

Expected: missing renderer and page-contract failures.

- [ ] **Step 3: Replace image swapping with canvas composition**

Load the three registered atlases once, render head/eyes/mouth operations to the canvas, and update only the mouth source on audio-level changes. Remove all `full-tts-*.png` references. Add six direct template chips, previous/next controls, and a 1200 millisecond rotation toggle. Store active template, active frame, and level in one state object.

- [ ] **Step 4: Re-run focused tests and the complete lab suite**

Run: `node --test tools/furry-builder-lab/test/template-canvas-renderer.test.cjs tools/furry-builder-lab/test/tts-demo-page.test.cjs`

Run: `$tests = rg --files tools/furry-builder-lab/test -g '*.test.cjs'; node --test @tests`

Expected: all focused and full lab tests pass.

- [ ] **Step 5: Commit the interactive demo**

```powershell
git add tools/furry-builder-lab/tts-demo.html tools/furry-builder-lab/tts-demo.css tools/furry-builder-lab/tts-demo.js tools/furry-builder-lab/template-canvas-renderer.js tools/furry-builder-lab/test/tts-demo-page.test.cjs tools/furry-builder-lab/test/template-canvas-renderer.test.cjs
git commit -m "feat(furry-builder): rotate fixed-rig face templates"
```

### Task 4: Browser verification and handoff

**Files:**
- Modify: `tools/furry-builder-lab/README.md`

**Interfaces:**
- The loopback-only demo is available at `/tts-demo.html`.
- Documentation states the demo is visual-only and no live TTS/plugin route is changed.

- [ ] **Step 1: Start only the loopback lab server and open the demo**

Run: `node server.cjs`

Expected: a `127.0.0.1:41731` listener only.

- [ ] **Step 2: Exercise registered mouth frames and rotation in a real browser**

Select `Weit`, rotate from `raccoon-slate` through all six templates, then select `Rund` and rotate backward through all six. Confirm each selected mouth is horizontally stable and the state label/template label update together.

- [ ] **Step 3: Capture visual proof and stop only the local lab server when the demo is no longer needed**

Capture the current canvas and controls. Do not touch any LTTH process.

- [ ] **Step 4: Document the fixed-registration guarantee and commit**

Add the six-template catalog, frame order, and no-drift destination invariant to the README.

```powershell
git add tools/furry-builder-lab/README.md
git commit -m "docs(furry-builder): document face template rig demo"
```

## Plan Self-Review

- Spec coverage: Tasks 1 through 4 cover fixed mouth geometry, six templates, reference-locked assets, testable rotation, browser evidence, and the live-app exclusion.
- Placeholder scan: no unresolved implementation placeholders are present.
- Type consistency: `templateId`, `mouthFrame`, `audioLevel`, `FRAME_COLUMNS`, and the three operation fields are used consistently across all tasks.
