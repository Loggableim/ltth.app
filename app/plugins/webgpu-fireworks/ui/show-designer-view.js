(function exposeShowDesignerView(root, factory) {
  const api = factory(root);
  if (root) root.WebGpuFireworksShowDesignerView = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createShowDesignerView(root) {
  'use strict';

  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const PHASE_COLORS = Object.freeze({
    opening: '#72d8ff',
    build: '#8fa7ff',
    highlight: '#f59cff',
    calm: '#77e6c2',
    bridge: '#77e6c2',
    breath: '#77e6c2',
    finale: '#ffd477'
  });
  const PHASES = Object.freeze(['opening', 'build', 'highlight', 'calm', 'bridge', 'breath', 'finale']);
  const FORMATIONS = Object.freeze([
    'single', 'pair', 'fan', 'wall', 'ring', 'arc', 'grid', 'cascade',
    'alternating-pair', 'ring-accent', 'star-accent', 'gold-crown', 'call',
    'response', 'mirrored-pair', 'centered-ring', 'triple-salute',
    'symmetric-final-wall', 'diagonal-pair', 'cross-pair', 'spiral-accent',
    'floral-finale', 'heavy-single', 'staggered-volley', 'finale-wave-1',
    'finale-wave-2', 'finale-wave-3', 'peony', 'chrysanthemum', 'willow',
    'cathedral', 'baroque-wall', 'wing-fan', 'paw-fan', 'glyph-crown'
  ]);
  const IMPORTANCE = Object.freeze(['decorative', 'standard', 'essential', 'final-wave']);
  const LAUNCH_MODES = Object.freeze(['rocket', 'airburst', 'ground']);
  const TIERS = Object.freeze(['small', 'medium', 'big', 'massive']);
  const PRIMITIVES = Object.freeze(['radial', 'ring', 'spiral', 'palm', 'crossette', 'comet', 'mine', 'glyph']);
  const GLYPHS = Object.freeze(['paw', 'heart', 'star', 'fox-head', 'wolf-head', 'dragon', 'dragon-wing', 'tail']);
  const PRIORITIES = Object.freeze(['core', 'accent', 'decorative']);

  function interpolate(value, params = {}) {
    return String(value).replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
    ));
  }

  function coordinateNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof value === 'object') {
      const minimum = Number(value.min);
      const maximum = Number(value.max);
      if (Number.isFinite(minimum) && Number.isFinite(maximum)) return (minimum + maximum) / 2;
    }
    return fallback;
  }

  function fieldValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function button(document, label, attributes = {}) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) element.dataset[name] = String(value);
    }
    return element;
  }

  class ShowDesignerView {
    constructor(document, options = {}) {
      if (!document || typeof document.getElementById !== 'function') {
        throw new TypeError('A document is required for the Show Designer view.');
      }
      this.document = document;
      this.translate = typeof options.translate === 'function'
        ? options.translate
        : (key, fallback, params) => {
          const translated = root?.i18n?.t?.(key, params);
          return translated && translated !== key ? translated : fallback;
        };
      this.filter = 'all';
      this.elements = {
        designer: document.getElementById('show-designer'),
        library: document.getElementById('show-library-list'),
        showTitle: document.getElementById('designer-show-title'),
        readOnly: document.getElementById('designer-readonly-notice'),
        stageEmpty: document.getElementById('stage-empty'),
        stagePaths: document.getElementById('stage-paths'),
        stageShells: document.getElementById('stage-shells'),
        timelineRuler: document.getElementById('timeline-ruler'),
        timeline: document.getElementById('timeline-track'),
        inspector: document.getElementById('inspector-content'),
        issues: document.getElementById('validation-issues'),
        status: document.getElementById('designer-save-status'),
        conflict: document.getElementById('designer-conflict'),
        notice: document.getElementById('designer-notice')
      };
    }

    t(key, fallback, params = {}) {
      const translated = this.translate(key, fallback, params);
      return interpolate(translated || fallback, params);
    }

    setBusy(busy) {
      this.elements.designer?.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    setFilter(filter) {
      this.filter = ['all', 'built-in', 'custom', 'archived'].includes(filter) ? filter : 'all';
    }

    showNotice(message, kind = 'info') {
      const element = this.elements.notice;
      if (!element) return;
      element.hidden = !message;
      element.dataset.kind = kind;
      element.textContent = message || '';
    }

    render(state) {
      const active = this.document.activeElement;
      const activeField = active?.dataset?.field
        ? {
          field: active.dataset.field,
          scope: active.dataset.scope,
          cueIndex: active.dataset.cueIndex,
          shellIndex: active.dataset.shellIndex,
          layerIndex: active.dataset.layerIndex,
          selectionStart: Number.isInteger(active.selectionStart) ? active.selectionStart : null,
          selectionEnd: Number.isInteger(active.selectionEnd) ? active.selectionEnd : null
        }
        : null;
      this.renderLibrary(state);
      this.renderControls(state);
      this.renderStage(state);
      this.renderTimeline(state);
      this.renderInspector(state);
      this.renderValidation(state);
      this.renderPersistence(state);
      if (activeField) this.restoreActiveField(activeField);
      this.setBusy(false);
    }

    restoreActiveField(activeField) {
      const candidates = [...this.document.querySelectorAll('[data-field]')];
      const input = candidates.find(candidate => (
        candidate.dataset.field === activeField.field
        && candidate.dataset.scope === activeField.scope
        && candidate.dataset.cueIndex === activeField.cueIndex
        && candidate.dataset.shellIndex === activeField.shellIndex
        && candidate.dataset.layerIndex === activeField.layerIndex
      ));
      if (!input || input.disabled) return;
      input.focus({ preventScroll: true });
      if (activeField.selectionStart !== null && typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(activeField.selectionStart, activeField.selectionEnd);
      }
    }

    renderLibrary(state) {
      const container = this.elements.library;
      if (!container) return;
      container.replaceChildren();
      const shows = (state.catalog || []).filter(show => {
        if (this.filter === 'built-in') return show.builtIn === true;
        if (this.filter === 'custom') return show.builtIn !== true && show.archived !== true;
        if (this.filter === 'archived') return show.archived === true;
        return true;
      });
      for (const show of shows) {
        const card = button(this.document, '', { showId: show.id });
        card.className = 'show-card';
        card.setAttribute('role', 'option');
        card.setAttribute('aria-selected', show.id === state.selectedShowId ? 'true' : 'false');
        if (show.id === state.selectedShowId) card.classList.add('is-selected');
        const name = this.document.createElement('span');
        name.className = 'show-card-name';
        name.textContent = show.name || show.id;
        const meta = this.document.createElement('span');
        meta.className = 'show-card-meta';
        const dot = this.document.createElement('span');
        dot.className = 'status-dot';
        if (show.archived) dot.classList.add('is-archived');
        else if (show.builtIn || Number.isInteger(show.publishedRevision)) dot.classList.add('is-published');
        const stateLabel = show.archived
          ? this.t('plugins.webgpu-fireworks.designer.status_archived', 'Archived')
          : show.builtIn
            ? this.t('plugins.webgpu-fireworks.selector.built_in', 'Built-in')
            : Number.isInteger(show.publishedRevision)
              ? this.t('plugins.webgpu-fireworks.designer.status_published', 'Published')
              : this.t('plugins.webgpu-fireworks.designer.status_draft', 'Draft');
        meta.append(dot, this.document.createTextNode(`${stateLabel} · r${show.revision ?? 0}`));
        card.append(name, meta);
        container.appendChild(card);
      }
      if (shows.length === 0) {
        const empty = this.document.createElement('p');
        empty.className = 'empty-state-static';
        empty.textContent = this.t('plugins.webgpu-fireworks.designer.library_empty', 'No shows in this view.');
        container.appendChild(empty);
      }
      for (const filter of this.document.querySelectorAll('[data-library-filter]')) {
        filter.classList.toggle('is-active', filter.dataset.libraryFilter === this.filter);
      }
    }

    renderControls(state) {
      const hasShow = Boolean(state.definition);
      const editable = hasShow && !state.readOnly;
      const archived = state.archived === true;
      this.elements.showTitle.textContent = state.definition?.metadata?.name
        || this.t('plugins.webgpu-fireworks.designer.select_show', 'Select a show');
      this.elements.readOnly.hidden = !state.readOnly || !hasShow;
      for (const control of this.document.querySelectorAll('[data-variant]')) {
        const variant = control.dataset.variant;
        control.classList.toggle('is-active', state.selectedVariant === variant);
        control.classList.toggle('is-missing', !state.definition?.variants?.[variant]);
        control.disabled = !hasShow;
      }
      const editableActions = [
        'add-cue', 'remove-cue', 'add-shell', 'remove-shell', 'validate', 'derive', 'publish'
      ];
      for (const action of editableActions) {
        const control = this.document.querySelector(`[data-action="${action}"]`);
        if (control) control.disabled = !editable || archived;
      }
      const duplicate = this.document.querySelector('[data-action="duplicate"]');
      const exportButton = this.document.querySelector('[data-action="export"]');
      if (duplicate) duplicate.disabled = !hasShow;
      if (exportButton) exportButton.disabled = !hasShow;
      const archive = this.document.querySelector('[data-action="archive"]');
      const restore = this.document.querySelector('[data-action="restore"]');
      if (archive) {
        archive.hidden = archived;
        archive.disabled = !editable || archived;
      }
      if (restore) {
        restore.hidden = !archived;
        restore.disabled = !editable || !archived;
      }
      const previewDisabled = !hasShow;
      for (const action of ['preview-cue', 'preview-phase', 'preview-show']) {
        const control = this.document.querySelector(`[data-action="${action}"]`);
        if (control) control.disabled = previewDisabled || (action !== 'preview-show' && !Number.isInteger(state.selection.primaryCueIndex));
      }
      const removeCue = this.document.querySelector('[data-action="remove-cue"]');
      if (removeCue) removeCue.disabled ||= state.selection.cueIndexes.length === 0;
      const addShell = this.document.querySelector('[data-action="add-shell"]');
      if (addShell) addShell.disabled ||= !Number.isInteger(state.selection.primaryCueIndex);
      const removeShell = this.document.querySelector('[data-action="remove-shell"]');
      if (removeShell) removeShell.disabled ||= !state.selection.primaryShell;
      const undo = this.document.querySelector('[data-action="undo"]');
      const redo = this.document.querySelector('[data-action="redo"]');
      if (undo) undo.disabled = !editable || !state.history?.canUndo;
      if (redo) redo.disabled = !editable || !state.history?.canRedo;
    }

    currentCues(state) {
      return state.definition?.variants?.[state.selectedVariant]?.cues || [];
    }

    renderStage(state) {
      const paths = this.elements.stagePaths;
      const handles = this.elements.stageShells;
      if (!paths || !handles) return;
      paths.replaceChildren();
      handles.replaceChildren();
      const cues = this.currentCues(state);
      const cueIndex = state.selection.primaryCueIndex;
      const cue = Number.isInteger(cueIndex) ? cues[cueIndex] : null;
      this.elements.stageEmpty.hidden = Boolean(cue);
      if (!cue) return;
      const selected = new Set((state.selection.shells || []).map(item => `${item.cueIndex}:${item.shellIndex}`));
      (cue.shells || []).forEach((shell, shellIndex) => {
        const originX = coordinateNumber(shell.origin?.x, 0.5) * 1000;
        const originY = coordinateNumber(shell.origin?.y, 1) * 560;
        const targetX = coordinateNumber(shell.target?.x, 0.5) * 1000;
        const targetY = coordinateNumber(shell.target?.y, 0.4) * 560;
        const path = this.document.createElementNS(SVG_NAMESPACE, 'path');
        path.setAttribute('class', 'shell-path');
        path.setAttribute('d', `M ${originX} ${originY} Q ${(originX + targetX) / 2} ${Math.min(originY, targetY) - 85} ${targetX} ${targetY}`);
        paths.appendChild(path);

        const group = this.document.createElementNS(SVG_NAMESPACE, 'g');
        group.setAttribute('class', 'shell-handle');
        group.setAttribute('transform', `translate(${targetX} ${targetY})`);
        group.dataset.shellKey = `${cueIndex}:${shellIndex}`;
        group.dataset.cueIndex = String(cueIndex);
        group.dataset.shellIndex = String(shellIndex);
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', `Shell ${shellIndex + 1}`);
        if (selected.has(`${cueIndex}:${shellIndex}`)) group.classList.add('is-selected');
        const circle = this.document.createElementNS(SVG_NAMESPACE, 'circle');
        circle.setAttribute('r', '22');
        const label = this.document.createElementNS(SVG_NAMESPACE, 'text');
        label.setAttribute('y', '6');
        label.textContent = String(shellIndex + 1);
        group.append(circle, label);
        handles.appendChild(group);
      });
    }

    renderTimeline(state) {
      const track = this.elements.timeline;
      const ruler = this.elements.timelineRuler;
      if (!track || !ruler) return;
      track.replaceChildren();
      ruler.replaceChildren();
      const variant = state.definition?.variants?.[state.selectedVariant];
      const duration = Number(variant?.durationMs) || ({ long: 28000, medium: 18000, short: 10000 }[state.selectedVariant]);
      for (let index = 0; index <= 10; index += 1) {
        const tick = this.document.createElement('span');
        tick.className = 'ruler-tick';
        tick.style.left = `${index * 10}%`;
        const label = this.document.createElement('span');
        label.textContent = `${Math.round((duration * index / 10) / 100) / 10}s`;
        tick.appendChild(label);
        ruler.appendChild(tick);
      }
      const selected = new Set(state.selection.cueIndexes || []);
      (variant?.cues || []).forEach((cue, cueIndex) => {
        const marker = button(this.document, '', { cueIndex });
        marker.className = 'cue-marker';
        marker.draggable = !state.readOnly;
        marker.style.left = `${Math.max(0, Math.min(100, (Number(cue.timeMs) / duration) * 100))}%`;
        marker.style.setProperty('--phase-color', PHASE_COLORS[cue.phase] || PHASE_COLORS.build);
        marker.setAttribute('role', 'option');
        marker.setAttribute('aria-selected', selected.has(cueIndex) ? 'true' : 'false');
        if (selected.has(cueIndex)) marker.classList.add('is-selected');
        const time = this.document.createElement('span');
        time.className = 'cue-time';
        time.textContent = `${(Number(cue.timeMs) / 1000).toFixed(1)} s`;
        const phase = this.document.createElement('span');
        phase.className = 'cue-phase';
        phase.textContent = cue.phase || 'phase';
        const formation = this.document.createElement('span');
        formation.className = 'cue-formation';
        formation.textContent = `${cue.formation || 'single'} · ${(cue.shells || []).length}`;
        marker.append(time, phase, formation);
        track.appendChild(marker);
      });
      if (!variant) {
        const empty = this.document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = this.t('plugins.webgpu-fireworks.designer.variant_missing', 'This variant has not been derived yet.');
        track.appendChild(empty);
      }
    }

    appendField(parent, options) {
      const label = this.document.createElement('label');
      label.className = `field${options.wide ? ' is-wide' : ''}`;
      label.appendChild(this.document.createTextNode(options.label));
      let input;
      if (options.type === 'select') {
        input = this.document.createElement('select');
        for (const value of options.values || []) {
          const option = this.document.createElement('option');
          option.value = value;
          option.textContent = value;
          input.appendChild(option);
        }
        input.value = fieldValue(options.value);
      } else if (options.type === 'textarea') {
        input = this.document.createElement('textarea');
        input.value = fieldValue(options.value);
      } else {
        input = this.document.createElement('input');
        input.type = options.type || 'text';
        if (input.type === 'checkbox') input.checked = options.value === true;
        else input.value = fieldValue(options.value);
        if (options.min !== undefined) input.min = String(options.min);
        if (options.max !== undefined) input.max = String(options.max);
        if (options.step !== undefined) input.step = String(options.step);
      }
      input.dataset.field = options.field;
      input.dataset.scope = options.scope;
      if (Number.isInteger(options.cueIndex)) input.dataset.cueIndex = String(options.cueIndex);
      if (Number.isInteger(options.shellIndex)) input.dataset.shellIndex = String(options.shellIndex);
      if (Number.isInteger(options.layerIndex)) input.dataset.layerIndex = String(options.layerIndex);
      input.disabled = options.disabled === true;
      label.appendChild(input);
      parent.appendChild(label);
      return input;
    }

    inspectorSection(title) {
      const section = this.document.createElement('section');
      section.className = 'inspector-section';
      const heading = this.document.createElement('h3');
      heading.textContent = title;
      const fields = this.document.createElement('div');
      fields.className = 'field-grid';
      section.append(heading, fields);
      return { section, fields };
    }

    renderInspector(state) {
      const container = this.elements.inspector;
      if (!container) return;
      container.replaceChildren();
      if (!state.definition) {
        const empty = this.document.createElement('p');
        empty.className = 'validation-empty';
        empty.textContent = this.t('plugins.webgpu-fireworks.designer.select_show', 'Select a show to inspect it.');
        container.appendChild(empty);
        return;
      }
      const disabled = state.readOnly === true;
      const metadata = this.inspectorSection(this.t('plugins.webgpu-fireworks.designer.metadata', 'Show'));
      this.appendField(metadata.fields, {
        label: this.t('plugins.webgpu-fireworks.designer.name', 'Name'),
        scope: 'metadata', field: 'metadata.name', value: state.definition.metadata?.name, disabled, wide: true
      });
      this.appendField(metadata.fields, {
        label: this.t('plugins.webgpu-fireworks.designer.description', 'Description'),
        scope: 'metadata', field: 'metadata.description', value: state.definition.metadata?.description,
        type: 'textarea', disabled, wide: true
      });
      this.appendField(metadata.fields, {
        label: this.t('plugins.webgpu-fireworks.designer.material', 'Material'),
        scope: 'definition', field: 'materialProfile', value: state.definition.materialProfile,
        type: 'select', values: ['classic', 'premium-realistic'], disabled
      });
      this.appendField(metadata.fields, {
        label: this.t('plugins.webgpu-fireworks.designer.auto_eligible', 'Auto eligible'),
        scope: 'definition', field: 'autoEligible', value: state.definition.autoEligible,
        type: 'checkbox', disabled
      });
      container.appendChild(metadata.section);

      const cues = this.currentCues(state);
      const cueIndex = state.selection.primaryCueIndex;
      const cue = Number.isInteger(cueIndex) ? cues[cueIndex] : null;
      if (!cue) return;
      const cueSection = this.inspectorSection(this.t('plugins.webgpu-fireworks.designer.cue', `Cue ${cueIndex + 1}`, { count: cueIndex + 1 }));
      this.appendField(cueSection.fields, {
        label: 'Time (ms)', scope: 'cue', field: 'timeMs', value: cue.timeMs,
        type: 'number', min: 0, step: 100, disabled, cueIndex
      });
      this.appendField(cueSection.fields, {
        label: 'Phase', scope: 'cue', field: 'phase', value: cue.phase,
        type: 'select', values: PHASES, disabled, cueIndex
      });
      this.appendField(cueSection.fields, {
        label: 'Formation', scope: 'cue', field: 'formation', value: cue.formation,
        type: 'select', values: FORMATIONS, disabled, cueIndex, wide: true
      });
      this.appendField(cueSection.fields, {
        label: 'Importance', scope: 'cue', field: 'importance', value: cue.importance,
        type: 'select', values: IMPORTANCE, disabled, cueIndex, wide: true
      });
      container.appendChild(cueSection.section);

      const primaryShell = state.selection.primaryShell;
      const shell = primaryShell
        ? cues[primaryShell.cueIndex]?.shells?.[primaryShell.shellIndex]
        : null;
      if (!shell) return;
      const shellSection = this.inspectorSection(this.t('plugins.webgpu-fireworks.designer.shell', `Shell ${primaryShell.shellIndex + 1}`, { count: primaryShell.shellIndex + 1 }));
      for (const [field, label, value] of [
        ['origin.x', 'Origin X', coordinateNumber(shell.origin?.x, 0.5)],
        ['origin.y', 'Origin Y', coordinateNumber(shell.origin?.y, 1)],
        ['target.x', 'Target X', coordinateNumber(shell.target?.x, 0.5)],
        ['target.y', 'Target Y', coordinateNumber(shell.target?.y, 0.4)]
      ]) {
        this.appendField(shellSection.fields, {
          label, scope: 'shell-coordinate', field, value, type: 'number',
          min: 0, max: 1, step: 0.01, disabled,
          cueIndex: primaryShell.cueIndex, shellIndex: primaryShell.shellIndex
        });
      }
      this.appendField(shellSection.fields, {
        label: 'Launch', scope: 'shell', field: 'launchMode', value: shell.launchMode,
        type: 'select', values: LAUNCH_MODES, disabled,
        cueIndex: primaryShell.cueIndex, shellIndex: primaryShell.shellIndex
      });
      this.appendField(shellSection.fields, {
        label: 'Tier', scope: 'shell', field: 'tier', value: shell.tier,
        type: 'select', values: TIERS, disabled,
        cueIndex: primaryShell.cueIndex, shellIndex: primaryShell.shellIndex
      });
      this.appendField(shellSection.fields, {
        label: 'Palette', scope: 'shell-array', field: 'palette', value: shell.palette,
        disabled, wide: true, cueIndex: primaryShell.cueIndex, shellIndex: primaryShell.shellIndex
      });
      container.appendChild(shellSection.section);

      const layerSection = this.inspectorSection(this.t('plugins.webgpu-fireworks.designer.layers', 'Layers'));
      const layerTabs = this.document.createElement('div');
      layerTabs.className = 'layer-tabs';
      const selectedLayer = state.selection.layer?.layerIndex ?? 0;
      (shell.layers || []).forEach((layer, layerIndex) => {
        const layerButton = button(this.document, `${layerIndex + 1}`, {
          action: 'select-layer', cueIndex: primaryShell.cueIndex,
          shellIndex: primaryShell.shellIndex, layerIndex
        });
        if (layerIndex === selectedLayer) layerButton.classList.add('is-active');
        layerTabs.appendChild(layerButton);
      });
      const addLayer = button(this.document, '+', { action: 'add-layer' });
      addLayer.title = 'Add layer';
      addLayer.disabled = disabled || shell.layers.length >= 4;
      layerTabs.appendChild(addLayer);
      const removeLayer = button(this.document, '−', { action: 'remove-layer' });
      removeLayer.title = 'Remove layer';
      removeLayer.disabled = disabled || shell.layers.length <= 1;
      layerTabs.appendChild(removeLayer);
      layerSection.section.insertBefore(layerTabs, layerSection.fields);
      const layer = shell.layers?.[selectedLayer];
      if (layer) {
        const shared = {
          disabled, cueIndex: primaryShell.cueIndex, shellIndex: primaryShell.shellIndex,
          layerIndex: selectedLayer, scope: 'layer'
        };
        this.appendField(layerSection.fields, {
          ...shared, label: 'Primitive', field: 'primitive', value: layer.primitive,
          type: 'select', values: PRIMITIVES
        });
        if (layer.primitive === 'glyph') {
          this.appendField(layerSection.fields, {
            ...shared, label: 'Glyph', field: 'glyph', value: layer.glyph || 'star',
            type: 'select', values: GLYPHS
          });
        }
        for (const [field, label, step] of [
          ['delayMs', 'Delay (ms)', 10], ['density', 'Density', 1],
          ['size', 'Size', 0.05], ['lifetimeMs', 'Lifetime (ms)', 10],
          ['gravity', 'Gravity', 0.05], ['drag', 'Drag', 0.01]
        ]) {
          this.appendField(layerSection.fields, {
            ...shared, label, field, value: layer[field] ?? 0, type: 'number', step
          });
        }
        this.appendField(layerSection.fields, {
          ...shared, label: 'Priority', field: 'priority', value: layer.priority || 'core',
          type: 'select', values: PRIORITIES
        });
        this.appendField(layerSection.fields, {
          ...shared, label: 'Colors', scope: 'layer-array', field: 'colors', value: layer.colors,
          wide: true
        });
        for (const field of ['trail', 'split', 'strobe', 'core']) {
          this.appendField(layerSection.fields, {
            ...shared, label: field, field, value: layer[field] === true, type: 'checkbox'
          });
        }
      }
      container.appendChild(layerSection.section);
    }

    renderValidation(state) {
      const container = this.elements.issues;
      if (!container) return;
      container.replaceChildren();
      const errors = state.validation?.errors || [];
      if (errors.length === 0) {
        const empty = this.document.createElement('span');
        empty.className = 'validation-empty';
        empty.textContent = this.t('plugins.webgpu-fireworks.designer.validation_empty', 'No validation issues.');
        container.appendChild(empty);
        return;
      }
      errors.forEach((issue, index) => {
        const item = button(this.document, `${issue.message || issue.code || 'Validation issue'} · ${issue.path || 'show'}`, {
          issueIndex: index
        });
        item.className = 'validation-issue';
        container.appendChild(item);
      });
    }

    renderPersistence(state) {
      const status = state.persistence?.status || 'idle';
      const labels = {
        idle: this.t('plugins.webgpu-fireworks.designer.status_idle', 'Idle'),
        dirty: this.t('plugins.webgpu-fireworks.designer.unsaved_changes', 'Unsaved changes'),
        saving: this.t('plugins.webgpu-fireworks.designer.status_saving', 'Saving…'),
        saved: this.t('plugins.webgpu-fireworks.designer.status_saved', `Saved · r${state.revision}`, { revision: state.revision }),
        conflict: this.t('plugins.webgpu-fireworks.api.revision_conflict', 'Revision conflict'),
        error: this.t('plugins.webgpu-fireworks.designer.status_error', 'Save failed')
      };
      this.elements.status.dataset.status = status;
      this.elements.status.textContent = labels[status] || status;
      this.elements.conflict.hidden = status !== 'conflict';
    }
  }

  return {
    FORMATIONS,
    GLYPHS,
    IMPORTANCE,
    LAUNCH_MODES,
    PHASES,
    PRIMITIVES,
    PRIORITIES,
    ShowDesignerView,
    TIERS,
    coordinateNumber
  };
});
