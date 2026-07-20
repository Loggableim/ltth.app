const crypto = require('crypto');

const {
  FinaleShowPlanner,
  FINALE_STYLES,
  FINALE_LENGTHS
} = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const { BUILT_IN_SHOW_DEFINITIONS } = require('../plugins/webgpu-fireworks/lib/built-in-shows');
const { BOYKISSER_COLORS } = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

const roleHex = rgb => `#${rgb.map(component => (
  Math.round(component * 255).toString(16).padStart(2, '0')
)).join('')}`.toUpperCase();

const COUNTS = {
  'classic-crescendo': { short: 14, medium: 24, long: 36 },
  'symmetric-salute': { short: 16, medium: 26, long: 40 },
  'sky-ballet': { short: 13, medium: 22, long: 34 },
  'thunder-finale': { short: 12, medium: 20, long: 30 }
};

const LENGTHS = {
  short: {
    durationMs: 10000,
    phases: {
      opening: [1200, 2200],
      build: [2200, 5000],
      highlight: [5000, 6500],
      breath: [6500, 7100],
      finale: [7100, 9000]
    }
  },
  medium: {
    durationMs: 18000,
    phases: {
      opening: [1400, 3500],
      build: [3500, 8000],
      highlight: [8000, 11000],
      breath: [11000, 12000],
      finale: [12000, 16500]
    }
  },
  long: {
    durationMs: 28000,
    phases: {
      opening: [1500, 5000],
      build: [5000, 12500],
      highlight: [12500, 17000],
      breath: [17000, 18500],
      finale: [18500, 26500]
    }
  }
};

const PRESETS = {
  'classic-crescendo': {
    palette: ['#ffd166', '#fff4d6', '#ff3b30'],
    shapes: ['burst', 'ring', 'star'],
    formations: ['single', 'alternating-pair', 'ring-accent', 'star-accent', 'fan', 'gold-crown'],
    soundRoles: ['single', 'pair', 'accent', 'crown']
  },
  'symmetric-salute': {
    palette: ['#ef233c', '#ffd166', '#ffffff'],
    shapes: ['burst', 'ring'],
    formations: ['call', 'response', 'mirrored-pair', 'centered-ring', 'triple-salute', 'symmetric-final-wall'],
    soundRoles: ['call', 'response', 'salute', 'wall']
  },
  'sky-ballet': {
    palette: ['#9b5de5', '#35d9e8', '#ff5d8f'],
    shapes: ['burst', 'heart', 'star', 'spiral'],
    formations: ['single', 'diagonal-pair', 'cross-pair', 'spiral-accent', 'star-accent', 'floral-finale'],
    soundRoles: ['ballet', 'accent', 'floral']
  },
  'thunder-finale': {
    palette: ['#ffb000', '#ffd166', '#ffffff'],
    shapes: ['burst'],
    formations: ['heavy-single', 'staggered-volley', 'triple-salute', 'finale-wave-1', 'finale-wave-2', 'finale-wave-3'],
    soundRoles: ['heavy', 'volley', 'salute', 'wave']
  }
};

const BOUNDS = {
  landscape: { minX: 0.12, maxX: 0.88, minY: 0.16, maxY: 0.62 },
  portrait: { minX: 0.1, maxX: 0.9, minY: 0.12, maxY: 0.68 }
};

const CONCURRENCY_CAPS = { opening: 1, build: 2, highlight: 3, finale: 6 };
const SUPPORTED_SHAPES = ['burst', 'heart', 'paws', 'star', 'ring', 'spiral'];
const CASES = Object.keys(COUNTS).flatMap(style =>
  Object.keys(COUNTS[style]).map(length => [style, length, COUNTS[style][length]])
);

