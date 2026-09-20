'use strict';

const { JSDOM } = require('jsdom');
const ArenaView = require('../plugins/stream-monsters/streammonsters-arena-view');

describe('Stream Monsters 1.12 sealed-choice countdown', () => {
  test('stops the timer and ring immediately when the second fighter locks', () => {
    const dom = new JSDOM(`<!doctype html><body>
      <section id="battle">
        <div id="arena-round"></div>
        <div id="arena-countdown"></div>
        <div id="arena-skill-prompt"></div>
        <article id="arena-fighter-1" data-slot="1"></article>
        <article id="arena-fighter-2" data-slot="2"></article>
      </section>
    </body>`);
    const clearInterval = jest.fn();
    const view = ArenaView.createArenaView({
      document: dom.window.document,
      clock: {
        now: () => 1_000,
        wait: async () => {},
        setInterval: () => 'choice-timer',
        clearInterval
      }
    });

    view.openChoice({
      matchId: 'match-countdown',
      round: 1,
      deadlineMs: 7_000,
      choices: ['A', 'B']
    });
    expect(dom.window.document.getElementById('arena-countdown').textContent)
      .toBe('6s');

    view.lockChoice({ decision: { slot: 1, source: 'viewer' } });
    expect(clearInterval).not.toHaveBeenCalled();

    view.lockChoice({ decision: { slot: 2, source: 'viewer' } });
    expect(clearInterval).toHaveBeenCalledTimes(1);
    expect(clearInterval).toHaveBeenCalledWith('choice-timer');
    expect(dom.window.document.getElementById('arena-countdown').textContent)
      .toBe('');
    expect(dom.window.document.getElementById('battle').dataset.countdown)
      .toBe('0');
  });
});
