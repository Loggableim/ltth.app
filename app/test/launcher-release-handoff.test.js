const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

describe('launcher release handoff synthetic contract', () => {
  it('accepts a verified synthetic handoff and rejects altered inputs', () => {
    const scriptPath = path.join(repoRoot, 'scripts', 'test_launcher_release_handoff.ps1');
    const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60000
    });

    if (result.error) {
      throw new Error(`PowerShell handoff fixture could not start (${result.error.code}): ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(
        `PowerShell handoff fixture failed (status ${result.status}, signal ${result.signal || 'none'}).\n` +
        `stdout:\n${(result.stdout || '').slice(0, 4000)}\nstderr:\n${(result.stderr || '').slice(0, 4000)}`
      );
    }
    expect(result.stdout).toContain('PASS: ordinal candidate/signed filename sets');
    expect(result.stdout).toContain('receipt-bound pre-sign');
  });
});
