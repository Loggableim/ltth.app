const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const helperPath = path.join(
  __dirname,
  '..',
  'plugins',
  'webgpu-fireworks',
  'ui',
  'show-style-options.js'
);
const helperSource = fs.readFileSync(helperPath, 'utf8');

const BUILT_IN_IDS = [
  'classic-crescendo',
  'symmetric-salute',
  'sky-ballet',
  'thunder-finale',
  'nishiki-kamuro',
  'aurora-cathedral',
  'royal-brocade',
  'phoenix-ascension',
  'furry-celebration'
];
const CUSTOM_ID = 'custom:00000000-0000-4000-8000-000000000601';

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createHarness(markup = '<select id="style"></select>') {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, {
    runScripts: 'outside-only',
    url: 'http://localhost:3000/plugins/webgpu-fireworks/ui'
  });
  dom.window.eval(helperSource);
  return {
    dom,
    window: dom.window,
    api: dom.window.WebGpuFireworksShowOptions,
    select: dom.window.document.getElementById('style')
  };
}

function publishedCatalog(customName = 'Custom Show') {
  return {
    success: true,
    selectableStyles: [
      { id: 'classic-crescendo', name: 'Classic Crescendo', builtIn: true },
      { id: CUSTOM_ID, name: customName, builtIn: false, publishedRevision: 3 }
    ]
  };
}

