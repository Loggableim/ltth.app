const {
  ShowDesignerStore,
  mapValidationIssues,
  snapCoordinate,
  snapTime
} = require('../plugins/webgpu-fireworks/ui/show-designer-model');

function definition(id = 'custom:00000000-0000-4000-8000-000000000601') {
  return {
    schemaVersion: 1,
    id,
    metadata: { name: 'Pyro Study', description: 'A test show.' },
    materialProfile: 'premium-realistic',
    autoEligible: false,
    variants: {
      long: {
        durationMs: 28000,
        cues: [{
          timeMs: 1500,
          phase: 'opening',
          formation: 'single',
          importance: 'essential',
          shells: [{
            origin: { x: 0.5, y: 1 },
            target: { x: 0.5, y: 0.35 },
            launchMode: 'rocket',
            tier: 'medium',
            palette: ['#f6c453'],
            layers: [{
              primitive: 'radial',
              delayMs: 0,
              density: 72,
              size: 1,
              lifetimeMs: 900,
              gravity: 0.8,
              drag: 0.04,
              trail: true,
              split: false,
              strobe: false,
              colors: ['#f6c453'],
              priority: 'core',
              core: true
            }]
          }]
        }]
      }
    }
  };
}

function record(options = {}) {
  return {
    id: options.id || 'custom:00000000-0000-4000-8000-000000000601',
    builtIn: options.builtIn === true,
    revision: options.revision ?? 3,
    validatedRevision: null,
    publishedRevision: null,
    archived: false,
    definition: definition(options.id)
  };
}

function recordWithCueTimes(times) {
  const editable = record();
  const source = editable.definition.variants.long.cues[0];
  editable.definition.variants.long.cues = times.map((timeMs, index) => {
    const cue = JSON.parse(JSON.stringify(source));
    cue.timeMs = timeMs;
    cue.shells[0].target.x = (index + 1) / 10;
    cue.shells[0].layers[0].colors = [`#00000${index + 1}`];
    return cue;
  });
  return editable;
}

