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

describe('Stream Monsters 1.4 compatibility in the current creator and overlay release', () => {
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
      'win_streak',
      'battle_started',
      'battle_round',
      'battle_round',
      'battle_round',
      'battle_completed',
      'rank_card',
      'quest_completed',
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

  test('uses controlled overflow to retain critical work during a continuous battle stream', () => {
    const queue = overlayRuntime.createPriorityQueue({ maxSize: 12, staleAfterMs: 60_000 });
    queue.enqueue('quest_completed', { marker: 'durable' }, 1);
    const rendered = [];

    for (let battleIndex = 0; battleIndex < 20; battleIndex += 1) {
      for (const type of ['battle_started', 'battle_round', 'battle_round', 'battle_round', 'battle_completed']) {
        queue.enqueue(type, { battleId: `battle-${battleIndex}` }, 2 + battleIndex);
      }
      const next = queue.shift(100);
      if (next) rendered.push(next);
    }

    for (let next = queue.shift(100); next; next = queue.shift(100)) rendered.push(next);
    expect(rendered.some(event => event.data.marker === 'durable')).toBe(false);
    expect(rendered.filter(event => event.priority === 3)).toHaveLength(100);
    expect(queue.size()).toBe(0);
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

  test('exposes Rules v5 controls while retiring the guided Art Lab runtime wizard', () => {
    const source = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    for (const id of [
      'activePrefix',
      'activeHatchDuration',
      'eggExpiry',
      'seasonDuration',
      'rendererQuality',
      'notificationDuration',
      'aliasEggsEnabled',
      'aliasEggsDisabled',
      'audioMasterVolume',
      'audioUiVolume',
      'audioEggVolume',
      'audioBattleVolume',
      'audioRewardVolume'
    ]) {
      expect(source).toContain(`id="${id}"`);
    }

    expect(source).not.toContain('id="runtimeWizard"');
    expect(source).not.toContain('/api/streammonsters/local-runtime/');
    expect(source).not.toContain('/api/streammonsters/pool');
    expect(source).not.toContain('/api/streamalchemy/providers/status');
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
    expect(source).toContain('/plugins/streamalchemy/assets/audio/manifest.json');
    expect(source).toContain('audioEngine.configure');
    expect(source).not.toContain('localStorage');
  });

  test('ships curated deterministic PCM WAV cues with verifiable CC0 provenance', () => {
    const overlay = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');
    const audioRoot = path.join(pluginDir, 'assets', 'audio');
    const manifest = JSON.parse(fs.readFileSync(path.join(audioRoot, 'manifest.json'), 'utf8'));
    const hashes = new Set();

    expect(manifest).toEqual(expect.objectContaining({
      license: 'CC0-1.0',
      selection: 'deterministic',
      productionMode: 'bundled-only'
    }));
    expect(Object.keys(manifest.cues).length).toBeGreaterThanOrEqual(22);
    for (const cue of Object.values(manifest.cues)) {
      expect(['ui', 'egg', 'battle', 'reward']).toContain(cue.channel);
      for (const variant of cue.variants) {
        const bytes = fs.readFileSync(path.join(pluginDir, variant.assetPath));
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
        expect(bytes.readUInt16LE(20)).toBe(1);
        expect(bytes.readUInt32LE(24)).toBe(48_000);
        expect(bytes.readUInt16LE(22)).toBe(1);
        const hash = crypto.createHash('sha256').update(bytes).digest('hex');
        expect(hash).toBe(variant.sha256);
        hashes.add(hash);
      }
    }
    expect(hashes.size).toBeGreaterThanOrEqual(22);
    for (const source of manifest.sources) {
      const license = fs.readFileSync(path.join(pluginDir, source.licensePath), 'utf8');
      const canonicalLicense = license.replace(/\r+\n/g, '\n').replace(/\r/g, '\n');
      expect(source.license).toBe('CC0-1.0');
      expect(crypto.createHash('sha256').update(canonicalLicense).digest('hex'))
        .toBe(source.licenseSha256);
    }
    expect(overlay).toContain('/plugins/streamalchemy/assets/audio/manifest.json');
    expect(overlay).toContain('StreamMonstersAudioEngine.createAudioEngine');
    expect(overlay).not.toContain('createOscillator');
    expect(overlayRuntime.normalizeVolume('70')).toBeCloseTo(0.7);
    expect(overlayRuntime.normalizeVolume('0.55')).toBeCloseTo(0.55);
  });

  test('includes every release asset in the root-relative 1.5 store ZIP', async () => {
    const packagePath = path.join(repoRoot, 'plugin-store', 'packages', 'streamalchemy-1.5.0.zip');
    const names = new Set(await listZipEntries(packagePath));
    const furryManifest = JSON.parse(fs.readFileSync(
      path.join(pluginDir, 'assets', 'streammonsters', 'furry', 'manifest.json'),
      'utf8'
    ));

    expect(names.has('plugin.json')).toBe(true);
    expect([...names].some(name => name.startsWith('streamalchemy/'))).toBe(false);
    expect(furryManifest.assets).toHaveLength(72);
    for (const asset of furryManifest.assets) {
      expect(names.has(asset.assetPath)).toBe(true);
    }

    for (const element of ['ember', 'tide', 'grove', 'gale', 'volt', 'lunar']) {
      for (const variant of ['standard', 'charged']) {
        expect(names.has(`assets/eggs/${element}-${variant}.png`)).toBe(true);
      }
    }

    for (const requiredAsset of [
      'assets/streammonsters/furry/manifest.json',
      'assets/branding/stream-monsters-icon.png',
      'assets/branding/stream-monsters-logo.png',
      'assets/kenney-monster-builder/License.txt',
      'assets/kenney-monster-builder/PNG/Default/body_blueA.png',
      'assets/audio/manifest.json',
      'assets/audio/licenses/interface-License.txt',
      'streammonsters-effects-renderer.js',
      'streammonsters-arena-director.js',
      'streammonsters-arena-view.js',
      'streammonsters-audio-engine.js',
      'streammonsters-overlay-runtime.js',
      'streammonsters-overlay.html',
      'streammonsters-ui.html',
      'backend/streammonsters/battle-rules-v3.js',
      'backend/streammonsters/battle-simulator.js',
      'backend/streammonsters/collection-service.js',
      'backend/streammonsters/database.js',
      'backend/streammonsters/game-engine.js',
      'backend/streammonsters/routes.js',
      'locales/de.json',
      'locales/en.json',
      'locales/es.json',
      'locales/fr.json'
    ]) {
      expect(names.has(requiredAsset)).toBe(true);
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('localizes every shipped Rules v5 creator and overlay concept in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(
      path.join(pluginDir, 'locales', `${locale}.json`),
      'utf8'
    ));
    const text = translations.plugins.streamalchemy.ui.monsters;

    expect(text).toBeDefined();
    for (const key of [
      'title',
      'version',
      'navAreas',
      'overlayTitle',
      'liveCenterTitle',
      'gameplayTitle',
      'giftsChatTitle',
      'overlayStudioTitle',
      'assetLibraryTitle',
      'communitySeasonsTitle',
      'prefix',
      'hatchDuration',
      'eggExpiry',
      'seasonDuration',
      'rendererQuality',
      'serverAudio',
      'tiktokFilterTitle',
      'tiktokFilterNotProbeable',
      'cooldownDiagnosticsTitle',
      'hypeMilestone',
      'heartChainEmpty',
      'heartMeHelp',
      'rankCollectorTitle',
      'collectorLeaderboardTitle',
      'noSeasonPoints',
      'arenaReady',
      'demoSent',
      'apiErrorArtUnavailable',
      'statusConnected',
      'statusDisconnected',
      'statusFallback',
      'statusIdle',
      'statusRoster',
      'statusAction'
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

  test.each(['de', 'en', 'es', 'fr'])('does not ship retired Art Lab, runtime, pool, starter or crafting locale branches in %s', (locale) => {
    const streamMonsters = JSON.parse(fs.readFileSync(
      path.join(pluginDir, 'locales', `${locale}.json`),
      'utf8'
    )).plugins.streamalchemy;
    const text = streamMonsters.ui.monsters;

    expect(Object.keys(streamMonsters)).toEqual(['ui']);
    expect(Object.keys(streamMonsters.ui)).toEqual(['monsters']);
    for (const key of [
      'artLab',
      'artCopy',
      'poolCoverage',
      'wizardTitle',
      'providerFallback',
      'runtimeStateRunning',
      'runtimePhaseModelDownload',
      'providerStateReady',
      'runtimeErrorUnknown',
      'apiErrorPoolBusy',
      'starter',
      'starterCopy',
      'chatResultStarterAlreadyClaimed',
      'chatResultStarterClaimed',
      'visualPackArtLab',
      'visualPackKenney'
    ]) {
      expect(text).not.toHaveProperty(key);
    }
  });

  test.each([
    ['de', /Portrait Arcade Rally/, /Team Heart/, /Collector Score/, /Paket|gebündelt/i],
    ['en', /Portrait Arcade Rally/, /Team Heart/, /Collector Score/, /packaged|bundled/i],
    ['es', /Portrait Arcade Rally/, /Team Heart/, /Collector Score/, /incluido|paquete/i],
    ['fr', /Portrait Arcade Rally/, /Team Heart/, /Collector Score/, /incluse|paquet/i]
  ])('uses current product language in %s', (locale, product, teamHeart, collectorScore, packagedAsset) => {
    const text = JSON.parse(fs.readFileSync(
      path.join(pluginDir, 'locales', `${locale}.json`),
      'utf8'
    )).plugins.streamalchemy.ui.monsters;

    expect(text.title).toMatch(product);
    expect(text.navAreas).not.toMatch(/Collector Arena/i);
    expect(text.overlayTitle).toMatch(product);
    expect(text.arenaReady).toMatch(product);
    expect(text.demoSent).not.toMatch(/Kenney/i);
    expect(text.heartChainEmpty).not.toMatch(/Heart Me/i);
    expect(text.heartMeHelp).toMatch(teamHeart);
    expect([
      text.rankCollectorTitle,
      text.noSeasonPoints,
      text.viewerSummary,
      text.rankReachedCopy
    ].join(' ')).toMatch(collectorScore);
    expect(text.apiErrorArtUnavailable).toMatch(packagedAsset);
    expect(text.apiErrorArtUnavailable).toMatch(/Kenney/i);
  });

  test('uses localized Rules v5 controls and chat codes without rendering backend prose', () => {
    const uiSource = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(pluginDir, 'streammonsters-overlay.html'), 'utf8');

    expect(uiSource).toContain('plugins.streamalchemy.ui.monsters.eggExpiry');
    expect(uiSource).toContain('plugins.streamalchemy.ui.monsters.seasonDuration');
    expect(uiSource).toContain('plugins.streamalchemy.ui.monsters.rendererQuality');
    expect(uiSource).toContain('plugins.streamalchemy.ui.monsters.serverAudio');
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
    expect(uiSource).toContain('elementName(egg.element)');
    expect(uiSource).toContain('variantName(egg.variant)');
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

  test('keeps the stable ID and publishes the complete 1.11 product description', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
    const storeEntry = registry.plugins.find(plugin => plugin.id === 'streamalchemy');

    expect(manifest.id).toBe('streamalchemy');
    expect(manifest.version).toBe('1.11.1');
    expect(manifest.devStatus).toBe('stable');
    expect(storeEntry.version).toBe('1.11.1');
    expect(storeEntry.channel).toBe('stable');
    expect(storeEntry.badges).toEqual(['subscriber-only']);
    expect(storeEntry.packageUrl).toBe('https://ltth.app/plugin-store/packages/streamalchemy-1.11.1.zip');

    const expectedTerms = {
      en: [/90-second/i, /Rules v8/i, /Arena Collapse/i, /WebGPU/i, /72/i, /portrait/i],
      de: [/90-Sekunden/i, /Rules v8/i, /Arena Collapse/i, /WebGPU/i, /72/i, /Portrait/i],
      es: [/90 segundos/i, /Rules v8/i, /Arena Collapse/i, /WebGPU/i, /72/i, /Portrait/i],
      fr: [/90 secondes/i, /Rules v8/i, /Arena Collapse/i, /WebGPU/i, /72/i, /Portrait/i]
    };
    expect(manifest.description).toEqual(manifest.descriptions.en);
    for (const locale of ['de', 'en', 'es', 'fr']) {
      for (const description of [manifest.descriptions[locale], storeEntry.description[locale]]) {
        for (const term of expectedTerms[locale]) {
          expect(description).toMatch(term);
        }
        expect(description).not.toMatch(/Stream[\s-]+Alchemy/i);
      }
    }

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const localeSource = fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8');
      const translations = JSON.parse(localeSource).plugins.streamalchemy;
      expect(translations.ui.monsters.version).toMatch(/1\.11/);
      expect(translations.ui.monsters.rulesDynamic).toMatch(/skill|Skill|habilidad|compétence/);
      expect(translations.ui.monsters.skillAttack).toEqual(expect.any(String));
      expect(localeSource).not.toMatch(/Stream[\s-]+Alchemy/i);
    }

    for (const visibleFile of [
      'README.md',
      'streammonsters-ui.html',
      'streammonsters-overlay.html'
    ]) {
      expect(fs.readFileSync(path.join(pluginDir, visibleFile), 'utf8')).not.toMatch(/Stream[\s-]+Alchemy/i);
    }
    const uiSource = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    expect(uiSource).toContain('Portrait Arcade Rally · Version 1.11');
    expect(uiSource).not.toMatch(/Version 1\.[34]/);
  });

  test('documents configurable hatch presets with the 90-second current default', () => {
    const readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf8');

    expect(readme).toContain('New configurations use a 90-second incubation default');
    expect(readme).toContain('30, 60, 90, 120, 300, 600 and 1,800 seconds');
    expect(readme).not.toMatch(/Standard incubation takes five minutes/i);
  });

  test('keeps the 1.2 and 1.3 release archives byte-for-byte', () => {
    const legacyPackages = new Map([
      ['streamalchemy-1.2.0.zip', 'b31507530333ff179a17a9951644cab0bb299f2358d98ffa0a67a9448ce38780'],
      ['streamalchemy-1.3.0.zip', 'c3939f09fd9ec877dd3350049eec820fe9448f2a89af812a8937a8b9ae8be0bf']
    ]);

    for (const [fileName, expectedHash] of legacyPackages) {
      const packagePath = path.join(repoRoot, 'plugin-store', 'packages', fileName);
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(crypto.createHash('sha256').update(fs.readFileSync(packagePath)).digest('hex')).toBe(expectedHash);
    }
  });
});
