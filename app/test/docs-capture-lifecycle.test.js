'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const lifecyclePath = path.join(__dirname, '..', '..', 'scripts', 'lib', 'docs-capture-lifecycle.js');
const lifecycle = fs.existsSync(lifecyclePath) ? require(lifecyclePath) : {};

const neverSettles = () => new Promise(() => {});

describe('documentation screenshot capture lifecycle', () => {
  test('drops a stalled page diagnostic instead of stalling the capture runner', async () => {
    expect(typeof lifecycle.captureFailureContext).toBe('function');

    await expect(lifecycle.captureFailureContext(neverSettles, {
      label: 'de/openshock/safety-card',
      timeoutMs: 15
    })).resolves.toEqual([]);
  });

  test('does not create a replacement page when the timed out page cannot close', async () => {
    expect(typeof lifecycle.recoverCapturePage).toBe('function');
    const createPage = jest.fn(async () => ({ id: 'replacement-page' }));

    await expect(lifecycle.recoverCapturePage({
      closePage: neverSettles,
      createPage,
      label: 'de/openshock/safety-card',
      timeoutMs: 15
    })).rejects.toThrow('Timed out after 15ms while closing capture page for de/openshock/safety-card');

    expect(createPage).not.toHaveBeenCalled();
  });

  test('force-kills a browser whose DevTools close never returns', async () => {
    expect(typeof lifecycle.closeCaptureBrowser).toBe('function');
    const kill = jest.fn();

    await expect(lifecycle.closeCaptureBrowser({
      close: neverSettles,
      process: () => ({ exitCode: null, kill })
    }, {
      label: 'de/openshock',
      timeoutMs: 15
    })).rejects.toThrow('Timed out after 15ms while closing capture browser for de/openshock');

    expect(kill).toHaveBeenCalledWith('SIGKILL');
  });

  test('reports an isolated app that does not exit after forced shutdown', async () => {
    expect(typeof lifecycle.stopCaptureAppChild).toBe('function');
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = jest.fn(() => true);

    await expect(lifecycle.stopCaptureAppChild(child, {
      label: 'de/openshock',
      timeoutMs: 15
    })).rejects.toThrow('Isolated capture app did not exit after forced shutdown for de/openshock');

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });
});
