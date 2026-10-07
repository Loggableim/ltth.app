'use strict';

const { createFixtureTransport, readOverlayHtml, readOverlayScript } = require('./helpers/obs-overlay-jsdom-fixture');
const GoalsWebSocket = require('../plugins/goals/backend/websocket');

const LOCALES = ['de', 'en', 'es', 'fr'];
const GOAL_OVERLAY_COPY = {
  de: { remaining75: '75 bis zum Ziel', remaining60: '60 bis zum Ziel', reached: 'Ziel erreicht! 🎉', goal: 'Ziel', target: 'Ziel:' },
  en: { remaining75: '75 remaining', remaining60: '60 remaining', reached: 'Goal reached! 🎉', goal: 'Goal', target: 'Goal:' },
  es: { remaining75: 'Faltan 75', remaining60: 'Faltan 60', reached: '¡Meta alcanzada! 🎉', goal: 'Meta', target: 'Meta:' },
  fr: { remaining75: 'Il reste 75', remaining60: 'Il reste 60', reached: 'Objectif atteint ! 🎉', goal: 'Objectif', target: 'Objectif :' }
};

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(message);
}

async function bootTimer(locale, transport, options = {}) {
  const id = `fixture-timer-${locale}`;
  const { dom, loaded, rendererErrors } = transport.createDom({
    html: readOverlayHtml('advanced-timer'),
    pathname: '/plugins/advanced-timer/overlay/index.html',
    locale,
    query: options.query || `timer=${id}`,
    noGlobalSocket: Boolean(options.noGlobalSocket),
    existingWindowSocket: options.existingWindowSocket || null
  });
  await loaded;
  await waitFor(() => dom.window.i18n?.initialized && (dom.window.document.querySelector('.timer-display') || dom.window.document.querySelector('.timer-time') || dom.window.document.querySelector('.timer-overlay-error')), 'Timer renderer did not settle');
  return { dom, id, rendererErrors };
}

function timerRecord(id) {
  return {
    id,
    name: 'Synthetic timer',
    mode: 'countdown',
    current_value: 90,
    initial_duration: 90,
    target_value: 0,
    state: 'running',
    config: { animateOnRunning: false, animateOnComplete: false }
  };
}

function goalRecord(id, currentValue) {
  return {
    id,
    name: 'Synthetic goal',
    goal_type: 'coin',
    enabled: 1,
    current_value: currentValue,
    target_value: 100,
    start_value: 0,
    template_id: 'compact-bar',
    animation_on_update: 'fixture-no-animation',
    animation_on_reach: 'fixture-no-animation',
    theme: {},
    overlay_width: 500,
    overlay_height: 100
  };
}

function goalSnapshot(id, currentValue) {
  return {
    goalId: id,
    state: 'idle',
    previousState: null,
    data: { currentValue, targetValue: 100, startValue: 0, previousValue: currentValue, onReachAction: 'hide', onReachIncrement: 100 },
    progress: currentValue,
    isReached: currentValue >= 100
  };
}

