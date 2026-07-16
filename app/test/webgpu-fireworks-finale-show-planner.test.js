const {
  FinaleShowPlanner,
  FINALE_STYLES,
  FINALE_LENGTHS
} = require('../plugins/webgpu-fireworks/lib/finale-show-planner');

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

function launchCount(plan) {
  return plan.cues.reduce((total, cue) => total + cue.launches.length, 0);
}

function withoutIntensityFields(plan) {
  return {
    ...plan,
    cues: plan.cues.map(cue => ({
      ...cue,
      launches: cue.launches.map(launch => {
        const stableLaunch = { ...launch };
        delete stableLaunch.powerScale;
        delete stableLaunch.particleScale;
        delete stableLaunch.tier;
        return stableLaunch;
      })
    }))
  };
}

describe('WebGPU Fireworks finale show planner', () => {
  test('exports the four curated styles and three supported lengths', () => {
    expect(FINALE_STYLES).toEqual([
      'classic-crescendo',
      'symmetric-salute',
      'sky-ballet',
      'thunder-finale'
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

    expect(Object.keys(plan)).toEqual(['planVersion', 'id', 'style', 'length', 'durationMs', 'seed', 'cues']);
    expect(plan).toMatchObject({
      planVersion: 1,
      id: `${style}-${length}`,
      style,
      length,
      durationMs: LENGTHS[length].durationMs,
      seed: 12345
    });
    expect(launchCount(plan)).toBe(count);
    expect(plan.cues.length).toBeGreaterThan(0);

    for (const cue of plan.cues) {
      const [phaseStart, phaseEnd] = LENGTHS[length].phases[cue.phase];
      expect(Object.keys(cue)).toEqual(['beatAtMs', 'phase', 'formation', 'launches']);
      expect(cue.beatAtMs).toBeGreaterThanOrEqual(phaseStart);
      expect(cue.beatAtMs).toBeLessThanOrEqual(phaseEnd);
      expect(cue.launches.length).toBeGreaterThan(0);
      expect(cue.launches.length).toBeLessThanOrEqual(CONCURRENCY_CAPS[cue.phase]);

      const [breathStart, breathEnd] = LENGTHS[length].phases.breath;
      expect(cue.beatAtMs < breathStart || cue.beatAtMs >= breathEnd).toBe(true);

      for (const launch of cue.launches) {
        expect(Object.keys(launch)).toEqual([
          'id', 'seed', 'position', 'origin', 'shape', 'colors', 'powerScale',
          'particleScale', 'tier', 'soundRole', 'crackleEnabled'
        ]);
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

  test.each(FINALE_STYLES)('keeps the %s palette, shapes, formations and sound roles curated', style => {
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
});
