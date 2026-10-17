'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-source-inventory.json'), 'utf8'));
const locale = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-locale-expectations.json'), 'utf8'));
const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-acceptance-matrix.json'), 'utf8'));
const serverLines = fs.readFileSync(path.join(ROOT, 'app/server.js'), 'utf8').split(/\r?\n/);

const HANDLERS = Object.freeze({
  'clarityhud': { file: 'app/plugins/clarityhud/main.js', path: '/overlay/clarity/full' },
  'emoji-rain': { file: 'app/plugins/emoji-rain/main.js', path: '/emoji-rain/obs-hud' },
  'flame-overlay': { file: 'app/plugins/flame-overlay/main.js', path: '/flame-overlay/overlay' },
  'goals': { file: 'app/plugins/goals/backend/api.js', path: '/goals/overlay' },
  'quiz-show': { file: 'app/plugins/quiz-show/main.js', path: '/quiz-show/overlay' },
  'schnorrbecher': { file: 'app/plugins/schnorrbecher/main.js', path: '/overlay/coincup' },
  'stream-monsters': { file: 'app/plugins/stream-monsters/backend/streammonsters/routes.js', path: '/stream-monsters/overlay' },
  'visual-fx-frame-webgpu': { file: 'app/plugins/visual-fx-frame-webgpu/main.js', path: '/visual-fx-frame-webgpu/overlay' },
  'webgpu-fireworks': { file: 'app/plugins/webgpu-fireworks/main.js', path: '/webgpu-fireworks/overlay' },
  'webgpu-weather-control': { file: 'app/plugins/webgpu-weather-control/main.js', path: '/webgpu-weather-control/overlay' },
  'music-bot': { file: 'app/plugins/music-bot/main.js', path: '/plugins/music-bot/overlay.html' },
  'fireworks': { file: 'app/plugins/fireworks/main.js', path: '/fireworks/overlay' },
  'talking-heads': { file: 'app/plugins/talking-heads/main.js', path: '/talking-heads/overlay' }
});

function lineFor(file, needle) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  return index < 0 ? null : index + 1;
}

