const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const {
  ShowDesignerStore
} = require('../plugins/webgpu-fireworks/ui/show-designer-model');
const {
  ShowDesignerView
} = require('../plugins/webgpu-fireworks/ui/show-designer-view');
const {
  ShowDesignerApp,
  createStarterDefinition
} = require('../plugins/webgpu-fireworks/ui/show-designer');

const appDir = path.join(__dirname, '..');
const uiDir = path.join(appDir, 'plugins', 'webgpu-fireworks', 'ui');
const html = fs.readFileSync(path.join(uiDir, 'designer.html'), 'utf8');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function customRecord(overrides = {}) {
  const id = overrides.id || 'custom:00000000-0000-4000-8000-000000000701';
  const definition = createStarterDefinition('Custom Study');
  definition.id = id;
  definition.variants.long.cues.push({
    ...clone(definition.variants.long.cues[0]),
    timeMs: 3600,
    phase: 'build'
  });
  return {
    id,
    builtIn: false,
    revision: overrides.revision ?? 4,
    validatedRevision: null,
    publishedRevision: null,
    archived: false,
    definition,
    ...overrides
  };
}

function builtInRecord() {
  const record = customRecord({ id: 'classic-crescendo', revision: 0, builtIn: true });
  record.definition.id = 'classic-crescendo';
  record.definition.metadata.name = 'Classic Crescendo';
  return record;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('WebGPU Fireworks standalone Show Designer UI', () => {
  let dom;
  let api;
  let app;
  let records;
  let translations;
  let i18nHandlers;

  beforeEach(async () => {
    dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'http://localhost:3000/webgpu-fireworks/designer',
      pretendToBeVisual: true
    });
    dom.window.confirm = jest.fn(() => true);
    dom.window.alert = jest.fn();
    dom.window.URL.createObjectURL = jest.fn(() => 'blob:test');
    dom.window.URL.revokeObjectURL = jest.fn();
    translations = {
      'plugins.webgpu-fireworks.designer.create': 'Create EN',
      'plugins.webgpu-fireworks.designer.options.phase.opening': 'Opening EN',
      'plugins.webgpu-fireworks.designer.options.formation.single': 'Single EN',
      'plugins.webgpu-fireworks.designer.fields.phase': 'Phase EN',
      'plugins.webgpu-fireworks.designer.aria.shell_handle': 'Shell EN {count}',
      'plugins.webgpu-fireworks.designer.unsaved_changes': 'Unsaved EN'
    };
    i18nHandlers = { change: [], languageChange: [] };
    dom.window.i18n = {
      init: jest.fn(async () => {}),
      t: jest.fn(key => translations[key] || key),
      updateDOM: jest.fn(() => {
        for (const element of dom.window.document.querySelectorAll('[data-i18n]')) {
          const key = element.getAttribute('data-i18n');
          if (translations[key]) element.textContent = translations[key];
        }
        for (const element of dom.window.document.querySelectorAll('[data-i18n-aria-label]')) {
          const key = element.getAttribute('data-i18n-aria-label');
          if (translations[key]) element.setAttribute('aria-label', translations[key]);
        }
        for (const element of dom.window.document.querySelectorAll('[data-i18n-title]')) {
          const key = element.getAttribute('data-i18n-title');
          if (translations[key]) element.title = translations[key];
        }
      }),
      onChange: jest.fn(handler => i18nHandlers.change.push(handler)),
      onLanguageChange: jest.fn(handler => i18nHandlers.languageChange.push(handler)),
      offChange: jest.fn()
    };
    records = [builtInRecord(), customRecord()];
    api = {
      listShows: jest.fn(async () => ({
        success: true,
        shows: records.map(({ definition, ...summary }) => ({
          ...summary,
          name: definition.metadata.name,
          description: definition.metadata.description
        }))
      })),
      getShow: jest.fn(async id => ({
        success: true,
        show: clone(records.find(record => record.id === id))
      })),
      createShow: jest.fn(async definition => ({
        success: true,
        show: customRecord({
          id: 'custom:00000000-0000-4000-8000-000000000702',
          revision: 1,
          definition: { ...clone(definition), id: 'custom:00000000-0000-4000-8000-000000000702' }
        })
      })),
      duplicate: jest.fn(async () => ({ success: true, show: customRecord() })),
      saveDraft: jest.fn(async (id, definition, expectedRevision) => ({
        success: true,
        show: { ...customRecord({ id, definition }), revision: expectedRevision + 1 }
      })),
      validate: jest.fn(async () => ({ success: true, autoDerived: false, show: customRecord() })),
      derive: jest.fn(async () => ({ success: true, show: customRecord({ revision: 5 }) })),
      publish: jest.fn(async () => ({ success: true, show: customRecord({ publishedRevision: 5 }) })),
      archive: jest.fn(async () => ({ success: true, show: customRecord({ archived: true }) })),
      restore: jest.fn(async () => ({ success: true, show: customRecord({ archived: false }) })),
      preview: jest.fn(async () => ({ success: true, requestId: 'preview:1' })),
      importDefinition: jest.fn(async definition => ({
        success: true,
        show: customRecord({ definition: clone(definition) })
      })),
      exportDefinition: jest.fn(async () => ({
        success: true,
        definition: customRecord().definition
      }))
    };
    const store = new ShowDesignerStore();
    const view = new ShowDesignerView(dom.window.document, {
      translate: (key, fallback, params) => {
        const translated = dom.window.i18n.t(key, params);
        return translated === key ? fallback : translated;
      }
    });
    app = new ShowDesignerApp({
      window: dom.window,
      document: dom.window.document,
      api,
      store,
      view,
      autosaveDelayMs: 1200
    });
    await app.init();
  });

  afterEach(() => {
    app?.destroy();
    dom?.window.close();
    jest.useRealTimers();
  });

  test('ships a strict-CSP, external-script-only four-panel responsive workspace', () => {
    const document = dom.window.document;
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(csp.content).toContain("script-src 'self'");
    expect(csp.content).not.toContain("'unsafe-inline'");
    expect([...document.scripts].every(script => script.src && !script.textContent.trim())).toBe(true);
    expect(document.querySelectorAll('[onclick], [onchange], [onpointerdown]')).toHaveLength(0);
    expect(document.getElementById('show-library')).not.toBeNull();
    expect(document.getElementById('show-stage')).not.toBeNull();
    expect(document.getElementById('cue-timeline')).not.toBeNull();
    expect(document.getElementById('layer-inspector')).not.toBeNull();
    expect(fs.readFileSync(path.join(uiDir, 'designer.css'), 'utf8')).toMatch(/@media\s*\(max-width:/);
  });

  test('loads the library, keeps built-ins read-only, and duplicates them for editing', async () => {
    const document = dom.window.document;
    expect(document.querySelectorAll('[data-show-id]')).toHaveLength(2);
    expect(document.querySelector('[data-show-id="classic-crescendo"]').classList)
      .toContain('is-selected');
    expect(document.getElementById('designer-readonly-notice').hidden).toBe(false);
    expect(document.querySelector('[data-action="add-cue"]').disabled).toBe(true);

    document.querySelector('[data-action="duplicate"]').click();
    await tick();

    expect(api.duplicate).toHaveBeenCalledWith('classic-crescendo', 0, undefined);
    expect(app.store.getState().readOnly).toBe(false);
    expect(document.querySelector('[data-action="add-cue"]').disabled).toBe(false);

    document.querySelector('[data-action="create"]').click();
    await tick();
    expect(api.createShow).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1,
      materialProfile: 'premium-realistic',
      variants: { long: expect.objectContaining({ durationMs: 28000 }) }
    }));
  });

  test('creates a show and edits variants, timeline, stage handles and layer inspector', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    expect(app.store.getState().selectedVariant).toBe('long');

    document.querySelector('[data-variant="medium"]').click();
    expect(app.store.getState().selectedVariant).toBe('medium');
    document.querySelector('[data-variant="long"]').click();

    document.querySelector('[data-cue-index="0"]')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    document.querySelector('.cue-marker[data-cue-index="1"]')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(app.store.getState().selection.cueIndexes).toEqual([0, 1]);

    const firstTime = app.store.getState().definition.variants.long.cues[0].timeMs;
    const timeline = document.getElementById('timeline-track');
    timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 100 });
    const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'clientX', { value: 250 });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: () => '0', dropEffect: '' }
    });
    timeline.dispatchEvent(drop);
    expect(app.store.getState().definition.variants.long.cues[0].timeMs).not.toBe(firstTime);

    const shell = document.querySelector('[data-shell-key]');
    shell.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const targetX = document.querySelector('[data-field="target.x"]');
    targetX.value = '0.63';
    targetX.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const selectedCue = app.store.getState().selection.primaryCueIndex;
    expect(app.store.getState().definition.variants.long.cues[selectedCue].shells[0].target.x).toBe(0.63);

    document.querySelector('[data-action="add-layer"]').click();
    document.querySelector('[data-action="add-layer"]').click();
    document.querySelector('[data-action="add-layer"]').click();
    expect(app.store.getState().definition.variants.long.cues[selectedCue].shells[0].layers).toHaveLength(4);
    expect(document.querySelector('[data-action="add-layer"]').disabled).toBe(true);
  });

  test('snaps edits unless Alt is held and supports undo/redo buttons and shortcuts', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    const cue = document.querySelector('[data-cue-index="0"]');
    cue.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const input = document.querySelector('[data-field="timeMs"]');
    input.value = '1649';
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(app.store.getState().definition.variants.long.cues[0].timeMs).toBe(1600);

    document.querySelector('[data-action="undo"]').click();
    expect(app.store.getState().definition.variants.long.cues[0].timeMs).toBe(1500);
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'z', ctrlKey: true, shiftKey: true, bubbles: true
    }));
    expect(app.store.getState().definition.variants.long.cues[0].timeMs).toBe(1600);
  });

  test('multi-selects stage handles and drags the formation as one snapped transaction', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    document.querySelector('.cue-marker[data-cue-index="0"]').click();
    document.querySelector('[data-action="add-shell"]').click();

    document.querySelector('.shell-handle[data-shell-index="0"]')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    document.querySelector('.shell-handle[data-shell-index="1"]')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(app.store.getState().selection.shells).toHaveLength(2);

    const stage = document.getElementById('stage-canvas');
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 });
    document.querySelector('.shell-handle[data-shell-index="0"]')
      .dispatchEvent(new dom.window.MouseEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 100, clientY: 100
      }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', {
      bubbles: true, clientX: 151, clientY: 100
    }));
    dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }));

    const shells = app.store.getState().definition.variants.long.cues[0].shells;
    expect(shells.map(shell => shell.target.x)).toEqual([0.55, 0.43]);
    expect(app.store.getState().history.canUndo).toBe(true);
  });

  test('autosaves after 1200ms, exposes revision states and keeps edits made during a save', async () => {
    jest.useFakeTimers();
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    const pending = deferred();
    api.saveDraft.mockReturnValueOnce(pending.promise);
    const name = document.querySelector('[data-field="metadata.name"]');
    name.value = 'Autosave Study';
    name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(document.getElementById('designer-save-status').dataset.status).toBe('dirty');
    jest.advanceTimersByTime(1199);
    expect(api.saveDraft).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await tick();
    expect(document.getElementById('designer-save-status').dataset.status).toBe('saving');

    const liveName = document.querySelector('[data-field="metadata.name"]');
    liveName.value = 'Edited while saving';
    liveName.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    pending.resolve({ success: true, show: customRecord({ revision: 5 }) });
    await tick();
    expect(app.store.getState().revision).toBe(5);
    expect(app.store.getState().persistence.status).toBe('dirty');
    expect(document.querySelector('[data-show-id^="custom:"]').textContent).toContain('r5');
  });

  test('keeps inspector focus and caret stable while live text edits rerender the workspace', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    const name = document.querySelector('[data-field="metadata.name"]');
    name.focus();
    name.value = 'Focused Study';
    name.setSelectionRange(3, 3);
    name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(document.activeElement.dataset.field).toBe('metadata.name');
    expect(document.activeElement.selectionStart).toBe(3);
    expect(app.store.getState().definition.metadata.name).toBe('Focused Study');
  });

  test('rerenders a live language switch without reload, state loss or duplicate callbacks', async () => {
    const document = dom.window.document;
    expect(dom.window.i18n.init).toHaveBeenCalledTimes(1);
    expect(i18nHandlers.change).toHaveLength(1);
    expect(i18nHandlers.languageChange).toHaveLength(1);

    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    document.querySelector('.cue-marker[data-cue-index="0"]').click();
    document.querySelector('.shell-handle[data-shell-index="0"]')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const name = document.querySelector('[data-field="metadata.name"]');
    name.focus();
    name.value = 'User-authored Pyro Name';
    name.setSelectionRange(7, 7);
    name.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const before = app.store.getState();
    const apiCalls = { list: api.listShows.mock.calls.length, get: api.getShow.mock.calls.length };

    Object.assign(translations, {
      'plugins.webgpu-fireworks.designer.create': 'Show erstellen',
      'plugins.webgpu-fireworks.designer.options.phase.opening': 'Eröffnung',
      'plugins.webgpu-fireworks.designer.options.formation.single': 'Einzeln',
      'plugins.webgpu-fireworks.designer.fields.phase': 'Phase',
      'plugins.webgpu-fireworks.designer.aria.shell_handle': 'Feuerwerkskörper {count}',
      'plugins.webgpu-fireworks.designer.unsaved_changes': 'Ungespeicherte Änderungen'
    });
    i18nHandlers.languageChange[0]('de');
    await tick();

    expect(document.querySelector('[data-action="create"]').textContent).toBe('Show erstellen');
    expect(document.querySelector('[data-field="phase"] option[value="opening"]').textContent).toBe('Eröffnung');
    expect(document.querySelector('.cue-phase').textContent).toBe('Eröffnung');
    expect(document.querySelector('.shell-handle').getAttribute('aria-label')).toBe('Feuerwerkskörper 1');
    expect(document.getElementById('designer-save-status').textContent).toBe('Ungespeicherte Änderungen');
    expect(document.querySelector('[data-field="metadata.name"]').value).toBe('User-authored Pyro Name');
    expect(app.store.getState()).toMatchObject({
      selectedShowId: before.selectedShowId,
      selectedVariant: before.selectedVariant,
      selection: before.selection,
      persistence: { dirty: true }
    });
    expect(document.activeElement.dataset.field).toBe('metadata.name');
    expect(document.activeElement.selectionStart).toBe(7);
    expect(api.listShows).toHaveBeenCalledTimes(apiCalls.list);
    expect(api.getShow).toHaveBeenCalledTimes(apiCalls.get);

    Object.assign(translations, {
      'plugins.webgpu-fireworks.designer.create': 'Créer un show',
      'plugins.webgpu-fireworks.designer.options.phase.opening': 'Ouverture'
    });
    const render = jest.spyOn(app.view, 'render');
    const rendersBefore = render.mock.calls.length;
    i18nHandlers.change[0]('fr');
    i18nHandlers.languageChange[0]('fr');
    await tick();
    expect(render).toHaveBeenCalledTimes(rendersBefore + 1);
    expect(document.querySelector('[data-action="create"]').textContent).toBe('Créer un show');
    expect(document.querySelector('.cue-phase').textContent).toBe('Ouverture');
    expect(api.listShows).toHaveBeenCalledTimes(apiCalls.list);
    expect(api.getShow).toHaveBeenCalledTimes(apiCalls.get);
  });

  test('stops conflict retries and offers reload-server or save-local-as-new resolution', async () => {
    jest.useFakeTimers();
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    api.saveDraft.mockRejectedValueOnce(Object.assign(new Error('Changed elsewhere'), {
      status: 409,
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 9 }
    }));
    app.store.updateMetadata({ name: 'Local conflict' });
    jest.advanceTimersByTime(1200);
    await tick();
    expect(app.store.getState().persistence.status).toBe('conflict');
    expect(document.getElementById('designer-conflict').hidden).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);

    document.querySelector('[data-action="conflict-reload"]').click();
    await tick();
    expect(api.getShow).toHaveBeenCalledTimes(3);

    app.store.updateMetadata({ name: 'Keep this local copy' });
    app.store.markConflict({ currentRevision: 10 });
    document.querySelector('[data-action="conflict-copy"]').click();
    await tick();
    expect(api.createShow).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ name: expect.stringContaining('Keep this local copy') })
    }));
  });

  test('maps validation issues to navigation and only previews from explicit controls', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    api.validate.mockResolvedValueOnce({
      success: true,
      autoDerived: false,
      show: {
        ...customRecord(),
        validation: {
          valid: false,
          errors: [{
            path: 'variants.long.cues.1.shells.0.layers.0.colors',
            code: 'colors_required',
            message: 'Choose a color.'
          }]
        }
      }
    });

    document.querySelector('[data-action="validate"]').click();
    await tick();
    expect(api.validate).toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
    const issue = document.querySelector('[data-issue-index="0"]');
    expect(issue.textContent).toContain('Choose a color');
    issue.click();
    expect(app.store.getState().selection.layer).toEqual({ cueIndex: 1, shellIndex: 0, layerIndex: 0 });

    document.querySelector('[data-action="preview-cue"]').click();
    await tick();
    expect(api.preview).toHaveBeenLastCalledWith(expect.any(String), expect.any(Number), expect.objectContaining({
      scope: 'cue', cueIndex: 1, variant: 'long'
    }));
    document.querySelector('[data-action="preview-phase"]').click();
    document.querySelector('[data-action="preview-show"]').click();
    await tick();
    expect(api.preview).toHaveBeenCalledTimes(3);
  });

  test('handles first validation auto-derive, explicit overwrite confirmation, publish and archive lifecycle', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    const derived = customRecord({ revision: 6 });
    derived.definition.variants.medium = clone(derived.definition.variants.long);
    derived.definition.variants.medium.durationMs = 18000;
    derived.definition.variants.short = clone(derived.definition.variants.long);
    derived.definition.variants.short.durationMs = 10000;
    api.validate.mockResolvedValueOnce({
      success: true,
      autoDerived: true,
      derivedVariants: ['medium', 'short'],
      show: derived
    });
    document.querySelector('[data-action="validate"]').click();
    await tick();
    expect(document.getElementById('designer-notice').textContent).toMatch(/derived|created/i);

    document.querySelector('[data-action="derive"]').click();
    await tick();
    expect(dom.window.confirm).toHaveBeenCalled();
    expect(api.derive).toHaveBeenCalledWith(expect.any(String), expect.any(Number), {
      variants: ['medium', 'short'], seed: 7, overwrite: true, confirmOverwrite: true
    });

    document.querySelector('[data-action="publish"]').click();
    await tick();
    expect(api.publish).toHaveBeenCalled();
    document.querySelector('[data-action="archive"]').click();
    await tick();
    expect(api.archive).toHaveBeenCalled();
    document.querySelector('[data-action="restore"]').click();
    await tick();
    expect(api.restore).toHaveBeenCalled();
  });

  test('imports and exports validated JSON and warns before unloading dirty work', async () => {
    const document = dom.window.document;
    document.querySelector('[data-show-id^="custom:"]').click();
    await tick();
    await app.importText(JSON.stringify(customRecord().definition));
    expect(api.importDefinition).toHaveBeenCalled();
    await app.exportSelected();
    expect(api.exportDefinition).toHaveBeenCalled();

    app.store.updateMetadata({ name: 'Unsaved' });
    const event = new dom.window.Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
