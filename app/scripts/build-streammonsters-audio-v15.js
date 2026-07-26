const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const downloadsDir = process.env.STREAMMONSTERS_AUDIO_SOURCE_DIR
  || path.join(os.homedir(), 'Downloads');
const ffmpegPath = process.env.FFMPEG_PATH
  || 'C:\\Program Files\\Virtual Desktop Streamer\\ffmpeg.exe';
const pluginDir = path.join(__dirname, '..', 'plugins', 'streamalchemy');
const audioDir = path.join(pluginDir, 'assets', 'audio');

const BASIC_SPELL_LICENSE_EVIDENCE = [
  'Basic Spell Impacts [Free/CC0] - license evidence',
  'Source title: Basic Spell Impacts [Free/CC0]',
  'Source URL: https://lentikula.itch.io/freecc0-basic-spell-impacts-sfx',
  'Publisher: lentikula',
  'License: CC0 1.0 Universal',
  'License URL: https://creativecommons.org/publicdomain/zero/1.0/',
  'Evidence summary: The source page describes 20 spell impact sounds and permits use in projects without attribution under CC0.',
  'Retrieved: 2026-07-26',
  ''
].join('\n');

const SOURCES = {
  interface: {
    name: 'Kenney Interface Sounds',
    url: 'https://www.kenney.nl/assets/interface-sounds',
    archive: 'kenney_interface-sounds.zip',
    archiveSha256: 'f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232',
    licenseSha256: 'f7966c773bbed0eca6a9c75081c44a178b38eae112724dbb5fdfbd4192d118a9'
  },
  impact: {
    name: 'Kenney Impact Sounds',
    url: 'https://www.kenney.nl/assets/impact-sounds',
    archive: 'kenney_impact-sounds.zip',
    archiveSha256: '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8',
    licenseSha256: 'b49aa9c56b04528b95913de13e506a0f7c5e807b9925db9bfef86af1f91120db'
  },
  rpg: {
    name: 'Kenney RPG Audio',
    url: 'https://www.kenney.nl/assets/rpg-audio',
    archive: 'kenney_rpg-audio.zip',
    archiveSha256: '6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b',
    licenseSha256: '5735dfd72cb64cbbceda4ebc00c380c41ca680edb82ff153aa7c9ab97614c539'
  },
  'basic-spell': {
    name: 'Basic Spell Impacts',
    url: 'https://lentikula.itch.io/freecc0-basic-spell-impacts-sfx',
    archive: 'Basic Spell Impacts.zip',
    archiveSha256: '6e265452877dd4121635200b2c59be3b36a2d2aed20ee15915c7c59396028f4d',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseEvidence: BASIC_SPELL_LICENSE_EVIDENCE,
    licenseFile: 'basic-spell-impacts-LICENSE-EVIDENCE.txt'
  }
};

