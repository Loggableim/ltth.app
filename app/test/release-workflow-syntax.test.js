const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const repoRoot = path.join(__dirname, '..', '..');

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

describe('source build and signed launcher handoff workflows', () => {
  const releaseWorkflow = readRepoFile('.github', 'workflows', 'release.yml');
  const launcherWorkflow = readRepoFile('.github', 'workflows', 'build-launcher.yml');
  const publishWorkflow = readRepoFile('.github', 'workflows', 'publish-launcher-handoff.yml');
  const signer = readRepoFile('scripts', 'sign-launcher-candidate.ps1');
  const validator = readRepoFile('scripts', 'lib', 'launcher-release-handoff.psm1');
  const handoffTests = readRepoFile('scripts', 'test_launcher_release_handoff.ps1');
  const payloadValidator = readRepoFile('scripts', 'launcher_publish_payload.py');

  it('pins every third-party action in Pages, release, and launcher publisher workflows to a full commit SHA', () => {
    const pagesWorkflow = readRepoFile('.github', 'workflows', 'pages.yml');
    for (const source of [pagesWorkflow, releaseWorkflow, launcherWorkflow, publishWorkflow]) {
      const workflow = yaml.parse(source);
      for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps || []) {
          if (!step.uses || step.uses.startsWith('./')) continue;
          expect(step.uses).toMatch(/^[^@\s]+@[0-9a-f]{40}$/);
        }
      }
    }
  });

  it('parses all workflows and limits source workflows to unsigned candidate artifacts', () => {
    for (const source of [releaseWorkflow, launcherWorkflow, publishWorkflow]) {
      expect(() => yaml.parse(source)).not.toThrow();
    }

    for (const source of [releaseWorkflow, launcherWorkflow]) {
      expect(source).toContain("go-version: '1.24.10'");
      expect(source).toContain('go test ./...');
      expect(source).toContain('go build -trimpath -buildvcs=false');
      expect(source).toContain('write-launcher-candidate-manifest.ps1');
      expect(source).toContain('name: launcher-candidate');
      expect(source).not.toContain('Require valid Authenticode signature');
      expect(source).not.toContain('signtool.exe');
      expect(source).not.toContain('softprops/action-gh-release');
    }
    expect(releaseWorkflow).toContain('No release is published by this source-build workflow.');
    expect(launcherWorkflow).toContain('This candidate workflow does not sign or publish a release.');
  });

  it('does not persist checkout credentials in read-only release and launcher jobs', () => {
    for (const source of [releaseWorkflow, launcherWorkflow]) {
      const workflow = yaml.parse(source);
      for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps || []) {
          if (step.uses && step.uses.startsWith('actions/checkout@')) {
            expect(step.with && step.with['persist-credentials']).toBe(false);
          }
        }
      }
    }
  });

  it('keeps workflow_dispatch values out of shell source and allowlists them through environment variables', () => {
    const workflow = yaml.parse(launcherWorkflow);
    const steps = workflow.jobs.build.steps;
    const channelStep = steps.find(step => step.name === 'Detect launcher channel');
    const versionStep = steps.find(step => step.name === 'Extract version from tag');
    const runBodies = steps.map(step => step.run || '').join('\n');

    expect(channelStep.env.CHANNEL_INPUT).toBe('${{ inputs.channel }}');
    expect(versionStep.env.VERSION_INPUT).toBe('${{ inputs.version }}');
    expect(versionStep.env.CHANNEL_INPUT).toBe('${{ inputs.channel }}');
    expect(runBodies).not.toContain('${{ inputs.version }}');
    expect(runBodies).not.toContain('${{ inputs.channel }}');
    expect(channelStep.run).toContain('stable|beta');
    expect(versionStep.run).toContain('^[0-9]+\\.[0-9]+\\.[0-9]+$');
  });

  it('validates the exact source-run artifact and commit-bound signed handoff before publishing', () => {
    expect(publishWorkflow).toContain('source_run_id:');
    expect(publishWorkflow).toContain('source_commit:');
    expect(publishWorkflow).toContain('handoff_commit:');
    expect(publishWorkflow).toContain('LAUNCHER_SIGNER_THUMBPRINT');
    expect(publishWorkflow).toContain('actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093');
    expect(publishWorkflow).toContain('run-id: ${{ needs.verify_dispatch_ref.outputs.source_run_id }}');
    expect(publishWorkflow).toContain('validate-launcher-release-handoff.ps1');
    expect(publishWorkflow).toContain("if: startsWith(inputs.release_tag, 'v')");
    expect(publishWorkflow).toContain('Publish validated app release');
    expect(publishWorkflow).toContain('Publish validated launcher-only release');
    expect(publishWorkflow).toContain('prerelease: true');
    expect(publishWorkflow).not.toContain("prerelease: ${{ startsWith(inputs.release_tag, 'launcher-beta-v') }}");
    expect(publishWorkflow).toContain('Release asset copy differs from the validated signed launcher.');
    expect(validator).toContain('Invoke-LauncherSourceRebuild');
    expect(validator).toContain('refs/tags/$ExpectedTag^{commit}');
    expect(validator).toContain('$tagCommit -cne $ExpectedCommitSha');
    expect(validator).toContain('$candidate.tag -cne $ExpectedTag');
    expect(validator).toContain("$signature.Status -ne 'Valid'");
    expect(validator).toContain('SignerCertificate.Thumbprint');
    expect(validator).toContain("$timestampProperty = $signature.PSObject.Properties['TimeStamperCertificate']");
    expect(validator).toContain('$null -eq $timestampProperty -or $null -eq $timestampProperty.Value');
    expect(handoffTests).toContain("'missing-property', 'null-timestamp', 'untrusted', 'invalid', 'wrong-signer'");
    expect(validator).toContain('Staged launcher copy differs from the validated signed candidate.');
  });

  it('builds release launcher candidates from build-src at the workflow commit into the run artifact', () => {
    for (const [source, workflowPath] of [
      [releaseWorkflow, '.github/workflows/release.yml'],
      [launcherWorkflow, '.github/workflows/build-launcher.yml']
    ]) {
      const workflow = yaml.parse(source);
      const buildJobs = Object.values(workflow.jobs).filter(job =>
        (job.steps || []).some(step => step.name === 'Build launcher from source')
      );
      expect(buildJobs).toHaveLength(1);
      const job = buildJobs[0];
      const checkout = job.steps.find(step => step.uses && step.uses.startsWith('actions/checkout@'));
      const build = job.steps.find(step => step.name === 'Build launcher from source');
      const manifest = job.steps.find(step => step.name === 'Write unsigned source candidate manifest');
      const upload = job.steps.find(step => step.with && step.with.name === 'launcher-candidate');

      expect(checkout.with['persist-credentials']).toBe(false);
      expect(checkout.with.ref).toBeUndefined();
      expect(build['working-directory']).toBe('build-src');
      expect(build.run).toContain("Join-Path $env:RUNNER_TEMP 'launcher-candidate'");
      expect(build.run).toContain("Join-Path $candidateDir 'launcher.exe'");
      expect(manifest.run).toContain('-CommitSha $env:GITHUB_SHA');
      expect(manifest.run).toContain('-SourceRunId $env:GITHUB_RUN_ID');
      expect(manifest.run).toContain(`-SourceWorkflow '${workflowPath}'`);
      expect(upload.with.path.split(/\r?\n/).map(value => value.trim()).filter(Boolean)).toEqual([
        '${{ runner.temp }}/launcher-candidate/launcher.exe',
        '${{ runner.temp }}/launcher-candidate/launcher-candidate.json'
      ]);
    }
  });

  it('requires candidate bytes and the matching source-run receipt before an identical clean source rebuild and signing', () => {
    const receiptCheck = signer.indexOf('Assert-LauncherSourceRunReceipt -Receipt $sourceReceipt -Candidate $candidate');
    const candidateHashCheck = signer.indexOf('if ($candidateInfo.Length -ne $candidate.bytes -or');
    const rebuild = signer.indexOf('Invoke-LauncherSourceRebuild -SourceRoot $SourceRoot -ExpectedCommitSha $candidate.commitSha');
    const rebuildHashCheck = signer.indexOf('Pinned clean source rebuild does not match the CI candidate');
    const sign = signer.indexOf('& $SignToolPath sign /sha1 $CertificateThumbprint');

    expect(signer).toContain('--run-id ([string]$candidate.sourceRunId)');
    expect(signer).toContain('--commit-sha $candidate.commitSha');
    expect(receiptCheck).toBeGreaterThanOrEqual(0);
    expect(candidateHashCheck).toBeGreaterThan(receiptCheck);
    expect(rebuild).toBeGreaterThan(candidateHashCheck);
    expect(rebuildHashCheck).toBeGreaterThan(rebuild);
    expect(sign).toBeGreaterThan(rebuildHashCheck);

    const sourceRebuild = validator.slice(
      validator.indexOf('function Invoke-LauncherSourceRebuild'),
      validator.indexOf('function Test-LauncherReleaseHandoff')
    );
    expect(sourceRebuild).toContain('rev-parse HEAD');
    expect(sourceRebuild).toContain('refs/tags/$ExpectedTag^{commit}');
    expect(sourceRebuild).toContain('status --porcelain --untracked-files=all');
    expect(sourceRebuild).toContain('go version go1.24.10 windows/amd64');
    expect(sourceRebuild).toContain("@('build') + $script:LauncherBuildFlags");
  });

  it('publishes only the validated signed launcher copy and its exact manifest-bound release file set', () => {
    const workflow = yaml.parse(publishWorkflow);
    const staging = workflow.jobs['validate-and-stage'];
    const publisher = workflow.jobs.publish;
    const sourceCheckout = staging.steps.find(step => step.name === 'Checkout exact source commit and tags');
    const candidateDownload = staging.steps.find(step => step.name === 'Download exact source-run candidate artifact');
    const validatorStep = staging.steps.find(step => step.name === 'Validate source rebuild, signature, manifests and stage exact release file');
    const stageUpload = staging.steps.find(step => step.name === 'Upload immutable verified payload for this workflow run');
    const payloadCheck = publisher.steps.find(step => step.name === 'Verify exact payload files, run binding and SHA-256 again');
    const releaseSteps = publisher.steps.filter(step => step.uses && step.uses.startsWith('softprops/action-gh-release@'));

    expect(sourceCheckout.with.ref).toBe('${{ needs.verify_dispatch_ref.outputs.source_commit_sha }}');
    expect(candidateDownload.with['run-id']).toBe('${{ needs.verify_dispatch_ref.outputs.source_run_id }}');
    expect(validatorStep.run).toContain('-CandidateDirectory (Join-Path $env:RUNNER_TEMP \'source-candidate\')');
    expect(validatorStep.run).toContain('-SignedDirectory $env:HANDOFF_PATH');
    expect(validatorStep.run).toContain('-ExpectedCommitSha $env:SOURCE_COMMIT');
    expect(validatorStep.run).toContain("Copy-Item -LiteralPath $launcherPath -Destination (Join-Path $stageRoot 'launcher.exe')");
    expect(validatorStep.run).toContain('Release asset copy differs from the validated signed launcher.');
    expect(stageUpload.with.path).toBe('${{ runner.temp }}/validated-launcher-assets');
    expect(payloadCheck.run).toContain('Compare-Object -CaseSensitive -ReferenceObject $expectedNames -DifferenceObject $actualNames');
    expect(payloadCheck.run).toContain('if ([int64]$fields[1] -ne $item.Length -or $fields[2] -cne $hash)');
    expect(payloadCheck.run).toContain('([string]$launcherManifest.sha256).ToLowerInvariant() -cne $launcherFile.Sha256');
    expect(releaseSteps).toHaveLength(2);
    expect(releaseSteps[0].with.files.split(/\r?\n/).map(value => value.trim()).filter(Boolean)).toEqual([
      '${{ runner.temp }}/publish-payload/launcher.exe',
      '${{ runner.temp }}/publish-payload/launcher-release.json',
      '${{ runner.temp }}/publish-payload/launcher-build-provenance.json',
      '${{ runner.temp }}/publish-payload/ltth_latest.zip',
      '${{ runner.temp }}/publish-payload/ltth_latest.json'
    ]);
    expect(releaseSteps[1].with.files.split(/\r?\n/).map(value => value.trim()).filter(Boolean)).toEqual([
      '${{ runner.temp }}/publish-payload/launcher.exe',
      '${{ runner.temp }}/publish-payload/launcher-release.json',
      '${{ runner.temp }}/publish-payload/launcher-build-provenance.json'
    ]);
    expect(publishWorkflow).not.toMatch(/\$\{\{\s*github\.workspace\s*\}\}\/launcher\.exe/i);
    expect(publishWorkflow).not.toContain('Copy-Item -LiteralPath "$env:GITHUB_WORKSPACE\\launcher.exe"');
  });

  it('gates the write-enabled publisher on the canonical workflow ref', () => {
    const workflow = yaml.parse(publishWorkflow);
    const refGate = workflow.jobs.verify_dispatch_ref;
    const staging = workflow.jobs['validate-and-stage'];
    const publisher = workflow.jobs.publish;
    const canonicalRef = "Loggableim/ltth.app/.github/workflows/publish-launcher-handoff.yml@refs/heads/main";

    expect(refGate.if).toContain("github.repository == 'Loggableim/ltth.app'");
    expect(refGate.if).toContain("github.ref == 'refs/heads/main'");
    expect(refGate.if).toContain(canonicalRef);
    expect(refGate.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(staging.needs).toBe('verify_dispatch_ref');
    expect(staging.if).toContain("needs.verify_dispatch_ref.result == 'success'");
    expect(staging.environment).toBeUndefined();
    expect(staging.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(publisher.needs).toBe('validate-and-stage');
    expect(publisher.if).toContain("needs.validate-and-stage.result == 'success'");
    expect(publisher.if).toContain(canonicalRef);
    expect(publisher.environment).toBe('launcher-release');
    expect(publisher.permissions.contents).toBe('write');
    expect(publisher.permissions.actions).toBeUndefined();
  });

  it('verifies source run provenance with read-only Actions permission before artifact download', () => {
    const workflow = yaml.parse(publishWorkflow);
    const gate = workflow.jobs.verify_dispatch_ref;
    const staging = workflow.jobs['validate-and-stage'];
    const sourceDownloads = staging.steps.filter(step =>
      step.uses && step.uses.startsWith('actions/download-artifact@')
    );
    const verifierStep = gate.steps.find(step => step.id === 'verify');

    expect(gate.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(gate.outputs.source_run_id).toBe('${{ steps.verify.outputs.run_id }}');
    expect(gate.outputs.source_commit_sha).toBe('${{ steps.verify.outputs.commit_sha }}');
    expect(gate.steps[0].name).toBe('Checkout publisher workflow validators');
    expect(gate.steps[0].with.ref).toBe('${{ github.sha }}');
    expect(gate.steps[0].with.path).toBeUndefined();
    expect(gate.steps[0].with['persist-credentials']).toBe(false);
    expect(verifierStep.env.SOURCE_REPOSITORY).toBe('${{ github.repository }}');
    expect(verifierStep.env.SOURCE_RUN_ID).toBe('${{ inputs.source_run_id }}');
    expect(verifierStep.env.SOURCE_COMMIT_SHA).toBe('${{ inputs.source_commit }}');
    expect(verifierStep.run).toContain('verify_launcher_source_run.py');
    expect(verifierStep.run).not.toContain('${{');
    expect(staging.needs).toBe('verify_dispatch_ref');
    expect(staging.if).toContain("needs.verify_dispatch_ref.result == 'success'");
    expect(staging.env.SOURCE_RUN_ID).toBe('${{ needs.verify_dispatch_ref.outputs.source_run_id }}');
    expect(staging.env.SOURCE_COMMIT).toBe('${{ needs.verify_dispatch_ref.outputs.source_commit_sha }}');
    expect(staging.steps.find(step => step.name === 'Checkout exact source commit and tags').with.ref)
      .toBe('${{ needs.verify_dispatch_ref.outputs.source_commit_sha }}');
    expect(sourceDownloads).toHaveLength(2);
    for (const step of sourceDownloads) {
      expect(step.with['run-id']).toBe('${{ needs.verify_dispatch_ref.outputs.source_run_id }}');
    }
    expect(readRepoFile('scripts', 'verify_launcher_source_run.py')).toContain('workflow_id');
  });

  it('isolates contents write to a read-only-prepared same-run payload publisher', () => {
    const workflow = yaml.parse(publishWorkflow);
    const gate = workflow.jobs.verify_dispatch_ref;
    const staging = workflow.jobs['validate-and-stage'];
    const publisher = workflow.jobs.publish;
    const upload = staging.steps.find(step => step.name === 'Upload immutable verified payload for this workflow run');
    const manifestStep = staging.steps.find(step => step.name === 'Create exact run-bound payload manifest');
    const download = publisher.steps.find(step => step.name === 'Download verified payload from this workflow run');
    const releaseSteps = publisher.steps.filter(step => step.uses && step.uses.startsWith('softprops/action-gh-release@'));
    const publishUses = publisher.steps.filter(step => step.uses);
    const publisherRunScripts = publisher.steps.filter(step => step.run).map(step => step.run).join('\n');

    expect(gate.permissions.contents).toBe('read');
    expect(staging.permissions.contents).toBe('read');
    expect(gate.permissions.contents).not.toBe('write');
    expect(staging.permissions.contents).not.toBe('write');
    expect(publisher.permissions).toEqual({ contents: 'write' });
    expect(Object.values(workflow.jobs).filter(job => job.environment === 'launcher-release')).toEqual([publisher]);
    expect(staging.outputs.source_run_id).toBe('${{ needs.verify_dispatch_ref.outputs.source_run_id }}');
    expect(staging.outputs.source_commit_sha).toBe('${{ needs.verify_dispatch_ref.outputs.source_commit_sha }}');
    expect(upload.with['name']).toBe('verified-release-payload-${{ github.run_id }}');
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(download.with.name).toBe(upload.with.name);
    expect(download.with['run-id']).toBeUndefined();
    expect(download['continue-on-error']).not.toBe(true);
    expect(manifestStep.env.PUBLISHER_RUN_ID).toBe('${{ github.run_id }}');
    expect(manifestStep.env.SOURCE_RUN_ID).toBe('${{ needs.verify_dispatch_ref.outputs.source_run_id }}');
    expect(manifestStep.env.SOURCE_COMMIT_SHA).toBe('${{ needs.verify_dispatch_ref.outputs.source_commit_sha }}');
    expect(manifestStep.env.HANDOFF_COMMIT_SHA).toBe('${{ inputs.handoff_commit }}');
    expect(publisher.env.HANDOFF_COMMIT_SHA).toBe('${{ inputs.handoff_commit }}');
    expect(payloadValidator).toContain('publisher_run_id=');
    expect(payloadValidator).toContain('source_run_id=');
    expect(payloadValidator).toContain('source_commit_sha=');
    expect(payloadValidator).toContain('handoff_commit_sha=');
    expect(payloadValidator).toContain('release_tag=');
    expect(payloadValidator).toContain('MAX_ASSET_BYTES = 95 * 1024 * 1024');
    expect(payloadValidator).toContain('MAX_JSON_ASSET_BYTES = 1024 * 1024');
    expect(payloadValidator).toContain('MAX_MANIFEST_BYTES = 8192');
    expect(payloadValidator).toMatch(/stream\.read\(1024 \* 1024\)[\s\S]*?digest\.update\(chunk\)/);
    expect(payloadValidator).toContain('return total, digest.hexdigest()');
    expect(payloadValidator).toContain('object_pairs_hook=_unique_json_object');
    expect(payloadValidator).toContain('case_key = key.casefold()');
    expect(payloadValidator).toContain('if actual != expected:');
    expect(publishUses.map(step => step.uses)).toEqual([
      'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
      'softprops/action-gh-release@de2c0eb89ae2a093876385947365aca7b0e5f844',
      'softprops/action-gh-release@de2c0eb89ae2a093876385947365aca7b0e5f844'
    ]);
    expect(publisher.steps.some(step => step.uses && step.uses.startsWith('actions/checkout@'))).toBe(false);
    expect(publisherRunScripts).not.toMatch(/go build|go test|signtool|sign-launcher|validate-launcher-release-handoff/i);
    expect(publisherRunScripts).toContain('Get-FileHash');
    expect(publisherRunScripts).toContain('git/ref/tags/');
    expect(publisherRunScripts).toContain('Release tag no longer points to the verified source commit.');
    expect(publisherRunScripts).toContain('Launcher release manifest does not match verified payload bytes or source tag.');
    expect(publisherRunScripts).toContain('App release manifest does not match verified payload bytes or source tag.');
    expect(publisher.steps.find(step => step.name === 'Reverify existing release tag target before upload'))
      .toBeDefined();
    expect(publisher.steps.find(step => step.name === 'Reverify existing release tag target before upload').env.GH_TOKEN)
      .toBe('${{ secrets.GITHUB_TOKEN }}');
    expect(releaseSteps).toHaveLength(2);
    expect(releaseSteps[0].with.files).toContain('publish-payload/ltth_latest.zip');
    expect(releaseSteps[1].with.files).not.toContain('ltth_latest.zip');
    expect(publisherStepsBeforeRelease(publisher).slice(-1)[0].name)
      .toBe('Reverify existing release tag target before upload');
  });

  it('signs a copy of the CI candidate and binds candidate and signed hashes in provenance', () => {
    expect(signer).toContain('Copy-Item -LiteralPath $CandidatePath -Destination $stagedPath');
    expect(signer).toContain("Join-Path $PSScriptRoot 'verify_launcher_source_run.py'");
    expect(signer.indexOf('$sourceRunVerifierPath')).toBeLessThan(signer.indexOf('& $SignToolPath sign'));
    expect(signer.indexOf('Assert-LauncherSourceRunReceipt')).toBeLessThan(signer.indexOf('& $SignToolPath sign'));
    expect(signer.indexOf('Invoke-LauncherSourceRebuild')).toBeLessThan(signer.indexOf('& $SignToolPath sign'));
    expect(signer).toContain('& $SignToolPath sign /sha1 $CertificateThumbprint');
    expect(signer).toContain('& $SignToolPath verify /pa /all /tw $stagedPath');
    expect(signer).toContain('timestampSignerThumbprint');
    expect(signer).toContain('candidateManifestSha256');
    expect(signer).toContain('candidateSha256 = $candidate.sha256');
    expect(signer).toContain('signedSha256 = $signedHash');
    expect(signer).toContain('expectedSignerThumbprint = $expectedSigner');
  });
});

function publisherStepsBeforeRelease(publisher) {
  const firstReleaseIndex = publisher.steps.findIndex(step => step.uses && step.uses.startsWith('softprops/action-gh-release@'));
  return publisher.steps.slice(0, firstReleaseIndex);
}
