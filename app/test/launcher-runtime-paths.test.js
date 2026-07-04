const path = require('path');
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
    expect(sanitized.Path.split(path.delimiter)[0]).toBe(path.dirname(process.execPath));
  });
});
