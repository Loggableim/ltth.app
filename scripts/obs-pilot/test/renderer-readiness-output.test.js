'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { REPORT_PATH, runCli } = require('../renderer-readiness');

const ROOT = path.resolve(__dirname, '../../..');

test('CLI stdout and saved report are valid fail-closed JSON with a real newline', () => {
  const reportPath = path.join(ROOT, ...REPORT_PATH.split('/'));
  const originalWriteFileSync = fs.writeFileSync;
  const originalStdoutWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  let savedBytes;
  let stdout = '';

  try {
    fs.writeFileSync = (file, data, encoding) => {
      assert.equal(path.resolve(file), reportPath);
      savedBytes = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, encoding || 'utf8');
    };
    process.stdout.write = (chunk, encoding, callback) => {
      stdout += Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk);
      const done = typeof encoding === 'function' ? encoding : callback;
      if (typeof done === 'function') done();
      return true;
    };

    runCli(['--write-report']);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    process.stdout.write = originalStdoutWrite;
    process.exitCode = originalExitCode;
  }

  assert.ok(savedBytes, 'the CLI should stage its report write');
  assert.equal(savedBytes.at(-1), 0x0a, 'the saved report should end in an LF byte');
  assert.notEqual(savedBytes.at(-2), 0x5c, 'the saved report should not end in a literal \\n escape');

  const savedReport = JSON.parse(savedBytes.toString('utf8'));
  const stdoutReport = JSON.parse(stdout);
  assert.deepEqual(savedReport, stdoutReport);
  assert.equal(savedReport.decision.releaseReady, false);
  assert.equal(savedReport.decision.transferReady, false);
  assert.equal(savedReport.decision.isoStageAllowed, false);
  assert.equal(savedReport.decision.freezeContract, 'HOLD');
  assert.equal(savedReport.gates.realObs.casesChecked, 0);
  assert.equal(savedReport.gates.realObs.casesExpected, 104);
});
