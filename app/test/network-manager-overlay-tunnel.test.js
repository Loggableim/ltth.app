'use strict';

const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const NetworkManager = require('../modules/network-manager');

function createDb() {
  const values = new Map();
  return {
    getSetting: key => values.get(key),
    setSetting: (key, value) => values.set(key, value)
  };
}

function createChildProcess() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

function createManager(overrides = {}) {
  const child = overrides.child || createChildProcess();
  const spawnImpl = overrides.spawnImpl || jest.fn(() => child);
  const binaryManager = overrides.binaryManager || {
    ensureInstalled: jest.fn().mockResolvedValue('C:\\runtime-tools\\cloudflared.exe'),
    getQuickTunnelConfigPath: jest.fn(() => 'NUL')
  };
  const manager = new NetworkManager(createDb(), {
    spawnImpl,
    cloudflaredBinaryManager: binaryManager,
    overlayTunnelTimeoutMs: overrides.overlayTunnelTimeoutMs || 60_000
  });
  return { manager, child, spawnImpl, binaryManager };
}

describe('NetworkManager overlay Quick Tunnel', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('installs and starts cloudflared with the isolated Quick Tunnel arguments', async () => {
    const { manager, child, spawnImpl, binaryManager } = createManager();

    const resultPromise = manager.ensureOverlayQuickTunnel(3180);
    await Promise.resolve();
    child.stderr.write('INF Your quick Tunnel has been created! https://quiet-river.trycloudflare.com\n');
    const result = await resultPromise;

    expect(result).toEqual({
      tunnelURL: 'https://quiet-river.trycloudflare.com',
      reused: false
    });
    expect(binaryManager.ensureInstalled).toHaveBeenCalledTimes(1);
    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\runtime-tools\\cloudflared.exe',
      [
        'tunnel',
        '--no-autoupdate',
        '--config',
        'NUL',
        '--url',
        'http://127.0.0.1:3180'
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  });

  test('reuses one active process for later ensure calls', async () => {
    const { manager, child, spawnImpl } = createManager();
    const firstPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stdout.write('https://shared-host.trycloudflare.com\n');
    const first = await firstPromise;
    const second = await manager.ensureOverlayQuickTunnel(3000);

    expect(first.reused).toBe(false);
    expect(second).toEqual({
      tunnelURL: 'https://shared-host.trycloudflare.com',
      reused: true
    });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });

  test('coalesces concurrent ensure calls while reporting the waiter as reused', async () => {
    const { manager, child, spawnImpl } = createManager();

    const firstPromise = manager.ensureOverlayQuickTunnel(3000);
    const secondPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stderr.write('https://concurrent.trycloudflare.com\n');

    await expect(firstPromise).resolves.toMatchObject({ reused: false });
    await expect(secondPromise).resolves.toMatchObject({
      tunnelURL: 'https://concurrent.trycloudflare.com',
      reused: true
    });
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });

  test('ignores lookalike output and accepts only a strict trycloudflare origin', async () => {
    const { manager, child } = createManager();
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();

    child.stdout.write('https://valid.trycloudflare.com.evil.example\n');
    expect(manager.overlayTunnelURL).toBeNull();
    child.stdout.write('https://valid.trycloudflare.com\n');

    await expect(resultPromise).resolves.toMatchObject({
      tunnelURL: 'https://valid.trycloudflare.com'
    });
  });

  test('times out after 60 seconds, kills the child, and leaves retryable state', async () => {
    jest.useFakeTimers();
    const { manager, child } = createManager();
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(60_000);

    await expect(resultPromise).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_START_TIMEOUT'
    });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.overlayTunnelProcess).toBeNull();
    expect(manager.overlayTunnelStarting).toBeNull();
    expect(manager.overlayTunnelLastError).toBe('Quick Tunnel start timed out');
  });

  test('clears active state when cloudflared exits after URL discovery', async () => {
    const { manager, child } = createManager();
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stderr.write('https://exiting.trycloudflare.com\n');
    await resultPromise;

    child.emit('exit', 1);

    expect(manager.overlayTunnelProcess).toBeNull();
    expect(manager.overlayTunnelURL).toBeNull();
    expect(manager.overlayTunnelLastError).toBe('Quick Tunnel process exited');
  });

  test('stops only the overlay process and preserves a manual tunnel', async () => {
    const { manager, child } = createManager();
    const manualChild = createChildProcess();
    manager.tunnelProcess = manualChild;
    manager.tunnelURL = 'https://manual.example.com';
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stdout.write('https://overlay.trycloudflare.com\n');
    await resultPromise;

    manager.stopOverlayQuickTunnel();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manualChild.kill).not.toHaveBeenCalled();
    expect(manager.tunnelURL).toBe('https://manual.example.com');
    expect(manager.overlayTunnelURL).toBeNull();
  });

  test('shutdown stops both manual and overlay processes', async () => {
    const { manager, child } = createManager();
    const manualChild = createChildProcess();
    manager.tunnelProcess = manualChild;
    manager.tunnelURL = 'https://manual.example.com';
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stdout.write('https://shutdown.trycloudflare.com\n');
    await resultPromise;

    manager.shutdown();

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manualChild.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('shutdown cancels an in-flight overlay start and rejects late publication', async () => {
    const { manager, child } = createManager();
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    await Promise.resolve();

    manager.shutdown();
    child.emit('exit', 0);

    await expect(resultPromise).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_CANCELLED'
    });
    child.stderr.write('https://late-shutdown.trycloudflare.com\n');

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.overlayTunnelStarting).toBeNull();
    expect(manager.overlayTunnelProcess).toBeNull();
    expect(manager.overlayTunnelURL).toBeNull();
  });

  test('reports overlay status and only current Quick Tunnel hostnames', async () => {
    const { manager, child } = createManager();
    manager.tunnelURL = 'https://manual-quick.trycloudflare.com';
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stdout.write('https://automatic-quick.trycloudflare.com\n');
    await resultPromise;

    expect(manager.getActiveQuickTunnelHosts()).toEqual(new Set([
      'automatic-quick.trycloudflare.com',
      'manual-quick.trycloudflare.com'
    ]));
    expect(manager.getConfig(3000).overlayTunnel).toEqual({
      active: true,
      starting: false,
      url: 'https://automatic-quick.trycloudflare.com',
      lastError: null
    });
  });
});
