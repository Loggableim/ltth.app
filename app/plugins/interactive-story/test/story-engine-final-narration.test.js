const StoryEngine = require('../engines/story-engine');

describe('StoryEngine final chapter narration metadata', () => {
  let engine;

  beforeEach(() => {
    engine = new StoryEngine(null, {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    }, { language: 'English' });
  });

  test('requests optional narration segment metadata in final chapter prompts', () => {
    const prompt = engine._buildFinalChapterPrompt(
      engine.themes.fantasy,
      'The heroes reached the citadel.',
      5,
      'Open the final gate'
    );

    expect(prompt).toContain('Optionally add NARRATION_SEGMENTS as JSON with exact sentence text plus supported emotion and delivery cues.');
    expect(prompt).toContain('NARRATION_SEGMENTS:\n[{"text":"exact sentence","emotion":"neutral","delivery":null}]');
  });

  test('keeps valid final chapter narration metadata out of visible content', () => {
    const chapter = engine._parseFinalChapterResponse(`TITLE: The Last Dawn

CONTENT:
The gate opened at sunrise. The kingdom was safe.

NARRATION_SEGMENTS:
[{"text":"The gate opened at sunrise.","emotion":"hopeful","delivery":"soft"},{"text":"The kingdom was safe.","emotion":"relieved","delivery":null}]

MEMORY_TAGS:
CHARACTERS: Mira
LOCATIONS: Citadel
ITEMS: Sun Key`);

    expect(chapter.content).toBe('The gate opened at sunrise. The kingdom was safe.');
    expect(chapter.narrationSegments).toEqual([
      { text: 'The gate opened at sunrise.', emotion: 'hopeful', delivery: 'soft' },
      { text: 'The kingdom was safe.', emotion: 'relieved', delivery: null }
    ]);
  });

  test('preserves final chapter content when narration metadata is absent or malformed', () => {
    const withoutMetadata = engine._parseFinalChapterResponse(`TITLE: Resolution
CONTENT:
Peace returned to the valley.
MEMORY_TAGS:
CHARACTERS: Mira`);
    const malformedMetadata = engine._parseFinalChapterResponse(`TITLE: Resolution
CONTENT:
Peace returned to the valley.
NARRATION_SEGMENTS:
[{"text":"Peace returned to the valley.","emotion":"hopeful"}
MEMORY_TAGS:
CHARACTERS: Mira`);

    expect(withoutMetadata.content).toBe('Peace returned to the valley.');
    expect(withoutMetadata.narrationSegments).toEqual([]);
    expect(malformedMetadata.content).toBe('Peace returned to the valley.');
    expect(malformedMetadata.narrationSegments).toEqual([]);
  });
});
