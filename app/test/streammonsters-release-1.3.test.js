const fs = require('fs');
const path = require('path');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
const repoRoot = path.resolve(process.cwd(), '..');
const overlayRuntimePath = path.join(pluginDir, 'streammonsters-overlay-runtime.js');
const overlayRuntime = fs.existsSync(overlayRuntimePath) ? require(overlayRuntimePath) : {};

describe('Stream Monsters 1.3 creator and overlay release', () => {
  test('ships a reconnect-safe priority queue that protects battle and hatch events', () => {
    expect(typeof overlayRuntime.createPriorityQueue).toBe('function');
    const queue = overlayRuntime.createPriorityQueue({ maxSize: 4, staleAfterMs: 1000 });

    queue.enqueue('chat_result', { result: { message: 'old' } }, 100);
    queue.enqueue('chat_result', { result: { message: 'latest' } }, 200);
    queue.enqueue('hype_changed', { hype: { points: 10 } }, 300);
    queue.enqueue('hype_changed', { hype: { points: 40 } }, 400);
    queue.enqueue('battle_started', { battleId: 'battle-1' }, 500);
    queue.enqueue('egg_hatched', { egg: { egg_id: 'egg-1' } }, 600);
    queue.prependSnapshot({ config: { hatchDurationMs: 300000 } }, 700);

    expect(queue.snapshot().map(event => event.type)).toEqual([
      'state_snapshot',
      'chat_result',
      'hype_changed',
      'battle_started',
      'egg_hatched'
    ]);
    expect(queue.snapshot()[1].data.result.message).toBe('latest');
    expect(queue.snapshot()[2].data.hype.points).toBe(40);
    expect(queue.shift(5000).type).toBe('state_snapshot');
    expect(queue.shift(5000).type).toBe('battle_started');
    expect(queue.shift(5000).type).toBe('egg_hatched');
    expect(queue.shift(5000)).toBeNull();

    const criticalOnly = overlayRuntime.createPriorityQueue({ maxSize: 2 });
    for (const type of ['battle_started', 'battle_round', 'egg_ready', 'hatch_started', 'egg_hatched']) {
      criticalOnly.enqueue(type, { type }, 100);
    }
    expect(criticalOnly.snapshot().map(event => event.type)).toEqual([
      'battle_started',
      'battle_round',
      'egg_ready',
      'hatch_started',
      'egg_hatched'
    ]);
  });

  test('exposes the guided runtime wizard, dynamic rules and creator audio controls', () => {
    const source = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    for (const id of [
      'runtimeWizard',
      'runtimeAdapters',
      'runtimeRecommendation',
      'runtimeProfile',
      'runtimeBackend',
      'runtimeDevice',
      'runtimeDriver',
      'runtimeVram',
      'runtimeDisk',
      'runtimeLicense',
      'runtimeDownload',
      'runtimeProgress',
      'runtimeInstall',
      'runtimeCancel',
      'runtimeResume',
      'runtimeVerify',
      'runtimeSmokeTest',
      'runtimeRecovery',
      'activePrefix',
      'activeHatchDuration',
      'providerFallback',
      'overlayMuted',
      'overlayVolume'
    ]) {
      expect(source).toContain(`id="${id}"`);
    }

    expect(source).toContain('/api/streammonsters/local-runtime/install');
    expect(source).toContain('/api/streammonsters/local-runtime/verify');
    expect(source).toContain("method:'DELETE'");
    expect(source).toContain('streammonsters-runtime-job-id');
    expect(source).toContain('https://www.nvidia.com/en-us/geforce/drivers/');
    expect(source).toContain('https://www.intel.com/content/www/us/en/download-center/home.html');
    expect(source).toContain('https://www.amd.com/en/support/download/drivers.html');
    expect(source).toContain('256×256');
    expect(source).toContain('state.gcce?.commandPrefix');
    expect(source).toContain('state.config?.hatchDurationMs');
    expect(source).toContain('await window.i18n.init()');
    expect(source).toContain('window.i18n.onLanguageChange');
  });

  test('renders all release cards responsively and restores a state snapshot before socket events', () => {
    const source = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');

    expect(source).toContain('/plugins/streamalchemy/streammonsters-overlay-runtime.js');
    expect(source).toContain("socket.on('connect'");
    expect(source).toContain('/api/streammonsters/state');
    expect(source).toContain('prependSnapshot');
    expect(source).toContain('@media (orientation: portrait)');
    for (const type of [
      'starter_revealed',
      'stance_revealed',
      'hype_milestone',
      'elemental_hour',
      'win_streak',
      'upset',
      'rivalry',
      'rank_card'
    ]) {
      expect(source).toContain(type);
    }
    expect(source).toContain('streammonsters-overlay-muted');
    expect(source).toContain('streammonsters-overlay-volume');
  });

  test('provides five local cue types without inventing third-party audio provenance', () => {
    const overlay = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');
    const readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf8');
    const audioExtensions = /\.(mp3|wav|ogg|flac|m4a|aac)$/i;
    const pluginFiles = [];
    const visit = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else pluginFiles.push(entryPath);
      }
    };
    visit(pluginDir);

    for (const cue of ['spawn', 'ready', 'hatch', 'hit', 'win']) {
      expect(overlay).toContain(`${cue}: [`);
    }
    expect(overlayRuntime.normalizeVolume('70')).toBeCloseTo(0.7);
    expect(overlayRuntime.normalizeVolume('0.55')).toBeCloseTo(0.55);
    expect(pluginFiles.filter(file => audioExtensions.test(file))).toEqual([]);
    expect(readme).toContain('Web Audio');
    expect(readme).toContain('No third-party sound files are bundled');
  });

  test.each(['de', 'en', 'es', 'fr'])('localizes every new creator and overlay concept in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(
      path.join(pluginDir, 'locales', `${locale}.json`),
      'utf8'
    ));
    const text = translations.plugins.streamalchemy.ui.monsters;

    expect(text).toBeDefined();
    for (const key of [
      'wizardTitle',
      'adapter',
      'recommendation',
      'officialBeta',
      'experimental',
      'disk',
      'license',
      'download',
      'install',
      'cancel',
      'resume',
      'verify',
      'smokeTest',
      'recovery',
      'prefix',
      'hatchDuration',
      'providerFallback',
      'poolCoverage',
      'mute',
      'volume',
      'starter',
      'stance',
      'stancePower',
      'stanceGuard',
      'stanceSpeed',
      'hypeMilestone',
      'elementalHour',
      'winStreak',
      'upset',
      'rivalry',
      'rankCard',
      'rankGold',
      'rankMonsterMaster',
      'eggEmberStandard',
      'eggEmberCharged',
      'eggTideStandard',
      'eggTideCharged',
      'eggGroveStandard',
      'eggGroveCharged',
      'eggGaleStandard',
      'eggGaleCharged',
      'eggVoltStandard',
      'eggVoltCharged',
      'eggLunarStandard',
      'eggLunarCharged'
    ]) {
      expect(text[key]).toEqual(expect.any(String));
      expect(text[key].trim()).not.toBe('');
    }
    expect(JSON.stringify(text)).not.toMatch(/Stream[\s-]?Alchemy/i);
  });

  test('keeps user data routes stable and releases 1.3.0 without replacing 1.2.0', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const storeEntry = registry.plugins.find(plugin => plugin.id === 'streamalchemy');

    expect(manifest.id).toBe('streamalchemy');
    expect(manifest.version).toBe('1.3.0');
    expect(manifest.devStatus).toBe('working-beta');
    expect(storeEntry.version).toBe('1.3.0');
    expect(storeEntry.channel).toBe('open-beta');
    expect(storeEntry.packageUrl).toBe('https://ltth.app/plugin-store/packages/streamalchemy-1.3.0.zip');
    expect(fs.existsSync(path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.2.0.zip'))).toBe(true);
  });
});
