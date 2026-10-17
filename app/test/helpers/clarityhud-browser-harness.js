'use strict';

// Local-only browser harness for the real ClarityHUD dashboard and overlays.
// Run from app/: ..\runtime\node\node.exe test\helpers\clarityhud-browser-harness.js
// It uses synthetic API/Socket.IO data and never constructs a TikTok connector.
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const settingsSchema = require(path.resolve(__dirname, '..', '..', 'plugins', 'clarityhud', 'lib', 'settings-schema'));

const appDir = path.resolve(__dirname, '..', '..');
const pluginDir = path.join(appDir, 'plugins', 'clarityhud');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
let shuttingDown = false;
let fallbackPostCount = 0;
let streams = [{
  index: 1,
  username: 'synthetic-secondary',
  displayName: 'Synthetic secondary stream',
  status: 'error',
  lastError: 'fallback_confirmation_required',
  confirmationRequired: true
}];

const settings = Object.fromEntries(
  ['chat', 'full', 'multi', 'stream'].map(dock => [dock, settingsSchema.getDefaults(dock)])
);

const history = [
  { type: 'chat', timestamp: 1700000000001, username: 'HistoryOld', comment: 'synthetic history 1', user: { uniqueId: 'historyold', nickname: 'HistoryOld' } },
  { type: 'chat', timestamp: 1700000000002, username: 'HistoryNew', comment: 'synthetic history 2', user: { uniqueId: 'historynew', nickname: 'HistoryNew' } }
];

app.use(express.json());
app.use('/plugins/clarityhud', express.static(pluginDir));
app.use('/js', express.static(path.join(appDir, 'public', 'js')));
app.use('/css', express.static(path.join(appDir, 'public', 'css')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(pluginDir, 'ui', 'main.html')));
app.get('/overlay/clarity/full', (req, res) => {
  if (req.query.contrastProbe !== '1') return res.sendFile(path.join(pluginDir, 'overlays', 'full.html'));
  const html = fs.readFileSync(path.join(pluginDir, 'overlays', 'full.html'), 'utf8');
  const probe = `<style>
    #harness-contrast-report{position:fixed;z-index:2147483647;top:8px;left:8px;max-width:440px;padding:12px;background:#fff;color:#111;border:2px solid #111;border-radius:6px;font:13px/1.4 monospace;white-space:pre-wrap}
  </style><output id="harness-contrast-report" aria-live="polite">Waiting for synthetic chat event…</output>
  <script>
    (() => {
      const output = document.getElementById('harness-contrast-report');
      const parseColor = value => {
        const match = value.match(/[\\d.]+/g);
        return match ? match.slice(0, 4).map(Number) : null;
      };
      const composite = (foreground, background) => {
        const color = parseColor(foreground);
        if (!color) return null;
        const alpha = color.length > 3 ? color[3] : 1;
        return color.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
      };
      const luminance = rgb => rgb.map(channel => channel / 255).map(channel =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      ).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const update = () => {
        const message = document.querySelector('.event-item .event-message');
        if (!message) return;
        const item = message.closest('.event-item');
        const messageStyle = getComputedStyle(message);
        const itemStyle = getComputedStyle(item);
        const rootStyle = getComputedStyle(document.documentElement);
        const opaqueBase = [0, 0, 0];
        const base = composite(itemStyle.backgroundColor, opaqueBase) || opaqueBase;
        const foreground = composite(messageStyle.color, base);
        const values = [luminance(foreground), luminance(base)].sort((a, b) => b - a);
        const ratio = (values[0] + 0.05) / (values[1] + 0.05);
        output.textContent = [
          'Computed Full HUD chat style',
          'theme: ' + (document.documentElement.dataset.theme || '(none)'),
          'body classes: ' + (document.body.className || '(none)'),
          'fontColor setting var: ' + rootStyle.getPropertyValue('--font-color').trim(),
          'message color: ' + messageStyle.color,
          'item background: ' + itemStyle.backgroundColor,
          'contrast vs black preview underlay: ' + ratio.toFixed(2) + ':1',
          'text stroke: ' + itemStyle.webkitTextStrokeWidth + ' ' + itemStyle.webkitTextStrokeColor,
          'event opacity: ' + itemStyle.opacity,
          'root outline vars: ' + rootStyle.getPropertyValue('--outline-width').trim() + ' ' + rootStyle.getPropertyValue('--outline-color').trim()
        ].join('\\n');
      };
      const observer = new MutationObserver(update);
      observer.observe(document.getElementById('overlay-container'), { childList: true, subtree: true });
      window.addEventListener('load', () => setTimeout(update, 800), { once: true });
    })();
  </script>`;
  return res.type('html').send(html.replace('</body>', `${probe}</body>`));
});
app.get('/overlay/clarity/chat', (_req, res) => res.sendFile(path.join(pluginDir, 'overlays', 'chat.html')));
app.get('/overlay/clarity/multi', (_req, res) => res.sendFile(path.join(pluginDir, 'overlays', 'multi.html')));
app.get('/overlay/clarity/stream', (_req, res) => res.sendFile(path.join(pluginDir, 'overlays', 'stream.html')));

