'use strict';

const QuizShowPlugin = require('../plugins/quiz-show/main');

function makePlugin() {
  const routes = new Map();
  const emits = [];
  const api = {
    registerRoute(method, path, handler) {
      routes.set(`${method} ${path}`, handler);
    },
    registerSocket() {},
    registerTikTokEvent() {},
    emit(event, payload) {
      emits.push({ event, payload });
    },
    log() {}
  };
  const plugin = new QuizShowPlugin(api);
  plugin.registerRoutes();
  return { plugin, routes, emits, api };
}

function callRoute(handler, body) {
  const req = { body };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  return Promise.resolve(handler(req, res)).then(() => ({ status: res.statusCode, body: res.payload }));
}

function freshQuestion(plugin) {
  plugin.gameState.isRunning = true;
  plugin.gameState.roundState = 'running';
  plugin.gameState.currentRound = 1;
  plugin.gameState.currentQuestion = { id: 7, question: 'Testfrage?', answers: ['Blau', 'Grün', 'Rot', 'Gelb'], correct: 0 };
  plugin.gameState.answers = new Map();
  plugin.gameState.votersPerAnswer = { 0: [], 1: [], 2: [], 3: [] };
}

describe('quiz-show HTTP routes', () => {
  test('registers POST /api/quiz-show/start and POST /api/quiz-show/answer', () => {
    const { routes } = makePlugin();
    expect(routes.has('post /api/quiz-show/start')).toBe(true);
    expect(routes.has('post /api/quiz-show/answer')).toBe(true);
  });

  test('start runs the existing round logic and returns the question without the correct index', async () => {
    const { plugin, routes } = makePlugin();
    plugin.db = { prepare: () => ({ get: () => ({ count: 3 }) }) };
    plugin.startRound = jest.fn(async () => {
      freshQuestion(plugin);
    });

    const result = await callRoute(routes.get('post /api/quiz-show/start'), {});

    expect(plugin.startRound).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, running: true, ended: false, round: 1 });
    expect(result.body.question).toEqual({ id: 7, question: 'Testfrage?', answers: ['Blau', 'Grün', 'Rot', 'Gelb'] });
    expect(result.body.question).not.toHaveProperty('correct');
  });

  test('start refuses when a quiz is already actively running', async () => {
    const { plugin, routes } = makePlugin();
    plugin.startRound = jest.fn();
    plugin.gameState.isRunning = true;
    plugin.gameState.roundState = 'running';

    const result = await callRoute(routes.get('post /api/quiz-show/start'), {});

    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    expect(plugin.startRound).not.toHaveBeenCalled();
  });

  test('start advances to the next question with { next: true }', async () => {
    const { plugin, routes } = makePlugin();
    plugin.endRound = jest.fn(async () => {});
    plugin.stopActiveTTS = jest.fn(async () => {});
    plugin.startRound = jest.fn(async () => {
      freshQuestion(plugin);
      plugin.gameState.currentRound = 2;
    });
    plugin.gameState.isRunning = true;
    plugin.gameState.roundState = 'running';

    const result = await callRoute(routes.get('post /api/quiz-show/start'), { next: true });

    expect(plugin.endRound).toHaveBeenCalledWith({ suppressTTS: true });
    expect(plugin.startRound).toHaveBeenCalledTimes(1);
    expect(result.body).toMatchObject({ ok: true, round: 2 });
  });

  test('start reports a missing question pool', async () => {
    const { plugin, routes } = makePlugin();
    plugin.db = { prepare: () => ({ get: () => ({ count: 0 }) }) };

    const result = await callRoute(routes.get('post /api/quiz-show/start'), {});

    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
  });

  test('answer returns a correct ack for the first correct answer', async () => {
    const { plugin, routes, emits } = makePlugin();
    freshQuestion(plugin);

    const result = await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', username: 'viewer_01', message: 'a' });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, accepted: true, correct: true, points: 100, answerIndex: 0 });
    expect(result.body.text).toMatch(/Richtig/i);
    expect(plugin.gameState.answers.has('u1')).toBe(true);
    expect(emits.some(entry => entry.event === 'quiz-show:answer-received')).toBe(true);
  });

  test('answer reports zero points for a wrong answer', async () => {
    const { plugin, routes } = makePlugin();
    freshQuestion(plugin);

    const result = await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', username: 'viewer_01', message: 'd' });

    expect(result.body).toMatchObject({ ok: true, accepted: true, correct: false, points: 0, answerIndex: 3 });
    expect(result.body.text).toMatch(/falsch/i);
  });

  test('answer awards the follower points for a correct answer after a first correct one', async () => {
    const { plugin, routes } = makePlugin();
    freshQuestion(plugin);

    await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', username: 'viewer_01', message: 'a' });
    const second = await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u2', username: 'viewer_02', message: 'a' });

    expect(second.body).toMatchObject({ accepted: true, correct: true, points: 50 });
  });

  test('answer rejects a duplicate answer from the same user', async () => {
    const { plugin, routes } = makePlugin();
    freshQuestion(plugin);

    await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', username: 'viewer_01', message: 'a' });
    const duplicate = await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', username: 'viewer_01', message: 'b' });

    expect(duplicate.body).toMatchObject({ ok: true, accepted: false, reason: 'duplicate' });
    expect(plugin.gameState.answers.get('u1').answer).toBe('a');
  });

  test('answer requires a message and a user', async () => {
    const { plugin, routes } = makePlugin();
    freshQuestion(plugin);

    const empty = await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', message: '   ' });
    expect(empty.status).toBe(400);

    const anon = await callRoute(routes.get('post /api/quiz-show/answer'), { message: 'a' });
    expect(anon.status).toBe(400);
  });

  test('answer reports no active question instead of throwing', async () => {
    const { plugin, routes } = makePlugin();

    const result = await callRoute(routes.get('post /api/quiz-show/answer'), { userId: 'u1', username: 'viewer_01', message: 'a' });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: false, accepted: false, reason: 'no-question' });
  });
});
