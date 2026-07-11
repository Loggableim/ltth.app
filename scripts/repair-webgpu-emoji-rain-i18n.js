#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = path.join(root, 'app', 'plugins', 'webgpu-emoji-rain', 'ui.html');
const localeDir = path.join(root, 'app', 'plugins', 'webgpu-emoji-rain', 'locales');
const languages = ['en', 'de', 'es', 'fr'];

const entries = {
  webgpu_emoji_rain: {
    hero: {
      page_title: { en: 'Emoji Rain Settings - TikTok Stream Tool', de: 'Emoji-Rain-Konfiguration – TikTok Stream Tool', es: 'Configuración de Emoji Rain – TikTok Stream Tool', fr: 'Configuration d’Emoji Rain – TikTok Stream Tool' },
      subtitle: { en: 'Physics-based emoji animations for TikTok events', de: 'Physikbasierte Emoji-Animationen für TikTok-Events', es: 'Animaciones de emojis basadas en física para eventos de TikTok', fr: 'Animations d’emojis basées sur la physique pour les événements TikTok' },
      disabled: { en: 'Disabled', de: 'Deaktiviert', es: 'Desactivado', fr: 'Désactivé' },
      optimized: { en: 'Optimized for Day / Night / CID / Vision / High Contrast', de: 'Optimiert für Day / Night / CID / Vision / hohen Kontrast', es: 'Optimizado para Day / Night / CID / Vision / alto contraste', fr: 'Optimisé pour Day / Night / CID / Vision / contraste élevé' },
      open_obs_hud: { en: 'Open OBS HUD', de: 'OBS-HUD öffnen', es: 'Abrir HUD de OBS', fr: 'Ouvrir le HUD OBS' },
      live_preview: { en: 'Live Preview', de: 'Live-Vorschau', es: 'Vista previa en directo', fr: 'Aperçu live' },
      premium_stage: { en: 'Premium Stage', de: 'Premium Stage', es: 'Premium Stage', fr: 'Premium Stage' },
      visual_mode: { en: 'Visual Mode', de: 'Visueller Modus', es: 'Modo visual', fr: 'Mode visuel' },
      visual_note: { en: 'Look, intensity and performance', de: 'Look, Intensität und Performance', es: 'Aspecto, intensidad y rendimiento', fr: 'Style, intensité et performances' },
      enabled: { en: 'Enabled', de: 'Aktiviert', es: 'Activado', fr: 'Activé' },
      performance: { en: 'Performance', de: 'Performance', es: 'Rendimiento', fr: 'Performances' }
    },
    ui: {
      overlay: { en: 'TikTok Visual Effects Overlay', de: 'TikTok-Overlay für visuelle Effekte', es: 'Overlay de efectos visuales de TikTok', fr: 'Overlay d’effets visuels TikTok' },
      visual_mode: { en: 'Visual Mode', de: 'Visueller Modus', es: 'Modo visual', fr: 'Mode visuel' },
      toaster_title: { en: 'Toaster Mode (Low-End PCs)', de: 'Toaster-Modus (schwache PCs)', es: 'Modo Toaster (PC modestos)', fr: 'Mode Toaster (PC peu puissant)' },
      toaster_enable: { en: 'Enable Toaster Mode', de: 'Toaster-Modus aktivieren', es: 'Activar modo Toaster', fr: 'Activer le mode Toaster' },
      toaster_help: { en: 'Optimized for maximum performance on weak systems', de: 'Optimiert für maximale Performance auf schwachen Systemen', es: 'Optimizado para el máximo rendimiento en sistemas modestos', fr: 'Optimisé pour des performances maximales sur les systèmes peu puissants' },
      max_emojis: { en: 'Max. Emojis:', de: 'Max. Emojis:', es: 'Máx. emojis:', fr: 'Emojis max. :' },
      target_fps: { en: 'Target FPS:', de: 'Ziel-FPS:', es: 'FPS objetivo:', fr: 'FPS cible :' },
      rotation: { en: 'Rotation: Disabled', de: 'Rotation: Deaktiviert', es: 'Rotación: desactivada', fr: 'Rotation : désactivée' },
      wind: { en: 'Wind: Disabled', de: 'Wind: Deaktiviert', es: 'Viento: desactivado', fr: 'Vent : désactivé' },
      effects: { en: 'Rainbow/Pixel/Glow: Disabled', de: 'Rainbow/Pixel/Glow: Deaktiviert', es: 'Rainbow/Pixel/Glow: desactivados', fr: 'Rainbow/Pixel/Glow : désactivés' },
      burst: { en: 'Burst Intensity: Reduced', de: 'Burst-Intensität: Reduziert', es: 'Intensidad del burst: reducida', fr: 'Intensité du burst : réduite' },
      obs_settings: { en: 'OBS HUD Settings', de: 'OBS-HUD-Einstellungen', es: 'Ajustes del HUD de OBS', fr: 'Réglages du HUD OBS' },
      resolution_preset: { en: 'Resolution Preset', de: 'Auflösungs-Preset', es: 'Preajuste de resolución', fr: 'Préréglage de résolution' },
      custom: { en: 'Custom', de: 'Benutzerdefiniert', es: 'Personalizado', fr: 'Personnalisé' },
      resolution_help: { en: 'Choose a standard resolution or Custom', de: 'Wähle eine Standardauflösung oder „Benutzerdefiniert“', es: 'Elige una resolución estándar o «Personalizado»', fr: 'Choisissez une résolution standard ou « Personnalisé »' },
      hud_width: { en: 'OBS HUD Width (px)', de: 'OBS-HUD-Breite (px)', es: 'Anchura del HUD OBS (px)', fr: 'Largeur du HUD OBS (px)' },
      hud_width_help: { en: 'Fixed width for the OBS browser source', de: 'Feste Breite für die OBS-Browserquelle', es: 'Anchura fija para la fuente de navegador de OBS', fr: 'Largeur fixe pour la source navigateur OBS' },
      hud_height: { en: 'OBS HUD Height (px)', de: 'OBS-HUD-Höhe (px)', es: 'Altura del HUD OBS (px)', fr: 'Hauteur du HUD OBS (px)' },
      hud_height_help: { en: 'Fixed height for the OBS browser source', de: 'Feste Höhe für die OBS-Browserquelle', es: 'Altura fija para la fuente de navegador de OBS', fr: 'Hauteur fixe pour la source navigateur OBS' },
      emoji_set: { en: 'Emojis (comma-separated)', de: 'Emojis (durch Komma getrennt)', es: 'Emojis (separados por comas)', fr: 'Emojis (séparés par des virgules)' },
      emoji_set_help: { en: 'Enter emojis to spawn at random', de: 'Gib die Emojis ein, die zufällig erscheinen sollen', es: 'Introduce los emojis que aparecerán al azar', fr: 'Saisissez les emojis à faire apparaître aléatoirement' },
      uploaded_images: { en: 'Uploaded Images', de: 'Hochgeladene Bilder', es: 'Imágenes subidas', fr: 'Images importées' },
      no_images: { en: 'No images uploaded', de: 'Keine Bilder hochgeladen', es: 'No hay imágenes subidas', fr: 'Aucune image importée' },
      user_filter: { en: 'Filter users', de: 'Benutzer filtern', es: 'Filtrar usuarios', fr: 'Filtrer les utilisateurs' },
      no_mappings: { en: 'No mappings', de: 'Keine Zuordnungen', es: 'Sin asignaciones', fr: 'Aucune association' },
      wind_strength: { en: 'Wind Strength', de: 'Windstärke', es: 'Fuerza del viento', fr: 'Force du vent' },
      wind_direction: { en: 'Wind Direction', de: 'Windrichtung', es: 'Dirección del viento', fr: 'Direction du vent' },
      auto: { en: 'Auto (variable)', de: 'Auto (variabel)', es: 'Automático (variable)', fr: 'Auto (variable)' },
      left: { en: 'Left', de: 'Links', es: 'Izquierda', fr: 'Gauche' },
      right: { en: 'Right', de: 'Rechts', es: 'Derecha', fr: 'Droite' },
      color_mode: { en: 'Color Mode', de: 'Farbmodus', es: 'Modo de color', fr: 'Mode de couleur' },
      off: { en: 'Off', de: 'Aus', es: 'Desactivado', fr: 'Désactivé' },
      warm: { en: 'Warm', de: 'Warm', es: 'Cálido', fr: 'Chaud' },
      cool: { en: 'Cool', de: 'Cool', es: 'Frío', fr: 'Froid' },
      neon: { en: 'Neon', de: 'Neon', es: 'Neón', fr: 'Néon' },
      pastel: { en: 'Pastel', de: 'Pastel', es: 'Pastel', fr: 'Pastel' },
      test_rain: { en: 'Test Emoji Rain', de: 'Emoji Rain testen', es: 'Probar Emoji Rain', fr: 'Tester Emoji Rain' },
      test_gift_ball: { en: 'Test Gift Ball', de: 'Geschenk-Kugel testen', es: 'Probar bola de regalo', fr: 'Tester la boule cadeau' },
      test_heart_balloons: { en: 'Test Heart Balloons', de: 'Herzballons testen', es: 'Probar globos de corazones', fr: 'Tester les ballons-cœurs' }
    }
  }
};

