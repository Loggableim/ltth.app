const path = require('path');
const fs = require('fs');
const os = require('os');
const Launcher = require('../modules/launcher');

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
  test('repairs missing native binding with dependency install before rebuild', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-native-'));
    const launcher = new Launcher();
    launcher.projectRoot = projectRoot;
    launcher.log = {
      warn: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      newLine: jest.fn(),
      spinner: jest.fn(() => ({ stop: jest.fn() }))
    };
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
});
