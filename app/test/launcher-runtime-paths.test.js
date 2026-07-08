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

function writeCriticalDependencyDirs(projectRoot) {
  const criticalDeps = [
    'dotenv',
    'express',
    'socket.io',
    'better-sqlite3',
    'winston',
    '@eulerstream/euler-websocket-sdk',
    'jsonwebtoken',
    'axios',
    'ws'
  ];

  for (const dep of criticalDeps) {
    fs.mkdirSync(path.join(projectRoot, 'node_modules', dep), { recursive: true });
  }
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
});
