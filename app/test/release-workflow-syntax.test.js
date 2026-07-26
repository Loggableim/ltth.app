const fs = require('fs');
const path = require('path');

function readWorkflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', name), 'utf8');
}

function hasSecretsInIfCondition(workflow) {
  return workflow.split(/\r?\n/).some((line) => /^\s*if:\s*.*secrets\./.test(line));
}

describe('Release workflow syntax', () => {
  it('publishes immutable tag assets without mutating main after the tag', () => {
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
    expect(releaseWorkflow).not.toMatch(/\bgit\s+(?:add|commit|push|reset|checkout)\b/);
    expect(releaseWorkflow).not.toContain('release_from_new_patch.py');
    expect(releaseWorkflow).toContain('validate_release:');
    expect(releaseWorkflow).toContain('fetch-depth: 0');
    expect(releaseWorkflow).toContain('^v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(releaseWorkflow).toContain('git fetch --no-tags origin main');
    expect(releaseWorkflow).toContain('MAIN_SHA="$(git rev-parse origin/main)"');
    expect(releaseWorkflow).toContain('if [[ "$GITHUB_SHA" != "$MAIN_SHA" ]]');
    expect(releaseWorkflow).not.toContain('git merge-base --is-ancestor');
    expect(releaseWorkflow).toContain('--validate-release-metadata');
    expect(releaseWorkflow).toMatch(
      /build_windows_release_assets:[\s\S]*?needs:\s*validate_release/
    );
    expect(releaseWorkflow).toMatch(
      /build_app_release_asset:[\s\S]*?needs:\s*validate_release/
    );
    expect(releaseWorkflow).toContain('build_app_release_asset:');
    expect(releaseWorkflow).toContain('--release-assets-dir');
    expect(releaseWorkflow).toContain('--commit-sha "$GITHUB_SHA"');
    expect(releaseWorkflow).toContain('name: app-release-assets');
    expect(releaseWorkflow).toContain('ltth_latest.zip');
    expect(releaseWorkflow).toContain('ltth_latest.json');
    expect(releaseWorkflow).toContain('"schema": 1');
    expect(releaseWorkflow).toContain('"component": "launcher.exe"');
    expect(releaseWorkflow).toContain('"commitSha": "$env:GITHUB_SHA"');
    expect(releaseWorkflow).toContain('"bytes":');
    expect(releaseWorkflow).toContain('"sha256":');
    expect(launcherWorkflow).not.toContain('WINDOWS_SIGN_CERT_BASE64');
    expect(launcherWorkflow).not.toContain('WINDOWS_SIGN_CERT_PASSWORD');
    expect(launcherWorkflow).not.toContain('go build -ldflags="-H windowsgui -s -w"');
    expect(launcherWorkflow).not.toContain('Ensure Windows signing certificate is configured');
    expect(launcherWorkflow).not.toContain('signtool.exe');
  });
});
