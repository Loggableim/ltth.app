const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function findPythonCommand() {
  const candidates = [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] }
  ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '--version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  throw new Error('Python 3 is required for the New Patch closed-beta ZIP fixtures.');
}

test('manual New Patch staging rejects policy-withdrawn plugins before deploy and keeps harmless plugins', () => {
  const python = findPythonCommand();
  const repoRoot = path.join(__dirname, '..', '..');
  const validatorPath = path.join(repoRoot, 'scripts', 'release_from_new_patch.py');
  const policyPath = path.join(repoRoot, 'app', 'config', 'plugin-release-policy.json');
  const releasePolicy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const blockedIdCount = new Set([
    ...releasePolicy.closedBeta,
    ...(releasePolicy.publicRuntimeExcluded || []),
    ...Object.keys(releasePolicy.aliases || {}),
    'chatango'
  ]).size;
  const probe = String.raw`
import contextlib, importlib.util, io, json, pathlib, shutil, sys, tempfile, zipfile

validator_path = pathlib.Path(sys.argv[1])
policy_source = pathlib.Path(sys.argv[2])
spec = importlib.util.spec_from_file_location('release_from_new_patch', validator_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
policy = json.loads(policy_source.read_text(encoding='utf-8-sig'))
blocked = list(dict.fromkeys([
    *policy['closedBeta'],
    *policy.get('publicRuntimeExcluded', []),
    *policy.get('aliases', {}).keys(),
    'chatango',
]))
cases = [(f'direct-{plugin_id}', {
    f'ltth_1.4.5/app/plugins/{plugin_id}/main.js': 'synthetic withdrawn source'
}, True) for plugin_id in blocked]
cases.extend((f'normalized-chatango-path-{index}', {
    f'ltth_1.4.5/app/plugins/{spelling}/main.js': 'synthetic retired source'
}, True) for index, spelling in enumerate(['Chatango', 'Ｃｈａｔａｎｇｏ', '%63hatango', '%2563hatango']))
cases.extend([
    ('normalized-chatango-manifest-id', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': 'Ｃｈａｔａｎｇｏ'}),
    }, True),
    ('encoded-chatango-manifest-alias', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': 'ordinary', 'aliases': ['%63hatango']}),
    }, True),
    ('double-encoded-chatango-manifest-replacement', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': 'ordinary', 'replaces': ['%2563hatango']}),
    }, True),
    ('upper-chatango-manifest-alias', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': 'ordinary', 'aliases': ['CHATANGO']}),
    }, True),
])
first_beta = policy['closedBeta'][0]
first_alias = next(iter(policy.get('aliases', {})))
cases.extend([
    ('renamed-manifest-id', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': first_beta}),
    }, True),
    ('renamed-manifest-alias', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': 'ordinary', 'aliases': [first_alias.upper()]}),
    }, True),
    ('renamed-manifest-replacement', {
        'ltth_1.4.5/app/plugins/ordinary/plugin.json': json.dumps({'id': 'ordinary', 'replaces': [first_alias]}),
    }, True),
    ('harmless-plugin', {
        'ltth_1.4.5/app/plugins/goals/plugin.json': json.dumps({'id': 'goals'}),
        'ltth_1.4.5/app/plugins/goals/main.js': 'synthetic harmless plugin',
        'ltth_1.4.5/app/plugins/music-bot-helper/main.js': 'synthetic unrelated plugin',
    }, False),
])

with tempfile.TemporaryDirectory(prefix='ltth-new-patch-beta-') as temporary:
    base = pathlib.Path(temporary)
    for name, members, should_reject in cases:
        root = base / name
        app = root / 'app'
        (app / 'config').mkdir(parents=True)
        shutil.copyfile(policy_source, app / 'config' / 'plugin-release-policy.json')
        (app / 'CURRENT_VERSION.txt').write_text('1.4.4\\n', encoding='utf-8')
        old_zip = b'PREVIOUS_PUBLIC_ZIP_FIXTURE'
        (app / 'ltth_latest.zip').write_bytes(old_zip)
        local_env = bytes([0, 255, 3, 7, 13, 10])
        (app / '.env').write_bytes(local_env)
        patch = root / 'new_patch' / 'ltth_1.4.5'
        patch.mkdir(parents=True)
        with zipfile.ZipFile(patch / 'ltth_1.4.5.zip', 'w') as archive:
            for member, content in members.items():
                archive.writestr(member, content)
        (patch / 'changelog.txt').write_text('synthetic only', encoding='utf-8')

        manager = module.ReleaseManager(root)
        if should_reject:
            with contextlib.redirect_stdout(io.StringIO()):
                accepted = manager.run_release()
            if accepted is not False:
                raise AssertionError(f'{name} unexpectedly reached staging')
            if (app / 'ltth_latest.zip').read_bytes() != old_zip:
                raise AssertionError(f'{name} changed the existing public ZIP')
            if (app / '.env').read_bytes() != local_env:
                raise AssertionError(f'{name} changed the local env fixture')
            if (app / 'CURRENT_VERSION.txt').read_text(encoding='utf-8') != '1.4.4\\n':
                raise AssertionError(f'{name} changed current version metadata')
            if (app / 'archive' / 'ltth_1.4.4.zip').exists() or (root / 'released_patches' / 'ltth_1.4.5').exists():
                raise AssertionError(f'{name} mutated release staging before rejection')
            if not patch.exists():
                raise AssertionError(f'{name} removed its input patch')
        else:
            with contextlib.redirect_stdout(io.StringIO()):
                accepted = manager.validate_patch(patch, module.SemVer('1.4.5'))
            if accepted is not True:
                raise AssertionError('harmless plugin fixture should remain accepted')
            if (app / 'ltth_latest.zip').read_bytes() != old_zip or (app / '.env').read_bytes() != local_env:
                raise AssertionError('harmless patch validation changed local files')

    print(json.dumps({'blockedCases': len(blocked) + 11, 'allowedCases': 1, 'allPassed': True}, sort_keys=True))
`;
  const result = spawnSync(python.command, [...python.args, '-c', probe, validatorPath, policyPath], {
    cwd: repoRoot,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Python fixture exited ${result.status}`);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout.trim())).toEqual({
    blockedCases: blockedIdCount + 11,
    allowedCases: 1,
    allPassed: true
  });
});
