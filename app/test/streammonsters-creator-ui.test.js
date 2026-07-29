'use strict';

const fs = require('fs');
const path = require('path');

const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');

describe('Stream Monsters creator UI presentation controls', () => {
  test.each(['de', 'en', 'es', 'fr'])(
    'localizes scaled mission targets and population explanations in %s',
    locale => {
      const translations = JSON.parse(
        fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8')
      ).plugins.streamalchemy.ui.monsters;

      for (const key of [
        'missionSixHatches',
        'missionThreeBattles',
        'missionHeartChainFive',
        'missionFourElements'
      ]) {
        expect(translations[key]).toContain('{{target}}');
      }
      for (const key of [
        'missionPopulationSolo',
        'missionPopulationParty',
        'missionPopulationRally'
      ]) {
        expect(translations[key]).toEqual(expect.any(String));
        expect(translations[key].length).toBeGreaterThan(0);
      }
    }
  );

  test('renders the effective mission target and localized population explanation', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    expect(html).toContain('target:missionTarget');
    expect(html).toContain('missionPopulation${');
  });

  test('wires persisted duration, pack, layout, Random mapping and scene demo controls', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    for (const id of [
      'hatchPreset',
      'gameplayPace',
      'portraitBattleMode',
      'visualPack',
      'landscapeAnchor',
      'landscapeScale',
      'portraitAnchor',
      'portraitScale',
      'safeZonePreview',
      'safeZoneLayout',
      'safeZoneWarning',
      'monsterDex',
      'heartChainStatus',
      'streamMissionStatus',
      'demoScene',
      'demoTemplate',
      'runSceneDemo'
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const duration of ['30000', '60000', '90000', '120000', '300000', '600000', '1800000']) {
      expect(html).toContain(`value="${duration}"`);
    }
    expect(html).toContain('value="arcade-rally"');
    expect(html).toContain('value="takeover-74"');
    expect(html).toContain('value="furry"');
    expect(html).not.toContain('value="art_lab"');
    expect(html).not.toContain('value="kenney"');
    for (const scene of ['spawn', 'hatch', 'attack', 'defense', 'special']) {
      expect(html).toContain(`value="${scene}"`);
    }
    expect(html).toContain('value="Random"');
    expect(html).toContain('streammonsters-creator-runtime.js');
    expect(html).toContain('giftMappingCustomized');
    expect(html).toContain('buildConfigPayload');
    expect(html).toContain('hydrateHatchPresetControl');
    expect(html).toContain('legacyCustomHatchDuration');
    expect(html).toContain('safeZoneCollisions');
    expect(html).toContain('buildDexSlots');
    expect(html).toContain('/api/streammonsters/creator-catalog');
  });

  test('provides keyboard and live-region semantics for creator feedback', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-label');
    expect(html).toContain(':focus-visible');
  });

  test('shows separate normal and battle portrait previews with honest OBS source ordering', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');
    const normalPreview = html.match(
      /<div id="portraitNormalPreview"[\s\S]*?<\/div>\s*<\/div>/
    )?.[0] || '';
    const battlePreview = html.match(
      /<div id="portraitBattlePreview"[\s\S]*?<\/div>\s*<\/div>/
    )?.[0] || '';

    expect(normalPreview).toContain('data-preview-mode="normal"');
    for (const zone of ['logo', 'music', 'notification', 'avatar', 'likes', 'shelf', 'xp', 'safe']) {
      expect(normalPreview).toContain(`data-preview-zone="${zone}"`);
    }
    expect(normalPreview).not.toContain('data-preview-zone="battle"');

    expect(battlePreview).toContain('data-preview-mode="battle"');
    expect(battlePreview).toContain('data-preview-zone="battle"');
    expect(battlePreview).toContain('data-preview-zone="safe"');
    for (const externalZone of ['logo', 'music', 'notification', 'avatar', 'likes', 'shelf', 'xp']) {
      expect(battlePreview).not.toContain(`data-preview-zone="${externalZone}"`);
    }

    expect(html).toContain('id="obsTakeoverSourceOrder"');
    expect(html).toContain('id="obsExternalSourcesWarning"');
    expect(html).toContain('data-i18n="plugins.streamalchemy.ui.monsters.obsSourceOrderTitle"');
    expect(html).toContain('data-i18n="plugins.streamalchemy.ui.monsters.obsExternalSourcesWarning"');
    expect(html).not.toContain('id="portraitStagePreview"');
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'ships localized normal/battle preview and OBS composition guidance in %s',
    locale => {
      const translations = JSON.parse(
        fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8')
      ).plugins.streamalchemy.ui.monsters;
      for (const key of [
        'previewStateNormal',
        'previewStateBattle',
        'previewNormalHelp',
        'previewBattleHelp',
        'obsSourceOrderTitle',
        'obsSourceOrderIntro',
        'obsSourceOrderTakeover',
        'obsSourceOrderExternal',
        'obsSourceOrderBase',
        'obsExternalSourcesWarning'
      ]) {
        expect(translations[key]).toEqual(expect.any(String));
        expect(translations[key].trim()).not.toBe('');
      }
    }
  );
});
