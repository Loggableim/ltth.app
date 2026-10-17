'use strict';

const { isIncomingSocketEventAllowed } = require('../modules/public-overlay-registry');

describe('public overlay renderer acknowledgement deny contract', () => {
  test.each([
    'wheel:spin-complete',
    'goals:animation-end',
    'tts:playback:ended'
  ])('%s stays outside the public incoming allowlist', eventName => {
    expect(isIncomingSocketEventAllowed(eventName)).toBe(false);
  });
});
