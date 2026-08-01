'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');

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

  test('wires duration, layout, Random mapping and scene demo controls', () => {
    const html = fs.readFileSync(path.join(pluginDir, 'streammonsters-ui.html'), 'utf8');

    for (const id of [
      'hatchPreset',
      'gameplayPace',
      'portraitBattleMode',
      'eggShelfVisibleCount',
      'portraitArenaVariant',
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
    expect(html).toContain('value="arcade"');
    expect(html).toContain('value="takeover-74"');
    expect(html).not.toContain('id="visualPack"');
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
    expect(html).toContain('/api/stream-monsters/creator-catalog');
    expect(html).toContain("portraitArenaVariant:byId('portraitArenaVariant').value");
    expect(html).toContain("eggShelfVisibleCount:byId('eggShelfVisibleCount').value");
    expect(html).toContain(
      "byId('portraitArenaVariant').addEventListener('change', renderPortraitArenaVariant)"
    );
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
    const document = new JSDOM(html).window.document;
    const normalPreview = document.getElementById('portraitNormalPreview');
    const battlePreview = document.getElementById('portraitBattlePreview');

    expect(normalPreview.dataset.previewMode).toBe('normal');
    for (const zone of ['logo', 'music', 'notification', 'avatar', 'likes', 'shelf', 'xp', 'safe']) {
      expect(normalPreview.querySelector(`[data-preview-zone="${zone}"]`)).not.toBeNull();
    }
    expect(normalPreview.querySelector('[data-preview-zone="arena"]')).toBeNull();

    expect(battlePreview.dataset.previewMode).toBe('battle');
    expect([...battlePreview.querySelectorAll('[data-preview-zone]')]
      .map(zone => zone.dataset.previewZone)).toEqual([
        'arena',
        'likebar',
        'shelf',
        'safe'
      ]);
    expect(battlePreview.querySelector('[data-preview-zone="likebar"]').dataset.owner)
      .toBe('external');
    expect(battlePreview.querySelector('[data-preview-zone="likebar"]').textContent)
      .toMatch(/Likebar.*external.*reserved/i);
    const portraitHelp = battlePreview.closest('.preview-example').querySelector('p');
    const landscapeHelp = document.getElementById('landscapeStagePreview')
      .closest('.preview-example')
      .querySelector('p');
    expect(portraitHelp.dataset.i18n).toBe(
      'plugins.streamalchemy.ui.monsters.portraitBattlePreviewHelp'
    );
    expect(portraitHelp.textContent)
      .toMatch(/bounded.*Likebar/i);
    expect(landscapeHelp.dataset.i18n).toBe(
      'plugins.streamalchemy.ui.monsters.previewBattleHelp'
    );
    expect(landscapeHelp.textContent).toMatch(/74%.*26%/);
    expect(landscapeHelp.textContent).not.toMatch(
      /Likebar|egg shelf|Eierleiste|bandeja de huevos|étagère à œufs/i
    );

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
        'portraitBattlePreviewHelp',
        'obsSourceOrderTitle',
        'obsSourceOrderIntro',
        'obsSourceOrderTakeover',
        'obsSourceOrderExternal',
        'obsSourceOrderBase',
        'obsExternalSourcesWarning',
        'portraitArenaVariant',
        'portraitArenaVariantSplitArena',
        'portraitArenaVariantClassic',
        'portraitArenaVariantHelp',
        'portraitArenaVariantPreviewSplit',
        'portraitArenaVariantPreviewClassic',
        'portraitArenaLikebarReserved',
        'portraitArenaEggShelf',
        'eggShelfVisibleCount'
      ]) {
        expect(translations[key]).toEqual(expect.any(String));
        expect(translations[key].trim()).not.toBe('');
      }
      expect(translations.portraitArenaVariantSplitArena).toMatch(/Split Arena/i);
      expect(translations.portraitArenaVariantClassic).toMatch(/Classic/i);
      expect(translations.previewBattleHelp).toMatch(/74.*26/);
      expect(translations.previewBattleHelp).not.toMatch(
        /Likebar|egg shelf|Eierleiste|bandeja de huevos|étagère à œufs/i
      );
      expect(translations.portraitBattlePreviewHelp).toMatch(/Likebar/i);
    }
  );
});
