const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');

const locales = ['de', 'en', 'es', 'fr'];

function writeFixturePlugin(repoRoot, id, { html, translations }) {
  const pluginRoot = path.join(repoRoot, 'app', 'plugins', id);
  const localesRoot = path.join(pluginRoot, 'locales');
  fs.mkdirSync(localesRoot, { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ id }), 'utf8');
  fs.writeFileSync(path.join(pluginRoot, 'ui.html'), html, 'utf8');
  locales.forEach((locale) => {
    fs.writeFileSync(path.join(localesRoot, `${locale}.json`), JSON.stringify(translations[locale]), 'utf8');
  });
  return { id, manifestPath: path.join(pluginRoot, 'plugin.json') };
}

function translations(values = {}) {
  return Object.fromEntries(locales.map((locale) => [locale, {
    plugins: {
      fixture: {
        title: values[locale] || 'Title',
        notice: values.notice?.[locale] || 'Hello ${name}'
      }
    },
    common: { protocol: 'HTTP' }
  }]));
}

function writeAppLocales(repoRoot, values) {
  const localesRoot = path.join(repoRoot, 'app', 'locales');
  fs.mkdirSync(localesRoot, { recursive: true });
  locales.forEach((locale) => {
    fs.writeFileSync(
      path.join(localesRoot, `${locale}.json`),
      JSON.stringify(values[locale]),
      'utf8'
    );
  });
}

