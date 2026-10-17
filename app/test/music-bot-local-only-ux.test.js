'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'plugins/music-bot');
const uiPath = path.join(pluginRoot, 'assets/ui.js');
const ui = fs.readFileSync(uiPath, 'utf8');
const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');

const locales = {
  de: ['Music-Bot-Daten nur lokal verfügbar', 'Öffne das Dashboard direkt auf diesem Gerät'],
  en: ['Music Bot data is available locally only', 'Open the dashboard directly on this device'],
  es: ['Los datos de Music Bot solo están disponibles localmente', 'Abre el panel directamente en este dispositivo'],
  fr: ['Les données de Music Bot sont disponibles uniquement en local', 'Ouvrez le tableau de bord directement sur cet appareil']
};

test('localized local-only copy exists in all supported plugin locales', () => {
  for (const [locale, [title, message]] of Object.entries(locales)) {
    const catalog = JSON.parse(fs.readFileSync(path.join(pluginRoot, `locales/${locale}.json`), 'utf8'));
    const shell = catalog.plugins['music-bot'].music_bot.ui.shell;
    expect(shell.dataLocalOnlyTitle).toBe(title);
    expect(shell.dataLocalOnlyMessage.startsWith(message)).toBe(true);
  }
  expect(ui).toMatch(/dataLocalOnlyTitle dataLocalOnlyMessage/);
});

test('central local-read denial and existing config-local denial use one localized notice', () => {
  expect(ui).toMatch(/function showMusicBotLocalOnlyNotice\(\)[\s\S]*?if \(musicBotLocalOnlyNoticeShown\) return;[\s\S]*?dataLocalOnlyTitle[\s\S]*?dataLocalOnlyMessage/);
  expect(ui).toMatch(/\['MUSIC_BOT_LOCAL_READS_ONLY', 'MUSIC_BOT_CONFIG_LOCAL_ONLY'\]\.includes\(payload\?\.code\)/);
  expect(ui).toMatch(/error: tr\('dataLocalOnlyMessage'[\s\S]*?httpStatus: res\.status,[\s\S]*?localOnly: true/);
  expect(ui).toMatch(/configData\?\.localOnly \|\| configData\?\.code === 'MUSIC_BOT_CONFIG_LOCAL_ONLY'[\s\S]*?showMusicBotLocalOnlyNotice\(\)/);
});

test('parallel and later-panel denials show one polite localized notice without exposing response text or stealing focus', async () => {
  const localeCatalog = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales/de.json'), 'utf8')).plugins['music-bot'].music_bot.ui.shell;
  const dom = new JSDOM('<main><input id="focus-target"><div id="musicbot-toast-container" aria-live="polite" aria-atomic="true"></div></main>');
  const focusTarget = dom.window.document.getElementById('focus-target');
  const toastContainer = dom.window.document.getElementById('musicbot-toast-container');
  focusTarget.focus();
  const canary = 'raw-server-error-canary';
  const context = {
    musicBotLocalOnlyNoticeShown: false,
    tr: (key, fallback) => localeCatalog[key] || fallback,
    fetch: async () => ({
      status: 403,
      json: async () => ({ success: false, code: 'MUSIC_BOT_LOCAL_READS_ONLY', error: canary })
    })
  };
  expect(html).toMatch(/<div id="musicbot-toast-container"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  const toastStart = ui.indexOf('  function renderToastRecord(record)');
  const toastEnd = ui.indexOf('  function updatePreviewFrame(song)', toastStart);
  const getStart = ui.indexOf('  function showMusicBotLocalOnlyNotice()');
  const getEnd = ui.indexOf('  async function post(path, body)', getStart);
  expect(toastStart).toBeGreaterThanOrEqual(0);
  expect(toastEnd).toBeGreaterThan(toastStart);
  expect(getStart).toBeGreaterThanOrEqual(0);
  expect(getEnd).toBeGreaterThan(getStart);
  context.document = dom.window.document;
  context.toastContainer = toastContainer;
  context.activeToastRecords = [];
  context.escapeHtml = value => String(value);
  context.setTimeout = () => 0;
  vm.runInNewContext(`${ui.slice(toastStart, toastEnd)}\n${ui.slice(getStart, getEnd)}\nthis.api = { get };`, context);

  const results = await Promise.all([context.api.get('/status'), context.api.get('/queue'), context.api.get('/history')]);
  expect(toastContainer.querySelectorAll('.musicbot-toast')).toHaveLength(1);
  expect(toastContainer.getAttribute('aria-live')).toBe('polite');
  expect(dom.window.document.activeElement).toBe(focusTarget);
  expect(toastContainer.textContent).toContain('Music-Bot-Daten nur lokal verfügbar');
  expect(toastContainer.textContent).toContain('Öffne das Dashboard direkt auf diesem Gerät');
  for (const result of results) {
    expect(result.localOnly).toBe(true);
    expect(result.error).toBe(localeCatalog.dataLocalOnlyMessage);
    expect(JSON.stringify(result)).not.toContain(canary);
  }
  await context.api.get('/bans');
  expect(toastContainer.querySelectorAll('.musicbot-toast')).toHaveLength(1);
  dom.window.close();
});

test('local-only history response does not fall through to generic load failure', () => {
  expect(ui).toMatch(/if \(requestGeneration !== historyRequestGeneration \|\| historyData\?\.localOnly\) return;[\s\S]*?const rows = historyData\?\.history/);
});