describe('source-backed Advanced Timer and Goals renderer fixtures', () => {
  test('Advanced Timer: absent global socket is published once, locale changes update error, BFCache retains identity and final cleanup is owned', async () => {
    const id = 'fixture-timer-locale-error';
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timerOutcomes: [{ status: 404, body: { success: false } }] });
    let dom;
    try {
      ({ dom } = await bootTimer('de', transport, { noGlobalSocket: true, query: `timer=${id}` }));
      const socket = dom.window.__fixtureSocket;
      expect(dom.window.__fixtureSocketFactoryCalls).toBe(1);
      expect(dom.window.socket).toBe(socket);
      const message = dom.window.document.querySelector('.timer-overlay-error');
      expect(message.textContent).toBe('Timer nicht gefunden');
      expect(message.dataset.i18n).toBe('plugins.advanced-timer.runtime.overlayTimerNotFound');

      await dom.window.__fixtureTimers.flushTimeouts();
      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => dom.window.i18n?.currentLocale === 'fr' && message.textContent === 'Minuteur introuvable', 'Timer error was not localized after locale-changed');
      expect(message.dataset.i18n).toBe('plugins.advanced-timer.runtime.overlayTimerNotFound');

      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(dom.window.socket).toBe(socket);
      expect(socket.disconnectedByRenderer).toBe(false);
      expect(dom.window.__fixtureSocketFactoryCalls).toBe(1);

      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(dom.window.socket).toBeUndefined();
      expect(socket.disconnectedByRenderer).toBe(true);
    } finally { if (dom) transport.closeDom(dom); }
  });

  test('Advanced Timer: foreign window socket is preserved during renderer setup and cleanup', async () => {
    const id = 'fixture-timer-foreign-socket';
    const foreignSocket = { marker: 'foreign' };
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id) });
    let dom;
    try {
      ({ dom } = await bootTimer('de', transport, { noGlobalSocket: true, existingWindowSocket: foreignSocket }));
      expect(dom.window.socket).toBe(dom.window.__fixtureExistingWindowSocket);
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(dom.window.socket).toBe(dom.window.__fixtureExistingWindowSocket);
      expect(dom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
    } finally { if (dom) transport.closeDom(dom); }
  });

  test('Advanced Timer: locale-changed translates the real overlay title without changing running timer state', async () => {
    const id = 'fixture-timer-running-locale';
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id) });
    let dom;
    try {
      ({ dom } = await bootTimer('de', transport, { noGlobalSocket: true, query: `timer=${id}&template=progress` }));
      const socket = dom.window.__fixtureSocket;
      const display = dom.window.document.querySelector('.timer-time');
      const name = dom.window.document.querySelector('.timer-name');
      expect(dom.window.document.title).toBe('Timer-Overlay');
      expect(name.textContent).toBe('Synthetic timer');
      expect(display.textContent).toBe('01:30');
      expect(display.classList.contains('state-running')).toBe(true);

      await dom.window.__fixtureTimers.flushTimeouts();
      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => dom.window.i18n?.currentLocale === 'fr' && dom.window.document.title === 'Superposition de minuterie', 'Timer title was not localized after locale-changed');
      expect(display.textContent).toBe('01:30');
      expect(display.classList.contains('state-running')).toBe(true);
      expect(dom.window.__fixtureSocketFactoryCalls).toBe(1);
    } finally { if (dom) transport.closeDom(dom); }
  });

  test('loads the actual entry template and renderer script without source rewriting', () => {
    expect(readOverlayHtml('advanced-timer')).toContain('<script src="/plugins/advanced-timer/overlay/overlay.js?v=3"></script>');
    expect(readOverlayHtml('goals')).toContain('<script src="/plugins/goals/overlay/overlay.js"></script>');
    expect(readOverlayScript('advanced-timer')).toBe(require('fs').readFileSync(require('path').join(__dirname, '../plugins/advanced-timer/overlay/overlay.js'), 'utf8'));
    expect(readOverlayScript('goals')).toBe(require('fs').readFileSync(require('path').join(__dirname, '../plugins/goals/overlay/overlay.js'), 'utf8'));
  });

  test.each(LOCALES)('Advanced Timer %s: exact synthetic GET routes, initial render, matching tick and cleanup', async locale => {
    const id = `fixture-timer-${locale}`;
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id) });
    let dom;
    let socket;
    try {
      const booted = await bootTimer(locale, transport);
      dom = booted.dom;
      socket = dom.window.__fixtureSocket;
      expect(dom.window.document.querySelector('.timer-display').textContent).toBe('01:30');
      expect(transport.requests.map(request => request.path)).toEqual([
        `/api/i18n/translations/de`,
        ...(locale === 'de' ? [] : [`/api/i18n/translations/${locale}`]),
        `/api/advanced-timer/timers/${id}`,
        `/api/advanced-timer/timers/${id}/rotator`,
        `/api/advanced-timer/timers/${id}/threshold-effects`
      ]);
      expect(transport.requests.every(request => request.method === 'GET')).toBe(true);

      dom.window.__fixtureSocket.deliver('advanced-timer:tick', { id: 'fixture-timer-other', currentValue: 12, state: 'paused' });
      expect(dom.window.document.querySelector('.timer-display').textContent).toBe('01:30');
      dom.window.__fixtureSocket.deliver('advanced-timer:tick', { id, currentValue: 89, state: 'running' });
      expect(dom.window.document.querySelector('.timer-display').textContent).toBe('01:29');
      expect(dom.window.document.querySelector('.timer-display').classList.contains('state-running')).toBe(true);
      expect(transport.socketEmits).toEqual([]);
      expect(transport.deniedRequests).toEqual([]);
      expect(dom.window.__fixtureTimers.timeouts).toHaveLength(0);
      expect(dom.window.__fixtureTimers.intervals).toHaveLength(0);
      expect(booted.rendererErrors).toEqual([]);
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.disconnectedByRenderer).toBe(true);
      expect(socket.handlers.size).toBe(0);
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
    expect(socket.handlers.size).toBe(0);
    const emissionsAtClose = socket.emitted.length;
    socket.deliver('advanced-timer:tick', { id, currentValue: 1, state: 'paused' });
    expect(socket.emitted).toHaveLength(emissionsAtClose);
  });

  test.each([404, 503, 'network'])('Advanced Timer %s: distinguishes not-found from temporary failure and recovers after a clean reload', async status => {
    const locale = 'de';
    const id = `fixture-timer-${locale}`;
    const transport = createFixtureTransport({
      plugin: 'advanced-timer',
      id,
      timer: timerRecord(id),
      timerOutcomes: [status === 'network' ? { reject: true } : { status }, { status: 200 }]
    });
    let failedDom;
    let recoveredDom;
    try {
      const failed = await bootTimer(locale, transport);
      failedDom = failed.dom;
      const errorText = failedDom.window.document.querySelector('.timer-overlay-error').textContent;
      const expected = status === 404
        ? failedDom.window.i18n.t('plugins.advanced-timer.runtime.overlayTimerNotFound')
        : failedDom.window.i18n.t('plugins.advanced-timer.runtime.overlayTemporarilyUnavailable');
      expect(errorText).toBe(expected);
      expect(failedDom.window.__fixtureTimers.timeouts).toHaveLength(0);
      expect(failedDom.window.__fixtureTimers.intervals).toHaveLength(0);
      expect(transport.requests.filter(request => request.path === `/api/advanced-timer/timers/${id}`)).toHaveLength(1);

      failedDom.window.dispatchEvent(new failedDom.window.Event('pagehide'));
      expect(failedDom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
      transport.closeDom(failedDom);
      const recovered = await bootTimer(locale, transport);
      recoveredDom = recovered.dom;
      expect(recoveredDom.window.document.querySelector('.timer-display').textContent).toBe('01:30');
      expect(transport.requests.filter(request => request.path === `/api/advanced-timer/timers/${id}`)).toHaveLength(2);
      expect(transport.deniedRequests).toEqual([]);
      recoveredDom.window.dispatchEvent(new recoveredDom.window.Event('pagehide'));
      expect(recoveredDom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
    } finally {
      if (failedDom) transport.closeDom(failedDom);
      if (recoveredDom) transport.closeDom(recoveredDom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Advanced Timer: a deferred successful fetch after duplicate pagehide cannot render or install listeners', async () => {
    const id = 'fixture-timer-late';
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id), timerOutcomes: [{ defer: true }] });
    let dom;
    let observer;
    try {
      const { dom: loadedDom, loaded, domReady } = transport.createDom({
        html: readOverlayHtml('advanced-timer'),
        pathname: '/plugins/advanced-timer/overlay/index.html',
        locale: 'de',
        query: `timer=${id}`
      });
      dom = loadedDom;
      await loaded;
      await domReady;
      await waitFor(() => dom.window.i18n?.initialized, 'Timer i18n fixture did not settle');
      await waitFor(() => transport.requests.some(request => request.path === `/api/advanced-timer/timers/${id}`), 'Deferred timer request did not start');

      const socket = dom.window.__fixtureSocket;
      const container = dom.window.document.getElementById('timer-container');
      const initialHtml = container.innerHTML;
      let mutationCount = 0;
      observer = new dom.window.MutationObserver(records => { mutationCount += records.length; });
      observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.disconnectCalls).toBe(1);
      transport.resolveNextTimerResponse();
      await new Promise(resolve => setImmediate(resolve));
      await Promise.resolve();

      expect(container.innerHTML).toBe(initialHtml);
      expect(mutationCount).toBe(0);
      expect(transport.requests.filter(request => request.path.startsWith(`/api/advanced-timer/timers/${id}/`))).toEqual([]);
      expect(socket.handlers.size).toBe(0);
      observer.disconnect();
      observer = null;
    } finally {
      observer?.disconnect();
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Advanced Timer: persisted pagehide keeps the restored timer socket and accepts the next tick', async () => {
    const id = 'fixture-timer-en';
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id) });
    let dom;
    try {
      const { dom: loadedDom } = await bootTimer('en', transport);
      dom = loadedDom;
      const socket = dom.window.__fixtureSocket;
      expect(dom.window.document.querySelector('.timer-display').textContent).toBe('01:30');
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket.disconnectedByRenderer).toBe(false);
      expect(socket.handlers.has('advanced-timer:tick')).toBe(true);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
      socket.deliver('advanced-timer:tick', { id, currentValue: 88, state: 'running' });
      expect(dom.window.document.getElementById('timer-container').textContent).toContain('01:28');
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectedByRenderer).toBe(true);
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test.each(LOCALES)('Advanced Timer %s: retained event listeners accept updates after synthetic transport reconnect', async locale => {
    const id = `fixture-timer-${locale}`;
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id) });
    let dom;
    try {
      const { dom: loadedDom } = await bootTimer(locale, transport);
      dom = loadedDom;
      const socket = dom.window.__fixtureSocket;
      const listenersBeforeReconnect = [...socket.handlers.values()].reduce((sum, handlers) => sum + handlers.length, 0);
      expect(dom.window.document.querySelector('.timer-display').textContent).toBe('01:30');

      socket.simulateTransportDisconnect();
      expect(socket.connected).toBe(false);
      expect([...socket.handlers.values()].reduce((sum, handlers) => sum + handlers.length, 0)).toBe(listenersBeforeReconnect);
      socket.simulateTransportReconnect();
      expect(socket.connected).toBe(true);
      expect([...socket.handlers.values()].reduce((sum, handlers) => sum + handlers.length, 0)).toBe(listenersBeforeReconnect);
      socket.deliver('advanced-timer:tick', { id, currentValue: 88, state: 'running' });
      expect(dom.window.document.querySelector('.timer-display').textContent).toBe('01:28');
      expect(transport.deniedRequests).toEqual([]);

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.disconnectedByRenderer).toBe(true);
      expect(socket.handlers.size).toBe(0);
      expect(() => socket.simulateTransportReconnect()).toThrow('renderer-closed fixture socket cannot reconnect');
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test.each(LOCALES)('Goals %s: subscribes with its locale fake id, rejects wrong ids, updates and recovers from not-found', async locale => {
    const id = `fixture-goal-${locale}`;
    const transport = createFixtureTransport({ plugin: 'goals', id });
    let dom;
    let socket;
    try {
      const { dom: loadedDom, loaded, rendererErrors } = transport.createDom({
        html: readOverlayHtml('goals'),
        pathname: '/goals/overlay',
        locale,
        query: `id=${id}`
      });
      dom = loadedDom;
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized, 'Goals i18n fixture did not settle');
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      socket = dom.window.__fixtureSocket;
      expect(transport.socketEmits).toEqual([{ event: 'goals:subscribe', payload: id }]);
      expect(transport.requests.every(request => /^\/api\/i18n\/translations\/[a-z]{2}$/.test(request.path))).toBe(true);

      dom.window.__fixtureSocket.deliver('goals:error', { error: 'Goal not found', goalId: 'fixture-goal-other' });
      expect(dom.window.document.getElementById('goal-container').textContent.trim()).toBe('');
      dom.window.__fixtureSocket.deliver('goals:error', { error: 'Goal not found', goalId: id });
      expect(dom.window.document.querySelector('[role="alert"]').textContent).toBe(
        dom.window.i18n.t('plugins.goals.goals.overlay.goal_not_found')
      );

      const initialGoal = goalRecord(id, 25);
      dom.window.__fixtureSocket.deliver('goals:subscribed', { goalId: id, goal: initialGoal, state: goalSnapshot(id, 25) });
      expect(dom.window.document.querySelector('.compact-bar-values').textContent.trim()).toBe('25 / 100');
      expect(dom.window.document.querySelector('.compact-bar-fill').style.width).toBe('25%');
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe(GOAL_OVERLAY_COPY[locale].remaining75);
      expect(dom.window.document.querySelector('.compact-bar-name').textContent).toBe('Synthetic goal');

      dom.window.__fixtureSocket.deliver('goals:config-changed', { goal: { ...initialGoal, template_id: 'vertical-meter' } });
      expect(dom.window.document.querySelector('.vertical-meter-target').textContent.trim()).toBe(`${GOAL_OVERLAY_COPY[locale].target} 100`);
      dom.window.__fixtureSocket.deliver('goals:config-changed', { goal: { ...initialGoal, template_id: 'glassy-card' } });
      expect(dom.window.document.querySelectorAll('.glassy-stat-label')[1].textContent.trim()).toBe(GOAL_OVERLAY_COPY[locale].goal);
      dom.window.__fixtureSocket.deliver('goals:config-changed', { goal: initialGoal });

      dom.window.__fixtureSocket.deliver('goals:value-changed', {
        goalId: 'fixture-goal-other',
        goal: goalRecord('fixture-goal-other', 99),
        state: goalSnapshot('fixture-goal-other', 99)
      });
      expect(dom.window.document.querySelector('.compact-bar-values').textContent.trim()).toBe('25 / 100');

      dom.window.__fixtureSocket.deliver('goals:value-changed', {
        goalId: id,
        goal: goalRecord(id, 40),
        state: goalSnapshot(id, 40)
      });
      expect(dom.window.document.querySelector('.compact-bar-values').textContent.trim()).toBe('40 / 100');
      expect(dom.window.document.querySelector('.compact-bar-fill').style.width).toBe('40%');
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe(GOAL_OVERLAY_COPY[locale].remaining60);

      dom.window.__fixtureSocket.deliver('goals:reached', {
        goalId: id,
        goal: goalRecord(id, 100),
        state: goalSnapshot(id, 100)
      });
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe(GOAL_OVERLAY_COPY[locale].reached);
      expect(transport.deniedRequests).toEqual([]);
      expect(dom.window.__fixtureTimers.pendingTimeoutCount()).toBe(2);
      expect(dom.window.__fixtureTimers.intervals).toHaveLength(0);
      await dom.window.__fixtureTimers.flushTimeouts();
      expect(dom.window.__fixtureTimers.pendingTimeoutCount()).toBe(0);
      expect(transport.socketEmits).toEqual([
        { event: 'goals:subscribe', payload: id },
        { event: 'goals:animation-end', payload: { goalId: id, animationType: 'update' } },
        { event: 'goals:animation-end', payload: { goalId: id, animationType: 'reach' } }
      ]);
      expect(rendererErrors).toEqual([]);

      dom.window.__fixtureSocket.deliver('goals:error', { error: 'Synthetic service error', goalId: id });
      expect(dom.window.document.querySelector('[role="alert"]').textContent).toBe(
        dom.window.i18n.t('plugins.goals.goals.overlay.temporarily_unavailable')
      );
      dom.window.__fixtureSocket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 40), state: goalSnapshot(id, 40) });
      expect(dom.window.document.querySelector('[role="alert"]')).toBeNull();
      expect(dom.window.document.querySelector('.compact-bar-values').textContent.trim()).toBe('40 / 100');

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.disconnectedByRenderer).toBe(true);
      expect(socket.emitted.some(entry => entry.event === 'goals:unsubscribe')).toBe(false);
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.emitted.filter(entry => entry.event === 'goals:unsubscribe')).toHaveLength(0);
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
    expect(socket.handlers.size).toBe(0);
    const emissionsAtClose = socket.emitted.length;
    socket.deliver('goals:value-changed', { goalId: id, goal: goalRecord(id, 99), state: goalSnapshot(id, 99) });
    expect(socket.emitted).toHaveLength(emissionsAtClose);
    expect(transport.socketEmits.map(entry => entry.event)).toEqual(['goals:subscribe', 'goals:animation-end', 'goals:animation-end']);
  });

  test('Goals: changing language rerenders current template labels without translating the user goal name', async () => {
    const id = 'fixture-goal-language';
    const transport = createFixtureTransport({ plugin: 'goals', id });
    let dom;
    try {
      const created = transport.createDom({
        html: readOverlayHtml('goals'), pathname: '/goals/overlay', locale: 'de', query: `id=${id}`, noGlobalSocket: true
      });
      dom = created.dom;
      await created.loaded;
      await waitFor(() => dom.window.i18n?.initialized, 'Goals i18n fixture did not settle');
      await dom.window.__fixtureTimers.flushTimeouts();
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      const socket = dom.window.__fixtureSocket;
      expect(dom.window.socket).toBe(socket);
      expect(socket.handlers.get('locale-changed')).toHaveLength(1);
      const goal = goalRecord(id, 25);
      socket.deliver('goals:subscribed', { goalId: id, goal, state: goalSnapshot(id, 25) });
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe(GOAL_OVERLAY_COPY.de.remaining75);

      for (const locale of ['en', 'es', 'fr']) {
        socket.deliver('locale-changed', { locale });
        await waitFor(() => dom.window.i18n.currentLocale === locale, `i18n did not apply socket locale ${locale}`);
        expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe(GOAL_OVERLAY_COPY[locale].remaining75);
        expect(dom.window.document.querySelector('.compact-bar-name').textContent).toBe('Synthetic goal');
      }

      socket.deliver('goals:config-changed', { goal: { ...goal, template_id: 'vertical-meter' } });
      expect(dom.window.document.querySelector('.vertical-meter-target').textContent.trim()).toBe('Objectif : 100');
      socket.deliver('goals:config-changed', { goal: { ...goal, template_id: 'glassy-card' } });
      expect(dom.window.document.querySelectorAll('.glassy-stat-label')[1].textContent.trim()).toBe(GOAL_OVERLAY_COPY.fr.goal);
      expect(transport.deniedRequests).toEqual([]);
      expect(transport.requests.filter(request => request.path.startsWith('/api/i18n/translations/')).map(request => request.path)).toEqual([
        '/api/i18n/translations/de', '/api/i18n/translations/en', '/api/i18n/translations/es', '/api/i18n/translations/fr'
      ]);
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.disconnectedByRenderer).toBe(true);
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Goals: missing translated remaining key interpolates the safe fallback value', async () => {
    const id = 'fixture-goal-missing-label';
    const transport = createFixtureTransport({ plugin: 'goals', id });
    let dom;
    try {
      const created = transport.createDom({
        html: readOverlayHtml('goals'), pathname: '/goals/overlay', locale: 'de', query: `id=${id}`, noGlobalSocket: true
      });
      dom = created.dom;
      await created.loaded;
      await waitFor(() => dom.window.i18n?.initialized, 'Goals i18n fixture did not settle');
      await dom.window.__fixtureTimers.flushTimeouts();
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      const socket = dom.window.__fixtureSocket;
      socket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 25), state: goalSnapshot(id, 25) });

      const originalFetch = dom.window.fetch;
      dom.window.fetch = async (input, options) => {
        const response = await originalFetch(input, options);
        if (new URL(String(input), 'http://127.0.0.1:3000').pathname !== '/api/i18n/translations/fr') return response;
        const catalog = await response.json();
        delete catalog.plugins.goals.goals.overlay.remaining;
        return { ok: true, status: 200, statusText: 'OK', json: async () => catalog };
      };
      expect(await dom.window.i18n.changeLanguage('fr')).toBe(true);
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe('75 remaining');
      expect(dom.window.document.querySelector('.compact-bar-name').textContent).toBe('Synthetic goal');
      expect(transport.deniedRequests).toEqual([]);
      socket.disconnect();
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Goals: deletion clears cached state so locale refresh stays empty until a fresh subscription', async () => {
    const id = 'fixture-goal-delete-locale';
    const transport = createFixtureTransport({ plugin: 'goals', id });
    let dom;
    try {
      const created = transport.createDom({
        html: readOverlayHtml('goals'), pathname: '/goals/overlay', locale: 'de', query: `id=${id}`, noGlobalSocket: true
      });
      dom = created.dom;
      await created.loaded;
      await waitFor(() => dom.window.i18n?.initialized, 'Goals i18n fixture did not settle');
      await dom.window.__fixtureTimers.flushTimeouts();
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      const socket = dom.window.__fixtureSocket;
      socket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 25), state: goalSnapshot(id, 25) });
      expect(dom.window.document.querySelector('.compact-bar-name').textContent).toBe('Synthetic goal');

      socket.deliver('goals:deleted', { goalId: id });
      const container = dom.window.document.getElementById('goal-container');
      expect(container.childElementCount).toBe(0);
      expect(container.classList.contains('hidden')).toBe(false);
      expect(container.style.width).toBe('');
      expect(container.style.height).toBe('');

      for (const locale of ['en', 'es', 'fr']) {
        socket.deliver('locale-changed', { locale });
        await waitFor(() => dom.window.i18n.currentLocale === locale, `i18n did not apply socket locale ${locale}`);
        expect(container.childElementCount).toBe(0);
        expect(container.textContent).toBe('');
      }

      socket.deliver('goals:subscribed', {
        goalId: id,
        goal: { ...goalRecord(id, 55), name: 'Fresh goal after resubscription' },
        state: goalSnapshot(id, 55)
      });
      expect(dom.window.document.querySelector('.compact-bar-name').textContent).toBe('Fresh goal after resubscription');
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe('Il reste 45');
      expect(transport.deniedRequests).toEqual([]);
      socket.disconnect();
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Goals: error then deletion before i18n ready stays empty after late ready and locale change', async () => {
    const id = 'fixture-goal-delete-before-i18n';
    const transport = createFixtureTransport({ plugin: 'goals', id, translationOutcomes: [{ defer: true }] });
    let dom;
    try {
      const created = transport.createDom({
        html: readOverlayHtml('goals'), pathname: '/goals/overlay', locale: 'de', query: `id=${id}`, noGlobalSocket: true
      });
      dom = created.dom;
      await created.loaded;
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      expect(dom.window.i18n.initialized).toBe(false);

      const socket = dom.window.__fixtureSocket;
      socket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 25), state: goalSnapshot(id, 25) });
      socket.deliver('goals:error', { goalId: id, error: 'Synthetic service failure' });
      expect(dom.window.document.querySelector('[role="alert"]')).not.toBeNull();
      socket.deliver('goals:deleted', { goalId: id });
      const container = dom.window.document.getElementById('goal-container');
      expect(container.childElementCount).toBe(0);

      transport.resolveNextTranslationResponse();
      await dom.window.i18n.ready;
      await new Promise(resolve => setImmediate(resolve));
      expect(container.childElementCount).toBe(0);
      expect(container.textContent).toBe('');

      await dom.window.__fixtureTimers.flushTimeouts();
      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => dom.window.i18n.currentLocale === 'fr', 'i18n did not apply late socket locale');
      expect(container.childElementCount).toBe(0);
      expect(container.textContent).toBe('');

      socket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 55), state: goalSnapshot(id, 55) });
      expect(dom.window.document.querySelector('.compact-bar-name').textContent).toBe('Synthetic goal');
      expect(dom.window.document.querySelector('.compact-bar-remaining').textContent.trim()).toBe('Il reste 45');
      expect(transport.deniedRequests).toEqual([]);
      socket.disconnect();
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Goals: queued subscribed delivery and animation completion after pagehide cause no render or socket emit', async () => {
    const id = 'fixture-goal-late';
    const transport = createFixtureTransport({ plugin: 'goals', id });
    let dom;
    let socket;
    let observer;
    try {
      const created = transport.createDom({
        html: readOverlayHtml('goals'),
        pathname: '/goals/overlay',
        locale: 'de',
        query: `id=${id}`
      });
      dom = created.dom;
      await created.loaded;
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      socket = dom.window.__fixtureSocket;
      socket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 25), state: goalSnapshot(id, 25) });
      socket.deliver('goals:value-changed', {
        goalId: id,
        goal: { ...goalRecord(id, 40), animation_on_update: 'bounce' },
        state: goalSnapshot(id, 40)
      });
      expect(dom.window.__fixtureTimers.pendingTimeoutCount()).toBe(1);

      const queuedSubscribed = socket.queueDelivery('goals:subscribed', {
        goalId: id,
        goal: goalRecord(id, 90),
        state: goalSnapshot(id, 90)
      });
      const container = dom.window.document.getElementById('goal-container');
      let mutationCount = 0;
      observer = new dom.window.MutationObserver(records => { mutationCount += records.length; });
      observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });

      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(socket.disconnectCalls).toBe(1);
      expect(socket.emitted.filter(entry => entry.event === 'goals:unsubscribe')).toHaveLength(0);
      const emittedAtDestroy = socket.emitted.length;
      const animationAtDestroy = container.querySelector('.compact-bar-fill').style.animation;
      queuedSubscribed();
      await dom.window.__fixtureTimers.flushTimeouts();
      await Promise.resolve();

      expect(container.querySelector('.compact-bar-values').textContent.trim()).toBe('40 / 100');
      expect(container.querySelector('.compact-bar-fill').style.animation).toBe(animationAtDestroy);
      expect(mutationCount).toBe(0);
      expect(socket.emitted).toHaveLength(emittedAtDestroy);
      expect(dom.window.__fixtureTimers.pendingTimeoutCount()).toBe(0);
      observer.disconnect();
      observer = null;
    } finally {
      observer?.disconnect();
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Goals: persisted pagehide keeps the goal subscription for restored value updates', async () => {
    const id = 'fixture-goal-bfcache';
    const transport = createFixtureTransport({ plugin: 'goals', id });
    let dom;
    try {
      const created = transport.createDom({
        html: readOverlayHtml('goals'), pathname: '/goals/overlay', locale: 'en', query: `id=${id}`
      });
      dom = created.dom;
      await created.loaded;
      await waitFor(() => transport.socketEmits.some(entry => entry.event === 'goals:subscribe'), 'Goals renderer did not subscribe');
      const socket = dom.window.__fixtureSocket;
      socket.deliver('goals:subscribed', { goalId: id, goal: goalRecord(id, 25), state: goalSnapshot(id, 25) });
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
      expect(socket.disconnectedByRenderer).toBe(false);
      expect(socket.emitted.filter(entry => entry.event === 'goals:unsubscribe')).toHaveLength(0);
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
      socket.deliver('goals:value-changed', {
        goalId: id, goal: goalRecord(id, 40), state: goalSnapshot(id, 40)
      });
      expect(dom.window.document.querySelector('.compact-bar-values').textContent.trim()).toBe('40 / 100');
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(socket.disconnectedByRenderer).toBe(true);
      expect(socket.emitted.filter(entry => entry.event === 'goals:unsubscribe')).toHaveLength(0);
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });

  test('Goals unsubscribe is an existing server contract that only leaves the goal room', () => {
    const handlers = new Map();
    const api = { registerSocket: (event, handler) => handlers.set(event, handler), getSocketIO: () => null, log() {} };
    const db = { getGoal: jest.fn(() => { throw new Error('DB access is forbidden in this contract check'); }) };
    const websocket = new GoalsWebSocket({ api, db, stateMachineManager: {} });
    websocket.registerHandlers();
    const socket = { leave: jest.fn() };
    handlers.get('goals:unsubscribe')(socket, 'fixture-goal-de');
    expect(socket.leave).toHaveBeenCalledTimes(1);
    expect(socket.leave).toHaveBeenCalledWith('goal:fixture-goal-de');
    expect(db.getGoal).not.toHaveBeenCalled();
  });

  test('unknown HTTP paths, external scripts and non-read socket actions fail closed', async () => {
    const id = 'fixture-timer-de';
    const transport = createFixtureTransport({ plugin: 'advanced-timer', id, timer: timerRecord(id) });
    let dom;
    try {
      const loaded = await bootTimer('de', transport);
      dom = loaded.dom;
      const denied = await dom.window.fetch('/api/advanced-timer/timers/fixture-timer-de/delete', { method: 'DELETE' });
      expect(denied.status).toBe(404);
      const unknownPath = await dom.window.fetch('/api/unknown/product-route');
      expect(unknownPath.status).toBe(404);
      const blockedScript = dom.window.document.createElement('script');
      const scriptRejected = new Promise(resolve => blockedScript.addEventListener('error', resolve, { once: true }));
      blockedScript.src = 'https://example.invalid/third-party.js';
      dom.window.document.head.appendChild(blockedScript);
      await scriptRejected;
      dom.window.__fixtureSocket.emit('advanced-timer:delete', id);
      expect(transport.deniedRequests).toHaveLength(4);
      expect(transport.deniedRequests[0].reason).toBe('origin-or-method');
      expect(transport.deniedRequests[1].reason).toBe('unknown-route');
      expect(transport.deniedRequests[2].reason).toBe('unknown-script-resource');
      expect(transport.deniedRequests[3].reason).toBe('unknown-socket-event');
    } finally {
      if (dom) transport.closeDom(dom);
    }
    expect(transport.isClosed()).toBe(true);
  });
});
