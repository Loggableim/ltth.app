# Furry Face Template Rig Design

## Goal

Replace the local full-image TTS demo with a six-template, layered face rig in which a mouth can never drift left or right while TTS changes its frame.

## Confirmed problem

The current demo replaces five independent pre-composed `full-tts-*.png` images. The source muzzle strip has different horizontal alpha bounds for its five frames (`+45`, `+42`, `+34`, `+21`, `+11`), so a fixed image swap visibly moves the mouth. This is source registration loss, not a CSS layout issue.

## Scope

- The work is limited to `tools/furry-builder-lab/` in the isolated style-refresh worktree.
- The live LTTH app, Talking Heads plugin, OBS overlay, and active stream are not changed or reloaded.
- The demo gains exactly six earless, reference-locked face templates: `raccoon-slate`, `fox-ember`, `wolf-fog`, `otter-cocoa`, `cat-lilac`, and `fawn-cream`.
- Every template consists of a head base, eye pair, and one five-pose mouth family: `rest`, `small`, `wide`, `round`, `teeth`.
- Hair, accessories, ears, standalone noses, user persistence, and live TTS wiring remain out of this slice.

## Asset contract

All runtime assets use transparent canonical 512 by 512 cells. Heads are packed in a 3 by 2 atlas, eyes in a 3 by 2 atlas, and mouths in a 5 by 6 atlas. A source cell can vary only inside its transparent cell; its draw destination is defined by the template rig, never recalculated from that frame's alpha bounds.

`assets/face-templates.json` is the only selection catalog for the demo:

```json
{
  "version": 1,
  "cellSize": 512,
  "atlases": {
    "heads": { "source": "assets/templates/heads.png", "columns": 3, "rows": 2 },
    "eyes": { "source": "assets/templates/eyes.png", "columns": 3, "rows": 2 },
    "mouths": { "source": "assets/templates/mouths.png", "columns": 5, "rows": 6 }
  },
  "templates": [{
    "id": "raccoon-slate",
    "label": "Schiefer-Waschbär",
    "headCell": 0,
    "eyesCell": 0,
    "mouthRow": 0
  }]
}
```

For a template with `mouthRow: 0`, its poses are exactly `rest=0`, `small=1`, `wide=2`, `round=3`, and `teeth=4`. A template's eye and mouth destinations are fixed normalized rectangles within the 1024 by 1024 demo canvas.

## Renderer and interaction contract

`template-rig.js` resolves `{ templateId, mouthFrame }` into three canvas operations. The operations are drawn in head, eyes, mouth order. Head and eyes resolve one source cell. Only the mouth source cell changes between frames; every resulting mouth operation must have the same `{ x, y, width, height }` destination for one template.

`template-demo-state.js` owns the pure, persistent demo selection:

```js
createDemoState('raccoon-slate', 'rest')
selectTemplate(state, templateIds, 'fox-ember')
rotateTemplate(state, templateIds, 1)
setMouthFrame(state, 'wide')
```

Template switching preserves `mouthFrame` and audio level. Forward and backward rotation wrap around all six templates. The page offers Previous, Next, six selectable template chips, and a test-only start/stop rotation control. The existing audio-level slider continues to map to the five mouth frames.

## Validation

- A focused rig test proves each of the six templates exists and every mouth pose keeps the exact same destination rectangle while its source cell changes.
- A state test proves rotation wraparound, direct template selection, and mouth-state preservation.
- A page test proves the six-template controls and canvas contract exist, and that the page no longer references `full-tts-*.png` at runtime.
- A real local browser check rotates templates while the wide and round poses are active; visual inspection confirms no horizontal muzzle drift.

