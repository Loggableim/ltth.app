const {
  collectSharedUserFacingEntries,
  applyLocaleValue,
  parseTranslationResponse,
  protectTokens,
  restoreTokens,
  splitBatchTranslation
} = require('../../scripts/lib/plugin-locale-translation');

describe('plugin locale translation migration', () => {
  test('finds only shared, localizable UI copy and excludes stable technical labels', () => {
    const locales = {
      de: { plugins: { demo: { label: 'Save configuration', protocol: 'HTTP', resolution: '1080p (1920x1080)', provider: 'OpenAI (GPT)', payload: '[ {"action":"fog"} ]' } } },
      en: { plugins: { demo: { label: 'Save configuration', protocol: 'HTTP', resolution: '1080p (1920x1080)', provider: 'OpenAI (GPT)', payload: '[ {"action":"fog"} ]' } } },
      es: { plugins: { demo: { label: 'Save configuration', protocol: 'HTTP', resolution: '1080p (1920x1080)', provider: 'OpenAI (GPT)', payload: '[ {"action":"fog"} ]' } } },
      fr: { plugins: { demo: { label: 'Save configuration', protocol: 'HTTP', resolution: '1080p (1920x1080)', provider: 'OpenAI (GPT)', payload: '[ {"action":"fog"} ]' } } }
    };

    expect(collectSharedUserFacingEntries(locales)).toEqual([
      { key: 'plugins.demo.label', value: 'Save configuration' }
    ]);
  });

  test('preserves interpolation tokens when assigning static translations', () => {
    const { text, tokens } = protectTokens('Save {{count}} files to %s');
    const translated = restoreTokens('Speichere __LTTH_TOKEN_0__ Dateien in __LTTH_TOKEN_1__', tokens);
    const locale = { plugins: { demo: { message: 'Save {{count}} files to %s' } } };

    expect(text).toBe('Save __LTTH_TOKEN_0__ files to __LTTH_TOKEN_1__');
    expect(translated).toBe('Speichere {{count}} Dateien in %s');
    expect(applyLocaleValue(locale, 'plugins.demo.message', translated)).toEqual({
      plugins: { demo: { message: 'Speichere {{count}} Dateien in %s' } }
    });
  });

  test('reassembles Google translation response fragments', () => {
    expect(parseTranslationResponse([[['Konfiguration ', 'Save ', null, null], ['speichern', 'configuration', null, null]]])).toBe('Konfiguration speichern');
  });

  test('splits a batched translation only at its explicit sentinels', () => {
    const response = [[['Speichern\n__LTTH_BATCH_0__\nÖffnen', 'Save\n__LTTH_BATCH_0__\nOpen', null, null]]];

    expect(splitBatchTranslation(response, ['__LTTH_BATCH_0__'])).toEqual(['Speichern', 'Öffnen']);
    const threeValues = [[['Eins\n__LTTH_BATCH_0__\nZwei\n__LTTH_BATCH_1__\nDrei', '', null, null]]];
    expect(splitBatchTranslation(threeValues, ['__LTTH_BATCH_0__', '__LTTH_BATCH_1__'])).toEqual(['Eins', 'Zwei', 'Drei']);
    expect(() => splitBatchTranslation(response, ['__LTTH_BATCH_1__'])).toThrow('separators');
  });
});
