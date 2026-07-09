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
  });
});
