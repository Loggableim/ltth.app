'use strict';

const fs = require('fs');
const path = require('path');

const SPEC_VERSION = '2026-07-11-cid-v1';
const LOCALES = ['de', 'en', 'es', 'fr'];
const ASSET_PATTERN = /(?:https:\/\/ltth\.app)?(?<asset>\/screenshots\/features\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp))/g;

const CORE_ROUTES = {
  'dashboard': '/dashboard.html',
  'dashboard-main': '/dashboard.html',
  'alerts': '/dashboard.html?view=alerts',
  'flows': '/ifttt-flow-editor.html',
  'flows-editor': '/ifttt-flow-editor.html',
  'overlays': '/ifttt-hud.html',
  'plugin-system': '/dashboard.html?view=plugins',
  'plugins': '/dashboard.html?view=plugins',
  'security': '/dashboard.html?view=settings',
  'settings': '/dashboard.html?view=settings',
};

const PLUGIN_ROUTES = {
  'advanced-timer': '/advanced-timer/ui',
  'animazingpal': '/animazingpal/ui',
  'api-bridge-admin': '/dashboard.html?view=plugins',
  'chatango': '/chatango/ui',
  'clarityhud': '/clarityhud/ui',
  'coinbattle': '/coinbattle/ui',
  'config-import': '/config-import/ui',
  'emoji-rain': '/emoji-rain/ui',
  'fireworks': '/fireworks/ui',
  'flame-overlay': '/flame-overlay/ui',
  'game-engine': '/game-engine/ui',
  'gcce': '/gcce/ui',
  'gcce-hud': '/gcce/ui',
  'gift-milestone': '/gift-milestone/ui',
  'goals': '/goals/ui',
  'goals-overlay': '/goals/ui',
  'interactive-story': '/dashboard.html?view=plugins',
  'lastevent': '/plugins/spotlight/ui/main.html',
  'lastevent-spotlight': '/plugins/spotlight/ui/main.html',
  'milestone-leaderboard': '/leaderboard/ui',
  'multicam': '/multicam/ui',
  'music-bot': '/plugins/music-bot/ui',
  'openshock': '/openshock/ui',
  'osc-bridge': '/osc-bridge/ui',
  'plugin-chatango-dashboard': '/chatango/ui',
  'plugin-minecraft-connect-night': '/minecraft-connect/ui',
  'plugin-minecraft-connect-vision': '/minecraft-connect/ui',
  'quiz-show': '/quiz-show/ui',
  'slot-machine': '/game-engine/ui',
  'soundboard': '/soundboard/ui',
  'soundboard-detail': '/soundboard/ui',
  'spotlight': '/spotlight/ui',
  'stream-alchemy': '/streamalchemy/ui',
  'stt-ticker': '/stt-ticker/ui',
  'stt-ticker-night': '/stt-ticker/ui',
  'stt-ticker-overlay-url': '/stt-ticker/ui',
  'stt-ticker-capture-obs-url': '/stt-ticker/capture',
  'stt-ticker-vision-impaired': '/stt-ticker/ui',
  'talking-heads': '/talking-heads/ui',
  'thermal-printer': '/thermal-printer/ui',
  'toptier': '/toptier/ui',
  'tts': '/tts/ui',
  'tts-admin': '/tts/ui',
  'tts-settings': '/tts/ui',
  'vdoninja': '/vdoninja/ui',
  'viewer-leaderboard': '/leaderboard/ui',
  'viewer-profiles-night': '/dashboard.html?view=plugins',
  'viewer-profiles-contrast': '/dashboard.html?view=plugins',
  'viewer-profiles-vision-impaired': '/dashboard.html?view=plugins',
  'viewer-xp': '/viewer-xp/ui',
  'viewer-xp-leaderboard': '/viewer-xp/ui',
  'weather-control': '/weather-control/ui',
  'webgpu-weather-control': '/webgpu-weather-control/ui',
  'webgpu-emoji-rain': '/webgpu-emoji-rain/ui',
  'webgpu-emoji-rain-dashboard': '/webgpu-emoji-rain/ui',
};

function collectPublicAssets(repoRoot) {
  const files = [
    ...fs.readdirSync(repoRoot).filter((name) => /\.(html|js|json|css)$/.test(name)).map((name) => path.join(repoRoot, name)),
    ...['features', 'downloads', '_partials', 'js', 'css'].flatMap((dir) => {
      const root = path.join(repoRoot, dir);
      if (!fs.existsSync(root)) return [];
      return walk(root);
    }),
  ];
  const assets = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(ASSET_PATTERN)) assets.add(match.groups.asset);
  }
  return [...assets].sort();
}

function walk(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.(html|js|json|css)$/.test(entry.name)) result.push(full);
  }
  return result;
}

function assetId(asset) {
  return path.basename(asset, path.extname(asset));
}

function routeFor(id) {
  return PLUGIN_ROUTES[id] || CORE_ROUTES[id] || '/dashboard.html';
}

function buildSpec(repoRoot) {
  const assets = collectPublicAssets(repoRoot);
  return {
    version: SPEC_VERSION,
    source: 'current-workspace',
    theme: 'cid',
    locales: LOCALES,
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    assets: assets.map((asset) => {
      const id = assetId(asset);
      return {
        id,
        canonical: asset,
        route: routeFor(id),
        state: id.includes('night') || id.includes('contrast') || id.includes('vision-impaired') ? 'cid-accessibility-layout' : 'default-demo',
        viewport: id.startsWith('live-')
          ? { width: 1280, height: 720, deviceScaleFactor: 1 }
          : { width: 1280, height: 800, deviceScaleFactor: 1 },
      };
    }),
  };
}

module.exports = { SPEC_VERSION, LOCALES, buildSpec, collectPublicAssets };
