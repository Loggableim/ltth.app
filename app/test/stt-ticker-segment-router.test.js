const { routeTranscriptSegments } = require('../plugins/stt-ticker/backend/lang-detect');

const config = {
  asr: { fallbackLanguage: 'de' },
  langDetect: { enabled: true, minConfidence: 0.15, unknownPolicy: 'auto' },
  multiLanguage: { defaultLanguage: 'de' }
};

describe('STT Ticker sentence and pause language routing', () => {
  test('routes provider pause segments to their detected source languages', () => {
    const routed = routeTranscriptSegments({
      text: 'Hello everyone. Hallo zusammen.',
      segments: [
        { text: 'Hello everyone.' },
        { text: 'Hallo zusammen.' }
      ]
    }, config);

    expect(routed).toEqual([
      expect.objectContaining({ text: 'Hello everyone.', language: 'en', languageSource: 'segment-heuristic' }),
      expect.objectContaining({ text: 'Hallo zusammen.', language: 'de', languageSource: 'segment-heuristic' })
    ]);
  });

  test('falls back to sentence splitting when the provider has no segments', () => {
    const routed = routeTranscriptSegments({
      text: 'Hello everyone. Hallo zusammen.',
      segments: []
    }, config);

    expect(routed.map(segment => segment.text)).toEqual(['Hello everyone.', 'Hallo zusammen.']);
    expect(routed.map(segment => segment.language)).toEqual(['en', 'de']);
  });

  test('keeps an uncertain short fragment in the configured default language', () => {
    const routed = routeTranscriptSegments({ text: 'Stream test', segments: [] }, config);

    expect(routed).toEqual([
      expect.objectContaining({ text: 'Stream test', language: 'de', languageSource: 'segment-fallback' })
    ]);
  });
});