describe('WebGPU Fireworks dynamic show style options', () => {
  test('renders grouped static Built-ins plus published Custom shows and safely preserves names', async () => {
    const { dom, api, select } = createHarness();
    const maliciousName = 'Premium <img src=x onerror="danger()"> Finale';
    const fetchImpl = jest.fn(async () => jsonResponse(publishedCatalog(maliciousName)));

    await api.refreshStyleSelect(select, {
      surface: 'global',
      selectedValue: CUSTOM_ID,
      fetchImpl,
      force: true
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/webgpu-fireworks/shows', { cache: 'no-store' });
    expect([...select.querySelectorAll('optgroup')].map(group => group.label))
      .toEqual(['Built-in shows', 'Custom shows']);
    expect([...select.querySelectorAll('optgroup[label="Built-in shows"] option')].map(option => option.value))
      .toEqual(BUILT_IN_IDS);
    expect(select.querySelector(`option[value="${CUSTOM_ID}"]`).textContent).toBe(maliciousName);
    expect(select.querySelector('img')).toBeNull();
    expect(select.value).toBe(CUSTOM_ID);
    expect(select.querySelector('option[value="auto"]')).not.toBeNull();
    expect(select.querySelector('option[value="inherit"]')).toBeNull();
    expect(helperSource).not.toMatch(/\.innerHTML\s*=/);

    dom.window.close();
  });

  test('falls back to the canonical nine Built-ins when the API is unavailable', async () => {
    const { dom, api, select } = createHarness();
    const fetchImpl = jest.fn(async () => { throw new Error('offline'); });

    const result = await api.refreshStyleSelect(select, {
      surface: 'global',
      selectedValue: 'nishiki-kamuro',
      fetchImpl,
      force: true
    });

    expect(result.source).toBe('fallback');
    expect([...select.querySelectorAll('optgroup[label="Built-in shows"] option')].map(option => option.value))
      .toEqual(BUILT_IN_IDS);
    expect(select.querySelectorAll('optgroup[label="Custom shows"] option')).toHaveLength(0);
    expect(select.value).toBe('nishiki-kamuro');

    dom.window.close();
  });

  test('keeps missing or archived Custom selections disabled and selected', () => {
    const { dom, api, select } = createHarness();

    api.renderStyleSelect(select, {
      surface: 'global',
      selectedValue: CUSTOM_ID,
      catalog: api.fallbackCatalog()
    });

    const unavailable = select.querySelector('option[data-show-unavailable="true"]');
    expect(unavailable).not.toBeNull();
    expect(unavailable.value).toBe(CUSTOM_ID);
    expect(unavailable.disabled).toBe(true);
    expect(unavailable.selected).toBe(true);
    expect(unavailable.textContent).toBe(`Unavailable: ${CUSTOM_ID}`);
    expect(select.value).toBe(CUSTOM_ID);

    dom.window.close();
  });

  test('uses Auto only for global settings and inherit only for Goals and Superfan selectors', () => {
    const { dom, api, select } = createHarness();
    const catalog = api.fallbackCatalog();

    api.renderStyleSelect(select, {
      surface: 'global',
      selectedValue: 'auto',
      catalog
    });
    expect(select.value).toBe('auto');
    expect(select.querySelector('option[value="inherit"]')).toBeNull();

    api.renderStyleSelect(select, {
      surface: 'inherited',
      selectedValue: 'inherit',
      catalog
    });
    expect(select.value).toBe('inherit');
    expect(select.querySelector('option[value="auto"]')).toBeNull();

    api.renderStyleSelect(select, {
      surface: 'inherited',
      selectedValue: 'auto',
      catalog
    });
    const storedAuto = select.querySelector('option[value="auto"]');
    expect(storedAuto.disabled).toBe(true);
    expect(storedAuto.selected).toBe(true);
    expect(storedAuto.dataset.showUnavailable).toBe('true');

    dom.window.close();
  });

  test('renders exact global and inherited length choices', () => {
    const { dom, api, select } = createHarness();

    api.renderLengthSelect(select, { surface: 'global', selectedValue: 'medium' });
    expect([...select.options].map(option => option.value)).toEqual(['short', 'medium', 'long']);
    expect(select.value).toBe('medium');

    api.renderLengthSelect(select, { surface: 'inherited', selectedValue: 'inherit' });
    expect([...select.options].map(option => option.value)).toEqual(['inherit', 'short', 'medium', 'long']);
    expect(select.value).toBe('inherit');

    dom.window.close();
  });

  test('repeated refreshes neither duplicate options nor overwrite a local unsaved selection', async () => {
    const { dom, api, select } = createHarness(`
      <select id="style">
        <option value="auto" selected>Auto</option>
        <option value="sky-ballet">Sky Ballet</option>
      </select>
    `);
    const firstResponse = deferred();
    const fetchImpl = jest.fn(() => firstResponse.promise);

    const pendingRefresh = api.refreshStyleSelect(select, {
      surface: 'global',
      selectedValue: 'auto',
      fetchImpl,
      force: true
    });
    select.value = 'sky-ballet';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    firstResponse.resolve(jsonResponse(publishedCatalog()));
    await pendingRefresh;

    expect(select.value).toBe('sky-ballet');
    await api.refreshStyleSelect(select, {
      surface: 'global',
      selectedValue: 'auto',
      fetchImpl: jest.fn(async () => jsonResponse(publishedCatalog())),
      force: true
    });
    expect(select.value).toBe('sky-ballet');
    expect(select.querySelectorAll('option[value="auto"]')).toHaveLength(1);
    for (const id of BUILT_IN_IDS) {
      expect(select.querySelectorAll(`option[value="${id}"]`)).toHaveLength(1);
    }
    expect(select.querySelectorAll(`option[value="${CUSTOM_ID}"]`)).toHaveLength(1);

    dom.window.close();
  });

  test('ignores a stale catalog response after a newer forced refresh', async () => {
    const { dom, api, select } = createHarness();
    const slow = deferred();
    const first = api.refreshStyleSelect(select, {
      surface: 'global',
      selectedValue: 'auto',
      fetchImpl: jest.fn(() => slow.promise),
      force: true
    });
    const newerId = 'custom:00000000-0000-4000-8000-000000000602';
    await api.refreshStyleSelect(select, {
      surface: 'global',
      selectedValue: newerId,
      fetchImpl: jest.fn(async () => jsonResponse({
        success: true,
        selectableStyles: [{ id: newerId, name: 'Newer', builtIn: false }]
      })),
      force: true
    });
    slow.resolve(jsonResponse(publishedCatalog('Stale')));
    await first;

    expect(select.querySelector(`option[value="${newerId}"]`)).not.toBeNull();
    expect(select.querySelector(`option[value="${CUSTOM_ID}"]`)).toBeNull();
    expect(select.value).toBe(newerId);

    dom.window.close();
  });

  test('recognizes canonical Built-ins and strict Custom IDs for lossless Goal round-trips', () => {
    const { dom, api } = createHarness();

    expect(BUILT_IN_IDS.every(id => api.isSelectableStyleId(id))).toBe(true);
    expect(api.isSelectableStyleId(CUSTOM_ID)).toBe(true);
    expect(api.isSelectableStyleId('custom:00000000-0000-0000-0000-000000000601')).toBe(false);
    expect(api.isSelectableStyleId('custom:not-a-uuid')).toBe(false);
    expect(api.isSelectableStyleId('auto')).toBe(false);

    dom.window.close();
  });
});
