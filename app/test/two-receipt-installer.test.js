const { spawnSync } = require('child_process');
const path = require('path');

test('two receipts enforce bindings, pins and Windows fake-process locks', () => {
  const result = spawnSync('C:\\Python314\\python.exe', ['-B', 'scripts/test_two_receipt_installer.py', '-v'], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });
  expect(result.error).toBeUndefined();
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Python fixture failed');
  expect(result.status).toBe(0);
  expect(result.stderr).toContain('Ran 24 tests');
  expect(result.stderr).not.toContain('skipped');
});
