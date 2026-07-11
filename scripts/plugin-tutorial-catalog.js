'use strict';

// Single source of truth for the public plugin tutorial catalogue. The build
// script reads the current manifests so a new runtime plugin cannot silently
// miss documentation.
const fs = require('fs');
const path = require('path');

const LOCALES = ['de', 'en', 'es', 'fr'];

const ROUTES = {
  'advanced-timer': ['/dashboard.html?view=plugins', '/advanced-timer/ui', '/advanced-timer/ui', '/advanced-timer/ui'],
  animazingpal: ['/dashboard.html?view=plugins', '/animazingpal/ui', '/animazingpal/ui', '/animazingpal/ui'],
  'api-bridge': ['/dashboard.html?view=plugins', '/dashboard.html?view=plugins', '/dashboard.html?view=plugins', '/dashboard.html?view=plugins'],
  chatango: ['/dashboard.html?view=plugins', '/chatango/ui', '/chatango/ui', '/chatango/ui'],
  clarityhud: ['/dashboard.html?view=plugins', '/clarityhud/ui', '/clarityhud/ui', '/plugins/clarityhud/overlays/full.html'],
  coinbattle: ['/dashboard.html?view=plugins', '/coinbattle/ui', '/coinbattle/ui', '/plugins/coinbattle/overlay/overlay.html'],
  'config-import': ['/dashboard.html?view=plugins', '/config-import/ui', '/config-import/ui', '/config-import/ui'],
  'data-source': ['/dashboard.html?view=plugins', '/data-source/ui', '/data-source/ui', '/data-source/ui'],
  'emoji-rain': ['/dashboard.html?view=plugins', '/emoji-rain/ui', '/emoji-rain/ui', '/plugins/emoji-rain/overlay.html'],
  fireworks: ['/dashboard.html?view=plugins', '/fireworks/ui', '/fireworks/ui', '/plugins/fireworks/overlay.html'],
  'flame-overlay': ['/dashboard.html?view=plugins', '/flame-overlay/ui', '/flame-overlay/ui', '/plugins/flame-overlay/overlay.html'],
  'game-engine': ['/dashboard.html?view=plugins', '/game-engine/ui', '/game-engine/ui', '/plugins/game-engine/overlay/game-hud.html'],
  gcce: ['/dashboard.html?view=plugins', '/gcce/ui', '/gcce/ui', '/plugins/gcce/overlay-hud.html'],
  'gift-catalog': ['/dashboard.html?view=plugins', '/dashboard.html?view=plugins', '/dashboard.html?view=plugins', '/dashboard.html?view=plugins'],
  goals: ['/dashboard.html?view=plugins', '/goals/ui', '/goals/ui', '/plugins/goals/overlay/index.html'],
  'interactive-story': ['/dashboard.html?view=plugins', '/interactive-story/ui', '/interactive-story/ui', '/plugins/interactive-story/overlay.html'],
  'milestone-leaderboard': ['/dashboard.html?view=plugins', '/leaderboard/ui', '/leaderboard/ui', '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/gifter-leaderboard-overlay.html'],
  'minecraft-connect': ['/dashboard.html?view=plugins', '/minecraft-connect/ui', '/minecraft-connect/ui', '/plugins/minecraft-connect/overlay/minecraft_overlay.html'],
  multicam: ['/dashboard.html?view=plugins', '/multicam/ui', '/multicam/ui', '/multicam/ui'],
  'music-bot': ['/dashboard.html?view=plugins', '/plugins/music-bot/ui', '/plugins/music-bot/ui', '/plugins/music-bot/overlay.html'],
  openshock: ['/dashboard.html?view=plugins', '/openshock/ui', '/openshock/ui', '/plugins/openshock/overlay/openshock_overlay.html'],
  'osc-bridge': ['/dashboard.html?view=plugins', '/osc-bridge/ui', '/osc-bridge/ui', '/osc-bridge/ui'],
  'quiz-show': ['/dashboard.html?view=plugins', '/quiz-show/ui', '/quiz-show/ui', '/plugins/quiz-show/quiz_show_overlay.html'],
  sidekick: ['/dashboard.html?view=plugins', '/sidekick/ui', '/sidekick/ui', '/plugins/sidekick/overlay/sidekick-hud.html'],
  soundboard: ['/dashboard.html?view=plugins', '/soundboard/ui', '/soundboard/ui', '/soundboard/ui'],
  spotlight: ['/dashboard.html?view=plugins', '/spotlight/ui', '/spotlight/ui', '/plugins/spotlight/overlays/chatter.html'],
  streamalchemy: ['/dashboard.html?view=plugins', '/streamalchemy/ui', '/streamalchemy/ui', '/plugins/streamalchemy/overlay.html'],
  'stt-ticker': ['/dashboard.html?view=plugins', '/stt-ticker/ui', '/stt-ticker/ui', '/plugins/stt-ticker/overlay/ticker.html'],
  'talking-heads': ['/dashboard.html?view=plugins', '/talking-heads/ui', '/talking-heads/ui', '/plugins/talking-heads/overlay.html'],
  'thermal-printer': ['/dashboard.html?view=plugins', '/thermal-printer/ui', '/thermal-printer/ui', '/thermal-printer/ui'],
  toptier: ['/dashboard.html?view=plugins', '/toptier/ui', '/toptier/ui', '/plugins/toptier/overlay.html'],
  tts: ['/dashboard.html?view=plugins', '/tts/ui', '/tts/ui', '/tts/ui'],
  vdoninja: ['/dashboard.html?view=plugins', '/vdoninja/ui', '/vdoninja/ui', '/vdoninja/ui'],
  'weather-control': ['/dashboard.html?view=plugins', '/weather-control/ui', '/weather-control/ui', '/plugins/weather-control/overlay.html'],
  'webgpu-emoji-rain': ['/dashboard.html?view=plugins', '/webgpu-emoji-rain/ui', '/webgpu-emoji-rain/ui', '/plugins/webgpu-emoji-rain/overlay.html'],
  'webgpu-fireworks': ['/dashboard.html?view=plugins', '/webgpu-fireworks/ui', '/webgpu-fireworks/ui', '/plugins/webgpu-fireworks/overlay.html'],
  'store-admin': ['/dashboard.html?view=plugins', '/dashboard.html?view=plugins', '/dashboard.html?view=plugins', '/dashboard.html?view=plugins']
};

