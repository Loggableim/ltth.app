'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { PassThrough } = require('node:stream');
const { JSDOM } = require('../../../app/node_modules/jsdom');
const { io: connect } = require('../../../app/node_modules/socket.io-client');
const { createHostQuizFixture, publicState, VOTER_CONFIG, attachCommandInput } = require('../host-quiz-fixture');

const ROOT = path.resolve(__dirname, '../../..');
const LOCALES = ['de', 'en', 'es', 'fr'];
const STATIC_ASSETS = new Map([
  ['/css/themes.css', 'app/public/css/themes.css'],
  ['/quiz-show/quiz_show_overlay.css', 'app/plugins/quiz-show/quiz_show_overlay.css'],
  ['/quiz-show/quiz_show_overlay.js', 'app/plugins/quiz-show/quiz_show_overlay.js'],
  ['/js/public-overlay-render-mode.js', 'app/public/js/public-overlay-render-mode.js'],
  ['/js/i18n-client.js', 'app/public/js/i18n-client.js'],
  ['/socket.io/socket.io.js', 'app/node_modules/socket.io/client-dist/socket.io.js']
]);

function request(origin, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${pathname}`, options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function event(socket, name, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Missing ${name}`)); }, timeoutMs);
    function receive(payload) { clearTimeout(timer); resolve(payload); }
    socket.once(name, receive);
  });
}

function deepMerge(base, patch) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value)
      : value;
  }
  return result;
}

