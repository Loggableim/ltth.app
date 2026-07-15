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

  test('does not report a runtime template expression as static untranslated HTML', () => {
    const plugin = writeFixturePlugin(repoRoot, 'fixture', {
      html: '<script>const card = `<button>${t(\'users.save\')}</button>`;</script>',
      translations: translations()
    });

    const errors = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } }).errors.join('\n');

    expect(errors).not.toContain('missing data-i18n key');
  });
});
