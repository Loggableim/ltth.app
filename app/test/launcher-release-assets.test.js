const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('Launcher release assets', () => {
  it('keeps the root launcher and website download launcher identical', () => {
    const rootLauncher = path.join(__dirname, '..', '..', 'launcher.exe');
    const downloadLauncher = path.join(__dirname, '..', '..', 'downloads', 'launcher.exe');

    expect(fs.existsSync(rootLauncher)).toBe(true);
    expect(fs.existsSync(downloadLauncher)).toBe(true);
    expect(sha256(rootLauncher)).toBe(sha256(downloadLauncher));
  });
});
