const fs = require('fs');
const os = require('os');
const path = require('path');

const { I18n } = require('../modules/i18n');

const appRoot = path.join(__dirname, '..');
const repositoryRoot = path.join(appRoot, '..');
const pluginRoot = path.join(appRoot, 'plugins', 'webgpu-fireworks');
const goalsRoot = path.join(appRoot, 'plugins', 'goals');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');
const locales = ['en', 'de', 'es', 'fr'];
const builtInIds = [
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
const actualPhaseIds = ['idle', 'opening', 'build', 'highlight', 'calm', 'bridge', 'breath', 'finale'];

function pluginMessages(locale) {
  return JSON.parse(read(`locales/${locale}.json`)).plugins['webgpu-fireworks'];
}

function valueAt(object, dottedPath) {
  return dottedPath.split('.').reduce((value, segment) => value?.[segment], object);
}

function flattenKeys(value, prefix = '', output = []) {
  for (const [key, entry] of Object.entries(value || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenKeys(entry, fullKey, output);
    } else {
      output.push(fullKey);
    }
  }
  return output;
}

function copyTree(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

describe('WebGPU Fireworks user-facing i18n', () => {
  const runtimeSource = read('gpu/engine.js');
  const settingsSource = read('ui/settings.js');

  test('uses stable plugin keys for dynamic overlay and settings text', () => {
    expect(runtimeSource).toContain('plugins.webgpu-fireworks.runtime.gift_popup');
    expect(runtimeSource).toContain('plugins.webgpu-fireworks.runtime.follow_thanks');
    expect(runtimeSource).toContain('plugins.webgpu-fireworks.runtime.renderer_debug');
    expect(settingsSource).toContain('plugins.webgpu-fireworks.ui.audio_voices');
    expect(settingsSource).toContain('plugins.webgpu-fireworks.ui.remove_palette_color');
    expect(settingsSource).toContain('formatRuntimeFinaleStatus');
  });

  test.each(locales)('%s uses the one canonical plugin namespace', locale => {
    const document = JSON.parse(read(`locales/${locale}.json`));
    expect(Object.keys(document)).toEqual(['plugins']);
    expect(document.plugins).toHaveProperty('webgpu-fireworks');
    expect(document).not.toHaveProperty('webgpu_fireworks');
    expect(document).not.toHaveProperty('generated');
  });

  test('loads the canonical locale through the real runtime loader', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-webgpu-i18n-loader-'));
    const localesDir = path.join(root, 'locales');
    const pluginsDir = path.join(root, 'plugins');
    const isolatedPlugin = path.join(pluginsDir, 'webgpu-fireworks');
    fs.mkdirSync(localesDir, { recursive: true });
    locales.forEach(locale => fs.writeFileSync(path.join(localesDir, `${locale}.json`), '{}\n'));
    copyTree(path.join(pluginRoot, 'locales'), path.join(isolatedPlugin, 'locales'));
    fs.copyFileSync(path.join(pluginRoot, 'plugin.json'), path.join(isolatedPlugin, 'plugin.json'));
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const i18n = new I18n('en', { localesDir, pluginRoots: [pluginsDir] });
      for (const locale of locales) {
        expect(i18n.t('plugins.webgpu-fireworks.shows.classic-crescendo.title', {}, locale))
          .not.toBe('plugins.webgpu-fireworks.shows.classic-crescendo.title');
      }
    } finally {
      log.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps exact key parity and non-empty values across DE/EN/ES/FR', () => {
    const baseline = flattenKeys(pluginMessages('en')).sort();
    for (const locale of locales) {
      const messages = pluginMessages(locale);
      expect(flattenKeys(messages).sort()).toEqual(baseline);
      for (const key of baseline) {
        const value = valueAt(messages, key);
        expect(typeof value === 'number' || (typeof value === 'string' && value.trim())).toBeTruthy();
      }
    }
  });

  test.each(locales)('%s provides all nine localized show titles and descriptions', locale => {
    const shows = pluginMessages(locale).shows;
    for (const id of builtInIds) {
      expect(shows[id].title.trim()).toBeTruthy();
      expect(shows[id].description.trim()).toBeTruthy();
    }
  });

  test.each(locales)('%s provides selector, Superfan, Designer, preview, API and status keys', locale => {
    const messages = pluginMessages(locale);
    const requiredKeys = [
      'selector.auto', 'selector.inherit', 'selector.built_in', 'selector.custom',
      'selector.unavailable', 'selector.length_short', 'selector.length_medium', 'selector.length_long',
      'superfan.style', 'superfan.length', 'superfan.enabled', 'superfan.intensity',
      'superfan.test', 'superfan.test_success', 'superfan.test_failed', 'superfan.global_default',
      'designer.title', 'designer.navigation', 'designer.create', 'designer.save_draft',
      'designer.validate', 'designer.publish', 'designer.duplicate', 'designer.derive_lengths',
      'designer.archive', 'designer.restore', 'designer.import', 'designer.export',
      'designer.unsaved_changes', 'designer.status_draft', 'designer.status_validated',
      'designer.status_published', 'designer.status_archived',
      'preview.starting', 'preview.queued', 'preview.running', 'preview.complete',
      'preview.stopped', 'preview.failed', 'preview.offline', 'preview.busy', 'preview.stale',
      'api.validation_failed', 'api.validation_success', 'api.revision_conflict',
      'api.offline', 'api.busy', 'api.invalid_show', 'api.not_found', 'api.archived',
      'api.preview_not_ready', 'api.publish_requires_validation',
      'status.idle', 'status.active_show', 'status.queue_count'
    ];
    requiredKeys.push(...actualPhaseIds.map(phase => `status.phases.${phase}`));
    requiredKeys.forEach(key => expect(valueAt(messages, key)).toEqual(expect.any(String)));
  });

  test.each(locales)('%s resolves every Settings and Goals finale fixture key', locale => {
    const webgpu = pluginMessages(locale);
    const goals = JSON.parse(fs.readFileSync(path.join(goalsRoot, 'locales', `${locale}.json`), 'utf8'));
    const settingsHtml = read('ui/settings.html');
    const settingsKeys = [...settingsHtml.matchAll(/data-i18n="([^"]+)"/g)].map(match => match[1]);
    const goalsKeys = [
      'goals.modal.firework_finale_style_label',
      'goals.modal.firework_finale_length_label',
      'goals.modal.firework_finale_global_default',
      'goals.modal.firework_finale_built_in_shows',
      'goals.modal.firework_finale_custom_shows',
      'goals.modal.firework_finale_unavailable',
      'goals.modal.firework_finale_length_short',
      'goals.modal.firework_finale_length_medium',
      'goals.modal.firework_finale_length_long',
      ...builtInIds.map(id => `goals.modal.firework_finale_style_${id.replace(/-/g, '_')}`)
    ];
    settingsKeys.forEach(key => expect(valueAt(webgpu, key)).toBeDefined());
    goalsKeys.forEach(key => expect(valueAt(goals, key)).toEqual(expect.any(String)));
  });

  test('keeps configuration controls editorially localized outside English', () => {
    const load = locale => pluginMessages(locale).webgpu_fireworks;
    const de = load('de');
    const es = load('es');
    const fr = load('fr');

    expect(de.save_settings).toBe('Einstellungen speichern');
    expect(es.save_settings).toBe('Guardar ajustes');
    expect(fr.save_settings).toBe('Enregistrer les paramètres');
    expect(de.click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border)
      .toBe('Klicke auf Formen, um sie für die Zufallsauswahl zu aktivieren oder zu deaktivieren. Ausgewählte Formen haben einen goldenen Rand.');
    expect(es.click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border)
      .toBe('Haz clic en las formas para activarlas o desactivarlas para la selección aleatoria. Las formas seleccionadas tienen un borde dorado.');
    expect(fr.click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border)
      .toBe('Cliquez sur les formes pour les activer ou les désactiver pour la sélection aléatoire. Les formes sélectionnées ont une bordure dorée.');
  });

  test('locale repair is canonical and byte-idempotent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-webgpu-i18n-repair-'));
    copyTree(path.join(pluginRoot, 'ui'), path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'ui'));
    copyTree(path.join(pluginRoot, 'locales'), path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'locales'));
    copyTree(path.join(goalsRoot, 'locales'), path.join(root, 'app', 'plugins', 'goals', 'locales'));
    const repair = require(path.join(repositoryRoot, 'scripts', 'repair-webgpu-fireworks-i18n.js'));
    expect(repair).toHaveProperty('repairWebGpuFireworksI18n', expect.any(Function));
    try {
      repair.repairWebGpuFireworksI18n({ root, silent: true });
      const first = locales.map(locale => fs.readFileSync(
        path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'locales', `${locale}.json`),
        'utf8'
      ));
      repair.repairWebGpuFireworksI18n({ root, silent: true });
      const second = locales.map(locale => fs.readFileSync(
        path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'locales', `${locale}.json`),
        'utf8'
      ));
      expect(second).toEqual(first);
      second.forEach(text => expect(JSON.parse(text).plugins).toHaveProperty('webgpu-fireworks'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