const GEOMETRY_BASELINE_HASHES = {
  'classic-crescendo': {
    short: '2296ccf6ab399ec62c7d7d8f8e64387a1a5d57d8abed7b694a96635aaab90f4a',
    medium: '5ad90ab4cee054eecb549f4137e896b6df1e4b3125cf76e676b2cd190eb7b832',
    long: '2fea375fb214798753db9836ef8fd8d88f24b74857afdd377b699a23427d8142'
  },
  'symmetric-salute': {
    short: '19c4e2239e5913b0081f3f5b9cf7903bb063512d39d1db2d3be83e48a78c3766',
    medium: '836f08fdb34033f8480057a5a5e48d10174a5772fef7e5f323dc39ff091080fb',
    long: '9befe7328464b498d973f28090d61c7dc2accf3434487fc4a66443a6fd634a26'
  },
  'sky-ballet': {
    short: 'ea179f7cbc97de3154abc0ca23c74daec09bd078781a2f463d996446e7d5ef04',
    medium: '33d262cc01f3ddedb4a7aabd78a4e46ea6a380e66d8592903368123291e7ff86',
    long: '00c77f759b4e54aa03008480cbb52f4f338e6e97044e9b4a7349fb0c0427aa89'
  },
  'thunder-finale': {
    short: 'afbca303f9e50aba43fa53da82966844c6d6895d2cf53147fa91c834cf374442',
    medium: 'e20b5ee2634839827224cf02cf6f4331baa0b1e39fa561d92a042d49c3120df7',
    long: 'b7882db5c4509d8492e46ba931e9c1baa6fe49e8f5c994c4beaf89330550dc77'
  },
  'nishiki-kamuro': {
    short: 'd5dc61dc263383c6cf19db59c211e5ec2b935391f314bf7afac08fdffaa5c260',
    medium: '41aacdb241fdbdc644483567c6e8ed05a9f49df18438e646fb26bde3c5cc0aee',
    long: '43d1687189f344d4823f759a0448cf1e06b25d52b36b334ffcc9487c0b3c2a07'
  },
  'aurora-cathedral': {
    short: '0de0cc6649c8b5108c2f288e4ebc78cb7e3e07f0add494602634377d4ccd543e',
    medium: '9add33f9ad6c3a242eef0b39149050cf5107e7869a1f4f09b7710b1186ed3816',
    long: 'dcf0d7c86e7b1e5f267ab377843112d9d83ebc64e6fce3e2836fd4ef884f2794'
  },
  'royal-brocade': {
    short: '8c1bcc7fd491963950514af53fa123df2dc7c204c23587ef91ab8e0acf26d99d',
    medium: '8bc4d5a128fe2051344ca76b6f39bf3568462af8de2019c8e42b183dd2c0de94',
    long: '5ebbd9a2b07670c8dab145d65849580d37f63a63d2acf432f64d62f0a7568ae5'
  },
  'phoenix-ascension': {
    short: '0be0db2b3507ccbeea0f56774f9519356bd26c01fe5d2a199d8e18bd09b90079',
    medium: '71914d98a3a503c9edf949add0c587c4122920c2ee7ece07e825b7dc09a71b4a',
    long: '6ee607fa07e58471e936cd01bced7163fb2bdf31f2289b99c01c913122385609'
  },
  'furry-celebration': {
    short: 'e4f6dae5e0d5b96c7eb7937a218dc49cd3fc9ed698ca11861010bde1dcd1f0e8',
    medium: 'd51ae3fec4b82cdfdab79da3eae4824edbcb4e8bd448623ce9fa156a90922f0b',
    long: 'a41d22dfd3357db101870fc7040286e22cf0cd6834b68055c2079c0627a04049'
  }
};

function launchCount(plan) {
  return plan.cues.reduce((total, cue) => total + cue.launches.length, 0);
}

function withoutIntensityFields(plan) {
  const stableShell = launch => {
    const value = { ...launch };
    delete value.powerScale;
    delete value.particleScale;
    delete value.tier;
    return value;
  };
  return {
    ...plan,
    cues: plan.cues.map(cue => ({
      ...cue,
      shells: cue.shells.map(stableShell),
      launches: cue.launches.map(stableShell)
    }))
  };
}

