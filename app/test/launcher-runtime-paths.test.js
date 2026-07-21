const path = require('path');
const fs = require('fs');
const os = require('os');

jest.mock('../modules/update-manager', () => jest.fn());

const Launcher = require('../modules/launcher');
const UpdateManager = require('../modules/update-manager');

function createQuietLauncher(projectRoot) {
  const launcher = new Launcher();
  launcher.projectRoot = projectRoot;
  launcher.log = {
    clear: jest.fn(),
    header: jest.fn(),
    step: jest.fn(),
    separator: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    newLine: jest.fn(),
    keyValue: jest.fn(),
    spinner: jest.fn(() => ({ stop: jest.fn() }))
  };
  return launcher;
}

const BOOT_CRITICAL_DEPENDENCIES = [
  'dotenv',
  'express',
  'socket.io',
  'better-sqlite3',
  'winston',
  '@eulerstream/euler-websocket-sdk',
  'jsonwebtoken',
  'axios',
  'ws',
  '@deepgram/sdk'
];

function writeLoadableDependency(projectRoot, dep, source = 'module.exports = {};') {
  const depPath = path.join(projectRoot, 'node_modules', dep);
  fs.mkdirSync(depPath, { recursive: true });
  fs.writeFileSync(path.join(depPath, 'package.json'), JSON.stringify({ main: 'index.js' }));
  fs.writeFileSync(path.join(depPath, 'index.js'), source);
}

function writeCriticalDependencyDirs(projectRoot) {
  for (const dep of BOOT_CRITICAL_DEPENDENCIES) {
    writeLoadableDependency(projectRoot, dep);
  }
}

function writeDependencyPackageJson(projectRoot, dependencies) {
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies }));
}

function writeDependencyLockfile(projectRoot) {
  fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
}

