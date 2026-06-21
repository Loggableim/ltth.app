const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getAnimationFilePath,
  getSafeAnimationFilename
} = require('../modules/animation-files');

describe('animation upload path security', () => {
  test('resolves animation files only inside the animation upload directory', () => {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-animations-'));
    fs.writeFileSync(path.join(uploadDir, 'animation-safe.gif'), 'gif');

    expect(getSafeAnimationFilename('animation-safe.gif')).toBe('animation-safe.gif');
    expect(getAnimationFilePath(uploadDir, 'animation-safe.gif')).toBe(path.join(uploadDir, 'animation-safe.gif'));
    expect(() => getAnimationFilePath(uploadDir, '../escape.gif')).toThrow(/Invalid animation filename/);
    expect(() => getAnimationFilePath(uploadDir, 'nested/escape.gif')).toThrow(/Invalid animation filename/);

    fs.rmSync(uploadDir, { recursive: true, force: true });
  });
});
