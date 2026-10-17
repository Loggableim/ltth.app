const path = require('path');
const { spawnSync } = require('child_process');

test('NSIS public staging/preflight synthetic Python contracts', () => {
  const candidates = [['python3'], ['python'], ['py', '-3']];
  const python = candidates.find(command => spawnSync(command[0], [...command.slice(1), '--version'], { encoding: 'utf8' }).status === 0);
  expect(python).toBeDefined();
  const script = path.resolve(__dirname, '../../scripts/test_nsis_public_stage.py');
  const run = spawnSync(python[0], [...python.slice(1), '-B', script, '-v'], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: expect.stringContaining('OK') });
});
