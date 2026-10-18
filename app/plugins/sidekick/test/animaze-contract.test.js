/**
 * Contract tests for the Sidekick Animaze/ChatPal wire format.
 *
 * These tests pin the documented interface (action names, envelopes, codec and
 * classification) independently of any socket. They are the executable form of
 * `backend/animazeContract.js` and must stay green on `main` without a running
 * Animaze instance.
 */

const {
  ANIMAZE_ACTIONS,
  ANIMAZE_MESSAGE_KINDS,
  ANIMAZE_ENDPOINT,
  isPlainObject,
  isNonEmptyString,
  buildAnimazeUri,
  buildRequestId,
  isValidCommand,
  isValidEvent,
  classifyMessage,
  encodeCommand,
  decodeMessage,
  buildSendMessageCommand
} = require('../backend/animazeContract');

describe('constants', () => {
  it('exposes the documented action names', () => {
    expect(ANIMAZE_ACTIONS).toEqual({
      SEND_MESSAGE: 'ChatbotSendMessage',
      SPEECH_STARTED: 'ChatbotSpeechStarted',
      SPEECH_ENDED: 'ChatbotSpeechEnded'
    });
  });

  it('is frozen and carries the default endpoint', () => {
    expect(Object.isFrozen(ANIMAZE_ACTIONS)).toBe(true);
    expect(ANIMAZE_ENDPOINT).toEqual({ host: '127.0.0.1', port: 9000 });
  });
});

describe('isPlainObject / isNonEmptyString', () => {
  it('classifies plain objects only', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(Buffer.from('x'))).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });

  it('treats only non-blank strings as non-empty', () => {
    expect(isNonEmptyString('hi')).toBe(true);
    expect(isNonEmptyString('  ')).toBe(false);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString(5)).toBe(false);
  });
});

describe('buildAnimazeUri', () => {
  it('applies defaults when config is missing', () => {
    expect(buildAnimazeUri()).toBe('ws://127.0.0.1:9000');
    expect(buildAnimazeUri({})).toBe('ws://127.0.0.1:9000');
  });

  it('accepts a plain endpoint or a Sidekick config object', () => {
    expect(buildAnimazeUri({ host: '10.0.0.2', port: 9100 })).toBe('ws://10.0.0.2:9100');
    expect(buildAnimazeUri({ animaze: { host: '10.0.0.3', port: 9200 } })).toBe('ws://10.0.0.3:9200');
  });
});

describe('buildRequestId', () => {
  it('uses the documented sidekick_<seq>_<ts> shape', () => {
    expect(buildRequestId(3, 1700000000000)).toBe('sidekick_3_1700000000000');
  });

  it('coerces non-finite sequences to 0', () => {
    expect(buildRequestId(Number.NaN, 1)).toBe('sidekick_0_1');
  });
});

describe('encodeCommand', () => {
  it('encodes a valid envelope to JSON', () => {
    expect(JSON.parse(encodeCommand({ action: 'ChatbotSendMessage', message: 'Hi' })))
      .toEqual({ action: 'ChatbotSendMessage', message: 'Hi' });
  });

  it('rejects a missing or blank action', () => {
    expect(() => encodeCommand({ message: 'Hi' })).toThrow('action');
    expect(() => encodeCommand({ action: '   ' })).toThrow('action');
  });

  it('rejects non-object input', () => {
    expect(() => encodeCommand(null)).toThrow(TypeError);
    expect(() => encodeCommand('ChatbotSendMessage')).toThrow(TypeError);
    expect(() => encodeCommand(['a'])).toThrow(TypeError);
  });

  it('requires a message for ChatbotSendMessage', () => {
    expect(() => encodeCommand({ action: 'ChatbotSendMessage' })).toThrow('message');
    expect(() => encodeCommand({ action: 'ChatbotSendMessage', message: '' })).toThrow('message');
  });

  it('rejects invalid optional fields to stay in sync with isValidCommand', () => {
    expect(() => encodeCommand({ action: 'Custom', id: 5 })).toThrow('id');
    expect(() => encodeCommand({ action: 'Custom', priority: 'high' })).toThrow('priority');
    expect(isValidCommand({ action: 'Custom', id: 5 })).toBe(false);
    expect(isValidCommand({ action: 'Custom', priority: 'high' })).toBe(false);
  });
});