test('serves canonical Quiz Show entry, original assets/locales and exact read-only fixture GETs', async t => {
  const fixture = await createHostQuizFixture();
  t.after(() => fixture.close());
  const source = fs.readFileSync(path.join(ROOT, 'scripts/obs-pilot/host-quiz-fixture.js'), 'utf8');
  assert.doesNotMatch(source, /require\(['"].*plugins\/quiz-show\/main|new QuizShowPlugin|node:child_process|\bAudio\s*\(/i);
  const html = fs.readFileSync(path.join(ROOT, 'app/plugins/quiz-show/quiz_show_overlay.html'));
  assert.match(html.toString(), /quiz_show_overlay\.css/);
  assert.match(html.toString(), /public-overlay-render-mode\.js/);
  assert.match(html.toString(), /quiz_show_overlay\.js/);

  for (const locale of LOCALES) {
    const entry = await request(fixture.origin, `/quiz-show/overlay?lang=${locale}`);
    assert.equal(entry.status, 200);
    assert.deepEqual(entry.bytes, html);
    assert.match(entry.headers['content-security-policy'], /media-src 'none'/);
    assert.match(entry.headers['content-security-policy'], /img-src 'none'/);
    assert.match(entry.headers['content-security-policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1:/);

    const translations = await request(fixture.origin, `/api/i18n/translations/${locale}`);
    assert.equal(translations.status, 200);
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, `app/locales/${locale}.json`), 'utf8'));
    const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/quiz-show/locales/${locale}.json`), 'utf8'));
    const catalog = JSON.parse(translations.bytes);
    assert.deepEqual(catalog, deepMerge(base, plugin));
    assert.ok(catalog.plugins['quiz-show'].runtime.overlay.no_questions_instruction, `${locale} error instruction`);
  }

  for (const [route, file] of STATIC_ASSETS) {
    const response = await request(fixture.origin, route);
    assert.equal(response.status, 200, route);
    assert.deepEqual(response.bytes, fs.readFileSync(path.join(ROOT, file)), route);
  }

  const hud = await request(fixture.origin, '/api/quiz-show/hud-config');
  assert.equal(JSON.parse(hud.bytes).config.customLayoutEnabled, false);
  assert.equal(JSON.parse(hud.bytes).config.activeLayoutId, undefined);
  const brand = await request(fixture.origin, '/api/quiz-show/brand-kit');
  assert.deepEqual(JSON.parse(brand.bytes), { success: true, brandKit: {} });
  const layoutProbe = await request(fixture.origin, '/api/quiz-show/state');
  assert.deepEqual(JSON.parse(layoutProbe.bytes), { success: true, config: { customLayoutEnabled: false, activeLayoutId: null } });
  const round = await request(fixture.origin, '/api/quiz-show/leaderboard?type=round');
  assert.deepEqual(JSON.parse(round.bytes), { success: true, leaderboard: [
    { username: 'Fixture Viewer', points: 100 }, { username: 'Second Fixture', points: 50 }
  ] });

  for (const denied of [
    '/quiz-show/overlay?lang=de&lang=en', '/quiz-show/overlay?lang=it', '/api/quiz-show/leaderboard',
    '/api/quiz-show/leaderboard?type=season', '/api/quiz-show/leaderboard?type=round&x=1',
    '/api/quiz-show/state?extra=1', '/api/quiz-show/layouts/1', '/api/quiz-show/hud-config?x=1',
    '/api/quiz-show/brand-kit?x=1', '/external.js'
  ]) assert.equal((await request(fixture.origin, denied)).status, 404, denied);
  assert.equal((await request(fixture.origin, '/api/quiz-show/leaderboard?type=%72ound')).status, 404);
});

test('answers public state only to the requesting socket and rejects payload or unrelated commands', async t => {
  const fixture = await createHostQuizFixture();
  const first = connect(fixture.origin, { transports: ['websocket'], forceNew: true, reconnection: false });
  const second = connect(fixture.origin, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(async () => { first.disconnect(); second.disconnect(); await fixture.close(); });
  await Promise.all([event(first, 'connect'), event(second, 'connect')]);
  const firstState = event(first, 'quiz-show:state-update');
  let secondGotState = false;
  second.once('quiz-show:state-update', () => { secondGotState = true; });
  first.emit('quiz-show:get-public-state');
  const payload = await firstState;
  assert.deepEqual(payload, publicState());
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(secondGotState, false);

  const before = fixture.getStats().stateRequests;
  first.emit('quiz-show:get-public-state', { includeCorrectAnswer: true });
  first.emit('quiz-show:start', { question: 'not allowed' });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(fixture.getStats().stateRequests, before);
  assert.equal(fixture.getStats().rejectedSocketEvents, 2);
});

test('bounded synthetic question, answer, reveal, score, new-round, reset, and close sequence', async t => {
  const fixture = await createHostQuizFixture();
  const socket = connect(fixture.origin, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(async () => { socket.disconnect(); await fixture.close(); });
  await event(socket, 'connect');

  const question = event(socket, 'quiz-show:state-update');
  assert.equal((await fixture.execute({ command: 'question' })).state.currentQuestion.question, 'Synthetic fixture question?');
  assert.equal((await question).currentQuestion.answers.length, 4);

  const answer = event(socket, 'quiz-show:state-update');
  assert.equal((await fixture.execute({ command: 'answer' })).state.answerCount, 1);
  assert.equal((await answer).votersPerAnswer[1][0].username, 'Fixture Viewer');

  const reveal = event(socket, 'quiz-show:round-ended');
  await fixture.execute({ command: 'reveal' });
  assert.deepEqual(await reveal, {
    correctAnswer: 1, correctAnswerLetter: 'B', correctAnswerText: 'Choice B', answerDisplayDuration: 6,
    votersPerAnswer: { 0: [], 1: [{ username: 'Fixture Viewer', profilePictureUrl: null }], 2: [], 3: [] },
    voterIconsConfig: { ...VOTER_CONFIG }
  });

  const score = event(socket, 'quiz-show:show-leaderboard');
  await fixture.execute({ command: 'score' });
  assert.deepEqual(await score, { leaderboard: [
    { username: 'Fixture Viewer', points: 100 }, { username: 'Second Fixture', points: 50 }
  ], displayType: 'round', animationStyle: 'fade' });

  const error = event(socket, 'quiz-show:error');
  assert.equal((await fixture.execute({ command: 'error' })).errors, 1);
  assert.deepEqual(await error, { type: 'no_questions_available', message: 'Synthetic fixture error: no questions available' });

  const nextRound = event(socket, 'quiz-show:state-update');
  assert.equal((await fixture.execute({ command: 'newround' })).roundsAdvanced, 1);
  assert.equal((await nextRound).currentRound, 2);

  const stopped = event(socket, 'quiz-show:stopped');
  const resetState = event(socket, 'quiz-show:state-update');
  const resetStats = await fixture.execute({ command: 'reset' });
  await stopped;
  assert.equal((await resetState).isRunning, false);
  assert.equal(resetStats.resets, 1);
  await assert.rejects(() => fixture.execute({ command: 'reset', profile: 'real' }), /Unsupported command or fields/);

  await fixture.execute({ command: 'close' });
  assert.equal(fixture.getStats().closed, true);
});

test('Original renderer preserves live question and round across delayed EN/FR initialization and language change', async t => {
  for (const locale of ['en', 'fr']) {
    const fixture = await createHostQuizFixture();
    await fixture.execute({ command: 'newround' });
    const socket = connect(fixture.origin, { transports: ['websocket'], forceNew: true, reconnection: false });
    t.after(async () => { socket.disconnect(); await fixture.close(); });
    await event(socket, 'connect');

    let releaseLocale;
    let markLocaleStarted;
    const lateLocale = new Promise(resolve => { releaseLocale = resolve; });
    const localeStarted = new Promise(resolve => { markLocaleStarted = resolve; });
    const html = fs.readFileSync(path.join(ROOT, 'app/plugins/quiz-show/quiz_show_overlay.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: `${fixture.origin}/quiz-show/overlay?lang=${locale}` });
    t.after(() => { releaseLocale(); dom.window.close(); });
    const stateEvent = event(socket, 'quiz-show:state-update');
    const timers = new Set();
    const intervals = new Set();
    const nativeSetTimeout = dom.window.setTimeout.bind(dom.window);
    const nativeClearTimeout = dom.window.clearTimeout.bind(dom.window);
    const nativeSetInterval = dom.window.setInterval.bind(dom.window);
    const nativeClearInterval = dom.window.clearInterval.bind(dom.window);
    dom.window.setTimeout = (callback, delay, ...args) => {
      let id;
      id = nativeSetTimeout(() => { timers.delete(id); callback(...args); }, delay);
      timers.add(id);
      return id;
    };
    dom.window.clearTimeout = id => { timers.delete(id); nativeClearTimeout(id); };
    dom.window.setInterval = (callback, delay, ...args) => {
      const id = nativeSetInterval(callback, delay, ...args);
      intervals.add(id);
      return id;
    };
    dom.window.clearInterval = id => { intervals.delete(id); nativeClearInterval(id); };
    dom.window.requestAnimationFrame = callback => dom.window.setTimeout(() => callback(0), 16);
    dom.window.cancelAnimationFrame = id => dom.window.clearTimeout(id);
    dom.window.Audio = function BlockedAudio() { throw new Error('Audio is unavailable in this CPU fixture'); };
    dom.window.console = { log() {}, warn() {}, error() {} };
    dom.window.io = () => socket;
    dom.window.socket = socket;
    dom.window.fetch = async input => {
      const pathname = new URL(String(input), fixture.origin).pathname;
      const match = pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
      if (match && match[1] === locale) {
        markLocaleStarted();
        await lateLocale;
      }
      const response = await request(fixture.origin, pathname);
      return {
        ok: response.status === 200,
        status: response.status,
        statusText: response.status === 200 ? 'OK' : 'Not Found',
        json: async () => JSON.parse(response.bytes)
      };
    };

    const ready = new Promise(resolve => dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    dom.window.eval(fs.readFileSync(path.join(ROOT, 'app/public/js/i18n-client.js'), 'utf8'));
    dom.window.eval(fs.readFileSync(path.join(ROOT, 'app/plugins/quiz-show/quiz_show_overlay.js'), 'utf8'));
    await ready;
    await localeStarted;
    if (fixture.getStats().stateRequests === 0) socket.emit('quiz-show:get-public-state');
    const state = await stateEvent;
    const questionText = dom.window.document.getElementById('questionText');
    const categoryText = dom.window.document.getElementById('categoryText');
    const roundText = dom.window.document.getElementById('roundNumberText');
    assert.equal(questionText.textContent, state.currentQuestion.question);
    assert.equal(categoryText.textContent, state.currentQuestion.category);
    assert.deepEqual(['A', 'B', 'C', 'D'].map(letter => dom.window.document.getElementById(`answer${letter}`).textContent), state.currentQuestion.answers);
    assert.equal(state.currentRound, 2);

    releaseLocale();
    await dom.window.i18n.ready;
    await new Promise(resolve => setTimeout(resolve, 20));
    const expectedRound = dom.window.i18n.t('plugins.quiz-show.runtime.overlay.round_of_total', { current: 2, total: 3 });
    assert.equal(questionText.textContent, state.currentQuestion.question, `${locale} late translation must preserve question`);
    assert.deepEqual(['A', 'B', 'C', 'D'].map(letter => dom.window.document.getElementById(`answer${letter}`).textContent), state.currentQuestion.answers);
    assert.equal(roundText.textContent, expectedRound, `${locale} late translation must preserve round 2`);

    const errorEvent = event(socket, 'quiz-show:error');
    await fixture.execute({ command: 'error' });
    await errorEvent;
    const errorOverlay = dom.window.document.getElementById('error-overlay');
    assert.equal(errorOverlay.querySelector('h2').textContent, 'Synthetic fixture error: no questions available');
    assert.equal(errorOverlay.querySelector('p').textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.no_questions_instruction'));

    const leaderboardEvent = event(socket, 'quiz-show:show-leaderboard');
    const jokerEvent = event(socket, 'quiz-show:joker-activated');
    await fixture.execute({ command: 'score' });
    await fixture.execute({ command: 'joker' });
    await Promise.all([leaderboardEvent, jokerEvent]);
    const leaderboardType = dom.window.document.getElementById('leaderboardType');
    const leaderboardOverlay = dom.window.document.getElementById('leaderboardOverlay');
    const jokerTitle = dom.window.document.getElementById('jokerTitle');
    const jokerUser = dom.window.document.getElementById('jokerUser');
    assert.equal(leaderboardType.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.leaderboard_round'));
    assert.deepEqual([...leaderboardOverlay.querySelectorAll('.leaderboard-username')].map(node => node.textContent), ['Fixture Viewer', 'Second Fixture']);
    assert.deepEqual([...leaderboardOverlay.querySelectorAll('.leaderboard-points')].map(node => [node.dataset.points, node.textContent]), [
      ['100', dom.window.i18n.t('plugins.quiz-show.runtime.overlay.points', { points: 100 })],
      ['50', dom.window.i18n.t('plugins.quiz-show.runtime.overlay.points', { points: 50 })]
    ]);
    assert.equal(jokerTitle.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.joker_time'));
    assert.equal(jokerUser.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.by_user', { user: 'Synthetic Viewer' }));

    const nextLocale = 'de';
    await dom.window.i18n.changeLanguage(nextLocale);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(questionText.textContent, state.currentQuestion.question, `${nextLocale} language change must preserve question`);
    assert.equal(categoryText.textContent, state.currentQuestion.category, `${nextLocale} language change must preserve category data`);
    assert.deepEqual(['A', 'B', 'C', 'D'].map(letter => dom.window.document.getElementById(`answer${letter}`).textContent), state.currentQuestion.answers);
    assert.equal(roundText.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.round_of_total', { current: 2, total: 3 }));
    assert.equal(errorOverlay.querySelector('p').textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.no_questions_instruction'));
    assert.equal(leaderboardType.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.leaderboard_round'));
    assert.deepEqual([...leaderboardOverlay.querySelectorAll('.leaderboard-username')].map(node => node.textContent), ['Fixture Viewer', 'Second Fixture']);
    assert.deepEqual([...leaderboardOverlay.querySelectorAll('.leaderboard-points')].map(node => [node.dataset.points, node.textContent]), [
      ['100', dom.window.i18n.t('plugins.quiz-show.runtime.overlay.points', { points: 100 })],
      ['50', dom.window.i18n.t('plugins.quiz-show.runtime.overlay.points', { points: 50 })]
    ]);
    assert.equal(jokerTitle.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.joker_time'));
    assert.equal(jokerUser.textContent, dom.window.i18n.t('plugins.quiz-show.runtime.overlay.by_user', { user: 'Synthetic Viewer' }));

    const hideLeaderboardEvent = event(socket, 'quiz-show:hide-leaderboard');
    await fixture.execute({ command: 'hidescore' });
    await hideLeaderboardEvent;
    assert.equal(leaderboardOverlay.classList.contains('hidden'), true);
    const hiddenLocale = locale === 'fr' ? 'en' : 'fr';
    await dom.window.i18n.changeLanguage(hiddenLocale);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(leaderboardOverlay.classList.contains('hidden'), true, `${hiddenLocale} language change must not show a hidden leaderboard`);

    dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
    assert.equal(socket.disconnected, true);
    assert.equal(timers.size, 0);
    assert.equal(intervals.size, 0);
    dom.window.close();
  }
});

test('original connect handler rehydrates requester state after a synthetic transport disconnect', async t => {
  const rendererSource = fs.readFileSync(path.join(ROOT, 'app/plugins/quiz-show/quiz_show_overlay.js'), 'utf8');
  assert.match(rendererSource, /registerSocketHandler\('connect',[\s\S]*?requestPublicState\(\)/);
  assert.match(rendererSource, /registerSocketHandler\('quiz-show:error', handleQuizError\)/);
  assert.match(rendererSource, /registerSocketHandler\('quiz-show:state-update', handleStateUpdate\)/);

  const fixture = await createHostQuizFixture();
  await fixture.execute({ command: 'newround' });
  const socket = connect(fixture.origin, { transports: ['websocket'], reconnection: true, reconnectionDelay: 20, reconnectionAttempts: 5, timeout: 3000 });
  socket.on('connect', () => socket.emit('quiz-show:get-public-state'));
  t.after(async () => { socket.disconnect(); await fixture.close(); });
  const firstConnect = event(socket, 'connect');
  const firstState = event(socket, 'quiz-show:state-update');
  await firstConnect;
  assert.equal((await firstState).currentRound, 2);

  const disconnected = event(socket, 'disconnect');
  const reconnected = event(socket, 'connect');
  const secondState = event(socket, 'quiz-show:state-update');
  await fixture.execute({ command: 'fault', kind: 'disconnect' });
  await disconnected;
  await reconnected;
  assert.equal((await secondState).currentRound, 2);
  assert.equal(fixture.getStats().stateRequests, 2);
  assert.equal(fixture.getStats().connections, 2);
  assert.equal(fixture.getStats().faultDisconnects, 1);
});

test('stdin JSON commands stay bounded and stdin close shuts down the loopback listener', async t => {
  const fixture = await createHostQuizFixture();
  t.after(() => fixture.close());
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  let pendingLine;
  output.setEncoding('utf8');
  output.on('data', chunk => {
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
      lines.push(JSON.parse(line));
      pendingLine?.();
      pendingLine = null;
    }
  });
  const commandInput = readline.createInterface({ input });
  const cli = attachCommandInput(fixture, commandInput, output);
  async function waitForLine(index) {
    if (lines[index]) return lines[index];
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fixture stdin command timed out')), 2000);
      pendingLine = () => { clearTimeout(timeout); resolve(); };
    });
    return lines[index];
  }

  input.write('{"command":"question"}\n');
  assert.equal((await waitForLine(0)).status, 'ok');
  assert.equal(fixture.getStats().state.currentQuestion.question, 'Synthetic fixture question?');
  input.write('{"command":"answer","profile":"real"}\n');
  assert.equal((await waitForLine(1)).status, 'rejected');
  input.end();
  await cli.closed;
  assert.equal(fixture.getStats().closed, true);
});
