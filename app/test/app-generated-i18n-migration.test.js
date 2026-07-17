const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const runtimeSurfaces = [
  'public/dashboard.html',
  'public/ifttt-flow-editor.html',
  'public/terms-of-service.html',
  'tts/ui.html'
];

const languageInvariantRuntimeKeys = {
  de: new Set([
    'common.dashboard.webgpu_emojirain',
    'common.dashboard.google_cloud_console',
    'common.dashboard.gpt_5_nano',
    'common.dashboard.gpt_4o_mini',
    'common.dashboard.gpt_4_turbo',
    'common.dashboard.gpt_3_5_turbo',
    'common.dashboard.n_a_browser',
    'common.dashboard.gpu_rendering',
    // "Region" is the standard technical term in both German and English.
    'common.dashboard.tunnel_region',
    // "Subdomain" is likewise established technical terminology in German.
    'common.dashboard.tunnel_subdomain',
    'common.dashboard.cloudflare_cloudflared',
    'common.dashboard.ltth_app_ltth',
    'common.ifttt_flow_editor.drag_drop',
    'common.terms_of_service.cc_by_nc_4_0',
    'common.terms_of_service.loggableim_gmail_com'
  ]),
  es: new Set([
    'common.dashboard.espanol',
    'common.dashboard.gpt_5_nano',
    'common.dashboard.gpt_4o_mini',
    'common.dashboard.gpt_4_turbo',
    'common.dashboard.gpt_3_5_turbo',
    'common.terms_of_service.cc_by_nc_4_0',
    'common.terms_of_service.loggableim_gmail_com'
  ]),
  fr: new Set([
    'common.dashboard.gpt_5_nano',
    'common.dashboard.gpt_4o_mini',
    'common.dashboard.gpt_4_turbo',
    'common.dashboard.gpt_3_5_turbo',
    'common.dashboard.cloudflare_cloudflared',
    'common.dashboard.ltth_app_ltth',
    'common.description',
    'common.terms_of_service.5_contact',
    'common.terms_of_service.cc_by_nc_4_0',
    'common.terms_of_service.loggableim_gmail_com'
  ])
};

function migratedRuntimeKeys() {
  const keys = new Set();
  for (const surface of runtimeSurfaces) {
    const source = fs.readFileSync(path.join(appRoot, surface), 'utf8');
    for (const match of source.matchAll(/(?:data-i18n(?:-[a-z-]+)?\s*=\s*["']|\bi18n\.t\(\s*["'])(common\.[\w.-]+|plugins\.tts\.legacy_queue\.[\w.-]+)/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

describe('app runtime i18n namespace migration', () => {
  test.each(runtimeSurfaces)('%s does not ship generated i18n references', (surface) => {
    const source = fs.readFileSync(path.join(appRoot, surface), 'utf8');
    expect(source).not.toMatch(/(?:data-i18n(?:-[a-z-]+)?\s*=\s*["']|\bi18n\.t\(\s*["'])generated\./);
  });

  test.each(['de', 'en', 'es', 'fr'])('%s does not retain the generated locale namespace', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'));
    expect(translations).not.toHaveProperty('generated');
  });

  test.each(['de', 'en', 'es', 'fr'])('%s resolves migrated dashboard and TTS runtime keys', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'));
    const get = key => key.split('.').reduce((value, part) => value?.[part], translations);

    expect(get('common.dashboard.live_event_log')).toEqual(expect.any(String));
    expect(get('plugins.tts.legacy_queue.skip_current')).toEqual(expect.any(String));
    expect(get('plugins.tts.legacy_queue.clear_queue')).toEqual(expect.any(String));
  });

  test('keeps migrated user-facing actions and labels in each locale instead of copying the source language', () => {
    const expected = {
      'common.dashboard.hinzufugen': {
        en: 'Add',
        de: 'Hinzufügen',
        es: 'Añadir',
        fr: 'Ajouter'
      },
      'common.dashboard.tiktok_datenquelle': {
        en: 'TikTok Data Source',
        de: 'TikTok-Datenquelle',
        es: 'Fuente de datos de TikTok',
        fr: 'Source de données TikTok'
      },
      'common.dashboard.wird_geladen': {
        en: 'Loading...',
        de: 'Wird geladen...',
        es: 'Cargando...',
        fr: 'Chargement...'
      },
      'common.ifttt_flow_editor.clear_canvas': {
        en: '🗑️ Clear Canvas',
        de: '🗑️ Arbeitsfläche leeren',
        es: '🗑️ Limpiar lienzo',
        fr: '🗑️ Effacer le canevas'
      }
    };

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'));
      const get = key => key.split('.').reduce((value, part) => value?.[part], translations);
      for (const [key, values] of Object.entries(expected)) {
        expect(get(key)).toBe(values[locale]);
      }
    }
  });

  test('permits copied migrated runtime values only for documented language-invariant terms', () => {
    const translations = Object.fromEntries(['de', 'en', 'es', 'fr'].map(locale => [
      locale,
      JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'))
    ]));
    const get = (locale, key) => key.split('.').reduce((value, part) => value?.[part], translations[locale]);

    for (const locale of ['de', 'es', 'fr']) {
      for (const key of migratedRuntimeKeys()) {
        if (get(locale, key) === get('en', key)) {
          expect(languageInvariantRuntimeKeys[locale]).toContain(key);
        }
      }
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('%s preserves ltth.app as the legal-page domain', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'));
    expect(translations.common.terms_of_service.terms_of_service_ltth_app).toContain('ltth.app');
  });

  test('localizes the plugin search placeholder with a stable dashboard key', () => {
    const dashboard = fs.readFileSync(path.join(appRoot, 'public/dashboard.html'), 'utf8');
    expect(dashboard).toContain('id="plugin-search" class="plugin-store-search" placeholder="Search plugins..." data-i18n-placeholder="common.dashboard.search_plugins"');

    const expected = {
      de: 'Plugins suchen...',
      en: 'Search plugins...',
      es: 'Buscar plugins...',
      fr: 'Rechercher des plugins...'
    };
    for (const [locale, value] of Object.entries(expected)) {
      const translations = JSON.parse(fs.readFileSync(path.join(appRoot, 'locales', `${locale}.json`), 'utf8'));
      expect(translations.common.dashboard.search_plugins).toBe(value);
    }
  });
});