const PROFILES = {
  visual: ['clarityhud', 'emoji-rain', 'fireworks', 'flame-overlay', 'goals', 'spotlight', 'stt-ticker', 'toptier', 'weather-control', 'webgpu-emoji-rain', 'webgpu-fireworks', 'talking-heads'],
  game: ['advanced-timer', 'coinbattle', 'game-engine', 'interactive-story', 'quiz-show', 'streamalchemy'],
  integration: ['animazingpal', 'chatango', 'minecraft-connect', 'multicam', 'music-bot', 'openshock', 'osc-bridge', 'thermal-printer', 'vdoninja'],
  audio: ['soundboard', 'tts'],
  system: ['api-bridge', 'config-import', 'data-source', 'gcce', 'gift-catalog', 'milestone-leaderboard', 'sidekick', 'store-admin']
};

function profileFor(id) {
  return Object.entries(PROFILES).find(([, ids]) => ids.includes(id))?.[0] || 'system';
}

function displayName(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') return String(value.de || value.en || value.name || fallback);
  return String(fallback);
}

function readStore(repoRoot) {
  const parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
  return new Map((parsed.plugins || []).map((plugin) => [plugin.id, plugin]));
}

function readManifests(repoRoot) {
  const root = path.join(repoRoot, 'app', 'plugins');
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'plugin.json'))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function tutorialSteps(profile, name) {
  const copy = {
    de: {
      activate: ['Plugin aktivieren', `Öffne den Plugin Manager, suche ${name} und aktiviere das Plugin. Prüfe, dass der Status auf Aktiv steht.`, 'Der Plugin-Status ist aktiv und der Einstieg ist erreichbar.'],
      open: ['Arbeitsbereich öffnen', `Öffne anschließend den eigenen Arbeitsbereich von ${name}. Lies die sichtbaren Hinweise, bevor du Werte speicherst.`, 'Die Konfiguration wird ohne Ladefehler angezeigt.'],
      configure: ['Sicher konfigurieren', 'Lege zuerst nur die kleinste sinnvolle Konfiguration an. Verwende Testwerte und keine echten Zugangsdaten oder Produktionsziele.', 'Die Änderung ist gespeichert und jederzeit nachvollziehbar.'],
      verify: ['Kontrolliert testen', 'Führe den eingebauten Test oder eine lokale Vorschau aus. Prüfe das erwartete Ergebnis, bevor du den Ablauf im LIVE-Stream verwendest.', 'Die Vorschau bzw. der Test zeigt das erwartete Ergebnis.']
    },
    en: {
      activate: ['Enable the plugin', `Open Plugin Manager, find ${name}, and enable it. Confirm that its status is Active.`, 'The plugin is active and its entry point is available.'],
      open: ['Open the workspace', `Open the dedicated ${name} workspace. Read the visible guidance before saving any values.`, 'The configuration loads without errors.'],
      configure: ['Configure safely', 'Start with the smallest useful configuration. Use test values and never place real credentials or production targets in the tutorial setup.', 'The change is saved and can be reviewed.'],
      verify: ['Run a controlled test', 'Use the built-in test or a local preview. Confirm the expected result before using the workflow in a LIVE stream.', 'The preview or test shows the expected result.']
    },
    es: {
      activate: ['Activar el plugin', `Abre el gestor de plugins, busca ${name} y actívalo. Confirma que el estado sea Activo.`, 'El plugin está activo y su punto de entrada está disponible.'],
      open: ['Abrir el espacio de trabajo', `Abre el espacio de trabajo de ${name}. Lee las indicaciones visibles antes de guardar valores.`, 'La configuración se carga sin errores.'],
      configure: ['Configurar de forma segura', 'Empieza con la configuración útil más pequeña. Usa valores de prueba y nunca incluyas credenciales reales ni destinos de producción.', 'El cambio queda guardado y puede revisarse.'],
      verify: ['Realizar una prueba controlada', 'Usa la prueba integrada o una vista previa local. Confirma el resultado antes de usar el flujo en un directo.', 'La prueba o vista previa muestra el resultado esperado.']
    },
    fr: {
      activate: ['Activer le plugin', `Ouvrez le gestionnaire de plugins, trouvez ${name} et activez-le. Vérifiez que son état est Actif.`, 'Le plugin est actif et son point d’entrée est disponible.'],
      open: ['Ouvrir l’espace de travail', `Ouvrez l’espace de travail de ${name}. Lisez les indications affichées avant d’enregistrer des valeurs.`, 'La configuration se charge sans erreur.'],
      configure: ['Configurer en sécurité', 'Commencez par la configuration utile minimale. Utilisez des valeurs de test et ne saisissez jamais de secrets ou de cibles de production.', 'La modification est enregistrée et peut être contrôlée.'],
      verify: ['Tester de manière contrôlée', 'Lancez le test intégré ou un aperçu local. Confirmez le résultat avant d’utiliser le flux pendant un LIVE.', 'Le test ou l’aperçu affiche le résultat attendu.']
    }
  };
  const order = profile === 'visual' ? ['activate', 'open', 'configure', 'verify'] : ['activate', 'open', 'configure', 'verify'];
  return Object.fromEntries(order.map((key) => [key, copy]));
}

