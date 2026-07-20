'use strict';

const PluginLoader = require('../modules/plugin-loader');
const { PluginAPI } = PluginLoader;

function createApi() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return new PluginAPI('flow-fixture', __dirname, null, null, null, logger, null, null);
}

describe('PluginAPI Flow action registration', () => {
  test('keeps function handlers executable and returns their structured result', async () => {
    const api = createApi();
    const handler = jest.fn(async params => ({ accepted: false, reason: params.reason }));

    expect(api.registerFlowAction('fixture.function', handler)).toBe(true);
    expect(api.registeredFlowActions[0]).toMatchObject({
      actionName: 'fixture.function',
      pluginId: 'flow-fixture'
    });
    await expect(api.registeredFlowActions[0].handler({ reason: 'disabled' }))
      .resolves.toEqual({ accepted: false, reason: 'disabled' });
  });

  test('preserves descriptor metadata and wraps descriptor execute', async () => {
    const api = createApi();
    const execute = jest.fn(async params => ({ accepted: true, payload: params }));
    const descriptor = {
      name: 'Descriptor action',
      description: 'Executable descriptor',
      icon: 'spark',
      category: 'effects',
      parameters: { intensity: { type: 'number', default: 1 } },
      execute
    };

    expect(api.registerFlowAction('fixture.descriptor', descriptor)).toBe(true);
    const registered = api.registeredFlowActions[0];
    expect(registered).toMatchObject({
      actionName: 'fixture.descriptor',
      pluginId: 'flow-fixture',
      name: 'Descriptor action',
      description: 'Executable descriptor',
      icon: 'spark',
      category: 'effects',
      parameters: descriptor.parameters
    });
    await expect(registered.handler({ intensity: 2 }))
      .resolves.toEqual({ accepted: true, payload: { intensity: 2 } });
    expect(execute).toHaveBeenCalledWith({ intensity: 2 });
  });

  test.each([null, {}, { execute: 'not-a-function' }])(
    'rejects invalid action descriptor %p without registration',
    invalid => {
      const api = createApi();
      expect(api.registerFlowAction('fixture.invalid', invalid)).toBe(false);
      expect(api.registeredFlowActions).toHaveLength(0);
    }
  );
});
