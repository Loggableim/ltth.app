'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const Matter = require('matter-js');

test('emoji-rain:es synthetic spawn reaches original HUD DOM and final cleanup', async () => {
  const appRoot = path.resolve(__dirname, '..');
  const dom = new JSDOM(fs.readFileSync(path.join(appRoot, 'plugins/emoji-rain/obs-hud.html'), 'utf8'), {
    url: 'http://127.0.0.1:3000/emoji-rain/obs-hud?lang=es',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  const { window } = dom;
  const handlers = new Map();
  const emitted = [];
  const socket = {
    on(event, handler) { handlers.set(event, [...(handlers.get(event) || []), handler]); },
    off(event, handler) { handlers.set(event, (handlers.get(event) || []).filter(fn => fn !== handler)); },
    emit(event, payload) { emitted.push({ event, payload }); },
    disconnect: jest.fn()
  };
  const pending = new Map();
  let timerId = 0;
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
    window[name] = callback => { pending.set(++timerId, callback); return timerId; };
  }
  for (const name of ['clearTimeout', 'clearInterval', 'cancelAnimationFrame']) {
    window[name] = id => pending.delete(id);
  }
  // The HUD has no translated emoji text. Seed the synthetic locale environment;
  // this proves the ES case's renderer flow, not shared i18n/backend acceptance.
  window.document.documentElement.lang = 'es';
  window.Matter = Matter;
  window.io = () => socket;
  const requests = [];
  const responses = {
    '/api/emoji-rain/config': { success: true, config: { enabled: true, obs_hud_enabled: true, rate_limit_enabled: false } },
    '/api/emoji-rain/user-mappings': { success: true, mappings: {} },
    '/api/emoji-rain/overlay/state': { success: true, state: { opacity: 0.75 } }
  };
  window.fetch = async (input, options = {}) => {
    const url = new URL(String(input), window.location.href);
    if (url.origin !== window.location.origin || !responses[url.pathname] ||
        (options.method && options.method !== 'GET')) throw new Error('Unexpected synthetic request');
    requests.push(url.pathname);
    return { ok: true, status: 200, json: async () => responses[url.pathname] };
  };
  try {
    window.eval(fs.readFileSync(path.join(appRoot, 'public/js/emoji-rain-obs-hud.js'), 'utf8'));
    for (let attempt = 0; attempt < 30 && !handlers.has('emoji-rain:spawn'); attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
    expect(handlers.has('emoji-rain:spawn')).toBe(true);
    expect(new URL(window.location.href).searchParams.get('lang')).toBe('es');
    expect(window.document.documentElement.lang).toBe('es');
    expect(window.document.querySelectorAll('.emoji-sprite')).toHaveLength(0);
    const deliver = payload => handlers.get('emoji-rain:spawn').forEach(handler => handler(payload));
    deliver({ count: 1, emoji: '✨', x: 0.5, y: 0.1 });
    const sprite = window.document.querySelector('.emoji-sprite');
    expect(sprite).not.toBeNull();
    expect(sprite.textContent).toBe('✨');
    expect(sprite.style.visibility).toBe('visible');
    expect(requests).toEqual(Object.keys(responses));
    expect(emitted).toEqual([]);
    window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: false }));
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(window.document.querySelectorAll('.emoji-sprite')).toHaveLength(0);
    expect(pending.size).toBe(0);
  } finally {
    window.close();
  }
});
