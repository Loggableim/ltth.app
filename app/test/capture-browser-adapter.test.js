'use strict';

const {
  PlaywrightPageAdapter,
  createPlaywrightAdapter,
  loadCaptureBrowserAdapter,
  selectCaptureBrowserAdapter
} = require('../../scripts/lib/capture-browser-adapter');

function missing(name) {
  const error = new Error(`Cannot find module '${name}'`);
  error.code = 'MODULE_NOT_FOUND';
  return error;
}

function mockPage() {
  const calls = [];
  let routeHandler;
  return {
    calls,
    native: {
      route: jest.fn(async (_pattern, handler) => { routeHandler = handler; }),
      evaluate: jest.fn(async (...args) => { calls.push(['evaluate', ...args]); return 'ok'; }),
      addInitScript: jest.fn(async (...args) => calls.push(['init', ...args])),
      waitForFunction: jest.fn(async (...args) => { calls.push(['wait', ...args]); return true; }),
      setViewportSize: jest.fn(async (size) => calls.push(['viewport', size])),
      goto: jest.fn(async (...args) => calls.push(['goto', ...args])),
      screenshot: jest.fn(async (...args) => calls.push(['screenshot', ...args])),
      close: jest.fn(async () => calls.push(['close']))
    },
    get routeHandler() { return routeHandler; }
  };
}

describe('capture browser adapter', () => {
  test('resolves the existing Playwright runtime without launching a browser', () => {
    const adapter = loadCaptureBrowserAdapter(require('path').resolve(__dirname, '../..'));
    expect(adapter.kind).toBe('playwright');
    expect(typeof adapter.launch).toBe('function');
  });

  test('keeps Puppeteer preferred and uses Playwright only when Puppeteer is missing', () => {
    const puppeteer = { launch: jest.fn() };
    const playwright = { chromium: { launch: jest.fn() } };
    const preferred = selectCaptureBrowserAdapter({
      loadPuppeteer: () => puppeteer,
      loadPlaywright: () => playwright
    });
    expect(preferred.kind).toBe('puppeteer');
    preferred.launch({ headless: 'new' });
    expect(puppeteer.launch).toHaveBeenCalledWith({ headless: 'new' });
    expect(playwright.chromium.launch).not.toHaveBeenCalled();

    const fallback = selectCaptureBrowserAdapter({
      loadPuppeteer: () => { throw missing('puppeteer'); },
      loadPlaywright: () => playwright
    });
    expect(fallback.kind).toBe('playwright');
  });

  test('does not mask Puppeteer load errors as absence', () => {
    const broken = new Error("Cannot find module 'puppeteer/lib/internal-dependency'");
    broken.code = 'MODULE_NOT_FOUND';
    broken.captureBrowserPackageInstalled = true;
    const loadPlaywright = jest.fn();
    expect(() => selectCaptureBrowserAdapter({
      loadPuppeteer: () => { throw broken; },
      loadPlaywright
    })).toThrow(broken);
    expect(loadPlaywright).not.toHaveBeenCalled();
  });

  test('maps launch options and wraps browser/page lifecycle', async () => {
    const page = mockPage();
    const child = { pid: 4321, exitCode: null, signalCode: null };
    const server = { wsEndpoint: () => 'ws://127.0.0.1:43123', process: () => child, close: jest.fn() };
    const browser = { newPage: jest.fn(async () => page.native), close: jest.fn() };
    const playwright = { chromium: {
      launchServer: jest.fn(async () => server),
      connect: jest.fn(async () => browser)
    } };
    const adapter = createPlaywrightAdapter(playwright);
    const wrappedBrowser = await adapter.launch({ headless: 'new', executablePath: 'chrome.exe', args: ['--no-sandbox'] });
    const wrappedPage = await wrappedBrowser.newPage();
    expect(playwright.chromium.launchServer).toHaveBeenCalledWith({ headless: true, executablePath: 'chrome.exe', args: ['--no-sandbox'] });
    expect(playwright.chromium.connect).toHaveBeenCalledWith('ws://127.0.0.1:43123');
    expect(wrappedBrowser.process().pid).toBe(4321);
    expect(wrappedBrowser.browserPort).toBe(43123);
    expect(browser.newPage).toHaveBeenCalledWith({ javaScriptEnabled: true });
    expect(wrappedPage).toBeInstanceOf(PlaywrightPageAdapter);
    await wrappedPage.close();
    await wrappedBrowser.close();
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  test('routes explicitly and aborts by default when no listener resolves a request', async () => {
    const harness = mockPage();
    const page = new PlaywrightPageAdapter(harness.native);
    await page.setRequestInterception(true);
    const request = { url: () => 'https://example.test/x', method: () => 'GET', resourceType: () => 'document' };
    const deniedRoute = { request: () => request, abort: jest.fn(async () => {}) };
    await harness.routeHandler(deniedRoute);
    expect(deniedRoute.abort).toHaveBeenCalledWith();

    const allowedRoute = { request: () => request, continue: jest.fn(async () => {}), abort: jest.fn() };
    page.on('request', (r) => { r.continue({ url: 'http://127.0.0.1:3000/rewritten' }); });
    await harness.routeHandler(allowedRoute);
    expect(allowedRoute.continue).toHaveBeenCalledWith({ url: 'http://127.0.0.1:3000/rewritten' });
    expect(allowedRoute.abort).not.toHaveBeenCalled();
  });

  test('adapts multi-argument evaluation, init scripts, waits, and viewport', async () => {
    const harness = mockPage();
    const page = new PlaywrightPageAdapter(harness.native);
    const sum = (left, right) => left + right;
    await page.evaluate(sum, 2, 3);
    expect(harness.native.evaluate).toHaveBeenCalledWith('((left, right) => left + right)(...[2,3])');

    await page.evaluateOnNewDocument((a, b) => [a, b], 'de', 'sidekick');
    expect(harness.native.addInitScript).toHaveBeenCalledWith('((a, b) => [a, b])(...["de","sidekick"])');

    const predicate = (tab) => tab === 'status';
    await page.waitForFunction(predicate, {}, 'status');
    expect(harness.native.waitForFunction).toHaveBeenCalledWith(predicate, 'status', {});
    const multiPredicate = (tab, state) => tab === 'status' && state === 'ready';
    await page.waitForFunction(multiPredicate, { timeout: 1000 }, 'status', 'ready');
    const [wrappedPredicate, wrappedArgs, options] = harness.native.waitForFunction.mock.calls[1];
    expect(wrappedArgs).toEqual(['status', 'ready']);
    expect(options).toEqual({ timeout: 1000 });
    expect((0, eval)(`(${wrappedPredicate})`)(wrappedArgs)).toBe(true);
    await page.waitForFunction(() => true, { timeout: 1000 });
    expect(harness.native.waitForFunction).toHaveBeenLastCalledWith(expect.any(Function), undefined, { timeout: 1000 });

    await page.setJavaScriptEnabled(true);
    await expect(page.setJavaScriptEnabled(false)).rejects.toThrow('cannot be disabled');
    expect(harness.native.goto).not.toHaveBeenCalled();

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    expect(harness.native.setViewportSize).toHaveBeenCalledWith({ width: 1440, height: 900 });
    await expect(page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })).rejects.toThrow('deviceScaleFactor 1 only');
  });
});
