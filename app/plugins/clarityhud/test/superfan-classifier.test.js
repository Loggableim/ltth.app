'use strict';

const { classifySuperFanBarrage } = require('../lib/superfan-classifier');

describe('ClarityHUD SuperFan barrage classifier', () => {
  test.each([
    ['content.displayType', { content: { displayType: 'ttlive_superfan' } }],
    ['commonBarrageContent.displayType', { commonBarrageContent: { displayType: 'ttlive_superfan' } }]
  ])('classifies the installed v2 shape from %s', (_field, payload) => {
    expect(classifySuperFanBarrage(payload)).toBe('superfan');
  });

  test('prioritizes the join marker over the regular marker across both fields', () => {
    const classifyOnce = jest.fn(classifySuperFanBarrage);
    const payload = {
      content: { displayType: 'ttlive_superfan' },
      commonBarrageContent: { displayType: 'ttlive_superfan_commentnotif_superfanjoined' }
    };

    expect(classifyOnce(payload)).toBe('superfan-join');
    expect(classifyOnce).toHaveBeenCalledTimes(1);
  });

  test('matches markers without regard to case', () => {
    expect(classifySuperFanBarrage({
      commonBarrageContent: { displayType: 'Prefix-TTLIVE_SUPERFAN_COMMENTNOTIF_SUPERFANJOINED' }
    })).toBe('superfan-join');
  });

  test.each([
    undefined,
    {},
    { content: { displayType: 'unrelated' } },
    { content: { displayType: 42 }, commonBarrageContent: { displayType: null } }
  ])('fails closed for unknown/non-string content: %j', (payload) => {
    expect(classifySuperFanBarrage(payload)).toBeNull();
  });

  test('returns only a fixed label and never the raw payload', () => {
    const payload = {
      content: { displayType: 'ttlive_superfan', pieces: [{ user: { id: 'synthetic-id' } }] },
      profilePictureUrl: 'https://example.invalid/avatar.png'
    };

    expect(classifySuperFanBarrage(payload)).toBe('superfan');
    expect(classifySuperFanBarrage(payload)).not.toBe(payload);
  });
});
