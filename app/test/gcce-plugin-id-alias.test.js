'use strict';

const CommandRegistry = require('../plugins/gcce/commandRegistry');
const GCCEPlugin = require('../plugins/gcce');

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

describe('GCCE canonical plugin identity projection', () => {
  test('alias and canonical command registrations collapse to one owner and command', () => {
    const registry = new CommandRegistry(logger());
    const first = jest.fn();
    const second = jest.fn();

    expect(registry.registerCommand({
      pluginId: 'streamalchemy', name: 'monsters', handler: first
    })).toBe(true);
    expect(registry.registerCommand({
      pluginId: 'stream-monsters', name: 'monsters', handler: second
    })).toBe(true);

    expect(registry.getCommand('monsters')).toEqual(expect.objectContaining({
      pluginId: 'stream-monsters', handler: second
    }));
    expect(registry.getPluginCommands('streamalchemy')).toHaveLength(1);
    expect(registry.getPluginCommands('stream-monsters')).toHaveLength(1);
    expect(registry.getStats()).toEqual(expect.objectContaining({
      registeredCommands: 1,
      pluginsWithCommands: 1
    }));

    registry.unregisterPluginCommands('streamalchemy');
    expect(registry.getCommand('monsters')).toBeNull();
  });

  test('raw response handlers registered through both IDs execute once', async () => {
    const plugin = Object.create(GCCEPlugin.prototype);
    plugin.rawResponseHandlers = new Map();
    plugin.api = { log: jest.fn() };
    const aliasHandler = jest.fn(async () => ({ handled: true, source: 'alias' }));
    const canonicalHandler = jest.fn(async () => ({ handled: true, source: 'canonical' }));

    expect(plugin.registerRawResponseHandlerForPlugin('streamalchemy', aliasHandler)).toEqual({
      pluginId: 'stream-monsters', registered: true, replaced: false
    });
    expect(plugin.registerRawResponseHandlerForPlugin('stream-monsters', canonicalHandler)).toEqual({
      pluginId: 'stream-monsters', registered: true, replaced: true
    });
    expect(plugin.rawResponseHandlers.size).toBe(1);

    await expect(plugin.dispatchRawResponse('A', {})).resolves.toEqual({
      handled: true, source: 'canonical', pluginId: 'stream-monsters'
    });
    expect(aliasHandler).not.toHaveBeenCalled();
    expect(canonicalHandler).toHaveBeenCalledTimes(1);
    expect(plugin.unregisterRawResponseHandlerForPlugin('streamalchemy')).toBe(true);
    expect(plugin.rawResponseHandlers.size).toBe(0);
  });
});
