'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const guide = require(path.join(root, 'scripts/plugin-guides/stream-monsters'));
const ui = fs.readFileSync(path.join(root, 'app/plugins/stream-monsters/streammonsters-ui.html'), 'utf8');
const captureSeed = fs.readFileSync(path.join(root, 'scripts/lib/docs-capture-stream-monsters-seed.js'), 'utf8');
const creatorRuntime = fs.readFileSync(path.join(root, 'app/plugins/stream-monsters/streammonsters-creator-runtime.js'), 'utf8');
const furryManifest = JSON.parse(fs.readFileSync(
  path.join(root, 'app/plugins/stream-monsters/assets/streammonsters/furry/manifest.json'),
  'utf8'
));

const preflightSteps = [
  ['retention-rules', '#gameplay'],
  ['automation-rule', '#gifts-chat'],
  ['action-chain', '#asset-library'],
  ['rule-dry-run', '#portraitBattlePreview'],
  ['alchemy-overlay', '#overlayUrl'],
  ['rule-reset', '#community-seasons']
];

describe('Stream Monsters source-only guide preflight', () => {
  test.each(preflightSteps)('%s keeps its real anchor and read-only route contract', (id, selector) => {
    const step = guide.steps.find((candidate) => candidate.id === id);

    expect(step).toBeDefined();
    expect(ui).toContain(`id="${selector.slice(1)}"`);
    expect(step.capture.assertVisible).toBe(selector);
    expect(step.workflow.route).toBe('/stream-monsters/ui');
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector }
    ]);
    expect(step.workflow.captureRule.stateChange).toBe(false);
    expect(step.workflow.postconditions).toContainEqual({ type: 'visible', selector });
  });

  test('startup reads stay explicit and visible write controls are only registered as handlers', () => {
    expect(ui).toContain("request('/api/status')");
    expect(ui).toContain("request('/api/stream-monsters/creator-state')");
    expect(ui).toContain("request('/api/stream-monsters/gift-mappings')");
    expect(ui).toContain("request('/api/stream-monsters/leaderboard?type=collector&limit=25')");
    expect(ui).toContain("request('/api/stream-monsters/leaderboard?type=arena&limit=25')");
    expect(ui).toContain("'/api/stream-monsters/monster-catalog?offset=0&limit=24'");
    expect(ui).toContain('`/api/stream-monsters/gift-catalog?q=${encodeURIComponent(catalogQuery)}`');
    expect(ui).toContain("byId('saveGiftMapping').addEventListener('click'");
    expect(ui).toContain("execute:byId(`repair${suffix}Execute`)");
    expect(ui).toContain("for (const kind of Object.keys(repairSuffixes))");

    for (const [id] of preflightSteps) {
      const step = guide.steps.find((candidate) => candidate.id === id);
      expect(step.workflow.operations.some((operation) => operation.type === 'click')).toBe(false);
      expect(step.workflow.operations.some((operation) => operation.type === 'fill')).toBe(false);
    }
  });

  test('keeps the gift catalog, synthetic mapping, and all 14 read-only alias rows in one section', () => {
    const step = guide.steps.find((candidate) => candidate.id === 'automation-rule');
    const aliasRows = ui.match(/class="alias-row" data-command-alias=/g) || [];

    expect(ui).toMatch(/<section id="gifts-chat"[\s\S]*?id="giftCatalog"[\s\S]*?id="mappingList"[\s\S]*?id="aliasGrid"[\s\S]*?<\/section>/);
    expect(ui).toContain('.gift-layout { display:grid;');
    expect(ui).toContain('.card.full { grid-column:1/-1; }');
    expect(ui).toContain('.catalog,.mapping-list,.collection-list,.leaderboard { display:grid; gap:8px; max-height:390px;');
    expect(ui).toContain('.alias-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));');
    expect(aliasRows).toHaveLength(14);
    expect(captureSeed).toContain('id: 900001');
    expect(captureSeed).toContain("name: 'Documentation Heart'");
    expect(captureSeed).toContain('INSERT INTO streammonsters_gift_mappings');
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#gifts-chat' }
    ]);
    expect(step.workflow.captureRule).toMatchObject({
      selector: '#gifts-chat',
      viewport: { width: 1440, height: 3400 },
      imageCrop: { width: 1400, height: 3360 },
      stateChange: false
    });
  });

  test('documents the asset summary, bundled gallery, integrity state, and dex with read-only local contracts', () => {
    const step = guide.steps.find((candidate) => candidate.id === 'action-chain');
    const assetSection = ui.match(/<section id="asset-library"[\s\S]*?<\/section>/)?.[0] || '';
    const assetLoad = ui.slice(ui.indexOf('const loadAssetIntegrity = async'), ui.indexOf('const loadMonsterCatalog = async'));

    expect(assetSection).toContain('id="assetFormsTotal"');
    expect(assetSection).toContain('id="assetFormsHealthy"');
    expect(assetSection).toContain('id="assetIntegrityDetails"');
    expect(assetSection).toContain('id="assetStageGrid"');
    expect(assetSection).toContain('id="dexProgress"');
    expect(assetSection).toContain('id="dexElementProgress"');
    expect(assetSection).toContain('id="monsterDex"');
    expect(ui).toContain('.asset-stage-grid { display:grid; grid-template-columns:repeat(8,minmax(90px,1fr)); gap:8px; max-height:620px; overflow:auto;');
    expect(ui).toContain('.dex-grid { display:grid; grid-template-columns:repeat(6,minmax(90px,1fr));');
    expect(ui).toContain("'/api/stream-monsters/monster-catalog?offset=0&limit=24'");
    expect(ui).toContain('await loadMonsterCatalog(status.username || \'\')');
    expect(assetLoad).toContain('creatorRuntime.buildAssetStageEntries');
    expect(assetLoad).toContain('assetIntegrity?.expected');
    expect(assetLoad).toContain('assetIntegrity?.available');
    expect(ui).toContain('image.src = entry.assetUrl;');
    expect(ui).toContain('image.src = slot.assetPath');
    expect(creatorRuntime).toContain('assetUrl:`/plugins/stream-monsters/${assetPath}`');
    expect(furryManifest.assetVersion).toBe('furry-1.12.0');
    expect(furryManifest.productionMode).toBe('bundled-only');
    expect(furryManifest.assets).toHaveLength(72);
    expect(new Set(furryManifest.assets.map((asset) => asset.assetPath)).size).toBe(72);
    expect(new Set(furryManifest.assets.map((asset) => asset.templateId)).size).toBe(24);
    expect(furryManifest.assets.every((asset) => asset.mediaType === 'image/webp')).toBe(true);
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#asset-library' }
    ]);
    expect(step.workflow.operations.some((operation) => ['click', 'fill'].includes(operation.type)))
      .toBe(false);
    expect(step.workflow.captureRule).toMatchObject({
      selector: '#asset-library',
      viewport: { width: 1440, height: 2300 },
      imageCrop: { width: 1400, height: 2260 },
      stateChange: false
    });
  });

  test('keeps asynchronous status badges out of the generic i18n DOM overwrite path', () => {
    const i18nClient = fs.readFileSync(path.join(root, 'app/public/js/i18n-client.js'), 'utf8');
    const assetBadge = ui.match(/<span id="assetIntegrity"[^>]*>/)?.[0] || '';
    const aliasBadge = ui.match(/<span id="aliasConflictStatus"[^>]*>/)?.[0] || '';
    const seasonBadge = ui.match(/<span id="seasonCountdown"[^>]*>/)?.[0] || '';

    expect(assetBadge).not.toContain('data-i18n=');
    expect(aliasBadge).not.toContain('data-i18n=');
    expect(seasonBadge).not.toContain('data-i18n=');
    expect(ui).toContain("byId('assetIntegrity').textContent = text('assetChecking', 'checking integrity');");
    expect(ui).toContain("byId('aliasConflictStatus').textContent = text('aliasChecking', 'Checking conflicts…');");
    expect(ui).toContain("byId('seasonCountdown').textContent = text('seasonLoading', 'Loading season');");
    expect(ui).toContain("if (end) byId('seasonCountdown').textContent = text('seasonEnds'");
    expect(ui).toContain("else byId('seasonCountdown').textContent = text('seasonUnavailable'");
    expect(ui).toContain("byId('seasonCountdown').textContent = text('seasonLoadFailed'");
    expect(ui).toContain("byId('assetIntegrity').textContent = summary.integrity === 'healthy'");
    expect(ui).toContain("root.textContent = text('aliasHealthy', 'No alias conflicts');");
    expect(i18nClient).toContain("document.querySelectorAll('[data-i18n]')");
    expect(i18nClient).toContain('element.textContent = resolvedTranslation;');
  });

  test('localizes integrity and alias result badges in all supported locales', () => {
    const locales = ['de', 'en', 'es', 'fr'];
    const healthyFallback = "text('assetIntegrityHealthy', '{healthy}/{total} verified', {";
    expect(ui).toContain(healthyFallback);
    expect(ui).toContain("healthy:summary.healthyForms,");
    expect(ui).toContain("total:summary.expectedForms");
    expect(ui).toContain("text('assetIntegrityDegraded', '{count} packaged forms need attention'");
    expect(ui).toContain("text('aliasHealthy', 'No alias conflicts')");
    expect(ui).toContain("text('aliasConflicts', 'Conflicts: {details}'");

    locales.forEach((locale) => {
      const translations = JSON.parse(fs.readFileSync(
        path.join(root, `app/plugins/stream-monsters/locales/${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      expect(translations.assetIntegrityHealthy).toMatch(/\{healthy\}.*\{total\}/);
      expect(translations.assetIntegrityDegraded).toContain('{count}');
      expect(translations.aliasHealthy).toBeTruthy();
      expect(translations.aliasConflicts).toContain('{details}');
      expect(translations.assetIntegrityHealthy
        .replace('{healthy}', '72')
        .replace('{total}', '72')).toContain('72/72');
    });
  });

  test('renders explicit localized season outcomes for null, valid end time, and read failure', () => {
    const expected = {
      de: ['Keine aktive Saison', 'Saisonstatus konnte nicht geladen werden'],
      en: ['No active season', 'Season status could not be loaded'],
      es: ['No hay ninguna temporada activa', 'No se pudo cargar el estado de la temporada'],
      fr: ['Aucune saison active', 'Impossible de charger l’état de la saison']
    };

    expect(ui).toContain("if (end) byId('seasonCountdown').textContent = text('seasonEnds'");
    expect(ui).toContain("else byId('seasonCountdown').textContent = text('seasonUnavailable'");
    expect(ui).toContain("byId('seasonCountdown').textContent = text('seasonLoadFailed'");
    for (const [locale, [unavailable, failed]] of Object.entries(expected)) {
      const strings = JSON.parse(fs.readFileSync(
        path.join(root, 'app/plugins/stream-monsters/locales', `${locale}.json`),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      expect(strings.seasonUnavailable).toBe(unavailable);
      expect(strings.seasonLoadFailed).toBe(failed);
    }
  });

  test('keeps the portrait battle guide read-only and frames its title, canvas, and explanatory copy', () => {
    const step = guide.steps.find((candidate) => candidate.id === 'rule-dry-run');

    expect(step.capture.assertVisible).toBe('#portraitBattlePreview');
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#portraitBattlePreview' }
    ]);
    expect(step.workflow.captureRule).toMatchObject({
      selector: '#portraitBattlePreview',
      viewport: { width: 1440, height: 820 },
      imageCrop: { width: 760, height: 720 },
      stateChange: false
    });
    expect(ui).toMatch(/data-preview-example="battle">\s*<h4 data-i18n="plugins\.streamalchemy\.ui\.monsters\.previewStateBattle"/);
    expect(ui).toContain('id="portraitBattlePreview"');
    expect(ui).toContain('data-i18n="plugins.streamalchemy.ui.monsters.portraitBattlePreviewHelp"');
    expect(step.workflow.operations.some((operation) => ['click', 'fill', 'run-local-preview'].includes(operation.type)))
      .toBe(false);
  });

  test('documents the overlay URL anchor as a child of the already measured Live Center', () => {
    expect(ui).toMatch(/<section id="live-center"[\s\S]*?<code id="overlayUrl">/);
    const step = guide.steps.find((candidate) => candidate.id === 'alchemy-overlay');
    expect(step.capture.assertVisible).toBe('#overlayUrl');
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#overlayUrl' }
    ]);
    expect(step.workflow.postconditions).toContainEqual({ type: 'visible', selector: '#overlayUrl' });
    expect(step.workflow.captureRule).toMatchObject({
      selector: '#overlayUrl',
      clipSelector: '.area#live-center .grid > .card:nth-child(2)',
      viewport: { width: 1440, height: 900 },
      imageCrop: { width: 520, height: 440 },
      stateChange: false
    });
    expect(ui).toMatch(/<article class="card">\s*<h3 data-i18n="plugins\.streamalchemy\.ui\.monsters\.obsSource">OBS Browser Source<\/h3>[\s\S]*?<code id="overlayUrl">[\s\S]*?data-overlay-url-source="#overlayUrl"/);
  });

  test('keeps rule-reset on the whole community section with empty viewer state and both leaderboards', () => {
    const step = guide.steps.find((candidate) => candidate.id === 'rule-reset');
    const communitySection = ui.match(/<section id="community-seasons"[\s\S]*?<\/section>/)?.[0] || '';

    expect(communitySection).toContain('id="seasonCountdown"');
    expect(communitySection).toContain('id="viewerSearch"');
    expect(communitySection).toContain('id="viewerCollection" class="collection-list"><span');
    expect(communitySection).toContain('id="arenaLeaderboard"');
    expect(communitySection).toContain('id="collectorLeaderboard"');
    expect(step.capture.assertVisible).toBe('#community-seasons');
    expect(step.workflow.operations).toEqual([
      { type: 'goto', route: '/stream-monsters/ui' },
      { type: 'open-plugin-surface', selector: '#community-seasons' }
    ]);
    expect(step.workflow.operations.some((operation) => ['click', 'fill', 'run-local-preview'].includes(operation.type)))
      .toBe(false);
    expect(step.workflow.captureRule).toMatchObject({ stateChange: false });
  });
});
