const { spawnSync } = require('child_process');
const path = require('path');

test('all public ZIP producers exclude root launcher and preserve source binaries', () => {
  const result = spawnSync('C:\\Python314\\python.exe', ['-B', 'scripts/test_public_zip_launcher_exclusion.py', '-v'], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });
  expect(result.error).toBeUndefined();
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stderr).toContain('Ran 3 tests');
});
