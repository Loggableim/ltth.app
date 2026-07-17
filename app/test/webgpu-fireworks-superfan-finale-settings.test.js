const fs = require('fs');
const path = require('path');

describe('WebGPU Superfan finale settings', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
  const html = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');
  const script = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.js'), 'utf8');

  test('exposes enabled, cooldown, intensity, and test controls', () => {
    for (const id of [
      'superfan-finale-toggle', 'superfan-finale-cooldown',
      'superfan-finale-intensity', 'superfan-finale-intensity-value',
      'test-superfan-finale-btn'
    ]) expect(html).toContain(`id="${id}"`);
    for (const value of ['6', '12', '24', '72', '168']) {
      expect(html).toContain(`<option value="${value}"`);
    }
    expect(html).toMatch(/id="superfan-finale-toggle"[^>]*class="[^"]*active[^"]*"[^>]*data-config="superfanFinaleEnabled"/);
    expect(html).toMatch(/<option value="24"[^>]*selected/);
    expect(html).toMatch(/id="superfan-finale-intensity"[^>]*min="1"[^>]*max="10"[^>]*step="0\.5"[^>]*value="3"/);
    expect(html).not.toContain('id="superfan-finale-style"');
    expect(html).not.toContain('id="superfan-finale-length"');
  });

  test('loads, mutates, and tests the normalized config keys', () => {
    expect(script).toContain('config.superfanFinaleEnabled');
    expect(script).toContain('config.superfanFinaleCooldownHours');
    expect(script).toContain('config.superfanFinaleIntensity');
    expect(script).toContain("fetch('/api/webgpu-fireworks/test-superfan'");
  });

  const localeMessages = {
    en: [
      'Superfan Finale', 'Enable Superfan Finales', 'Repeat per Superfan',
      'Every 6 hours', 'Every 12 hours', 'Every 24 hours', 'Every 3 days', 'Every 7 days',
      'Finale intensity', 'Test Superfan Finale', 'Superfan finale triggered!',
      'Failed to trigger Superfan finale'
    ],
    de: [
      'Superfan-Finale', 'Superfan-Finales aktivieren', 'Wiederholung pro Superfan',
      'Alle 6 Stunden', 'Alle 12 Stunden', 'Alle 24 Stunden', 'Alle 3 Tage', 'Alle 7 Tage',
      'Finale-Intensität', 'Superfan-Finale testen', 'Superfan-Finale ausgelöst!',
      'Superfan-Finale konnte nicht ausgelöst werden'
    ],
    es: [
      'Final de Superfan', 'Activar finales de Superfan', 'Repetición por Superfan',
      'Cada 6 horas', 'Cada 12 horas', 'Cada 24 horas', 'Cada 3 días', 'Cada 7 días',
      'Intensidad del final', 'Probar final de Superfan', '¡Final de Superfan activado!',
      'No se pudo activar el final de Superfan'
    ],
    fr: [
      'Finale Superfan', 'Activer les finales Superfan', 'Répétition par Superfan',
      'Toutes les 6 heures', 'Toutes les 12 heures', 'Toutes les 24 heures', 'Tous les 3 jours', 'Tous les 7 jours',
      'Intensité de la finale', 'Tester la finale Superfan', 'Finale Superfan déclenchée !',
      'Échec du déclenchement de la finale Superfan'
    ]
  };

  test.each(['de', 'en', 'es', 'fr'])('ships all Superfan finale labels in %s', locale => {
    const messages = JSON.parse(fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8'));
    const keys = [
      'superfan_finale', 'enable_superfan_finale', 'superfan_finale_cooldown',
      'superfan_finale_every_6h', 'superfan_finale_every_12h', 'superfan_finale_every_24h',
      'superfan_finale_every_3d', 'superfan_finale_every_7d', 'superfan_finale_intensity',
      'test_superfan_finale', 'superfan_finale_test_success', 'superfan_finale_test_failed'
    ];
    expect(keys.map(key => messages.webgpu_fireworks[key])).toEqual(localeMessages[locale]);
  });
});
