const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const overlayClientPath = path.join(__dirname, '../plugins/spotlight/overlays/single-overlay.js');

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

function createDeferredResponse(payload) {
  let resolveJson;
  const jsonPromise = new Promise(resolve => {
    resolveJson = resolve;
  });

  return {
    response: {
      json: () => jsonPromise
    },
    resolve: () => resolveJson(payload)
  };
}

function createHarness({ settings, user, lastResponses = [] }) {
  const dom = new JSDOM('<!DOCTYPE html><div id="overlay-container"></div>');
  const handlers = {};
  const intervals = [];
  const clears = [];
  const renders = [];

  class FakeTemplateRenderer {
    constructor(container, initialSettings) {
      this.container = container;
      this.settings = initialSettings;
    }

    updateSettings(newSettings) {
      this.settings = newSettings;
    }

    async render(userData) {
      renders.push(userData);
      this.container.innerHTML = userData
        ? `<div class="user-display">${userData.nickname}</div>`
        : '';
    }

    clear() {
      clears.push(true);
      this.container.innerHTML = '';
    }
  }

  const context = {
    document: dom.window.document,
    window: dom.window,
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    io: jest.fn(() => ({
      on: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      })
    })),
    fetch: jest.fn(async url => {
      if (url === '/api/lastevent/settings/gifter') {
        return { json: async () => ({ success: true, settings }) };
      }
      if (url === '/api/lastevent/last/gifter') {
        const queuedResponse = lastResponses.shift();
        if (queuedResponse) {
          return queuedResponse;
        }
        return { json: async () => ({ success: true, sessionId: 'session-current', user }) };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }),
    setInterval: jest.fn((callback, ms) => {
      const interval = { callback, ms, cleared: false };
      intervals.push(interval);
      return interval;
    }),
    clearInterval: jest.fn(interval => {
      if (interval) interval.cleared = true;
    }),
    requestAnimationFrame: callback => callback(),
    AnimationRegistry: class AnimationRegistry {},
    AnimationRenderer: class AnimationRenderer {
      async animateIn() {}
      async animateOut() {}
      cancelAll() {}
    },
    TemplateRenderer: FakeTemplateRenderer
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(overlayClientPath, 'utf8'), context);

  return {
    context,
    handlers,
    intervals,
    clears,
    renders,
    container: dom.window.document.getElementById('overlay-container')
  };
}

describe('LastEvent shared single-overlay client', () => {
  test('uses refreshIntervalSeconds as the actual refresh timer interval', async () => {
    const harness = createHarness({
      settings: {
        refreshIntervalSeconds: 12,
        hideOnNullUser: true
      },
      user: { nickname: 'Gift User', eventType: 'gifter' }
    });

    await harness.context.initLastEventOverlay('gifter');
    await flushPromises();

    expect(harness.intervals).toHaveLength(1);
    expect(harness.intervals[0].ms).toBe(12000);
  });

  test('session reset clears renderer state instead of only emptying HTML', async () => {
    const harness = createHarness({
      settings: {
        refreshIntervalSeconds: 0,
        hideOnNullUser: true
      },
      user: { nickname: 'Gift User', eventType: 'gifter' }
    });

    await harness.context.initLastEventOverlay('gifter');
    await flushPromises();

    harness.handlers['lastevent.session.reset']();

    expect(harness.clears).toHaveLength(1);
    expect(harness.container.textContent).toBe('');
  });

  test('ignores stale last-user responses that resolve after a session reset', async () => {
    const staleLastResponse = createDeferredResponse({
      success: true,
      sessionId: 'session-old',
      user: { nickname: 'Stale Gift User', eventType: 'gifter' }
    });

    const harness = createHarness({
      settings: {
        refreshIntervalSeconds: 5,
        hideOnNullUser: true
      },
      user: null,
      lastResponses: [
        { json: async () => ({ success: true, sessionId: 'session-current', user: null }) },
        staleLastResponse.response
      ]
    });

    await harness.context.initLastEventOverlay('gifter');
    await flushPromises();

    const refreshPromise = harness.intervals[0].callback();
    harness.handlers['lastevent.session.reset']({ sessionId: 'session-new' });
    staleLastResponse.resolve();
    await refreshPromise;
    await flushPromises();

    expect(harness.renders).not.toContainEqual(expect.objectContaining({
      nickname: 'Stale Gift User'
    }));
    expect(harness.container.textContent).toBe('');
  });
});
