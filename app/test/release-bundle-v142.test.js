const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function findPythonCommand() {
  for (const candidate of [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] }
  ]) {
    if (spawnSync(candidate.command, [...candidate.args, '--version']).status === 0) {
      return candidate;
    }
  }
  return null;
}
const python = findPythonCommand();

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

describe('LTTH 1.4.2 release metadata', () => {
  (python ? test : test.skip)('requires the canonical Stream Monsters 1.12 store contract', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-v142-'));
    const scriptDir = path.join(root, 'scripts');
    const packageDir = path.join(root, 'plugin-store', 'packages');
    const packagePath = path.join(packageDir, 'stream-monsters-1.12.0.zip');
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'build_release_bundle.py'),
      path.join(scriptDir, 'build_release_bundle.py')
    );
    fs.writeFileSync(packagePath, Buffer.from('stream-monsters-1.12.0-package'));

    writeJson(path.join(root, 'version.json'), {
      version: '1.4.2',
      downloadVersion: '1.4.2'
    });
    writeJson(path.join(root, 'package.json'), { version: '1.4.2' });
    writeJson(path.join(root, 'app', 'package.json'), { version: '1.4.2' });
    writeJson(path.join(root, 'app', 'package-lock.json'), {
      version: '1.4.2',
      packages: { '': { version: '1.4.2' } }
    });
    writeJson(path.join(root, 'app', 'plugins', 'stream-monsters', 'plugin.json'), {
      id: 'stream-monsters',
      name: 'Stream Monsters',
      version: '1.12.0',
      devStatus: 'stable'
    });

    const storeEntry = {
      id: 'stream-monsters',
      aliases: ['streamalchemy'],
      replaces: ['streamalchemy'],
      name: Object.fromEntries(['de', 'en', 'es', 'fr'].map(locale => (
        [locale, 'Stream Monsters']
      ))),
      version: '1.11.1',
      minLtthVersion: '1.4.2',
      channel: 'stable',
      packageUrl: 'https://ltth.app/plugin-store/packages/stream-monsters-1.12.0.zip',
      sha256: crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex')
    };
    writeJson(path.join(root, 'plugin-store.json'), { plugins: [storeEntry] });

    const run = () => spawnSync(
      python.command,
      [
        ...python.args,
        path.join(scriptDir, 'build_release_bundle.py'),
        '--version',
        '1.4.2',
        '--validate-release-metadata'
      ],
      { cwd: root, encoding: 'utf8' }
    );

    try {
      const stale = run();
      expect(stale.status).not.toBe(0);
      expect(stale.stderr).toContain(
        'plugin-store.json stream-monsters.version must be 1.12.0 for LTTH 1.4.2'
      );

      storeEntry.version = '1.12.0';
      storeEntry.aliases = [];
      writeJson(path.join(root, 'plugin-store.json'), { plugins: [storeEntry] });
      const missingAlias = run();
      expect(missingAlias.status).not.toBe(0);
      expect(missingAlias.stderr).toContain('aliases/replaces must reserve streamalchemy');

      storeEntry.aliases = ['streamalchemy'];
      writeJson(path.join(root, 'plugin-store.json'), { plugins: [storeEntry] });
      const valid = run();
      expect(valid.status).toBe(0);
      expect(valid.stderr).toBe('');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
