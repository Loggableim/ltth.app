const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const locales = ['en', 'de', 'es', 'fr'];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flattenKeys(value, prefix = '', keys = []) {
  Object.entries(value || {}).forEach(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(child)) {
      flattenKeys(child, fullKey, keys);
    } else {
      keys.push(fullKey);
    }
  });
  return keys;
}

function expectSameKeys(reference, actual) {
  const referenceSet = new Set(reference);
  const actualSet = new Set(actual);
  const missing = reference.filter(key => !actualSet.has(key));
  const extra = actual.filter(key => !referenceSet.has(key));

  expect({ missing, extra }).toEqual({ missing: [], extra: [] });
}

describe('i18n locale consistency', () => {
  test('stable overlay routing management copy is complete in every locale', () => {
    const required = [
      'title',
      'description',
      'feature_status',
      'auth_status',
      'route_status',
      'enrollment_status',
      'active_device',
      'connected_username',
      'default_username',
      'heartbeat',
      'sign_in',
      'refresh_account',
      'claim_username',
      'first_claim_acknowledgement',
      'first_claim_warning',
      'restore',
      'release',
      'release_retype',
      'release_confirm',
      'set_default',
      'reenroll',
      'revoke_device',
      'device_label',
      'device_label_default',
      'copy_stable',
      'copy_temporary',
      'overlay_url',
      'no_silent_fallback',
      'unavailable',
      'enabled',
      'signed_in',
      'sign_in_required',
      'active',
      'offline',
      'error',
      'unenrolled',
      'enrolled',
      'no_active_device',
      'never',
      'default_badge',
      'cooldown_until',
      'loading',
      'account_refreshed',
      'action_complete',
      'auth_error',
      'request_error',
      'conflict_error',
      'stable_copied',
      'temporary_copied',
      'stable_copy_failed',
      'attention_claim_required'
    ];

    for (const locale of locales) {
      const translations = readJson(
        path.join(appRoot, 'locales', `${locale}.json`)
      );
      for (const key of required) {
        const value = translations.network?.stable_overlay_routing?.[key];
        expect(typeof value).toBe('string');
        expect(value.trim()).not.toBe('');
      }
    }
  });

  test('runtime loader reads BOM-prefixed locale JSON files', () => {
    jest.resetModules();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const i18n = require('../modules/i18n');
    const esTranslations = i18n.getAllTranslations('es');
    const frTranslations = i18n.getAllTranslations('fr');
    const parseErrors = consoleError.mock.calls
      .map(args => args.join(' '))
      .filter(message => message.includes('Unexpected token'));

    consoleError.mockRestore();

    expect(esTranslations.app.name).toBe("PupCid's Little TikTool Helper");
    expect(frTranslations.app.name).toBe("PupCid's Little TikTool Helper");
    expect(parseErrors).toEqual([]);
  });

  test('central locale files expose the same keys for every supported language', () => {
    const localeKeys = Object.fromEntries(locales.map(locale => {
      const filePath = path.join(appRoot, 'locales', `${locale}.json`);
      return [locale, flattenKeys(readJson(filePath)).sort()];
    }));

    locales.forEach(locale => {
      expectSameKeys(localeKeys.en, localeKeys[locale]);
    });
  });

  test('plugin locale files expose the same keys for every supported language', () => {
    const pluginsDir = path.join(appRoot, 'plugins');
    const plugins = fs.readdirSync(pluginsDir);

    plugins.forEach(plugin => {
      const localesDir = path.join(pluginsDir, plugin, 'locales');
      if (!fs.existsSync(localesDir)) return;

      const localeKeys = Object.fromEntries(locales.map(locale => {
        const filePath = path.join(localesDir, `${locale}.json`);
        expect(fs.existsSync(filePath)).toBe(true);
        return [locale, flattenKeys(readJson(filePath)).sort()];
      }));

      locales.forEach(locale => {
        expectSameKeys(localeKeys.en, localeKeys[locale]);
      });
    });
  });
});
