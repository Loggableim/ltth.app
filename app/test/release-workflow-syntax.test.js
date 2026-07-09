const fs = require('fs');
const path = require('path');

function readWorkflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', name), 'utf8');
}

function hasSecretsInIfCondition(workflow) {
  return workflow.split(/\r?\n/).some((line) => /^\s*if:\s*.*secrets\./.test(line));
}

describe('Release workflow syntax', () => {
  it('does not use secrets in if conditions or an empty top-level env block', () => {
    const releaseWorkflow = readWorkflow('release.yml');
    const launcherWorkflow = readWorkflow('build-launcher.yml');

    expect(releaseWorkflow).not.toContain('\nenv:\njobs:');
    expect(hasSecretsInIfCondition(releaseWorkflow)).toBe(false);
    expect(hasSecretsInIfCondition(launcherWorkflow)).toBe(false);
    expect(releaseWorkflow).not.toContain('WINDOWS_SIGN_CERT_BASE64');
    expect(releaseWorkflow).not.toContain('WINDOWS_SIGN_CERT_PASSWORD');
    expect(releaseWorkflow).not.toContain('go build -ldflags="-H windowsgui -s -w"');
    expect(releaseWorkflow).not.toContain('Ensure Windows signing certificate is configured');
    expect(releaseWorkflow).not.toContain('signtool.exe');
    expect(releaseWorkflow).toContain('git fetch origin main');
    expect(releaseWorkflow).toContain('git rebase origin/main');
    expect(launcherWorkflow).not.toContain('WINDOWS_SIGN_CERT_BASE64');
    expect(launcherWorkflow).not.toContain('WINDOWS_SIGN_CERT_PASSWORD');
    expect(launcherWorkflow).not.toContain('go build -ldflags="-H windowsgui -s -w"');
    expect(launcherWorkflow).not.toContain('Ensure Windows signing certificate is configured');
    expect(launcherWorkflow).not.toContain('signtool.exe');
  });
});
