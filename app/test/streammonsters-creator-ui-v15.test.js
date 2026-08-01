'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');
const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
const document = new JSDOM(html).window.document;

describe('Stream Monsters 1.5 creator workspace', () => {
  test('renders exactly the seven approved creator areas in order', () => {
    const areas = [...document.querySelectorAll('section[data-creator-area]')];
    expect(areas.map(area => area.id)).toEqual([
      'live-center',
      'gameplay',
      'gifts-chat',
      'languages',
      'overlay-studio',
      'asset-library',
      'community-seasons'
    ]);
    expect(areas.map(area => area.querySelector('h2')?.textContent.trim())).toEqual([
      'Live Center',
      'Gameplay',
      'Gifts & Chat',
      'Languages',
      'Overlay Studio',
      'Monster & Asset Library',
      'Community & Seasons'
    ]);
    expect(document.querySelector('nav a[href="#languages"]')).not.toBeNull();
    expect(document.getElementById('gameplay').textContent).not.toContain('Rules v7');
    expect(document.getElementById('gameplay').textContent).toContain('Rules v8');
    expect(document.getElementById('gameplayPace').value).toBe('arcade-rally');
    expect(document.getElementById('portraitBattleMode').value).toBe('takeover-74');
    expect(document.querySelector('#hatchPreset option[value="90000"]')).not.toBeNull();
  });

  test('shows every required live diagnostic without exposing unrelated machine data', () => {
    for (const id of [
      'liveTikTok',
      'liveGcce',
      'liveObs',
      'livePlugin',
      'liveQueue',
      'liveHype',
      'liveBattlePhase',
      'liveCountdown',
      'liveRenderer',
      'liveAudio',
      'liveWarnings'
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(document.getElementById('liveWarnings').getAttribute('aria-live')).toBe('polite');
    expect(html).toContain('const refreshLiveCenterState = async () =>');
    expect(html).toContain(
      'const liveStateRefreshTimer = setInterval(refreshLiveCenterState, 5_000)'
    );
  });

  test('offers all command alias actions with conflict feedback and full catalog mapping', () => {
    const expectedCommands = [
      'eggs',
      'adopt',
      'hatch',
      'inventory',
      'monsters',
      'monster',
      'choose',
      'evolve',
      'battle',
      'leavebattle',
      'rank',
      'quests',
      'monstershelp'
    ];
    const rows = [...document.querySelectorAll('[data-command-alias]')];
    expect(rows.map(row => row.dataset.commandAlias)).toEqual(expectedCommands);
    for (const command of expectedCommands) {
      expect(document.getElementById(`alias-${command}-enabled`)).not.toBeNull();
      expect(document.getElementById(`alias-${command}-disabled`)).not.toBeNull();
    }
    expect(document.getElementById('aliasConflictStatus')).not.toBeNull();
    expect(document.getElementById('tiktokFilterStatus')).not.toBeNull();
    expect(document.getElementById('commandPolicyList')).not.toBeNull();
    expect(document.getElementById('giftElement').querySelector('option[value="Random"]')).not.toBeNull();
    expect(document.getElementById('giftCatalog')).not.toBeNull();
    const teamHeartHelp = document.querySelector(
      '[data-i18n="plugins.streamalchemy.ui.monsters.heartMeHelp"]'
    ).textContent;
    expect(teamHeartHelp).toContain('Team Heart');
    expect(teamHeartHelp).not.toContain('Heart Me');
  });

  test('renders separate normal/battle portrait previews and a landscape battle stage', () => {
    const portraitNormal = document.getElementById('portraitNormalPreview');
    const portraitBattle = document.getElementById('portraitBattlePreview');
    const landscape = document.getElementById('landscapeStagePreview');
    expect([portraitNormal.dataset.width, portraitNormal.dataset.height]).toEqual(['1080', '1920']);
    expect([portraitBattle.dataset.width, portraitBattle.dataset.height]).toEqual(['1080', '1920']);
    expect([landscape.dataset.width, landscape.dataset.height]).toEqual(['1920', '1080']);
    expect(landscape.querySelector('[data-gameplay-percent="74"]')).not.toBeNull();
    expect(landscape.querySelector('[data-chat-safe-percent="26"]')).not.toBeNull();
    expect(portraitNormal.querySelector('[data-gameplay-percent="74"]')).toBeNull();
    expect([...portraitNormal.querySelectorAll('[data-preview-zone]')].map(zone => zone.dataset.previewZone))
      .toEqual([
        'logo',
        'music',
        'notification',
        'avatar',
        'likes',
        'shelf',
        'xp',
        'safe'
      ]);
    expect([...portraitBattle.querySelectorAll('[data-preview-zone]')].map(zone => zone.dataset.previewZone))
      .toEqual(['arena', 'likebar', 'shelf', 'safe']);
    expect(document.getElementById('obsTakeoverSourceOrder')).not.toBeNull();
    expect(document.getElementById('obsExternalSourcesWarning').textContent).toContain('CSS');
  });

  test('offers the fixed TikTok Studio profile as a read-only Overlay Studio calibration', () => {
    const profile = document.getElementById('overlayProfile');
    const summary = document.getElementById('overlayProfileSummary');
    expect(profile).not.toBeNull();
    expect(profile.value).toBe('tiktok-live-studio-1080x1920');
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('1080');
    expect(summary.textContent).toContain('1920');
    expect(summary.textContent).toContain('74');
    expect(summary.textContent).toContain('26');
  });

  test('offers an independent bounded portrait arena selector with truthful preview geometry', () => {
    const overlayStudio = document.getElementById('overlay-studio');
    const selector = overlayStudio.querySelector('#portraitArenaVariant');
    const battleMode = document.getElementById('portraitBattleMode');
    const preview = document.getElementById('portraitBattlePreview');

    expect(selector).not.toBeNull();
    const helpId = selector.getAttribute('aria-describedby');
    expect([...selector.options].map(option => option.value)).toEqual([
      'split-arena',
      'classic'
    ]);
    expect(selector.value).toBe('classic');
    expect(document.getElementById(helpId)).not.toBeNull();
    expect(document.getElementById('gameplay').contains(battleMode)).toBe(true);
    expect(overlayStudio.contains(battleMode)).toBe(false);
    expect([...document.getElementById('safeZoneLayout').options]
      .map(option => option.value)).toEqual(['portrait', 'landscape']);
    expect(preview.dataset.arenaVariant).toBe('classic');

    const zoneGeometry = Object.fromEntries(
      [...preview.querySelectorAll('[data-preview-zone]')].map(zone => [
        zone.dataset.previewZone,
        {
          x: zone.style.getPropertyValue('--x'),
          y: zone.style.getPropertyValue('--y'),
          width: zone.style.getPropertyValue('--w'),
          height: zone.style.getPropertyValue('--h')
        }
      ])
    );
    expect(zoneGeometry).toEqual({
      arena: { x: '2%', y: '11.8%', width: '96%', height: '46%' },
      likebar: { x: '2%', y: '57.8%', width: '96%', height: '16.2%' },
      shelf: { x: '3%', y: '74%', width: '94%', height: '24%' },
      safe: { x: '0%', y: '98%', width: '100%', height: '2%' }
    });
  });

  test('offers every v1.5 demo scene while retaining attack and defense compatibility', () => {
    const scenes = [...document.querySelectorAll('#demoScene option')].map(option => option.value);
    expect(scenes).toEqual([
      'spawn',
      'ready',
      'hatch',
      'collection',
      'evolution',
      'match',
      'skill',
      'multihit',
      'special',
      'ko',
      'xp',
      'rankup',
      'attack',
      'defense',
      'free_offer',
      'free_release',
      'free_claim',
      'sealed_lock',
      'sealed_reveal',
      'role_striker',
      'role_guardian',
      'role_trickster',
      'role_sustain'
    ]);
    expect(html).toContain('creatorRuntime.demoTranslationKey(payload.scene)');
  });

  test('separates arena rating from collector score and surfaces 72-form integrity', () => {
    expect(document.getElementById('arenaLeaderboard')).not.toBeNull();
    expect(document.getElementById('collectorLeaderboard')).not.toBeNull();
    expect(document.getElementById('assetFormsTotal').textContent.trim()).toBe('72');
    expect(document.getElementById('assetIntegrity')).not.toBeNull();
    expect(document.getElementById('assetStageGrid')).not.toBeNull();
    expect(document.getElementById('kenneyFallbackStatus')).not.toBeNull();
  });

  test('uses privacy-projected leaderboard names and does not invent disabled commands', () => {
    expect(html).toContain('creatorRuntime.leaderboardDisplayName(entry)');
    expect(html).toContain('creatorRuntime.resolveCommandReference(name');
    expect(html).not.toContain('user.textContent = entry.user_id || entry.viewer_id');
    expect(html).not.toContain(
      "`${prefix}${state.config?.commandAliases?.[name]?.enabled?.[0] || name}`"
    );
  });

  test('offers separate preview-confirm-execute repairs for eggs and stale matches', () => {
    const repairCards = [...document.querySelectorAll('[data-repair-kind]')];
    expect(repairCards.map(card => card.dataset.repairKind)).toEqual([
      'eggs',
      'matches'
    ]);
    for (const suffix of ['Eggs', 'Matches']) {
      const preview = document.getElementById(`repair${suffix}Preview`);
      const confirmation = document.getElementById(`repair${suffix}Confirm`);
      const execute = document.getElementById(`repair${suffix}Execute`);
      const result = document.getElementById(`repair${suffix}Result`);
      expect(preview).not.toBeNull();
      expect(confirmation).not.toBeNull();
      expect(confirmation.disabled).toBe(true);
      expect(execute).not.toBeNull();
      expect(execute.disabled).toBe(true);
      expect(result.getAttribute('aria-live')).toBe('polite');
    }
  });

  test('uses the server-verified bundled catalog as the asset integrity source', () => {
    expect(html).toContain('/api/streammonsters/monster-catalog?offset=0&limit=24');
    expect(html).not.toContain(
      "fetch('/plugins/streamalchemy/assets/streammonsters/furry/manifest.json'"
    );
  });

  test('contains no retired generation controls or vocabulary', () => {
    const renderedText = document.body.textContent;
    expect(renderedText).not.toMatch(
      /Art Lab|ComfyUI|GPU|provider|local runtime|image generator|Bild-KI|KI-Kunst/i
    );
    expect(document.querySelector('[id*="runtime" i], [id*="provider" i], [id*="art-lab" i]')).toBeNull();
  });
});

describe.each(['de', 'en', 'es', 'fr'])('Stream Monsters creator locale %s', locale => {
  test('contains the seven creator area labels and no retired hero copy', () => {
    const translations = JSON.parse(
      fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8')
    ).plugins.streamalchemy.ui.monsters;
    expect([
      translations.liveCenterTitle,
      translations.gameplayTitle,
      translations.giftsChatTitle,
      translations.overlayLanguagesTitle,
      translations.overlayStudioTitle,
      translations.assetLibraryTitle,
      translations.communitySeasonsTitle
    ].every(Boolean)).toBe(true);
    expect(`${translations.version} ${translations.heroCopy}`).not.toMatch(
      /Art Lab|ComfyUI|GPU|provider|Bild-KI|KI-Kunst/i
    );
    expect(translations.setupSaved).not.toMatch(
      /Art[- ]?Pool|pool de arte|reserva|réserve|generation|Generierung/i
    );
    for (const key of [
      'tiktokFilterTitle',
      'tiktokFilterNotProbeable',
      'cooldownDiagnosticsTitle',
      'cooldownPolicyLine',
      'statusConnected',
      'statusDisconnected',
      'statusActive',
      'statusIdle',
      'duration90Seconds',
      'legacyCustomHatchDuration',
      'gameplayPace',
      'gameplayPaceArcadeRally',
      'portraitBattleMode',
      'portraitBattleModeTakeover74',
      'portraitArenaVariant',
      'portraitArenaVariantSplitArena',
      'portraitArenaVariantClassic',
      'portraitArenaVariantHelp',
      'portraitArenaVariantPreviewSplit',
      'portraitArenaVariantPreviewClassic',
      'portraitArenaLikebarReserved',
      'portraitArenaEggShelf',
      'portraitBattlePreviewHelp',
      'overlayProfile',
      'overlayProfileTikTokStudio',
      'overlayProfileSummary'
    ]) {
      expect(translations[key]).toEqual(expect.any(String));
      expect(translations[key]).not.toHaveLength(0);
    }
    expect(translations.portraitArenaVariantSplitArena).toMatch(/Split Arena/i);
    expect(translations.portraitArenaVariantClassic).toMatch(/Classic/i);
  });
});
