(function exposeShowDesignerModel(root, factory) {
  const api = factory();
  if (root) root.WebGpuFireworksShowDesignerModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createShowDesignerModel() {
  'use strict';

  const VARIANTS = Object.freeze(['long', 'medium', 'short']);
  const VALIDATION_PATH = /^variants\.(short|medium|long)\.cues\.(\d+)(?:\.shells\.(\d+))?(?:\.layers\.(\d+))?(?:\.(.+))?$/;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function snapTime(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    if (options.bypass === true) return Math.max(0, number);
    return Math.max(0, Math.round(number / 100) * 100);
  }

  function snapCoordinate(value, options = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const bounded = clamp(number, 0, 1);
    if (options.bypass === true) return bounded;
    return Math.round(bounded * 100) / 100;
  }

  function normalizeIssue(issue) {
    const value = issue && typeof issue === 'object' ? clone(issue) : { message: String(issue) };
    value.path = typeof value.path === 'string' ? value.path : '';
    return value;
  }

  function mapValidationIssues(issues = []) {
    const result = { byPath: {}, locations: [], global: [] };
    for (const rawIssue of Array.isArray(issues) ? issues : []) {
      const issue = normalizeIssue(rawIssue);
      if (!result.byPath[issue.path]) result.byPath[issue.path] = [];
      result.byPath[issue.path].push(issue);
      const match = issue.path.match(VALIDATION_PATH);
      if (!match) {
        result.global.push(issue);
        continue;
      }
      result.locations.push({
        issue,
        path: issue.path,
        variant: match[1],
        cueIndex: Number(match[2]),
        shellIndex: match[3] === undefined ? null : Number(match[3]),
        layerIndex: match[4] === undefined ? null : Number(match[4]),
        field: match[5] || null
      });
    }
    return result;
  }

  function emptySelection() {
    return {
      cueIndexes: [],
      primaryCueIndex: null,
      shells: [],
      primaryShell: null,
      layer: null
    };
  }

  function initialState() {
    return {
      catalog: [],
      selectedShowId: null,
      definition: null,
      selectedVariant: 'long',
      readOnly: true,
      revision: 0,
      validatedRevision: null,
      publishedRevision: null,
      archived: false,
      selection: emptySelection(),
      validation: { errors: [], diagnostics: {}, mapped: mapValidationIssues([]) },
      persistence: {
        dirty: false,
        status: 'idle',
        generation: 0,
        conflict: null,
        error: null
      },
      preview: { status: 'idle', error: null, requestId: null }
    };
  }

  function stableSnapshot(value) {
    return JSON.stringify(value);
  }

  class ShowDesignerStore {
    constructor(options = {}) {
      this.state = initialState();
      this.historyLimit = Number.isInteger(options.historyLimit)
        ? clamp(options.historyLimit, 1, 500)
        : 100;
      this.history = { past: [], future: [], transaction: null };
      this.listeners = new Set();
      this.editGeneration = 0;
      this.saveRequestId = 0;
    }

    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('A listener function is required.');
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    _emit(reason) {
      const state = this.getState();
      for (const listener of this.listeners) listener(state, reason);
    }

    getState() {
      return clone({
        ...this.state,
        history: {
          canUndo: this.history.past.length > 0,
          canRedo: this.history.future.length > 0,
          activeTransaction: this.history.transaction?.label || null
        }
      });
    }

    setCatalog(catalog) {
      this.state.catalog = clone(Array.isArray(catalog) ? catalog : []);
      this._emit('catalog');
    }

    loadShow(record) {
      if (!record || typeof record !== 'object' || !record.definition) {
        throw new TypeError('A show record with a definition is required.');
      }
      this.state.selectedShowId = record.id;
      this.state.definition = clone(record.definition);
      this.state.readOnly = record.builtIn === true;
      this.state.revision = Number.isInteger(record.revision) ? record.revision : 0;
      this.state.validatedRevision = Number.isInteger(record.validatedRevision)
        ? record.validatedRevision
        : null;
      this.state.publishedRevision = Number.isInteger(record.publishedRevision)
        ? record.publishedRevision
        : null;
      this.state.archived = record.archived === true;
      this.state.selectedVariant = this.state.definition.variants?.long
        ? 'long'
        : VARIANTS.find(variant => this.state.definition.variants?.[variant]) || 'long';
      this.state.selection = emptySelection();
      this.state.validation = {
        errors: clone(record.validation?.errors || []),
        diagnostics: clone(record.validation?.diagnostics || {}),
        mapped: mapValidationIssues(record.validation?.errors || [])
      };
      this.state.persistence = {
        dirty: false,
        status: 'saved',
        generation: this.state.persistence.generation,
        conflict: null,
        error: null
      };
      this.state.preview = { status: 'idle', error: null, requestId: null };
      this.history = { past: [], future: [], transaction: null };
      this.editGeneration = 0;
      this._emit('load');
    }

    setVariant(variant) {
      if (!VARIANTS.includes(variant)) throw new RangeError(`Unknown show variant: ${variant}`);
      this.state.selectedVariant = variant;
      this.state.selection = emptySelection();
      this._emit('variant');
    }

    _assertEditable() {
      if (!this.state.definition) throw new Error('No show is loaded.');
      if (this.state.readOnly) throw new Error('Built-in shows are read-only. Duplicate this show to edit it.');
    }

    _editableSnapshot() {
      return {
        definition: clone(this.state.definition),
        selectedVariant: this.state.selectedVariant,
        selection: clone(this.state.selection)
      };
    }

    _restoreSnapshot(snapshot, reason) {
      this.state.definition = clone(snapshot.definition);
      this.state.selectedVariant = snapshot.selectedVariant;
      this.state.selection = clone(snapshot.selection);
      this._markDirty(reason);
    }

    _pushHistory(snapshot) {
      this.history.past.push(clone(snapshot));
      if (this.history.past.length > this.historyLimit) this.history.past.shift();
      this.history.future = [];
    }

    _beforeMutation() {
      this._assertEditable();
      if (!this.history.transaction) this._pushHistory(this._editableSnapshot());
    }

    _markDirty(reason = 'edit') {
      this.editGeneration += 1;
      this.state.persistence.dirty = true;
      this.state.persistence.status = 'dirty';
      this.state.persistence.conflict = null;
      this.state.persistence.error = null;
      this._emit(reason);
    }

    beginTransaction(label = 'edit') {
      this._assertEditable();
      if (this.history.transaction) return false;
      this.history.transaction = { label, before: this._editableSnapshot() };
      this._emit('transaction-begin');
      return true;
    }

    commitTransaction() {
      const transaction = this.history.transaction;
      if (!transaction) return false;
      this.history.transaction = null;
      if (stableSnapshot(transaction.before) !== stableSnapshot(this._editableSnapshot())) {
        this._pushHistory(transaction.before);
      }
      this._emit('transaction-commit');
      return true;
    }

    cancelTransaction() {
      const transaction = this.history.transaction;
      if (!transaction) return false;
      this.history.transaction = null;
      this.state.definition = clone(transaction.before.definition);
      this.state.selectedVariant = transaction.before.selectedVariant;
      this.state.selection = clone(transaction.before.selection);
      this._emit('transaction-cancel');
      return true;
    }

    undo() {
      this._assertEditable();
      if (this.history.transaction) this.commitTransaction();
      const snapshot = this.history.past.pop();
      if (!snapshot) return false;
      this.history.future.push(this._editableSnapshot());
      this._restoreSnapshot(snapshot, 'undo');
      return true;
    }

    redo() {
      this._assertEditable();
      if (this.history.transaction) this.commitTransaction();
      const snapshot = this.history.future.pop();
      if (!snapshot) return false;
      this.history.past.push(this._editableSnapshot());
      this._restoreSnapshot(snapshot, 'redo');
      return true;
    }

    updateMetadata(updates) {
      this._beforeMutation();
      this.state.definition.metadata = {
        ...(this.state.definition.metadata || {}),
        ...clone(updates || {})
      };
      this._markDirty('metadata');
    }

    updateDefinitionField(field, value) {
      this._beforeMutation();
      this.state.definition[field] = clone(value);
      this._markDirty('definition');
    }

    _cues() {
      return this.state.definition?.variants?.[this.state.selectedVariant]?.cues || [];
    }

    _cue(cueIndex) {
      const cue = this._cues()[cueIndex];
      if (!cue) throw new RangeError(`Cue ${cueIndex} does not exist.`);
      return cue;
    }

    selectCue(cueIndex, options = {}) {
      this._cue(cueIndex);
      const selected = options.additive === true
        ? new Set(this.state.selection.cueIndexes)
        : new Set();
      if (options.toggle === true && selected.has(cueIndex)) selected.delete(cueIndex);
      else selected.add(cueIndex);
      this.state.selection.cueIndexes = [...selected].sort((a, b) => a - b);
      this.state.selection.primaryCueIndex = selected.has(cueIndex)
        ? cueIndex
        : this.state.selection.cueIndexes.at(-1) ?? null;
      this.state.selection.shells = [];
      this.state.selection.primaryShell = null;
      this.state.selection.layer = null;
      this._emit('selection');
    }

    selectShell(cueIndex, shellIndex, options = {}) {
      const shell = this._cue(cueIndex).shells?.[shellIndex];
      if (!shell) throw new RangeError(`Shell ${cueIndex}:${shellIndex} does not exist.`);
      const key = `${cueIndex}:${shellIndex}`;
      const selected = options.additive === true
        ? new Map(this.state.selection.shells.map(item => [`${item.cueIndex}:${item.shellIndex}`, item]))
        : new Map();
      if (options.toggle === true && selected.has(key)) selected.delete(key);
      else selected.set(key, { cueIndex, shellIndex });
      this.state.selection.cueIndexes = [...new Set([...selected.values()].map(item => item.cueIndex))]
        .sort((a, b) => a - b);
      this.state.selection.primaryCueIndex = cueIndex;
      this.state.selection.shells = [...selected.values()];
      this.state.selection.primaryShell = selected.has(key) ? { cueIndex, shellIndex } : null;
      this.state.selection.layer = null;
      this._emit('selection');
    }

    selectLayer(cueIndex, shellIndex, layerIndex) {
      const layer = this._cue(cueIndex).shells?.[shellIndex]?.layers?.[layerIndex];
      if (!layer) throw new RangeError(`Layer ${cueIndex}:${shellIndex}:${layerIndex} does not exist.`);
      this.state.selection.cueIndexes = [cueIndex];
      this.state.selection.primaryCueIndex = cueIndex;
      this.state.selection.shells = [{ cueIndex, shellIndex }];
      this.state.selection.primaryShell = { cueIndex, shellIndex };
      this.state.selection.layer = { cueIndex, shellIndex, layerIndex };
      this._emit('selection');
    }

    moveSelectedCues(deltaMs, options = {}) {
      this._beforeMutation();
      const indexes = this.state.selection.cueIndexes.length
        ? this.state.selection.cueIndexes
        : [this.state.selection.primaryCueIndex].filter(Number.isInteger);
      for (const cueIndex of indexes) {
        const cue = this._cue(cueIndex);
        cue.timeMs = snapTime(cue.timeMs + Number(deltaMs || 0), options);
      }
      this._cues().sort((left, right) => left.timeMs - right.timeMs);
      this._markDirty('timeline');
    }

    setCueField(cueIndex, field, value, options = {}) {
      this._beforeMutation();
      const cue = this._cue(cueIndex);
      cue[field] = field === 'timeMs' ? snapTime(value, options) : clone(value);
      this._markDirty('cue');
    }

    setShellTarget(cueIndex, shellIndex, target, options = {}) {
      this._beforeMutation();
      const shell = this._cue(cueIndex).shells?.[shellIndex];
      if (!shell) throw new RangeError(`Shell ${cueIndex}:${shellIndex} does not exist.`);
      shell.target = {
        x: snapCoordinate(target?.x, options),
        y: snapCoordinate(target?.y, options)
      };
      this._markDirty('stage');
    }

    moveSelectedShellTargets(delta, options = {}) {
      this._beforeMutation();
      const shells = this.state.selection.shells.length
        ? this.state.selection.shells
        : [this.state.selection.primaryShell].filter(Boolean);
      for (const selected of shells) {
        const shell = this._cue(selected.cueIndex).shells[selected.shellIndex];
        shell.target = {
          x: snapCoordinate(Number(shell.target.x) + Number(delta?.x || 0), options),
          y: snapCoordinate(Number(shell.target.y) + Number(delta?.y || 0), options)
        };
      }
      this._markDirty('stage');
    }

    setShellField(cueIndex, shellIndex, field, value) {
      this._beforeMutation();
      const shell = this._cue(cueIndex).shells?.[shellIndex];
      if (!shell) throw new RangeError(`Shell ${cueIndex}:${shellIndex} does not exist.`);
      shell[field] = clone(value);
      this._markDirty('shell');
    }

    setLayerField(cueIndex, shellIndex, layerIndex, field, value) {
      this._beforeMutation();
      const layer = this._cue(cueIndex).shells?.[shellIndex]?.layers?.[layerIndex];
      if (!layer) throw new RangeError(`Layer ${cueIndex}:${shellIndex}:${layerIndex} does not exist.`);
      layer[field] = clone(value);
      this._markDirty('layer');
    }

    addCue(cue) {
      this._beforeMutation();
      this._cues().push(clone(cue));
      this._cues().sort((left, right) => left.timeMs - right.timeMs);
      this._markDirty('cue-add');
    }

    removeSelectedCues() {
      this._beforeMutation();
      const selected = new Set(this.state.selection.cueIndexes);
      this.state.definition.variants[this.state.selectedVariant].cues = this._cues()
        .filter((cue, index) => !selected.has(index));
      this.state.selection = emptySelection();
      this._markDirty('cue-remove');
    }

    addShell(cueIndex, shell) {
      this._beforeMutation();
      this._cue(cueIndex).shells.push(clone(shell));
      this._markDirty('shell-add');
    }

    removeShell(cueIndex, shellIndex) {
      this._beforeMutation();
      this._cue(cueIndex).shells.splice(shellIndex, 1);
      this.state.selection = emptySelection();
      this._markDirty('shell-remove');
    }

    addLayer(cueIndex, shellIndex, layer) {
      this._beforeMutation();
      const layers = this._cue(cueIndex).shells[shellIndex].layers;
      if (layers.length >= 4) throw new RangeError('A shell can contain at most four layers.');
      layers.push(clone(layer));
      this._markDirty('layer-add');
    }

    removeLayer(cueIndex, shellIndex, layerIndex) {
      this._beforeMutation();
      const layers = this._cue(cueIndex).shells[shellIndex].layers;
      if (layers.length <= 1) throw new RangeError('A shell must contain at least one layer.');
      layers.splice(layerIndex, 1);
      this.state.selection.layer = null;
      this._markDirty('layer-remove');
    }

    applyServerShow(show, options = {}) {
      if (!show || typeof show !== 'object') return;
      this.state.revision = Number.isInteger(show.revision) ? show.revision : this.state.revision;
      this.state.validatedRevision = Number.isInteger(show.validatedRevision)
        ? show.validatedRevision
        : null;
      this.state.publishedRevision = Number.isInteger(show.publishedRevision)
        ? show.publishedRevision
        : null;
      this.state.archived = show.archived === true;
      if (options.replaceDefinition === true && show.definition) {
        this.state.definition = clone(show.definition);
      }
      if (show.validation) this.applyValidation(show.validation);
      this._emit('server-show');
    }

    applyValidation(validation = {}) {
      const errors = clone(validation.errors || []);
      this.state.validation = {
        errors,
        diagnostics: clone(validation.diagnostics || {}),
        mapped: mapValidationIssues(errors)
      };
      this._emit('validation');
    }

    beginSave() {
      const token = {
        requestId: ++this.saveRequestId,
        editGeneration: this.editGeneration,
        revision: this.state.revision,
        definition: clone(this.state.definition)
      };
      this.state.persistence.status = 'saving';
      this.state.persistence.generation = token.requestId;
      this.state.persistence.error = null;
      this._emit('save-begin');
      return token;
    }

    finishSave(token, show) {
      if (!token || token.requestId !== this.state.persistence.generation) return false;
      if (Number.isInteger(show?.revision)) this.state.revision = show.revision;
      const unchanged = token.editGeneration === this.editGeneration;
      if (unchanged && show?.definition) this.state.definition = clone(show.definition);
      this.state.persistence.dirty = !unchanged;
      this.state.persistence.status = unchanged ? 'saved' : 'dirty';
      this.state.persistence.conflict = null;
      this.state.persistence.error = null;
      this._emit('save-finish');
      return true;
    }

    markConflict(details = {}) {
      this.state.persistence.dirty = true;
      this.state.persistence.status = 'conflict';
      this.state.persistence.conflict = clone(details);
      this.state.persistence.error = null;
      this._emit('save-conflict');
    }

    markSaveError(error) {
      this.state.persistence.dirty = true;
      this.state.persistence.status = 'error';
      this.state.persistence.error = {
        code: error?.code || 'SAVE_FAILED',
        message: error?.message || String(error)
      };
      this._emit('save-error');
    }

    setPreview(status, value = {}) {
      this.state.preview = {
        status,
        error: value.error || null,
        requestId: value.requestId || null
      };
      this._emit('preview');
    }
  }

  return {
    VARIANTS,
    VALIDATION_PATH,
    ShowDesignerStore,
    mapValidationIssues,
    snapCoordinate,
    snapTime
  };
});
