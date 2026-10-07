'use strict';

const path = require('node:path');
const longfeedFixture = require('./fixtures/clarityhud-longfeed-queues.json');
const { validateClarityHudLongfeedWindow } = require(path.join(__dirname, '../../scripts/obs-pilot/clarityhud-longfeed-validator'));

function ids(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

describe('ClarityHUD longfeed reconnect window validator', () => {
  test('accepts a same-size full Multi queue when the new event replaces its oldest entry and DOM stays capped', () => {
    const previousQueueIds = ids('old', 225);
    const backendQueueIds = ['new-event', ...previousQueueIds.slice(0, 224)];
    expect(validateClarityHudLongfeedWindow({
      dock: 'multi',
      postedCount: 220,
      queueLimit: 225,
      previousQueueIds,
      expectedBackendQueueIds: backendQueueIds,
      backendQueueIds,
      rendererStateIds: backendQueueIds.slice(),
      domCount: 100
    })).toEqual({ valid: true, errors: [] });
  });

  test('rejects an equal-size renderer state that omits the new queue event', () => {
    const previousQueueIds = ids('old', 225);
    const backendQueueIds = ['new-event', ...previousQueueIds.slice(0, 224)];
    const rendererStateIds = ['stale-event', ...backendQueueIds.slice(1)];
    const result = validateClarityHudLongfeedWindow({
      dock: 'multi',
      postedCount: 220,
      queueLimit: 225,
      previousQueueIds,
      backendQueueIds,
      rendererStateIds,
      domCount: 100
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('renderer-state-order-does-not-match-queue');
  });

  test('rejects an unchanged full-size queue when the reconnect event is missing', () => {
    const previousQueueIds = ids('old', 225);
    const result = validateClarityHudLongfeedWindow({
      dock: 'multi',
      postedCount: 220,
      queueLimit: 225,
      previousQueueIds,
      backendQueueIds: previousQueueIds.slice(),
      rendererStateIds: previousQueueIds.slice(),
      domCount: 100
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('expected-one-new-reconnect-event');
  });

  test('accepts a virtual chat window contained in the full queue and a complete non-virtual render', () => {
    const previousQueueIds = ids('chat', 220);
    const backendQueueIds = ['new-chat', ...previousQueueIds];
    const virtualIds = backendQueueIds.slice(0, 12);
    expect(validateClarityHudLongfeedWindow({
      dock: 'chat',
      mode: 'virtual',
      postedCount: 220,
      queueLimit: 225,
      previousQueueIds,
      backendQueueIds,
      rendererStateIds: backendQueueIds.slice(),
      domCount: virtualIds.length,
      visibleDomIds: virtualIds
    })).toEqual({ valid: true, errors: [] });
    expect(validateClarityHudLongfeedWindow({
      dock: 'chat',
      mode: 'nonvirtual',
      postedCount: 220,
      queueLimit: 225,
      previousQueueIds,
      backendQueueIds,
      rendererStateIds: backendQueueIds.slice(),
      domCount: backendQueueIds.length,
      visibleDomIds: backendQueueIds.slice()
    })).toEqual({ valid: true, errors: [] });
  });

  test('rejects a same-count non-virtual chat render with a missing event ID', () => {
    const previousQueueIds = ids('chat', 220);
    const backendQueueIds = ['new-chat', ...previousQueueIds];
    const visibleDomIds = backendQueueIds.slice();
    visibleDomIds[visibleDomIds.length - 1] = 'stale-chat';
    const result = validateClarityHudLongfeedWindow({
      dock: 'chat',
      mode: 'nonvirtual',
      postedCount: 220,
      queueLimit: 225,
      previousQueueIds,
      backendQueueIds,
      rendererStateIds: backendQueueIds.slice(),
      domCount: backendQueueIds.length,
      visibleDomIds
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('chat-nonvirtual-window-ids-mismatch');
  });

  test('rejects a renderer state with the right IDs in the wrong order', () => {
    const backendQueueIds = ['newest', 'middle', 'oldest'];
    const result = validateClarityHudLongfeedWindow({
      dock: 'chat',
      mode: 'nonvirtual',
      postedCount: 220,
      previousQueueIds: ['middle', 'oldest'],
      expectedBackendQueueIds: backendQueueIds,
      backendQueueIds,
      rendererStateIds: ['middle', 'newest', 'oldest'],
      domCount: 3,
      visibleDomIds: backendQueueIds.slice()
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('renderer-state-order-does-not-match-queue');
  });

  test.each(['chat', 'multi'])('validates saved %s backend and renderer queue order, and rejects a permuted renderer fixture', dock => {
    const longfeed = longfeedFixture.views[dock];
    const base = {
      dock,
      mode: dock === 'chat' ? 'virtual' : undefined,
      postedCount: longfeed.postedCount,
      queueLimit: longfeedFixture.queueLimit,
      previousQueueIds: longfeed.previousQueueIds,
      expectedBackendQueueIds: longfeed.backendEventIds,
      backendQueueIds: longfeed.backendQueueIds,
      rendererStateIds: longfeed.rendererStateIds,
      domCount: longfeed.domCount,
      visibleDomIds: dock === 'chat' ? longfeed.visibleDomIds : undefined
    };
    const valid = validateClarityHudLongfeedWindow(base);
    expect(valid.valid).toBe(true);
    expect(valid.errors).toEqual([]);

    const permuted = validateClarityHudLongfeedWindow({
      ...base,
      rendererStateIds: base.rendererStateIds.slice().reverse()
    });
    expect(permuted.valid).toBe(false);
    expect(permuted.errors).toContain('renderer-state-order-does-not-match-queue');
  });

  test('rejects a backend queue whose order differs from the expected queue order', () => {
    const expectedBackendQueueIds = ['newest', 'middle', 'oldest'];
    const result = validateClarityHudLongfeedWindow({
      dock: 'multi',
      postedCount: 220,
      previousQueueIds: ['middle', 'oldest'],
      expectedBackendQueueIds,
      backendQueueIds: ['middle', 'newest', 'oldest'],
      rendererStateIds: ['middle', 'newest', 'oldest'],
      domCount: 3
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('backend-queue-order-mismatch');
  });
});
