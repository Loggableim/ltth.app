const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const read = relative => fs.readFileSync(path.join(pluginRoot, relative), 'utf8');

describe('WebGPU Fireworks user-facing i18n', () => {
  const runtimeSource = read('gpu/engine.js');
  const settingsSource = read('ui/settings.js');
  const runtimeKeys = [
    'diagnostic',
    'gift_popup',
    'follow_thanks',
    'renderer_debug'
  ];

  test('uses stable plugin keys for dynamic overlay and settings text', () => {
    expect(runtimeSource).toContain("plugins.webgpu-fireworks.runtime.gift_popup");
    expect(runtimeSource).toContain("plugins.webgpu-fireworks.runtime.follow_thanks");
    expect(runtimeSource).toContain("plugins.webgpu-fireworks.runtime.renderer_debug");
    expect(settingsSource).toContain("plugins.webgpu-fireworks.ui.audio_voices");
    expect(settingsSource).toContain("plugins.webgpu-fireworks.ui.remove_palette_color");
  });

  test.each(['en', 'de', 'es', 'fr'])('%s provides every dynamic UI key', locale => {
    const messages = JSON.parse(read(`locales/${locale}.json`)).plugins['webgpu-fireworks'];
    for (const key of runtimeKeys) {
      expect(messages.runtime).toHaveProperty(key);
    }
    expect(messages.ui).toHaveProperty('audio_voices');
    expect(messages.ui).toHaveProperty('remove_palette_color');
  });

  test('keeps configuration controls editorially localized outside English', () => {
    const load = locale => JSON.parse(read(`locales/${locale}.json`)).plugins['webgpu-fireworks'].webgpu_fireworks;
    const de = load('de');
    const es = load('es');
    const fr = load('fr');

    expect(de.save_settings).toBe('Einstellungen speichern');
    expect(es.save_settings).toBe('Guardar ajustes');
    expect(fr.save_settings).toBe('Enregistrer les paramètres');
    expect(de.click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border)
      .toBe('Klicke auf Formen, um sie für die Zufallsauswahl zu aktivieren oder zu deaktivieren. Ausgewählte Formen haben einen goldenen Rand.');
    expect(es.click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border)
      .toBe('Haz clic en las formas para activarlas o desactivarlas para la selección aleatoria. Las formas seleccionadas tienen un borde dorado.');
    expect(fr.click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border)
      .toBe('Cliquez sur les formes pour les activer ou les désactiver pour la sélection aléatoire. Les formes sélectionnées ont une bordure dorée.');
  });
});