describe('decodeMessage', () => {
  it('parses JSON strings and buffers', () => {
    expect(decodeMessage('{"action":"ChatbotSpeechStarted"}')).toEqual({ action: 'ChatbotSpeechStarted' });
    expect(decodeMessage(Buffer.from('{"action":"ChatbotSpeechEnded"}'))).toEqual({ action: 'ChatbotSpeechEnded' });
  });

  it('passes already parsed objects through', () => {
    const message = { action: 'ChatbotSpeechStarted' };
    expect(decodeMessage(message)).toBe(message);
  });

  it('returns null for empty, malformed or non-object payloads', () => {
    expect(decodeMessage('')).toBeNull();
    expect(decodeMessage('   ')).toBeNull();
    expect(decodeMessage(null)).toBeNull();
    expect(decodeMessage(undefined)).toBeNull();
    expect(decodeMessage('{not json')).toBeNull();
    expect(decodeMessage('5')).toBeNull();
    expect(decodeMessage('[1,2,3]')).toBeNull();
  });
});

describe('buildSendMessageCommand', () => {
  it('builds a trimmed ChatbotSendMessage envelope', () => {
    expect(buildSendMessageCommand('  Hello  ', { priority: 3 })).toEqual({
      action: ANIMAZE_ACTIONS.SEND_MESSAGE,
      message: 'Hello',
      priority: 3
    });
  });

  it('attaches a request id when provided', () => {
    expect(buildSendMessageCommand('Hi', { requestId: 'sidekick_1_x' })).toEqual({
      action: ANIMAZE_ACTIONS.SEND_MESSAGE,
      message: 'Hi',
      id: 'sidekick_1_x'
    });
  });

  it('omits optional fields and rejects empty text', () => {
    expect(buildSendMessageCommand('Hi')).toEqual({
      action: ANIMAZE_ACTIONS.SEND_MESSAGE,
      message: 'Hi'
    });
    expect(() => buildSendMessageCommand('')).toThrow(TypeError);
    expect(() => buildSendMessageCommand(undefined)).toThrow(TypeError);
  });
});

describe('isValidCommand / isValidEvent', () => {
  it('validates downstream commands', () => {
    expect(isValidCommand({ action: 'ChatbotSendMessage', message: 'Hi' })).toBe(true);
    expect(isValidCommand({ action: 'ChatbotSendMessage' })).toBe(false);
    expect(isValidCommand({ action: '' })).toBe(false);
    expect(isValidCommand({ action: 'Custom', id: 5 })).toBe(false);
    expect(isValidCommand({ action: 'Custom', priority: 'high' })).toBe(false);
    expect(isValidCommand(null)).toBe(false);
  });

  it('validates upstream events', () => {
    expect(isValidEvent({ action: 'ChatbotSpeechStarted' })).toBe(true);
    expect(isValidEvent({ action: 'ChatbotSpeechEnded' })).toBe(true);
    expect(isValidEvent({ id: 'sidekick_1_x' })).toBe(true);
    expect(isValidEvent({ error: 'boom' })).toBe(true);
    expect(isValidEvent({})).toBe(false);
    expect(isValidEvent('ChatbotSpeechStarted')).toBe(false);
  });
});

describe('classifyMessage', () => {
  it('classifies each documented kind', () => {
    expect(classifyMessage({ action: 'ChatbotSpeechStarted' })).toBe(ANIMAZE_MESSAGE_KINDS.SPEECH_STARTED);
    expect(classifyMessage({ event: 'ChatbotSpeechEnded' })).toBe(ANIMAZE_MESSAGE_KINDS.SPEECH_ENDED);
    expect(classifyMessage({ action: 'ChatbotSendMessage', message: 'Hi' })).toBe(ANIMAZE_MESSAGE_KINDS.COMMAND);
    expect(classifyMessage({ id: 'sidekick_1_x', ok: true })).toBe(ANIMAZE_MESSAGE_KINDS.RESPONSE);
    expect(classifyMessage({ error: 'boom' })).toBe(ANIMAZE_MESSAGE_KINDS.ERROR);
    expect(classifyMessage({ action: 'Unknown' })).toBe(ANIMAZE_MESSAGE_KINDS.UNKNOWN);
    expect(classifyMessage(null)).toBeNull();
  });
});
