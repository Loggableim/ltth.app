'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'interactive-story';

describe('Interactive Story UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });

    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides semantic Interactive Story controls in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.interactive-story.interactive_story.ui.voices.label',
      'plugins.interactive-story.interactive_story.ui.overlay.sentenceBySentence',
      'plugins.interactive-story.interactive_story.ui.validation.apiKeyWhitespace',
      'plugins.interactive-story.interactive_story.ui.themes.furry',
      'plugins.interactive-story.alerts.story_error',
      'plugins.interactive-story.prompts.advance_chapter',
      'plugins.interactive-story.runtime.overlay.vote_timer',
      'plugins.interactive-story.runtime.api_test.provider_details'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('keeps the dashboard cards editorially localized outside English', () => {
    const load = (locale) => flattenTranslations(JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`),
      'utf8'
    )));

    const de = load('de');
    const es = load('es');
    const fr = load('fr');

    expect(de['plugins.interactive-story.cards.overlay.open']).toBe('Overlay öffnen');
    expect(es['plugins.interactive-story.cards.overlay.open']).toBe('Abrir superposición');
    expect(fr['plugins.interactive-story.cards.overlay.open']).toBe('Ouvrir la superposition');
    expect(de['plugins.interactive-story.cards.story_controls.manual_advance']).toBe('Zur nächsten Runde weiter');
    expect(es['plugins.interactive-story.cards.story_controls.manual_advance']).toBe('Pasar a la siguiente ronda');
    expect(fr['plugins.interactive-story.cards.story_controls.manual_advance']).toBe('Passer au tour suivant');
  });

  test('uses namespaced runtime translations for admin feedback and the overlay vote timer', () => {
    const adminSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'overlay.html'), 'utf8');

    expect(adminSource).toContain("t('plugins.interactive-story.prompts.advance_chapter'");
    expect(adminSource).toContain("t('plugins.interactive-story.runtime.api_test.provider_details'");
    expect(overlaySource).toContain("translateOverlay('plugins.interactive-story.runtime.overlay.vote_timer'");
  });

  test('does not branch visible status or chapter copy by a hard-coded language', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');

    expect(source).not.toContain("const isGerman = currentLocale === 'de';");
    expect(source).toContain("t('plugins.interactive-story.runtime.status.connection_online')");
    expect(source).toContain("t('plugins.interactive-story.runtime.chapter.empty_title')");
    expect(source).toContain("t('plugins.interactive-story.runtime.manual.vote_summary'");
    expect(source).toContain("t('plugins.interactive-story.alerts.generation_failed'");
  });

  test('localizes the preview stories sent to the real overlay', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');

    expect(source).toContain("t('plugins.interactive-story.runtime.preview.demo_title')");
    expect(source).toContain("t('plugins.interactive-story.runtime.preview.temple_choice_voice')");
    expect(source).not.toContain("title: 'Demo Chapter'");
    expect(source).not.toContain("title: 'The Ancient Temple'");
  });

  test('loads the shared i18n client on the admin panel and overlay', () => {
    for (const relativePath of ['ui.html', 'overlay.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });
});
