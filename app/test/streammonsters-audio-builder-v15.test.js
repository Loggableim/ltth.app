const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const {
  buildAudioBundle
} = require('../scripts/build-streammonsters-audio-v15');

function snapshotTree(root) {
  const snapshot = {};
  const visit = current => {
    fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach(entry => {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else snapshot[path.relative(root, absolute).replace(/\\/g, '/')] =
          fs.readFileSync(absolute).toString('hex');
      });
  };
  visit(root);
  return snapshot;
}

describe('Stream Monsters 1.5 audio bundle builder', () => {
  test('materializes verified inline license evidence for archives without a license file', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-audio-license-'));
    try {
      const sourceDir = path.join(tempRoot, 'sources');
      const targetAudioDir = path.join(tempRoot, 'audio');
      const fakeFfmpeg = path.join(tempRoot, 'ffmpeg.exe');
      const evidence = [
        'Fixture Audio - license evidence',
        'Source URL: https://example.invalid/audio',
        'License: CC0 1.0 Universal',
        'License URL: https://creativecommons.org/publicdomain/zero/1.0/',
        'Retrieved: 2026-07-26',
        ''
      ].join('\n');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'fixture.zip'), 'fixture-archive');
      fs.writeFileSync(fakeFfmpeg, 'fake');

      const manifest = buildAudioBundle({
        sourceDir,
        targetAudioDir,
        ffmpeg: fakeFfmpeg,
        sources: {
          fixture: {
            name: 'Fixture Audio',
            url: 'https://example.invalid/audio',
            archive: 'fixture.zip',
            archiveSha256: 'archive',
            license: 'CC0-1.0',
            licenseEvidence: evidence,
            licenseFile: 'fixture-LICENSE-EVIDENCE.txt'
          }
        },
        cues: {},
        assertFileHash(filename, expected) {
          if (filename.endsWith('fixture.zip')) expect(expected).toBe('archive');
        },
        runCommand(command, args) {
          expect(command).toBe('tar.exe');
          expect(args[0]).toBe('-xf');
        }
      });

      const evidencePath = path.join(targetAudioDir, 'licenses', 'fixture-LICENSE-EVIDENCE.txt');
      const evidenceHash = crypto.createHash('sha256').update(Buffer.from(evidence)).digest('hex');
      expect(fs.readFileSync(evidencePath, 'utf8')).toBe(evidence);
      expect(manifest.sources).toEqual([
        expect.objectContaining({
          id: 'fixture',
          license: 'CC0-1.0',
          licensePath: 'assets/audio/licenses/fixture-LICENSE-EVIDENCE.txt',
          licenseSha256: evidenceHash
        })
      ]);
      expect(manifest.excludedSources).toEqual([]);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('keeps the previous verified bundle byte-identical when staging fails', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-audio-builder-'));
    try {
      const sourceDir = path.join(tempRoot, 'sources');
      const targetAudioDir = path.join(tempRoot, 'audio');
      const fakeFfmpeg = path.join(tempRoot, 'ffmpeg.exe');
      fs.mkdirSync(path.join(targetAudioDir, 'cues'), { recursive: true });
      fs.mkdirSync(path.join(targetAudioDir, 'licenses'), { recursive: true });
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(targetAudioDir, 'cues', 'old.wav'), 'old-cue');
      fs.writeFileSync(path.join(targetAudioDir, 'licenses', 'old.txt'), 'old-license');
      fs.writeFileSync(path.join(targetAudioDir, 'manifest.json'), '{"old":true}\n');
      fs.writeFileSync(path.join(sourceDir, 'fixture.zip'), 'fixture-archive');
      fs.writeFileSync(fakeFfmpeg, 'fake');
      const before = snapshotTree(targetAudioDir);

      expect(() => buildAudioBundle({
        sourceDir,
        targetAudioDir,
        ffmpeg: fakeFfmpeg,
        sources: {
          fixture: {
            name: 'Fixture CC0',
            url: 'https://example.invalid/fixture',
            archive: 'fixture.zip',
            archiveSha256: 'archive',
            licenseSha256: 'license'
          }
        },
        cues: {
          'ui.navigate': {
            channel: 'ui',
            gainDb: -8,
            variants: [['fixture', 'Audio/fail.ogg', 'expected-source']]
          }
        },
        assertFileHash(filename) {
          if (filename.endsWith('fail.ogg')) throw new Error('injected source hash failure');
        },
        runCommand(command, args) {
          expect(command).toBe('tar.exe');
          const extractDir = args[args.indexOf('-C') + 1];
          fs.mkdirSync(path.join(extractDir, 'Audio'), { recursive: true });
          fs.writeFileSync(path.join(extractDir, 'License.txt'), 'fixture-license');
          fs.writeFileSync(path.join(extractDir, 'Audio', 'fail.ogg'), 'broken-source');
        }
      })).toThrow('injected source hash failure');

      expect(snapshotTree(targetAudioDir)).toEqual(before);
      expect(fs.readdirSync(tempRoot).filter(name => (
        name.startsWith('.streammonsters-audio-')
      ))).toEqual([]);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