const CUES = {
  'ui.navigate': { channel: 'ui', gainDb: -8, variants: [
    ['interface', 'Audio/select_001.ogg', 'aec0c31ea934a35936ae0d2ab8fac8123c93aa5647f935853a58dbaf90278b7a'],
    ['interface', 'Audio/click_003.ogg', '2fa929138bc3a0f432696588f66eac94b8f6d463905ec8808c6461ce4b054292']
  ] },
  'egg.spawn': { channel: 'egg', gainDb: -6, variants: [
    ['interface', 'Audio/open_002.ogg', '24ff224fe2c09c6aed1b41249825382dc74cf324b887ff279d8494912ce2beee']
  ] },
  'egg.ready': { channel: 'egg', gainDb: -6, variants: [
    ['interface', 'Audio/confirmation_002.ogg', '33b17a9a9a2397c62b285c52c33a907fdffb476909c99e42dde603f6a7a8b12c']
  ] },
  'egg.crack': { channel: 'egg', gainDb: -5, variants: [
    ['interface', 'Audio/glass_003.ogg', '9a6f16e3c2eff6fe5d017a4755a28306b14555728831cd00d70308e8f9689566']
  ] },
  'egg.hatch': { channel: 'egg', gainDb: -4, variants: [
    ['interface', 'Audio/maximize_001.ogg', 'fd3e75e1de2f2fda90aceeacaeb0427ac8bddd3b07a6ce2a8f9ba923df3771f9']
  ] },
  'arena.portal': { channel: 'battle', gainDb: -7, variants: [
    ['interface', 'Audio/glitch_001.ogg', 'da78c642bbd95da2c364ed0e991ebbfc5a4c0d281165d932b5819e0dd31a39d2']
  ] },
  'arena.hit': { channel: 'battle', gainDb: -8, variants: [
    ['impact', 'Audio/impactPunch_medium_000.ogg', '486988aa2d6440ffc4c62a0e8ccf3c23673ba84424bd4723378d451b7255eb5c'],
    ['impact', 'Audio/impactPunch_medium_003.ogg', '2d7c719c05999e0532f4384e1018e04cd916db715140bf16dee2dff3f820e908']
  ] },
  'arena.shield': { channel: 'battle', gainDb: -9, variants: [
    ['impact', 'Audio/impactBell_heavy_001.ogg', '9df61e3ae9a83dc65e5a1fd3ed19d480876f3b22b963a1b9ef6fa293592dcec4']
  ] },
  'arena.heal': { channel: 'battle', gainDb: -10, variants: [
    ['interface', 'Audio/bong_001.ogg', 'd21d0f0b782445db579d11e2506b24cd1ac9d664ee33aeaf807761aa7b6fd710']
  ] },
  'element.ember': { channel: 'battle', gainDb: -9, variants: [
    ['impact', 'Audio/impactMetal_heavy_003.ogg', 'b0f2ba4dabde9a87eb9c188a19d31e0c2300fd321adeba08d3b9b8aa011d7037'],
    ['basic-spell', 'Fire Spell Impacts/Fire Spell Impact 3.wav', '5d54547593efd13eeda5ca237118774117591769ebc3421f0f06f9755b7b514d']
  ] },
  'element.tide': { channel: 'battle', gainDb: -9, variants: [
    ['impact', 'Audio/impactSoft_medium_003.ogg', '5c4a1f35fde7e14046931da7bc3d1b23736541b7190ba107e08a379c4ca43cd6'],
    ['basic-spell', 'Water Spell Impacts/Water Spell Impact 4.wav', '6477732f23a72a36992f867eb592b9b2fbce720e5efce4d397459c46c2e6270d']
  ] },
  'element.grove': { channel: 'battle', gainDb: -11, variants: [
    ['impact', 'Audio/footstep_grass_002.ogg', '73a520139f5be716a403bfe9c80e0e94d1e61d8e9de04a354b336392164b53dc']
  ] },
  'element.gale': { channel: 'battle', gainDb: -11, variants: [
    ['impact', 'Audio/impactGeneric_light_004.ogg', 'f906fa3a37acc4372787b496efcedefa2856045d5ec9456a3bd6c303c0eabb41']
  ] },
  'element.volt': { channel: 'battle', gainDb: -10, variants: [
    ['interface', 'Audio/glitch_003.ogg', 'd55e0c64aee9f1ab2ba9523d0e256ca76639c3ec2f230405e2ff25aff36020b3'],
    ['basic-spell', 'Lightning Spell Impacts/Lightning Spell Impact 1.wav', '15d3a0491e6e51e14cea718dbdb3d597163b0bc00e0fc0fadf1d1d68b0f8b853']
  ] },
  'element.lunar': { channel: 'battle', gainDb: -11, variants: [
    ['interface', 'Audio/pluck_002.ogg', 'c977fe249ff42d1c93a552b33abc13a8399df3879fa510475426e5c4bbac1da9']
  ] },
  'arena.special': { channel: 'battle', gainDb: -9, variants: [
    ['rpg', 'Audio/knifeSlice2.ogg', '6c2064d0ef988d1ec3d56868e823ea8823a5cac00f2742560052633529407def'],
    ['basic-spell', 'Ice Spell Impacts/Ice Spell Impact 5.wav', '2d93547c3ac7c09ee010f9dbc986e57b016d6cee749cabd888e1dd29dc6ba3d6']
  ] },
  'arena.ko': { channel: 'battle', gainDb: -7, variants: [
    ['impact', 'Audio/impactPunch_heavy_004.ogg', 'f4c0c3eb8ab6517583b8218ed03f28923d1b687379aab4c1d5a6d4c10cf8e500']
  ] },
  'arena.victory': { channel: 'reward', gainDb: -5, variants: [
    ['interface', 'Audio/confirmation_004.ogg', '568967a3d9f8a8f6af54ea01729c4882284308f2a27d78c07ffd7ee0d6951661']
  ] },
  'progress.xp': { channel: 'reward', gainDb: -11, variants: [
    ['rpg', 'Audio/handleCoins.ogg', '8a91f969e932df709df80ee124d86a51389eed9b67f22e5e716bc2bbf60d8dab']
  ] },
  'progress.level': { channel: 'reward', gainDb: -6, variants: [
    ['interface', 'Audio/maximize_006.ogg', 'f050b3bb77cb0b901bc8df43d2cc1872c353aebae10b4030cf8ae681726ad343']
  ] },
  'progress.evolution': { channel: 'reward', gainDb: -7, variants: [
    ['rpg', 'Audio/bookOpen.ogg', '953390534377222bee89ac8cd9e60a58fdc037c71a4d7c18c43cd647c7f34ba8']
  ] },
  'progress.rank': { channel: 'reward', gainDb: -9, variants: [
    ['rpg', 'Audio/metalClick.ogg', '9851a69d0c613e13bceef08060ecc4148f098ef487927cbebe270d642398a3b3']
  ] }
};

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function assertHash(filename, expected) {
  const actual = sha256(filename);
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${filename}: expected ${expected}, got ${actual}`);
  }
}

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
}

function readPcmMetrics(filename) {
  const buffer = fs.readFileSync(filename);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    if (type === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (type === 'data') {
      data = buffer.subarray(offset + 8, offset + 8 + length);
    }
    offset += 8 + length + (length % 2);
  }
  if (!data || channels !== 1 || sampleRate !== 48000 || bitsPerSample !== 16) {
    throw new Error(`Unexpected rendered WAV format: ${filename}`);
  }
  let peak = 0;
  for (let index = 0; index < data.length; index += 2) {
    peak = Math.max(peak, Math.abs(data.readInt16LE(index)));
  }
  return {
    durationMs: Math.round((data.length / 2 / sampleRate) * 1000),
    peakDbfs: Number((20 * Math.log10(Math.max(1, peak) / 32768)).toFixed(2))
  };
}

function outputName(cueId, variantIndex) {
  return `${cueId.replace(/\./g, '-')}-${variantIndex + 1}.wav`;
}

function installStagedBundle(stagedAudioDir, targetAudioDir) {
  const parentDir = path.dirname(targetAudioDir);
  fs.mkdirSync(targetAudioDir, { recursive: true });
  const backupDir = fs.mkdtempSync(path.join(parentDir, '.streammonsters-audio-backup-'));
  const entries = ['cues', 'licenses', 'manifest.json'];
  const backedUp = [];
  const installed = [];
  try {
    entries.forEach(entry => {
      const target = path.join(targetAudioDir, entry);
      if (!fs.existsSync(target)) return;
      fs.renameSync(target, path.join(backupDir, entry));
      backedUp.push(entry);
    });
    entries.forEach(entry => {
      fs.renameSync(
        path.join(stagedAudioDir, entry),
        path.join(targetAudioDir, entry)
      );
      installed.push(entry);
    });
  } catch (error) {
    installed.reverse().forEach(entry => {
      fs.rmSync(path.join(targetAudioDir, entry), { recursive: true, force: true });
    });
    backedUp.reverse().forEach(entry => {
      const backup = path.join(backupDir, entry);
      if (fs.existsSync(backup)) {
        fs.renameSync(backup, path.join(targetAudioDir, entry));
      }
    });
    throw error;
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

function buildAudioBundle({
  sourceDir = downloadsDir,
  targetAudioDir = audioDir,
  ffmpeg = ffmpegPath,
  sources = SOURCES,
  cues = CUES,
  assertFileHash = assertHash,
  runCommand = run
} = {}) {
  if (!fs.existsSync(ffmpeg)) {
    throw new Error(`FFmpeg not found at ${ffmpeg}; set FFMPEG_PATH explicitly`);
  }
  const targetParent = path.dirname(targetAudioDir);
  fs.mkdirSync(targetParent, { recursive: true });
  const stagingDir = fs.mkdtempSync(
    path.join(targetParent, '.streammonsters-audio-stage-')
  );
  const extractRoot = path.join(stagingDir, 'extract');
  const stagedAudioDir = path.join(stagingDir, 'bundle');
  const stagedCueDir = path.join(stagedAudioDir, 'cues');
  const stagedLicenseDir = path.join(stagedAudioDir, 'licenses');
  const manifest = {
    schemaVersion: 1,
    license: 'CC0-1.0',
    selection: 'deterministic',
    productionMode: 'bundled-only',
    renderedFormat: {
      codec: 'PCM signed 16-bit little-endian',
      sampleRate: 48000,
      channels: 1,
      truePeakCeilingDbfs: -3
    },
    sources: [],
    excludedSources: [],
    cues: {}
  };

  fs.mkdirSync(stagedCueDir, { recursive: true });
  fs.mkdirSync(stagedLicenseDir, { recursive: true });

  try {
    for (const [sourceId, source] of Object.entries(sources)) {
      const archivePath = path.join(sourceDir, source.archive);
      assertFileHash(archivePath, source.archiveSha256);
      const extractDir = path.join(extractRoot, sourceId);
      fs.mkdirSync(extractDir, { recursive: true });
      runCommand('tar.exe', ['-xf', archivePath, '-C', extractDir]);
      const bundledLicenseName = source.licenseFile || `${sourceId}-License.txt`;
      const bundledLicensePath = path.join(stagedLicenseDir, bundledLicenseName);
      let licenseSha256 = source.licenseSha256;
      if (typeof source.licenseEvidence === 'string') {
        fs.writeFileSync(bundledLicensePath, source.licenseEvidence, 'utf8');
        licenseSha256 = sha256(bundledLicensePath);
      } else {
        const sourceLicensePath = path.join(extractDir, 'License.txt');
        assertFileHash(sourceLicensePath, source.licenseSha256);
        fs.copyFileSync(sourceLicensePath, bundledLicensePath);
      }
      manifest.sources.push({
        id: sourceId,
        name: source.name,
        url: source.url,
        sourceArchive: source.archive,
        archiveSha256: source.archiveSha256,
        license: source.license || 'CC0-1.0',
        ...(source.licenseUrl ? { licenseUrl: source.licenseUrl } : {}),
        licensePath: `assets/audio/licenses/${bundledLicenseName}`,
        licenseSha256
      });
    }

    for (const [cueId, cue] of Object.entries(cues)) {
      manifest.cues[cueId] = {
        channel: cue.channel,
        gainDb: cue.gainDb,
        deterministicVariantKey: 'stableEventId',
        variants: []
      };
      cue.variants.forEach(([sourceId, sourcePath, sourceHash], variantIndex) => {
        const source = sources[sourceId];
        if (!source) throw new Error(`Unknown audio source ${sourceId} for ${cueId}`);
        const input = path.join(extractRoot, sourceId, ...sourcePath.split('/'));
        assertFileHash(input, sourceHash);
        const filename = outputName(cueId, variantIndex);
        const output = path.join(stagedCueDir, filename);
        runCommand(ffmpeg, [
          '-y',
          '-hide_banner',
          '-loglevel', 'error',
          '-i', input,
          '-map_metadata', '-1',
          '-ac', '1',
          '-ar', '48000',
          '-sample_fmt', 's16',
          '-af', 'loudnorm=I=-18:LRA=7:TP=-3.5,apad=whole_dur=0.06',
          '-c:a', 'pcm_s16le',
          output
        ]);
        const metrics = readPcmMetrics(output);
        if (metrics.peakDbfs > -2.95) {
          throw new Error(`Peak ceiling exceeded by ${filename}: ${metrics.peakDbfs} dBFS`);
        }
        manifest.cues[cueId].variants.push({
          assetPath: `assets/audio/cues/${filename}`,
          sha256: sha256(output),
          sourceArchive: source.archive,
          sourcePath,
          sourceSha256: sourceHash,
          ...metrics
        });
      });
    }

    fs.writeFileSync(
      path.join(stagedAudioDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );
    Object.values(manifest.cues).forEach(cue => {
      if (!cue.variants.length) throw new Error('Every audio cue needs a variant');
      cue.variants.forEach(variant => {
        const filename = path.basename(variant.assetPath);
        const staged = path.join(stagedCueDir, filename);
        if (sha256(staged) !== variant.sha256) {
          throw new Error(`Staged audio changed during validation: ${filename}`);
        }
      });
    });
    manifest.sources.forEach(source => {
      assertFileHash(
        path.join(stagedLicenseDir, path.basename(source.licensePath)),
        source.licenseSha256
      );
    });
    installStagedBundle(stagedAudioDir, targetAudioDir);
    return manifest;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function main() {
  buildAudioBundle();
}

if (require.main === module) main();

module.exports = {
  buildAudioBundle,
  installStagedBundle,
  SOURCES,
  CUES
};
