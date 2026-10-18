/**
 * Unit Tests for Sidekick ResponseEngine & Relevance
 *
 * Covers relevance scoring, ignore/greeting/thanks detection,
 * chat evaluation thresholds and template based responses.
 */

const { ResponseEngine, Relevance } = require('../backend/responseEngine');

/**
 * Build a minimal API mock matching the plugin api surface used by ResponseEngine.
 */
function createMockApi() {
  return {
    log: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn()
  };
}

/**
 * Build a config object containing only the comment section used by the engine.
 */
function createConfig(commentOverrides = {}) {
  return {
    comment: {
      minLength: 3,
      replyThreshold: 0.6,
      respondToGreetings: true,
      respondToThanks: true,
      keywordsBonus: ['warum', 'wie', 'was'],
      ignoreIfStartswith: ['!', '/'],
      ignoreContains: ['http://', 'discord.gg'],
      greetings: ['hallo', 'hi', 'hey'],
      thanks: ['danke', 'thx'],
      ...commentOverrides
    }
  };
}

describe('Relevance', () => {
  it('flags ignored messages via startswith, contains and URL patterns', () => {
    const relevance = new Relevance(createConfig());

    expect(relevance.isIgnored('!status')).toBe(true);
    expect(relevance.isIgnored('/play song')).toBe(true);
    expect(relevance.isIgnored('check http://example.org')).toBe(true);
    expect(relevance.isIgnored('join discord.gg/abc')).toBe(true);
    expect(relevance.isIgnored('harmlose nachricht')).toBe(false);
  });

  it('is case insensitive and trims before matching', () => {
    const relevance = new Relevance(createConfig());

    expect(relevance.isIgnored('   !HELLO   ')).toBe(true);
    expect(relevance.isIgnored('   HTTP://EXAMPLE.ORG ')).toBe(true);
  });

  it('detects greetings and thanks with word boundaries', () => {
    const relevance = new Relevance(createConfig());

    expect(relevance.isGreeting('Hallo zusammen')).toBe(true);
    expect(relevance.isGreeting('hey')).toBe(true);
    expect(relevance.isGreeting('highscore')).toBe(false); // "hi" inside a word
    expect(relevance.isThanks('Danke dir')).toBe(true);
    expect(relevance.isThanks('thx')).toBe(true);
    expect(relevance.isThanks('thxbox')).toBe(false);
  });

  it('applies new patterns after updateConfig', () => {
    const relevance = new Relevance(createConfig());

    expect(relevance.isGreeting('moin')).toBe(false);
    expect(relevance.isIgnored('#help')).toBe(false);

    relevance.updateConfig(createConfig({
      greetings: ['moin'],
      ignoreIfStartswith: ['#']
    }));

    expect(relevance.isGreeting('moin')).toBe(true);
    expect(relevance.isIgnored('#help')).toBe(true);
  });

  it('scores questions, keywords, length and punctuation', () => {
    const relevance = new Relevance(createConfig());

    expect(relevance.score('ok')).toBe(0);
    expect(relevance.score('warum?')).toBeCloseTo(0.95, 5); // 0.6 + 0.35 (length < 7)
    expect(relevance.score('wie gehts')).toBeCloseTo(0.45, 5); // 0.35 + 0.1 length
    expect(relevance.score('was!')).toBeCloseTo(0.4, 5); // 0.35 + 0.05 punctuation
  });

  it('clamps the score to a maximum of 1.0', () => {
    const relevance = new Relevance(createConfig());

    // 0.6 (?) + 0.35 (keyword) + 0.1 (length) = 1.05 -> clamped
    expect(relevance.score('warum ist das?')).toBe(1.0);
  });
});

