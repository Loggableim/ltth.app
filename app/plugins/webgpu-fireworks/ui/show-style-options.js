(function exposeShowStyleOptions(root, factory) {
  const api = factory(root);
  if (root) root.WebGpuFireworksShowOptions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createShowStyleOptions(root) {
  'use strict';

  const SHOWS_ENDPOINT = '/api/webgpu-fireworks/shows';
  const CUSTOM_STYLE_PATTERN = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const BUILT_IN_SHOWS = Object.freeze([
    Object.freeze({ id: 'classic-crescendo', name: 'Classic Crescendo', builtIn: true }),
    Object.freeze({ id: 'symmetric-salute', name: 'Symmetric Salute', builtIn: true }),
    Object.freeze({ id: 'sky-ballet', name: 'Sky Ballet', builtIn: true }),
    Object.freeze({ id: 'thunder-finale', name: 'Thunder Finale', builtIn: true }),
    Object.freeze({ id: 'nishiki-kamuro', name: 'Nishiki Kamuro', builtIn: true }),
    Object.freeze({ id: 'aurora-cathedral', name: 'Aurora Cathedral', builtIn: true }),
    Object.freeze({ id: 'royal-brocade', name: 'Royal Brocade', builtIn: true }),
    Object.freeze({ id: 'phoenix-ascension', name: 'Phoenix Ascension', builtIn: true }),
    Object.freeze({ id: 'furry-celebration', name: 'Furry Celebration', builtIn: true })
  ]);
  const BUILT_IN_IDS = new Set(BUILT_IN_SHOWS.map(show => show.id));
  const LENGTHS = Object.freeze([
    Object.freeze({ id: 'short', label: 'Short (10 s)' }),
    Object.freeze({ id: 'medium', label: 'Medium (18 s)' }),
    Object.freeze({ id: 'long', label: 'Long (28 s)' })
  ]);
  const DEFAULT_LABELS = Object.freeze({
    auto: 'Auto',
    inherit: 'Use global default',
    builtIns: 'Built-in shows',
    custom: 'Custom shows',
    unavailable: 'Unavailable',
    short: 'Short (10 s)',
    medium: 'Medium (18 s)',
    long: 'Long (28 s)'
  });
  const PHASE_IDS = new Set([
    'idle',
    'opening',
    'build',
    'highlight',
    'calm',
    'bridge',
    'breath',
    'finale'
  ]);

  const refreshGenerations = new WeakMap();
  let catalogPromise = null;

  function cloneStyle(style) {
    return {
      id: style.id,
      name: style.name,
      builtIn: style.builtIn === true,
      autoEligible: style.autoEligible === true,
      publishedRevision: Number.isInteger(style.publishedRevision)
        ? style.publishedRevision
        : undefined
    };
  }

  function fallbackCatalog() {
    return {
      source: 'fallback',
      builtIns: BUILT_IN_SHOWS.map(cloneStyle),
      custom: []
    };
  }

  function normalizedName(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const name = value.trim();
    return name ? name.slice(0, 200) : fallback;
  }

  function normalizeCatalog(payload) {
    if (!payload || payload.success !== true || !Array.isArray(payload.selectableStyles)) {
      throw new Error('Invalid show catalog response');
    }

    const custom = [];
    const seen = new Set();
    for (const candidate of payload.selectableStyles) {
      if (!candidate || candidate.builtIn !== false || !isCustomStyleId(candidate.id)) continue;
      const id = candidate.id.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      custom.push({
        id,
        name: normalizedName(candidate.name, id),
        builtIn: false,
        autoEligible: candidate.autoEligible === true,
        publishedRevision: Number.isInteger(candidate.publishedRevision)
          ? candidate.publishedRevision
          : undefined
      });
    }

    return {
      source: 'api',
      builtIns: BUILT_IN_SHOWS.map(cloneStyle),
      custom
    };
  }

  async function requestCatalog(fetchImpl) {
    if (typeof fetchImpl !== 'function') return fallbackCatalog();
    try {
      const response = await fetchImpl(SHOWS_ENDPOINT, { cache: 'no-store' });
      if (!response || response.ok === false || typeof response.json !== 'function') {
        throw new Error('Show catalog request failed');
      }
      return normalizeCatalog(await response.json());
    } catch (error) {
      return fallbackCatalog();
    }
  }

  function loadCatalog(options = {}) {
    const fetchImpl = options.fetchImpl
      || (typeof root?.fetch === 'function' ? root.fetch.bind(root) : null);
    if (!options.force && catalogPromise) return catalogPromise;
    catalogPromise = requestCatalog(fetchImpl);
    return catalogPromise;
  }

  function clearCatalogCache() {
    catalogPromise = null;
  }

  function labelsFor(overrides) {
    return { ...DEFAULT_LABELS, ...(overrides || {}) };
  }

  function interpolate(value, params = {}) {
    return String(value).replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match
    ));
  }

  function localize(key, fallback, params = {}, options = {}) {
    let translated;
    if (typeof options.translate === 'function') {
      translated = options.translate(key, fallback, params);
    } else {
      translated = root?.i18n?.t?.(key, params);
    }
    return translated && translated !== key
      ? interpolate(translated, params)
      : interpolate(fallback, params);
  }

  function builtInTitle(style, options = {}) {
    return localize(
      `plugins.webgpu-fireworks.shows.${style.id}.title`,
      style.name,
      {},
      options
    );
  }

  function clearSelect(select) {
    while (select.firstChild) select.removeChild(select.firstChild);
  }

  function appendOption(parent, value, label, attributes = {}) {
    const option = parent.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    if (attributes.disabled === true) option.disabled = true;
    if (attributes.unavailable === true) option.dataset.showUnavailable = 'true';
    parent.appendChild(option);
    return option;
  }

  function appendGroup(select, label, styles, options = {}) {
    if (styles.length === 0) return null;
    const group = select.ownerDocument.createElement('optgroup');
    group.label = label;
    for (const style of styles) {
      appendOption(group, style.id, style.builtIn === true ? builtInTitle(style, options) : style.name);
    }
    select.appendChild(group);
    return group;
  }

  function selectedOption(select, value) {
    return [...select.querySelectorAll('option')].find(option => option.value === value) || null;
  }

  function selectOrPreserveUnavailable(select, selectedValue, labels) {
    const value = typeof selectedValue === 'string' ? selectedValue : '';
    let option = selectedOption(select, value);
    if (!option && value) {
      option = appendOption(
        select,
        value,
        `${labels.unavailable}: ${value}`,
        { disabled: true, unavailable: true }
      );
    }
    if (!option) option = select.querySelector('option');
    if (option) {
      option.selected = true;
      select.value = option.value;
    }
    return option?.value || '';
  }

  function renderStyleSelect(select, options = {}) {
    if (!select || typeof select.appendChild !== 'function') {
      throw new TypeError('A show style select element is required');
    }
    const surface = options.surface === 'inherited' ? 'inherited' : 'global';
    const catalog = options.catalog || fallbackCatalog();
    const labels = labelsFor(options.labels);
    clearSelect(select);

    if (surface === 'global') {
      appendOption(select, 'auto', labels.auto);
    } else {
      appendOption(select, 'inherit', labels.inherit);
    }
    appendGroup(select, labels.builtIns, Array.isArray(catalog.builtIns) ? catalog.builtIns : [], options);
    appendGroup(select, labels.custom, Array.isArray(catalog.custom) ? catalog.custom : [], options);

    const fallbackValue = surface === 'global' ? 'auto' : 'inherit';
    const selectedValue = typeof options.selectedValue === 'string'
      ? options.selectedValue
      : fallbackValue;
    selectOrPreserveUnavailable(select, selectedValue, labels);
    return select.value;
  }

  async function refreshStyleSelect(select, options = {}) {
    if (!select || typeof select.appendChild !== 'function') {
      throw new TypeError('A show style select element is required');
    }
    const generation = (refreshGenerations.get(select) || 0) + 1;
    refreshGenerations.set(select, generation);
    const valueAtRequest = select.value;
    const requestedValue = typeof options.selectedValue === 'string'
      ? options.selectedValue
      : valueAtRequest;
    const catalog = options.catalog || await loadCatalog(options);

    if (refreshGenerations.get(select) !== generation) {
      return { ...catalog, rendered: false };
    }
    const currentValue = select.value;
    const selectedValue = currentValue || requestedValue;
    renderStyleSelect(select, { ...options, catalog, selectedValue });
    return { ...catalog, rendered: true };
  }

  function renderLengthSelect(select, options = {}) {
    if (!select || typeof select.appendChild !== 'function') {
      throw new TypeError('A finale length select element is required');
    }
    const surface = options.surface === 'inherited' ? 'inherited' : 'global';
    const labels = labelsFor(options.labels);
    clearSelect(select);
    if (surface === 'inherited') appendOption(select, 'inherit', labels.inherit);
    for (const length of LENGTHS) appendOption(select, length.id, labels[length.id] || length.label);
    const fallbackValue = surface === 'global' ? 'medium' : 'inherit';
    selectOrPreserveUnavailable(
      select,
      typeof options.selectedValue === 'string' ? options.selectedValue : fallbackValue,
      labels
    );
    return select.value;
  }

  function isCustomStyleId(value) {
    return typeof value === 'string' && CUSTOM_STYLE_PATTERN.test(value);
  }

  function isSelectableStyleId(value) {
    return BUILT_IN_IDS.has(value) || isCustomStyleId(value);
  }

  function humanizeIdentifier(value, fallback) {
    const normalized = String(value || '').trim().replace(/^custom:/i, '').replace(/[-_]+/g, ' ');
    if (!normalized) return fallback;
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function customTitle(styleId, renderer, catalog) {
    const runtimeName = normalizedName(renderer?.finaleName, null);
    if (runtimeName) return runtimeName;
    const styles = Array.isArray(catalog?.custom) ? catalog.custom : [];
    return styles.find(style => style.id === styleId)?.name || null;
  }

  function showTitle(styleId, renderer, options = {}) {
    const builtIn = BUILT_IN_SHOWS.find(style => style.id === styleId);
    if (builtIn) return builtInTitle(builtIn, options);
    if (isCustomStyleId(styleId)) {
      return customTitle(styleId, renderer, options.catalog)
        || humanizeIdentifier(styleId, DEFAULT_LABELS.unavailable);
    }
    return humanizeIdentifier(styleId, 'Finale');
  }

  function lengthTitle(length, options = {}) {
    const normalized = LENGTHS.find(candidate => candidate.id === length) || LENGTHS[1];
    return localize(
      `plugins.webgpu-fireworks.selector.length_${normalized.id}`,
      normalized.label,
      {},
      options
    );
  }

  function phaseTitle(phase, options = {}) {
    const normalized = String(phase || 'idle').trim().toLowerCase();
    if (!PHASE_IDS.has(normalized)) return humanizeIdentifier(normalized, 'Idle');
    return localize(
      `plugins.webgpu-fireworks.status.phases.${normalized}`,
      humanizeIdentifier(normalized, 'Idle'),
      {},
      options
    );
  }

  function formatRuntimeFinaleStatus(renderer = {}, options = {}) {
    const active = renderer.finaleActive === true;
    const activeShow = active
      ? `${showTitle(renderer.finaleStyle, renderer, options)} · ${lengthTitle(renderer.finaleLength, options)}`
      : localize('plugins.webgpu-fireworks.status.idle', 'Idle', {}, options);
    const phase = phaseTitle(renderer.finalePhase, options);
    const count = Number.isFinite(Number(renderer.finaleQueueLength))
      ? Math.max(0, Math.floor(Number(renderer.finaleQueueLength)))
      : 0;
    const queue = localize(
      'plugins.webgpu-fireworks.status.queue_count',
      '{count} queued',
      { count },
      options
    );
    return { activeShow, phase, queue };
  }

  return Object.freeze({
    BUILT_IN_SHOWS,
    SHOWS_ENDPOINT,
    clearCatalogCache,
    fallbackCatalog,
    formatRuntimeFinaleStatus,
    isCustomStyleId,
    isSelectableStyleId,
    loadCatalog,
    normalizeCatalog,
    refreshStyleSelect,
    renderLengthSelect,
    renderStyleSelect
  });
});