function scriptsFor(htmlPath) {
  const absolute = path.join(ROOT, htmlPath);
  if (!fs.existsSync(absolute)) return [];
  return [...fs.readFileSync(absolute, 'utf8').matchAll(/<script[^>]+src=["']([^"']+)/gi)].map((match) => match[1]);
}

function staticKind(urlPath) {
  if (urlPath.startsWith('/plugins/stream-monsters/')) return 'plugin-static-alias-before-global-plugin-static';
  if (urlPath.startsWith('/plugins/')) return 'global-plugin-static';
  return 'unresolved';
}

function build() {
  const byPlugin = new Map(locale.records.map((record) => [record.plugin, record]));
  const pluginGroups = new Map();
  for (const item of inventory.items) {
    if (!pluginGroups.has(item.plugin)) pluginGroups.set(item.plugin, []);
    pluginGroups.get(item.plugin).push(item);
  }

  const profiles = [...pluginGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([plugin, cases]) => {
    const localeRecord = byPlugin.get(plugin);
    const first = cases[0];
    const url = new URL(first.overlayUrl);
    const route = HANDLERS[plugin];
    let routeResolution;
    let handler = null;
    let servedEntry = localeRecord.sourceFiles.find((file) => file.endsWith('.html')) || null;

    if (route) {
      const line = lineFor(route.file, `'${route.path}'`)
        ?? lineFor(route.file, `"${route.path}"`);
      routeResolution = 'registered-plugin-get-handler';
      handler = { method: 'GET', path: route.path, source: route.file, line };
    } else {
      routeResolution = staticKind(first.overlayPath);
      handler = {
        method: 'GET', path: first.overlayPath,
        source: 'app/server.js',
        line: serverLines.findIndex((line) => line.includes("app.use('/plugins', express.static(pluginsDir))")) + 1
      };
    }

    if (plugin === 'stream-monsters') {
      const file = route.file;
      handler.line = lineFor(file, "this.registerRoute('GET', '/stream-monsters/overlay'");
    }
    if (plugin === 'emoji-rain') {
      handler.line = lineFor(route.file, "this.api.registerRoute('get', routePath");
    }
    if (plugin === 'quiz-show') {
      routeResolution = 'global-plugin-static';
      handler = {
        method: 'GET', path: first.overlayPath,
        source: 'app/server.js',
        line: serverLines.findIndex((line) => line.includes("app.use('/plugins', express.static(pluginsDir))")) + 1
      };
    }
    if (plugin === 'webgpu-fireworks') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/webgpu-fireworks/overlay'");
    if (plugin === 'webgpu-weather-control') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/webgpu-weather-control/overlay'");
    if (plugin === 'visual-fx-frame-webgpu') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/visual-fx-frame-webgpu/overlay'");
    if (plugin === 'flame-overlay') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/flame-overlay/overlay'");
    if (plugin === 'goals') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/goals/overlay'");
    if (plugin === 'clarityhud') handler.line = lineFor(route.file, "this.api.registerRoute('GET', '/overlay/clarity/full'");
    if (plugin === 'schnorrbecher') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/overlay/coincup'");
    if (plugin === 'music-bot') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/plugins/music-bot/overlay'");
    if (plugin === 'talking-heads') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/talking-heads/overlay'");
    if (plugin === 'fireworks') handler.line = lineFor(route.file, "this.api.registerRoute('get', '/fireworks/overlay'");

    let servedSource = servedEntry;
    if (plugin === 'emoji-rain') servedSource = 'app/plugins/emoji-rain/obs-hud.html';
    const testStatus = plugin === 'emoji-rain' ? 'actual-handler-double-passed' : 'source-resolution-only';
    const specificNote = plugin === 'emoji-rain'
      ? 'The GET selects obs-hud.html. HTML loads i18n-client.js, Matter.js and emoji-rain-obs-hud.js; it does not load emoji-rain-engine.js. Inventory matrix entry is wrong.'
        : plugin === 'talking-heads'
          ? 'The inventory URL /plugins/talking-heads/overlay.html is the static HTML. A distinct registered handler exists at /talking-heads/overlay and serves the alternate overlay.html; inventory URL does not hit that handler.'
        : plugin === 'fireworks'
            ? 'The plugin GET route /fireworks/overlay sends this same HTML; the canonical /plugins/fireworks/overlay.html URL reaches it through static middleware.'
        : plugin === 'music-bot'
              ? 'The canonical URL itself is a registered GET handler and sends the same overlay.html file.'
              : '';

    return {
      plugin,
      localeCases: cases.map((item) => ({ locale: item.locale, url: item.overlayUrl })),
      routeResolution,
      handler,
      servedHtml: servedSource,
      htmlScriptSources: scriptsFor(servedSource),
      localeContract: {
        queryBehavior: localeRecord.localeQuery,
        expectedVisibleCopy: localeRecord.visibleTextExpectation,
        localeFiles: localeRecord.localeFiles || `app/plugins/${plugin}/locales/{de,en,es,fr}.json`
      },
      matrixEntry: matrix.items.find((item) => item.plugin === plugin)?.entry || null,
      verification: testStatus,
      note: specificNote
    };
  });

  return {
    schemaVersion: 1,
    status: 'source-audit-and-isolated-handler-double-only-no-server-no-obs',
    generatedFrom: [
      'docs/coordination/obs-104-source-inventory.json',
      'docs/coordination/obs-locale-expectations.json',
      'docs/coordination/obs-104-acceptance-matrix.json'
    ],
    denominator: { canonicalPluginProfiles: 25, localesPerProfile: 4, generatedInventoryCases: 100 },
    excludedSupplement: { plugin: 'sidekick', countedInCanonicalProfiles: false, reason: 'The prior locale register stores it separately; it is outside the 25-profile inventory.' },
    routingOrder: {
      pluginRoutes: 'Plugin-registered routes are mounted before static plugin-file middleware.',
      source: 'app/server.js',
      pluginStaticAliasLine: serverLines.findIndex((line) => line.includes("mountPluginStaticAliases(app, pluginsDir, 'stream-monsters')")) + 1,
      globalPluginStaticLine: serverLines.findIndex((line) => line.includes("app.use('/plugins', express.static(pluginsDir))")) + 1,
      streamMonstersAliasSource: 'app/modules/plugin-static-aliases.js'
    },
    profiles
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`);
}

module.exports = { build };
