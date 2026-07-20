(function exposeShowDesigner(root, factory) {
  const api = factory(root);
  if (root) root.WebGpuFireworksShowDesigner = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document && typeof module !== 'object') api.boot();
})(typeof window !== 'undefined' ? window : globalThis, function createShowDesigner(root) {
  'use strict';

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function interpolate(value, params = {}) {
    return String(value).replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
    ));
  }

  function keySegment(value) {
    return String(value || '').trim().toLowerCase().replace(/-/g, '_');
  }

  function modelModule() {
    if (root?.WebGpuFireworksShowDesignerModel) return root.WebGpuFireworksShowDesignerModel;
    if (typeof require === 'function') return require('./show-designer-model');
    throw new Error('Show Designer model is unavailable.');
  }

  function apiModule() {
    if (root?.WebGpuFireworksShowDesignerApi) return root.WebGpuFireworksShowDesignerApi;
    if (typeof require === 'function') return require('./show-designer-api');
    throw new Error('Show Designer API is unavailable.');
  }

  function viewModule() {
    if (root?.WebGpuFireworksShowDesignerView) return root.WebGpuFireworksShowDesignerView;
    if (typeof require === 'function') return require('./show-designer-view');
    throw new Error('Show Designer view is unavailable.');
  }

  function defaultLayer(overrides = {}) {
    return {
      primitive: 'radial',
      delayMs: 0,
      density: 72,
      size: 1,
      lifetimeMs: 1100,
      gravity: 0.72,
      drag: 0.04,
      trail: true,
      split: false,
      strobe: false,
      colors: ['#f6c453'],
      priority: 'core',
      core: true,
      ...clone(overrides)
    };
  }

  function defaultShell(overrides = {}) {
    return {
      origin: { x: 0.5, y: 1 },
      target: { x: 0.5, y: 0.38 },
      launchMode: 'rocket',
      tier: 'medium',
      palette: ['#f6c453'],
      layers: [defaultLayer()],
      ...clone(overrides)
    };
  }

  function defaultCue(timeMs = 1500, phase = 'opening', overrides = {}) {
    return {
      timeMs,
      phase,
      formation: 'single',
      importance: phase === 'finale' ? 'final-wave' : 'essential',
      shells: [defaultShell()],
      ...clone(overrides)
    };
  }

  function createStarterDefinition(name = 'Untitled Pyro Show') {
    return {
      schemaVersion: 1,
      id: 'custom:draft',
      metadata: {
        name: String(name || 'Untitled Pyro Show').trim() || 'Untitled Pyro Show',
        description: 'A custom 28-second WebGPU fireworks show.'
      },
      materialProfile: 'premium-realistic',
      autoEligible: false,
      variants: {
        long: {
          durationMs: 28000,
          cues: [
            defaultCue(1500, 'opening'),
            defaultCue(6000, 'build'),
            defaultCue(13000, 'highlight', {
              formation: 'ring-accent',
              shells: [defaultShell({ tier: 'big', layers: [defaultLayer({ primitive: 'ring' })] })]
            }),
            defaultCue(17500, 'breath', {
              formation: 'single',
              importance: 'essential',
              shells: [defaultShell({ tier: 'small', target: { x: 0.5, y: 0.32 } })]
            }),
            defaultCue(22500, 'finale', {
              formation: 'finale-wave-1',
              shells: [defaultShell({ tier: 'massive', target: { x: 0.5, y: 0.28 } })]
            })
          ]
        }
      }
    };
  }

  function parseCsv(value, fallback = []) {
    const result = String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 12);
    return result.length ? result : clone(fallback);
  }

  function summaryFromShow(show) {
    return {
      id: show.id,
      name: show.definition?.metadata?.name || show.id,
      description: show.definition?.metadata?.description || '',
      materialProfile: show.definition?.materialProfile || null,
      autoEligible: show.definition?.autoEligible === true,
      builtIn: show.builtIn === true,
      revision: show.revision ?? 0,
      validatedRevision: show.validatedRevision ?? null,
      publishedRevision: show.publishedRevision ?? null,
      archived: show.archived === true,
      updatedAt: show.updatedAt ?? null
    };
  }

  class ShowDesignerApp {
    constructor(options = {}) {
      this.window = options.window || root;
      this.document = options.document || this.window?.document;
      if (!this.document) throw new TypeError('A document is required for the Show Designer.');
      const { ShowDesignerStore } = modelModule();
      const { ShowDesignerApi } = apiModule();
      const { ShowDesignerView } = viewModule();
      this.store = options.store || new ShowDesignerStore();
      this.api = options.api || new ShowDesignerApi();
      this.translate = typeof options.translate === 'function'
        ? options.translate
        : (key, fallback, params) => {
          const translated = this.window?.i18n?.t?.(key, params);
          return translated && translated !== key ? translated : fallback;
        };
      this.view = options.view || new ShowDesignerView(this.document, { translate: this.translate });
      this.autosaveDelayMs = Number.isFinite(options.autosaveDelayMs)
        ? Math.max(0, options.autosaveDelayMs)
        : 1200;
      this.autosaveTimer = null;
      this.savePromise = null;
      this.destroyed = false;
      this.initialized = false;
      this.i18nBound = false;
      this.localizedRenderScheduled = false;
      this.drag = null;
      this.lastNoticeTimer = null;
      this.unsubscribe = this.store.subscribe((state, reason) => this.onStateChange(state, reason));
      this.bound = {
        click: event => this.onClick(event),
        input: event => this.onInput(event),
        change: event => this.onChange(event),
        keydown: event => this.onKeyDown(event),
        dragstart: event => this.onDragStart(event),
        dragover: event => this.onDragOver(event),
        drop: event => this.onDrop(event),
        pointerdown: event => this.onPointerDown(event),
        pointermove: event => this.onPointerMove(event),
        pointerup: event => this.onPointerUp(event),
        beforeunload: event => this.onBeforeUnload(event),
        languageChange: () => this.scheduleLocalizedRerender()
      };
    }

    t(key, fallback, params = {}) {
      return interpolate(this.translate(key, fallback, params) || fallback, params);
    }

    async init() {
      if (this.initialized) return this;
      this.initialized = true;
      await this.window?.i18n?.init?.();
      this.window?.i18n?.updateDOM?.();
      this.bindI18n();
      this.bindEvents();
      this.view.setBusy(true);
      try {
        const payload = await this.api.listShows();
        const catalog = Array.isArray(payload.shows) ? payload.shows : [];
        this.store.setCatalog(catalog);
        const requested = new this.window.URLSearchParams(this.window.location?.search || '').get('show');
        const first = catalog.find(show => show.id === requested) || catalog[0];
        if (first) await this.loadShow(first.id, { skipFlush: true });
        else this.view.render(this.store.getState());
      } catch (error) {
        this.handleError(error, 'load_library', 'Could not load the show library.');
        this.view.render(this.store.getState());
      }
      return this;
    }

    bindEvents() {
      this.document.addEventListener('click', this.bound.click);
      this.document.addEventListener('input', this.bound.input);
      this.document.addEventListener('change', this.bound.change);
      this.document.addEventListener('keydown', this.bound.keydown);
      this.document.addEventListener('dragstart', this.bound.dragstart);
      this.document.addEventListener('dragover', this.bound.dragover);
      this.document.addEventListener('drop', this.bound.drop);
      this.document.addEventListener('pointerdown', this.bound.pointerdown);
      this.window.addEventListener('pointermove', this.bound.pointermove);
      this.window.addEventListener('pointerup', this.bound.pointerup);
      this.window.addEventListener('beforeunload', this.bound.beforeunload);
    }

    bindI18n() {
      if (this.i18nBound) return;
      this.i18nBound = true;
      this.window?.i18n?.onChange?.(this.bound.languageChange);
      this.window?.i18n?.onLanguageChange?.(this.bound.languageChange);
    }

    scheduleLocalizedRerender() {
      if (this.destroyed || this.localizedRenderScheduled) return;
      this.localizedRenderScheduled = true;
      Promise.resolve().then(() => {
        this.localizedRenderScheduled = false;
        if (this.destroyed) return;
        this.window?.i18n?.updateDOM?.();
        this.view.render(this.store.getState());
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.unsubscribe?.();
      if (this.autosaveTimer) this.window.clearTimeout(this.autosaveTimer);
      if (this.lastNoticeTimer) this.window.clearTimeout(this.lastNoticeTimer);
      this.document.removeEventListener('click', this.bound.click);
      this.document.removeEventListener('input', this.bound.input);
      this.document.removeEventListener('change', this.bound.change);
      this.document.removeEventListener('keydown', this.bound.keydown);
      this.document.removeEventListener('dragstart', this.bound.dragstart);
      this.document.removeEventListener('dragover', this.bound.dragover);
      this.document.removeEventListener('drop', this.bound.drop);
      this.document.removeEventListener('pointerdown', this.bound.pointerdown);
      this.window.removeEventListener('pointermove', this.bound.pointermove);
      this.window.removeEventListener('pointerup', this.bound.pointerup);
      this.window.removeEventListener('beforeunload', this.bound.beforeunload);
      this.window?.i18n?.offChange?.(this.bound.languageChange);
    }

    onStateChange(state, reason) {
      this.view.render(state);
      const persistentReasons = new Set([
        'metadata', 'definition', 'cue', 'timeline', 'stage', 'shell', 'layer',
        'cue-add', 'cue-remove', 'shell-add', 'shell-remove', 'layer-add',
        'layer-remove', 'undo', 'redo'
      ]);
      if (persistentReasons.has(reason)
        && state.persistence.dirty
        && state.persistence.status !== 'conflict'
        && !state.readOnly) {
        this.scheduleAutosave();
      }
    }

    scheduleAutosave() {
      if (this.destroyed) return;
      if (this.autosaveTimer) this.window.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = this.window.setTimeout(() => {
        this.autosaveTimer = null;
        void this.flushSave();
      }, this.autosaveDelayMs);
    }

    async flushSave() {
      if (this.destroyed) return false;
      if (this.autosaveTimer) {
        this.window.clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;
      }
      const state = this.store.getState();
      if (state.readOnly || !state.definition || !state.persistence.dirty) return true;
      if (state.persistence.status === 'conflict') return false;
      if (this.savePromise) {
        await this.savePromise;
        const current = this.store.getState();
        if (current.persistence.status === 'conflict') return false;
        return current.persistence.dirty ? this.flushSave() : true;
      }
      const token = this.store.beginSave();
      this.savePromise = this.api.saveDraft(
        state.selectedShowId,
        token.definition,
        token.revision
      );
      try {
        const response = await this.savePromise;
        this.upsertCatalog(response.show);
        this.store.finishSave(token, response.show);
        if (this.store.getState().persistence.dirty) this.scheduleAutosave();
        return true;
      } catch (error) {
        if (error?.status === 409 || error?.code === 'REVISION_CONFLICT') {
          this.store.markConflict(error.details || {});
        } else {
          this.store.markSaveError(error);
        }
        return false;
      } finally {
        this.savePromise = null;
      }
    }

    async refreshCatalog(options = {}) {
      const payload = await this.api.listShows();
      const catalog = Array.isArray(payload.shows) ? payload.shows : [];
      this.store.setCatalog(catalog);
      if (options.loadId) await this.loadShow(options.loadId, { skipFlush: true });
      return catalog;
    }

    upsertCatalog(show) {
      const summary = summaryFromShow(show);
      const state = this.store.getState();
      const catalog = [...state.catalog];
      const index = catalog.findIndex(item => item.id === show.id);
      if (index === -1) catalog.push(summary);
      else catalog[index] = summary;
      this.store.setCatalog(catalog);
    }

    adoptShow(show, options = {}) {
      const variant = options.variant || this.store.getState().selectedVariant;
      this.upsertCatalog(show);
      this.store.loadShow(show);
      if (show.definition?.variants?.[variant]) this.store.setVariant(variant);
    }

    async loadShow(id, options = {}) {
      if (!options.skipFlush && !(await this.flushSave())) return false;
      this.view.setBusy(true);
      try {
        const response = await this.api.getShow(id);
        this.store.loadShow(response.show);
        return true;
      } catch (error) {
        this.handleError(error, 'load_show', 'Could not load this show.');
        return false;
      } finally {
        this.view.setBusy(false);
      }
    }

    notice(message, kind = 'info', timeoutMs = 5000) {
      if (this.lastNoticeTimer) this.window.clearTimeout(this.lastNoticeTimer);
      this.view.showNotice(message, kind);
      if (timeoutMs > 0) {
        this.lastNoticeTimer = this.window.setTimeout(() => {
          this.lastNoticeTimer = null;
          this.view.showNotice('');
        }, timeoutMs);
      }
    }

    errorMessage(error, fallbackKey = 'action_failed', fallback = 'The show action failed.') {
      const code = keySegment(error?.code);
      const knownCodes = new Set([
        'network_error', 'invalid_response', 'request_failed', 'finale_busy',
        'renderer_not_ready', 'renderer_upgrade_required', 'preview_draft_invalid', 'revision_conflict', 'invalid_json'
      ]);
      return this.t(
        `plugins.webgpu-fireworks.designer.errors.${knownCodes.has(code) ? code : fallbackKey}`,
        fallback
      );
    }

    handleError(error, fallbackKey = 'action_failed', fallback = 'The show action failed.') {
      const message = this.errorMessage(error, fallbackKey, fallback);
      this.notice(message, 'error', 8000);
    }

    async onClick(event) {
      const target = event.target;
      if (!(target instanceof this.window.Element)) return;
      const actionControl = target.closest('[data-action]');
      if (actionControl && !actionControl.disabled) {
        event.preventDefault();
        try {
          await this.runAction(actionControl.dataset.action, actionControl);
        } catch (error) {
          this.handleError(error);
        }
        return;
      }
      const filter = target.closest('[data-library-filter]');
      if (filter) {
        this.view.setFilter(filter.dataset.libraryFilter);
        this.view.render(this.store.getState());
        return;
      }
      const show = target.closest('[data-show-id]');
      if (show) {
        await this.loadShow(show.dataset.showId);
        return;
      }
      const variant = target.closest('[data-variant]');
      if (variant && !variant.disabled) {
        this.store.setVariant(variant.dataset.variant);
        return;
      }
      const shell = target.closest('.shell-handle');
      if (shell) {
        this.store.selectShell(Number(shell.dataset.cueIndex), Number(shell.dataset.shellIndex), {
          additive: event.ctrlKey || event.metaKey || event.shiftKey,
          toggle: event.ctrlKey || event.metaKey
        });
        return;
      }
      const cue = target.closest('.cue-marker');
      if (cue) {
        this.store.selectCue(Number(cue.dataset.cueIndex), {
          additive: event.ctrlKey || event.metaKey || event.shiftKey,
          toggle: event.ctrlKey || event.metaKey
        });
        return;
      }
      const issue = target.closest('[data-issue-index]');
      if (issue) this.navigateToIssue(Number(issue.dataset.issueIndex));
    }

    async runAction(action, control) {
      switch (action) {
        case 'create':
          await this.createShow();
          break;
        case 'duplicate':
          await this.duplicateSelected();
          break;
        case 'refresh':
          await this.refreshCatalog();
          break;
        case 'undo':
          this.store.undo();
          break;
        case 'redo':
          this.store.redo();
          break;
        case 'add-cue':
          this.addCue();
          break;
        case 'remove-cue':
          this.store.removeSelectedCues();
          break;
        case 'add-shell':
          this.addShell();
          break;
        case 'remove-shell':
          this.removeShell();
          break;
        case 'select-layer':
          this.store.selectLayer(
            Number(control.dataset.cueIndex),
            Number(control.dataset.shellIndex),
            Number(control.dataset.layerIndex)
          );
          break;
        case 'add-layer':
          this.addLayer();
          break;
        case 'remove-layer':
          this.removeLayer();
          break;
        case 'validate':
          await this.validateSelected();
          break;
        case 'derive':
          await this.deriveSelected();
          break;
        case 'publish':
          await this.lifecycleAction('publish');
          break;
        case 'archive':
          if (this.window.confirm(this.t(
            'plugins.webgpu-fireworks.designer.prompts.archive',
            'Archive this show? It can be restored later.'
          ))) {
            await this.lifecycleAction('archive');
          }
          break;
        case 'restore':
          await this.lifecycleAction('restore');
          break;
        case 'import':
          this.document.getElementById('show-import-file')?.click();
          break;
        case 'export':
          await this.exportSelected();
          break;
        case 'preview-cue':
          await this.preview('cue');
          break;
        case 'preview-phase':
          await this.preview('phase');
          break;
        case 'preview-show':
          await this.preview('show');
          break;
        case 'conflict-reload':
          await this.loadShow(this.store.getState().selectedShowId, { skipFlush: true });
          break;
        case 'conflict-copy':
          await this.saveConflictAsCopy();
          break;
        default:
          break;
      }
    }

    async createShow() {
      if (!(await this.flushSave())) return;
      const response = await this.api.createShow(createStarterDefinition());
      this.adoptShow(response.show, { variant: 'long' });
      this.notice(this.t(
        'plugins.webgpu-fireworks.designer.notices.created',
        'New 28-second master show created.'
      ));
    }

    async duplicateSelected() {
      if (!(await this.flushSave())) return;
      const state = this.store.getState();
      if (!state.selectedShowId) return;
      const response = await this.api.duplicate(state.selectedShowId, state.revision, undefined);
      this.adoptShow(response.show, { variant: state.selectedVariant });
      this.notice(this.t(
        'plugins.webgpu-fireworks.designer.notices.duplicated',
        'Editable copy created with the original show geometry.'
      ));
    }

    addCue() {
      const state = this.store.getState();
      const variant = state.definition?.variants?.[state.selectedVariant];
      if (!variant) return;
      const lastTime = variant.cues.reduce((maximum, cue) => Math.max(maximum, Number(cue.timeMs) || 0), 0);
      const timeMs = Math.min(variant.durationMs - 1500, lastTime + 1000);
      this.store.addCue(defaultCue(Math.max(0, timeMs), timeMs > variant.durationMs * 0.68 ? 'finale' : 'build'));
      const current = this.store.getState().definition.variants[state.selectedVariant].cues;
      const cueIndex = current.findIndex(cue => cue.timeMs === timeMs);
      if (cueIndex >= 0) this.store.selectCue(cueIndex);
    }

    addShell() {
      const state = this.store.getState();
      const cueIndex = state.selection.primaryCueIndex;
      if (!Number.isInteger(cueIndex)) return;
      const cue = state.definition.variants[state.selectedVariant].cues[cueIndex];
      const offset = ((cue.shells?.length || 0) % 5 - 2) * 0.12;
      this.store.addShell(cueIndex, defaultShell({ target: { x: 0.5 + offset, y: 0.4 } }));
      this.store.selectShell(cueIndex, cue.shells.length);
    }

    removeShell() {
      const selection = this.store.getState().selection.primaryShell;
      if (selection) this.store.removeShell(selection.cueIndex, selection.shellIndex);
    }

    addLayer() {
      const selection = this.store.getState().selection.primaryShell;
      if (!selection) return;
      this.store.addLayer(selection.cueIndex, selection.shellIndex, defaultLayer({
        primitive: 'ring',
        density: 48,
        colors: ['#8fd8ff'],
        priority: 'accent',
        core: false
      }));
      const layers = this.store.getState().definition
        .variants[this.store.getState().selectedVariant]
        .cues[selection.cueIndex].shells[selection.shellIndex].layers;
      this.store.selectLayer(selection.cueIndex, selection.shellIndex, layers.length - 1);
    }

    removeLayer() {
      const state = this.store.getState();
      const selection = state.selection.primaryShell;
      if (!selection) return;
      const layerIndex = state.selection.layer?.layerIndex ?? 0;
      this.store.removeLayer(selection.cueIndex, selection.shellIndex, layerIndex);
      this.store.selectShell(selection.cueIndex, selection.shellIndex);
    }

    async validateSelected() {
      if (!(await this.flushSave())) return;
      const state = this.store.getState();
      const response = await this.api.validate(state.selectedShowId, state.revision);
      this.adoptShow(response.show, { variant: state.selectedVariant });
      const valid = response.show.validation?.valid !== false;
      if (response.autoDerived) {
        const variants = (response.derivedVariants || []).map(variant => this.t(
          `plugins.webgpu-fireworks.designer.variants.${keySegment(variant)}`,
          variant
        )).join(', ');
        this.notice(this.t(
          'plugins.webgpu-fireworks.designer.notices.validation_auto_derived',
          'Validation passed. {variants} were derived from the long master.',
          { variants }
        ));
      } else if (valid) {
        this.notice(this.t(
          'plugins.webgpu-fireworks.designer.notices.validation_passed',
          'Validation passed.'
        ));
      } else {
        this.notice(this.t(
          'plugins.webgpu-fireworks.designer.notices.validation_issues',
          'Validation found issues. Select an issue to navigate to it.'
        ), 'error', 8000);
      }
    }

    async deriveSelected() {
      if (!(await this.flushSave())) return;
      if (!this.window.confirm(this.t(
        'plugins.webgpu-fireworks.designer.prompts.derive_overwrite',
        'Regenerate Medium and Short from Long? Existing variants will be overwritten.'
      ))) return;
      const state = this.store.getState();
      const response = await this.api.derive(state.selectedShowId, state.revision, {
        variants: ['medium', 'short'],
        seed: 7,
        overwrite: true,
        confirmOverwrite: true
      });
      this.adoptShow(response.show, { variant: state.selectedVariant });
      this.notice(this.t(
        'plugins.webgpu-fireworks.designer.notices.derived',
        'Medium and Short were regenerated from the Long master.'
      ));
    }

    async lifecycleAction(action) {
      if (!(await this.flushSave())) return;
      const state = this.store.getState();
      const response = await this.api[action](state.selectedShowId, state.revision);
      this.adoptShow(response.show, { variant: state.selectedVariant });
      const lifecycle = {
        publish: ['published', 'Show published.'],
        archive: ['archived', 'Show archived.'],
        restore: ['restored', 'Show restored.']
      }[action];
      this.notice(this.t(
        `plugins.webgpu-fireworks.designer.notices.${lifecycle[0]}`,
        lifecycle[1]
      ));
    }

    async preview(scope) {
      if (!(await this.flushSave())) return;
      const state = this.store.getState();
      const cueIndex = state.selection.primaryCueIndex;
      const cue = Number.isInteger(cueIndex)
        ? state.definition?.variants?.[state.selectedVariant]?.cues?.[cueIndex]
        : null;
      if ((scope === 'cue' || scope === 'phase') && !cue) return;
      const options = {
        variant: state.selectedVariant,
        scope,
        intensity: 3,
        seed: 7
      };
      if (scope === 'cue') options.cueIndex = cueIndex;
      if (scope === 'phase') options.phase = cue.phase;
      this.store.setPreview('pending');
      try {
        const response = await this.api.preview(state.selectedShowId, state.revision, options);
        this.store.setPreview('success', { requestId: response.requestId });
        this.notice(this.t(
          'plugins.webgpu-fireworks.designer.notices.preview_accepted',
          'Preview accepted by the connected WebGPU overlay.'
        ));
      } catch (error) {
        this.store.setPreview('error', { error: this.errorMessage(error, 'preview_failed', 'Preview failed.') });
        throw error;
      }
    }

    navigateToIssue(issueIndex) {
      const state = this.store.getState();
      const issue = state.validation.errors?.[issueIndex];
      if (!issue) return;
      const location = state.validation.mapped.locations.find(candidate => candidate.path === issue.path);
      if (!location) return;
      this.store.setVariant(location.variant);
      if (Number.isInteger(location.layerIndex)) {
        this.store.selectLayer(location.cueIndex, location.shellIndex, location.layerIndex);
      } else if (Number.isInteger(location.shellIndex)) {
        this.store.selectShell(location.cueIndex, location.shellIndex);
      } else {
        this.store.selectCue(location.cueIndex);
      }
    }

    async saveConflictAsCopy() {
      const definition = clone(this.store.getState().definition);
      const response = await this.api.createShow(definition);
      this.adoptShow(response.show, { variant: this.store.getState().selectedVariant });
      this.notice(this.t(
        'plugins.webgpu-fireworks.designer.notices.conflict_copy',
        'Local edits were saved as a new show.'
      ));
    }

    async importText(text) {
      let definition;
      try {
        definition = JSON.parse(text);
      } catch {
        const error = new Error('The selected file is not valid JSON.');
        error.code = 'INVALID_JSON';
        throw error;
      }
      if (!(await this.flushSave())) return false;
      const response = await this.api.importDefinition(definition);
      this.adoptShow(response.show, { variant: 'long' });
      this.notice(this.t(
        'plugins.webgpu-fireworks.designer.notices.imported',
        'Validated show imported.'
      ));
      return true;
    }

    async exportSelected() {
      const state = this.store.getState();
      if (!state.selectedShowId) return false;
      if (!(await this.flushSave())) return false;
      const response = await this.api.exportDefinition(state.selectedShowId);
      const blob = new this.window.Blob([`${JSON.stringify(response.definition, null, 2)}\n`], {
        type: 'application/json'
      });
      const url = this.window.URL.createObjectURL(blob);
      const anchor = this.document.createElement('a');
      const safeName = String(response.definition?.metadata?.name || 'fireworks-show')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'fireworks-show';
      anchor.href = url;
      anchor.download = `${safeName}.json`;
      anchor.hidden = true;
      this.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      this.window.setTimeout(() => this.window.URL.revokeObjectURL(url), 0);
      return true;
    }

    onInput(event) {
      const input = event.target;
      if (!(input instanceof this.window.HTMLInputElement || input instanceof this.window.HTMLTextAreaElement)) return;
      if (input.dataset.scope === 'metadata') this.applyField(input, event);
    }

    async onChange(event) {
      const input = event.target;
      if (input === this.document.getElementById('show-import-file')) {
        const file = input.files?.[0];
        if (!file) return;
        try {
          await this.importText(await file.text());
        } catch (error) {
          this.handleError(error, 'import_failed', 'Could not import this show.');
        } finally {
          input.value = '';
        }
        return;
      }
      if (!(input instanceof this.window.HTMLInputElement
        || input instanceof this.window.HTMLSelectElement
        || input instanceof this.window.HTMLTextAreaElement)) return;
      if (!input.dataset.scope || input.dataset.scope === 'metadata') return;
      this.applyField(input, event);
    }

    applyField(input, event) {
      const scope = input.dataset.scope;
      const field = input.dataset.field;
      const cueIndex = Number(input.dataset.cueIndex);
      const shellIndex = Number(input.dataset.shellIndex);
      const layerIndex = Number(input.dataset.layerIndex);
      let value = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'number') value = Number(value);
      if (scope === 'metadata') {
        this.store.updateMetadata({ [field.replace(/^metadata\./, '')]: value });
      } else if (scope === 'definition') {
        this.store.updateDefinitionField(field, value);
      } else if (scope === 'cue') {
        this.store.setCueField(cueIndex, field, value, { bypass: event.altKey === true });
      } else if (scope === 'shell-coordinate') {
        const state = this.store.getState();
        const shell = state.definition.variants[state.selectedVariant].cues[cueIndex].shells[shellIndex];
        const [coordinate, axis] = field.split('.');
        const next = { ...clone(shell[coordinate]), [axis]: value };
        if (coordinate === 'target') {
          this.store.setShellTarget(cueIndex, shellIndex, next, { bypass: event.altKey === true });
        } else {
          const { snapCoordinate } = modelModule();
          next[axis] = snapCoordinate(value, { bypass: event.altKey === true });
          this.store.setShellField(cueIndex, shellIndex, coordinate, next);
        }
      } else if (scope === 'shell-array') {
        this.store.setShellField(cueIndex, shellIndex, field, parseCsv(value, ['#ffffff']));
      } else if (scope === 'shell') {
        this.store.setShellField(cueIndex, shellIndex, field, value);
      } else if (scope === 'layer-array') {
        this.store.setLayerField(cueIndex, shellIndex, layerIndex, field, parseCsv(value, ['#ffffff']).slice(0, 4));
      } else if (scope === 'layer') {
        this.store.setLayerField(cueIndex, shellIndex, layerIndex, field, value);
      }
    }

    onKeyDown(event) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.store.redo();
        else this.store.undo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        this.store.redo();
      }
    }

    onDragStart(event) {
      const marker = event.target instanceof this.window.Element
        ? event.target.closest('.cue-marker')
        : null;
      if (!marker || this.store.getState().readOnly) return;
      const cueIndex = Number(marker.dataset.cueIndex);
      if (!this.store.getState().selection.cueIndexes.includes(cueIndex)) this.store.selectCue(cueIndex);
      event.dataTransfer?.setData('text/plain', String(cueIndex));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }

    onDragOver(event) {
      if (event.target instanceof this.window.Element && event.target.closest('#timeline-track')) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      }
    }

    onDrop(event) {
      const track = event.target instanceof this.window.Element
        ? event.target.closest('#timeline-track')
        : null;
      if (!track || this.store.getState().readOnly) return;
      event.preventDefault();
      const sourceIndex = Number(event.dataTransfer?.getData('text/plain'));
      const state = this.store.getState();
      const variant = state.definition?.variants?.[state.selectedVariant];
      const cue = variant?.cues?.[sourceIndex];
      if (!cue) return;
      const rect = track.getBoundingClientRect();
      const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const targetTime = Math.max(0, Math.min(variant.durationMs, ratio * variant.durationMs));
      this.store.beginTransaction('cue-drag');
      this.store.moveSelectedCues(targetTime - cue.timeMs, { bypass: event.altKey === true });
      this.store.commitTransaction();
    }

    onPointerDown(event) {
      const handle = event.target instanceof this.window.Element
        ? event.target.closest('.shell-handle')
        : null;
      if (!handle || this.store.getState().readOnly || event.button !== 0) return;
      event.preventDefault();
      const cueIndex = Number(handle.dataset.cueIndex);
      const shellIndex = Number(handle.dataset.shellIndex);
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      const selected = this.store.getState().selection.shells
        .some(item => item.cueIndex === cueIndex && item.shellIndex === shellIndex);
      if (!selected || additive) {
        this.store.selectShell(cueIndex, shellIndex, { additive, toggle: event.ctrlKey || event.metaKey });
      }
      this.store.beginTransaction('shell-drag');
      this.drag = {
        lastX: event.clientX,
        lastY: event.clientY,
        stage: this.document.getElementById('stage-canvas')
      };
    }

    onPointerMove(event) {
      if (!this.drag) return;
      const rect = this.drag.stage.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return;
      const delta = {
        x: (event.clientX - this.drag.lastX) / rect.width,
        y: (event.clientY - this.drag.lastY) / rect.height
      };
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      this.store.moveSelectedShellTargets(delta, { bypass: event.altKey === true });
    }

    onPointerUp() {
      if (!this.drag) return;
      this.drag = null;
      this.store.commitTransaction();
    }

    onBeforeUnload(event) {
      if (!this.store.getState().persistence.dirty) return undefined;
      const message = this.t(
        'plugins.webgpu-fireworks.designer.beforeunload',
        'This show has unsaved changes.'
      );
      event.preventDefault();
      event.returnValue = message;
      return message;
    }
  }

  let bootPromise = null;
  function boot(options = {}) {
    if (bootPromise) return bootPromise;
    const start = async () => {
      const app = new ShowDesignerApp(options);
      await app.init();
      root.webGpuFireworksShowDesigner = app;
      return app;
    };
    if (root.document?.readyState === 'loading') {
      bootPromise = new Promise((resolve, reject) => {
        root.document.addEventListener('DOMContentLoaded', () => start().then(resolve, reject), { once: true });
      });
    } else {
      bootPromise = start();
    }
    return bootPromise;
  }

  return {
    ShowDesignerApp,
    boot,
    createStarterDefinition,
    defaultCue,
    defaultLayer,
    defaultShell
  };
});
