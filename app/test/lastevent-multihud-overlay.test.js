const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const overlayScriptPath = path.join(__dirname, '../plugins/spotlight/overlays/multihud.js');

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

function createDeferredUsersResponse(payload) {
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

function createOverlayHarness({ settings, users, allResponses = [] }) {
  const dom = new JSDOM('<!DOCTYPE html><div id="overlay-container"></div>');
  const handlers = {};
  const intervals = [];
  const renders = [];
  const updates = [];

  class FakeTemplateRenderer {
    constructor(container, initialSettings) {
      this.container = container;
      this.settings = initialSettings;
    }

    updateSettings(newSettings) {
      this.settings = newSettings;
      updates.push(newSettings);
    }

    async render(userData) {
      renders.push(userData);
      this.container.innerHTML = userData
        ? `<div class="user-display">${userData.nickname}</div>`
        : '';
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
    fetch: jest.fn(async url => ({
      json: async () => {
        if (url === '/api/lastevent/settings/multihud') {
          return { success: true, settings };
        }
        if (url === '/api/lastevent/all' || url.startsWith('/api/lastevent/all?selected=')) {
          const queuedResponse = allResponses.shift();
          if (queuedResponse) {
            return queuedResponse;
          }
          return { success: true, users };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      }
    })),
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
    },
    TemplateRenderer: FakeTemplateRenderer
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(overlayScriptPath, 'utf8'), context);

  return {
    context,
    handlers,
    intervals,
    renders,
    updates,
    container: dom.window.document.getElementById('overlay-container')
  };
}

describe('LastEvent Multi-HUD overlay', () => {
  test('rotates only through selected events that currently have data', async () => {
    const followerUser = { nickname: 'Follower User', eventType: 'follower' };
    const harness = createOverlayHarness({
      settings: {
        selectedEvents: ['follower', 'like'],
        rotationIntervalSeconds: 5,
        hideOnNullUser: true
      },
      users: {
        follower: followerUser,
        like: null
      }
    });

    await harness.context.init();
    await flushPromises();

    expect(harness.context.fetch).toHaveBeenCalledWith('/api/lastevent/all?selected=follower%2Clike');
    expect(harness.renders.at(-1)).toBe(followerUser);
    expect(harness.context.setInterval).not.toHaveBeenCalled();
  });

  test('shows the next selected event after a session reset instead of staying blank', async () => {
    const likeUser = { nickname: 'Like User', eventType: 'like' };
    const harness = createOverlayHarness({
      settings: {
        selectedEvents: ['follower', 'like'],
        rotationIntervalSeconds: 5,
        hideOnNullUser: true
      },
      users: {
        follower: null,
        like: null
      }
    });

    await harness.context.init();
    await flushPromises();

    harness.handlers['lastevent.session.reset']();
    await harness.handlers['lastevent.multihud.update']({ type: 'like', user: likeUser });
    await flushPromises();

    expect(harness.renders.at(-1)).toBe(likeUser);
    expect(harness.container.textContent).toContain('Like User');
  });

  test('ignores stale all-user responses that resolve after a session reset', async () => {
    const staleResponse = createDeferredUsersResponse({
      success: true,
      sessionId: 'session-old',
      users: {
        follower: { nickname: 'Stale Follower', eventType: 'follower' }
      }
    });
    const harness = createOverlayHarness({
      settings: {
        selectedEvents: ['follower'],
        rotationIntervalSeconds: 5,
        hideOnNullUser: true
      },
      users: {
        follower: null
      },
      allResponses: [
        { json: async () => ({ success: true, sessionId: 'session-current', users: { follower: null } }) },
        staleResponse.response
      ]
    });

    await harness.context.init();
    await flushPromises();

    const settingsPromise = harness.handlers['lastevent.settings.multihud']({
      selectedEvents: ['follower'],
      rotationIntervalSeconds: 5
    });
    harness.handlers['lastevent.session.reset']({ sessionId: 'session-new' });
    staleResponse.resolve();
    await settingsPromise;
    await flushPromises();

    expect(harness.renders).not.toContainEqual(expect.objectContaining({
      nickname: 'Stale Follower'
    }));
    expect(harness.container.textContent).toBe('');
  });
});
