const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const GoalsDatabase = require('../plugins/goals/backend/database');
const GoalsPlugin = require('../plugins/goals/main');

function createApi(db, plugins = new Map()) {
  return {
    getDatabase: () => db,
    getPluginDir: () => path.join(__dirname, '..', 'plugins', 'goals'),
    getPlugin: jest.fn((pluginId) => plugins.get(pluginId) || null),
    log: jest.fn(),
    registerFlowAction: jest.fn(),
    registerIFTTTAction: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn()
  };
}

describe('Goals firework finale integration', () => {
  test('persists per-goal firework finale settings', () => {
    const sqlite = new Database(':memory:');
    const goalsDb = new GoalsDatabase(createApi(sqlite));
    goalsDb.initialize();

    const columns = sqlite.prepare('PRAGMA table_info(goals)').all().map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining([
      'firework_enabled',
      'firework_intensity',
      'firework_duration',
      'firework_theme',
      'firework_encounter_mode',
      'firework_finale_length',
      'firework_quality_profile',
      'firework_hud_label',
      'firework_progress_enabled',
      'firework_progress_milestones'
    ]));

    const created = goalsDb.createGoal({
      id: 'goal_fireworks',
      name: 'Coin Finale',
      goal_type: 'coin',
      target_value: 1000,
      firework_enabled: 1,
      firework_intensity: 4.5,
      firework_duration: 8000,
      firework_theme: 'neon-reactor',
      firework_encounter_mode: 'raid',
      firework_finale_length: 'long',
      firework_quality_profile: 'ultra',
      firework_hud_label: 'Goal Breaker',
      firework_progress_enabled: 1,
      firework_progress_milestones: '20,40,80'
    });

    expect(created.firework_enabled).toBe(1);
    expect(created.firework_intensity).toBe(4.5);
    expect(created.firework_duration).toBe(8000);
    expect(created.firework_theme).toBe('neon-reactor');
    expect(created.firework_encounter_mode).toBe('raid');
    expect(created.firework_finale_length).toBe('long');
    expect(created.firework_quality_profile).toBe('ultra');
    expect(created.firework_hud_label).toBe('Goal Breaker');
    expect(created.firework_progress_enabled).toBe(1);
    expect(created.firework_progress_milestones).toBe('20,40,80');

    const updated = goalsDb.updateGoal('goal_fireworks', {
      firework_enabled: 0,
      firework_intensity: 2,
      firework_duration: 3000,
      firework_theme: 'inferno-siege',
      firework_encounter_mode: 'finale',
      firework_finale_length: 'short',
      firework_quality_profile: 'high',
      firework_hud_label: 'Final Push',
      firework_progress_enabled: 0,
      firework_progress_milestones: '50,90'
    });

    expect(updated.firework_enabled).toBe(0);
    expect(updated.firework_intensity).toBe(2);
    expect(updated.firework_duration).toBe(3000);
    expect(updated.firework_theme).toBe('inferno-siege');
    expect(updated.firework_encounter_mode).toBe('finale');
    expect(updated.firework_finale_length).toBe('short');
    expect(updated.firework_quality_profile).toBe('high');
    expect(updated.firework_hud_label).toBe('Final Push');
    expect(updated.firework_progress_enabled).toBe(0);
    expect(updated.firework_progress_milestones).toBe('50,90');
  });

  test('adds finale length to existing goals without migrating legacy finale or duration values', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal_type TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        firework_encounter_mode TEXT DEFAULT 'finale',
        firework_duration INTEGER DEFAULT 5000
      );
      INSERT INTO goals (id, name, goal_type, firework_encounter_mode, firework_duration)
      VALUES ('legacy_goal', 'Legacy Goal', 'likes', 'finale', 7000);
    `);

    const goalsDb = new GoalsDatabase(createApi(sqlite));
    goalsDb.initialize();

    const legacyGoal = goalsDb.getGoal('legacy_goal');
    expect(legacyGoal.firework_encounter_mode).toBe('finale');
    expect(legacyGoal.firework_duration).toBe(7000);
    expect(legacyGoal.firework_finale_length).toBe('inherit');
  });

  test('persists per-goal OBS overlay theme colors', () => {
    const sqlite = new Database(':memory:');
    const goalsDb = new GoalsDatabase(createApi(sqlite));
    goalsDb.initialize();

    const theme = {
      primaryColor: '#123456',
      secondaryColor: '#abcdef',
      textColor: '#fedcba',
      bgColor: 'rgba(1, 2, 3, 0.95)',
      fontFamily: 'Impact, sans-serif',
      fontSize: 24
    };

    const created = goalsDb.createGoal({
      id: 'goal_theme',
      name: 'Styled Goal',
      goal_type: 'coin',
      theme
    });

    expect(created.theme).toEqual(theme);
    expect(sqlite.prepare('SELECT theme_json FROM goals WHERE id = ?').get('goal_theme').theme_json)
      .toBe(JSON.stringify(theme));

    const updatedTheme = {
      ...theme,
      primaryColor: '#654321',
      bgColor: 'rgba(15, 23, 42, 0.95)'
    };
    const updated = goalsDb.updateGoal('goal_theme', { theme: updatedTheme });

    expect(updated.theme).toEqual(updatedTheme);
  });

  test('triggers the Fireworks plugin finale with goal-specific settings when an enabled goal is reached', () => {
    const sqlite = new Database(':memory:');
    const fireworksPlugin = { triggerFinale: jest.fn() };
    const api = createApi(sqlite, new Map([['fireworks', fireworksPlugin]]));
    const plugin = new GoalsPlugin(api);

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_reach_fireworks',
      name: 'Reach Finale',
      goal_type: 'coin',
      current_value: 0,
      target_value: 10,
      firework_enabled: 1,
      firework_intensity: 5,
      firework_duration: 12000
    });

    const machine = plugin.stateMachineManager.getMachine(goal.id);
    machine.initialize(goal);
    plugin.setupStateMachineListeners(machine);

    machine.updateValue(10, false);

    expect(fireworksPlugin.triggerFinale).toHaveBeenCalledWith(5, 12000);
  });

  test('triggers a goal firework finale during live animated value updates without waiting for an overlay callback', () => {
    const sqlite = new Database(':memory:');
    const fireworksPlugin = { triggerFinale: jest.fn() };
    const api = createApi(sqlite, new Map([['fireworks', fireworksPlugin]]));
    const plugin = new GoalsPlugin(api);

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_live_likes_fireworks',
      name: 'Live Likes Finale',
      goal_type: 'likes',
      current_value: 0,
      target_value: 100,
      firework_enabled: 1,
      firework_intensity: 4,
      firework_duration: 7000
    });

    const machine = plugin.stateMachineManager.getMachine(goal.id);
    machine.initialize(goal);
    plugin.setupStateMachineListeners(machine);

    plugin.eventHandlers.setGoalValue(goal.id, 100);
    machine.onUpdateAnimationEnd();

    expect(fireworksPlugin.triggerFinale).toHaveBeenCalledWith(4, 7000);
    expect(fireworksPlugin.triggerFinale).toHaveBeenCalledTimes(1);
  });

  test('prefers the WebGPU Fireworks finale for a reached Like goal', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = { triggerFinale: jest.fn() };
    const legacyFireworks = { triggerFinale: jest.fn() };
    const api = createApi(sqlite, new Map([
      ['webgpu-fireworks', webgpuFireworks],
      ['fireworks', legacyFireworks]
    ]));
    const plugin = new GoalsPlugin(api);

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_live_likes_webgpu_fireworks',
      name: 'WebGPU Like Finale',
      goal_type: 'likes',
      current_value: 0,
      target_value: 100,
      firework_enabled: 1,
      firework_intensity: 4,
      firework_duration: 7000
    });

    const machine = plugin.stateMachineManager.getMachine(goal.id);
    machine.initialize(goal);
    plugin.setupStateMachineListeners(machine);

    plugin.eventHandlers.setGoalValue(goal.id, 100);
    machine.onUpdateAnimationEnd();

    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledWith({
      source: 'goal',
      intensity: 4,
      style: 'inherit',
      length: 'inherit',
      eventId: 'goal:goal_live_likes_webgpu_fireworks:100'
    });
    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledTimes(1);
    expect(legacyFireworks.triggerFinale).not.toHaveBeenCalled();
  });

  test('retries a WebGPU finale after renderer rejection without consuming the goal milestone', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = {
      triggerFinale: jest.fn()
        .mockReturnValueOnce({ accepted: false, reason: 'renderer-not-ready' })
        .mockReturnValueOnce({ accepted: true })
    };
    const plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_webgpu_retry',
      name: 'WebGPU Retry',
      goal_type: 'coin',
      target_value: 100,
      firework_enabled: 1
    });

    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(false);
    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(false);
    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledTimes(2);
  });

  test('deduplicates a synchronous reentrant WebGPU finale trigger', () => {
    const sqlite = new Database(':memory:');
    let plugin;
    let goal;
    let nestedResult;
    const webgpuFireworks = {
      triggerFinale: jest.fn()
        .mockImplementationOnce(() => {
          nestedResult = plugin.triggerGoalFireworkFinale(goal.id);
          return { accepted: true };
        })
        .mockReturnValue({ accepted: true })
    };
    plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));

    plugin.db.initialize();
    goal = plugin.db.createGoal({
      id: 'goal_webgpu_reentrant',
      name: 'WebGPU Reentrant',
      goal_type: 'coin',
      target_value: 100,
      firework_enabled: 1
    });

    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
    expect(nestedResult).toBe(false);
    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledTimes(1);
  });

  test('passes curated per-goal style and length overrides to WebGPU with a stable event id', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = { triggerFinale: jest.fn() };
    const plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_curated_finale',
      name: 'Curated Finale',
      goal_type: 'coin',
      target_value: 2500,
      firework_enabled: 1,
      firework_intensity: 6,
      firework_encounter_mode: 'sky-ballet',
      firework_finale_length: 'long'
    });

    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledWith({
      source: 'goal',
      intensity: 6,
      style: 'sky-ballet',
      length: 'long',
      eventId: 'goal:goal_curated_finale:2500'
    });

    plugin.clearGoalFireworkMilestones(goal.id);
    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
    expect(webgpuFireworks.triggerFinale).toHaveBeenLastCalledWith(expect.objectContaining({
      eventId: 'goal:goal_curated_finale:2500'
    }));
  });

  test('forwards all built-ins, strict Custom UUIDs and inherited selectors without rewriting stored intent', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = { triggerFinale: jest.fn() };
    const plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));
    const customStyle = 'custom:00000000-0000-4000-8000-000000000503';
    const cases = [
      ['classic-crescendo', 'classic-crescendo'],
      ['symmetric-salute', 'symmetric-salute'],
      ['sky-ballet', 'sky-ballet'],
      ['thunder-finale', 'thunder-finale'],
      ['nishiki-kamuro', 'nishiki-kamuro'],
      ['aurora-cathedral', 'aurora-cathedral'],
      ['royal-brocade', 'royal-brocade'],
      ['phoenix-ascension', 'phoenix-ascension'],
      ['furry-celebration', 'furry-celebration'],
      [customStyle, customStyle],
      ['custom:00000000-0000-4000-8000-00000000050A', 'custom:00000000-0000-4000-8000-00000000050a'],
      ['inherit', 'inherit'],
      ['finale', 'inherit']
    ];

    plugin.db.initialize();
    cases.forEach(([storedStyle, expectedStyle], index) => {
      const goal = plugin.db.createGoal({
        id: `goal_style_${index}`,
        name: `Style ${index}`,
        goal_type: 'coin',
        target_value: 100 + index,
        firework_enabled: 1,
        firework_encounter_mode: storedStyle,
        firework_finale_length: index % 2 === 0 ? 'short' : 'inherit'
      });

      expect(goal.firework_encounter_mode).toBe(storedStyle);
      expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
      expect(webgpuFireworks.triggerFinale).toHaveBeenLastCalledWith(expect.objectContaining({
        style: expectedStyle,
        length: index % 2 === 0 ? 'short' : 'inherit'
      }));
    });
  });

  test('keeps an already stored Auto goal override for backward compatibility', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = { triggerFinale: jest.fn() };
    const plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_legacy_auto',
      name: 'Legacy Auto',
      goal_type: 'likes',
      target_value: 100,
      firework_enabled: 1,
      firework_encounter_mode: 'auto',
      firework_finale_length: 'medium'
    });

    expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
      style: 'auto',
      length: 'medium'
    }));
  });

  test('rejects malformed Custom goal IDs at trigger time without changing storage', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = { triggerFinale: jest.fn() };
    const plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));
    const invalidStyles = [
      'custom:not-a-uuid',
      'custom:00000000-0000-0000-0000-000000000504'
    ];

    plugin.db.initialize();
    invalidStyles.forEach((storedStyle, index) => {
      const goal = plugin.db.createGoal({
        id: `goal_invalid_custom_${index}`,
        name: `Invalid Custom ${index}`,
        goal_type: 'coin',
        target_value: 10 + index,
        firework_enabled: 1,
        firework_encounter_mode: storedStyle,
        firework_finale_length: 'long'
      });

      expect(goal.firework_encounter_mode).toBe(storedStyle);
      expect(plugin.triggerGoalFireworkFinale(goal.id)).toBe(true);
      expect(webgpuFireworks.triggerFinale).toHaveBeenLastCalledWith(expect.objectContaining({
        style: 'inherit',
        length: 'long'
      }));
    });
  });

  test('maps invalid and legacy goal finale selectors to global WebGPU defaults without using duration', () => {
    const sqlite = new Database(':memory:');
    const webgpuFireworks = { triggerFinale: jest.fn() };
    const plugin = new GoalsPlugin(createApi(sqlite, new Map([['webgpu-fireworks', webgpuFireworks]])));

    plugin.db.initialize();
    const legacyGoal = plugin.db.createGoal({
      id: 'goal_legacy_inherit',
      name: 'Legacy Inherit',
      goal_type: 'likes',
      target_value: 500,
      firework_enabled: 1,
      firework_intensity: 2.5,
      firework_duration: 28000,
      firework_encounter_mode: 'finale',
      firework_finale_length: 'invalid-length'
    });

    plugin.triggerGoalFireworkFinale(legacyGoal.id);

    expect(webgpuFireworks.triggerFinale).toHaveBeenCalledWith({
      source: 'goal',
      intensity: 2.5,
      style: 'inherit',
      length: 'inherit',
      eventId: 'goal:goal_legacy_inherit:500'
    });
    expect(webgpuFireworks.triggerFinale).not.toHaveBeenCalledWith(2.5, 28000);
  });

  test('turns goal progress milestones into stable firework triggers before the finale', () => {
    const sqlite = new Database(':memory:');
    const fireworksPlugin = { triggerFinale: jest.fn(), triggerFirework: jest.fn() };
    const api = createApi(sqlite, new Map([['fireworks', fireworksPlugin]]));
    const plugin = new GoalsPlugin(api);

    plugin.db.initialize();
    const goal = plugin.db.createGoal({
      id: 'goal_progress_chargeup',
      name: 'Charge Goal',
      goal_type: 'coin',
      current_value: 0,
      target_value: 100,
      firework_enabled: 1,
      firework_intensity: 5,
      firework_progress_enabled: 1,
      firework_progress_milestones: '25,50,75'
    });

    const machine = plugin.stateMachineManager.getMachine(goal.id);
    machine.initialize(goal);
    plugin.setupStateMachineListeners(machine);

    plugin.eventHandlers.setGoalValue(goal.id, 60);

    expect(fireworksPlugin.triggerFirework).toHaveBeenCalledTimes(2);
    expect(fireworksPlugin.triggerFirework).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'goal-progress',
      shape: 'star',
      reason: 'goal-progress',
      bypassEnabled: true
    }));
    expect(fireworksPlugin.triggerFirework).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'goal-progress',
      shape: 'star',
      reason: 'goal-progress',
      bypassEnabled: true
    }));
    expect(fireworksPlugin.triggerFinale).not.toHaveBeenCalled();
  });

  test('shows finale style and length overrides while retaining duration only as hidden compatibility data', () => {
    const uiHtml = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'goals', 'ui.html'), 'utf8');
    const uiJs = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'goals', 'ui.js'), 'utf8');

    expect(uiHtml).toContain('id="goal-firework-enabled"');
    expect(uiHtml).toContain('id="goal-firework-options" style="display: none;"');
    expect(uiHtml).toContain('id="goal-firework-intensity"');
    expect(uiHtml).toContain('id="goal-firework-duration" type="hidden"');
    expect(uiHtml).toContain('id="goal-firework-encounter"');
    expect(uiHtml).toContain('id="goal-firework-finale-length"');
    expect(uiHtml).toContain('data-i18n="goals.modal.firework_finale_style_label"');
    expect(uiHtml).toContain('data-i18n="goals.modal.firework_finale_length_label"');
    expect(uiHtml.match(/data-i18n="goals\.modal\.firework_finale_global_default"/g)).toHaveLength(2);
    for (const style of [
      'classic-crescendo',
      'symmetric-salute',
      'sky-ballet',
      'thunder-finale',
      'nishiki-kamuro',
      'aurora-cathedral',
      'royal-brocade',
      'phoenix-ascension',
      'furry-celebration'
    ]) {
      expect(uiHtml).toContain(`<option value="${style}"`);
    }
    expect(uiHtml).not.toContain('<option value="auto"');
    expect(uiHtml).toContain('/plugins/webgpu-fireworks/ui/show-style-options.js');
    for (const length of ['short', 'medium', 'long']) {
      expect(uiHtml).toContain(`<option value="${length}"`);
    }
    expect(uiHtml).toContain('id="goal-firework-progress-enabled"');
    expect(uiHtml).toContain('id="goal-firework-progress-milestones"');

    expect(uiJs).toContain('toggleGoalFireworkOptions');
    expect(uiJs).toContain('firework_enabled');
    expect(uiJs).toContain('firework_intensity');
    expect(uiJs).toContain('firework_duration');
    expect(uiJs).toContain('firework_encounter_mode');
    expect(uiJs).toContain('firework_finale_length');
    expect(uiJs).toContain("goal.firework_encounter_mode === 'finale'");
    expect(uiJs).toContain('refreshGoalFinaleShowOptions');
    expect(uiJs).toContain('firework_progress_enabled');
    expect(uiJs).toContain('firework_progress_milestones');
  });

  test('localizes finale style and length selectors in every goals locale', () => {
    const expected = {
      de: {
        firework_finale_style_label: 'Finale-Showstil',
        firework_finale_length_label: 'Finale-Länge',
        firework_finale_global_default: 'Globalen Standard verwenden',
        firework_finale_style_auto: 'Auto',
        firework_finale_length_short: 'Kurz (10 s)',
        firework_finale_length_medium: 'Mittel (18 s)',
        firework_finale_length_long: 'Lang (28 s)'
      },
      en: {
        firework_finale_style_label: 'Finale Show Style',
        firework_finale_length_label: 'Finale Length',
        firework_finale_global_default: 'Use global default',
        firework_finale_style_auto: 'Auto',
        firework_finale_length_short: 'Short (10 s)',
        firework_finale_length_medium: 'Medium (18 s)',
        firework_finale_length_long: 'Long (28 s)'
      },
      es: {
        firework_finale_style_label: 'Estilo del espectáculo final',
        firework_finale_length_label: 'Duración de la final',
        firework_finale_global_default: 'Usar valor global',
        firework_finale_style_auto: 'Automático',
        firework_finale_length_short: 'Corta (10 s)',
        firework_finale_length_medium: 'Media (18 s)',
        firework_finale_length_long: 'Larga (28 s)'
      },
      fr: {
        firework_finale_style_label: 'Style du spectacle final',
        firework_finale_length_label: 'Durée de la finale',
        firework_finale_global_default: 'Utiliser le réglage global',
        firework_finale_style_auto: 'Auto',
        firework_finale_length_short: 'Courte (10 s)',
        firework_finale_length_medium: 'Moyenne (18 s)',
        firework_finale_length_long: 'Longue (28 s)'
      }
    };
    const showNames = {
      de: ['Klassisches Crescendo', 'Symmetrischer Salut', 'Himmelsballett', 'Donnerfinale'],
      en: ['Classic Crescendo', 'Symmetric Salute', 'Sky Ballet', 'Thunder Finale'],
      es: ['Crescendo clásico', 'Saludo simétrico', 'Ballet celeste', 'Final de trueno'],
      fr: ['Crescendo classique', 'Salut symétrique', 'Ballet céleste', 'Final tonnerre']
    };

    for (const [locale, localizedValues] of Object.entries(expected)) {
      const translations = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'plugins', 'goals', 'locales', `${locale}.json`), 'utf8')
      ).goals.modal;
      expect(translations).toMatchObject(localizedValues);
      expect([
        translations.firework_finale_style_classic_crescendo,
        translations.firework_finale_style_symmetric_salute,
        translations.firework_finale_style_sky_ballet,
        translations.firework_finale_style_thunder_finale
      ]).toEqual(showNames[locale]);
    }
  });

  test('sends custom style fields as goal theme from the UI save payload', () => {
    const uiJs = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'goals', 'ui.js'), 'utf8');

    expect(uiJs).toContain('theme: buildGoalThemeFromForm()');
    expect(uiJs).toContain("document.getElementById('goal-primary-color')?.value");
    expect(uiJs).toContain("document.getElementById('goal-secondary-color')?.value");
    expect(uiJs).toContain("document.getElementById('goal-text-color')?.value");
    expect(uiJs).toContain("document.getElementById('goal-bg-color')?.value");
    expect(uiJs).toContain('cssColorToHex(theme.bgColor)');
  });
});