describe('plugin UI i18n audit', () => {
  let repoRoot;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-ui-audit-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  test('reports unkeyed controls, locale gaps, interpolation mismatches, and malformed text', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: [
        '<button>Save changes</button>',
        '<label data-i18n="plugins.fixture.title">Title</label>',
        '<p data-i18n="plugins.fixture.notice">Hello</p>'
      ].join(''),
      translations: translations({
        notice: { de: 'Hallo ${name}', en: 'Hello ${person}', es: 'Hola ${name}', fr: 'Bonjour GrÃƒÂ¶ÃƒÅ¸e' }
      })
    });
    const catalog = { plugins: [plugin] };

    const errors = auditPluginUi({ repoRoot, catalog }).errors.join('\n');

    expect(errors).toContain('fixture/ui.html: missing data-i18n key for button text "Save changes"');
    expect(errors).toContain('fixture: parameter mismatch at plugins.fixture.notice');
    expect(errors).toContain('fixture/fr: malformed UTF-8 text at plugins.fixture.notice');
  });

  test('permits protocol labels but requires each declared UI key in every locale', () => {
    const localeData = translations();
    delete localeData.fr.plugins.fixture.title;
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<span>HTTP</span><label data-i18n="plugins.fixture.title">Title</label>',
      translations: localeData
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors;

    expect(errors).toContain('fixture/fr: missing locale leaf plugins.fixture.title used by ui.html');
    expect(errors.join('\n')).not.toContain('HTTP');
  });

  test('reports common-key collisions with both plugin sources', () => {
    const firstTranslations = translations();
    locales.forEach((locale) => {
      firstTranslations[locale].common.save = locale === 'en' ? 'Keep' : 'Different';
    });
    const first = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<button data-i18n="common.save">Save</button>',
      translations: firstTranslations
    });
    const second = writeFixturePlugin(repoRoot, 'second', {
      html: '<button data-i18n="common.save">Save</button>',
      translations: Object.fromEntries(locales.map((locale) => [locale, {
        plugins: { second: { title: 'Other', notice: 'Hello ${name}' } },
        common: { save: locale === 'en' ? 'Save' : 'Different' }
      }]))
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [first, second] } }).errors.join('\n');

    expect(errors).toContain('en: UI translation collision common.save between fixture/ui.html and second/ui.html');
  });

  test('accepts common UI keys supplied by the app locale catalog', () => {
    writeAppLocales(repoRoot, Object.fromEntries(locales.map((locale) => [locale, {
      common: {
        tiktok_studio: {
          copy_url: locale === 'de' ? 'TikTok-Studio-URL kopieren' : `Copy TikTok Studio URL ${locale}`
        }
      }
    }])));
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<button data-i18n="common.tiktok_studio.copy_url">Copy TikTok Studio URL</button>',
      translations: translations()
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors;

    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining('missing locale leaf common.tiktok_studio.copy_url')
    ]));
  });

  test('ignores dynamic translation-key templates that cannot be audited statically', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<script>api.t(`plugins.fixture.${key}`);</script>',
      translations: translations()
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors.join('\n');

    expect(errors).not.toContain('plugins.fixture.${key}');
  });

  test('accepts the shipped data-i18n-key convention but ignores its target and HTML flags', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: [
        '<label data-i18n-key="plugins.fixture.title">Title</label>',
        '<input data-i18n-target="placeholder" data-i18n-key="plugins.fixture.notice">',
        '<p data-i18n-html="true" data-i18n-key="plugins.fixture.notice">Hello</p>'
      ].join(''),
      translations: translations()
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors.join('\n');

    expect(errors).not.toContain('missing data-i18n key');
    expect(errors).not.toContain('data-i18n-target');
    expect(errors).not.toContain('data-i18n-html');
  });

  test('reports untranslated attributes on form controls', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<input placeholder="Search viewers" title="Search by username" aria-label="Viewer search">',
      translations: translations()
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors;

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('missing data-i18n key for placeholder "Search viewers"'),
      expect.stringContaining('missing data-i18n key for title "Search by username"'),
      expect.stringContaining('missing data-i18n key for aria-label "Viewer search"')
    ]));
  });

  test('does not report a runtime template expression as static untranslated HTML', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<script>const card = `<button>${t(\'users.save\')}</button>`;</script>',
      translations: translations()
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors.join('\n');

    expect(errors).not.toContain('missing data-i18n key');
  });

  test('reports raw user-facing text in every first-party plugin script', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<div id="status"></div>',
      translations: translations()
    });
    fs.writeFileSync(
      path.join(repoRoot, 'app', 'plugins', 'fixture', 'live-host-ui.js'),
      "document.getElementById('status').textContent = 'No activity yet.';",
      'utf8'
    );

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors;

    expect(errors).toContain(
      'fixture/live-host-ui.js: raw user-facing text at textContent "No activity yet."'
    );
  });

  test('requires matching brace interpolation parameters in every locale', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<p data-i18n="plugins.fixture.notice">Hello</p>',
      translations: translations({
        notice: { de: 'Hallo {name}', en: 'Hello {name}', es: 'Hola {person}', fr: 'Bonjour {name}' }
      })
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors;

    expect(errors).toContain('fixture: parameter mismatch at plugins.fixture.notice');
  });

  test('does not mistake split HTML attributes for visible text', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<div id="status"></div>',
      translations: translations()
    });
    fs.writeFileSync(
      path.join(repoRoot, 'app', 'plugins', 'fixture', 'ui.js'),
      "document.getElementById('status').innerHTML = '<a href=\\\"' + url + '\\\" download=\\\"\\\">';",
      'utf8'
    );

    expect(auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors).toEqual([]);
  });

  test('does not treat a stylesheet injected into a style element as UI copy', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<div id="status"></div>',
      translations: translations()
    });
    fs.writeFileSync(
      path.join(repoRoot, 'app', 'plugins', 'fixture', 'ui.js'),
      "const style = document.createElement('style'); style.textContent = '.card { color: red; }';",
      'utf8'
    );

    expect(auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors).toEqual([]);
  });

  test('permits the language-independent px unit in dynamically rendered values', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<div id="frame-width"></div>',
      translations: translations()
    });
    fs.writeFileSync(
      path.join(repoRoot, 'app', 'plugins', 'fixture', 'ui.js'),
      "document.getElementById('frame-width').textContent = width + ' px';",
      'utf8'
    );

    expect(auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors).toEqual([]);
  });

  test('checks keys passed to the shipped ClarityHUD runtime translator', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<div id="status"></div>',
      translations: translations()
    });
    fs.writeFileSync(
      path.join(repoRoot, 'app', 'plugins', 'fixture', 'ui.js'),
      "document.getElementById('status').textContent = ClarityHUDI18n.text('missing', 'Fallback');",
      'utf8'
    );

    expect(auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors).toContain(
      'fixture/de: missing locale leaf plugins.fixture.runtime.missing used by ui.js'
    );
  });
});
