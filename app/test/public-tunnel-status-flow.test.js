'use strict';

jest.mock('../modules/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../modules/public-overlay-release-event-policy', () => ({
  createPublicReleaseEventGuard: () => () => true
}));

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { JSDOM } = require('jsdom');
const NetworkManager = require('../modules/network-manager');
const { protectPublicSocket } = require('../modules/public-overlay-access');
const {
  render: renderTunnelStatus,
  copyTunnelURL,
  stop: stopTunnel
} = require('../public/js/network-overlay-tunnel');

const XP_BAR_FILE = path.join(
  __dirname,
  '../plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html'
);
const SECRET_CANARY = 'PUBLIC_TUNNEL_PRIVATE_CANARY';

function createChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = jest.fn(() => true);
  return child;
}

function createNetworkManager(children) {
  return new NetworkManager({ getSetting() {}, setSetting() {} }, {
    spawnImpl: jest.fn(() => children.shift()),
    overlayTunnelTimeoutMs: 1000,
    overlayTunnelKillTimeoutMs: 100,
    cloudflaredBinaryManager: {
      ensureInstalled: jest.fn().mockResolvedValue('synthetic-cloudflared-path'),
      getQuickTunnelConfigPath: () => 'NUL'
    }
  });
}

async function startTunnel(manager, child, hostname) {
  const starting = manager.ensureOverlayQuickTunnel(3000);
  await new Promise(resolve => setImmediate(resolve));
  child.stderr.write(`https://${hostname}.trycloudflare.com\n`);
  return starting;
}

function createProfile(username, progressPercent) {
  return {
    username,
    name_color: '#12ABEF',
    title: 'Synthetic Viewer',
    level: 4,
    xp_progress: progressPercent,
    xp_for_next_level: 100,
    xp_progress_percent: progressPercent,
    profilePictureUrl: null,
    user_id: SECRET_CANARY,
    settings: { privateValue: SECRET_CANARY },
    apiKey: SECRET_CANARY
  };
}

function createPublicConnection(hostname, profileFor) {
  const client = new EventEmitter();
  client.connected = true;
  client.receiveFromServer = (eventName, ...args) => {
    if (!client.connected) return false;
    return EventEmitter.prototype.emit.call(client, eventName, ...args);
  };

  const serverEvents = new EventEmitter();
  let packetGuard = null;
  const serverSocket = {
    handshake: { headers: { host: hostname } },
    data: {},
    join: jest.fn(),
    use: middleware => { packetGuard = middleware; },
    on: (...args) => serverEvents.on(...args),
    emit: (eventName, ...args) => client.receiveFromServer(eventName, ...args)
  };

  protectPublicSocket({ socket: serverSocket, logger: { warn: jest.fn() } });
  serverEvents.on('viewer-xp:public-profile:request', username => {
    serverSocket.emit('viewer-xp:public-profile', profileFor(username));
  });

  client.emit = (eventName, payload) => {
    let blocked = null;
    packetGuard([eventName, payload], error => { blocked = error || null; });
    if (blocked) return false;
    return serverEvents.emit(eventName, payload);
  };
  client.disconnect = () => {
    if (!client.connected) return;
    client.connected = false;
    EventEmitter.prototype.emit.call(client, 'disconnect', 'transport close');
  };
  return { client, serverSocket };
}

