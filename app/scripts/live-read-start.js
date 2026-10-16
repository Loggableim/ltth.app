'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  AUTO_STOP_MS,
  assessConfig,
  buildChildEnv,
  compareSnapshots,
  formatVerdicts,
  keyStatus,
  prepareTempProfile,
  readState,
  redact,
  toSnapshot
} = require('./live-read-prep');

function readConfigPath(appDir) {
  const filePath = path.join(appDir, '.config_path');
  if (!fs.existsSync(filePath)) return { exists: false, contents: '' };
  return { exists: true, contents: fs.readFileSync(filePath, 'utf8') };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-readtest-config-'));
}

function dryRun(env) {
  const tempRoot = makeTempRoot();
  const configDir = path.join(tempRoot, 'ltth.app');
  try {
    const appDir = path.join(__dirname, '..');
    const configFile = readConfigPath(appDir);
    const assessment = assessConfig({
      platform: process.platform,
      tempRoot,
      configPathContents: configFile.contents,
      configPathExists: configFile.exists
    });
    if (!assessment.ok) {
      process.stderr.write(`${redact(assessment.reason, env)}\n`);
      process.exitCode = 2;
      return;
    }
    prepareTempProfile(configDir);
    const before = toSnapshot(readState(configDir));
    const after = toSnapshot(readState(configDir));
    const verdicts = compareSnapshots(before, after);
    const lines = [
      `config_directory: ${configDir}`,
      `auto_stop_ms: ${AUTO_STOP_MS}`,
      'auto_reconnect: off',
      `key: ${keyStatus(env)}`,
      'sidekick_live: no',
      'spawned: no',
      formatVerdicts(verdicts),
      'dry_run: ok'
    ];
    process.stdout.write(`${redact(lines.join('\n'), env)}\n`);
    if (Object.values(verdicts).some(value => value === false)) process.exitCode = 1;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const run = process.argv.includes('--run');
  const env = process.env;
  if (!run || process.argv.includes('--dry-run')) {
    dryRun(env);
    return;
  }
  if (process.platform !== 'win32') {
    process.stderr.write('run requires win32; this platform stays on dry-run\n');
    process.exit(2);
  }
  if (keyStatus(env) !== 'present') {
    process.stderr.write('key: missing\n');
    process.exit(2);
  }
  const appDir = path.join(__dirname, '..');
  const configFile = readConfigPath(appDir);
  const tempRoot = makeTempRoot();
  const assessment = assessConfig({
    platform: 'win32',
    tempRoot,
    configPathContents: configFile.contents,
    configPathExists: configFile.exists
  });
  if (!assessment.ok || assessment.runAllowed === false) {
    process.stderr.write(`${assessment.reason || 'config refused'}\n`);
    process.exit(2);
  }
  prepareTempProfile(assessment.configDir);
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: appDir,
    env: buildChildEnv(env, tempRoot),
    stdio: 'ignore'
  });
  const timer = setTimeout(() => {
    child.kill();
  }, AUTO_STOP_MS);
  child.on('exit', () => clearTimeout(timer));
  process.stdout.write(`config_directory: ${assessment.configDir}\nauto_stop_ms: ${AUTO_STOP_MS}\nauto_reconnect: off\nspawned: yes\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