function geometryHash(plan) {
  const geometry = plan.cues.map(cue => ({
    formation: cue.formation,
    shells: cue.shells.map(shell => ({ origin: shell.origin, target: shell.target }))
  }));
  return crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
}

describe('WebGPU Fireworks finale show planner', () => {
  test('exports the nine curated styles and three supported lengths', () => {
    expect(FINALE_STYLES).toEqual([
      'classic-crescendo',
      'symmetric-salute',
      'sky-ballet',
      'thunder-finale',
      'nishiki-kamuro',
      'aurora-cathedral',
      'royal-brocade',
      'phoenix-ascension',
      'furry-celebration'
    ]);
    expect(FINALE_LENGTHS).toEqual(['short', 'medium', 'long']);
  });

  test.each(CASES)('plans %s/%s with its exact duration and launch count', (style, length, count) => {
    const planner = new FinaleShowPlanner();
    const plan = planner.plan({
      id: `${style}-${length}`,
      style,
      length,
      orientation: 'landscape',
      intensity: 5,
      seed: 12345
    });

    expect(plan).toMatchObject({
      planVersion: 2,
      id: `${style}-${length}`,
      definitionId: style,
      style,
      variant: length,
      length,
      durationMs: LENGTHS[length].durationMs,
      seed: 12345,
      materialProfile: 'classic',
      autoEligible: true
    });
    expect(launchCount(plan)).toBe(count);
    expect(plan.cues.length).toBeGreaterThan(0);

    for (const cue of plan.cues) {
      const [phaseStart, phaseEnd] = LENGTHS[length].phases[cue.phase];
      expect(cue).toMatchObject({
        id: expect.any(String),
        timeMs: cue.beatAtMs,
        phase: cue.phase,
        formation: cue.formation,
        shells: cue.launches
      });
      expect(cue.beatAtMs).toBeGreaterThanOrEqual(phaseStart);
      expect(cue.beatAtMs).toBeLessThanOrEqual(phaseEnd);
      expect(cue.launches.length).toBeGreaterThan(0);
      expect(cue.launches.length).toBeLessThanOrEqual(CONCURRENCY_CAPS[cue.phase]);

      const [breathStart, breathEnd] = LENGTHS[length].phases.breath;
      expect(cue.beatAtMs < breathStart || cue.beatAtMs >= breathEnd).toBe(true);

      for (const launch of cue.launches) {
        expect(launch.id).toEqual(expect.any(String));
        expect(launch.seed).toEqual(expect.any(Number));
        expect(SUPPORTED_SHAPES).toContain(launch.shape);
        expect(launch.colors).toEqual(PRESETS[style].palette);
        expect(launch.powerScale).toBeGreaterThanOrEqual(0.75);
        expect(launch.powerScale).toBeLessThanOrEqual(1.35);
        expect(launch.particleScale).toBeGreaterThanOrEqual(0.7);
        expect(launch.particleScale).toBeLessThanOrEqual(1.4);
        expect(['small', 'medium', 'big', 'massive']).toContain(launch.tier);
        expect(launch.soundRole).toEqual(expect.any(String));
        expect(typeof launch.crackleEnabled).toBe('boolean');
      }
    }
  });

  test.each(CASES)('keeps %s/%s inside both SpawnPlanner bounds', (style, length) => {
    for (const orientation of ['landscape', 'portrait']) {
      const plan = new FinaleShowPlanner().plan({ style, length, orientation, intensity: 5, seed: 77, id: 'bounded' });
      const bounds = BOUNDS[orientation];
      for (const launch of plan.cues.flatMap(cue => cue.launches)) {
        expect(launch.position.x).toBeGreaterThanOrEqual(bounds.minX);
        expect(launch.position.x).toBeLessThanOrEqual(bounds.maxX);
        expect(launch.position.y).toBeGreaterThanOrEqual(bounds.minY);
        expect(launch.position.y).toBeLessThanOrEqual(bounds.maxY);
        expect(launch.origin.x).toBeGreaterThanOrEqual(0);
        expect(launch.origin.x).toBeLessThanOrEqual(1);
        expect(launch.origin.y).toBeGreaterThanOrEqual(0.92);
        expect(launch.origin.y).toBeLessThanOrEqual(1.08);
      }
    }
  });

  test.each(Object.keys(PRESETS))('keeps the %s palette, shapes, formations and sound roles curated', style => {
    const plan = new FinaleShowPlanner().plan({ style, length: 'short', orientation: 'landscape', intensity: 5, seed: 42 });
    const launches = plan.cues.flatMap(cue => cue.launches);
    expect([...new Set(launches.map(launch => launch.shape))].sort()).toEqual([...PRESETS[style].shapes].sort());
    expect([...new Set(plan.cues.map(cue => cue.formation))]).toEqual(PRESETS[style].formations);
    expect([...new Set(launches.map(launch => launch.soundRole))].sort()).toEqual([...PRESETS[style].soundRoles].sort());
  });

  test('keeps symmetric-salute calls left and responses right across seeds and orientations', () => {
    for (const orientation of ['landscape', 'portrait']) {
      for (const seed of [0, 1, 42, 2026, 0xffffffff]) {
        const plan = new FinaleShowPlanner().plan({
          style: 'symmetric-salute', length: 'short', orientation, intensity: 5, seed
        });
        const call = plan.cues.find(cue => cue.formation === 'call').launches[0];
        const response = plan.cues.find(cue => cue.formation === 'response').launches[0];

        expect(call.position.x).toBeLessThan(0.5);
        expect(response.position.x).toBeGreaterThan(0.5);
        expect(call.position.x).toBeLessThan(response.position.x);
      }
    }
  });

  test('gives diagonal and cross pairs explicit flight-path geometry', () => {
    for (const orientation of ['landscape', 'portrait']) {
      for (const seed of [1, 42, 2026]) {
        const plan = new FinaleShowPlanner().plan({
          style: 'sky-ballet', length: 'short', orientation, intensity: 5, seed
        });
        const diagonal = plan.cues.find(cue => cue.formation === 'diagonal-pair').launches;
        for (const launch of diagonal) {
          expect(launch.position.x - launch.origin.x).toBeGreaterThanOrEqual(0.1);
        }

        const crossed = [...plan.cues.find(cue => cue.formation === 'cross-pair').launches]
          .sort((left, right) => left.position.x - right.position.x);
        expect(crossed[0].origin.x).toBeGreaterThan(crossed[1].origin.x);
        expect(crossed[0].origin.x).toBeGreaterThan(crossed[0].position.x);
        expect(crossed[1].origin.x).toBeLessThan(crossed[1].position.x);
      }
    }
  });

  test('is exactly deterministic and changes seeded positions without changing the score', () => {
    const options = {
      id: 'deterministic-finale', style: 'symmetric-salute', length: 'long',
      orientation: 'portrait', intensity: 6, seed: 2026
    };
    const first = new FinaleShowPlanner().plan(options);
    const second = new FinaleShowPlanner().plan(options);
    expect(second).toEqual(first);

    const reseeded = new FinaleShowPlanner().plan({ ...options, seed: 2027 });
    expect(reseeded.cues.map(cue => [cue.beatAtMs, cue.launches.length]))
      .toEqual(first.cues.map(cue => [cue.beatAtMs, cue.launches.length]));
    expect(reseeded.cues.flatMap(cue => cue.launches.map(launch => launch.position)))
      .not.toEqual(first.cues.flatMap(cue => cue.launches.map(launch => launch.position)));
  });

  test('maps intensity to visual scale and tier mix without changing count, timing or choreography', () => {
    const options = {
      id: 'intensity-independent', style: 'sky-ballet', length: 'medium',
      orientation: 'landscape', seed: 9001
    };
    const low = new FinaleShowPlanner().plan({ ...options, intensity: 1 });
    const high = new FinaleShowPlanner().plan({ ...options, intensity: 10 });
    const lowLaunches = low.cues.flatMap(cue => cue.launches);
    const highLaunches = high.cues.flatMap(cue => cue.launches);

    expect(new Set(lowLaunches.map(launch => launch.powerScale))).toEqual(new Set([0.75]));
    expect(new Set(highLaunches.map(launch => launch.powerScale))).toEqual(new Set([1.35]));
    expect(new Set(lowLaunches.map(launch => launch.particleScale))).toEqual(new Set([0.7]));
    expect(new Set(highLaunches.map(launch => launch.particleScale))).toEqual(new Set([1.4]));

    const tierRank = { small: 0, medium: 1, big: 2, massive: 3 };
    const lowTiers = lowLaunches.map(launch => tierRank[launch.tier]);
    const highTiers = highLaunches.map(launch => tierRank[launch.tier]);
    expect(highTiers).not.toEqual(lowTiers);
    expect(highTiers.every((tier, index) => tier >= lowTiers[index])).toBe(true);
    expect(highTiers.some((tier, index) => tier > lowTiers[index])).toBe(true);
    expect(withoutIntensityFields(high)).toEqual(withoutIntensityFields(low));
  });

  test.each(FINALE_STYLES.filter(style => style !== 'furry-celebration')
    .flatMap(style => FINALE_LENGTHS.map(length => [style, length]))) (
    'keeps the pre-extraction %s/%s landscape geometry byte-identical',
    (style, length) => {
      const plan = new FinaleShowPlanner().plan({
        id: 'geometry-baseline', style, length, orientation: 'landscape', intensity: 5, seed: 2026
      });

      expect(geometryHash(plan)).toBe(GEOMETRY_BASELINE_HASHES[style][length]);
    }
  );

  test.each([
    ['short', [6200, 6900, 7500, 8700], 600],
    ['medium', [11400, 13200, 14600, 16300], 1000],
    ['long', [18500, 21000, 23500, 26000], 1500]
  ])('ends the %s Furry score on the exact centered Hero beat', (length, finaleBeats, quietGapMs) => {
    const heroBeat = finaleBeats[finaleBeats.length - 1];
    for (const orientation of ['landscape', 'portrait']) {
      for (const seed of [0, 42, 2026, 0xffffffff]) {
        const plan = new FinaleShowPlanner().plan({
          id: 'furry-hero', style: 'furry-celebration', length, orientation, intensity: 5, seed
        });
        const heroCue = plan.cues[plan.cues.length - 1];
        const hero = heroCue.shells[0];
        const penultimate = plan.cues[plan.cues.length - 2];

        expect(plan.cues.filter(cue => cue.phase === 'finale').map(cue => cue.timeMs)).toEqual(finaleBeats);

        expect(heroCue).toMatchObject({
          beatAtMs: heroBeat,
          timeMs: heroBeat,
          phase: 'finale',
          shells: [expect.objectContaining({
            launchMode: 'rocket',
            target: { x: 0.5, y: 0.38 },
            position: { x: 0.5, y: 0.38 },
            renderHints: {
              depthEnabled: true,
              launchDepth: 0,
              burstDepth: 0.82,
              glyphScale: 2,
              glyphExtent: 0.52
            }
          })]
        });
        const heroBoykissers = hero.layers.filter(layer => layer.glyph === 'boykisser');
        expect(heroBoykissers).toHaveLength(1);
        expect(heroBoykissers[0]).toMatchObject({
          core: true,
          colors: [
            roleHex(BOYKISSER_COLORS.HEAD),
            roleHex(BOYKISSER_COLORS.FACE),
            roleHex(BOYKISSER_COLORS.PINK)
          ]
        });
        expect(hero.layers.some(layer => ['fox-head', 'wolf-head'].includes(layer.glyph))).toBe(false);
        expect(heroCue.shells).toHaveLength(1);
        expect(penultimate.shells.every(shell => shell.crackleEnabled === false)).toBe(true);
        expect(Math.max(...penultimate.shells.flatMap(shell => shell.layers)
          .filter(layer => layer.core)
          .map(layer => penultimate.timeMs + layer.delayMs + layer.lifetimeMs)))
          .toBeLessThanOrEqual(heroBeat - quietGapMs);
        for (const layer of hero.layers) {
          expect(heroBeat + layer.delayMs + layer.lifetimeMs).toBeLessThanOrEqual(plan.durationMs);
        }
      }
    }
  });

  test.each(FINALE_LENGTHS)('uses a controlled far-to-near depth arc for %s Furry choreography', length => {
    const plan = new FinaleShowPlanner().plan({
      style: 'furry-celebration', length, orientation: 'landscape', intensity: 5, seed: 77
    });
    const cats = plan.cues.map(cue => cue.shells.find(shell =>
      shell.layers.some(layer => layer.glyph === 'boykisser')));
    const buildDepths = plan.cues.filter(cue => cue.phase === 'build').map(cue =>
      cue.shells.find(shell => shell.layers.some(layer => layer.glyph === 'boykisser')).renderHints.burstDepth);
    const finaleDepths = plan.cues.filter(cue => cue.phase === 'finale').map(cue =>
      cue.shells.find(shell => shell.layers.some(layer => layer.glyph === 'boykisser')).renderHints.burstDepth);

    expect(cats[0].renderHints.burstDepth).toBeCloseTo(-0.65, 2);
    expect(buildDepths).toEqual([...buildDepths].sort((left, right) => left - right));
    expect(finaleDepths).toEqual(expect.arrayContaining([-0.45, 0.1, 0.55, 0.82]));
    expect(plan.cues.filter(cue => cue.phase === 'highlight')
      .some(cue => cue.shells.some(shell => shell.renderHints.burstDepth > 0.33))).toBe(true);

    for (const cue of plan.cues) {
      expect(cue.shells.filter(shell => shell.renderHints.burstDepth > 0.33).length).toBeLessThanOrEqual(2);
      for (const shell of cue.shells) {
        expect(shell.renderHints).toEqual(expect.objectContaining({ depthEnabled: true }));
        expect(shell.renderHints.launchDepth).toBeGreaterThanOrEqual(-1);
        expect(shell.renderHints.launchDepth).toBeLessThanOrEqual(1);
        expect(shell.renderHints.burstDepth).toBeGreaterThanOrEqual(-1);
        expect(shell.renderHints.burstDepth).toBeLessThanOrEqual(1);
        expect(shell.renderHints.glyphScale).toBeGreaterThanOrEqual(0.5);
        expect(shell.renderHints.glyphScale).toBeLessThanOrEqual(2);
      }
    }
  });

  test.each(FINALE_LENGTHS)('normalizes %s Furry glyphs and stages the Pride and Hero reveals', length => {
    const plan = new FinaleShowPlanner().plan({
      style: 'furry-celebration', length, orientation: 'landscape', intensity: 5, seed: 77
    });
    const heroCue = plan.cues.at(-1);
    const ordinaryShells = plan.cues.slice(0, -1).flatMap(cue => cue.shells);
    const boykisserLayers = plan.cues.flatMap(cue => cue.shells)
      .flatMap(shell => shell.layers)
      .filter(layer => layer.glyph === 'boykisser');

    for (const shell of ordinaryShells) {
      const expectedExtent = Math.min(0.18, Math.max(0.07, shell.renderHints.glyphScale * 0.11));
      expect(shell.renderHints.glyphExtent).toBeCloseTo(expectedExtent, 6);
    }
    expect(boykisserLayers.length).toBeGreaterThan(0);
    expect(boykisserLayers.every(layer => layer.density >= 220)).toBe(true);

    const transRibbon = plan.cues[0].shells[0].layers
      .find(layer => layer.glyph === 'trans-flag');
    expect(transRibbon).toMatchObject({ delayMs: 100, density: 36 });

    const falseFinales = plan.cues.filter(cue => /^finale-wave-[123]$/.test(cue.formation));
    expect(falseFinales).toHaveLength(3);
    falseFinales.forEach((cue, index) => {
      const decorativeGlyph = cue.shells.flatMap(shell => shell.layers)
        .find(layer => layer.primitive === 'glyph' && layer.priority === 'decorative');
      expect(decorativeGlyph).toMatchObject({
        density: 32,
        core: false,
        delayMs: 100 + index * 20
      });
    });

    const heroLayers = heroCue.shells[0].layers;
    const heroBoykisser = heroLayers.find(layer => layer.glyph === 'boykisser');
    expect(heroCue.shells[0]).toMatchObject({
      launchMode: 'rocket',
      target: { x: 0.5, y: 0.38 }
    });
    expect(heroBoykisser.density).toBeGreaterThanOrEqual(640);
    expect(heroBoykisser.density).toBeLessThanOrEqual(960);
    expect(heroCue.shells[0].renderHints.glyphExtent).toBe(0.52);
    expect(heroLayers.filter(layer => layer.primitive === 'ring').map(layer => layer.delayMs))
      .toEqual([90, 180]);
  });

  test('keeps all non-Furry built-ins flat by omitting render hints', () => {
    for (const style of FINALE_STYLES.filter(candidate => candidate !== 'furry-celebration')) {
      const plan = new FinaleShowPlanner().plan({ style, length: 'long', seed: 77 });
      expect(plan.cues.flatMap(cue => cue.shells).every(shell => shell.renderHints === undefined)).toBe(true);
    }
  });

  test('compiles a supplied custom definition as a deterministic isolated V2 event snapshot', () => {
    const definition = JSON.parse(JSON.stringify(BUILT_IN_SHOW_DEFINITIONS['classic-crescendo']));
    definition.id = 'custom:00000000-0000-4000-8000-000000000321';
    definition.metadata.name = 'Repository Snapshot';
    const before = JSON.parse(JSON.stringify(definition));
    const options = {
      id: 'event-custom-321',
      style: definition.id,
      length: 'short',
      intensity: 6,
      seed: 321
    };

    const planner = new FinaleShowPlanner();
    const first = planner.planDefinition(definition, options);
    const repeat = planner.planDefinition(definition, options);

    expect(first).toEqual(repeat);
    expect(first).toMatchObject({
      planVersion: 2,
      id: 'event-custom-321',
      definitionId: definition.id,
      style: definition.id,
      length: 'short',
      variant: 'short',
      seed: 321
    });
    expect(definition).toEqual(before);
    for (const cue of first.cues) {
      expect(cue).toMatchObject({
        id: expect.stringContaining('event-custom-321-cue-'),
        beatAtMs: cue.timeMs,
        shells: cue.launches
      });
      for (const launch of cue.launches) {
        expect(launch).toMatchObject({
          id: expect.stringContaining(`${cue.id}-launch-`),
          seed: expect.any(Number),
          powerScale: expect.any(Number),
          particleScale: expect.any(Number),
          soundRole: expect.any(String)
        });
      }
    }
  });

  test('custom intensity changes only tier and visual scales', () => {
    const definition = JSON.parse(JSON.stringify(BUILT_IN_SHOW_DEFINITIONS['sky-ballet']));
    definition.id = 'custom:00000000-0000-4000-8000-000000000322';
    const options = { id: 'custom-intensity', style: definition.id, length: 'medium', seed: 44 };
    const planner = new FinaleShowPlanner();
    const low = planner.planDefinition(definition, { ...options, intensity: 1 });
    const high = planner.planDefinition(definition, { ...options, intensity: 10 });

    expect(withoutIntensityFields(high)).toEqual(withoutIntensityFields(low));
    expect(new Set(low.cues.flatMap(cue => cue.launches).map(launch => launch.powerScale)))
      .toEqual(new Set([0.75]));
    expect(new Set(high.cues.flatMap(cue => cue.launches).map(launch => launch.particleScale)))
      .toEqual(new Set([1.4]));
  });
});
