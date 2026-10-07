'use strict';

const { createQuizShowTransport } = require('./helpers/obs-quiz-show-jsdom-fixture');
const LOCALES = ['de', 'en', 'es', 'fr'];
const TIMER_LABELS = {
  de: 'Sekunden verbleibend',
  en: 'Seconds remaining',
  es: 'Segundos restantes',
  fr: 'Secondes restantes'
};
async function waitFor(predicate, message) {
  for (let i = 0; i < 100; i += 1) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
  throw new Error(message);
}
describe('source-backed Quiz Show renderer fixture', () => {
  test('publishes its single socket for real locale changes and preserves runtime state across BFCache', async () => {
    const fixture = createQuizShowTransport({ locale: 'de' });
    const { dom, loaded } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized, 'Quiz Show i18n did not initialize');
      const socket = dom.window.__fixtureSocket;
      expect(dom.window.socket).toBe(socket);
      expect(dom.window.__fixtureSocketFactoryCalls).toBe(1);
      socket.deliver('quiz-show:state-update', {
        isRunning: true, currentQuestion: { question: 'Fixture question?', answers: ['A', 'B', 'C', 'D'], category: 'Fixture' },
        timeRemaining: 20, totalTime: 30, currentRound: 2, totalRounds: 5,
        votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }, voterIconsConfig: { enabled: false }, hiddenAnswers: []
      });
      socket.deliver('quiz-show:time-update', { timeRemaining: 20, totalTime: 30 });
      const roundText = dom.window.document.getElementById('roundNumberText');
      const timerValue = dom.window.document.getElementById('timerValue');
      const questionText = dom.window.document.querySelector('.question-text') || dom.window.document.getElementById('questionText');
      const answers = [...dom.window.document.querySelectorAll('.answer-text')].map(node => node.textContent);
      expect(roundText.textContent).toBe('Runde 2 / 5');
      expect(timerValue.textContent).toBe('20');
      expect(questionText.textContent).toContain('Fixture question?');

      for (const [id, timer] of fixture.timers) {
        if (timer.delay !== 100) continue;
        fixture.timers.delete(id);
        timer.callback(...(timer.args || []));
      }
      socket.deliver('locale-changed', { locale: 'fr' });
      await waitFor(() => dom.window.i18n?.currentLocale === 'fr', 'Quiz Show locale did not change');
      for (const [id, timer] of [...fixture.timers]) {
        if (timer.delay !== 0) continue;
        fixture.timers.delete(id);
        timer.callback(...(timer.args || []));
      }
      expect(roundText.textContent).toBe('Manche 2 / 5');
      expect(timerValue.textContent).toBe('20');
      expect(questionText.textContent).toContain('Fixture question?');
      expect([...dom.window.document.querySelectorAll('.answer-text')].map(node => node.textContent)).toEqual(answers);

      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true }));
      expect(dom.window.socket).toBe(socket);
      expect(socket.disconnectedByRenderer).toBe(false);
      expect(dom.window.__fixtureSocketFactoryCalls).toBe(1);
      socket.deliver('quiz-show:state-update', {
        isRunning: true, currentQuestion: { question: 'Fixture question?', answers: ['A', 'B', 'C', 'D'], category: 'Fixture' },
        timeRemaining: 17, totalTime: 30, currentRound: 2, totalRounds: 5,
        votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }, voterIconsConfig: { enabled: false }, hiddenAnswers: []
      });
      socket.deliver('quiz-show:time-update', { timeRemaining: 17, totalTime: 30 });
      expect(timerValue.textContent).toBe('17');
      const textBeforeDestroy = dom.window.document.body.textContent;
      dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
      expect(dom.window.socket).toBeUndefined();
      expect(socket.disconnectedByRenderer).toBe(true);
      socket.deliver('quiz-show:state-update', {
        isRunning: true, currentQuestion: { question: 'Late question?', answers: ['late A', 'late B', 'late C', 'late D'], category: 'Fixture' },
        timeRemaining: 1, totalTime: 30, currentRound: 5, totalRounds: 5,
        votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }, voterIconsConfig: { enabled: false }, hiddenAnswers: []
      });
      socket.deliver('locale-changed', { locale: 'en' });
      expect(dom.window.document.body.textContent).toBe(textBeforeDestroy);
    } finally { fixture.closeDom(dom); }
  });

  test('does not overwrite or clear a foreign window socket', async () => {
    const foreignSocket = { marker: 'foreign' };
    const fixture = createQuizShowTransport({ locale: 'de', existingWindowSocket: foreignSocket });
    const { dom, loaded } = fixture.createDom();
    try {
      await loaded;
      expect(dom.window.socket).toBe(dom.window.__fixtureExistingWindowSocket);
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(dom.window.socket).toBe(dom.window.__fixtureExistingWindowSocket);
      expect(dom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
    } finally { fixture.closeDom(dom); }
  });

  test.each(LOCALES)('%s: fixed synthetic layout/brand routes, question state and audio-free cleanup', async locale => {
    const fixture = createQuizShowTransport({ locale }); const { dom, loaded, errors } = fixture.createDom();
    try {
      await loaded;
      await waitFor(() => dom.window.i18n?.initialized && fixture.requests.some(item => item.path === '/api/quiz-show/state'), 'Quiz Show renderer did not initialize');
      dom.window.__fixtureSocket.deliver('quiz-show:state-update', {
        isRunning: true, currentQuestion: { question: 'Synthetic question?', answers: ['Synthetic answer A', 'Synthetic answer B', 'Synthetic answer C', 'Synthetic answer D'], category: 'Fixture' },
        timeRemaining: 20, totalTime: 30, currentRound: 1, totalRounds: 2, votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }, voterIconsConfig: { enabled: false }, hiddenAnswers: []
      });
      expect([...dom.window.document.querySelectorAll('.timer-label')].map(node => node.textContent.trim())).toEqual([TIMER_LABELS[locale], TIMER_LABELS[locale]]);
      expect(dom.window.document.querySelector('.timer-neon-label')?.textContent.trim()).toBe(TIMER_LABELS[locale]);
      expect(dom.window.document.querySelector('.question-text')?.textContent || dom.window.document.getElementById('questionText')?.textContent).toContain('Synthetic question?');
      expect(dom.window.document.querySelectorAll('img')).toHaveLength(0);
      expect(fixture.requests.map(item => `${item.method} ${item.path}${item.search}`).sort()).toEqual([
        `GET /api/i18n/translations/de`, ...(locale === 'de' ? [] : [`GET /api/i18n/translations/${locale}`]),
        'GET /api/quiz-show/hud-config', 'GET /api/quiz-show/brand-kit', 'GET /api/quiz-show/state'
      ].sort());
      expect(fixture.resources.map(item => item.path).sort()).toEqual([
        '/css/themes.css', '/js/i18n-client.js', '/js/public-overlay-render-mode.js',
        '/quiz-show/quiz_show_overlay.css', '/quiz-show/quiz_show_overlay.js', '/socket.io/socket.io.js'
      ].sort());
      expect(dom.window.__fixtureSocket.emitted.map(item => item.event)).toEqual([
        'quiz-show:get-public-state', 'quiz-show:get-public-state'
      ]);
      expect(dom.window.__fixtureSocket.emitted.every(item => item.payload === undefined)).toBe(true);
      expect(fixture.denied).toEqual([]);
      expect(fixture.timers.size).toBeGreaterThan(0);
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      expect(dom.window.__fixtureSocket.disconnectedByRenderer).toBe(true);
      expect(dom.window.__fixtureSocket.handlers.size).toBe(0);
      expect(fixture.timers.size).toBe(0);
      expect(fixture.frames.size).toBe(0);
      expect(errors).toEqual([]);
    } finally { fixture.closeDom(dom); }
    expect(fixture.isClosed()).toBe(true);
  });
});

