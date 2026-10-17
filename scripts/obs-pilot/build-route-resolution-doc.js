'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./build-route-resolution');

const ROOT = path.resolve(__dirname, '../..');
const map = build();
const profiles = map.profiles;
const emoji = profiles.find((item) => item.plugin === 'emoji-rain');
const lines = [
  '# OBS route resolution (source audit)',
  '',
  'This record resolves the canonical 25-profile inventory to its first Express route or static middleware, served HTML, linked scripts, and locale expectation. The four locales are grouped per profile; this is not an OBS acceptance result. The 100 locale cases and the separate Sidekick supplemental are left outside the 25-profile denominator.',
  '',
  '## Routing order',
  '',
  `The app loads plugin handlers before static plugin files. Stream Monsters alias static is mounted at [server.js](/app/server.js:${map.routingOrder.pluginStaticAliasLine}); generic /plugins static follows at [server.js](/app/server.js:${map.routingOrder.globalPluginStaticLine}). Non-/plugins handler routes are registered on per-plugin Express routers. Source registration is not a runtime HTTP probe.`,
  '',
  '## Profile mapping',
  '',
  '| Profile | Canonical paths | Resolution | Handler / middleware | Served HTML | Locale behavior |',
  '|---|---|---|---|---|---|'
];

for (const profile of profiles) {
  const paths = [...new Set(profile.localeCases.map((entry) => {
    const url = new URL(entry.url);
    return url.pathname + url.search;
  }))];
  const target = `${profile.handler.source}:${profile.handler.line || '?'}`;
  const locale = `${profile.localeContract.queryBehavior}; ${profile.localeContract.expectedVisibleCopy}`
    .replaceAll('|', '\\|').replaceAll('\n', ' ');
  lines.push(`| ${profile.plugin} | ${paths.join('<br>')} | ${profile.routeResolution} | [${target}](/${target}) | ${profile.servedHtml} | ${locale} |`);
}

lines.push(
  '',
  '## Concrete findings and owner plan',
  '',
  '### EmojiRain',
  '',
  `- Actual registered GET [main.js](/${emoji.handler.source}:${emoji.handler.line}) selects app/plugins/emoji-rain/obs-hud.html when it exists, with overlay.html fallback only if it is absent.`,
  '- Served HUD scripts: `/js/i18n-client.js`, `/js/matter.min.js`, `/socket.io/socket.io.js`, `/js/emoji-rain-obs-hud.js?v=heart-balloons-pop-3`. The HUD does not include `/js/emoji-rain-engine.js`; a source comment in its renderer only says to keep toaster presets aligned with that separate engine.',
  '- Matrix-owner fix plan: change the EmojiRain profile `entry` in `scripts/obs-pilot/build-obs-104-matrix.js` to `app/plugins/emoji-rain/obs-hud.html → app/public/js/emoji-rain-obs-hud.js` and regenerate the matrix. Keep its 4 locale cases/100 total intact. No matrix owner files were edited here.',
  '',
  '### Known aliases that do not match the canonical URL',
  '',
  '- Fireworks registers `/fireworks/overlay`, while the canonical `/plugins/fireworks/overlay.html` is resolved by static middleware. Both point to `app/plugins/fireworks/overlay.html`.',
  '- Talking Heads registers `/talking-heads/overlay` and `/overlay/talking-heads`; its canonical `/plugins/talking-heads/overlay.html` is static. Both serve the same HTML file, but only route aliases hit the handler.',
  '- Music Bot registers `/plugins/music-bot/overlay` (without `.html`), while the canonical `.html` URL is static.',
  '',
  '## Locale expectation',
  '',
  'Locale behavior per profile is copied from [obs-locale-expectations.json](/docs/coordination/obs-locale-expectations.json). It distinguishes translated chrome from runtime/user content. Existing hardcoded/incomplete copy (for example Goals renderer text, TopTier board labels, WebGPU EmojiRain runtime status, WebGPU Weather labels, Schnorrbecher German-only labels) remain an OBS expected limitation. This task does not advance full UI localization. Sidekick remains a separate supplemental record and is not in the 25 profile list.',
  '',
  '## Handler double and verification',
  '',
  '- `node scripts/obs-pilot/test/route-resolution.test.js` — 2/2 passed. The test stubs route/middleware registration, does not call plugin `init()`, invokes the actual registered EmojiRain handler, and verifies its selected HTML plus script/i18n references.',
  '- The other 25 profiles are source-resolved from the installed HTML files, route declarations, static middleware order, locale expectations, and existing inventory/matrix source. This is not runtime HTTP, browser, or OBS proof.',
  '- No server, VM, listener, connector, OBS, or product process was started. No public registry, route, traversal behavior, GET projection, locale implementation, inventory, or acceptance matrix was changed.',
  '',
  '## Risks and remaining ownership',
  '',
  '- The route map is source-level: plugin enablement, duplicate custom routes, and the full app router order were not exercised over HTTP. Static file existence and source mapping do not guarantee packaged files are present in another installation.',
  '- Matrix owner should correct EmojiRain’s entry source. This source-level route audit does not support any OBS capture claim.',
  '- Existing locale gaps remain as listed in the locale expectation field; translation content beyond route/entry mapping was not changed.',
  ''
);

fs.writeFileSync(path.join(ROOT, 'docs/coordination/obs-route-resolution.md'), lines.join('\n'));
