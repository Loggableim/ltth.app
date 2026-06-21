const PortManager = require('../modules/port-manager');

describe('PortManager flexible range behavior', () => {
  test('returns preferred port when free', async () => {
    const manager = new PortManager({ preferredPort: 3000, maxPort: 3050 });
    jest.spyOn(manager, 'isPortFree').mockResolvedValue(true);

    const result = await manager.resolvePort();

    expect(result).toEqual({ port: 3000, action: 'preferred' });
  });

  test('falls back to next free port in configured range', async () => {
    const manager = new PortManager({ preferredPort: 3000, maxPort: 3002 });
    jest.spyOn(manager, 'isPortFree').mockImplementation(async (port) => port === 3002);

    const result = await manager.resolvePort();

    expect(result).toEqual({ port: 3002, action: 'fallback' });
  });

  test('returns null from getNextPort when range is exhausted', () => {
    const manager = new PortManager({ preferredPort: 3000, maxPort: 3050 });
    expect(manager.getNextPort(3050)).toBeNull();
  });

  test('throws when no free port is available in range', async () => {
    const manager = new PortManager({ preferredPort: 3000, maxPort: 3001 });
    jest.spyOn(manager, 'isPortFree').mockResolvedValue(false);
    await expect(manager.resolvePort()).rejects.toThrow('No free port found in range 3000-3001');
  });
});
