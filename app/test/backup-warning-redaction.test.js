'use strict';

const { redactLocalPaths, LOCAL_PATH_REPLACEMENT } = require('../modules/backup/redact-local-paths');

describe('backup warning local path redaction', () => {
  test.each([
    ['ENOENT: C:\\Users\\alice\\AppData\\Local\\secret.db', `ENOENT: ${LOCAL_PATH_REPLACEMENT}`],
    ['EACCES: /home/alice/.config/ltth/settings.json', `EACCES: ${LOCAL_PATH_REPLACEMENT}`],
    ['Could not read \\\\fileserver\\users\\alice\\config.json', `Could not read ${LOCAL_PATH_REPLACEMENT}`],
    ['See https://example.test/docs', 'See https://example.test/docs']
  ])('redacts local path and retains error context: %s', (value, expected) => {
    expect(redactLocalPaths(value)).toBe(expected);
  });

  test('leaves relative archive paths intact', () => {
    const value = 'See plugins/demo/config.json';
    expect(redactLocalPaths(value)).toBe(value);
  });
});