describe('launcher runtime toolchain', () => {
  test('resolves npm through the npm CLI that belongs to the current node executable', () => {
    const nodePath = path.join('C:\\LTTH', 'runtime', 'node', 'node.exe');
    const expectedNpmCli = path.join(path.dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

    const resolved = Launcher.resolveNpmCommandForNode(
      nodePath,
      candidate => candidate === expectedNpmCli,
      'win32'
    );

    expect(resolved.command).toBe(nodePath);
    expect(resolved.args).toEqual([expectedNpmCli]);
  });

  test('sanitized child environment prepends the current node directory and removes NODE_OPTIONS', () => {
    const launcher = new Launcher();
    const sanitized = launcher.sanitizeNodeEnvironment({
      Path: 'C:\\OtherTools',
      NODE_OPTIONS: '--require bad.js',
      NPM_CONFIG_NODE_OPTIONS: '--require bad.js'
    });

    expect(sanitized.NODE_OPTIONS).toBeUndefined();
    expect(sanitized.NPM_CONFIG_NODE_OPTIONS).toBeUndefined();
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    expect(sanitized[pathKey].split(path.delimiter)[0]).toBe(path.dirname(process.execPath));
  });

  test('does not reinstall only because package-lock is newer than node_modules when dependencies are valid', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-deps-'));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies: { express: '^4.0.0' } }));
    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
    writeCriticalDependencyDirs(projectRoot);

    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(projectRoot, 'node_modules'), oldTime, oldTime);

    const launcher = createQuietLauncher(projectRoot);
    launcher.installDependencies = jest.fn();

    await launcher.checkDependencies();

    expect(launcher.installDependencies).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(projectRoot, 'node_modules', '.ltth-deps-state.json'))).toBe(true);
  });

  test('reinstalls when dependency state marker no longer matches package files', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-deps-'));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies: { express: '^4.0.0' } }));
    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
    fs.writeFileSync(path.join(projectRoot, 'node_modules', '.ltth-deps-state.json'), JSON.stringify({ packageLockHash: 'stale' }));
    writeCriticalDependencyDirs(projectRoot);

    const launcher = createQuietLauncher(projectRoot);
    launcher.installDependencies = jest.fn(async () => {});

    await launcher.checkDependencies();

    expect(launcher.installDependencies).toHaveBeenCalledTimes(1);
  });

  test('detects a declared scoped dependency that is missing from node_modules', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-scoped-deps-'));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    writeDependencyPackageJson(projectRoot, {
      express: '^4.0.0',
      '@deepgram/sdk': '5.5.0'
    });
    writeDependencyLockfile(projectRoot);
    writeLoadableDependency(projectRoot, 'express');

    const verification = createQuietLauncher(projectRoot).verifyCriticalDependencies();

    expect(verification.valid).toBe(false);
    expect(verification.missing).toContain('@deepgram/sdk');
  });

  test('detects a boot-critical package whose nested module is missing', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-broken-sdk-'));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    writeDependencyPackageJson(projectRoot, { '@deepgram/sdk': '5.5.0' });
    writeDependencyLockfile(projectRoot);
    writeCriticalDependencyDirs(projectRoot);
    fs.writeFileSync(
      path.join(projectRoot, 'node_modules', '@deepgram', 'sdk', 'index.js'),
      "require('./api/index.js'); module.exports = {};"
    );

    const verification = createQuietLauncher(projectRoot).verifyCriticalDependencies();
    const details = [
      ...(verification.missing || []),
      ...(verification.errors || [])
    ].join(' ');

    expect(verification.valid).toBe(false);
    expect(details).toContain('@deepgram/sdk');
    expect(details).toContain('api/index.js');
  });

  test('re-verifies dependencies after reinstalling', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-reverify-'));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    writeDependencyPackageJson(projectRoot, {});
    writeDependencyLockfile(projectRoot);

    const launcher = createQuietLauncher(projectRoot);
    launcher.verifyCriticalDependencies = jest
      .fn()
      .mockReturnValueOnce({ valid: false, missing: ['@deepgram/sdk'], errors: [] })
      .mockReturnValueOnce({ valid: true, missing: [], errors: [] });
    launcher.installDependencies = jest.fn(async () => {});

    await launcher.checkDependencies();

    expect(launcher.installDependencies).toHaveBeenCalledTimes(1);
    expect(launcher.verifyCriticalDependencies).toHaveBeenCalledTimes(2);
  });

  test('throws when dependency verification still fails after reinstalling', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-reverify-fail-'));
    fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    writeDependencyPackageJson(projectRoot, {});
    writeDependencyLockfile(projectRoot);

    const launcher = createQuietLauncher(projectRoot);
    launcher.verifyCriticalDependencies = jest.fn(() => ({
      valid: false,
      missing: ['@deepgram/sdk'],
      errors: ['@deepgram/sdk: Cannot find module ./api/index.js']
    }));
    launcher.installDependencies = jest.fn(async () => {});

    await expect(launcher.checkDependencies()).rejects.toThrow('Dependency verification failed after installation');
  });

  test('repairs missing native binding with dependency install before rebuild', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-native-'));
    const launcher = createQuietLauncher(projectRoot);
    const missingBindingError = new Error('native check failed');
    missingBindingError.stderr = 'Error: Could not locate the bindings file. Tried: build\\Release\\better_sqlite3.node';

    launcher.verifyNativeModules = jest
      .fn()
      .mockImplementationOnce(() => {
        throw missingBindingError;
      })
      .mockReturnValueOnce('native-modules-ok');
    launcher.installDependencies = jest.fn(async () => {});
    launcher.rebuildNativeModules = jest.fn();

    await launcher.checkNativeModules();

    expect(launcher.installDependencies).toHaveBeenCalledTimes(1);
    expect(launcher.rebuildNativeModules).not.toHaveBeenCalled();
    expect(launcher.verifyNativeModules).toHaveBeenCalledTimes(2);
  });

  test('auto-updates the launcher before the dependency check when a Git update is available', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-update-'));
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ version: '1.3.23' }, null, 2));
    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));

    const performUpdate = jest.fn(async () => ({
      success: true,
      disabled: false,
      available: true,
      currentVersion: '1.3.23',
      updatedVersion: '1.3.24',
      needsRestart: true
    }));

    UpdateManager.mockImplementation(() => ({
      performUpdate,
      currentVersion: '1.3.23'
    }));

    const launcher = createQuietLauncher(projectRoot);
    launcher.writeDependencyState = jest.fn();

    const updateResult = await launcher.checkUpdates();

    expect(UpdateManager).toHaveBeenCalledTimes(1);
    expect(UpdateManager.mock.calls[0][1]).toEqual({
      appRoot: projectRoot,
      repoRoot: path.resolve(projectRoot, '..')
    });
    expect(performUpdate).toHaveBeenCalledTimes(1);
    expect(launcher.writeDependencyState).toHaveBeenCalledTimes(1);
    expect(launcher.log.success).toHaveBeenCalledWith(expect.stringContaining('1.3.24'));
    expect(updateResult.available).toBe(true);
  });

  test('launch checks for updates before dependency validation', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-launch-'));
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ version: '1.3.23' }, null, 2));
    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }, null, 2));

    const launcher = createQuietLauncher(projectRoot);
    launcher._loadEnvCache = jest.fn(() => null);
    launcher.checkNode = jest.fn(async () => {});
    launcher.checkNpm = jest.fn(async () => {});
    launcher.checkUpdates = jest.fn(async () => ({}));
    launcher.checkDependencies = jest.fn(async () => {});
    launcher.checkNativeModules = jest.fn(async () => {});
    launcher.startServer = jest.fn(async () => {});

    await launcher.launch();

    expect(launcher.checkUpdates).toHaveBeenCalledTimes(1);
    expect(launcher.checkDependencies).toHaveBeenCalledTimes(1);
    expect(launcher.checkUpdates.mock.invocationCallOrder[0]).toBeLessThan(
      launcher.checkDependencies.mock.invocationCallOrder[0]
    );
  });

  test('Go-managed launch skips Node preflight but keeps the server supervisor', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-go-managed-'));
    const launcher = createQuietLauncher(projectRoot);
    const previousManagedValue = process.env.LTTH_GO_LAUNCHER_MANAGED;
    process.env.LTTH_GO_LAUNCHER_MANAGED = 'true';

    launcher._loadEnvCache = jest.fn(() => null);
    launcher.checkNode = jest.fn(async () => {});
    launcher.checkNpm = jest.fn(async () => {});
    launcher.checkUpdates = jest.fn(async () => ({}));
    launcher.checkDependencies = jest.fn(async () => {});
    launcher.checkNativeModules = jest.fn(async () => {});
    launcher.startServer = jest.fn(async () => {});

    try {
      await launcher.launch();
    } finally {
      if (previousManagedValue === undefined) {
        delete process.env.LTTH_GO_LAUNCHER_MANAGED;
      } else {
        process.env.LTTH_GO_LAUNCHER_MANAGED = previousManagedValue;
      }
    }

    expect(launcher.checkNode).not.toHaveBeenCalled();
    expect(launcher.checkNpm).not.toHaveBeenCalled();
    expect(launcher.checkUpdates).not.toHaveBeenCalled();
    expect(launcher.checkDependencies).not.toHaveBeenCalled();
    expect(launcher.checkNativeModules).not.toHaveBeenCalled();
    expect(launcher.startServer).toHaveBeenCalledTimes(1);
  });
});
