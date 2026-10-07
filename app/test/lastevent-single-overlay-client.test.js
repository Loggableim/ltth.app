const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const overlayClientPath = path.join(__dirname, '../plugins/spotlight/overlays/single-overlay.js');
const templateRendererPath = path.join(__dirname, '../plugins/spotlight/lib/template-renderer.js');

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
      ok: true,
      status: 200,
      json: () => jsonPromise
    },
    resolve: () => resolveJson(payload)
  };
}

function createHarness({ settings, user, lastResponses = [], settingsResponses = [], useActualRenderer = false }) {
  const dom = new JSDOM('<!DOCTYPE html><div id="overlay-container"></div>');
  const handlers = {};
  const intervals = [];
  const clears = [];
  const renders = [];
  const socket = {
    disconnect: jest.fn(),
    off: jest.fn(),
    on: jest.fn((eventName, handler) => {
      handlers[eventName] = handler;
      return socket;
    })
  };

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
    io: jest.fn(() => socket),
    fetch: jest.fn(async url => {
      if (url === '/api/lastevent/settings/gifter') {
        const queuedResponse = settingsResponses.shift();
        if (queuedResponse) return queuedResponse;
        return { ok: true, status: 200, json: async () => ({ success: true, settings }) };
      }
      if (url === '/api/lastevent/last/gifter') {
        const queuedResponse = lastResponses.shift();
        if (queuedResponse) {
          return queuedResponse;
        }
        return { ok: true, status: 200, json: async () => ({ success: true, overlaySessionToken: 'overlay-current', user: user && { ...user, overlaySessionToken: 'overlay-current' } }) };
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
  if (useActualRenderer) {
    vm.runInContext(fs.readFileSync(templateRendererPath, 'utf8'), context);
    context.TemplateRenderer = dom.window.TemplateRenderer;
  }
  vm.runInContext(fs.readFileSync(overlayClientPath, 'utf8'), context);

  return {
    context,
    handlers,
    intervals,
    clears,
    renders,
    socket,
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
      overlaySessionToken: 'overlay-old',
      user: { nickname: 'Stale Gift User', eventType: 'gifter' }
    });

    const harness = createHarness({
      settings: {
        refreshIntervalSeconds: 5,
        hideOnNullUser: true
      },
      user: null,
      lastResponses: [
        { json: async () => ({ success: true, overlaySessionToken: 'overlay-current', user: null }) },
        staleLastResponse.response
      ]
    });

    await harness.context.initLastEventOverlay('gifter');
    await flushPromises();

    const refreshPromise = harness.intervals[0].callback();
    harness.handlers['lastevent.session.reset']({ overlaySessionToken: 'overlay-new' });
    staleLastResponse.resolve();
    await refreshPromise;
    await flushPromises();

    expect(harness.renders).not.toContainEqual(expect.objectContaining({
      nickname: 'Stale Gift User'
    }));
    expect(harness.container.textContent).toBe('');
  });

  test('rejects an HTTP settings failure and recovers from the next successful socket connect', async () => {
    const failedSettings = {
      ok: false,
      status: 503,
      json: async () => ({ success: true, settings: { hideOnNullUser: true } })
    };
    const harness = createHarness({
      settings: { hideOnNullUser: true, showProfilePicture: false, showUsername: true },
      user: { nickname: 'Recovered Viewer', eventType: 'gifter' },
      settingsResponses: [failedSettings],
      useActualRenderer: true
    });

    await harness.context.initLastEventOverlay('gifter');
    expect(harness.container.textContent).toBe('');

    await harness.handlers.connect();
    await flushPromises();

    expect(harness.container.textContent).toContain('Recovered Viewer');
  });

  test('rejects an HTTP last-user failure and recovers from the next successful socket connect', async () => {
    const failedLastUser = {
      ok: false,
      status: 503,
      json: async () => ({
        success: true,
        overlaySessionToken: 'overlay-current',
        user: { nickname: 'Must Not Render', eventType: 'gifter' }
      })
    };
    const harness = createHarness({
      settings: { hideOnNullUser: true, showProfilePicture: false, showUsername: true },
      user: { nickname: 'Recovered Viewer', eventType: 'gifter' },
      lastResponses: [failedLastUser],
      useActualRenderer: true
    });

    await harness.context.initLastEventOverlay('gifter');
    expect(harness.context.__lastEventSingleOverlay.renderer.currentUser).toBeNull();

    await harness.handlers.connect();
    await flushPromises();

    expect(harness.container.textContent).toContain('Recovered Viewer');
    expect(harness.container.textContent).not.toContain('Must Not Render');
  });

  test('renders public display names and gift text as text in the original template renderer', async () => {
    const nickname = '<img id="name-injection" onerror="bad()">';
    const giftName = '<svg id="gift-injection" onload="bad()">';
    const harness = createHarness({
      settings: { hideOnNullUser: true, showProfilePicture: false, showUsername: true },
      user: {
        nickname,
        eventType: 'gifter',
        label: 'New Gift',
        metadata: { giftName, giftCount: 1, coins: 0 }
      },
      useActualRenderer: true
    });

    await harness.context.initLastEventOverlay('gifter');

    expect(harness.container.querySelector('#name-injection')).toBeNull();
    expect(harness.container.querySelector('#gift-injection')).toBeNull();
    expect(harness.container.querySelector('.username').textContent).toBe(nickname);
    expect(harness.container.querySelector('.gift-metadata').textContent).toContain(giftName);
    expect(harness.container.innerHTML).toContain('&lt;img');
    expect(harness.container.innerHTML).toContain('&lt;svg');
    expect(harness.container.innerHTML).not.toContain('<img id="name-injection"');
    expect(harness.container.innerHTML).not.toContain('<svg id="gift-injection"');
  });

  test('ignores an in-flight GET and queued socket update after final pagehide', async () => {
    const deferredLastResponse = createDeferredResponse({
      success: true,
      overlaySessionToken: 'overlay-current',
      user: { nickname: 'Late Fetch Viewer', eventType: 'gifter' }
    });
    const harness = createHarness({
      settings: { hideOnNullUser: true, showProfilePicture: false, showUsername: true, refreshIntervalSeconds: 7 },
      user: null,
      lastResponses: [deferredLastResponse.response],
      useActualRenderer: true
    });

    const initPromise = harness.context.initLastEventOverlay('gifter');
    await flushPromises();
    harness.context.window.dispatchEvent(new harness.context.window.PageTransitionEvent('pagehide', { persisted: false }));
    deferredLastResponse.resolve();
    await initPromise;
    await flushPromises();

    const textAfterFetch = harness.container.textContent;
    const renderer = harness.context.__lastEventSingleOverlay?.renderer;
    const userAfterFetch = renderer.currentUser;
    await harness.handlers['lastevent.update.gifter']({
      overlaySessionToken: 'overlay-current',
      nickname: 'Late Socket Viewer',
      eventType: 'gifter'
    });
    harness.context.window.dispatchEvent(new harness.context.window.PageTransitionEvent('pagehide', { persisted: false }));
    await flushPromises();

    expect(userAfterFetch).toBeNull();
    expect(renderer.currentUser).toBeNull();
    expect(textAfterFetch).not.toContain('Late Fetch Viewer');
    expect(harness.container.textContent).toBe(textAfterFetch);
    expect(harness.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.intervals).toHaveLength(1);
    expect(harness.intervals[0].cleared).toBe(true);
    expect(harness.context.clearInterval).toHaveBeenCalledTimes(1);
  });
});
