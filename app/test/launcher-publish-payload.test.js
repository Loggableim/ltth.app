const path = require('path');
const { spawnSync } = require('child_process');

function findPython() {
  for (const candidate of [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] }
  ]) {
    const probe = spawnSync(candidate.command, [...candidate.args, '--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Python 3 is required for launcher publish payload fixture tests.');
}

describe('launcher publish payload fixtures', () => {
  it('accepts only complete run-bound payloads with matching bytes and hashes', () => {
    const python = findPython();
    const testScript = path.join(__dirname, '..', '..', 'scripts', 'test_launcher_publish_payload.py');
    const result = spawnSync(python.command, [...python.args, '-B', testScript, '-v'], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain('Ran 13 tests');
  });
});
