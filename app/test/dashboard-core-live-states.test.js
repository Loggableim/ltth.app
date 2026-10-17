'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'dashboard.js'),
  'utf8'
);
const navigationSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'navigation.js'),
  'utf8'
);
const english = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'en.json'), 'utf8'));

function section(startMarker, endMarker) {
  const start = dashboardSource.indexOf(startMarker);
  const end = dashboardSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not locate dashboard source section: ${startMarker}`);
  return dashboardSource.slice(start, end);
}

const socketSource = section('function initializeSocketListeners() {', 'function isAnimazingPalHostSpeechSource');
const transportStatusSource = section('function setDashboardTransportStatus(status) {', 'function updateConnectionStatus(status, data = {}) {');
const connectionSource = section('function updateConnectionStatus(status, data = {}) {', '// ========== STATS ==========');
const statsSource = section('function updateStats(stats) {', '// ========== STREAM TIME DEBUG ==========');
const eventLogSource = section('// ========== EVENT LOG ==========', '// ========== STATS MENU NAVIGATION ==========');
const navigationStatusStart = navigationSource.indexOf('function updateConnectionStatus(status, data = {}) {');
const navigationStatusEnd = navigationSource.indexOf('// ========== WINDOW CONTROLS', navigationStatusStart);
if (navigationStatusStart < 0 || navigationStatusEnd < 0) throw new Error('Could not locate navigation status source');
const navigationStatusSource = navigationSource.slice(navigationStatusStart, navigationStatusEnd);
const panelStart = dashboardSource.indexOf('function trackEventForStatsMenu(type, data) {');
const panelEnd = dashboardSource.indexOf('function getActivityIcon(activity)', panelStart);
if (panelStart < 0 || panelEnd < 0) throw new Error('Could not locate dashboard live stats panel source');
const panelSource = dashboardSource.slice(panelStart, panelEnd);

function createFixture() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="connection-status" class="status-badge status-disconnected"><i data-lucide="circle"></i><span>Disconnected</span></span>
    <span id="transport-status" class="status-badge status-error" role="status" aria-live="polite" hidden></span>
    <div id="connection-info"></div>
    <button id="connect-btn"><span>Connect</span></button><button id="disconnect-btn" disabled>Disconnect</button>
    <span id="stat-runtime">--:--:--</span><span id="stat-viewers">0</span><span id="stat-likes">0</span>
    <span id="stat-coins">0</span><span id="stat-followers">0</span><span id="stat-gifts">0</span>
    <span id="event-stats-runtime">--:--:--</span><span id="event-stats-viewers">0</span>
    <span id="event-stats-likes">0</span><span id="event-stats-coins">0</span>
    <span id="event-stats-followers">0</span><span id="event-stats-gifts">0</span>
    <span id="event-stats-chat">0</span><span id="panel-chat-count">0</span>
    <div id="chat-list"><p class="stats-panel-empty">No chat messages yet</p></div>
    <table><tbody id="event-log"></tbody></table>
  </body></html>`, { runScripts: 'outside-only' });
  const { window } = dom;
  const socketHandlers = new Map();
  window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  window.socket = { on: (event, handler) => socketHandlers.set(event, handler) };
  window.lucide = { createIcons: jest.fn() };
  window.i18n = {
    initialized: true,
    t(key, params = {}) {
      const value = key.split('.').reduce((current, part) => current && current[part], english);
      return typeof value === 'string'
        ? value.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match)
        : key;
    }
  };
  window.NavigationManager = { updateConnectionStatus: jest.fn() };
  window.applySidebarIconAccents = jest.fn();
  window.restoreConnectButton = () => {
    window.document.getElementById('connect-btn').disabled = false;
    window.document.getElementById('connect-btn').textContent = 'Connect';
  };
  window.escapeHtml = value => {
    const element = window.document.createElement('span');
    element.textContent = String(value);
    return element.innerHTML;
  };
  window.eval(`
    const MAX_PANEL_ITEMS = 50;
    let activeStatsPanel = 'chat';
    const statsMenuData = {
      viewers: new Map(), chat: [], likes: [], coins: [], followers: [], subscribers: [], gifts: [],
      counts: { viewers: 0, chat: 0, likes: 0, coins: 0, followers: 0, subscribers: 0, gifts: 0 }
    };
    ${eventLogSource}
    ${panelSource}
    ${transportStatusSource}
    ${connectionSource}
    ${statsSource}
    ${navigationStatusSource.replace(
      'function updateConnectionStatus(status, data = {}) {',
      'function updateNavigationConnectionStatus(status, data = {}) {'
    )}
    ${socketSource}
    window.NavigationManager.updateConnectionStatus = updateNavigationConnectionStatus;
    window.dashboardStateFixture = { initializeSocketListeners, updateConnectionStatus, updateStats };
  `);
  window.dashboardStateFixture.initializeSocketListeners();
  return { dom, window, socketHandlers };
}

