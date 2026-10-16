'use strict';

const fs = require('fs');
const {
  compareSnapshots,
  formatVerdicts,
  readState,
  snapshotFile,
  toSnapshot
} = require('./live-read-prep');

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return '';
  return process.argv[index + 1];
}

function main() {
  const command = process.argv[2];
  const configDir = arg('--config');
  if (!configDir) {
    process.stderr.write('config directory is required\n');
    process.exit(2);
  }
  if (command === 'snapshot') {
    const out = arg('--out');
    if (!out) {
      process.stderr.write('snapshot output is required\n');
      process.exit(2);
    }
    fs.writeFileSync(out, `${JSON.stringify(snapshotFile(configDir))}\n`);
    process.stdout.write('snapshot: written\n');
    return;
  }
  if (command === 'compare') {
    const beforePath = arg('--before');
    if (!beforePath) {
      process.stderr.write('before snapshot is required\n');
      process.exit(2);
    }
    const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    const after = toSnapshot(readState(configDir));
    const verdicts = compareSnapshots(before, after);
    process.stdout.write(`${formatVerdicts(verdicts)}\n`);
    if (Object.values(verdicts).some(value => value === false)) process.exit(1);
    return;
  }
  process.stderr.write('use snapshot or compare\n');
  process.exit(2);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