function localized(profile, name, category, access) {
  const profileTerms = {
    visual: { de: 'ein Overlay mit visueller Reaktion', en: 'an overlay and visual response', es: 'un overlay y una respuesta visual', fr: 'un overlay et une réponse visuelle' },
    game: { de: 'eine interaktive Zuschauer-Erfahrung', en: 'an interactive viewer experience', es: 'una experiencia interactiva para espectadores', fr: 'une expérience interactive pour les spectateurs' },
    integration: { de: 'eine externe Integration', en: 'an external integration', es: 'una integración externa', fr: 'une intégration externe' },
    audio: { de: 'einen Audio- und Sprachablauf', en: 'an audio and voice workflow', es: 'un flujo de audio y voz', fr: 'un flux audio et vocal' },
    system: { de: 'einen System- und Verwaltungsablauf', en: 'a system and administration workflow', es: 'un flujo de sistema y administración', fr: 'un flux système et administration' }
  }[profile];
  return {
    de: { summary: `Mit ${name} richtest du ${profileTerms.de} ein. Diese Anleitung führt sicher von Aktivierung bis zum lokalen Test.`, requirements: `Zugriff: ${access}. Nutze für diese Anleitung ein Testprofil; externe Geräte, Dienste und LIVE-Ausgaben bleiben deaktiviert.`, trouble: 'Wenn eine Oberfläche nicht lädt, aktiviere das Plugin erneut, aktualisiere den Browser und prüfe den Plugin-Status im Dashboard.' },
    en: { summary: `${name} sets up an ${profileTerms.en}. This guide safely covers activation through local testing.`, requirements: `Access: ${access}. Use a test profile for this guide; keep external devices, services, and LIVE outputs disabled.`, trouble: 'If an interface does not load, enable the plugin again, refresh the browser, and check its status in the dashboard.' },
    es: { summary: `${name} permite configurar ${profileTerms.es}. Esta guía cubre de forma segura la activación y la prueba local.`, requirements: `Acceso: ${access}. Usa un perfil de prueba; mantén desactivados los dispositivos, servicios y salidas de directo.`, trouble: 'Si una interfaz no carga, activa de nuevo el plugin, actualiza el navegador y comprueba su estado en el panel.' },
    fr: { summary: `${name} permet de configurer ${profileTerms.fr}. Ce guide couvre en sécurité l’activation et le test local.`, requirements: `Accès : ${access}. Utilisez un profil de test ; gardez les appareils, services et sorties LIVE désactivés.`, trouble: 'Si une interface ne se charge pas, réactivez le plugin, actualisez le navigateur et vérifiez son état dans le tableau de bord.' }
  };
}

