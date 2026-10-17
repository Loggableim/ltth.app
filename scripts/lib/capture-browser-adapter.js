'use strict';

const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

function missingModuleError(error, moduleName) {
  return error?.code === 'MODULE_NOT_FOUND'
    && String(error.message).includes(`'${moduleName}'`);
}

function resolveFirst(repoRoot, packageNames, requireFn = require) {
  let lastMissing;
  for (const packageName of packageNames) {
    const localPath = path.join(repoRoot, 'app', 'node_modules', packageName);
    const localManifest = path.join(localPath, 'package.json');
    if (fs.existsSync(localManifest)) {
      try { return requireFn(localPath); } catch (error) {
        error.captureBrowserPackageInstalled = true;
        throw error;
      }
    }
    try {
      const resolved = requireFn.resolve(packageName);
      try { return requireFn(resolved); } catch (error) {
        error.captureBrowserPackageInstalled = true;
        throw error;
      }
    } catch (error) {
      if (!missingModuleError(error, packageName)) throw error;
      lastMissing = error;
    }
  }
  throw lastMissing || new Error(`Unable to resolve ${packageNames.join(' or ')}`);
}

function isMissingPackage(error, names) {
  return names.some((name) => missingModuleError(error, name));
}

function serializeFunctionCall(fn, args) {
  return `(${fn.toString()})(...${JSON.stringify(args)})`;
}

function isWaitOptions(value) {
  return value && typeof value === 'object'
    && (Object.keys(value).length === 0
      || ['timeout', 'polling', 'signal'].some((key) => Object.prototype.hasOwnProperty.call(value, key)));
}

class PlaywrightPageAdapter extends EventEmitter {
  constructor(page) {
    super();
    this.page = page;
    this.requestRoutingEnabled = false;
  }

  on(eventName, listener) {
    if (eventName === 'request') return super.on(eventName, listener);
    this.page.on(eventName, listener);
    return this;
  }

  once(eventName, listener) {
    if (eventName === 'request') return super.once(eventName, listener);
    this.page.once(eventName, listener);
    return this;
  }

  async setRequestInterception(enabled) {
    if (!enabled || this.requestRoutingEnabled) return;
    this.requestRoutingEnabled = true;
    await this.page.route('**/*', async (route) => {
      const nativeRequest = route.request();
      let settled = false;
      let resolveDecision;
      const decision = new Promise((resolve) => { resolveDecision = resolve; });
      const settle = (operation) => {
        if (settled) return Promise.reject(new Error('Capture request was already resolved'));
        settled = true;
        const result = Promise.resolve().then(operation);
        resolveDecision(result);
        return result;
      };
      const request = {
        url: () => nativeRequest.url(),
        method: () => nativeRequest.method(),
        resourceType: () => nativeRequest.resourceType(),
        continue: (overrides) => settle(() => route.continue(overrides)),
        abort: (errorCode) => settle(() => route.abort(errorCode))
      };
      this.emit('request', request);
      await Promise.resolve();
      if (!settled) await settle(() => route.abort());
      await decision;
    });
  }

  async evaluate(fn, ...args) {
    if (args.length <= 1) return this.page.evaluate(fn, ...args);
    return this.page.evaluate(serializeFunctionCall(fn, args));
  }

  async evaluateOnNewDocument(fn, ...args) {
    if (args.length <= 1) return this.page.addInitScript(fn, ...args);
    return this.page.addInitScript(serializeFunctionCall(fn, args));
  }

  async waitForFunction(fn, options = {}, ...args) {
    if (!isWaitOptions(options)) throw new Error('Puppeteer waitForFunction options must be the second argument');
    if (args.length === 0) return this.page.waitForFunction(fn, undefined, options);
    const argument = args.length === 1 ? args[0] : args;
    const pageFunction = args.length === 1 ? fn : `(__captureArgs) => (${fn.toString()})(...__captureArgs)`;
    return this.page.waitForFunction(pageFunction, argument, options);
  }

  async setViewport(viewport) {
    const scale = viewport.deviceScaleFactor ?? 1;
    if (scale !== 1) throw new Error('Playwright capture adapter supports deviceScaleFactor 1 only');
    return this.page.setViewportSize({ width: viewport.width, height: viewport.height });
  }

  async setJavaScriptEnabled(enabled) {
    if (enabled !== true) throw new Error('Playwright capture JavaScript is enabled at context creation and cannot be disabled by this adapter');
  }
  async goto(...args) { return this.page.goto(...args); }
  async screenshot(...args) { return this.page.screenshot(...args); }
  async close(...args) { return this.page.close(...args); }
}

function createPlaywrightAdapter(playwright) {
  return {
    kind: 'playwright',
    async launch(options = {}) {
      const server = await playwright.chromium.launchServer({
        ...options,
        headless: options.headless === 'new' ? true : options.headless
      });
      let browser;
      try {
        browser = await playwright.chromium.connect(server.wsEndpoint());
      } catch (error) {
        await server.close().catch(() => {});
        throw error;
      }
      const browserPort = Number(new URL(server.wsEndpoint()).port) || null;
      return {
        browserPort,
        process() { return server.process(); },
        async newPage() { return new PlaywrightPageAdapter(await browser.newPage({ javaScriptEnabled: true })); },
        async close() {
          let closeError;
          try { await browser.close(); } catch (error) { closeError = error; }
          try { await server.close(); } catch (error) { if (!closeError) closeError = error; }
          if (closeError) throw closeError;
        }
      };
    }
  };
}

function selectCaptureBrowserAdapter({ loadPuppeteer, loadPlaywright }) {
  try {
    const puppeteer = loadPuppeteer();
    return { kind: 'puppeteer', launch: (options) => puppeteer.launch(options) };
  } catch (error) {
    if (error.captureBrowserPackageInstalled || !isMissingPackage(error, ['puppeteer', 'puppeteer-core'])) throw error;
  }
  return createPlaywrightAdapter(loadPlaywright());
}

function loadCaptureBrowserAdapter(repoRoot) {
  return selectCaptureBrowserAdapter({
    loadPuppeteer: () => resolveFirst(repoRoot, ['puppeteer', 'puppeteer-core']),
    loadPlaywright: () => resolveFirst(repoRoot, ['playwright-core', 'playwright'])
  });
}

module.exports = {
  PlaywrightPageAdapter,
  createPlaywrightAdapter,
  loadCaptureBrowserAdapter,
  selectCaptureBrowserAdapter
};
