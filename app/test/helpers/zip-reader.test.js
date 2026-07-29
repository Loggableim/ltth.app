const path = require('path');

const { readZipEntries } = require('./zip-reader');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('ZIP entry reader', () => {
  it('reads two consecutive compressed entries from Stream Monsters 1.11.1', async () => {
    const packagePath = path.join(
      repoRoot,
      'plugin-store',
      'packages',
      'streamalchemy-1.11.1.zip'
    );
    const entries = await readZipEntries(packagePath);

    expect(entries.get('assets/audio/cues/arena-heal-1.wav')).toHaveLength(11592);
    expect(entries.get('assets/audio/cues/arena-hit-1.wav')).toHaveLength(41410);
  });
});
