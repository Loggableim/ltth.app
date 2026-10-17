'use strict';

// Host port to the quiz-show start/answer HTTP routes. transport is injected.
// No network, no socket, no HostCore import. Failures stay inside { ok: false }.
function fail(code, text) {
  return { ok: false, code, text };
}

function createQuizAdapter({ transport } = {}) {
  if (typeof transport !== 'function') {
    throw new Error('quiz adapter: transport is required');
  }

  async function call(method, path, body) {
    try {
      return await transport({ method, path, body });
    } catch {
      return null;
    }
  }

  return {
    async start({ next = false } = {}) {
      const response = await call('POST', '/api/quiz-show/start', next ? { next: true } : {});
      if (!response) return fail('plugin', 'Das Quiz ist nicht erreichbar.');
      if (response.status === 409) return fail('active', response.body?.error || 'Es läuft bereits ein Quiz.');

      const body = response.body || {};
      if (response.status !== 200 || body.ok !== true) {
        return fail('plugin', body.error || 'Quiz konnte nicht gestartet werden.');
      }
      if (!body.question) {
        return { ok: true, ended: true, running: false, round: Number.isInteger(body.round) ? body.round : 0, text: 'Quiz beendet.' };
      }

      const answers = Array.isArray(body.question.answers) ? body.question.answers : [];
      return {
        ok: true,
        ended: false,
        running: body.running !== false,
        round: Number.isInteger(body.round) ? body.round : 0,
        question: {
          id: body.question.id ?? null,
          question: String(body.question.question ?? ''),
          answers: answers.map(answer => String(answer))
        },
        text: String(body.question.question ?? '')
      };
    },

    async answer({ userId, username, message } = {}) {
      if (typeof message !== 'string' || !message.trim()) {
        return fail('invalid-answer', 'Ungültige Antwort.');
      }

      const body = { message };
      if (typeof userId === 'string' && userId) body.userId = userId;
      if (typeof username === 'string' && username) body.username = username;

      const response = await call('POST', '/api/quiz-show/answer', body);
      if (!response) return fail('plugin', 'Das Quiz ist nicht erreichbar.');

      const payload = response.body || {};
      if (response.status !== 200) {
        return fail('plugin', payload.error || 'Antwort konnte nicht verarbeitet werden.');
      }

      return {
        ok: payload.ok !== false,
        accepted: payload.accepted !== false,
        correct: Boolean(payload.correct),
        points: Number.isFinite(payload.points) ? payload.points : 0,
        reason: typeof payload.reason === 'string' ? payload.reason : null,
        text: typeof payload.text === 'string' ? payload.text : ''
      };
    }
  };
}

module.exports = { createQuizAdapter };
