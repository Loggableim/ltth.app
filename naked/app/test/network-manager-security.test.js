const NetworkManager = require('../modules/network-manager');

function createDb() {
  const values = new Map();
  return {
    getSetting: key => values.get(key),
    setSetting: (key, value) => values.set(key, value)
  };
}

describe('NetworkManager custom tunnel security', () => {
  test('rejects custom tunnel commands unless they are explicitly enabled', async () => {
    const manager = new NetworkManager(createDb());
    manager.tunnelProvider = 'custom';
    manager.tunnelConfig = {
      command: 'node -e "console.log(1)"'
    };

    await expect(manager.startTunnel(3000)).rejects.toThrow(/Custom tunnel commands are disabled/);
  });

  test('does not persist custom tunnel command text without explicit opt-in', () => {
    const manager = new NetworkManager(createDb());

    expect(() => manager.applyConfig({
      tunnelProvider: 'custom',
      tunnelConfig: {
        command: 'node -e "console.log(1)"'
      }
    })).toThrow(/Custom tunnel commands are disabled/);
  });
});