describe('WebGPU Fireworks Show Designer model', () => {
  test('snaps timeline and stage values while Alt-style bypass remains exact', () => {
    expect(snapTime(1549)).toBe(1500);
    expect(snapTime(1550)).toBe(1600);
    expect(snapTime(1549, { bypass: true })).toBe(1549);
    expect(snapCoordinate(0.456)).toBe(0.46);
    expect(snapCoordinate(1.4)).toBe(1);
    expect(snapCoordinate(0.456, { bypass: true })).toBe(0.456);
  });

  test('keeps built-ins read-only and custom records editable', () => {
    const store = new ShowDesignerStore();
    store.loadShow(record({ id: 'classic-crescendo', builtIn: true, revision: 0 }));
    expect(store.getState().readOnly).toBe(true);
    expect(() => store.updateMetadata({ name: 'Changed' })).toThrow(/read-only/i);

    store.loadShow(record());
    store.updateMetadata({ name: 'Changed' });
    expect(store.getState().definition.metadata.name).toBe('Changed');
    expect(store.getState().persistence.dirty).toBe(true);
  });

  test('moves cues and formation handles with snapping and supports multi-select', () => {
    const store = new ShowDesignerStore();
    const editable = record();
    editable.definition.variants.long.cues.push({
      ...editable.definition.variants.long.cues[0],
      timeMs: 2600,
      shells: JSON.parse(JSON.stringify(editable.definition.variants.long.cues[0].shells))
    });
    store.loadShow(editable);

    store.selectCue(0);
    store.selectCue(1, { additive: true });
    expect(store.getState().selection.cueIndexes).toEqual([0, 1]);
    store.moveSelectedCues(151);
    expect(store.getState().definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([1700, 2800]);

    store.selectShell(0, 0);
    store.moveSelectedShellTargets({ x: -0.123, y: 0.087 });
    expect(store.getState().definition.variants.long.cues[0].shells[0].target)
      .toEqual({ x: 0.38, y: 0.44 });
  });

  test('keeps cue selection attached to dragged cues when their chronological order changes', () => {
    const store = new ShowDesignerStore();
    const editable = record();
    editable.definition.variants.long.cues.push({
      ...editable.definition.variants.long.cues[0],
      timeMs: 2600,
      shells: JSON.parse(JSON.stringify(editable.definition.variants.long.cues[0].shells))
    });
    store.loadShow(editable);

    store.selectCue(0);
    store.moveSelectedCues(2000);
    expect(store.getState().selection).toEqual(expect.objectContaining({
      cueIndexes: [1],
      primaryCueIndex: 1
    }));
    store.moveSelectedCues(100);
    expect(store.getState().definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([2600, 3600]);
  });

  test('remaps shell and layer selections by object identity after a cue drag reorders cues', () => {
    const store = new ShowDesignerStore();
    store.loadShow(recordWithCueTimes([1000, 2000, 3000]));
    store.selectLayer(0, 0, 0);

    store.moveSelectedCues(2500);

    const state = store.getState();
    expect(state.definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([2000, 3000, 3500]);
    expect(state.definition.variants.long.cues[2].shells[0].target.x).toBe(0.1);
    expect(state.selection).toEqual({
      cueIndexes: [2],
      primaryCueIndex: 2,
      shells: [{ cueIndex: 2, shellIndex: 0 }],
      primaryShell: { cueIndex: 2, shellIndex: 0 },
      layer: { cueIndex: 2, shellIndex: 0, layerIndex: 0 }
    });
  });

  test('remaps shell selections spanning multiple reordered cues', () => {
    const store = new ShowDesignerStore();
    store.loadShow(recordWithCueTimes([1000, 2000, 2500]));
    store.selectShell(0, 0);
    store.selectShell(1, 0, { additive: true });

    store.moveSelectedCues(2000);

    const state = store.getState();
    expect(state.definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([2500, 3000, 4000]);
    expect(state.definition.variants.long.cues.map(cue => cue.shells[0].target.x))
      .toEqual([0.3, 0.1, 0.2]);
    expect(state.selection).toEqual({
      cueIndexes: [1, 2],
      primaryCueIndex: 2,
      shells: [
        { cueIndex: 1, shellIndex: 0 },
        { cueIndex: 2, shellIndex: 0 }
      ],
      primaryShell: { cueIndex: 2, shellIndex: 0 },
      layer: null
    });
  });

  test('clamps one shared multi-cue drag delta at both timeline bounds without compressing spacing', () => {
    const leftStore = new ShowDesignerStore();
    leftStore.loadShow(recordWithCueTimes([100, 500]));
    leftStore.selectCue(0);
    leftStore.selectCue(1, { additive: true });
    leftStore.moveSelectedCues(-300);
    expect(leftStore.getState().definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([0, 400]);
    expect(leftStore.undo()).toBe(true);
    expect(leftStore.getState().definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([100, 500]);
    expect(leftStore.undo()).toBe(false);

    const rightStore = new ShowDesignerStore();
    rightStore.loadShow(recordWithCueTimes([27500, 27900]));
    rightStore.selectCue(0);
    rightStore.selectCue(1, { additive: true });
    rightStore.moveSelectedCues(500);
    expect(rightStore.getState().definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([27600, 28000]);
    expect(rightStore.getState().selection.cueIndexes).toEqual([0, 1]);
  });

  test('sorts direct cue time edits and remaps the full selection in one undoable mutation', () => {
    const store = new ShowDesignerStore();
    store.loadShow(recordWithCueTimes([1000, 2000, 3000]));
    store.selectLayer(0, 0, 0);

    store.setCueField(0, 'timeMs', 3500);

    const state = store.getState();
    expect(state.definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([2000, 3000, 3500]);
    expect(state.definition.variants.long.cues[2].shells[0].target.x).toBe(0.1);
    expect(state.selection).toEqual({
      cueIndexes: [2],
      primaryCueIndex: 2,
      shells: [{ cueIndex: 2, shellIndex: 0 }],
      primaryShell: { cueIndex: 2, shellIndex: 0 },
      layer: { cueIndex: 2, shellIndex: 0, layerIndex: 0 }
    });
    expect(store.undo()).toBe(true);
    expect(store.getState().definition.variants.long.cues.map(cue => cue.timeMs))
      .toEqual([1000, 2000, 3000]);
    expect(store.undo()).toBe(false);
  });

  test('undo and redo restore complete editable snapshots and transactions coalesce', () => {
    const store = new ShowDesignerStore({ historyLimit: 4 });
    store.loadShow(record());
    store.beginTransaction('target-drag');
    store.setShellTarget(0, 0, { x: 0.6, y: 0.4 });
    store.setShellTarget(0, 0, { x: 0.7, y: 0.45 });
    store.commitTransaction();

    expect(store.getState().definition.variants.long.cues[0].shells[0].target.x).toBe(0.7);
    expect(store.undo()).toBe(true);
    expect(store.getState().definition.variants.long.cues[0].shells[0].target.x).toBe(0.5);
    expect(store.redo()).toBe(true);
    expect(store.getState().definition.variants.long.cues[0].shells[0].target.x).toBe(0.7);
  });

  test('maps structured validator paths to cue, shell, and layer selections', () => {
    const mapped = mapValidationIssues([
      { path: 'variants.long.cues.2.shells.1.layers.3.colors', code: 'COLORS_REQUIRED' },
      { path: 'variants.medium.cues.4.timeMs', code: 'TIME_OUT_OF_RANGE' },
      { path: 'metadata.name', code: 'NAME_REQUIRED' }
    ]);

    expect(mapped.byPath['variants.long.cues.2.shells.1.layers.3.colors'][0].code)
      .toBe('COLORS_REQUIRED');
    expect(mapped.locations[0]).toEqual(expect.objectContaining({
      variant: 'long', cueIndex: 2, shellIndex: 1, layerIndex: 3, field: 'colors'
    }));
    expect(mapped.locations[1]).toEqual(expect.objectContaining({
      variant: 'medium', cueIndex: 4, shellIndex: null, layerIndex: null, field: 'timeMs'
    }));
    expect(mapped.global).toHaveLength(1);
  });

  test('records server revisions, validation diagnostics, and 409 conflicts without losing edits', () => {
    const store = new ShowDesignerStore();
    store.loadShow(record());
    store.updateMetadata({ name: 'Unsaved name' });
    const generation = store.beginSave();
    store.updateMetadata({ description: 'Edited during save' });
    store.finishSave(generation, { revision: 4, definition: definition() });
    expect(store.getState().revision).toBe(4);
    expect(store.getState().persistence.dirty).toBe(true);

    store.markConflict({ currentRevision: 7 });
    expect(store.getState().persistence.status).toBe('conflict');
    expect(store.getState().persistence.conflict.currentRevision).toBe(7);
    expect(store.getState().definition.metadata.description).toBe('Edited during save');

    store.updateMetadata({ description: 'Still local after conflict' });
    expect(store.getState().persistence).toEqual(expect.objectContaining({
      dirty: true,
      status: 'conflict',
      conflict: { currentRevision: 7 }
    }));
  });
});
