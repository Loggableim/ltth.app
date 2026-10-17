'use strict';

const fs = require('fs');
const path = require('path');

const { HostCore } = require('../sidekick-host/host-core');
const { ShowPlanner } = require('../sidekick-host/show-planner');
const { RateLimiter } = require('../sidekick-host/rate-limiter');
const { createReplyEngine } = require('../sidekick-host/llm-reply');
const { createTextAdapter } = require('../sidekick-host/adapters/text-adapter');
const { createQuizAdapter } = require('../sidekick-host/adapters/quiz-adapter');
const { createFakeQuiz } = require('../sidekick-host/testing/fake-quiz');
const { createDemoPorts } = require('../sidekick-host/demo-plugins');

function hostFor(ports) {
  const spoken = [];
  const host = new HostCore({
    planner: new ShowPlanner(ports),
    output: createTextAdapter({ write: text => spoken.push(text) }),
    replyEngine: createReplyEngine({ apiKey: '' }),
    rateLimiter: new RateLimiter({ maxEvents: 50, windowMs: 60000, now: () => 0 })
  });
  return { host, spoken };
}

describe('quiz adapter', () => {
  test('requires a transport', () => {
    expect(() => createQuizAdapter({})).toThrow(/transport is required/);
  });

  test('start posts to the start route and returns the question', async () => {
    const calls = [];
    const quiz = createFakeQuiz();
    const adapter = createQuizAdapter({
      transport: async (req) => {
        calls.push(req);
        return quiz.request(req);
      }
    });

    const started = await adapter.start();

    expect(calls).toEqual([{ method: 'POST', path: '/api/quiz-show/start', body: {} }]);
    expect(started).toMatchObject({ ok: true, ended: false, running: true, round: 1 });
    expect(started.question.answers).toHaveLength(4);
    expect(started.question).not.toHaveProperty('correct');
  });

  test('a second start while active fails closed', async () => {
    const quiz = createFakeQuiz();
    const adapter = createQuizAdapter({ transport: quiz.request });
    await adapter.start();
    expect(await adapter.start()).toMatchObject({ ok: false, code: 'active' });
  });

  test('answer rejects an empty message before any request', async () => {
    let called = 0;
    const adapter = createQuizAdapter({
      transport: async () => {
        called += 1;
        return { status: 200, body: { ok: true } };
      }
    });
    expect(await adapter.answer({ userId: 'u1', message: '' })).toMatchObject({ ok: false, code: 'invalid-answer' });
    expect(called).toBe(0);
  });

  test('answer posts the chat text and returns correct/points', async () => {
    const calls = [];
    const quiz = createFakeQuiz();
    const adapter = createQuizAdapter({
      transport: async (req) => {
        calls.push(req);
        return quiz.request(req);
      }
    });
    await adapter.start();

    const first = await adapter.answer({ userId: 'u1', username: 'viewer_01', message: 'a' });
    expect(first).toMatchObject({ ok: true, accepted: true, correct: true, points: 100 });
    expect(first.text).toMatch(/Richtig/i);
    expect(calls[1]).toEqual({ method: 'POST', path: '/api/quiz-show/answer', body: { message: 'a', userId: 'u1', username: 'viewer_01' } });

    const wrong = await adapter.answer({ userId: 'u2', username: 'viewer_02', message: 'd' });
    expect(wrong).toMatchObject({ ok: true, accepted: true, correct: false, points: 0 });
  });

  test('a transport failure is reported as { ok: false }', async () => {
    const adapter = createQuizAdapter({ transport: async () => { throw new Error('offline'); } });
    expect(await adapter.start()).toMatchObject({ ok: false, code: 'plugin' });
    expect(await adapter.answer({ userId: 'u1', message: 'a' })).toMatchObject({ ok: false, code: 'plugin' });
  });
});

describe('quiz wiring through the host', () => {
  test('HostCore has no direct quiz plugin import', () => {
    const src = fs.readFileSync(path.join(__dirname, '../sidekick-host/host-core.js'), 'utf8');
    expect(src).not.toMatch(/quiz-show|quiz-adapter/);
  });

  test('!quiz starts a question and !quiz a checks the answer without network', async () => {
    const quiz = createFakeQuiz();
    const adapter = createQuizAdapter({ transport: quiz.request });
    const { host, spoken } = hostFor(createDemoPorts({ quizAdapter: adapter }));
    host.planner.switchTo('quiz-show');

    const started = await host.handleChat({ user: 'viewer_01', text: '!quiz' });
    expect(started.type).toBe('command');
    expect(started.emitted).toBe(true);
    expect(spoken[0]).toMatch(/Quiz:/);
    expect(quiz.isActive()).toBe(true);

    const answered = await host.handleChat({ user: 'viewer_02', text: '!quiz a' });
    expect(answered.type).toBe('command');
    expect(answered.emitted).toBe(true);
    expect(spoken[1]).toMatch(/Richtig/i);
    expect(quiz.isActive()).toBe(true);

    const firstQuestionId = quiz.currentQuestionId();
    await host.handleChat({ user: 'viewer_03', text: '!quiz' });
    expect(spoken[2]).toMatch(/Quiz:/);
    expect(quiz.currentQuestionId()).not.toBe(firstQuestionId);
  });

  test('a wrong answer keeps the question active and is answered', async () => {
    const quiz = createFakeQuiz();
    const adapter = createQuizAdapter({ transport: quiz.request });
    const { host, spoken } = hostFor(createDemoPorts({ quizAdapter: adapter }));
    host.planner.switchTo('quiz-show');

    await host.handleChat({ user: 'viewer_01', text: '!quiz' });
    const wrong = await host.handleChat({ user: 'viewer_02', text: '!quiz d' });

    expect(wrong.type).toBe('command');
    expect(spoken[1]).toMatch(/falsch/i);
    expect(quiz.isActive()).toBe(true);
  });

  test('!quiz on an inactive plugin never reaches the adapter', async () => {
    const quiz = createFakeQuiz();
    const calls = [];
    const adapter = createQuizAdapter({
      transport: async (req) => {
        calls.push(req.path);
        return quiz.request(req);
      }
    });
    const { host } = hostFor(createDemoPorts({ quizAdapter: adapter }));
    // quiz-show is the first port; connect4 is active after a switch.
    host.planner.switchTo('connect4');

    const result = await host.handleChat({ user: 'viewer_03', text: '!quiz' });

    expect(result).toEqual({ type: 'ignored', reason: 'not-in-active-plugin' });
    expect(calls).toEqual([]);
    expect(quiz.isActive()).toBe(false);
  });
});

describe('quiz gap resolved', () => {
  test('GAP.md records the wired start/answer routes', () => {
    const gap = fs.readFileSync(path.join(__dirname, '../sidekick-host/GAP.md'), 'utf8');
    expect(gap).toMatch(/POST \/api\/quiz-show\/start/);
    expect(gap).toMatch(/POST \/api\/quiz-show\/answer/);
    expect(gap).toMatch(/adapters\/quiz-adapter\.js/);
    expect(gap).not.toMatch(/still a stub/i);
  });
});
