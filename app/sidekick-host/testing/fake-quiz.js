'use strict';

// In-memory stand-in for the quiz-show start/answer routes.
// Not production code. Nothing here opens a socket or reads a key.
const QUESTIONS = [
  { id: 1, question: 'Welche Farbe hat der Himmel bei klarem Tag?', answers: ['Blau', 'Grün', 'Rot', 'Gelb'], correct: 0 },
  { id: 2, question: 'Wie viele Tage hat eine Woche?', answers: ['Fünf', 'Sechs', 'Sieben', 'Acht'], correct: 2 },
  { id: 3, question: 'Wie heißt die Hauptstadt von Frankreich?', answers: ['Rom', 'Paris', 'Madrid', 'Berlin'], correct: 1 }
];
const LETTERS = ['a', 'b', 'c', 'd'];

function reject(status, error) {
  return { status, body: { ok: false, error } };
}

function normalize(message) {
  return String(message ?? '').toLowerCase().replace(/^[!/]/, '').trim();
}

function createFakeQuiz() {
  let active = false;
  let current = null;
  let round = 0;
  let cursor = 0;
  const answered = new Map();

  function start(body) {
    const advancing = active && body?.next === true;
    if (active && !advancing) return reject(409, 'Quiz already running');

    current = QUESTIONS[cursor % QUESTIONS.length];
    cursor += 1;
    round += 1;
    active = true;
    answered.clear();

    return {
      status: 200,
      body: {
        ok: true,
        running: true,
        ended: false,
        round,
        question: { id: current.id, question: current.question, answers: [...current.answers] }
      }
    };
  }

  function answer(body) {
    if (!active || !current) {
      return { status: 200, body: { ok: false, accepted: false, correct: false, points: 0, reason: 'no-question', text: 'Keine aktive Frage.' } };
    }

    const userId = String(body?.userId || body?.username || '');
    if (!userId) {
      return { status: 400, body: { ok: false, accepted: false, correct: false, points: 0, reason: 'no-user', text: 'Kein Nutzer angegeben.' } };
    }
    if (answered.has(userId)) {
      return { status: 200, body: { ok: true, accepted: false, correct: false, points: 0, reason: 'duplicate', text: 'Antwort bereits abgegeben.' } };
    }

    const clean = normalize(body?.message);
    let index = LETTERS.indexOf(clean);
    if (index < 0) {
      index = current.answers.findIndex(answerText => answerText.toLowerCase() === clean);
    }
    if (index < 0 || index > 3) {
      return { status: 200, body: { ok: true, accepted: false, correct: false, points: 0, reason: 'invalid', text: 'Ungültiges Antwortformat.' } };
    }

    let firstCorrect = true;
    for (const guessed of answered.values()) {
      if (guessed === current.correct) {
        firstCorrect = false;
        break;
      }
    }
    answered.set(userId, index);

    const correct = index === current.correct;
    const points = correct ? (firstCorrect ? 100 : 50) : 0;

    return {
      status: 200,
      body: {
        ok: true,
        accepted: true,
        correct,
        points,
        answerIndex: index,
        reason: correct ? 'correct' : 'wrong',
        text: correct ? `Richtig! +${points} Punkte.` : 'Leider falsch.'
      }
    };
  }

  async function request({ method, path, body } = {}) {
    if (method === 'POST' && path === '/api/quiz-show/start') return start(body);
    if (method === 'POST' && path === '/api/quiz-show/answer') return answer(body);
    return reject(404, 'Unknown quiz-show route');
  }

  return {
    request,
    isActive() {
      return active;
    },
    currentQuestionId() {
      return current ? current.id : null;
    }
  };
}

module.exports = { createFakeQuiz };
