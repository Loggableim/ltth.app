'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const MusicBotPlugin = require('../plugins/music-bot/main');

const pluginRoot = path.join(__dirname, '../plugins/music-bot');
const uiHtml = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
const uiScript = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
const configCanary = 'fixture-private-config-canary';

function createConfigHandler() {
  const routes = new Map();
  const api = {
    getSocketIO: () => ({ emit() {}, on() {}, off() {} }),
    getDatabase: () => ({}),
    registerRoute(method, routePath, handler) {
      routes.set(`${method.toUpperCase()}:${routePath}`, handler);
    },
    registerSocket() {},
    registerTikTokEvent() {},
    log() {},
    emit() {}
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config = {
    playback: { mpvPath: 'C:\\fixture\\mpv.exe' },
    resolver: { ytdlpPath: 'C:\\fixture\\yt-dlp.exe' },
    autoDJ: { playlistUrls: ['https://fixture.invalid/list?key=private'] },
    moderation: { blockedKeywords: [configCanary] },
    monetization: { payToPlayGiftCatalog: ['fixture-private-gift'], payToPlayMinCoins: 7182 },
    unknownInternalField: 'fixture-private-unknown'
  };
  plugin._registerRoutes();
  return { config: plugin.config, handler: routes.get('GET:/api/plugins/music-bot/config') };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function callConfigRoute(handler, remoteAddress, headers = {}) {
  const response = createResponse();
  await handler({ socket: { remoteAddress }, headers }, response);
  return response;
}

function lookup(root, key) {
  return key.split('.').reduce((value, part) => value?.[part], root);
}

async function bootRemoteUi(locale, routeResponse) {
  const localePath = path.join(pluginRoot, 'locales', `${locale}.json`);
  const translations = JSON.parse(fs.readFileSync(localePath, 'utf8'));
  const fetchCalls = [];
  const dom = new JSDOM(uiHtml, {
    url: 'http://remote.example/plugins/music-bot/ui',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.io = () => ({ on() {}, emit() {} });
      window.fetch = async (...args) => {
        const [url] = args;
        fetchCalls.push([String(url), ...args.slice(1)]);
        if (String(url) === '/api/plugins/music-bot/config') {
          return { status: routeResponse.statusCode, json: async () => routeResponse.body };
        }
        return { status: 200, json: async () => ({ success: true }) };
      };
      window.open = () => {};
      Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => {} }
      });
      window.i18n = {
        ready: Promise.resolve(),
        t: key => lookup(translations, key) ?? key,
        updateDOM() {}
      };
    }
  });

  dom.window.eval(uiScript);
  await new Promise(resolve => setTimeout(resolve, 40));
  return { dom, fetchCalls, translations };
}

test('registered config GET returns its full DTO to direct IPv4 and IPv6 loopback only', async () => {
  const { config, handler } = createConfigHandler();
  const ipv4 = await callConfigRoute(handler, '127.0.0.1');
  const ipv6 = await callConfigRoute(handler, '::1');

  assert.equal(ipv4.statusCode, 200);
  assert.deepEqual(ipv4.body, { success: true, config });
  assert.equal(ipv6.statusCode, 200);
  assert.deepEqual(ipv6.body, { success: true, config });
});

test('tokenless LAN receives a canary-free local-only denial', async () => {
  const { handler } = createConfigHandler();
  const response = await callConfigRoute(handler, '192.0.2.80');

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'MUSIC_BOT_CONFIG_LOCAL_ONLY');
  assert.doesNotMatch(JSON.stringify(response.body), /fixture-private|mpv\.exe|fixture\.invalid|payToPlay/);
});

test('remote dashboard displays the localized local-only notice without sending an admin token', async t => {
  const { handler } = createConfigHandler();
  const routeResponse = await callConfigRoute(handler, '192.0.2.80');
  for (const locale of ['de', 'en', 'es', 'fr']) {
    await t.test(locale, async () => {
      const { dom, fetchCalls, translations } = await bootRemoteUi(locale, routeResponse);
      try {
        const ui = lookup(translations, 'plugins.music-bot.music_bot.ui.shell');
        const toastText = dom.window.document.getElementById('musicbot-toast-container').textContent;
        assert.ok(toastText.includes(ui.configLocalOnlyTitle), `missing ${locale} title`);
        assert.ok(toastText.includes(ui.configLocalOnlyMessage), `missing ${locale} message`);
        const configCalls = fetchCalls.filter(([url]) => url === '/api/plugins/music-bot/config');
        assert.ok(configCalls.length > 0, 'config GET was not sent');
        assert.ok(configCalls.every(call => call.length === 1), 'config GET must not attach token options');
      } finally {
        dom.window.close();
      }
    });
  }
});

test('Music Bot UI contains no admin-token input or token header transport', () => {
  assert.doesNotMatch(uiHtml, /admin.?token|x-ltth-admin-token/i);
  assert.doesNotMatch(uiScript, /x-ltth-admin-token|Authorization\s*:\s*['\"]Bearer/i);
});
