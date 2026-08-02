const NarrationDirector = require('../utils/narration-director');

describe('NarrationDirector', () => {
  const logger = { debug: jest.fn(), warn: jest.fn() };

  test('keeps the display text clean while rendering validated S1 segment cues for TTS', () => {
    const director = new NarrationDirector({ model: 's1', mode: 'auto', logger });
    const result = director.prepareChapter({
      content: 'The gate opens. Run now!',
      choices: [],
      narrationSegments: [
        { text: 'The gate opens.', emotion: 'surprised', delivery: 'whispering' },
        { text: 'Run now!', emotion: 'excited', delivery: 'shouting' }
      ]
    }, { theme: 'fantasy', language: 'English' });

    expect(result.displayText).toBe('The gate opens. Run now!');
    expect(result.segments).toEqual([
      { text: 'The gate opens.', emotion: 'surprised', delivery: 'whispering' },
      { text: 'Run now!', emotion: 'excited', delivery: 'shouting' }
    ]);
    expect(result.ttsText).toBe('(surprised) (whispering) The gate opens. (excited) (shouting) Run now!');
  });

  test('uses the deterministic tense fantasy fallback and S2 bracket cues', () => {
    const director = new NarrationDirector({ model: 's2-pro', mode: 'auto', logger });
    const result = director.prepareChapter({ content: 'A shadow lunges from the dragon cave!', choices: [] }, { theme: 'fantasy', language: 'English' });

    expect(result.segments).toEqual([
      { text: 'A shadow lunges from the dragon cave!', emotion: 'scared', delivery: 'shouting' }
    ]);
    expect(result.ttsText).toBe('[scared] [shouting] A shadow lunges from the dragon cave!');
  });

  test('strips known and unsupported cue markers without changing an unannotated chapter', () => {
    expect(NarrationDirector.stripMarkers('(happy) [whisper] Text (made-up cue) [custom cue]')).toBe('Text');
    const director = new NarrationDirector({ model: 's1', mode: 'off', logger });
    const result = director.prepareChapter({ content: 'A clean chapter remains visible.', choices: [] }, { theme: 'fantasy', language: 'English' });

    expect(result.displayText).toBe('A clean chapter remains visible.');
    expect(result.ttsText).toBe('A clean chapter remains visible.');
    expect(result.segments).toEqual([{ text: 'A clean chapter remains visible.', emotion: 'neutral', delivery: null }]);
  });

  test('drops unsupported metadata cues and renders at most one primary emotion per sentence', () => {
    const director = new NarrationDirector({ model: 's1', mode: 'auto', logger });
    const result = director.prepareChapter({
      content: 'Stay quiet.',
      narrationSegments: [{ text: 'Stay quiet.', emotion: 'angry)(sad', delivery: 'laser' }]
    }, { theme: 'mystery', language: 'English' });

    expect(result.segments).toEqual([{ text: 'Stay quiet.', emotion: 'neutral', delivery: null }]);
    expect(result.ttsText).toBe('Stay quiet.');
  });

  test('calm mode replaces generated cues with a steady calm delivery', () => {
    const director = new NarrationDirector({ model: 's2.1-pro', mode: 'calm', logger });
    const result = director.prepareChapter({
      content: 'The gate opens.',
      narrationSegments: [
        { text: 'The gate opens.', emotion: 'angry', delivery: 'shouting' }
      ]
    }, { theme: 'fantasy', language: 'English' });

    expect(result.segments).toEqual([
      { text: 'The gate opens.', emotion: 'calm', delivery: 'soft tone' }
    ]);
    expect(result.ttsText).toBe('[calm] [soft tone] The gate opens.');
  });

  test('dramatic mode applies determined cues and emphasizes exclamations', () => {
    const director = new NarrationDirector({ model: 's2.1-pro', mode: 'dramatic', logger });
    const result = director.prepareChapter({
      content: 'The gate opens. Run now!',
      narrationSegments: [
        { text: 'The gate opens.', emotion: 'calm', delivery: null },
        { text: 'Run now!', emotion: 'neutral', delivery: null }
      ]
    }, { theme: 'fantasy', language: 'English' });

    expect(result.segments).toEqual([
      { text: 'The gate opens.', emotion: 'determined', delivery: null },
      { text: 'Run now!', emotion: 'determined', delivery: 'shouting' }
    ]);
    expect(result.ttsText).toBe('[determined] The gate opens. [determined] [shouting] Run now!');
  });
});