app.get('/api/i18n/locales', (_req, res) => res.json({ locales: ['de', 'en'], defaultLocale: 'de' }));
app.get('/api/i18n/translations/:locale', (_req, res) => res.json({}));
app.get('/api/i18n/translations', (_req, res) => res.json({}));
app.get('/api/clarityhud/settings/:dock', (req, res) => res.json({ success: true, settings: settings[req.params.dock] || {} }));
app.get('/api/clarityhud/state/full', (_req, res) => res.json({ success: true, events: { chat: history } }));
app.get('/api/clarityhud/state/chat', (_req, res) => res.json({ success: true, events: { chat: history } }));
app.get('/api/clarityhud/multi/status', (_req, res) => res.json({ success: true, streams }));
app.get('/api/clarityhud/presets', (_req, res) => res.json({ success: true, presets: { builtin: [], custom: [] } }));
app.post('/api/clarityhud/multi/confirm-fallback/:index', (_req, res) => {
  fallbackPostCount += 1;
  streams = streams.map(stream => stream.index === Number(_req.params.index)
    ? { ...stream, status: 'synthetic-confirmed', lastError: null, confirmationRequired: false }
    : stream);
  process.stdout.write(`HARNESS_SYNTHETIC_FALLBACK_CONFIRM_POST=${fallbackPostCount}\n`);
  res.json({ success: true, streams });
});
app.get('/__harness/status', (_req, res) => res.json({ fallbackPostCount, connectorCount: 0 }));

io.on('connection', socket => {
  socket.emit('clarityhud.multi.status', streams);
  const timer = setTimeout(() => {
    socket.emit('clarityhud.update.chat', {
      timestamp: 1700000000003,
      username: 'LiveModerator',
      comment: 'synthetic realtime message',
      isModerator: true,
      isSubscriber: true,
      user: { uniqueId: 'livemod', nickname: 'LiveModerator' }
    });
  }, 450);
  socket.once('disconnect', () => clearTimeout(timer));
});

app.get('/', (_req, res) => res.type('html').send(`
  <!doctype html><title>ClarityHUD local synthetic harness</title>
  <main style="font:16px sans-serif;padding:24px">
    <h1>ClarityHUD local synthetic harness</h1>
    <p>Only repository UI assets and in-memory synthetic fixtures are served here.</p>
    <ul><li><a href="/overlay/clarity/full">Full overlay</a></li>
    <li><a href="/overlay/clarity/chat">Chat overlay</a></li>
    <li><a href="/dashboard">Dashboard and fallback consent</a></li></ul>
  </main>`));

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`HARNESS_SHUTDOWN=${signal}\n`);
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`CLARITYHUD_HARNESS_URL=http://127.0.0.1:${server.address().port}\n`);
  process.stdout.write('CLARITYHUD_HARNESS_DATA=synthetic-only; no TikTok connector; confirm endpoint is a local success stub only\n');
});
