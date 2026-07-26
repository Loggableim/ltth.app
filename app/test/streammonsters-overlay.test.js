const fs = require('fs');
const path = require('path');
const runtime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');

describe('Stream Monsters OBS overlay', () => {
  test('serializes the complete Collector Arena event set for landscape and portrait', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');

    expect(html).toContain('streammonsters:egg_spawned');
    expect(html).toContain('streammonsters:egg_boosted');
    expect(html).toContain('streammonsters:gift_combo');
    expect(html).toContain('streammonsters:hype_changed');
    expect(html).toContain('streammonsters:egg_ready');
    expect(html).toContain('streammonsters:hatch_started');
    expect(html).toContain('streammonsters:egg_hatched');
    expect(html).toContain('streammonsters:monster_visual_evolved');
    expect(html).toContain('streammonsters:stream_started');
    expect(html).toContain('streammonsters:battle_started');
    expect(html).toContain('streammonsters:battle_round');
    expect(html).toContain('streammonsters:battle_completed');
    expect(html).toContain('streammonsters:achievement_unlocked');
    expect(html).toContain('streammonsters:season_rank_changed');
    expect(html).toContain('streammonsters:chat_result');
    expect(html).toContain('const eventQueue');
    expect(html).toContain('drainQueue');
    expect(html).toContain('hat Elementvorteil');
    expect(html).toContain('battleAdvantageSuffix');
    expect(html).not.toContain('Vorteil ${battleAdvantageName}');
    expect(html).toContain('@media (orientation: portrait)');
    expect(html).toContain('currentCommandPrefix');
    expect(html).toContain('formatHatchDuration');
    expect(html).toContain('presentWithPreview');
    expect(html).toMatch(/finally\s*\{[\s\S]*layoutController\.apply\(\)/);
  });

  test('provides transparent 16:9/9:16 effect and reveal stages with WebGPU fallback contracts', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-overlay.html'), 'utf8');

    expect(html).toContain('id="effects-canvas"');
    expect(html).toContain('id="reveal-stage"');
    expect(html).toContain('streammonsters-effects-renderer.js');
    expect(html).toContain('createEffectsRenderer');
    expect(html).toContain('createLayoutController');
    expect(html).toContain('background:transparent');
    expect(html).toContain('effects-fallback');
    expect(html).toContain('[data-anchor="top-left"]');
    expect(html).toContain('[data-anchor="bottom-right"]');
    expect(html).toContain('@media (orientation: portrait)');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
    const reducedMotion = html.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(reducedMotion).not.toContain('transform:none');
    expect(html).toContain('transform:translate(-50%,-50%)');
    expect(html).toContain('transform:scale(var(--reveal-scale,1))');
    expect(html).toContain('streammonsters:battle_skill_used');
    expect(html).toContain('streammonsters:battle_special_charged');
    expect(html).toContain('battleMonsters.find');
    expect(html).toContain('imageErrorFallback');
    expect(html).toContain("['attack', 'defense', 'special'].includes(scene)");
    expect(html).toContain('return { origin: { x: 0.5, y: 0.5 }, scale: 1 }');
  });

  test.each(['de', 'en', 'es', 'fr'])('localizes command hints with effective command references in %s', locale => {
    const translations = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', `${locale}.json`),
      'utf8'
    )).plugins.streamalchemy.ui.monsters;

    const referenceByKey = {
      overlayCommands: '{eggs}',
      eggsTimer: '{eggs}',
      hatchNow: '{hatch}',
      monsterCardHint: '{monster}'
    };
    for (const [key, reference] of Object.entries(referenceByKey)) {
      expect(translations[key]).toContain(reference);
      expect(translations[key]).not.toContain('!');
    }
    expect(translations.snapshotRules).toContain('{duration}');
    expect(translations.snapshotRules).not.toContain('{minutes}');
  });

  test('renders the slash GCCE prefix with the actual 30-second hatch duration', () => {
    const translations = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), 'plugins', 'streamalchemy', 'locales', 'en.json'),
      'utf8'
    )).plugins.streamalchemy.ui.monsters;
    const interpolate = (template, params) => template.replace(
      /\{(\w+)\}/g,
      (match, key) => key in params ? params[key] : match
    );
    const duration = runtime.hatchDurationSpec(30_000);
    const durationLabel = interpolate(translations[duration.key], duration.params);

    expect(interpolate(translations.snapshotRules, {
      eggs: '/eier',
      hatch: '/hatch',
      duration: durationLabel
    })).toBe('/eier · /hatch [slot] · 30 seconds');
  });
});
