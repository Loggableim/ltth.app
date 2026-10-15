const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const makensis = 'C:\\Program Files (x86)\\NSIS\\makensis.exe';
const sevenZip = 'C:\\Program Files\\7-Zip\\7z.exe';

const compilerTest = process.platform === 'win32' && fs.existsSync(makensis) && fs.existsSync(sevenZip)
  ? test : test.skip;

compilerTest('original NSIS File instructions exclude synthetic environments while retaining required assets (Windows NSIS and 7-Zip required)', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'build-src/installer/ltth-installer.nsi'), 'utf8');
  const instructions = source.split(/\r?\n/).filter(line => /^\s*File /.test(line)
    && (line.includes('${APP_DIR}') || line.includes('${ASSETS_DIR}\\node'))).map(line => line.trim());
  expect(instructions).toHaveLength(14);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-nsis-environment-fixture-'));
  try {
    const appDir = path.join(temporaryRoot, 'app');
    const assetDir = path.join(temporaryRoot, 'assets');
    const directories = ['data', 'docs', 'locales', 'modules', 'plugins', 'public', 'routes', 'scripts', 'test', 'tts', 'wiki'];
    const targets = [appDir, ...directories.map(name => path.join(appDir, name, 'nested')), path.join(assetDir, 'node', 'nested')];
    for (const directory of targets) {
      fs.mkdirSync(directory, { recursive: true });
      for (const name of ['.env', '.env.local', '.env.production', '.env.example', 'required.txt']) {
        fs.writeFileSync(path.join(directory, name), 'synthetic fixture only');
      }
    }
    const archive = path.join(temporaryRoot, 'fixture.exe');
    const script = path.join(temporaryRoot, 'fixture.nsi');
    fs.writeFileSync(script, [
      'Unicode true', 'Name "Synthetic packaging regression"', `OutFile "${archive}"`,
      `!define APP_DIR "${appDir}"`, `!define ASSETS_DIR "${assetDir}"`,
      'Section', 'SetOutPath "$INSTDIR\\app"', ...instructions.slice(0, -1),
      'SetOutPath "$INSTDIR\\node"', instructions.at(-1), 'SectionEnd'
    ].join('\n'));
    const compile = spawnSync(makensis, ['/V2', script], { encoding: 'utf8' });
    expect({ error: compile.error?.code, status: compile.status, stdout: compile.stdout, stderr: compile.stderr })
      .toEqual(expect.objectContaining({ error: undefined, status: 0 }));
    const inventory = spawnSync(sevenZip, ['l', '-slt', archive], { encoding: 'utf8' });
    expect(inventory.status).toBe(0);
    const entries = inventory.stdout.split(/\r?\n/).filter(line => line.startsWith('Path = '))
      .map(line => line.slice(7).replace(/\\/g, '/')).slice(1);
    expect(entries.filter(entry => /(?:^|\/)\.env(?:\..*)?$/.test(entry)))
      .toEqual(['app/.env.example']);
    expect(entries).toContain('app/required.txt');
    for (const name of directories) expect(entries).toContain(`app/${name}/nested/required.txt`);
    expect(entries).toContain('node/nested/required.txt');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
