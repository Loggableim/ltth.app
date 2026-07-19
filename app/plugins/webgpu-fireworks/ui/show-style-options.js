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

  function appendGroup(select, label, styles) {
    if (styles.length === 0) return null;
    const group = select.ownerDocument.createElement('optgroup');
    group.label = label;
    for (const style of styles) appendOption(group, style.id, style.name);
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
    appendGroup(select, labels.builtIns, Array.isArray(catalog.builtIns) ? catalog.builtIns : []);
    appendGroup(select, labels.custom, Array.isArray(catalog.custom) ? catalog.custom : []);

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

  return Object.freeze({
    BUILT_IN_SHOWS,
    SHOWS_ENDPOINT,
    clearCatalogCache,
    fallbackCatalog,
    isCustomStyleId,
    isSelectableStyleId,
    loadCatalog,
    normalizeCatalog,
    refreshStyleSelect,
    renderLengthSelect,
    renderStyleSelect
  });
});
