const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../..');
const makensis = 'C:\\Program Files (x86)\\NSIS\\makensis.exe';
const sevenZip = 'C:\\Program Files\\7-Zip\\7z.exe';

const compilerTest = process.platform === 'win32' && fs.existsSync(makensis) && fs.existsSync(sevenZip)
  ? test : test.skip;

test('silent NSIS upgrade defaults to preserving profile data', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'build-src/installer/ltth-installer.nsi'), 'utf8');
  expect(source).toMatch(/ExecWait\s+'\$R0 \/S _\?=\$INSTDIR'/);
  expect(source).toMatch(/MessageBox MB_YESNO\|MB_ICONQUESTION "Do you want to keep your user data and settings\?[\s\S]*?" \/SD IDYES IDYES keep_data/);
  expect(source).toMatch(/MessageBox MB_ICONQUESTION\|MB_YESNO\|MB_DEFBUTTON2 \\\s*"Are you sure you want to completely remove \$\{PRODUCT_NAME\} and all of its components\?" \/SD IDYES \\\s*IDYES \+2/);
  expect(source).toMatch(/RMDir \/r "\$INSTDIR\\app\\user_data"[\s\S]*?RMDir \/r "\$INSTDIR\\app\\user_configs"[\s\S]*?keep_data:/);
});

compilerTest('original NSIS File instructions exclude synthetic environments while retaining required assets (Windows NSIS and 7-Zip required)', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'build-src/installer/ltth-installer.nsi'), 'utf8');
  const instructions = source.split(/\r?\n/).filter(line => /^\s*File /.test(line)
    && (line.includes('${APP_DIR}') || line.includes('${ASSETS_DIR}\\node'))).map(line => line.trim());
  expect(instructions).toHaveLength(1);
  expect(source).toContain('!include "${NSIS_PUBLIC_FILE_LIST}"');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-nsis-environment-fixture-'));
  try {
    const sourceRoot = path.join(temporaryRoot, 'source');
    const appDir = path.join(sourceRoot, 'app');
    const assetDir = path.join(sourceRoot, 'assets');
    const publicStage = path.join(temporaryRoot, 'public-stage');
    const directories = ['data', 'docs', 'locales', 'modules', 'plugins', 'public', 'routes', 'scripts', 'test', 'tts', 'wiki'];
    const targets = [appDir, ...directories.map(name => path.join(appDir, name, 'nested')), path.join(assetDir, 'node', 'nested')];
    for (const directory of targets) {
      fs.mkdirSync(directory, { recursive: true });
      for (const name of ['.env', '.env.local', '.env.production', '.env.example', 'required.txt']) {
        fs.writeFileSync(path.join(directory, name), 'synthetic fixture only');
      }
    }
    fs.mkdirSync(path.join(appDir, 'config'), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, 'app/config/plugin-release-policy.json'), path.join(appDir, 'config/plugin-release-policy.json'));
    fs.writeFileSync(path.join(appDir, '.env.example'), 'API_KEY=__SYNTHETIC_PLACEHOLDER__\n');
    for (const name of ['package.json', 'package-lock.json', 'server.js', 'launch.js']) {
      fs.writeFileSync(path.join(appDir, name), name.endsWith('.json') ? '{}' : '// synthetic');
    }
    fs.writeFileSync(path.join(appDir, 'ordinary fixture file.txt'), 'synthetic filename with spaces');
    const python = ['python3', 'python', 'py'].find(command => spawnSync(command, command === 'py' ? ['-3', '--version'] : ['--version']).status === 0);
    expect(python).toBeDefined();
    const code = 'import json,pathlib,sys; sys.path.insert(0,sys.argv[1]); import prepare_nsis_public_stage as s; root=pathlib.Path(sys.argv[2]); stage=pathlib.Path(sys.argv[3]); s.prepare(root,stage); receipt=json.loads((stage/"nsis-public-stage.json").read_text()); print(s.render_file_list(stage/"app",receipt["files"]))';
    const prepared = spawnSync(python, [...(python === 'py' ? ['-3'] : []), '-B', '-c', code, path.join(repoRoot, 'scripts'), sourceRoot, publicStage], { encoding: 'utf8' });
    expect({ status: prepared.status, stderr: prepared.stderr }).toEqual({ status: 0, stderr: '' });
    expect(prepared.stdout).toContain(`File "${path.join(publicStage, 'app', 'ordinary fixture file.txt')}"`);
    expect(prepared.stdout).not.toMatch(/File \/oname=/);
    const archive = path.join(temporaryRoot, 'fixture.exe');
    const script = path.join(temporaryRoot, 'fixture.nsi');
    fs.writeFileSync(script, [
      'Unicode true', 'Name "Synthetic packaging regression"', `OutFile "${archive}"`,
      `!define APP_DIR "${appDir}"`, `!define ASSETS_DIR "${assetDir}"`,
      'Section', prepared.stdout,
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
    for (const name of directories.filter(name => name !== 'test')) expect(entries).toContain(`app/${name}/nested/required.txt`);
    expect(entries).toContain('node/nested/required.txt');
    expect(entries).not.toContain('app/test/nested/required.txt');
    expect(entries).toContain('app/config/plugin-release-policy.json');
    expect(entries).toContain('app/config/distribution-mode.json');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
