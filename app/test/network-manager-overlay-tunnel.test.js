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
    overlayTunnelTimeoutMs: overrides.overlayTunnelTimeoutMs || 60_000,
    overlayTunnelKillTimeoutMs: overrides.overlayTunnelKillTimeoutMs || 5_000
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

  test('fails cleanly when spawning cloudflared throws synchronously', async () => {
    const spawnImpl = jest.fn(() => { throw new Error('synthetic spawn failure'); });
    const { manager } = createManager({ spawnImpl });

    await expect(manager.ensureOverlayQuickTunnel(3000)).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_START_FAILED'
    });
    expect(manager.overlayTunnelProcess).toBeNull();
    expect(manager.overlayTunnelStarting).toBeNull();
    expect(manager.overlayTunnelURL).toBeNull();
  });

  test('handles a child process error and clears its force-kill timer on close', async () => {
    const { manager, child } = createManager({ overlayTunnelKillTimeoutMs: 250 });
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    await Promise.resolve();
    child.emit('error', new Error('synthetic child error'));

    await expect(resultPromise).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_START_FAILED'
    });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(manager.overlayTunnelProcess).toBeNull();
    child.emit('close', -1);
  });

  test('fails cleanly when cloudflared exits before publishing a URL', async () => {
    const { manager, child } = createManager();
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    await Promise.resolve();
    child.exitCode = 1;
    child.emit('exit', 1);

    await expect(resultPromise).rejects.toMatchObject({
      code: 'OVERLAY_TUNNEL_START_FAILED'
    });
    expect(child.kill).not.toHaveBeenCalled();
    expect(manager.overlayTunnelProcess).toBeNull();
    expect(manager.overlayTunnelStarting).toBeNull();
    expect(manager.overlayTunnelURL).toBeNull();
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
    const { manager, child } = createManager({ overlayTunnelKillTimeoutMs: 250 });
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

    jest.advanceTimersByTime(250);
    expect(child.kill).toHaveBeenCalledTimes(2);
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
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
    child.exitCode = 0;
    child.emit('exit', 0);
  });

  test('escalates overlay stop to SIGKILL when SIGTERM does not exit the child', async () => {
    jest.useFakeTimers();
    const { manager, child } = createManager({ overlayTunnelKillTimeoutMs: 250 });
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stdout.write('https://stubborn-host.trycloudflare.com\n');
    await resultPromise;

    manager.stopOverlayQuickTunnel();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenLastCalledWith('SIGTERM');
    jest.advanceTimersByTime(250);
    expect(child.kill).toHaveBeenCalledTimes(2);
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');
  });

  test('cancels force-kill escalation when the stopped child exits', async () => {
    jest.useFakeTimers();
    const { manager, child } = createManager({ overlayTunnelKillTimeoutMs: 250 });
    const resultPromise = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    child.stdout.write('https://clean-stop.trycloudflare.com\n');
    await resultPromise;

    manager.stopOverlayQuickTunnel();
    child.exitCode = 0;
    child.emit('exit', 0);
    jest.advanceTimersByTime(250);

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenLastCalledWith('SIGTERM');
  });

  test('late exit from a stopped tunnel cannot clear a newer tunnel', async () => {
    const oldChild = createChildProcess();
    const newChild = createChildProcess();
    const spawnImpl = jest.fn()
      .mockReturnValueOnce(oldChild)
      .mockReturnValueOnce(newChild);
    const { manager } = createManager({ spawnImpl });

    const oldStart = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    oldChild.stderr.write('https://old-host.trycloudflare.com\n');
    await oldStart;
    manager.stopOverlayQuickTunnel();

    const newStart = manager.ensureOverlayQuickTunnel(3000);
    await Promise.resolve();
    newChild.stderr.write('https://new-host.trycloudflare.com\n');
    await newStart;
    oldChild.exitCode = 0;
    oldChild.emit('exit', 0);

    expect(manager.overlayTunnelProcess).toBe(newChild);
    expect(manager.overlayTunnelURL).toBe('https://new-host.trycloudflare.com');
    newChild.exitCode = 0;
    newChild.emit('exit', 0);
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
    child.exitCode = 0;
    child.emit('exit', 0);
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
