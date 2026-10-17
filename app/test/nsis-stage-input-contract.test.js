const { spawnSync } = require('child_process');
const path = require('path');

test('offline NSIS stage contract rejects adversarial bindings', () => {
  const result = spawnSync('C:\\Python314\\python.exe', ['-B', 'scripts/test_nsis_stage_input_contract.py', '-v'], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });
  expect(result.error).toBeUndefined();
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stderr).toContain('Ran 14 tests');
  expect(result.stderr).not.toContain('skipped');
});