function buildCatalog(repoRoot) {
  const store = readStore(repoRoot);
  const manifests = readManifests(repoRoot);
  const tutorials = manifests.map((manifest) => {
    const storeItem = store.get(manifest.id);
    const profile = profileFor(manifest.id);
    const access = storeItem?.accessType || manifest.devStatus || 'local plugin';
    const name = displayName(manifest.name, manifest.id);
    const steps = tutorialSteps(profile, name);
    return {
      id: manifest.id,
      name,
      category: storeItem?.category || manifest.category || 'plugin',
      access,
      devStatus: manifest.devStatus || 'available',
      profile,
      storeAvailable: Boolean(storeItem),
      routes: ROUTES[manifest.id] || Array(4).fill('/dashboard.html?view=plugins'),
      localized: localized(profile, name, storeItem?.category || manifest.category || 'plugin', access),
      steps
    };
  });
  const admin = store.get('store-admin');
  tutorials.push({
    id: 'store-admin', name: displayName(admin?.name, 'Store Admin'), category: admin?.category || 'utility', access: admin?.accessType || 'admin-only', devStatus: 'admin-only', profile: 'system', storeAvailable: true,
    routes: ROUTES['store-admin'], localized: localized('system', displayName(admin?.name, 'Store Admin'), admin?.category || 'utility', admin?.accessType || 'admin-only'), steps: tutorialSteps('system', displayName(admin?.name, 'Store Admin'))
  });
  return tutorials.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { LOCALES, buildCatalog };
