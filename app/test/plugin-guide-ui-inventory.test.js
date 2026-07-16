const path = require('path');
const fs = require('fs');

const { collectGuideUiInventory, parseControls } = require('../../scripts/lib/plugin-guide-ui-inventory');

describe('plugin guide UI inventory', () => {
  test('does not turn runtime template expressions into documented controls', () => {
    const controls = parseControls(`
      <button id="real-control" type="button">Open settings</button>
      <script>const row = \`<button id="${'${item.id}'}">${'${escapeHtml(item.name)}'}</button>\`;</script>
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({ selector: '#real-control', label: 'Open settings' })
    ]);
  });

  test('uses the immediately preceding localized label for a control without a for attribute', () => {
    const controls = parseControls(`
      <div class="field">
        <label data-i18n="plugins.fixture.form.timerMode">Timer mode</label>
        <select id="timer-mode"><option value="countdown">Countdown</option></select>
      </div>
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({
        selector: '#timer-mode',
        label: 'Timer mode',
        i18nKey: 'plugins.fixture.form.timerMode'
      })
    ]);
  });

  test('uses a localized descendant of a label that wraps its control', () => {
    const controls = parseControls(`
      <label class="option">
        <input id="follow-messages" type="checkbox">
        <span data-i18n="plugins.fixture.form.followMessages">Respond to follows</span>
      </label>
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({
        selector: '#follow-messages',
        label: 'Respond to follows',
        i18nKey: 'plugins.fixture.form.followMessages'
      })
    ]);
  });

  test('uses an explicitly associated localized label', () => {
    const controls = parseControls(`
      <label for="private-messages" data-i18n="plugins.fixture.form.privateMessages">Allow private messages</label>
      <input id="private-messages" type="checkbox">
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({
        selector: '#private-messages',
        label: 'Allow private messages',
        i18nKey: 'plugins.fixture.form.privateMessages'
      })
    ]);
  });

  test('uses a localized descendant inside a button', () => {
    const controls = parseControls(`
      <button id="save-settings"><span data-i18n="plugins.fixture.actions.save">Save settings</span></button>
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({
        selector: '#save-settings',
        label: 'Save settings',
        i18nKey: 'plugins.fixture.actions.save'
      })
    ]);
  });

  test('uses a localized enclosing label when a switch adds an inner label', () => {
    const controls = parseControls(`
      <label class="field">
        <span data-i18n="plugins.fixture.permissions.allowAll">Allow all users</span>
        <label class="switch"><input id="allow-all" type="checkbox"><span class="slider"></span></label>
      </label>
    `, '/example/ui');

    expect(controls).toEqual([
      expect.objectContaining({
        selector: '#allow-all',
        label: 'Allow all users',
        i18nKey: 'plugins.fixture.permissions.allowAll'
      })
    ]);
  });

  test('loads the declared plugin locale values for an inventoried control label', () => {
    const inventory = collectGuideUiInventory(path.join(__dirname, '..', '..'), {
      id: 'advanced-timer',
      definition: { activation: { route: '/plugins/advanced-timer/ui.html' } }
    });
    const timerMode = inventory.controls.find((control) => control.selector === '#timer-mode');

    expect(timerMode.labels).toEqual({
      de: 'Timer-Modus',
      en: 'Timer Mode',
      es: 'Modo del temporizador',
      fr: 'Mode du minuteur'
    });
  });

  test('resolves locale labels for a route-only inventory caller', () => {
    const inventory = collectGuideUiInventory(path.join(__dirname, '..', '..'), {
      definition: { activation: { route: '/plugins/advanced-timer/ui.html' } }
    });
    const timerMode = inventory.controls.find((control) => control.selector === '#timer-mode');

    expect(timerMode.labels).toEqual(expect.objectContaining({
      de: 'Timer-Modus',
      en: 'Timer Mode',
      es: 'Modo del temporizador',
      fr: 'Mode du minuteur'
    }));
  });

  test('uses localized title blocks that uniquely surround real plugin controls', () => {
    const repoRoot = path.join(__dirname, '..', '..');
    const cases = [
      {
        guide: { id: 'tts', definition: { activation: { route: '/plugins/tts/ui/admin-panel.html' } } },
        selector: '#eventTTSEnabled',
        key: 'plugins.tts.labels.master_enable_disable',
        labels: {
          de: 'Master aktivieren/deaktivieren',
          en: 'Master Enable/Disable',
          es: 'Habilitar/deshabilitar maestro',
          fr: 'Activer/Désactiver le maître'
        }
      },
      {
        guide: { id: 'weather-control', definition: { activation: { route: '/plugins/weather-control/ui.html' } } },
        selector: '#effect-rain-enabled',
        key: 'plugins.weather-control.effects.names.rain',
        labels: { de: 'Regen', en: 'Rain', es: 'Lluvia', fr: 'Pluie' }
      },
      {
        guide: { id: 'openshock', definition: { activation: { route: '/plugins/openshock/ui.html' } } },
        selector: '#globalMaxIntensity',
        key: 'plugins.openshock.labels.max_intensity',
        labels: {
          de: 'Maximale Intensität',
          en: 'Max Intensity',
          es: 'Intensidad máxima',
          fr: 'Intensité maximale'
        }
      },
      {
        guide: { id: 'openshock', definition: { activation: { route: '/plugins/openshock/ui.html' } } },
        selector: '#globalMaxDuration',
        key: 'plugins.openshock.labels.max_duration_ms',
        labels: {
          de: 'Maximale Dauer (ms)',
          en: 'Max Duration (ms)',
          es: 'Duración máxima (ms)',
          fr: 'Durée maximale (ms)'
        }
      },
      {
        guide: { id: 'openshock', definition: { activation: { route: '/plugins/openshock/ui.html' } } },
        selector: '#mappingIntensity',
        key: 'plugins.openshock.ui.labels.intensity',
        labels: { de: 'Intensität', en: 'Intensity', es: 'Intensidad', fr: 'Intensité' }
      },
      {
        guide: { id: 'openshock', definition: { activation: { route: '/plugins/openshock/ui.html' } } },
        selector: '#mappingDuration',
        key: 'plugins.openshock.openshock.triggers.duration',
        labels: { de: 'Dauer (ms)', en: 'Duration (ms)', es: 'Duración (ms)', fr: 'Durée (ms)' }
      },
      {
        guide: { id: 'openshock', definition: { activation: { route: '/plugins/openshock/ui.html' } } },
        selector: '#mappingEnabled',
        key: 'plugins.openshock.ui.labels.enabled',
        labels: { de: 'Aktiviert', en: 'Enabled', es: 'Activado', fr: 'Activé' }
      },
      {
        guide: { id: 'openshock', definition: { activation: { route: '/plugins/openshock/ui.html' } } },
        selector: '#requireSuperfan',
        key: 'plugins.openshock.labels.require_superfan_status',
        labels: {
          de: 'Superfan-Status erforderlich',
          en: 'Require Superfan Status',
          es: 'Requerir estado de superfan',
          fr: 'Exiger le statut de Superfan'
        }
      }
    ];

    for (const fixture of cases) {
      const inventory = collectGuideUiInventory(repoRoot, fixture.guide);
      expect(inventory.controls.find((control) => control.selector === fixture.selector)).toEqual(expect.objectContaining({
        i18nKey: fixture.key,
        labels: fixture.labels
      }));
    }
  });

  test('does not assign a shared TTS title block to an ambiguous sibling control', () => {
    const inventory = collectGuideUiInventory(path.join(__dirname, '..', '..'), {
      id: 'tts',
      definition: { activation: { route: '/plugins/tts/ui/admin-panel.html' } }
    });
    const input = inventory.controls.find((control) => control.selector === '#modalVolumeGainInput');

    expect(input).toEqual(expect.objectContaining({ label: '100' }));
    expect(input).not.toHaveProperty('i18nKey');
  });

  test('loads dashboard locale labels for Store Admin controls', () => {
    const storeAdmin = collectGuideUiInventory(path.join(__dirname, '..', '..'), {
      id: 'store-admin',
      definition: { activation: { route: '/dashboard.html?view=plugins' } }
    });
    const quickCreate = storeAdmin.controls.find((control) => control.selector === '#add-flow-btn');

    expect(quickCreate.labels).toEqual({
      de: 'Schnell erstellen',
      en: 'Quick Create',
      es: 'Creación rápida',
      fr: 'Création rapide'
    });

    const search = storeAdmin.controls.find((control) => control.selector === '#plugin-search');
    expect(search.labels).toEqual({
      de: 'Plugins suchen...',
      en: 'Search plugins...',
      es: 'Buscar plugins...',
      fr: 'Rechercher des plugins...'
    });
  });

  test('localizes dashboard utility controls that share the Store Admin route', () => {
    const storeAdmin = collectGuideUiInventory(path.join(__dirname, '..', '..'), {
      id: 'store-admin',
      definition: { activation: { route: '/dashboard.html?view=plugins' } }
    });
    const utilitySelectors = new Set([
      '#clear-events-btn', '#create-profile-btn', '#debug-clear', '#debug-close', '#debug-export', '#debug-toggle-logs',
      '#diag-clear-logs', '#diag-copy-logs', '#diag-download-logs', '#dismiss-updates-btn', '#enable-audio-btn',
      '#fallback-key-consent-cancel', '#fallback-key-consent-confirm', '#filter-all-btn', '#flow-modal-close',
      '#flow-presets-close-btn', '#flow-wizard-close-btn', '#import-sessionid-input', '#network-add-url-btn',
      '#network-custom-address', '#network-external-url-input', '#network-tunnel-custom-command', '#network-tunnel-region',
      '#network-tunnel-start-btn', '#network-tunnel-stop-btn', '#network-tunnel-subdomain-lt', '#network-tunnel-url-copy',
      '#new-alias-label', '#new-alias-username', '#profile-btn', '#shutdown-cancel-btn', '#shutdown-confirm-btn',
      '#sidebar-quick-emoji-rain', '#sidebar-quick-flows', '#sidebar-quick-openshock-stop', '#sidebar-quick-osc-bridge',
      '#sidebar-quick-soundboard', '#sidebar-quick-tts', '#sidebar-quick-webgpu-emoji-rain', '#sidebar-toggle',
      '#toggle-tts-elevenlabs-key', '#toggle-tts-fishaudio-key', '#toggle-tts-fishspeech-key', '#toggle-tts-google-key',
      '#toggle-tts-ollama-key', '#toggle-tts-openai-key', '#toggle-tts-speechify-key', '#topbar-shutdown-btn',
      '#wizard-test-btn'
    ]);
    const unlocalized = storeAdmin.controls
      .filter((control) => utilitySelectors.has(control.selector))
      .filter((control) => !control.i18nKey || Object.keys(control.labels || {}).length !== 4)
      .map((control) => control.selector);

    expect(unlocalized).toEqual([]);
  });

  test('keeps Electron-only window controls hidden in a browser runtime', () => {
    const navigation = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'navigation.js'), 'utf8');

    expect(navigation).toMatch(/if \(!isElectron\)[\s\S]*?windowControls\.classList\.add\('hidden-in-browser'\)/);
  });
});