describe('Dashboard core live states', () => {
  test('renders TikTok connected/disconnected, initial/live stats, and chat from synthetic socket events', () => {
    const fixture = createFixture();
    const { window, socketHandlers } = fixture;
    try {
      expect(window.document.getElementById('stat-viewers').textContent).toBe('0');
      expect(window.document.querySelector('#chat-list .stats-panel-empty')).not.toBeNull();

      socketHandlers.get('tiktok:status')({ status: 'connected', username: 'synthetic-creator' });
      expect(window.document.getElementById('connection-status').classList.contains('status-connected')).toBe(true);
      expect(window.document.getElementById('connection-info').textContent).toContain('@synthetic-creator');
      expect(window.document.getElementById('connect-btn').disabled).toBe(true);
      expect(window.document.getElementById('disconnect-btn').disabled).toBe(false);

      socketHandlers.get('tiktok:stats')({
        viewers: 17,
        likes: 42,
        totalCoins: 9,
        followers: 3,
        gifts: 2,
        streamDuration: 65
      });
      expect(window.document.getElementById('stat-viewers').textContent).toBe('17');
      expect(window.document.getElementById('stat-likes').textContent).toBe('42');
      expect(window.document.getElementById('stat-runtime').textContent).toBe('00:01:05');

      socketHandlers.get('tiktok:event')({
        type: 'chat',
        data: { username: 'synthetic-viewer', nickname: 'Fixture Viewer', message: 'synthetic hello' }
      });
      expect(window.document.querySelector('#chat-list .chat-item').textContent).toContain('synthetic hello');
      expect(window.document.getElementById('panel-chat-count').textContent).toBe('1');

      socketHandlers.get('tiktok:status')({ status: 'disconnected' });
      expect(window.document.getElementById('connection-status').classList.contains('status-disconnected')).toBe(true);
      expect(window.document.getElementById('connect-btn').disabled).toBe(false);
      expect(window.document.getElementById('disconnect-btn').disabled).toBe(true);
      expect(window.document.getElementById('stat-runtime').textContent).toBe('--:--:--');
      // Current behavior retains the last stats snapshot and chat rows for the next session.
      expect(window.document.getElementById('stat-viewers').textContent).toBe('17');
      expect(window.document.querySelector('#chat-list .chat-item').textContent).toContain('synthetic hello');
    } finally {
      window.close();
    }
  });

  test('marks transport loss and retained stats/chat as stale until TikTok status returns', () => {
    const fixture = createFixture();
    const { window, socketHandlers } = fixture;
    try {
      socketHandlers.get('tiktok:status')({ status: 'connected', username: 'synthetic-creator' });
      socketHandlers.get('tiktok:stats')({ viewers: 17, likes: 42, totalCoins: 9, followers: 3, gifts: 2, streamDuration: 65 });
      socketHandlers.get('tiktok:event')({
        type: 'chat',
        data: { username: 'synthetic-viewer', nickname: 'Fixture Viewer', message: 'synthetic hello' }
      });
      socketHandlers.get('disconnect')('transport close');

      const transportStatus = window.document.getElementById('transport-status');
      expect(transportStatus.hidden).toBe(false);
      expect(transportStatus.dataset.state).toBe('disconnected');
      expect(transportStatus.textContent).toContain('connection lost');
      expect(window.document.getElementById('connection-status').classList.contains('status-disconnected')).toBe(true);
      expect(window.document.getElementById('connect-btn').disabled).toBe(false);
      expect(window.document.getElementById('disconnect-btn').disabled).toBe(true);
      expect(window.document.getElementById('stat-viewers').textContent).toBe('17');
      expect(window.document.getElementById('stat-viewers').dataset.live).toBe('false');
      expect(window.document.getElementById('chat-list').dataset.live).toBe('false');
      expect(window.document.querySelector('#chat-list .chat-item').textContent).toContain('synthetic hello');

      socketHandlers.get('connect')();
      expect(transportStatus.dataset.state).toBe('reconnected');
      expect(transportStatus.textContent).toContain('Waiting for live TikTok status');
      expect(window.document.getElementById('stat-viewers').dataset.live).toBe('pending');

      socketHandlers.get('tiktok:status')({ status: 'connected', username: 'synthetic-creator' });
      expect(transportStatus.hidden).toBe(true);
      expect(transportStatus.hasAttribute('data-state')).toBe(false);
      expect(window.document.getElementById('connection-status').classList.contains('status-connected')).toBe(true);
      expect(window.document.getElementById('stat-viewers').textContent).toBe('17');
      expect(window.document.getElementById('stat-viewers').getAttribute('aria-label')).toContain('waiting for live update');

      socketHandlers.get('tiktok:stats')({ viewers: 19, likes: 44, totalCoins: 11, followers: 4, gifts: 3, streamDuration: 70 });
      expect(window.document.getElementById('stat-viewers').textContent).toBe('19');
      expect(window.document.getElementById('stat-viewers').dataset.live).toBe('true');
      expect(window.document.getElementById('stat-viewers').hasAttribute('data-base-aria-label')).toBe(false);
    } finally {
      window.close();
    }
  });
});
