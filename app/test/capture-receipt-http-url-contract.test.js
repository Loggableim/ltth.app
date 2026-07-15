'use strict';

const { evaluatePostcondition } = require('../../scripts/lib/capture-receipt');

describe('CaptureReceipt exact HTTP and URL contracts', () => {
  test('accepts only explicitly enumerated local HTTP status codes', () => {
    const result = evaluatePostcondition(
      { type: 'http-status', expected: [200, 304] },
      { httpStatus: 304, state: {}, consoleErrors: [], interactions: [], locale: 'en' }
    );

    expect(result).toEqual(expect.objectContaining({ actual: 304, passed: true }));
  });

  test('rejects status ranges and comparison strings', () => {
    const result = evaluatePostcondition(
      { type: 'http-status', expected: '< 400' },
      { httpStatus: 200, state: {}, consoleErrors: [], interactions: [], locale: 'en' }
    );

    expect(result).toEqual(expect.objectContaining({ actual: 200, passed: false }));
    expect(result.error).toMatch(/concrete HTTP status/i);
  });

  test('requires an exact local overlay path and query contract', () => {
    const condition = {
      type: 'url',
      expected: {
        path: '/plugins/advanced-timer/overlay/index.html',
        query: { lang: '$locale', timer: 'non-empty' },
        exactQuery: true
      }
    };
    const matching = evaluatePostcondition(condition, {
      httpStatus: 200,
      state: { route: '/plugins/advanced-timer/overlay/index.html?lang=de&timer=timer_123' },
      consoleErrors: [],
      interactions: [],
      locale: 'de'
    });
    const extraQuery = evaluatePostcondition(condition, {
      httpStatus: 200,
      state: { route: '/plugins/advanced-timer/overlay/index.html?lang=de&timer=timer_123&debug=1' },
      consoleErrors: [],
      interactions: [],
      locale: 'de'
    });

    expect(matching).toEqual(expect.objectContaining({ passed: true }));
    expect(extraQuery).toEqual(expect.objectContaining({ passed: false }));
  });
});
