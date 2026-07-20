'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  BUILT_IN_SHOW_DEFINITIONS,
  FINALE_STYLE_METADATA,
  getBuiltInShowBlueprint
} = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const {
  FinaleShowPlanner,
  FINALE_STYLES,
  FINALE_LENGTHS
} = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const {
  PHASE_CONCURRENCY_CAPS,
  validateShowDefinition
} = require('../plugins/webgpu-fireworks/lib/pyrodsl');
const {
  BOYKISSER_COLORS,
  BOYKISSER_PARTICLE_LOD,
} = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

const roleHex = rgb => `#${rgb.map(component => (
  Math.round(component * 255).toString(16).padStart(2, '0')
)).join('')}`.toUpperCase();

const STYLE_FIXTURES = Object.freeze({
  'classic-crescendo': { counts: [14, 24, 36], palette: ['#ffd166', '#fff4d6', '#ff3b30'], profile: 'classic' },
  'symmetric-salute': { counts: [16, 26, 40], palette: ['#ef233c', '#ffd166', '#ffffff'], profile: 'classic' },
  'sky-ballet': { counts: [13, 22, 34], palette: ['#9b5de5', '#35d9e8', '#ff5d8f'], profile: 'classic' },
  'thunder-finale': { counts: [12, 20, 30], palette: ['#ffb000', '#ffd166', '#ffffff'], profile: 'classic' },
  'nishiki-kamuro': { counts: [12, 20, 30], palette: ['#1d4ed8', '#60a5fa', '#f6c453', '#fff1a8'], profile: 'premium-realistic' },
  'aurora-cathedral': { counts: [14, 23, 34], palette: ['#60a5fa', '#67e8f9', '#c4b5fd', '#f8fafc'], profile: 'premium-realistic' },
  'royal-brocade': { counts: [15, 25, 38], palette: ['#9f1239', '#ef4444', '#047857', '#34d399', '#f6c453'], profile: 'premium-realistic' },
  'phoenix-ascension': { counts: [16, 27, 40], palette: ['#7f1d1d', '#ef4444', '#f97316', '#facc15', '#fff7ed'], profile: 'premium-realistic' },
  'furry-celebration': { counts: [15, 25, 38], palette: ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'], profile: 'premium-realistic' }
});

const LENGTH_FIXTURES = Object.freeze({
  short: { index: 0, durationMs: 10000, rest: [6500, 7100] },
  medium: { index: 1, durationMs: 18000, rest: [11000, 12000] },
  long: { index: 2, durationMs: 28000, rest: [17000, 18500] }
});
const BOUNDS = Object.freeze({
  landscape: { minX: 0.12, maxX: 0.88, minY: 0.16, maxY: 0.62 },
  portrait: { minX: 0.1, maxX: 0.9, minY: 0.12, maxY: 0.68 }
});

const CASES = Object.entries(STYLE_FIXTURES).flatMap(([style, fixture]) =>
  Object.entries(LENGTH_FIXTURES).map(([length, lengthFixture]) => ({
    style,
    length,
    count: fixture.counts[lengthFixture.index],
    ...lengthFixture,
    palette: fixture.palette,
    profile: fixture.profile
  }))
);

const OLD_FOUR_HASHES = Object.freeze({
  'classic-crescendo': {
    short: { landscape: ['b42b3cbc927e1b1461b9e64b1323b86b2812f80f9503a1a142d3174c7ae03251', '506334c3c68ae49e7e0e0d29d10a606aa54bc6eb8810514f9e67636af9328b3d', '678cfa09d1ecf20c672b95afcfcaf1de1191106a7f4208d646392db20f6d3b50'], portrait: ['c7664c7623b24e95adfd6bb902ebbe9f46761e564b13db85bec4dee69797311e', '5ff58f8bbccf952520d70adce09d48de927b48bd4c26912c8011a1681595581a', '6dbef79a1e2d01b470cecffe78bccfab4d3da7939255b885b1a04ab245f56009'] },
    medium: { landscape: ['7e0d4ac73f421850e4b63b6833994a23ea46c3ae83df6369ff860028e0138413', '011c6157fce12a292069ab36c0343277bae4cde0ea32be0f30f737f695f670f6', '21b0b55902c3955fefde56650154eeb11297e08894bd6fbef972ca9c8a8fb8f1'], portrait: ['36673e352266ad4e0b92631a59d225cbd07a536e2ea659ac0ab76efe9257b23f', 'bf169666f8c9cb587d0d5442a1a39c9b27d1f17b94152a4a3c87aa0a60a34f62', '59b51cf1d9ba365f953c3e16dcc16cface887f63605e942d52f7bc0271a279ab'] },
    long: { landscape: ['c4d52c3f7a4d7724511b41cae00e0786a54f9c2cead00422cca9eaf39e9b01b5', 'b3c7920192f7251e862483985b5592d0c19735f0335ebff999a16160f2142f43', '84e43612a66fc2f5c10e52db67338f8049bfe5bc246e832dcf2127fc7c1374e7'], portrait: ['c39f539805b833a11d4cce36975a47896273266cf6526e68334411bf27f09b8a', '2e634a9f7d64ecd162c18ddc837b4df7f3a456c5b78fd4ea41ace61d473e9c6e', '1994d6c30789e09bf6bf2ba24942346a9d8ddcddd8c9ea71308b86fd1afa1e64'] }
  },
  'symmetric-salute': {
    short: { landscape: ['6419006fe08abe8268ecbf624bcf7f682215685ae32ed9a95262c569b7fbe180', '24575b8d0250bc92cbed117bbc223d49b08fd38cb0c3db0bce05de7a9f5ed1eb', '8b4710ed57577ed755020d4fb790d2f426ac36ce55725c1815a19566eb4e4ea4'], portrait: ['7d264d8a3a1e2932d0a801c90eea0204c2093579bdb64851e00f86f0bd60313a', '639992c6d137045ef4dc9f032ba5793892278d073a8b1aa8c1a4930f5715b8f0', '2b1ca597386c879c78bd317bf7ffc0736d8b260e7d0f1e108e85a92680238282'] },
    medium: { landscape: ['dea7c80e313f247e138301950781ad076c3016303c0b44d0c6394a87500bdfc3', 'e980f975aa1bd1fa868c5ddf868a3679ef54cd7ac11a870adf5788afa16281fb', 'a8327ec8d6efbc0fb0a0f34e2a81565ca249a7c81269f23c3d3963a50a0acce8'], portrait: ['7011021d21c203cfee02930db09e9d6668b10e6e76c58b3a7af305bc0b8b27e0', 'a383c733ecc0448dc440de4c31647174b48729d76c5dee41f34ed6e806cd17b7', '0694ba5a210e2225996039b3853ee097ab546d4019723c9c2c42bec5bddbdf98'] },
    long: { landscape: ['a297aa7550f1d7da4baf7a9f1e2d591ac0d24eb72ca47ff760ff370862f3f7a4', '0d9e2f0be3fe7b5c2d10285fdfc2be3c884b4d35497edaeaed9aa3e874529214', '0315121eb11af5b39b5f153135ce8d13164546ab7a0031501cde202ec0fb38dc'], portrait: ['89428bdfe1a6255f3b7077e68aa3add2ca5789b024f83376f123cc935756d120', '1d499cd299a504c34f20dbf25b9192a31238017b7f801ed4910640ba1de04a13', '2876fcaf048c6056b792b3608e872e063cb289262cb8343d3091117cbe2ff19e'] }
  },
  'sky-ballet': {
    short: { landscape: ['9d3646d215b6cab24267b366041aa4f1c281b18e184ef3acf7516ea0976f3a7b', '192cb2125e1f8c833105672bf75d058a503839a6fc3e1d636fa4cae0fdbb0ada', 'ea959ffae35b3a19c967d873709d8c71c9e8e7b163e05f5240fd84af2a8e1a5d'], portrait: ['9152e333cf3816de04887c708056e0767cf81faf3db58983f5d50f0ffff44fb5', 'c01b197af09a6ad5a4e21985fb40821d126ad2afcb52b84a50547dc2f267416f', '35d74751cadfd00be9921d0aba1509d3fd0d1ca7ccddc40f971df2ad26ba8093'] },
    medium: { landscape: ['9b17afd793ae1037bd6176df4bca6ba3218c930a07651e176d0a5ed3537505c4', '547d61c1fffcef52eebae0ba3efbe039e621d43b3404516a530dad21e85446ff', '4a3127226feb6d411188e408383732284b9cac05eef6f0f0445ef7e5c109aeef'], portrait: ['f3665a024ebd3f617e3fc7df08c512a0084944f4527a42da534900613424e551', '176a0183d4a014e35cf7f0212b91034ba395d094fee10f45504699ca1272ba8e', '4863a97e6af9a3d52a5d6dee6fe706736db57010f13e9280f0f4e71cb9fcd8dd'] },
    long: { landscape: ['0bb94e9eac468da8fe6544e67df5469cc3b40ef8da510440f8e191a757aa907e', 'f436b5e5917d808ae9d630afb9036a9142c03720ccb041b96edbdb5db5bf6ada', 'f0ad0fad594fb4e5f319f290ac3c402cd19211d641eccd35b31c605cdd778007'], portrait: ['0abb7c637e2da9e023bc2ee1877f7f29edd6c52e97e35d13a4c7fbb6646a6968', 'cc8863cf02349b1fe25bbf60037dbcb69640f6cabe23268cf252c7cd8d427395', 'b105b595185627b4ba792bc3e4595ec83b25f081955caf935423cfbe79edb819'] }
  },
  'thunder-finale': {
    short: { landscape: ['3cedd641e67917e3cf82148b1ec31104b3589e506dabb34988d3f03c520757c2', 'a2dff151924f88d26410866f30a8a5a94f1176e746b9edda8090114f9df5dfa7', '74540d3f9f21d889ff28c5f3772c4c88cea94aa8163717e78dea4c329193d65d'], portrait: ['529a42f6ca0466133273b6ae20378caef645fb289e341aed3194f892c7c61af2', 'f8c9c578f5dbc306f2e8fe7f5b2a9efd71b3284cb6f49a13a32b64e0d187408d', 'abcfe8fb7d5f8c83855f38ba3439589b1fb84ae8ea30e528ce4b069d16f013c6'] },
    medium: { landscape: ['dbb98ab837ff22089630a52422261eb5847f89143fac338115ebb25ba5c93925', 'aab561ac0bf285802322b5514860e63081789290e0afddc42012a0891ebf29ae', 'cc26ab0c15d5c730c2aa8deb6b268a6fd163fb92bb5b04410bec965ea2b0dbc2'], portrait: ['ca3d2a36b85e5ec8e23cbc164700746403a8f8454ef5c4671eb567eb79c2eea1', '69764547fc7f12cc9edf056ccb8ac52c658d269154a87e8bc157067f47f0dd15', '7cafcdd95677eb1abade54c6d5b69c37f5a1be3ae20fd25b95b7e34b23ad496c'] },
    long: { landscape: ['3e5e49a17ead0ff2a7d6d3af9c54bcb4ea1fffc51d7ca8f9a96bab18f4358acf', '17bdcc8ecc3bac637c1dc87a0b871bcea180a438677a43d21903d9fd28fd3e63', 'edb69bf5191a30bd3335e5b28a370665d3a3e4c8a55c935bb6d09e88de905fe9'], portrait: ['0a6f15754d699903b4dc3d2cf9abb9f6ffe93cd2bada27f03b2a446f16ffcdf2', '8ff2d8d14945b80a83aa7ed25230f6e229f4946286413a9b96cfba9aa4158559', 'c9278a18637bf237eec96c7741965358707728ce91560b012610d9c2ed13f69b'] }
  }
});

function planGeometry(plan) {
  return plan.cues.map(cue => ({
    beatAtMs: cue.beatAtMs,
    phase: cue.phase,
    formation: cue.formation,
    launches: cue.launches.map(launch => ({
      position: launch.position,
      origin: launch.origin,
      colors: launch.colors
    }))
  }));
}

function geometryHash(plan) {
  return crypto.createHash('sha256').update(JSON.stringify(planGeometry(plan))).digest('hex');
}

describe('WebGPU Fireworks built-in PyroDSL shows', () => {
  test('exports nine frozen style choices with dynamic-UI metadata', () => {
    expect(FINALE_STYLES).toEqual(Object.keys(STYLE_FIXTURES));
    expect(FINALE_STYLE_METADATA.map(style => style.id)).toEqual(FINALE_STYLES);
    expect(FINALE_STYLE_METADATA.every(style => style.autoEligible && style.builtIn)).toBe(true);
    expect(Object.isFrozen(FINALE_STYLE_METADATA)).toBe(true);
    expect(FINALE_LENGTHS).toEqual(['short', 'medium', 'long']);
  });

  test.each(CASES)('$style/$length validates and compiles exact score constraints', fixture => {
    const definition = BUILT_IN_SHOW_DEFINITIONS[fixture.style];
    const validation = validateShowDefinition(definition);
    expect(validation).toMatchObject({ valid: true });
    expect(validation.diagnostics.variants[fixture.length]).toMatchObject({
      peakShowCommands: expect.any(Number),
      peakCoreParticles: expect.any(Number)
    });
    expect(validation.diagnostics.variants[fixture.length].peakShowCommands).toBeLessThanOrEqual(28);
    expect(validation.diagnostics.variants[fixture.length].peakCoreParticles).toBeLessThanOrEqual(5734);

    const plan = new FinaleShowPlanner().plan({
      id: `${fixture.style}-${fixture.length}`,
      style: fixture.style,
      length: fixture.length,
      orientation: 'landscape',
      intensity: 5,
      seed: 12345
    });
    const shells = plan.cues.flatMap(cue => cue.shells);
    expect(plan).toMatchObject({
      planVersion: 2,
      style: fixture.style,
      length: fixture.length,
      variant: fixture.length,
      durationMs: fixture.durationMs,
      materialProfile: fixture.profile,
      autoEligible: true
    });
    expect(shells).toHaveLength(fixture.count);
    expect(plan.cues.flatMap(cue => cue.launches)).toHaveLength(fixture.count);
    expect(new Set(plan.cues.map(cue => cue.phase))).toEqual(new Set(['opening', 'build', 'highlight', 'finale']));

    for (const cue of plan.cues) {
      expect(cue.beatAtMs).toBe(cue.timeMs);
      expect(cue.shells.length).toBeLessThanOrEqual(PHASE_CONCURRENCY_CAPS[cue.phase]);
      expect(cue.launches).toEqual(cue.shells);
      if (fixture.style !== 'furry-celebration') {
        expect(cue.timeMs < fixture.rest[0] || cue.timeMs >= fixture.rest[1]).toBe(true);
      }
      for (const shell of cue.shells) {
        expect(shell.palette).toEqual(fixture.palette);
        expect(shell.colors).toEqual(fixture.palette);
        expect(shell.target).toEqual(shell.position);
        for (const layer of shell.layers) {
          expect(cue.timeMs + layer.delayMs + layer.lifetimeMs).toBeLessThanOrEqual(fixture.durationMs);
        }
      }
    }

    for (const orientation of Object.keys(BOUNDS)) {
      const bounded = new FinaleShowPlanner().plan({
        style: fixture.style,
        length: fixture.length,
        orientation,
        intensity: 5,
        seed: 9876
      });
      for (const shell of bounded.cues.flatMap(cue => cue.shells)) {
        expect(shell.position.x).toBeGreaterThanOrEqual(BOUNDS[orientation].minX);
        expect(shell.position.x).toBeLessThanOrEqual(BOUNDS[orientation].maxX);
        expect(shell.position.y).toBeGreaterThanOrEqual(BOUNDS[orientation].minY);
        expect(shell.position.y).toBeLessThanOrEqual(BOUNDS[orientation].maxY);
        expect(shell.origin.x).toBeGreaterThanOrEqual(0.04);
        expect(shell.origin.x).toBeLessThanOrEqual(0.96);
        expect(shell.origin.y).toBeGreaterThanOrEqual(0.92);
        expect(shell.origin.y).toBeLessThanOrEqual(1.08);
      }
    }
  });

  test('preserves the old four geometry fixtures across seeds, orientations and intensities', () => {
    const seeds = [0, 42, 0xffffffff];
    for (const [style, byLength] of Object.entries(OLD_FOUR_HASHES)) {
      for (const [length, byOrientation] of Object.entries(byLength)) {
        for (const [orientation, hashes] of Object.entries(byOrientation)) {
          seeds.forEach((seed, seedIndex) => {
            for (const intensity of [1, 5, 10]) {
              const plan = new FinaleShowPlanner().plan({ style, length, orientation, intensity, seed, id: 'fixture' });
              expect(geometryHash(plan)).toBe(hashes[seedIndex]);
            }
          });
        }
      }
    }
  });

  test('gives every premium show curated layer semantics', () => {
    for (const style of FINALE_STYLES.slice(4)) {
      const plan = new FinaleShowPlanner().plan({ style, length: 'long', seed: 77, intensity: 5 });
      const layers = plan.cues.flatMap(cue => cue.shells.flatMap(shell => shell.layers));
      expect(plan.materialProfile).toBe('premium-realistic');
      expect(new Set(layers.map(layer => layer.primitive)).size).toBeGreaterThan(1);
      expect(layers.some(layer => layer.trail || layer.split || layer.strobe)).toBe(true);
    }
  });

  test.each(FINALE_LENGTHS)('gives every %s Furry cue one featured compound cat and varied support motifs', length => {
    const furry = new FinaleShowPlanner().plan({ style: 'furry-celebration', length, seed: 88 });
    const glyphs = [];

    for (const cue of furry.cues) {
      const featured = cue.shells.filter(shell => shell.layers.some(layer => layer.glyph === 'boykisser'));
      expect(featured).toHaveLength(1);
      expect(featured[0].layers.filter(layer => layer.glyph === 'boykisser')).toHaveLength(1);
      glyphs.push(...cue.shells.flatMap(shell => shell.layers)
        .filter(layer => layer.primitive === 'glyph').map(layer => layer.glyph));
    }

    expect(new Set(glyphs)).toEqual(new Set([
      'boykisser', 'trans-flag', 'paw', 'heart', 'fox-head', 'wolf-head',
      'dragon-wing', 'dragon', 'tail'
    ]));
    expect(new Set(furry.cues.flatMap(cue => cue.shells.map(shell => shell.shape))).size).toBeGreaterThan(5);
  });

  test('uses semantic Boykisser, trans and ordered six-color rainbow layers', () => {
    const furry = new FinaleShowPlanner().plan({ style: 'furry-celebration', length: 'long', seed: 88 });
    const layers = furry.cues.flatMap(cue => cue.shells.flatMap(shell => shell.layers));
    const boyLayers = layers.filter(layer => layer.glyph === 'boykisser');
    const transLayers = layers.filter(layer => layer.glyph === 'trans-flag');

    expect(boyLayers.length).toBeGreaterThan(0);
    expect(boyLayers.every(layer => layer.density >= BOYKISSER_PARTICLE_LOD.cameo)).toBe(true);
    const semanticPalette = [
      roleHex(BOYKISSER_COLORS.HEAD),
      roleHex(BOYKISSER_COLORS.FACE),
      roleHex(BOYKISSER_COLORS.PINK)
    ];
    expect(boyLayers.every(layer => layer.colors.join() === semanticPalette.join())).toBe(true);
    expect(transLayers.length).toBeGreaterThan(0);
    expect(transLayers.every(layer => layer.colors.join() === ['#5BCEFA', '#F5A9B8', '#FFFFFF'].join())).toBe(true);
    expect(transLayers.every(layer => layer.priority !== 'core' && layer.core === false)).toBe(true);

    const rainbow = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'];
    const heroCue = furry.cues[furry.cues.length - 1];
    const heroRainbow = heroCue.shells[0].layers
      .filter(layer => layer.priority !== 'core')
      .flatMap(layer => layer.colors);
    expect(heroRainbow).toEqual(expect.arrayContaining(rainbow));
  });

  test.each(['short', 'medium', 'long'])('uses semantic Boykisser colors and one centered hero in %s', length => {
    const plan = new FinaleShowPlanner().plan({
      style: 'furry-celebration', length, orientation: 'portrait', intensity: 5, seed: 88
    });
    const hero = plan.cues.at(-1);
    const boyLayers = hero.shells.flatMap(shell => shell.layers)
      .filter(layer => layer.glyph === 'boykisser');
    expect(boyLayers).toHaveLength(1);
    expect(boyLayers[0].colors).toEqual([
      roleHex(BOYKISSER_COLORS.HEAD),
      roleHex(BOYKISSER_COLORS.FACE),
      roleHex(BOYKISSER_COLORS.PINK)
    ]);
    expect(hero.shells[0]).toMatchObject({
      launchMode: 'rocket',
      target: { x: 0.5, y: 0.38 },
      renderHints: { depthEnabled: true }
    });
    expect(boyLayers[0].density).toBe(BOYKISSER_PARTICLE_LOD.hero);
    expect(hero.shells[0].layers.some(layer => ['fox-head', 'wolf-head'].includes(layer.glyph))).toBe(false);
  });

  test('imports the semantic palette instead of declaring a second Boykisser color table', () => {
    const source = fs.readFileSync(path.join(
      __dirname, '..', 'plugins', 'webgpu-fireworks', 'lib', 'built-in-shows.js'
    ), 'utf8');
    expect(source).toContain("require('../gpu/boykisser-geometry')");
    expect(source).not.toMatch(/const\s+BOYKISSER_COLORS\s*=\s*Object\.freeze\(\s*\[/);
  });

  test.each([
    ['short', { opening: [1], build: [2, 2], highlight: [3], finale: [2, 2, 2, 1] }],
    ['medium', { opening: [1, 1], build: [2, 2, 2], highlight: [3, 3], finale: [3, 3, 4, 1] }],
    ['long', { opening: [1, 1, 1], build: [2, 2, 2, 2, 2], highlight: [3, 3, 3], finale: [5, 5, 5, 1] }]
  ])('uses the exact %s Furry phase wave split', (length, expected) => {
    const furry = new FinaleShowPlanner().plan({ style: 'furry-celebration', length, seed: 88 });
    const actual = Object.fromEntries(['opening', 'build', 'highlight', 'finale'].map(phase => [
      phase,
      furry.cues.filter(cue => cue.phase === phase).map(cue => cue.shells.length)
    ]));

    expect(actual).toEqual(expected);
  });

  test('keeps the exported blueprint graph immutable and planner output isolated from mutation attempts', () => {
    const blueprint = getBuiltInShowBlueprint('furry-celebration');
    const before = new FinaleShowPlanner().plan({ style: 'furry-celebration', length: 'short', seed: 91 });
    const originalFormation = blueprint.cues.opening[0].formation;
    let mutated = false;
    try {
      expect(() => {
        blueprint.cues.opening[0].formation = 'single';
        mutated = true;
      }).toThrow(TypeError);
      expect(Object.isFrozen(blueprint)).toBe(true);
      expect(Object.isFrozen(blueprint.cues.opening[0].layers)).toBe(true);
    } finally {
      if (mutated) blueprint.cues.opening[0].formation = originalFormation;
    }
    expect(getBuiltInShowBlueprint('furry-celebration').cues.opening[0].formation).toBe(originalFormation);
    expect(new FinaleShowPlanner().plan({ style: 'furry-celebration', length: 'short', seed: 91 })).toEqual(before);
  });

  test.each(FINALE_STYLES)('%s is deterministic and intensity changes only tier/visual scales', style => {
    const options = { id: 'stable', style, length: 'long', orientation: 'portrait', seed: 2026 };
    const low = new FinaleShowPlanner().plan({ ...options, intensity: 1 });
    const lowRepeat = new FinaleShowPlanner().plan({ ...options, intensity: 1 });
    const high = new FinaleShowPlanner().plan({ ...options, intensity: 10 });
    expect(lowRepeat).toEqual(low);
    expect(planGeometry(high)).toEqual(planGeometry(low));
    expect(high.cues.flatMap(cue => cue.shells).map(shell => shell.tier))
      .not.toEqual(low.cues.flatMap(cue => cue.shells).map(shell => shell.tier));
    expect(new Set(high.cues.flatMap(cue => cue.shells).map(shell => shell.powerScale))).toEqual(new Set([1.35]));
    expect(new Set(low.cues.flatMap(cue => cue.shells).map(shell => shell.powerScale))).toEqual(new Set([0.75]));
  });
});
