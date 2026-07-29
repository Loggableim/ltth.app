'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
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

  test('renders real portrait and landscape stage previews with a lower 26 percent chat safe-zone', () => {
    const portrait = document.getElementById('portraitStagePreview');
    const landscape = document.getElementById('landscapeStagePreview');
    expect([portrait.dataset.width, portrait.dataset.height]).toEqual(['1080', '1920']);
    expect([landscape.dataset.width, landscape.dataset.height]).toEqual(['1920', '1080']);
    for (const preview of [portrait, landscape]) {
      expect(preview.querySelector('[data-gameplay-percent="74"]')).not.toBeNull();
      expect(preview.querySelector('[data-chat-safe-percent="26"]')).not.toBeNull();
    }
    expect([...portrait.querySelectorAll('[data-preview-zone]')].map(zone => zone.dataset.previewZone))
      .toEqual([
        'logo',
        'music',
        'notification',
        'avatar',
        'likes',
        'shelf',
        'xp',
        'battle',
        'safe'
      ]);
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
      'statusIdle'
    ]) {
      expect(translations[key]).toEqual(expect.any(String));
      expect(translations[key]).not.toHaveLength(0);
    }
  });
});
