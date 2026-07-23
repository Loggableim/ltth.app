const fs = require('fs');
const path = require('path');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
const repoRoot = path.resolve(process.cwd(), '..');
const overlayRuntimePath = path.join(pluginDir, 'streammonsters-overlay-runtime.js');
const overlayRuntime = fs.existsSync(overlayRuntimePath) ? require(overlayRuntimePath) : {};
const CommandIngress = require('../plugins/streamalchemy/backend/streammonsters/command-ingress');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');

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

  test('preserves durable arena cards through long battle sequences', () => {
    const queue = overlayRuntime.createPriorityQueue({ maxSize: 4, staleAfterMs: 1000 });
    for (const type of [
      'stance_revealed',
      'rank_card',
      'quest_completed',
      'win_streak',
      'upset',
      'rivalry'
    ]) {
      queue.enqueue(type, { type }, 100);
    }
    for (const type of ['battle_started', 'battle_round', 'battle_round', 'battle_round', 'battle_completed']) {
      queue.enqueue(type, { type }, 200);
    }

    const drained = [];
    for (let next = queue.shift(20_000); next; next = queue.shift(20_000)) drained.push(next.type);
    expect(drained).toEqual([
      'stance_revealed',
      'battle_started',
      'battle_round',
      'battle_round',
      'battle_round',
      'battle_completed',
      'rank_card',
      'quest_completed',
      'win_streak',
      'upset',
      'rivalry'
    ]);
  });

  test('atomically replaces stale reconnect work and ignores an older slow snapshot', async () => {
    expect(typeof overlayRuntime.createReconnectController).toBe('function');
    const queue = overlayRuntime.createPriorityQueue();
    const pending = [];
    const reconnect = overlayRuntime.createReconnectController({
      queue,
      loadSnapshot: (signal, generation) => new Promise(resolve => {
        pending.push({ signal, generation, resolve });
      })
    });
    queue.enqueue('rank_card', { rank: 'stale' });

    const slow = reconnect.reconnect();
    expect(queue.size()).toBe(0);
    queue.enqueue('quest_completed', { quest: 'current' });
    const fast = reconnect.reconnect();
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve({ marker: 'old' });
    pending[1].resolve({ marker: 'new' });

    await expect(slow).resolves.toBe(false);
    await expect(fast).resolves.toBe(true);
    expect(reconnect.isSnapshotReady()).toBe(true);
    expect(queue.snapshot().map(entry => entry.data.marker || entry.data.quest)).toEqual(['new']);
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
    expect(source).toContain('createReconnectController');
    expect(source).toContain('isSnapshotReady()');
    expect(source).toContain('if (!snapshotReady) break');
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
    for (const key of [
      'unsupported',
      'runtimeReasonSupportedProfile',
      'runtimeReasonUnsupportedAdapter',
      'runtimeStateRunning',
      'runtimeStateCancelled',
      'runtimePhaseRuntimeDownload',
      'runtimePhaseModelDownload',
      'providerStateReady',
      'providerStateMissingApiKey',
      'runtimeErrorUnknown',
      'chatResultRank',
      'chatResultExecutionFailed'
    ]) {
      expect(text[key]).toEqual(expect.any(String));
      expect(text[key].trim()).not.toBe('');
    }
    for (const key of [
      'rankCollectorTitle',
      'questDailyGift',
      'questDailyHatch',
      'questDailyChat',
      'questWeeklyEvent',
      'questWeeklyBattle',
      'questWeeklyCollection',
      'achievementFirstHatch',
      'achievementChargedHatch',
      'achievementSixElements',
      'achievement10Battles',
      'achievement50Battles',
      'achievement100Battles',
      'achievementFiveWinStreak'
    ]) {
      expect(text[key]).toEqual(expect.any(String));
      expect(text[key].trim()).not.toBe('');
    }
    expect(JSON.stringify(text)).not.toMatch(/Stream[\s-]?Alchemy/i);
  });

  test('uses localized runtime and chat codes without rendering backend prose', () => {
    const uiSource = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');

    expect(uiSource).toContain('RUNTIME_REASON_KEYS');
    expect(uiSource).toContain('RUNTIME_PHASE_KEYS');
    expect(uiSource).toContain('PROVIDER_STATE_KEYS');
    expect(uiSource).not.toContain('recommendation.reason ||');
    expect(uiSource).not.toContain('state:job.state');
    expect(overlaySource).toContain('chatMessageKey');
    expect(overlaySource).not.toContain('data?.result?.message');
  });

  test('publishes an owned chat message key and ignores untrusted prose keys', () => {
    const emit = jest.fn();
    const ingress = new CommandIngress({ execute: jest.fn(), emit });

    ingress.emitResult('rank', { userId: 'viewer-a' }, {
      success: true,
      status: 'rank',
      message: 'English backend prose'
    }, 'gcce');

    expect(emit).toHaveBeenCalledWith('streammonsters:chat_result', expect.objectContaining({
      result: expect.objectContaining({
        messageKey: 'chatResultRank',
        message: 'English backend prose'
      })
    }));
    expect(overlayRuntime.chatMessageKey({ messageKey: 'chatResultRank' })).toBe('chatResultRank');
    expect(overlayRuntime.chatMessageKey({ messageKey: 'attackerKey' })).toBe('chatResultUnknown');
  });

  test('defines stable locale keys for every current quest and achievement code', () => {
    expect(ProgressionService.QUEST_TITLE_KEYS).toEqual({
      'daily:gift': 'questDailyGift',
      'daily:hatch': 'questDailyHatch',
      'daily:chat': 'questDailyChat',
      'weekly:event': 'questWeeklyEvent',
      'weekly:battle': 'questWeeklyBattle',
      'weekly:collection': 'questWeeklyCollection'
    });
    expect(ProgressionService.ACHIEVEMENT_TITLE_KEYS).toEqual({
      first_hatch: 'achievementFirstHatch',
      charged_hatch: 'achievementChargedHatch',
      six_elements: 'achievementSixElements',
      '10_battles': 'achievement10Battles',
      '50_battles': 'achievement50Battles',
      '100_battles': 'achievement100Battles',
      five_win_streak: 'achievementFiveWinStreak'
    });
  });

  test('renders owned rank, quest and achievement locale keys instead of backend English labels', () => {
    const uiSource = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');

    expect(uiSource).toContain("Gold:text('rankGold'");
    expect(uiSource).toContain("'Monster Master':text('rankMonsterMaster'");
    expect(overlaySource).toContain("Gold: text('rankGold'");
    expect(overlaySource).toContain("'Monster Master': text('rankMonsterMaster'");
    expect(uiSource).toContain('achievementTitleKey');
    expect(overlaySource).toContain('questTitleKey');
    expect(uiSource).not.toContain("replaceAll('_',' ')");
    expect(overlaySource).not.toContain('data?.quest?.title');
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
