const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function findPythonCommand() {
  const candidates = [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] }
  ];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, '--version'], {
      encoding: 'utf8'
    });
    if (probe.status === 0) return candidate;
  }

  throw new Error('Python 3 is required for the New Patch ZIP guard fixtures.');
}

test('New Patch ZIP guard rejects env files and preserves only the canonical launcher template', () => {
  const python = findPythonCommand();
  const validatorPath = path.join(__dirname, '..', '..', 'scripts', 'release_from_new_patch.py');
  const probe = String.raw`
import importlib.util, json, pathlib, sys, tempfile, zipfile

spec = importlib.util.spec_from_file_location('release_from_new_patch', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix='ltth-new-patch-env-') as temporary:
    root = pathlib.Path(temporary)
    local_env = root / 'app' / '.env'
    local_env.parent.mkdir(parents=True)
    local_env.write_bytes(b'LOCAL_SECRET=synthetic-preserve-fixture\\n')
    before = local_env.read_bytes()
    manager = module.ReleaseManager(root)
    cases = {
        'root env': ('app/.env', b'SYNTHETIC_SECRET=never-use-real-value\\n', False),
        'uppercase env alias': ('app/.ENV', b'SYNTHETIC_SECRET=never-use-real-value\\n', False),
        'local env variant': ('app/.env.local', b'SYNTHETIC_SECRET=never-use-real-value\\n', False),
        'nested production env': ('app/config/.env.production', b'SYNTHETIC_SECRET=never-use-real-value\\n', False),
        'nested template': ('app/config/.env.example', b'API_KEY=__SYNTHETIC_PLACEHOLDER__\\n', False),
        'canonical launcher template': ('ltth_9.8.7/app/.env.example', b'API_KEY=__SYNTHETIC_PLACEHOLDER__\\n', True),
    }
    results = {}
    version = module.SemVer('9.8.7')
    for name, (member, contents, expected) in cases.items():
        patch = root / 'new_patch' / name.replace(' ', '-')
        patch.mkdir(parents=True)
        archive_path = patch / 'ltth_9.8.7.zip'
        with zipfile.ZipFile(archive_path, 'w') as archive:
            archive.writestr(member, contents)
        (patch / 'changelog.txt').write_text('synthetic fixture', encoding='utf-8')
        actual = manager.validate_patch(patch, version)
        if actual is not expected:
            raise AssertionError(f'{name}: expected {expected}, got {actual}')
        if local_env.read_bytes() != before:
            raise AssertionError('local .env fixture changed during package validation')
        results[name] = actual

    print(json.dumps(results, sort_keys=True))
`;
  const result = spawnSync(python.command, [...python.args, '-c', probe, validatorPath], {
    cwd: path.dirname(validatorPath),
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    encoding: 'utf8'
  });

  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Python fixture exited ${result.status}`);
  expect(result.stderr).toBe('');
  const outputLine = result.stdout.trim().split(/\r?\n/).at(-1);
  expect(JSON.parse(outputLine)).toEqual({
    'canonical launcher template': true,
    'local env variant': false,
    'nested production env': false,
    'nested template': false,
    'root env': false,
    'uppercase env alias': false
  });
});
