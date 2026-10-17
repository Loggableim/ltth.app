'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ViewerXPPlugin = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl');

const appRoot = path.resolve(__dirname, '..');
const pluginRoot = path.join(appRoot, 'plugins');
const viewerRoot = path.join(pluginRoot, 'milestone-leaderboard', 'vendor', 'viewer-leaderboard');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(appRoot, 'public')));
app.use('/plugins', express.static(pluginRoot));

const sidekickEvents = [
  {
    type: 'chat', ts: Date.now() - 1000, nickname: 'Review Viewer',
    payload: { comment: 'A synthetic message long enough to truncate safely', commentTruncated: true }
  },
  {
    type: 'gift', ts: Date.now(), nickname: 'Review Viewer',
    payload: { giftName: 'Synthetic Rose' }
  }
];

app.get('/overlay/sidekick/hud', (_req, res) => {
  res.sendFile(path.join(pluginRoot, 'sidekick', 'overlay', 'sidekick-hud.html'));
});
app.get('/overlay/viewer-xp/xp-bar', (_req, res) => res.sendFile(path.join(viewerRoot, 'overlays', 'xp-bar.html')));
app.get('/overlay/viewer-xp/leaderboard', (_req, res) => res.sendFile(path.join(viewerRoot, 'overlays', 'leaderboard.html')));
app.get('/overlay/viewer-xp/level-up', (_req, res) => res.sendFile(path.join(viewerRoot, 'overlays', 'level-up.html')));
app.get('/plugins/viewer-leaderboard/viewer-xp-i18n.js', (_req, res) => res.sendFile(path.join(viewerRoot, 'viewer-xp-i18n.js')));
app.get('/plugins/viewer-leaderboard/locales/:locale.json', (req, res) => {
  if (!['de', 'en', 'es', 'fr'].includes(req.params.locale)) return res.sendStatus(404);
  res.sendFile(path.join(pluginRoot, 'milestone-leaderboard', 'locales', `${req.params.locale}.json`));
});
app.get('/api/i18n/translations/:locale', (req, res) => {
  if (!['de', 'en', 'es', 'fr'].includes(req.params.locale)) return res.sendStatus(404);
  res.sendFile(path.join(appRoot, 'locales', `${req.params.locale}.json`));
});
app.get('/api/sidekick/public-status', (_req, res) => res.json({
  success: true,
  status: { connected: true, muted: false, chatsPerMinute: 12, totalGifts: 4, totalFollows: 2, activeViewers: 7 }
}));
app.get('/api/sidekick/public-events', (_req, res) => res.json({ success: true, events: sidekickEvents }));

const viewerProfile = {
  username: 'Prüfungs視聴者', name_color: '#9c6bff', title: 'Test Viewer', level: 12,
  xp: 1240, total_xp_earned: 1240, xp_progress: 40, xp_for_next_level: 200,
  xp_progress_percent: 20, profilePictureUrl: null
};
const viewerPlugin = Object.create(ViewerXPPlugin.prototype);
viewerPlugin.api = {
  getSocketIO: () => io,
  registerSocket: () => true,
  log: () => {}
};
viewerPlugin.db = {
  getViewerProfile: username => username === viewerProfile.username ? { ...viewerProfile } : null,
  getTopViewers: () => [
    { username: viewerProfile.username, name_color: viewerProfile.name_color, title: viewerProfile.title, level: 12, xp: 1240, total_xp_earned: 1240 },
    { username: 'Second Synthetic Viewer', name_color: '#66ccaa', title: '', level: 4, xp: 310, total_xp_earned: 310 }
  ],
  getCoinBalance: () => ({ coins: 9999, total_coins_earned: 99999 }),
  getSetting: () => false
};
viewerPlugin.emitIFTTTEvent = () => {};
viewerPlugin.emitThrottledLeaderboardUpdate = () => {};
viewerPlugin.registerWebSocketHandlers();

app.post('/__review__/emit-xp-update', (_req, res) => {
  viewerPlugin.emitXPUpdate(viewerProfile.username, 25, 'review_fixture', { userId: 'private-canary', apiKey: 'must-not-appear' });
  res.json({ success: true });
});
app.post('/__review__/emit-level-up', (_req, res) => {
  viewerPlugin.emitLevelUp(viewerProfile.username, 11, 12, {
    title: 'Synthetic reward', name_color: '#9c6bff',
    announcement_message: 'Welcome {username}', special_effects: { animation: 'gold' },
    coin_reward: 9999
  });
  res.json({ success: true });
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  process.stdout.write(`PUBLIC_OVERLAY_REVIEW_URL=http://127.0.0.1:${port}\n`);
  process.stdout.write('Synthetic fixtures only. Keep this server local; stop it with Ctrl+C.\n');
});

function shutdown() {
  io.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
