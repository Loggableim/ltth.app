#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'ui', 'settings.html');
const localeDir = path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'locales');
const languages = ['en', 'de', 'es', 'fr'];
const translations = {
  page_title: { en: 'WebGPU Fireworks - Settings', de: 'WebGPU Fireworks – Einstellungen', es: 'WebGPU Fireworks – Ajustes', fr: 'WebGPU Fireworks – Réglages' },
  webgpu_obs_required: { en: 'WebGPU OBS required', de: 'WebGPU-OBS erforderlich', es: 'Se necesita OBS con WebGPU', fr: 'OBS WebGPU requis' },
  webgpu_obs_notice: { en: 'This plugin edition is intended exclusively for the Loggableim OBS WebGPU build. It is not supported in standard OBS.', de: 'Diese Plugin-Version ist ausschließlich für das Loggableim-OBS-WebGPU-Build vorgesehen. Standard-OBS wird nicht unterstützt.', es: 'Esta edición del plugin está pensada exclusivamente para la versión OBS WebGPU de Loggableim. No es compatible con OBS estándar.', fr: 'Cette édition du plugin est destinée exclusivement à la version OBS WebGPU de Loggableim. OBS standard n’est pas pris en charge.' },
  get_webgpu_build: { en: 'Get the required OBS WebGPU build', de: 'Erforderliches OBS-WebGPU-Build laden', es: 'Descargar la versión OBS WebGPU necesaria', fr: 'Télécharger la version OBS WebGPU requise' },
  renderer: { en: 'Renderer:', de: 'Renderer:', es: 'Renderizador:', fr: 'Moteur de rendu :' },
  adapter: { en: 'Adapter:', de: 'Adapter:', es: 'Adaptador:', fr: 'Adaptateur :' },
  particles: { en: 'Particles:', de: 'Partikel:', es: 'Partículas:', fr: 'Particules :' },
  audio_backend: { en: 'Audio backend:', de: 'Audio-Backend:', es: 'Backend de audio:', fr: 'Backend audio :' },
  visual_style: { en: 'Visual style:', de: 'Visualstil:', es: 'Estilo visual:', fr: 'Style visuel :' },
  copy_origin: { en: 'Copy origin', de: 'Origin kopieren', es: 'Copiar origen', fr: 'Copier l’origine' },
  test_audio: { en: 'Test launch + explosion audio', de: 'Start- und Explosionssound testen', es: 'Probar audio de lanzamiento y explosión', fr: 'Tester les sons de lancement et d’explosion' },
  performance_resolution: { en: 'Performance & Resolution', de: 'Performance & Auflösung', es: 'Rendimiento y resolución', fr: 'Performances et résolution' },
  orientation: { en: 'Orientation', de: 'Ausrichtung', es: 'Orientación', fr: 'Orientation' },
  target_fps: { en: 'Target FPS', de: 'Ziel-FPS', es: 'FPS objetivo', fr: 'FPS cible' },
  enable_queue: { en: 'Enable Queue System', de: 'Warteschlangensystem aktivieren', es: 'Activar sistema de cola', fr: 'Activer le système de file' }
};

let html = fs.readFileSync(page, 'utf8');
const replacements = [
  ['<title>WebGPU Fireworks - Settings</title>', '<title data-i18n="webgpu_fireworks.page_title">WebGPU Fireworks - Settings</title>'],
  ['<h2 class="text-lg font-bold text-cyan-200">WebGPU OBS required</h2>', '<h2 class="text-lg font-bold text-cyan-200" data-i18n="webgpu_fireworks.webgpu_obs_required">WebGPU OBS required</h2>'],
  ['<p class="text-sm text-cyan-50 mt-2">This plugin edition is intended exclusively for the Loggableim OBS WebGPU build. It is not supported in standard OBS.</p>', '<p class="text-sm text-cyan-50 mt-2" data-i18n="webgpu_fireworks.webgpu_obs_notice">This plugin edition is intended exclusively for the Loggableim OBS WebGPU build. It is not supported in standard OBS.</p>'],
  ['>Get the required OBS WebGPU build</a>', ' data-i18n="webgpu_fireworks.get_webgpu_build">Get the required OBS WebGPU build</a>'],
  ['<div>Renderer: <strong id="webgpu-runtime-state">Offline</strong></div>', '<div><span data-i18n="webgpu_fireworks.renderer">Renderer:</span> <strong id="webgpu-runtime-state">Offline</strong></div>'],
  ['<div>Adapter: <strong id="webgpu-adapter-state">Not connected</strong></div>', '<div><span data-i18n="webgpu_fireworks.adapter">Adapter:</span> <strong id="webgpu-adapter-state">Not connected</strong></div>'],
  ['<div>Particles: <strong id="webgpu-particle-state">0 active · 0 dropped</strong></div>', '<div><span data-i18n="webgpu_fireworks.particles">Particles:</span> <strong id="webgpu-particle-state">0 active · 0 dropped</strong></div>'],
  ['<div>Audio backend: <strong id="webgpu-audio-backend">None</strong></div>', '<div><span data-i18n="webgpu_fireworks.audio_backend">Audio backend:</span> <strong id="webgpu-audio-backend">None</strong></div>'],
  ['<div>Visual style: <strong id="webgpu-visual-style">Premium Hybrid</strong></div>', '<div><span data-i18n="webgpu_fireworks.visual_style">Visual style:</span> <strong id="webgpu-visual-style">Premium Hybrid</strong></div>'],
  ['>Copy origin</button>', ' data-i18n="webgpu_fireworks.copy_origin">Copy origin</button>'],
  ['>Test launch + explosion audio</button>', ' data-i18n="webgpu_fireworks.test_audio">Test launch + explosion audio</button>'],
  ['<h2 class="section-title text-xl font-bold mb-4">Performance &amp; Resolution</h2>', '<h2 class="section-title text-xl font-bold mb-4" data-i18n="webgpu_fireworks.performance_resolution">Performance &amp; Resolution</h2>'],
  ['<label class="block mb-2"><strong>Orientation</strong></label>', '<label class="block mb-2"><strong data-i18n="webgpu_fireworks.orientation">Orientation</strong></label>'],
  ['<label class="block mb-2"><strong>Target FPS</strong></label>', '<label class="block mb-2"><strong data-i18n="webgpu_fireworks.target_fps">Target FPS</strong></label>'],
  ['<label>Enable Queue System</label>', '<label data-i18n="webgpu_fireworks.enable_queue">Enable Queue System</label>']
];
for (const pair of replacements) html = html.split(pair[0]).join(pair[1]);
fs.writeFileSync(page, html, 'utf8');

function setNested(target, key, value) {
  if (!target.webgpu_fireworks) target.webgpu_fireworks = {};
  target.webgpu_fireworks[key] = value;
}
for (const language of languages) {
  const file = path.join(localeDir, language + '.json');
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of Object.keys(translations)) setNested(locale, key, translations[key][language]);
  fs.writeFileSync(file, JSON.stringify(locale, null, 2) + '\n', 'utf8');
}
console.log('WebGPU Fireworks locale markers repaired (' + replacements.length + ' templates).');
