const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
const repoRoot = path.resolve(process.cwd(), '..');
const overlayRuntimePath = path.join(pluginDir, 'streammonsters-overlay-runtime.js');
const overlayRuntime = fs.existsSync(overlayRuntimePath) ? require(overlayRuntimePath) : {};
const CommandIngress = require('../plugins/streamalchemy/backend/streammonsters/command-ingress');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');

const listZipEntries = archivePath => new Promise((resolve, reject) => {
  yauzl.open(archivePath, { lazyEntries: true }, (error, archive) => {
    if (error) return reject(error);
    const entries = [];
    archive.readEntry();
    archive.on('entry', entry => {
      entries.push(entry.fileName.replace(/\\/g, '/'));
      archive.readEntry();
    });
    archive.on('end', () => resolve(entries));
    archive.on('error', reject);
  });
});

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

    expect(queue.size()).toBeLessThanOrEqual(4);
    expect(queue.snapshot()[0].type).toBe('state_snapshot');
    expect(queue.shift(5000).type).toBe('state_snapshot');
    expect(queue.snapshot().map(event => event.type)).toEqual(
      expect.arrayContaining(['battle_started', 'egg_hatched'])
    );

    const criticalOnly = overlayRuntime.createPriorityQueue({ maxSize: 2 });
    for (const type of ['battle_started', 'battle_round', 'egg_ready', 'hatch_started', 'egg_hatched']) {
      criticalOnly.enqueue(type, { type }, 100);
      expect(criticalOnly.size()).toBeLessThanOrEqual(2);
    }
    expect(criticalOnly.size()).toBeLessThanOrEqual(2);
  });

  test('preserves durable arena cards through long battle sequences', () => {
    const queue = overlayRuntime.createPriorityQueue({ maxSize: 20, staleAfterMs: 1000 });
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

  test('keeps battle and hatch group order while giving durable cards a weighted turn', () => {
    const queue = overlayRuntime.createPriorityQueue({ maxSize: 30, staleAfterMs: 60_000 });
    queue.enqueue('rank_card', { marker: 'durable' }, 1);
    for (const type of ['stance_revealed', 'battle_started', 'battle_round', 'battle_round', 'battle_completed']) {
      queue.enqueue(type, { battleId: 'battle-a', marker: type }, 2);
    }
    for (const type of ['egg_ready', 'hatch_started', 'egg_hatched']) {
      queue.enqueue(type, { egg: { egg_id: 'egg-a' }, marker: type }, 3);
    }

    const drained = [];
    for (let next = queue.shift(10); next; next = queue.shift(10)) drained.push(next);

    expect(drained.filter(event => event.data.battleId === 'battle-a').map(event => event.type)).toEqual([
      'stance_revealed',
      'battle_started',
      'battle_round',
      'battle_round',
      'battle_completed'
    ]);
    expect(drained.filter(event => event.data.egg?.egg_id === 'egg-a').map(event => event.type)).toEqual([
      'egg_ready',
      'hatch_started',
      'egg_hatched'
    ]);
    expect(drained.findIndex(event => event.data.marker === 'durable')).toBeLessThan(6);
  });

  test('stays bounded and eventually renders durable work during a continuous battle stream', () => {
    const queue = overlayRuntime.createPriorityQueue({ maxSize: 12, staleAfterMs: 60_000 });
    queue.enqueue('quest_completed', { marker: 'durable' }, 1);
    const rendered = [];

    for (let battleIndex = 0; battleIndex < 20; battleIndex += 1) {
      for (const type of ['battle_started', 'battle_round', 'battle_round', 'battle_round', 'battle_completed']) {
        queue.enqueue(type, { battleId: `battle-${battleIndex}` }, 2 + battleIndex);
        expect(queue.size()).toBeLessThanOrEqual(12);
      }
      const next = queue.shift(100);
      if (next) rendered.push(next);
      if (next?.data?.marker === 'durable') break;
    }

    expect(rendered.some(event => event.data.marker === 'durable')).toBe(true);
    expect(queue.size()).toBeLessThanOrEqual(12);
  });

  test('uses the explicit milestone before reset Hype points for the 100 percent card', () => {
    expect(overlayRuntime.hypeMilestonePoints({
      milestone: 100,
      points: 100,
      hype: { points: 0, charged_eggs: 1 }
    })).toBe(100);
    expect(overlayRuntime.hypeMilestonePoints({
      points: 75,
      hype: { points: 20 }
    })).toBe(75);
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

  test('ships five distinct valid original PCM WAV cues dedicated to CC0 1.0', () => {
    const overlay = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');
    const cueAssetPath = path.join(pluginDir, 'assets', 'audio', 'streammonsters-cues.js');
    const licensePath = path.join(pluginDir, 'assets', 'audio', 'LICENSE-CC0-1.0.txt');
    const cues = require(cueAssetPath);
    const cueNames = ['spawn', 'ready', 'hatch', 'hit', 'win'];
    const hashes = new Set();

    expect(Object.keys(cues).sort()).toEqual([...cueNames].sort());
    for (const cue of cueNames) {
      expect(cues[cue]).toMatch(/^data:audio\/wav;base64,/);
      const bytes = Buffer.from(cues[cue].split(',')[1], 'base64');
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
      expect(bytes.subarray(12, 16).toString('ascii')).toBe('fmt ');
      expect(bytes.readUInt16LE(20)).toBe(1);
      expect(bytes.subarray(36, 40).toString('ascii')).toBe('data');
      expect(bytes.length).toBeGreaterThan(100);
      hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
    }
    expect(hashes.size).toBe(cueNames.length);

    const license = fs.readFileSync(licensePath, 'utf8');
    expect(license).toContain('CC0 1.0');
    expect(license).toContain('original');
    expect(license).toContain('spawn, ready, hatch, hit, and win');
    expect(overlay).toContain('/plugins/streamalchemy/assets/audio/streammonsters-cues.js');
    expect(overlay).toContain('window.StreamMonstersAudioCues');
    expect(overlay).toContain('decodeAudioData');
    expect(overlay).not.toContain('createOscillator');
    expect(overlayRuntime.normalizeVolume('70')).toBeCloseTo(0.7);
    expect(overlayRuntime.normalizeVolume('0.55')).toBeCloseTo(0.55);
  });

  test('includes the original cue asset and CC0 license in the 1.3 store ZIP', async () => {
    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.3.0.zip');
    const names = new Set(await listZipEntries(packagePath));

    expect([...names].some(name => name.endsWith('assets/audio/streammonsters-cues.js'))).toBe(true);
    expect([...names].some(name => name.endsWith('assets/audio/LICENSE-CC0-1.0.txt'))).toBe(true);
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
      'eggLunarCharged',
      'variantStandard',
      'variantCharged',
      'personalityBrave',
      'personalityCurious',
      'personalityMischievous',
      'personalityGentle',
      'personalityDramatic',
      'personalityLoyal',
      'personalityDreamy',
      'personalityCompetitive',
      'personalityCheerful',
      'personalityClever',
      'personalityShy',
      'personalityAdventurous',
      'battleAdvantageSuffix'
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
    for (const code of [
      'STREAM_MONSTERS_GIFT_MAPPING_INVALID',
      'STREAM_MONSTERS_GIFT_ELEMENT_INVALID',
      'STREAM_MONSTERS_GIFT_ID_REQUIRED',
      'STREAM_MONSTERS_POOL_ALREADY_RUNNING',
      'STREAM_MONSTERS_AI_PROVIDER_UNAVAILABLE',
      'STREAM_MONSTERS_RUNTIME_INSTALL_REQUEST_INVALID',
      'STREAM_MONSTERS_RUNTIME_ABORTED',
      'STREAM_MONSTERS_RUNTIME_DOWNLOAD_HTTP_503',
      'STREAM_MONSTERS_RUNTIME_DOWNLOAD_SIZE_MISMATCH',
      'STREAM_MONSTERS_RUNTIME_ARCHIVE_ENTRY_UNSAFE',
      'STREAM_MONSTERS_RUNTIME_HEALTHCHECK_FAILED',
      'backend English prose'
    ]) {
      const key = overlayRuntime.apiErrorKey(code);
      expect(key).not.toBe(code);
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
    expect(uiSource).toContain('apiErrorText');
    expect(uiSource).not.toContain('notice(error.message');
    expect(uiSource).not.toContain('{ error:error.message }');
  });

  test('owns dynamic element, variant, personality and battle-advantage locale keys', () => {
    const uiSource = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');
    const personalities = [
      'Brave', 'Curious', 'Mischievous', 'Gentle', 'Dramatic', 'Loyal',
      'Dreamy', 'Competitive', 'Cheerful', 'Clever', 'Shy', 'Adventurous'
    ];

    for (const element of ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']) {
      expect(overlayRuntime.elementKey(element)).toMatch(/^element[A-Z]/);
    }
    for (const variant of ['standard', 'charged']) {
      expect(overlayRuntime.variantKey(variant)).toMatch(/^variant[A-Z]/);
    }
    for (const personality of personalities) {
      expect(overlayRuntime.personalityKey(personality)).toMatch(/^personality[A-Z]/);
    }
    expect(overlayRuntime.elementKey('backend prose')).toBe('unknown');
    expect(overlayRuntime.personalityKey('backend prose')).toBe('unknown');
    expect(uiSource).toContain('elementName(entry.element)');
    expect(uiSource).toContain('variantName(entry.variant)');
    expect(uiSource).toContain('personalityName(monster.personality)');
    expect(overlaySource).toContain('battleAdvantageSuffix');
    expect(overlaySource).not.toContain('Vorteil ${battleAdvantageName}');
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