function mountXPBar(url, connection) {
  const html = fs.readFileSync(XP_BAR_FILE, 'utf8');
  const dom = new JSDOM(html, {
    url: `${url}/overlay/viewer-xp/xp-bar?username=PublicOverlayQA&autoHide=false`,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  window.io = () => connection.client;
  window.ViewerXpI18n = {
    text: (_key, fallback, params = {}) => String(fallback).replace(/\{(\w+)\}/g, (_match, key) => params[key] ?? _match)
  };
  window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  for (const script of window.document.querySelectorAll('script:not([src])')) {
    window.eval(script.textContent);
  }
  return dom;
}

function createStatusElements() {
  const dom = new JSDOM(`
    <div id="network-overlay-tunnel-status"></div>
    <div id="network-overlay-tunnel-url"><span id="network-overlay-tunnel-url-text"></span></div>
    <button id="network-overlay-tunnel-copy"></button>
    <button id="network-overlay-tunnel-stop"></button>
    <div id="network-overlay-tunnel-error"></div>
  `);
  const getElementById = id => dom.window.document.getElementById(id);
  const render = status => renderTunnelStatus(status, { getElementById });
  return { dom, getElementById, render };
}

function getOverlayStatus(manager) {
  return {
    active: Boolean(manager.overlayTunnelProcess && manager.overlayTunnelURL),
    starting: Boolean(manager.overlayTunnelStarting),
    url: manager.overlayTunnelURL,
    lastError: manager.overlayTunnelLastError
  };
}

describe('synthetic Quick Tunnel status flow', () => {
  test('URL, public renderer update, disconnect, new URL/reconnect, copy and stop stay in sync', async () => {
    const firstChild = createChild();
    const secondChild = createChild();
    const manager = createNetworkManager([firstChild, secondChild]);
    const statusView = createStatusElements();
    const rendererDoms = [];
    const clipboardWrite = jest.fn().mockResolvedValue(undefined);
    let firstConnection;
    let secondConnection;

    try {
      const firstResult = await startTunnel(manager, firstChild, 'fixture-first');
      expect(firstResult.tunnelURL).toBe('https://fixture-first.trycloudflare.com');
      expect(firstResult.reused).toBe(false);
      statusView.render(getOverlayStatus(manager));
      expect(statusView.getElementById('network-overlay-tunnel-url-text').textContent)
        .toBe(firstResult.tunnelURL);

      firstConnection = createPublicConnection('fixture-first.trycloudflare.com', username => createProfile(username, 40));
      const firstDom = mountXPBar(firstResult.tunnelURL, firstConnection);
      rendererDoms.push(firstDom);
      expect(firstDom.window.document.getElementById('xpBar').style.width).toBe('40%');
      expect(firstDom.window.document.documentElement.outerHTML).not.toContain(SECRET_CANARY);

      firstConnection.serverSocket.emit('viewer-xp:public-update', {
        username: 'PublicOverlayQA',
        amount: 8,
        profile: createProfile('PublicOverlayQA', 52)
      });
      expect(firstDom.window.document.getElementById('xpBar').style.width).toBe('52%');

      firstConnection.client.disconnect();
      const disconnectedUpdates = jest.fn();
      firstConnection.client.on('viewer-xp:public-update', disconnectedUpdates);
      expect(firstConnection.serverSocket.emit('viewer-xp:public-update', {
        username: 'PublicOverlayQA', amount: 1,
        profile: createProfile('PublicOverlayQA', 53)
      })).toBe(false);
      expect(disconnectedUpdates).not.toHaveBeenCalled();

      firstChild.exitCode = 1;
      firstChild.emit('exit', 1);
      statusView.render(getOverlayStatus(manager));
      expect(statusView.getElementById('network-overlay-tunnel-url').style.display).toBe('none');
      expect(statusView.getElementById('network-overlay-tunnel-copy').disabled).toBe(true);

      const secondResult = await startTunnel(manager, secondChild, 'fixture-second');
      expect(secondResult.tunnelURL).toBe('https://fixture-second.trycloudflare.com');
      expect(secondResult.tunnelURL).not.toBe(firstResult.tunnelURL);
      statusView.render(getOverlayStatus(manager));
      expect(statusView.getElementById('network-overlay-tunnel-url-text').textContent)
        .toBe(secondResult.tunnelURL);

      secondConnection = createPublicConnection('fixture-second.trycloudflare.com', username => createProfile(username, 61));
      const secondDom = mountXPBar(secondResult.tunnelURL, secondConnection);
      rendererDoms.push(secondDom);
      expect(secondDom.window.document.getElementById('xpBar').style.width).toBe('61%');
      secondConnection.serverSocket.emit('viewer-xp:public-update', {
        username: 'PublicOverlayQA', amount: 7,
        profile: createProfile('PublicOverlayQA', 68)
      });
      expect(secondDom.window.document.getElementById('xpBar').style.width).toBe('68%');
      expect(secondDom.window.document.documentElement.outerHTML).not.toContain(SECRET_CANARY);

      await expect(copyTunnelURL(manager.overlayTunnelURL, {
        navigatorRef: { clipboard: { writeText: clipboardWrite } }
      })).resolves.toBe(secondResult.tunnelURL);
      expect(clipboardWrite).toHaveBeenCalledWith(secondResult.tunnelURL);

      const fetchStop = jest.fn(async (url, options) => {
        expect(url).toBe('/api/network/overlay-tunnel/stop');
        expect(options).toEqual({ method: 'POST' });
        manager.stopOverlayQuickTunnel();
        return { ok: true, json: async () => ({ success: true }) };
      });
      await expect(stopTunnel({ fetchImpl: fetchStop })).resolves.toEqual({ success: true });
      expect(secondChild.kill).toHaveBeenCalledWith('SIGTERM');
      statusView.render(getOverlayStatus(manager));
      expect(manager.overlayTunnelURL).toBeNull();
      expect(statusView.getElementById('network-overlay-tunnel-url').style.display).toBe('none');
      expect(statusView.getElementById('network-overlay-tunnel-copy').disabled).toBe(true);

      secondChild.exitCode = 0;
      secondChild.emit('exit', 0);
    } finally {
      firstConnection?.client.disconnect();
      secondConnection?.client.disconnect();
      for (const dom of rendererDoms) dom.window.close();
      statusView.dom.window.close();
    }
  });
});