function flatten(value, prefix = '', result = []) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child) && !Object.prototype.hasOwnProperty.call(child, 'en')) flatten(child, full, result);
    else result.push([full, child]);
  }
  return result;
}

let html = fs.readFileSync(page, 'utf8');
const replacements = new Map([
  ['<title>Emoji Rain Konfiguration - TikTok Stream Tool</title>', '<title data-i18n="webgpu_emoji_rain.hero.page_title">Emoji Rain Settings - TikTok Stream Tool</title>'],
  ['<p class="subtitle hero-subtitle">Physik-basierte Emoji-Animationen f&uuml;r TikTok Events</p>', '<p class="subtitle hero-subtitle" data-i18n="webgpu_emoji_rain.hero.subtitle">Physics-based emoji animations for TikTok events</p>'],
  ['<span id="hero-enabled-status">Deaktiviert</span>', '<span id="hero-enabled-status" data-i18n="webgpu_emoji_rain.hero.disabled">Disabled</span>'],
  ['<span class="hero-meta">Optimiert f&uuml;r Day / Night / CID / Vision / High Contrast</span>', '<span class="hero-meta" data-i18n="webgpu_emoji_rain.hero.optimized">Optimized for Day / Night / CID / Vision / High Contrast</span>'],
  ['>OBS HUD &ouml;ffnen</a>', ' data-i18n="webgpu_emoji_rain.hero.open_obs_hud">Open OBS HUD</a>'],
  ['<span class="hero-preview__label">Live Vorschau</span>', '<span class="hero-preview__label" data-i18n="webgpu_emoji_rain.hero.live_preview">Live Preview</span>'],
  ['<span class="summary-label">Visueller Modus</span>', '<span class="summary-label" data-i18n="webgpu_emoji_rain.hero.visual_mode">Visual Mode</span>'],
  ['<span class="summary-note">Look, Intensit&auml;t und Performance</span>', '<span class="summary-note" data-i18n="webgpu_emoji_rain.hero.visual_note">Look, intensity and performance</span>'],
  ['<span id="hero-obs-state" class="summary-note">Aktiviert</span>', '<span id="hero-obs-state" class="summary-note" data-i18n="webgpu_emoji_rain.hero.enabled">Enabled</span>'],
  ['<span class="summary-label">Performance</span>', '<span class="summary-label" data-i18n="webgpu_emoji_rain.hero.performance">Performance</span>'],
  ['<h2>TikTok Visual Effects Overlay</h2>', '<h2 data-i18n="webgpu_emoji_rain.ui.overlay">TikTok Visual Effects Overlay</h2>'],
  ['<label for="visual_mode">Visueller Modus</label>', '<label for="visual_mode" data-i18n="webgpu_emoji_rain.ui.visual_mode">Visual Mode</label>'],
  ['<h2>🍞 Toaster Modus (Schwache PCs)</h2>', '<h2 data-i18n="webgpu_emoji_rain.ui.toaster_title">Toaster Mode (Low-End PCs)</h2>'],
  ['<strong>Toaster Modus aktivieren</strong>', '<strong data-i18n="webgpu_emoji_rain.ui.toaster_enable">Enable Toaster Mode</strong>'],
  ['<div class="help-text">Optimiert für maximale Performance auf schwachen Systemen</div>', '<div class="help-text" data-i18n="webgpu_emoji_rain.ui.toaster_help">Optimized for maximum performance on weak systems</div>'],
  ['<span>Max. Emojis:</span>', '<span data-i18n="webgpu_emoji_rain.ui.max_emojis">Max. Emojis:</span>'],
  ['<span>Ziel-FPS:</span>', '<span data-i18n="webgpu_emoji_rain.ui.target_fps">Target FPS:</span>'],
  ['<span>Rotation:</span> Deaktiviert', '<span data-i18n="webgpu_emoji_rain.ui.rotation">Rotation: Disabled</span>'],
  ['<span>Wind:</span> Deaktiviert', '<span data-i18n="webgpu_emoji_rain.ui.wind">Wind: Disabled</span>'],
  ['<span>Rainbow/Pixel/Glow:</span> Deaktiviert', '<span data-i18n="webgpu_emoji_rain.ui.effects">Rainbow/Pixel/Glow: Disabled</span>'],
  ['<span>Burst Intensität:</span> Reduziert', '<span data-i18n="webgpu_emoji_rain.ui.burst">Burst Intensity: Reduced</span>'],
  ['<h2>🎮 OBS HUD Einstellungen</h2>', '<h2 data-i18n="webgpu_emoji_rain.ui.obs_settings">OBS HUD Settings</h2>'],
  ['<label for="obs_hud_preset">Auflösungs-Preset</label>', '<label for="obs_hud_preset" data-i18n="webgpu_emoji_rain.ui.resolution_preset">Resolution Preset</label>'],
  ['<option value="custom">Custom</option>', '<option value="custom" data-i18n="webgpu_emoji_rain.ui.custom">Custom</option>'],
  ['<div class="help-text">Wähle eine Standard-Auflösung oder Custom</div>', '<div class="help-text" data-i18n="webgpu_emoji_rain.ui.resolution_help">Choose a standard resolution or Custom</div>'],
  ['<label for="obs_hud_width">OBS HUD Breite (px)</label>', '<label for="obs_hud_width" data-i18n="webgpu_emoji_rain.ui.hud_width">OBS HUD Width (px)</label>'],
  ['<div class="help-text">Feste Breite für OBS Browser Source</div>', '<div class="help-text" data-i18n="webgpu_emoji_rain.ui.hud_width_help">Fixed width for the OBS browser source</div>'],
  ['<label for="obs_hud_height">OBS HUD Höhe (px)</label>', '<label for="obs_hud_height" data-i18n="webgpu_emoji_rain.ui.hud_height">OBS HUD Height (px)</label>'],
  ['<div class="help-text">Feste Höhe für OBS Browser Source</div>', '<div class="help-text" data-i18n="webgpu_emoji_rain.ui.hud_height_help">Fixed height for the OBS browser source</div>'],
  ['<label for="emoji_set">Emojis (durch Komma getrennt)</label>', '<label for="emoji_set" data-i18n="webgpu_emoji_rain.ui.emoji_set">Emojis (comma-separated)</label>'],
  ['<div class="help-text">Gib die Emojis ein, die zufällig gespawnt werden sollen</div>', '<div class="help-text" data-i18n="webgpu_emoji_rain.ui.emoji_set_help">Enter emojis to spawn at random</div>'],
  ['<label>Hochgeladene Bilder</label>', '<label data-i18n="webgpu_emoji_rain.ui.uploaded_images">Uploaded Images</label>'],
  ['Keine Bilder hochgeladen</div>', ' data-i18n="webgpu_emoji_rain.ui.no_images">No images uploaded</div>'],
  ['<label for="user_filter">Benutzer filtern</label>', '<label for="user_filter" data-i18n="webgpu_emoji_rain.ui.user_filter">Filter users</label>'],
  ['Keine Zuordnungen</div>', ' data-i18n="webgpu_emoji_rain.ui.no_mappings">No mappings</div>'],
  ['<label for="wind_strength">Windstärke</label>', '<label for="wind_strength" data-i18n="webgpu_emoji_rain.ui.wind_strength">Wind Strength</label>'],
  ['<label for="wind_direction">Windrichtung</label>', '<label for="wind_direction" data-i18n="webgpu_emoji_rain.ui.wind_direction">Wind Direction</label>'],
  ['<option value="auto">Auto (variabel)</option>', '<option value="auto" data-i18n="webgpu_emoji_rain.ui.auto">Auto (variable)</option>'],
  ['<option value="left">Links</option>', '<option value="left" data-i18n="webgpu_emoji_rain.ui.left">Left</option>'],
  ['<option value="right">Rechts</option>', '<option value="right" data-i18n="webgpu_emoji_rain.ui.right">Right</option>'],
  ['<label for="color_mode">Farbmodus</label>', '<label for="color_mode" data-i18n="webgpu_emoji_rain.ui.color_mode">Color Mode</label>'],
  ['<option value="off">Aus</option>', '<option value="off" data-i18n="webgpu_emoji_rain.ui.off">Off</option>'],
  ['<option value="warm">Warm</option>', '<option value="warm" data-i18n="webgpu_emoji_rain.ui.warm">Warm</option>'],
  ['<option value="cool">Cool</option>', '<option value="cool" data-i18n="webgpu_emoji_rain.ui.cool">Cool</option>'],
  ['<option value="neon">Neon</option>', '<option value="neon" data-i18n="webgpu_emoji_rain.ui.neon">Neon</option>'],
  ['<option value="pastel">Pastel</option>', '<option value="pastel" data-i18n="webgpu_emoji_rain.ui.pastel">Pastel</option>'],
  ['🧪 Emoji Rain testen', ' data-i18n="webgpu_emoji_rain.ui.test_rain">🧪 Test Emoji Rain'],
  ['🎁 Geschenk-Kugel testen', ' data-i18n="webgpu_emoji_rain.ui.test_gift_ball">🎁 Test Gift Ball'],
  ['&hearts; Herzballons testen', ' data-i18n="webgpu_emoji_rain.ui.test_heart_balloons">&hearts; Test Heart Balloons']
]);

for (const [from, to] of replacements) html = html.split(from).join(to);
fs.writeFileSync(page, html, 'utf8');

function setPath(target, key, value) {
  const parts = key.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

for (const lang of languages) {
  const file = path.join(localeDir, `${lang}.json`);
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, values] of flatten(entries)) setPath(locale, key, values[lang]);
  fs.writeFileSync(file, `${JSON.stringify(locale, null, 2)}\n`, 'utf8');
}

console.log(`WebGPU Emoji Rain locale markers repaired (${replacements.size} templates).`);
