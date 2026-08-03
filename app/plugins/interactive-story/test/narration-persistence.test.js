const InteractiveStoryPlugin = require('../main');

describe('Interactive Story narration persistence', () => {
  test('persists clean display content and narrates cue text without mutating the generated chapter', async () => {
    const savedChapters = [];
    const spokenText = [];
    const emitted = [];
    const api = {
      getSocketIO: () => ({ emit: (...args) => emitted.push(args) }),
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      getPluginDataDir: () => 'C:\\tmp',
      getDatabase: () => ({})
    };
    const plugin = new InteractiveStoryPlugin(api);
    const generatedChapter = {
      chapterNumber: 2,
      title: 'The Gate',
      content: '(happy) The gate opens. [shouting] Run now!',
      choices: ['Run'],
      narrationSegments: [
        { text: 'The gate opens.', emotion: 'happy', delivery: null },
        { text: 'Run now!', emotion: 'excited', delivery: 'shouting' }
      ]
    };

    plugin.db = {
      saveChapter: (sessionId, chapter) => savedChapters.push({
        sessionId,
        chapter: { ...chapter, narrationSegments: [...(chapter.narrationSegments || [])] }
      })
    };
    plugin.currentSession = { id: 7, model: 'test-model', theme: 'fantasy' };
    plugin.currentChapter = { chapterNumber: 1, choices: ['Open the gate'] };
    plugin.storyEngine = { generateChapter: jest.fn().mockResolvedValue(generatedChapter) };
    plugin.votingSystem = { start: jest.fn() };
    plugin._loadConfig = () => ({
      maxChapters: 5,
      numChoices: 1,
      autoGenerateImages: false,
      textOnlyMode: false,
      narrationEmotionMode: 'auto',
      fishaudioModel: 's1',
      ttsProvider: 'system',
      autoGenerateTTS: true,
      votingDuration: 1
    });
    plugin._wait = jest.fn().mockResolvedValue();
    plugin._speakThroughSystemTTS = jest.fn().mockImplementation(text => {
      spokenText.push(text);
      return Promise.resolve();
    });

    await plugin._generateNextChapterFromChoice(0);

    expect(savedChapters).toHaveLength(1);
    expect(savedChapters[0]).toMatchObject({
      sessionId: 7,
      chapter: {
        content: 'The gate opens. Run now!',
        narrationSegments: [
          { text: 'The gate opens.', emotion: 'happy', delivery: null },
          { text: 'Run now!', emotion: 'excited', delivery: 'shouting' }
        ]
      }
    });
    expect(savedChapters[0].chapter.ttsText).toBe('(happy) The gate opens. (excited) (shouting) Run now!');
    expect(spokenText).toContain('(happy) The gate opens. (excited) (shouting) Run now!');
    expect(emitted.find(([event]) => event === 'story:chapter-ready')[1].content).toBe('The gate opens. Run now!');
    expect(generatedChapter.content).toBe('(happy) The gate opens. [shouting] Run now!');
  });
});
