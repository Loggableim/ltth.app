'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeCaptureAtomically } = require('../../scripts/lib/capture-atomic-output');

describe('atomic screenshot output', () => {
  let directory;
  let target;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-atomic-capture-'));
    target = path.join(directory, 'status-view.png');
    fs.writeFileSync(target, 'previous-png');
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('preserves the prior PNG and removes the temporary file when validation fails', async () => {
    await expect(writeCaptureAtomically(target, async (temporaryPath) => {
      fs.writeFileSync(temporaryPath, 'unvalidated-png');
      throw new Error('receipt validation failed');
    })).rejects.toThrow('receipt validation failed');

    expect(fs.readFileSync(target, 'utf8')).toBe('previous-png');
    expect(fs.readdirSync(directory)).toEqual(['status-view.png']);
  });

  test('replaces the prior PNG only after validation succeeds', async () => {
    const result = await writeCaptureAtomically(target, async (temporaryPath) => {
      fs.writeFileSync(temporaryPath, 'validated-png');
      return { receiptValid: true };
    });

    expect(result).toEqual({ receiptValid: true });
    expect(fs.readFileSync(target, 'utf8')).toBe('validated-png');
    expect(fs.readdirSync(directory)).toEqual(['status-view.png']);
  });
});