describe('ResponseEngine', () => {
  let api;
  let engine;

  beforeEach(() => {
    api = createMockApi();
    engine = new ResponseEngine(api, createConfig(), {});
    // Deterministic template selection: always pick index 0.
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes its relevance scorer', () => {
    expect(engine.getRelevance()).toBeInstanceOf(Relevance);
  });

  it('generates template responses and replaces all placeholders', () => {
    const response = engine.getTemplateResponse('greeting', { nickname: 'Ada' });
    expect(response).toBe('Hallo Ada! 👋');

    // Repeated placeholder occurrences must all be replaced.
    const custom = engine.getTemplateResponse('greeting', { nickname: '{{nickname}}' });
    expect(custom).toBe('Hallo {{nickname}}! 👋');
  });

  it('returns an empty string for unknown template types', () => {
    expect(engine.getTemplateResponse('doesNotExist')).toBe('');
  });

  it('formats gift responses including multi-count suffixes', () => {
    const single = engine.evaluateGift('Bob', 'Rose', 1);
    expect(single.type).toBe('gift');
    expect(single.priority).toBe(3);
    expect(single.response).toBe('Danke Bob für Rose! 🎁');

    const multi = engine.evaluateGift('Bob', 'Rose', 3);
    expect(multi.response).toBe('Danke Bob für Rose x3! 🎁');
  });

  it('formats follow, share and subscribe responses with expected priorities', () => {
    const follow = engine.evaluateFollow('Ada');
    expect(follow.type).toBe('follow');
    expect(follow.priority).toBe(2);
    expect(follow.response).toBe('Willkommen Ada! 🎉');

    const share = engine.evaluateShare('Ada');
    expect(share.type).toBe('share');
    expect(share.priority).toBe(2);

    const subscribe = engine.evaluateSubscribe('Ada');
    expect(subscribe.type).toBe('subscribe');
    expect(subscribe.priority).toBe(4);
    expect(subscribe.response).toBe('Ada ist jetzt Subscriber! 🎉');
  });

  it('caps join announcements at 20 names', () => {
    const names = Array.from({ length: 25 }, (_, i) => `User${i}`);

    const announcement = engine.generateJoinAnnouncement(names);
    expect(announcement.type).toBe('joinAnnouncement');
    expect(announcement.priority).toBe(1);
    expect(announcement.response).toContain('User0');
    expect(announcement.response).toContain('User19');
    expect(announcement.response).not.toContain('User20');
  });

  it('returns null for join announcements without names', () => {
    expect(engine.generateJoinAnnouncement([])).toBeNull();
  });

  it('uses updated keywords config for relevance scoring', () => {
    engine.updateConfig(createConfig({ keywordsBonus: ['banane'] }));

    expect(engine.getRelevance().score('banane')).toBeCloseTo(0.35, 5);
    // Previous keyword no longer boosts and stays below the length bonus.
    expect(engine.getRelevance().score('wie')).toBe(0);
  });

  describe('evaluateChat', () => {
    it('rejects messages below the minimum length', () => {
      expect(engine.evaluateChat('u1', 'Ada', 'ok')).toBeNull();
    });

    it('rejects ignored messages and commands', () => {
      expect(engine.evaluateChat('u1', 'Ada', '!status')).toBeNull();
      expect(engine.evaluateChat('u1', 'Ada', 'see http://x.io')).toBeNull();
    });

    it('answers short greetings', () => {
      const result = engine.evaluateChat('u1', 'Ada', 'hallo');
      expect(result).toEqual({
        type: 'greeting',
        response: 'Hallo Ada! 👋',
        priority: 1
      });
    });

    it('does not treat greetings that are questions or long as greetings', () => {
      const question = engine.evaluateChat('u1', 'Ada', 'hallo?');
      expect(question.type).toBe('relevant');

      // More than four words -> not a greeting, and too little else to score.
      const long = engine.evaluateChat('u1', 'Ada', 'hallo ich bins hier jetzt');
      expect(long).toBeNull();
    });

    it('answers thanks when enabled', () => {
      const result = engine.evaluateChat('u1', 'Ada', 'danke dir');
      expect(result).toEqual({
        type: 'thanks',
        response: 'Ada bedankt sich! 💜',
        priority: 1
      });
    });

    it('honours the respondToGreetings and respondToThanks switches', () => {
      engine.updateConfig(createConfig({
        respondToGreetings: false,
        respondToThanks: false,
        replyThreshold: 0.6
      }));

      expect(engine.evaluateChat('u1', 'Ada', 'hallo')).toBeNull();
      expect(engine.evaluateChat('u1', 'Ada', 'danke dir')).toBeNull();
    });

    it('returns relevant feedback above the threshold', () => {
      const result = engine.evaluateChat('u1', 'Ada', 'warum?');
      expect(result.type).toBe('relevant');
      expect(result.priority).toBe(2);
      expect(result.score).toBeCloseTo(0.95, 5);
      expect(result.response).toBe('@Ada: warum?');
    });

    it('returns null below the threshold', () => {
      expect(engine.evaluateChat('u1', 'Ada', 'abcdefg')).toBeNull();
    });

    it('falls back to a sane threshold when configured too high', () => {
      engine.updateConfig(createConfig({ replyThreshold: 0.9 }));

      // "wie gehts" scores 0.45 which is below 0.9 but at/above the 0.4 fallback.
      const result = engine.evaluateChat('u1', 'Ada', 'wie gehts');
      expect(result.type).toBe('relevant');
      expect(result.score).toBeCloseTo(0.45, 5);
    });
  });
});
