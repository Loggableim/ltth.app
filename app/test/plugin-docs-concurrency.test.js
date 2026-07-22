const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeFileAtomically } = require('../../scripts/build-plugin-docs');

describe('plugin documentation generator', () => {
  test('retries a transient Windows rename lock', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-docs-'));
    const target = path.join(directory, 'guide.json');
    const originalRename = fs.renameSync;
    const renameSync = jest.spyOn(fs, 'renameSync');
    let attempts = 0;

    renameSync.mockImplementation((from, to) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('The file is locked');
        error.code = 'EPERM';
        throw error;
      }
      return originalRename.call(fs, from, to);
    });

    try {
      writeFileAtomically(target, '{"ready":true}\n');
      expect(attempts).toBe(2);
      expect(fs.readFileSync(target, 'utf8')).toBe('{"ready":true}\n');
    } finally {
      renameSync.mockRestore();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
